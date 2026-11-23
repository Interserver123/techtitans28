-- =============================================================================
-- Election business rules that MUST hold even if application code is wrong.
-- All functions are SECURITY DEFINER with a pinned search_path; they run with
-- the migration owner's privileges so the application role never needs direct
-- write access to ballots, participation or official results.
-- =============================================================================

-- Inserts into correction_requests must start life as PENDING.
create or replace function enforce_correction_insert() returns trigger
language plpgsql as $$
begin
  if new.status <> 'PENDING' or new.reviewed_by is not null or new.reviewed_at is not null then
    raise exception 'INVALID_CORRECTION: new correction requests must be pending' using errcode = 'P0001';
  end if;
  new.requested_at := now();
  return new;
end $$;
drop trigger if exists trg_correction_insert on correction_requests;
create trigger trg_correction_insert before insert on correction_requests
  for each row execute function enforce_correction_insert();

-- Publication requires the official snapshot to exist (only publish_results writes it).
create or replace function enforce_publication_snapshot() returns trigger
language plpgsql as $$
begin
  if new.status = 'RESULTS_PUBLISHED' and old.status <> 'RESULTS_PUBLISHED'
     and not exists (select 1 from election_results where election_id = new.id) then
    raise exception 'INVALID_TRANSITION: results can only be published through publish_results()' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_election_publication on elections;
create trigger trg_election_publication before update on elections
  for each row execute function enforce_publication_snapshot();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function random_code(p_len integer) returns text
language plpgsql volatile
set search_path = public, extensions, pg_temp as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 symbols, no 0/O/1/I
  bytes bytea := gen_random_bytes(p_len);
  out text := '';
begin
  for i in 0 .. p_len - 1 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return out;
end $$;

