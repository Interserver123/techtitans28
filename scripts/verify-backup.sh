#!/usr/bin/env bash
# Restores a backup into a scratch database and checks it is complete and consistent:
#   - schema restored, audit hash chain intact
#   - ballots = participation records for every election
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
mismatch=$(psql -tA "$R" -c "select count(*) from elections e where (select count(*) from ballots b where b.election_id = e.id) <> (select count(*) from voter_participation p where p.election_id = e.id)")
dups=$(psql -tA "$R" -c "select count(*) from (select 1 from voter_participation group by election_id, student_id having count(*) > 1) x")
summary=$(psql -tA "$R" -c "select format('%s students, %s elections, %s ballots, %s audit entries', (select count(*) from students), (select count(*) from elections), (select count(*) from ballots), (select count(*) from audit_logs))")
echo "restored: $summary"
[ "$chain" = "t" ] || { echo "FAIL: audit chain broken"; exit 1; }
[ "$mismatch" = "0" ] || { echo "FAIL: ballot/participation mismatch in $mismatch election(s)"; exit 1; }
[ "$dups" = "0" ] || { echo "FAIL: duplicate participation"; exit 1; }
echo "OK: backup restores cleanly and reconciles"
