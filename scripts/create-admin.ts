/**
 * Bootstraps the first Super Admin in a fresh (production) database.
 *   MIGRATION_DATABASE_URL=... ADMIN_PASSWORD='...' npm run admin:create -- --email chief@iu.ac.bd --name "Full Name"
 * The password is read from ADMIN_PASSWORD (not argv) so it does not land in shell history.
 * MFA enrolment is forced at first sign-in.
 */
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { Client } from "pg";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : undefined; };

async function main() {
  const email = arg("email")?.toLowerCase();
  const name = arg("name");
  const role = arg("role") ?? "SUPER_ADMIN";
  const pw = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !name) throw new Error("--email and --name are required");
  if (pw.length < 12 || !/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) throw new Error("ADMIN_PASSWORD must be 12+ chars with upper, lower and digits");
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize("NFKC"), salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const c = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await c.connect();
  try {
    const r = await c.query(
      `insert into election_admins (email, full_name, role_code, password_hash) values ($1, $2, $3, $4) returning id`,
      [email, name, role, `scrypt$32768$8$1$${salt.toString("base64")}$${key.toString("base64")}`],
    );
    await c.query(`select append_audit('SYSTEM', null, 'ADMIN.BOOTSTRAPPED', 'election_admin', $1, jsonb_build_object('email', $2::text, 'role', $3::text), null)`, [r.rows[0].id, email, role]);
    console.log(`✓ Created ${role} ${email}. Sign in at /admin/login and enrol MFA.`);
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
