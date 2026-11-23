/**
 * End-to-end checks against a RUNNING server (default http://localhost:3000) that
 * uses OTP_PROVIDER=dev and a seeded LIVE election (npm run db:seed).
 *
 *   npm run build && npm start   (in another terminal)
 *   npm run test:e2e
 *
 * Covers: public site (desktop + mobile), full mobile voting flow, duplicate vote
 * rejection, CSRF rejection, admin password + MFA enrolment, permission checks.
 */
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const OUT = process.env.E2E_SCREENSHOTS ?? "tests/e2e/screenshots";
mkdirSync(OUT, { recursive: true });
// Resolved via require so a globally installed Playwright (NODE_PATH) also works.
const { chromium, devices } = createRequire(import.meta.url)("playwright");
let failures = 0;
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`✓ ${name}`);
  } catch (e) {
    failures++;
    results.push(`✗ ${name}\n    ${String(e?.message ?? e).split("\n")[0]}`);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

// --- minimal RFC 6238 TOTP for the MFA step -------------------------------
function base32Decode(s) {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of s.replace(/=+$/, "")) bits += a.indexOf(ch).toString(2).padStart(5, "0");
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secret, t = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / 30)));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}

async function latestOtp(request, to) {
  for (let i = 0; i < 20; i++) {
    const r = await request.get(`${BASE}/api/dev/outbox`);
    const { messages } = await r.json();
    const m = messages.find((x) => x.to === to);
    if (m) return m.code;
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error("OTP not delivered to dev outbox");
}

const browser = await chromium.launch();

await check("public landing page renders (desktop) without console errors", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /আপনার কণ্ঠ/ }).waitFor();
  await page.getByText("প্রার্থীদের সাথে পরিচিত হোন").first().waitFor();
  await page.screenshot({ path: `${OUT}/landing-desktop.png`, fullPage: true });
  assert(errors.length === 0, `console errors: ${errors.join(" | ")}`);
  const html = await page.content();
  assert(!/votes?:\s*\d+/i.test(await page.locator("#candidates").innerText()), "candidate section must not show vote counts");
  assert(html.includes("nonce"), "CSP nonce should be applied to scripts");
  await ctx.close();
});

await check("public pages are mobile-responsive (no horizontal overflow)", async () => {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  for (const path of ["/", "/results", "/help", "/verify-receipt", "/vote"]) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 1, `${path} overflows horizontally by ${overflow}px`);
  }
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/landing-mobile.png`, fullPage: true });
  await ctx.close();
});

await check("full voting flow on a phone: roll → OTP → select → review → confirm → receipt", async () => {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await ctx.newPage();
  const roll = process.env.E2E_ROLL ?? "D28041";
  await page.goto(`${BASE}/vote`, { waitUntil: "networkidle" });
  await page.getByLabel("রোল নম্বর").fill(roll);
  await page.getByRole("button", { name: /যাচাই কোড পাঠান/ }).click();
  await page.getByLabel("৬ অঙ্কের কোড").waitFor();
  await page.screenshot({ path: `${OUT}/vote-otp-mobile.png` });
  const code = await latestOtp(ctx.request, `${roll.toLowerCase()}@students.example.edu`);
  await page.getByLabel("৬ অঙ্কের কোড").fill(code);
  await page.getByRole("button", { name: /যাচাই করে এগিয়ে যান/ }).click();
  await page.waitForURL("**/vote/ballot");
  await page.getByText("একজন প্রার্থী বেছে নিন", { exact: true }).first().waitFor();
  await page.locator("label", { hasText: "Sadia Akter" }).first().click();
  await page.screenshot({ path: `${OUT}/vote-ballot-mobile.png`, fullPage: true });
  await page.getByRole("button", { name: "পছন্দ পর্যালোচনা" }).click();
  await page.getByText("আপনার ব্যালট পর্যালোচনা করুন").waitFor();
  const submit = page.getByRole("button", { name: "চূড়ান্ত ব্যালট জমা দিন" });
  assert(await submit.isDisabled(), "submit must be disabled until confirmation is ticked");
  await page.getByRole("checkbox").check();
  await page.screenshot({ path: `${OUT}/vote-review-mobile.png` });
  await submit.click();
  await page.waitForURL("**/vote/receipt");
  const receipt = (await page.getByTestId("receipt-code").innerText()).trim();
  assert(/^TT28-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(receipt), `bad receipt ${receipt}`);
  const receiptText = await page.locator("main").innerText();
  assert(!receiptText.includes("Sadia"), "receipt must not reveal the chosen candidate");
  await page.screenshot({ path: `${OUT}/vote-receipt-mobile.png` });

  // A second submission with the same session is rejected.
  const csrf = (await ctx.cookies()).find((c) => c.name === "tt_csrf").value;
  const again = await ctx.request.post(`${BASE}/api/vote/cast`, {
    headers: { "x-csrf-token": csrf, origin: BASE, "content-type": "application/json" },
    data: { candidateId: "00000000-0000-4000-8000-000000000000" },
  });
  assert(again.status() === 409 && (await again.json()).error.code === "ALREADY_VOTED", `expected ALREADY_VOTED, got ${again.status()}`);

  // The receipt verifies publicly.
  const v = await ctx.request.post(`${BASE}/api/public/receipt`, { headers: { "x-csrf-token": csrf, origin: BASE, "content-type": "application/json" }, data: { code: receipt } });
  assert((await v.json()).found === true, "receipt should verify");
  await ctx.close();
});

await check("unknown roll numbers get the same response as registered ones", async () => {
  const ctx = await browser.newContext();
  await (await ctx.newPage()).goto(BASE);
  const csrf = (await ctx.cookies()).find((c) => c.name === "tt_csrf").value;
  const h = { "x-csrf-token": csrf, origin: BASE, "content-type": "application/json" };
  const a = await ctx.request.post(`${BASE}/api/vote/request-otp`, { headers: h, data: { roll: "NOPE12345" } });
  const b = await ctx.request.post(`${BASE}/api/vote/request-otp`, { headers: h, data: { roll: "D28042" } });
  assert(a.status() === 200 && b.status() === 200, "both 200");
  assert(JSON.stringify(await a.json()) === JSON.stringify(await b.json()), "bodies must be identical");
  await ctx.close();
});

await check("state-changing requests without a CSRF token or from a foreign origin are rejected", async () => {
  const ctx = await browser.newContext();
  const r1 = await ctx.request.post(`${BASE}/api/vote/request-otp`, { headers: { "content-type": "application/json", origin: BASE }, data: { roll: "D28001" } });
  assert(r1.status() === 403, `no token → ${r1.status()}`);
  await (await ctx.newPage()).goto(BASE);
  const csrf = (await ctx.cookies()).find((c) => c.name === "tt_csrf").value;
  const r2 = await ctx.request.post(`${BASE}/api/vote/request-otp`, { headers: { "content-type": "application/json", origin: "https://evil.example", "x-csrf-token": csrf }, data: { roll: "D28001" } });
  assert(r2.status() === 403, `foreign origin → ${r2.status()}`);
  await ctx.close();
});

await check("unauthenticated access to admin pages and APIs is refused", async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/students`);
  assert(page.url().endsWith("/admin/login"), `expected redirect to login, got ${page.url()}`);
  const r = await ctx.request.get(`${BASE}/api/admin/students/export`);
  assert(r.status() === 401, `export without session → ${r.status()}`);
  await ctx.close();
});