create or replace function setting_text(p_key text, p_default text) returns text
language sql stable
set search_path = public, extensions, pg_temp as $$
  select coalesce((select value #>> '{}' from system_settings where key = p_key), p_default);
$$;

create or replace function append_audit(
  p_actor_type text, p_admin_id uuid, p_action text, p_entity_type text, p_entity_id text,
  p_details jsonb, p_ip_hash text
) returns bigint
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_id bigint;
  v_label text;
begin
  if p_admin_id is not null then
    select email::text into v_label from election_admins where id = p_admin_id;
  end if;
  insert into audit_logs (actor_type, actor_admin_id, actor_label, action, entity_type, entity_id, details, ip_hash, prev_hash, entry_hash)
  values (p_actor_type, p_admin_id, v_label, p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb), p_ip_hash, '', '')
  returning id into v_id;
  return v_id;
end $$;

create or replace function admin_has_permission(p_admin_id uuid, p_permission text) returns boolean
language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select exists (
    select 1 from election_admins a join admin_roles r on r.code = a.role_code
    where a.id = p_admin_id and a.is_active and a.mfa_enabled
      and (p_permission = any(r.permissions))
      and (p_permission <> 'results.publish' or a.role_code = 'SUPER_ADMIN' or a.can_publish_results)
  );
$$;

-- ---------------------------------------------------------------------------
-- Eligibility
-- ---------------------------------------------------------------------------
create or replace function eligible_voter_count() returns integer
language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select count(*)::int from students
  where is_active and is_eligible and batch = setting_text('election.batch', 'TechTitans-28');
$$;

-- ---------------------------------------------------------------------------
-- Time-driven status transitions (Scheduled -> Live -> Closed)
-- ---------------------------------------------------------------------------
create or replace function refresh_election_status() returns void
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  e record;
begin
  for e in select * from elections where status in ('SCHEDULED', 'LIVE', 'PAUSED') for update loop
    if now() >= e.closes_at then
      update elections set status = 'CLOSED', eligible_snapshot = eligible_voter_count() where id = e.id;
      perform append_audit('SYSTEM', null, 'ELECTION.AUTO_CLOSED', 'election', e.id::text,
        jsonb_build_object('from', e.status, 'closes_at', e.closes_at), null);
    elsif e.status = 'SCHEDULED' and now() >= e.opens_at then
      update elections set status = 'LIVE' where id = e.id;
      perform append_audit('SYSTEM', null, 'ELECTION.AUTO_OPENED', 'election', e.id::text,
        jsonb_build_object('opens_at', e.opens_at), null);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- THE BALLOT TRANSACTION
--   * validates the voter credential (server-issued, hashed token)
--   * locks the election row (blocks concurrent pause/close) and student row
--     (serialises concurrent submissions by the same voter)
--   * records participation and an anonymous ballot atomically
--   * duplicate prevention is ALSO guaranteed by uq_one_participation_per_voter
-- ---------------------------------------------------------------------------
create or replace function cast_ballot(p_token_hash text, p_candidate_id uuid)
returns table (receipt_code text, voted_at timestamptz)
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_cred   voter_credentials%rowtype;
  v_el     elections%rowtype;
  v_st     students%rowtype;
  v_cand   candidates%rowtype;
  v_receipt text;
  v_time   timestamptz;
begin
  select * into v_cred from voter_credentials c
   where c.token_hash = p_token_hash and c.revoked_at is null and c.expires_at > now();
  if v_cred.id is null then
    raise exception 'SESSION_INVALID' using errcode = 'P0001';
  end if;

  select * into v_el from elections where id = v_cred.election_id for share;
  if v_el.status = 'PAUSED' then
    raise exception 'ELECTION_PAUSED' using errcode = 'P0001';
  end if;
  if now() >= v_el.closes_at or v_el.status in ('CLOSED', 'RESULTS_PUBLISHED') then
    raise exception 'ELECTION_CLOSED' using errcode = 'P0001';
  end if;
  if not (v_el.status = 'LIVE' or (v_el.status = 'SCHEDULED' and now() >= v_el.opens_at)) then
    raise exception 'ELECTION_NOT_OPEN' using errcode = 'P0001';
  end if;

  select * into v_st from students where id = v_cred.student_id for update;
  if v_st.id is null or not v_st.is_active or not v_st.is_eligible
     or v_st.batch <> setting_text('election.batch', 'TechTitans-28') then
    raise exception 'NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  if exists (select 1 from voter_participation p where p.election_id = v_el.id and p.student_id = v_st.id) then
    raise exception 'ALREADY_VOTED' using errcode = 'P0001';
  end if;

  select * into v_cand from candidates
   where id = p_candidate_id and election_id = v_el.id and status = 'APPROVED';
  if v_cand.id is null then
    raise exception 'INVALID_CANDIDATE' using errcode = 'P0001';
  end if;

  v_receipt := 'TT28-' || random_code(4) || '-' || random_code(4) || '-' || random_code(4);
  begin
    insert into voter_participation (election_id, student_id, receipt_code)
    values (v_el.id, v_st.id, v_receipt)
    returning voter_participation.voted_at into v_time;
  exception when unique_violation then
    raise exception 'ALREADY_VOTED' using errcode = 'P0001';
  end;

  -- Anonymous ballot: no student id, no timestamp, independent random identifiers.
  insert into ballots (election_id, position_id, candidate_id, ballot_ref)
  values (v_el.id, v_cand.position_id, v_cand.id, 'B-' || upper(encode(gen_random_bytes(8), 'hex')));

  receipt_code := v_receipt;
  voted_at := v_time;
  return next;
end $$;

-- ---------------------------------------------------------------------------
-- Aggregates that are safe at any time (no candidate breakdown)
-- ---------------------------------------------------------------------------
create or replace function ballot_totals(p_election_id uuid)
returns table (total_ballots integer, valid_ballots integer, invalidated_ballots integer, participation integer)
language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select
    (select count(*)::int from ballots where election_id = p_election_id),
    (select count(*)::int from ballots where election_id = p_election_id and status = 'VALID'),
    (select count(*)::int from ballots where election_id = p_election_id and status = 'INVALIDATED'),
    (select count(*)::int from voter_participation where election_id = p_election_id);
$$;

-- ---------------------------------------------------------------------------
-- Candidate-wise tally: refuses to run before the election is closed.
-- ---------------------------------------------------------------------------
create or replace function compute_tally(p_election_id uuid)
returns table (candidate_id uuid, display_name text, roll_number text, votes integer, rank integer)
language plpgsql stable security definer
set search_path = public, extensions, pg_temp as $$
declare
  st election_status;
begin
  select status into st from elections where id = p_election_id;
  if st is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if st not in ('CLOSED', 'RESULTS_PUBLISHED') then
    raise exception 'RESULTS_SEALED: candidate-wise results are sealed until the election closes' using errcode = 'P0001';
  end if;
  return query
    select c.id, c.display_name, s.roll_number,
           count(b.id) filter (where b.status = 'VALID')::int as votes,
           (rank() over (order by count(b.id) filter (where b.status = 'VALID') desc))::int as rank
      from candidates c
      join students s on s.id = c.student_id
      left join ballots b on b.candidate_id = c.id and b.election_id = c.election_id
     where c.election_id = p_election_id
       and (c.status = 'APPROVED' or b.id is not null)
     group by c.id, c.display_name, s.roll_number, c.display_order
     order by votes desc, c.display_order, c.display_name;
end $$;

create or replace function tally_hash(p_election_id uuid) returns text
language plpgsql stable security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_rows text;
  v_tot record;
  v_corr text;
begin
  select string_agg(t.candidate_id::text || ':' || t.votes::text, ',' order by t.candidate_id) into v_rows
    from compute_tally(p_election_id) t;
  select * into v_tot from ballot_totals(p_election_id);
  select coalesce(string_agg(id::text || ':' || status::text, ',' order by id), '') into v_corr
    from correction_requests where election_id = p_election_id and status = 'APPROVED';
  return encode(digest(coalesce(v_rows, '') || '|' || v_tot.total_ballots || '|' || v_tot.valid_ballots || '|'
                       || v_tot.participation || '|' || v_corr, 'sha256'), 'hex');
end $$;

-- Anonymous ballot ledger, available only after closure (needed to reference
-- ballots in correction requests and for independent recount).
create or replace function ballot_ledger(p_election_id uuid)
returns table (ballot_id uuid, ballot_ref text, candidate_id uuid, candidate_name text, status ballot_status, last_correction_id uuid)
language plpgsql stable security definer
set search_path = public, extensions, pg_temp as $$
declare
  st election_status;
begin
  select e.status into st from elections e where e.id = p_election_id;
  if st is null or st not in ('CLOSED', 'RESULTS_PUBLISHED') then
    raise exception 'RESULTS_SEALED: the ballot ledger is sealed until the election closes' using errcode = 'P0001';
  end if;
  return query
    select b.id, b.ballot_ref, b.candidate_id, c.display_name, b.status, b.last_correction_id
      from ballots b join candidates c on c.id = b.candidate_id
     where b.election_id = p_election_id
     order by b.ballot_ref;
end $$;

-- ---------------------------------------------------------------------------
-- Corrections: second-person review, applied atomically with an audit entry.
-- ---------------------------------------------------------------------------
create or replace function review_correction(
  p_request_id uuid, p_reviewer_id uuid, p_approve boolean, p_note text, p_ip_hash text
) returns correction_status
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  r correction_requests%rowtype;
  b ballots%rowtype;
  st election_status;
  v_new correction_status;
begin
  select * into r from correction_requests where id = p_request_id for update;
  if r.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if r.status <> 'PENDING' then
    raise exception 'INVALID_STATE: correction is already %', r.status using errcode = 'P0001';
  end if;
  if r.requested_by = p_reviewer_id then
    raise exception 'SECOND_PERSON_REQUIRED: the requester cannot review their own correction' using errcode = 'P0001';
  end if;
  if not admin_has_permission(p_reviewer_id, 'corrections.review') then
    raise exception 'FORBIDDEN: reviewer lacks corrections.review' using errcode = 'P0001';
  end if;
  if p_note is null or length(btrim(p_note)) < 5 then
    raise exception 'VALIDATION: a review note is required' using errcode = 'P0001';
  end if;
  select status into st from elections where id = r.election_id for update;
  if st <> 'CLOSED' then
    raise exception 'INVALID_STATE: corrections can only be applied while the election is closed and unpublished' using errcode = 'P0001';
  end if;

  select * into b from ballots where id = r.ballot_id for update;
  v_new := case when p_approve then 'APPROVED'::correction_status else 'REJECTED'::correction_status end;

  if p_approve then
    if (r.correction = 'INVALIDATE_BALLOT' and b.status <> 'VALID')
       or (r.correction = 'REINSTATE_BALLOT' and b.status <> 'INVALIDATED') then
      raise exception 'INVALID_STATE: ballot is already %', b.status using errcode = 'P0001';
    end if;
  end if;

  update correction_requests
     set status = v_new, reviewed_by = p_reviewer_id, reviewed_at = now(), review_note = p_note,
         ballot_status_before = b.status
   where id = r.id;

  if p_approve then
    update ballots
       set status = case when r.correction = 'INVALIDATE_BALLOT' then 'INVALIDATED'::ballot_status else 'VALID'::ballot_status end,
           last_correction_id = r.id
     where id = b.id;
    -- Any previous result verification no longer matches the tally.
    update elections set results_verified_at = null, results_verified_by = null, results_verified_hash = null
     where id = r.election_id;
  end if;

  perform append_audit('ADMIN', p_reviewer_id,
    case when p_approve then 'CORRECTION.APPROVED' else 'CORRECTION.REJECTED' end,
    'correction_request', r.id::text,
    jsonb_build_object('ballot_ref', b.ballot_ref, 'correction', r.correction, 'requested_by', r.requested_by,
                       'ballot_status_before', b.status, 'note', p_note),
    p_ip_hash);
  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- Result verification & publication
-- ---------------------------------------------------------------------------
create or replace function verify_results(p_election_id uuid, p_admin_id uuid, p_ip_hash text) returns text
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  st election_status;
  v_hash text;
  v_tot record;
begin
  if not admin_has_permission(p_admin_id, 'results.verify') then
    raise exception 'FORBIDDEN: results.verify required' using errcode = 'P0001';
  end if;
  select status into st from elections where id = p_election_id for update;
  if st is distinct from 'CLOSED' then
    raise exception 'INVALID_STATE: results can only be verified for a closed, unpublished election' using errcode = 'P0001';
  end if;
  if exists (select 1 from correction_requests where election_id = p_election_id and status = 'PENDING') then
    raise exception 'INVALID_STATE: resolve pending correction requests before verification' using errcode = 'P0001';
  end if;
  select * into v_tot from ballot_totals(p_election_id);
  if v_tot.total_ballots <> v_tot.participation then
    raise exception 'RECONCILIATION_FAILED: % ballots vs % participation records', v_tot.total_ballots, v_tot.participation using errcode = 'P0001';
  end if;
  v_hash := tally_hash(p_election_id);
  update elections set results_verified_at = now(), results_verified_by = p_admin_id, results_verified_hash = v_hash
   where id = p_election_id;
  perform append_audit('ADMIN', p_admin_id, 'RESULTS.VERIFIED', 'election', p_election_id::text,
    jsonb_build_object('tally_hash', v_hash, 'total_ballots', v_tot.total_ballots, 'valid_ballots', v_tot.valid_ballots), p_ip_hash);
  return v_hash;
end $$;

create or replace function publish_results(p_election_id uuid, p_admin_id uuid, p_note text, p_ip_hash text)
returns table (candidate_id uuid, vote_count integer, rank integer, is_winner boolean, is_tied boolean)
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  e elections%rowtype;
  v_hash text;
  v_top integer;
  v_top_count integer;
begin
  if not admin_has_permission(p_admin_id, 'results.publish') then
    raise exception 'FORBIDDEN: results.publish required' using errcode = 'P0001';
  end if;
  select * into e from elections where id = p_election_id for update;
  if e.status is distinct from 'CLOSED' then
    raise exception 'INVALID_STATE: only a closed election can be published' using errcode = 'P0001';
  end if;
  if e.results_verified_hash is null then
    raise exception 'INVALID_STATE: results must be verified before publication' using errcode = 'P0001';
  end if;
  v_hash := tally_hash(p_election_id);
  if v_hash <> e.results_verified_hash then
    raise exception 'INVALID_STATE: tally changed since verification; verify again' using errcode = 'P0001';
  end if;

  select max(t.votes) into v_top from compute_tally(p_election_id) t;
  select count(*) into v_top_count from compute_tally(p_election_id) t where t.votes = v_top;
  if v_top_count > 1 and (p_note is null or length(btrim(p_note)) < 10) then
    raise exception 'TIE_NOTE_REQUIRED: the result is tied; record the committee tie-resolution note' using errcode = 'P0001';
  end if;

  insert into election_results (election_id, candidate_id, vote_count, rank, is_winner, is_tied)
  select p_election_id, t.candidate_id, t.votes, t.rank,
         (t.votes = v_top and v_top_count = 1 and v_top > 0),
         (t.votes = v_top and v_top_count > 1)
    from compute_tally(p_election_id) t;

  update elections
     set status = 'RESULTS_PUBLISHED', results_published_at = now(), results_published_by = p_admin_id,
         result_note = nullif(btrim(coalesce(p_note, '')), ''),
         eligible_snapshot = coalesce(eligible_snapshot, eligible_voter_count())
   where id = p_election_id;

  perform append_audit('ADMIN', p_admin_id, 'RESULTS.PUBLISHED', 'election', p_election_id::text,
    jsonb_build_object('tally_hash', v_hash, 'tied', v_top_count > 1), p_ip_hash);

  return query select r.candidate_id, r.vote_count, r.rank, r.is_winner, r.is_tied
                 from election_results r where r.election_id = p_election_id order by r.rank;
end $$;

-- ---------------------------------------------------------------------------
-- Audit chain verification
-- ---------------------------------------------------------------------------
create or replace function verify_audit_chain()
returns table (ok boolean, entries bigint, first_broken_id bigint)
language plpgsql stable security definer
set search_path = public, extensions, pg_temp as $$
declare
  r record;
  v_prev text := repeat('0', 64);
  v_calc text;
  v_n bigint := 0;
begin
  for r in select * from audit_logs order by id loop
    v_n := v_n + 1;
    v_calc := encode(digest(
      v_prev || '|' || r.id::text || '|' || to_char(r.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' ||
      r.actor_type || '|' || coalesce(r.actor_admin_id::text, '') || '|' || r.action || '|' ||
      coalesce(r.entity_type, '') || '|' || coalesce(r.entity_id, '') || '|' || r.details::text, 'sha256'), 'hex');
    if r.prev_hash <> v_prev or r.entry_hash <> v_calc then
      ok := false; entries := v_n; first_broken_id := r.id;
      return next;
      return;
    end if;
    v_prev := r.entry_hash;
  end loop;
  ok := true; entries := v_n; first_broken_id := null;
  return next;
end $$;

-- Housekeeping (expired OTPs/sessions/rate-limit buckets). Never touches ballots.
create or replace function purge_expired_auth_material() returns void
language sql security definer
set search_path = public, extensions, pg_temp as $$
  delete from otp_verifications where expires_at < now() - interval '1 day';
  delete from voter_credentials where expires_at < now() - interval '1 day';
  delete from admin_sessions where expires_at < now() - interval '7 days';
  delete from rate_limit_buckets where window_start < now() - interval '1 day';
$$;
