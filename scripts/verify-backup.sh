#!/usr/bin/env bash
# Restores a backup into a scratch database and checks it is complete and consistent:
#   - schema restored, audit hash chain intact
#   - one ballot per voter in every position
#   - no voter has more than one participation record
#   PG_ADMIN_URL=postgres://postgres:...@localhost:5432 npm run db:verify-backup -- backups/x.dump
set -euo pipefail
FILE="${1:?usage: verify-backup.sh <file.dump>}"
ADMIN="${PG_ADMIN_URL:-postgres://postgres:postgres@localhost:5432}"
SCRATCH="restore_check_$$"
[ -f "$FILE.sha256" ] && sha256sum -c "$FILE.sha256" >/dev/null
psql -q "$ADMIN/postgres" -c "create database $SCRATCH" >/dev/null
trap 'psql -q "$ADMIN/postgres" -c "drop database if exists $SCRATCH" >/dev/null' EXIT
pg_restore --no-owner --no-privileges --exit-on-error -d "$ADMIN/$SCRATCH" "$FILE"
R="$ADMIN/$SCRATCH"
chain=$(psql -tA "$R" -c "select ok from verify_audit_chain()")
# every voter CAST exactly one ballot in EVERY position (Boys' CR and Girls' CR). Replacement ballots added by an
# approved vote correction (migration 0009) are not cast by voters; each must point at a kept, invalidated original.
has_repl=$(psql -tA "$R" -c "select count(*) from information_schema.columns where table_name = 'ballots' and column_name = 'created_by_correction_id'")
cast_filter=""
[ "$has_repl" = "1" ] && cast_filter="and b.created_by_correction_id is null"
mismatch=$(psql -tA "$R" -c "select count(*) from election_positions pos where (select count(*) from ballots b where b.position_id = pos.id $cast_filter) <> (select count(*) from voter_participation p where p.election_id = pos.election_id)")
orphans=0
[ "$has_repl" = "1" ] && orphans=$(psql -tA "$R" -c "select count(*) from ballots r left join ballots o on o.id = r.replaces_ballot_id where r.replaces_ballot_id is not null and (o.id is null or o.status <> 'INVALIDATED')")
dups=$(psql -tA "$R" -c "select count(*) from (select 1 from voter_participation group by election_id, student_id having count(*) > 1) x")
summary=$(psql -tA "$R" -c "select format('%s students, %s elections, %s ballots, %s audit entries', (select count(*) from students), (select count(*) from elections), (select count(*) from ballots), (select count(*) from audit_logs))")
echo "restored: $summary"
[ "$chain" = "t" ] || { echo "FAIL: audit chain broken"; exit 1; }
[ "$mismatch" = "0" ] || { echo "FAIL: ballot/participation mismatch in $mismatch position(s)"; exit 1; }
[ "$dups" = "0" ] || { echo "FAIL: duplicate participation"; exit 1; }
[ "$orphans" = "0" ] || { echo "FAIL: $orphans replacement ballot(s) without a kept, invalidated original"; exit 1; }
echo "OK: backup restores cleanly and reconciles"
