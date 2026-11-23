# TechTitans-28 CR Election Portal — Development Guide

Official Class Representative election platform for **TechTitans-28, Department of ICT, Islamic University, Bangladesh**.

- [Architecture](#architecture)
- [Ballot confidentiality & trust assumptions](#ballot-confidentiality--trust-assumptions)
- [Setup](#local-setup)
- [Environment variables](#environment-variables)
- [Database & migrations](#database--migrations)
- [Authentication flow](#authentication-flow)
- [Voting flow](#voting-flow)
- [Admin roles & permissions](#admin-roles--permissions)
- [Results, corrections & disputes](#results-corrections--disputes)
- [Security controls](#security-controls)
- [Testing](#testing)
- [Deployment (Vercel + Supabase)](#deployment-vercel--supabase)
- [Backups & recovery](#backups--recovery)

---

## Architecture

| Layer | Technology |
| --- | --- |
| UI | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui-style components (`src/components/ui`, Radix primitives), Lucide icons, Recharts |
| Server | Next.js route handlers (`src/app/api/**`) and server components; service layer in `src/lib/services/*` |
| Database | PostgreSQL 16 (Supabase in production) accessed with `pg` as a **restricted role** |
| Storage | Supabase Storage (production) or a `media_objects` table (development) |
| OTP delivery | SMTP (email contacts) and/or an HTTPS SMS gateway (phone contacts); in-memory outbox in development |

```
src/
  app/
    (public)/            landing, candidate profiles, results, receipt check, help
    vote/                voter portal: roll → OTP → ballot → review → receipt
    admin/(auth)/login   password + TOTP MFA
    admin/(dash)/        overview, elections, students, candidates, results,
                         corrections, disputes, audit, administrators, settings
    api/                 public, vote and admin JSON endpoints
  lib/
    services/            ALL business logic (no logic in components)
    db.ts env.ts crypto.ts http.ts session.ts audit.ts rate-limit.ts storage.ts
  proxy.ts               CSP nonce + CSRF cookie (Next 16 "proxy", formerly middleware)
supabase/migrations/     SQL schema, functions, grants, RLS (applied in order)
scripts/                 migrate, seed (dev), create-admin, backup, verify-backup
tests/                   vitest suites against real PostgreSQL; e2e/ Playwright run
```

**Principle: the database is the last line of defence.** Every critical rule — one ballot per voter, valid candidates only,
election-hours enforcement, sealed results, legal status transitions, append-only audit log, two-person corrections,
immutable published results — is enforced in PostgreSQL (constraints, triggers, `SECURITY DEFINER` functions and grants),
so a bug or compromise in the Node.js layer cannot violate it.

The application connects as a login role that is a member of `techtitans_app`, which:

- has **no privileges at all on `ballots`** (no SELECT/INSERT/UPDATE/DELETE);
- can only `SELECT` `voter_participation` and `election_results`;
- cannot write result-verification/publication columns of `elections` (column-level grants);
- can only append to `audit_logs`;
- casts ballots, tallies, verifies, publishes and reviews corrections **only** through functions in migration `0002`.

## Ballot confidentiality & trust assumptions

Voter identity and selection are stored separately:

| `voter_participation` (WHO) | `ballots` (WHAT) |
| --- | --- |
| election, student, receipt code, timestamp | election, position, candidate, random `ballot_ref`, status |

There is **no foreign key, shared identifier, or timestamp** linking the two. Ballot IDs and references are random; ballots carry
no time. The receipt code exists only on the participation row, so a receipt proves "my ballot was recorded" but never what was chosen.
Both rows are written in the same transaction by `cast_ballot()`, guaranteeing atomicity.

**What this protects against:** administrators of every role, the application server role, Supabase `anon`/`authenticated` clients,
exports, the audit log and PDF reports — none can map a voter to a choice. Candidate-wise counts cannot even be computed
(`compute_tally()` / `ballot_ledger()` raise `RESULTS_SEALED`) until the election is closed.

**What it does NOT protect against (documented trust assumptions):**

1. **Database superusers / the schema owner (`postgres` in Supabase) / Supabase platform operators.** (`service_role` is explicitly denied — see migration 0004.) Because a voter's participation row and ballot row
   are inserted in the same transaction, they share the PostgreSQL transaction id (`xmin`) and are adjacent in the WAL and
   possibly on disk (`ctid`). Someone with owner/superuser access, WAL access or raw backups can correlate them. Mitigation is
   organisational: restrict the owner credentials (`MIGRATION_DATABASE_URL`, Supabase dashboard) to the minimum number of
   committee-approved people, never use them for the running app, and protect backups as secret material.
2. **A malicious deployment of the application code** could log requests (which contain the selected candidate) before they reach the
   database. Deployments must be reviewed and limited to trusted maintainers; Vercel access must be restricted.
3. **The voter's own device / shoulder-surfing / coercion** are outside the system's control.
4. **OTP channel compromise** (SIM swap, mailbox access) allows impersonation. Mitigations: short OTP lifetime, attempt limits,
   the dispute workflow and committee investigation.

The system does not claim absolute anonymity; it provides strong logical separation enforced by database privileges.

## Local setup

Prerequisites: Node.js 22+, PostgreSQL 16 (local) or a Supabase project.

```bash
npm install
cp .env.example .env.local    # then fill APP_SECRET_PEPPER and APP_ENCRYPTION_KEY (commands in the file)
npm run db:setup              # creates DB "techtitans", applies migrations, creates the app login role
npm run db:seed               # DEVELOPMENT ONLY: fictional students D28001–D28060, 4 candidates, 5 admins, LIVE election
npm run dev                   # http://localhost:3000
```

- Voter flow: go to `/vote`, enter e.g. `D28005`, then read the code from `http://localhost:3000/api/dev/outbox`.
- Admin: `/admin/login` with `superadmin@dev.local` / `DevOnly-Passw0rd!` (also `superadmin2@`, `electionadmin@`, `results@`, `auditor@dev.local`).
  You will be asked to enrol an authenticator app (any TOTP app; the secret is also shown as text).
- `npm run db:seed -- --draft` seeds a draft election instead.

Seed records are flagged `is_dev_seed = true`, use `D28xxx` rolls and `example.edu` addresses, and the seed script refuses to run
when `APP_ENV` is `staging`/`production`. The Students page warns while any dev-seed records exist.

## Environment variables

See `.env.example` for the authoritative list. Validated at startup by `src/lib/env.ts`; in `staging`/`production` the app refuses
to start with the dev OTP outbox, a non-HTTPS `APP_URL`, or database TLS disabled.

| Variable | Purpose |
| --- | --- |
| `APP_ENV` | `development` · `test` · `staging` · `production` |
| `APP_URL` | Public origin (CSRF origin check, secure cookies) |
| `DATABASE_URL` | **Restricted** app role connection (member of `techtitans_app`) |
| `DATABASE_SSL`, `DATABASE_CA_CERT` | `require`/`verify` in production |
| `MIGRATION_DATABASE_URL` | Owner connection — scripts only, never set on Vercel |
| `APP_SECRET_PEPPER` | HMAC key for OTP hashes, session token hashes, rate-limit keys, IP pseudonyms |
| `APP_ENCRYPTION_KEY` | AES-256-GCM key for admin TOTP secrets |
| `OTP_PROVIDER` | `dev` or `live` |
| `SMTP_*` | Email OTP delivery |
| `SMS_HTTP_URL`, `SMS_HTTP_TOKEN`, `SMS_SENDER_ID` | SMS gateway (POST JSON `{to, sender, message}` with bearer token — adapt `src/lib/otp/provider.ts` to your Bangladeshi gateway's API if it differs) |
| `STORAGE_DRIVER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_*_BUCKET` | File storage |
| `TRUST_PROXY_HEADERS` | `true` on Vercel so the client IP comes from `x-forwarded-for` |

Rotating `APP_SECRET_PEPPER` invalidates all sessions and pending OTPs (harmless between elections). Rotating
`APP_ENCRYPTION_KEY` requires every admin to re-enrol MFA.

## Database & migrations

Migrations live in `supabase/migrations/` (Supabase CLI-compatible names) and are applied by `scripts/migrate.ts`, which records a
checksum per file and aborts if an applied migration was edited. Never edit an applied migration — add a new one.

```bash
MIGRATION_DATABASE_URL=postgres://owner@host:5432/db npm run db:migrate
```

| Migration | Contents |
| --- | --- |
| `…01_core_schema.sql` | 18 tables, enums, constraints, indexes, state-machine & immutability triggers, hash-chained audit log |
| `…02_election_functions.sql` | `cast_ballot`, `refresh_election_status`, `compute_tally`, `ballot_ledger`, `review_correction`, `verify_results`, `publish_results`, `verify_audit_chain`, rate limiting |
| `…03_access_control.sql` | roles, grants, RLS policies (app server / public `anon` & `authenticated`), reference data (roles, settings) |
| `…05_two_positions.sql` | Boys' CR + Girls' CR: `students.gender`, `election_positions.gender`, gender/scheduling triggers, new `cast_ballot(text, uuid[])` (one choice per position), per-position `compute_tally` / `ballot_totals_by_position` / `ballot_ledger`, per-position verification, ties and publication |
| `…04_supabase_platform.sql` | revokes `service_role` access to election tables, blocks Supabase default grants on future objects, creates Storage buckets (no-op on plain PostgreSQL) |

`supabase/deploy.sql` is the same five migrations bundled for the Supabase SQL Editor (generated by `npm run supabase:bundle`).

Required entities from the specification map to: `students`, `elections`, `election_positions`, `candidates`, `voter_credentials`
(short-lived voting sessions), `voter_participation`, `ballots`, `election_admins`, `admin_roles`, `audit_logs`, `correction_requests`,
`otp_verifications`, `election_results`, `system_settings` — plus `admin_sessions`, `disputes`, `media_objects`, `rate_limit_buckets`.

Key constraints: unique roll number; `unique(election_id, student_id)` on participation; unique `ballot_ref`/`receipt_code`;
composite FKs guaranteeing a ballot's candidate belongs to the same election; partial unique index allowing only one
scheduled/live/paused election; `CHECK (reviewed_by <> requested_by)` on corrections; one pending correction per ballot.

**RLS:** enabled on every table. `techtitans_app` has an "app server" policy (no policy at all on `ballots`). `anon`/`authenticated`
(Supabase client roles) may read only non-draft elections, approved candidates, positions and published results — never students,
ballots, participation, sessions, OTPs or audit data, and nothing writable. The browser never talks to the database directly.

## Authentication flow

### Students (roll + OTP)

1. `POST /api/vote/request-otp {roll}` — rate-limited per IP (300/15 min, sized for a campus NAT) and per roll (cooldown 60 s,
   6/hour, keyed on the submitted text so it does not depend on existence).
2. The server checks the roll exists, is active, eligible, in batch `election.batch`, and the election is open.
3. If eligible: a 6-digit code (CSPRNG) is generated; only `HMAC(pepper, challengeId:code)` is stored; earlier unused codes are
   invalidated. The code is delivered **after the response is sent** (`after()`), so response body *and* timing are identical for
   unknown, ineligible and valid rolls. A random challenge id is set as an httpOnly cookie in every case.
4. `POST /api/vote/verify-otp {code}` — constant-time compare; 5-minute expiry; 5 attempts then locked; single use (atomic
   `UPDATE … WHERE consumed_at IS NULL`).
5. On success a fresh 256-bit token is minted server-side (session-fixation safe), stored only as an HMAC in `voter_credentials`,
   all earlier credentials for the voter revoked, and set as `tt_voter` (httpOnly, `SameSite=Strict`, `Secure` in production, 15 min).
6. Already-voted status is revealed only **after** OTP verification (so the endpoint cannot be used to learn who voted).

OTP values are never logged; the audit scrubber also drops any key resembling `otp`, `code_hash`, `password`, `secret`, `token`.

### Administrators (password + mandatory TOTP MFA)

1. `POST /api/admin/auth/login` — scrypt (N=2¹⁵) password check, dummy hash for unknown accounts, 5 failures → 15 min lock,
   IP/email rate limits. Issues a 10-minute **pre-MFA** session usable only for MFA.
2. First sign-in: MFA enrolment (QR + secret; secret AES-GCM encrypted at rest). Every sign-in: TOTP (±1 step, replay of a used
   step rejected).
3. On success the pre-MFA session is revoked and a **new** session token issued (8 h absolute, 30 min idle).
4. All admin APIs require `MFA verified + permission`; denials are audited (`ADMIN.ACCESS_DENIED`).

## Voting flow

**Two races, two votes.** Every election has two positions: **Boys' CR** (male candidates) and **Girls' CR** (female
candidates). Every voter casts **exactly two votes — one boy and one girl**. This is a strict rule enforced in the database:

- `students.gender` (MALE/FEMALE) decides which race a candidate runs in (`candidates` trigger `GENDER_MISMATCH`; a student's
  gender cannot be changed while they are a candidate). Voters are not restricted by their own gender: everyone votes in both races.
- An election can only be scheduled when **both** races have at least one approved candidate.
- `cast_ballot(token_hash, candidate_ids uuid[])` accepts the ballot only if there is exactly one candidate per position
  (no missing race, no two votes in the same race, no extras, no repeats, all approved and of the right gender). Anything else
  raises `INCOMPLETE_BALLOT` / `INVALID_CANDIDATE` and nothing is written.

`/vote` → `/vote/ballot` (tab 1: Boys' CR, tab 2: Girls' CR; each searchable) → **Review both choices** → tick "this is final" →
**Submit** → `/vote/receipt`.

`POST /api/vote/cast {candidateIds: [boyId, girlId]}` calls `cast_ballot()` which, in one transaction:
validates the credential → `SELECT … FOR SHARE` on the election (blocks a concurrent pause/close) → checks status/hours →
`SELECT … FOR UPDATE` on the student (serialises duplicate submissions) → checks eligibility → checks not already voted →
validates the choices as above → inserts **one** participation row (unique constraint as a second barrier) → inserts **one anonymous
ballot row per position** (random order, no voter reference, no timestamp) → returns receipt code + time.

Reconciliation: every position must hold exactly one ballot per voter (`ballots in position = participation`); results cannot be
verified otherwise. Ballot rows of one voter are not linked to the voter; with database-owner access the two rows written in the
same transaction could be paired with each other (and are adjacent), which is part of the documented trust assumptions.

Network interruptions: if a submission's response is lost, the client asks `/api/vote/status`; a retry returns `ALREADY_VOTED`
and the receipt is shown. A transaction interrupted before commit leaves no partial rows (tested).

## Admin roles & permissions

| Permission | Super Admin | Election Admin | Results Officer | Auditor |
| --- | :-: | :-: | :-: | :-: |
| students.read / write / import / export | ✓ | ✓ | | |
| candidates.read / write | ✓ | ✓ | read | read |
| elections.read | ✓ | ✓ | ✓ | ✓ |
| elections.configure / control (schedule, open, pause, resume, close) | ✓ | | | |
| results.view (after close) | ✓ | ✓ | ✓ | ✓ |
| results.verify | ✓ | | ✓ | |
| results.publish | ✓ | | only if `can_publish_results` | |
| ballots.read (anonymous ledger, after close) | ✓ | ✓ | ✓ | ✓ |
| corrections.create | ✓ | ✓ | | |
| corrections.review (approve/reject, never own) | ✓ | | | |
| disputes.read / manage | ✓ | ✓ | | read |
| audit.read | ✓ | | | ✓ |
| admins.manage, settings.manage | ✓ | | | |

The DB (`admin_roles.permissions`, `admin_has_permission()`) is authoritative; the review/verify/publish functions re-check
permissions inside PostgreSQL. At least one active Super Admin must always remain; admins cannot demote themselves.
Bootstrap the first production Super Admin with `npm run admin:create` (see Deployment).

## Results, corrections & disputes

**Election states:** `DRAFT → SCHEDULED → LIVE ⇄ PAUSED → CLOSED → RESULTS_PUBLISHED` (also `SCHEDULED → DRAFT`,
`SCHEDULED → CLOSED`). Enforced by trigger. A scheduled election opens automatically at `opens_at` and any active election closes
automatically at `closes_at` (`refresh_election_status()` runs on every relevant request). The candidate roster is frozen once
voting starts; during voting only the closing time can be *extended*. Pause/close require a reason.

**Results:** while open, only turnout is visible. After closing: tally **per race**, reconciliation (every position: ballots = voters; tally = valid
ballots), then **verify** (records a SHA-256 tally fingerprint), then **publish** (type `PUBLISH`). Publication fails if the tally
changed after verification or corrections are pending, writes an immutable `election_results` snapshot and is audited. **Ties** (per race): no
winner is declared for a tied race; publication requires a committee tie-resolution note shown publicly. PDF report: public after publication;
admins can download a watermarked *provisional* report after closing.

**Corrections (two-person rule):** after closure, an Election Admin/Super Admin files `INVALIDATE_BALLOT` or `REINSTATE_BALLOT`
for a ballot reference (from the anonymous ledger) with a mandatory ≥20-char reason and optional evidence. A **different** Super Admin
approves or rejects with a note. Approval flips only the ballot `status` (contents are immutable; nothing is ever deleted), clears
any previous verification, and writes an audit entry atomically. Reviewed requests are immutable.

**Disputes:** public `/help` form (rate-limited) with reference numbers. Identity-misuse reports are handled manually by the committee.
A dispute **never** re-enables voting or issues another ballot.

## Security controls

| Control | Implementation |
| --- | --- |
| Duplicate prevention | row locks + `unique(election_id, student_id)` inside `cast_ballot()` |
| CSRF | Origin/Referer check + double-submit `tt_csrf` token header on every mutation; `SameSite=Strict` cookies |
| XSS | React escaping, no `dangerouslySetInnerHTML`, nonce-based `strict-dynamic` CSP from `src/proxy.ts`, `frame-ancestors 'none'` |
| SQL injection | Parameterised queries only; LIKE input escaped |
| Validation | zod schemas on every endpoint + DB CHECK constraints |
| Uploads | Magic-byte sniffing, size limits, photos re-encoded to WebP by sharp (strips metadata/polyglots), served with `nosniff` + sandbox CSP |
| CSV export | Formula-injection neutralised; every export audited |
| Secrets | Only in env vars; MFA secrets encrypted; OTPs/tokens stored as HMACs; IPs stored as keyed pseudonyms |
| Errors | Stable error codes with safe messages; internal errors logged without request bodies |
| Headers | HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP |
| Audit | Append-only (`UPDATE`/`DELETE`/`TRUNCATE` blocked by triggers + grants), SHA-256 hash chain verified on the Audit page |

## Testing

```bash
npm test            # vitest: 48 tests against a real PostgreSQL (DB techtitans_test is recreated from migrations)
npm run test:e2e    # Playwright against a running server: npm run build && npm start (seeded LIVE election, OTP_PROVIDER=dev)
npm run typecheck && npm run lint
```

Unit/integration tests run as the restricted `techtitans_app_test` role, so they also verify grants and RLS. Configure the
PostgreSQL admin URL with `TEST_PG_ADMIN_URL` (default `postgres://postgres:postgres@localhost:5432`).

| Area | Covered by |
| --- | --- |
| Valid / unknown / ineligible roll, invalid / expired / reused OTP, attempt lockout, cooldown, IP limit, session fixation & expiry | `tests/auth.test.ts` |
| Successful vote, second vote, 25 concurrent duplicates, invalid/foreign candidate, paused/closed/not-open, expired session, deactivated mid-session, network interruption, aborted transaction, **150 simultaneous voters with duplicate retries** | `tests/voting.test.ts` |
| MFA, lockout, TOTP replay, enrolment, role permissions, invalid transitions, auto open/close, sealed results, verification/publication rules, ties, correction workflow & second-person rule, direct-DB bypass attempts, audit immutability & tamper detection, anon role isolation | `tests/admin.test.ts` |
| Backup → restore → reconcile | `tests/backup.test.ts` |
| Desktop & mobile rendering, no horizontal overflow on phones, full mobile voting flow, identical responses for unknown rolls, CSRF/foreign origin rejection, admin auth with MFA | `tests/e2e/run.mjs` |

CI (`.github/workflows/ci.yml`) runs typecheck, lint, the vitest suite against PostgreSQL 16, and a production build.

## Deployment (Vercel + Supabase)

The whole backend can be set up **from the browser** — no terminal needed.

### 1. Supabase backend (dashboard only)

1. Create a project at supabase.com (region close to Bangladesh, e.g. Singapore or Mumbai). Save the database password it asks for
   in a password manager; it is the *owner* password and is never given to the app.
2. **SQL Editor → New query →** paste the entire contents of [`supabase/deploy.sql`](supabase/deploy.sql) **→ Run**. It:
   - creates all tables, constraints, triggers, election functions, RLS policies and grants (migrations 0001–0004);
   - revokes Supabase's `anon` / `authenticated` / `service_role` access to every election table (the Data API can only read
     non-draft elections, approved candidates and published results);
   - creates the Storage buckets `candidate-photos` (public, WebP only) and `correction-evidence` (private);
   - creates the restricted login role `techtitans_app_user` with a random password.

   The result grid shows **`db_password (copy now, shown once)`** — copy it. Running the script again is safe (applied
   migrations are skipped; the password is not changed).
3. **SQL Editor →** open [`supabase/bootstrap-admin.sql`](supabase/bootstrap-admin.sql), replace the email / name / password
   placeholders, **Run** once, then delete that snippet from the editor history. This creates the first Super Admin; MFA enrolment is
   forced at first sign-in and the bcrypt hash is upgraded to scrypt automatically.
4. **Project Settings → Database → Connection string → Transaction pooler.** Build `DATABASE_URL` with the app role
   (Supavisor requires `user.projectref`):
   `postgresql://techtitans_app_user.<project-ref>:<db_password>@aws-0-<region>.pooler.supabase.com:6543/postgres`
   Download the CA certificate from the same page for `DATABASE_CA_CERT` and set `DATABASE_SSL=verify`
   (or `DATABASE_SSL=require` if you cannot provide the certificate).
5. **Project Settings → API:** copy the Project URL (`SUPABASE_URL`) and the `service_role` key (`SUPABASE_SERVICE_ROLE_KEY`).
   This key is used only for Storage uploads; migration 0004 removes its access to election tables.
6. Optional: **Database → Backups** — enable Point-in-Time Recovery for the election week.
   Optional: **Integrations → Cron** — daily job `select public.purge_expired_auth_material();`.

Later schema changes: add a migration file, run `npm run supabase:bundle`, and paste the regenerated `deploy.sql` again
(or run `npm run db:migrate` with the owner connection — both record the same checksums). CI fails if `deploy.sql` is stale.

### 2. Vercel

1. Import the GitHub repository in Vercel (framework: Next.js; defaults are correct).
2. Environment variables (Production):

   | Variable | Value |
   | --- | --- |
   | `APP_ENV` | `production` |
   | `APP_URL` | `https://<your-domain>` |
   | `DATABASE_URL` | pooler URL from step 1.4 |
   | `DATABASE_SSL` / `DATABASE_CA_CERT` | `verify` + certificate (or `require`) |
   | `APP_SECRET_PEPPER` | 48 random bytes (e.g. a password manager's 64-character random string) |
   | `APP_ENCRYPTION_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`, or any generator producing 44 base64 chars) |
   | `OTP_PROVIDER` | `live` |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | email OTP |
   | `SMS_HTTP_URL`, `SMS_HTTP_TOKEN`, `SMS_SENDER_ID` | SMS OTP (if any student contact is a phone) |
   | `STORAGE_DRIVER` | `supabase` |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | from step 1.5 |
   | `TRUST_PROXY_HEADERS` | `true` |

   Never set `MIGRATION_DATABASE_URL` or the Supabase owner password on Vercel.
3. Deploy, then add your domain under **Settings → Domains** (TLS is automatic; the app sends HSTS).

### 3. Before opening the election

1. Sign in at `/admin/login` with the bootstrapped account, enrol MFA, create the other committee accounts (Administrators).
2. Settings: committee members and help-desk contact.
3. Students → Import the **official** TechTitans-28 register; fix every reported row error; check the data-quality panel.
4. Elections → create; Candidates → add, upload photos, approve; Elections → Schedule.
5. Checklist: `/api/dev/outbox` returns 404; a test OTP reaches a real committee phone/mailbox; a dry-run election on real
   Android/iOS phones succeeds; Audit page shows "hash chain intact"; a backup is taken (Supabase dashboard → Backups).

### Automatic publishing

Production deploys the `claude/epic-johnson-2edi2p` branch (`main` mirrors it). Work happens on
`claude/...` branches; when one is pushed, CI runs the `verify` job (typecheck, lint, unit tests, build)
and, only if that passes, the `publish` job moves the commit onto both live branches, merging in newer
live work when needed. Vercel then deploys it, usually within about five minutes of the push.

- Nothing is force-pushed. A real conflict with newer live work stops `publish` with an error, and the
  live site keeps the previous version until the branch is updated and pushed again.
- `/api/health` shows the deployed commit, so you can confirm what is live.
- Edits to `.github/workflows/*` are the exception: GitHub does not let the workflow token publish them,
  so those must be pushed to the live branches directly.

### Upgrading an existing deployment to two races

Run the latest `supabase/deploy.sql` in the SQL Editor (it only applies what is missing). `/api/health` shows
"missing the two-race voting upgrade" until that is done; the public pages keep working meanwhile. Then import/refresh students
with their gender (CSV/Excel column `gender`: male/female) and create or re-create the election: new elections get both races
automatically, and a candidate's race follows the student's gender.

### Troubleshooting a deployment ("This page couldn't load" / server error)

Open **`https://<your-domain>/api/health`**. It reports, without revealing any secret values:

- `config.problems` — each environment variable that is missing or invalid, and why. Fix them in Vercel →
  Settings → Environment Variables, then **Redeploy** (Vercel only applies new variables to new deployments).
- `database.hint` — e.g. wrong pooler username format (`techtitans_app_user.<project-ref>`), wrong password, TLS problem,
  "schema missing" (run `supabase/deploy.sql`), or connected as the wrong role.

It returns HTTP 200 with `"ok": true` when the deployment is healthy. Defaults that reduce setup: `APP_URL` falls back to the
Vercel production URL, and `DATABASE_SSL` defaults to `require` for any non-local database host.

### CLI alternative

`MIGRATION_DATABASE_URL='postgresql://postgres:<owner-pw>@db.<ref>.supabase.co:5432/postgres' npm run db:migrate`, create the
role with the SQL in `deploy.sql`'s last section, and bootstrap the admin with `npm run admin:create`.

## Backups & recovery

- Supabase daily backups + Point-in-Time Recovery (recommended during the election week).
- Logical backups: `BACKUP_DATABASE_URL=<owner url> npm run db:backup` (custom-format `pg_dump` + SHA-256 file). Take one right
  before opening, right after closing, and after publication. Store encrypted, off-site, access-restricted (see trust assumptions).
- Verification: `PG_ADMIN_URL=<admin url of a scratch server> npm run db:verify-backup -- backups/<file>.dump` restores into a scratch
  database and checks the audit hash chain, ballot/participation reconciliation and absence of duplicate participation.
- Recovery: restore into a new database (`pg_restore --no-owner`), run `npm run db:migrate` (no-op if current), recreate the app login
  role grant, point `DATABASE_URL` at it, and verify the Audit page and Results reconciliation before resuming.
