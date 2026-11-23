@AGENTS.md

## Deployment: pushes go live automatically

- Production is Vercel, deploying the `claude/epic-johnson-2edi2p` branch (`main` is kept identical).
- Push your work to your own `claude/...` branch as usual. The `publish` job in `.github/workflows/ci.yml`
  runs after `verify` (typecheck, lint, unit tests, build) passes and publishes the commit to both live
  branches, merging in any newer live work first. The site updates a few minutes after the push.
- Do not push to `claude/epic-johnson-2edi2p` or `main` yourself, and never force-push them. If `verify`
  fails, nothing is published, so keep it green. If `publish` reports a conflict, merge the live branch
  into your branch, resolve it, and push again.
- Changes to `.github/workflows/*` cannot be published by the workflow's token; the user has to publish
  those once (or a session they authorise does it).
- Live check: `https://techtitans28.vercel.app/api/health` reports the deployed commit.

## Content

- The public site and voter portal are bilingual through `src/lib/i18n.ts` (Bengali by default, English
  via the switch): add every new visible string to both the `en` and `bn` dictionaries.
- The admin dashboard is Bengali-only. Real student data (names, contacts) never goes in the repository.
