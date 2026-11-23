/**
 * DEVELOPMENT SEED DATA — fictional students, candidates and committee accounts.
 * Every student row is flagged is_dev_seed = true and uses rolls D28xxx and
 * example.edu addresses so it can never be mistaken for the official register.
 * Refuses to run when APP_ENV is staging/production.
 *
 *   npm run db:seed            → seeds a LIVE election (voting open now)
 *   npm run db:seed -- --draft → seeds a DRAFT election
 */
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { Client } from "pg";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize("NFKC"), salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
}

const FIRST = ["Arif", "Nusrat", "Tanvir", "Sadia", "Rakib", "Farzana", "Mahmud", "Tasnim", "Imran", "Jannat", "Sabbir", "Mim", "Fahim", "Riya", "Shakil", "Anika", "Nayeem", "Sumaiya", "Rafi", "Lamia"];
const LAST = ["Hossain", "Rahman", "Islam", "Akter", "Ahmed", "Khatun", "Chowdhury", "Sarkar", "Uddin", "Begum", "Karim", "Haque"];

async function main() {
  if (["production", "staging"].includes(process.env.APP_ENV ?? "")) throw new Error("Refusing to seed development data in staging/production.");
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set MIGRATION_DATABASE_URL or DATABASE_URL");
  const draft = process.argv.includes("--draft");
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const existing = await c.query("select count(*)::int as n from elections");
    if (existing.rows[0].n > 0 && !process.argv.includes("--force")) {
      console.log("Database already has elections; skipping seed (use --force to add another).");
      return;
    }
    await c.query("begin");
    const students: string[] = [];
    for (let i = 1; i <= 60; i++) {
      const roll = `D28${String(i).padStart(3, "0")}`;
      const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
      const contact = i % 5 === 0 ? ["PHONE", `+88017${String(10000000 + i).slice(-8)}`] : ["EMAIL", `${roll.toLowerCase()}@students.example.edu`];
      const r = await c.query(
        `insert into students (roll_number, full_name, contact_type, contact_value, batch, gender, is_dev_seed)
         values ($1, $2, $3, $4, 'TechTitans-28', $5, true) on conflict (roll_number) do update set full_name = excluded.full_name, gender = excluded.gender returning id`,
        [roll, name, contact[0], contact[1], i % 3 === 0 ? "FEMALE" : "MALE"],
      );
      students.push(r.rows[0].id);
    }
    await c.query(`insert into students (roll_number, full_name, contact_type, contact_value, batch, is_dev_seed)
                   values ('D27999', 'Other Batch Student', 'EMAIL', 'd27999@students.example.edu', 'TechTitans-27', true),
                          ('D28999', 'Deactivated Student', 'EMAIL', 'd28999@students.example.edu', 'TechTitans-28', true)
                   on conflict do nothing`);
    await c.query(`update students set is_active = false where roll_number = 'D28999'`);

    const pw = await hashPassword("DevOnly-Passw0rd!");
    const admins = [
      ["superadmin@dev.local", "Dev Super Admin", "SUPER_ADMIN", false, "Chief Election Commissioner (dev)"],
      ["superadmin2@dev.local", "Dev Second Super Admin", "SUPER_ADMIN", false, "Election Commissioner (dev)"],
      ["electionadmin@dev.local", "Dev Election Admin", "ELECTION_ADMIN", false, "Election Officer (dev)"],
      ["results@dev.local", "Dev Results Officer", "RESULTS_OFFICER", true, "Results Officer (dev)"],
      ["auditor@dev.local", "Dev Auditor", "AUDITOR", false, "Faculty Observer (dev)"],
    ] as const;
    for (const [email, name, role, pub, desig] of admins) {
      await c.query(
        `insert into election_admins (email, full_name, role_code, password_hash, can_publish_results, designation)
         values ($1, $2, $3, $4, $5, $6) on conflict (email) do nothing`,
        [email, name, role, pw, pub, desig],
      );
    }

    const e = await c.query(
      `insert into elections (title, description, opens_at, closes_at)
       values ('TechTitans-28 CR Election 2026', $1, now() - interval '10 minutes', now() + interval '2 days') returning id`,
      ["Elect the Class Representative who will represent TechTitans-28 before the ICT Department for the 2026 academic session. (Development data.)"],
    );
    const electionId = e.rows[0].id;
    const boysPos = await c.query(`insert into election_positions (election_id, code, title, gender, display_order) values ($1, 'CR_BOYS', 'Boys'' Class Representative', 'MALE', 1) returning id`, [electionId]);
    const girlsPos = await c.query(`insert into election_positions (election_id, code, title, gender, display_order) values ($1, 'CR_GIRLS', 'Girls'' Class Representative', 'FEMALE', 2) returning id`, [electionId]);
    // students[i-1] is D28(i): female when i % 3 === 0, male otherwise.
    const cands = [
      [boysPos.rows[0].id, students[1], "Tanvir Islam", "Focused on transparent communication between students and faculty, and a shared semester resource hub."],
      [boysPos.rows[0].id, students[6], "Rakib Hossain", "Building a stronger batch identity through hackathons, sports and alumni connections."],
      [boysPos.rows[0].id, students[10], "Arif Rahman", "Fair assessment feedback and a public tracker of every request made to the department."],
      [girlsPos.rows[0].id, students[2], "Sadia Akter", "Advocating for structured lab hours, mentorship circles, and timely exam-schedule announcements."],
      [girlsPos.rows[0].id, students[11], "Lamia Rahman", "Putting student welfare first: accessible notes, mental-health support and fair assessment feedback."],
    ];
    for (let i = 0; i < cands.length; i++) {
      const [pid, sid, name, intro] = cands[i];
      await c.query(
        `insert into candidates (election_id, position_id, student_id, display_name, introduction, manifesto, status, display_order)
         values ($1, $2, $3, $4, $5, $6, 'APPROVED', $7)`,
        [electionId, pid, sid, name, intro,
          `1. ${intro}\n2. Monthly open meetings where any student can raise issues.\n3. A public tracker of every request made to the department and its outcome.\n\n(Development data — fictional manifesto.)`, i],
      );
    }
    if (!draft) {
      await c.query(`update elections set status = 'SCHEDULED' where id = $1`, [electionId]);
      await c.query(`update elections set status = 'LIVE' where id = $1`, [electionId]);
    }
    await c.query(`update system_settings set value = $1 where key = 'committee.members'`, [JSON.stringify([
      { name: "Dr. A. Example", designation: "Chief Election Commissioner (dev)" },
      { name: "Prof. B. Sample", designation: "Election Commissioner (dev)" },
      { name: "C. Placeholder", designation: "Student Observer (dev)" },
    ])]);
    await c.query(`update system_settings set value = $1 where key = 'committee.contact'`, [JSON.stringify({ email: "election-committee@example.edu", phone: "+8801700000000", office: "ICT Department Office, Islamic University, Kushtia" })]);
    await c.query(`select append_audit('SYSTEM', null, 'SYSTEM.DEV_SEED', 'database', null, '{"note":"development seed data loaded"}'::jsonb, null)`);
    await c.query("commit");
    console.log(`✓ Seeded ${students.length + 2} dev students, ${cands.length} candidates, ${admins.length} admin accounts (${draft ? "DRAFT" : "LIVE"} election).`);
    console.log("  Admin sign-in: superadmin@dev.local / DevOnly-Passw0rd!  (MFA enrolment required at first sign-in)");
  } catch (err) {
    await c.query("rollback").catch(() => {});
    throw err;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
