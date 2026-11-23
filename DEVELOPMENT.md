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

1. **Database superusers / the schema owner / Supabase platform operators.** Because a voter's participation row and ballot row
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

`/vote` → `/vote/ballot` (select one card) → **Review** screen → tick "this is final" → **Submit** → `/vote/receipt`.

`POST /api/vote/cast {candidateId}` calls `cast_ballot(token_hash, candidate_id)` which, in one transaction:
validates the credential → `SELECT … FOR SHARE` on the election (blocks a concurrent pause/close) → checks status/hours →
`SELECT … FOR UPDATE` on the student (serialises duplicate submissions) → checks eligibility → checks not already voted →
validates the candidate is APPROVED in this election → inserts participation (unique constraint as a second barrier) →
inserts the anonymous ballot → returns receipt code + time.

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

**Results:** while open, only turnout is visible. After closing: tally, reconciliation (ballots = participation; tally = valid
ballots), then **verify** (records a SHA-256 tally fingerprint), then **publish** (type `PUBLISH`). Publication fails if the tally
changed after verification or corrections are pending, writes an immutable `election_results` snapshot and is audited. **Ties**: no
winner is declared; publication requires a committee tie-resolution note shown publicly. PDF report: public after publication;
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
npm test            # vitest: 39 tests against a real PostgreSQL (DB techtitans_test is recreated from migrations)
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

1. **Supabase project** (region close to Bangladesh, e.g. Singapore/Mumbai). Enable PITR / daily backups.
2. **Migrations** with the *direct* owner connection:
   `MIGRATION_DATABASE_URL='postgresql://postgres:…@db.<ref>.supabase.co:5432/postgres' npm run db:migrate`
3. **App role** (SQL editor, as owner):
   ```sql
   create role techtitans_app_user login password '<long random password>';
   grant techtitans_app to techtitans_app_user;
   ```
   Use it in `DATABASE_URL` via the transaction pooler, e.g.
   `postgresql://techtitans_app_user.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`, `DATABASE_SSL=verify`
   with Supabase's CA certificate in `DATABASE_CA_CERT`. **Never** give Vercel the `postgres` or `service_role` database credentials.
4. **Storage:** create bucket `candidate-photos` (public) and `correction-evidence` (private). Set `STORAGE_DRIVER=supabase`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only env var; no `NEXT_PUBLIC_` prefix).
5. **OTP:** `OTP_PROVIDER=live` with SMTP (institutional mail or a transactional provider with SPF/DKIM) and/or the SMS gateway.
   Send a test OTP to a committee member before opening the election.
6. **Vercel env vars:** `APP_ENV=production`, `APP_URL=https://<domain>`, `DATABASE_*`, `APP_SECRET_PEPPER`, `APP_ENCRYPTION_KEY`,
   OTP and storage variables, `TRUST_PROXY_HEADERS=true`. Do **not** set `MIGRATION_DATABASE_URL` on Vercel.
7. **Domain & HTTPS:** add the domain in Vercel (automatic TLS). HSTS is sent by the app.
8. **First admin:** `MIGRATION_DATABASE_URL=… ADMIN_PASSWORD='…' npm run admin:create -- --email chief@… --name "…"`, sign in, enrol MFA,
   create the other committee accounts in the dashboard.
9. **Data:** import the official TechTitans-28 register (Students → Import), resolve every validation error, review the data-quality
   panel, add candidates, approve them, set the committee/contact details, create & schedule the election.
10. **Pre-flight checklist:** no dev-seed records; `/api/dev/outbox` returns 404; a dry-run election with committee members on real
    phones (Android/iOS, slow 3G) passes; `npm test` green; Audit page shows "hash chain intact"; backup taken and verified.

Optional housekeeping: call `select purge_expired_auth_material();` daily (Supabase cron) to delete expired OTPs/sessions.

## Backups & recovery

- Supabase daily backups + Point-in-Time Recovery (recommended during the election week).
- Logical backups: `BACKUP_DATABASE_URL=<owner url> npm run db:backup` (custom-format `pg_dump` + SHA-256 file). Take one right
  before opening, right after closing, and after publication. Store encrypted, off-site, access-restricted (see trust assumptions).
- Verification: `PG_ADMIN_URL=<admin url of a scratch server> npm run db:verify-backup -- backups/<file>.dump` restores into a scratch
  database and checks the audit hash chain, ballot/participation reconciliation and absence of duplicate participation.
- Recovery: restore into a new database (`pg_restore --no-owner`), run `npm run db:migrate` (no-op if current), recreate the app login
  role grant, point `DATABASE_URL` at it, and verify the Audit page and Results reconciliation before resuming.
