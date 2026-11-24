-- =============================================================================
-- CANCEL A VOTER'S VOTE (one Super Admin)
--
-- For a vote cast by mistake: ONE Super Admin with a fresh authenticator code can
-- cancel all of a voter's current ballots while voting is live or paused, or after
-- it closes (before results are published). Nothing is deleted: each current ballot
-- is marked INVALIDATED through an approved INVALIDATE_BALLOT correction flagged
-- voter_requested (single Super Admin), with how the request came and why, and the
-- audit log records it. The voter stays marked as having voted and cannot vote again.
-- =============================================================================
set search_path = public, extensions;

alter table correction_requests drop constraint if exists voter_request_shape;
alter table correction_requests add constraint voter_request_shape
  check (not voter_requested or (correction::text in ('REPLACE_CHOICE', 'INVALIDATE_BALLOT') and request_channel is not null));

create or replace function cancel_vote_on_request(
  p_session_hash text, p_election_id uuid, p_student_id uuid, p_channel text, p_reason text, p_ip_hash text
) returns integer
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_admin uuid;
  st election_status;
  vc record;
  hb ballots%rowtype;
  v_id uuid;
  v_n integer := 0;
  v_refs jsonb := '[]'::jsonb;
begin
  v_admin := session_admin(p_session_hash, 'SUPER_ADMIN', 10);
  if p_reason is null or length(btrim(p_reason)) < 20 then
    raise exception 'VALIDATION: explain the reason in at least 20 characters' using errcode = 'P0001';
  end if;
  if p_channel is null or length(btrim(p_channel)) < 2 then
    raise exception 'VALIDATION: say how the cancellation was requested' using errcode = 'P0001';
  end if;
  select e.status into st from elections e where e.id = p_election_id for update;
  if st is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if st not in ('LIVE', 'PAUSED', 'CLOSED') then
    raise exception 'ELECTION_LOCKED: a vote can be cancelled only while voting is open or paused, or after it closes and before results are published' using errcode = 'P0001';
  end if;
  if not exists (select 1 from voter_choices v where v.election_id = p_election_id and v.student_id = p_student_id) then
    raise exception 'INVALID_STATE: this vote was cast anonymously (before the open-ballot notice) or does not exist' using errcode = 'P0001';
  end if;

  for vc in select v.ballot_ref from voter_choices v
             where v.election_id = p_election_id and v.student_id = p_student_id order by v.position_id loop
    select * into hb from ballots where id = ballot_chain_head((select id from ballots where ballot_ref = vc.ballot_ref)) for update;
    continue when hb.status <> 'VALID';
    begin
      insert into correction_requests (election_id, ballot_id, correction, reason, requested_by, voter_requested, request_channel)
      values (p_election_id, hb.id, 'INVALIDATE_BALLOT', btrim(p_reason), v_admin, true, btrim(p_channel))
      returning id into v_id;
    exception when unique_violation then
      raise exception 'CONFLICT: a correction for this vote is already pending' using errcode = 'P0001';
    end;
    update correction_requests
       set status = 'APPROVED', reviewed_by = v_admin, reviewed_at = now(),
           review_note = 'Vote cancelled by one Super Admin', ballot_status_before = hb.status
     where id = v_id;
    update ballots set status = 'INVALIDATED', last_correction_id = v_id where id = hb.id;
    v_n := v_n + 1;
    v_refs := v_refs || jsonb_build_object('ballot_ref', hb.ballot_ref, 'candidate', (select display_name from candidates where id = hb.candidate_id));
  end loop;
  if v_n = 0 then
    raise exception 'INVALID_STATE: this vote is already cancelled' using errcode = 'P0001';
  end if;
  update elections set results_verified_at = null, results_verified_by = null, results_verified_hash = null
   where id = p_election_id;
  -- Ballot references and candidates, never the voter (as for other corrections).
  perform append_audit('ADMIN', v_admin, 'CORRECTION.VOTE_CANCELLED', 'election', p_election_id::text,
    jsonb_build_object('ballots', v_refs, 'channel', btrim(p_channel), 'reason', btrim(p_reason), 'election_status', st),
    p_ip_hash);
  return v_n;
end $$;

revoke all on function cancel_vote_on_request(text, uuid, uuid, text, text, text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function cancel_vote_on_request(text, uuid, uuid, text, text, text) from %I', r);
    end if;
  end loop;
  grant execute on function cancel_vote_on_request(text, uuid, uuid, text, text, text) to techtitans_app;
end $$;
