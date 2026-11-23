# TASKS — TechTitans-28 CR Election Portal

Legend: ✅ done & tested · 🟡 done, needs human verification · ⬜ not started / requires the Election Committee

## Phase 1 — Architecture
- ✅ Repository inspected (empty) and Next.js 16 + TypeScript + Tailwind v4 project established
- ✅ Database schema, security architecture and trust assumptions documented (DEVELOPMENT.md)

## Phase 2 — Design
- ✅ Design system (navy/electric palette, Inter, light voter theme, dark admin theme), shadcn-style UI kit
- ✅ Public landing page: header + status, hero + countdown + CTA, election info, candidates, how it works, guidelines, committee, help, footer
- ✅ Candidate profile pages, public transparency/results dashboard, receipt verification, help/dispute form
- ✅ Mobile-first voter portal (roll → OTP → ballot → review → confirm → receipt)
- ✅ Admin dashboard with sidebar navigation and election selector

## Phase 3 — Backend
- ✅ SQL migrations with constraints, indexes, triggers, RLS, grants; migration runner with checksums
- ✅ Student import (CSV/XLSX) with row-level validation, duplicate detection, preview and all-or-nothing commit
- ✅ OTP authentication (hashed codes, expiry, attempt limit, cooldown, rate limiting, enumeration-safe responses)
- ✅ Election lifecycle with DB-enforced state machine, auto open/close
- ✅ Atomic `cast_ballot()` with locking + unique constraints; separated participation/ballot tables

## Phase 4 — Administration
- ✅ Student management (add/edit/deactivate, search, filters, export, data-quality report)
- ✅ Candidate management (add/edit/approve/deactivate, photo upload with re-encoding, preview)
- ✅ Admin accounts, roles, explicit publish authorisation, password + mandatory TOTP MFA, lockout, MFA/password reset
- ✅ Correction requests with second-administrator approval, evidence attachments, immutable history
- ✅ Hash-chained, append-only audit log with chain verification UI
- ✅ Dispute management (never grants a ballot)

## Phase 5 — Results
- ✅ Sealed tally until closure (enforced in DB), reconciliation, verification fingerprint, publication, tie handling
- ✅ PDF report (official / provisional watermark), anonymous ballot ledger export
- ✅ Public results dashboard with winner announcement animation

## Phase 6 — Validation
- ✅ 39 automated tests (auth, voting, concurrency, 150-voter load, admin/RBAC, corrections, audit, RLS, backup/restore)
- ✅ Playwright e2e: desktop + emulated phones, full voting flow, CSRF, admin MFA
- ✅ Typecheck, lint, production build, CI workflow
- 🟡 Test on real phones (Android Chrome, iOS Safari) and slow networks — emulation only so far
- ⬜ Load test against the *production* Supabase/Vercel stack with the expected batch size
- ⬜ Independent security review / penetration test before the live election

## Phase 7 — Deployment (requires committee credentials)
- ⬜ Create Supabase project, apply migrations, create app login role, storage buckets
- ⬜ Configure SMTP and/or SMS gateway; confirm delivery to real student contacts (adapt SMS payload to the chosen Bangladeshi gateway if needed)
- ⬜ Configure Vercel env vars and custom domain (HTTPS)
- ⬜ Bootstrap first Super Admin (`npm run admin:create`), create committee accounts
- ⬜ Import the **official** student register (no real data is included in this repository)
- ⬜ Dry-run election with committee members; take and verify a backup

## Decisions needing the Election Committee
- ⬜ Tie-break rule (system blocks automatic winner; committee note required to publish)
- ⬜ Registered contact per student (email vs phone) and the official OTP sender identity
- ⬜ Who holds database owner credentials (see "trust assumptions")
