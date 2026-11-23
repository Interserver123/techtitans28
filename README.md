# TechTitans-28 · CR Election Portal

Secure online Class Representative election for **TechTitans-28, Department of ICT, Islamic University, Bangladesh**.

- **Public site** — election status, countdown, live turnout, candidates & manifestos, guidelines, committee, official results.
- **Voter portal** — roll number → one-time code → choose one candidate → review → confirm → receipt. Built for phones.
- **Admin dashboard** — students (CSV/XLSX import), candidates, election lifecycle, sealed results & publication, PDF report,
  two-person vote corrections, disputes, hash-chained audit log, role-based access with mandatory MFA.

One student · one ballot · secret vote — enforced inside PostgreSQL, not just in application code.

```bash
npm install && cp .env.example .env.local   # fill in the two secrets
npm run db:setup && npm run db:seed          # local PostgreSQL + development data
npm run dev
npm test
```

Full documentation: [DEVELOPMENT.md](DEVELOPMENT.md) · Progress: [TASKS.md](TASKS.md)
