-- =============================================================================
-- REMOVE THE ONE-PERSON "CANCEL VOTE" OPTION (added in 0012)
--
-- The committee decided not to offer it. The function is dropped, and a
-- one-Super-Admin correction is again allowed only for a vote change the voter
-- asked for (REPLACE_CHOICE). Any correction already recorded stays as it is
-- (NOT VALID only checks new rows): nothing is edited or deleted.
-- =============================================================================
set search_path = public, extensions;

drop function if exists cancel_vote_on_request(text, uuid, uuid, text, text, text);

alter table correction_requests drop constraint if exists voter_request_shape;
alter table correction_requests add constraint voter_request_shape
  check (not voter_requested or (correction::text = 'REPLACE_CHOICE' and request_channel is not null)) not valid;