let adminCtx;
await check("admin sign-in: password, mandatory MFA enrolment, dashboard", async () => {
  adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await adminCtx.newPage();
  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel("ইমেইল").fill(process.env.E2E_ADMIN_EMAIL ?? "superadmin@dev.local");
  await page.getByLabel("পাসওয়ার্ড").fill(process.env.E2E_ADMIN_PASSWORD ?? "DevOnly-Passw0rd!");
  await page.getByRole("button", { name: "এগিয়ে যান" }).click();
  const secretEl = page.locator("code").first();
  const enrolling = await secretEl.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  assert(enrolling, "expected MFA enrolment for a fresh dev admin (re-seed the DB if it was already enrolled)");
  await page.screenshot({ path: `${OUT}/admin-mfa-enrol.png` });
  const secret = (await secretEl.innerText()).trim();
  await page.getByLabel("যাচাই কোড").fill(totp(secret));
  await page.getByRole("button", { name: "যাচাই করুন" }).click();
  await page.waitForURL(`${BASE}/admin`);
  await page.getByText(/স্বাগতম,/).waitFor();
  await page.screenshot({ path: `${OUT}/admin-overview.png`, fullPage: true });
  for (const p of ["students", "candidates", "elections", "results", "corrections", "audit", "admins", "disputes", "settings"]) {
    const res = await page.goto(`${BASE}/admin/${p}`);
    assert(res.status() === 200, `/admin/${p} → ${res.status()}`);
    assert(!(await page.getByText("Application error").count()), `/admin/${p} crashed`);
    if (["students", "results", "audit"].includes(p)) await page.screenshot({ path: `${OUT}/admin-${p}.png`, fullPage: true });
  }
  // results are sealed during a live election
  await page.goto(`${BASE}/admin/results`);
  await page.getByText("ফলাফল সিলগালা").waitFor();
});

await check("audit log hash chain is intact", async () => {
  const r = await adminCtx.request.get(`${BASE}/api/admin/audit/verify`);
  const j = await r.json();
  assert(j.ok && j.chain.ok === true, JSON.stringify(j));
});

await browser.close();
console.log(results.join("\n"));
console.log(failures ? `\n${failures} e2e check(s) FAILED` : "\nAll e2e checks passed");
process.exit(failures ? 1 : 0);
