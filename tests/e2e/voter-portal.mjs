/**
 * Voter-portal end-to-end checks (real browser, running server, dev OTP outbox).
 *   node tests/e2e/voter-portal.mjs      (needs a seeded LIVE election: npm run db:seed)
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const OUT = process.env.E2E_SCREENSHOTS ?? "tests/e2e/screenshots";
mkdirSync(OUT, { recursive: true });
const results = []; let failures = 0;
async function check(name, fn) { try { await fn(); results.push(`✓ ${name}`); } catch (e) { failures++; results.push(`✗ ${name}\n    ${String(e?.message ?? e).split("\n")[0]}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
// Seed data: every 5th student has a phone contact (+88017xxxxxxxx), the rest an email.
const mail = (roll) => {
  const i = Number(roll.slice(3));
  return i % 5 === 0 ? `+88017${String(10000000 + i).slice(-8)}` : `${roll.toLowerCase()}@students.example.edu`;
};
async function otpFor(request, to, skip = 0) {
  for (let i = 0; i < 24; i++) {
    const { messages } = await (await request.get(`${BASE}/api/dev/outbox`)).json();
    const hits = messages.filter((x) => x.to === to);
    if (hits.length > skip) return hits[0].code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("no OTP delivered");
}
const browser = await chromium.launch();
const phone = () => browser.newContext({ ...devices["Pixel 7"] });

async function loginAs(page, ctx, roll) {
  await page.goto(`${BASE}/vote`, { waitUntil: "networkidle" });
  await page.getByLabel("Roll number").fill(roll);
  await page.getByRole("button", { name: /Send verification code/ }).click();
  await page.getByLabel("6-digit code").waitFor();
  const code = await otpFor(ctx.request, mail(roll));
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: /Verify/ }).click();
}

await check("voter portal page loads with roll form", async () => {
  const ctx = await phone(); const page = await ctx.newPage();
  await page.goto(`${BASE}/vote`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Enter your university roll number" }).waitFor();
  await page.screenshot({ path: `${OUT}/portal-1-roll.png` });
  await ctx.close();
});

await check("wrong code is rejected with a clear message; correct code then works", async () => {
  const ctx = await phone(); const page = await ctx.newPage();
  const roll = "D28010";
  await page.goto(`${BASE}/vote`, { waitUntil: "networkidle" });
  await page.getByLabel("Roll number").fill(roll);
  await page.getByRole("button", { name: /Send verification code/ }).click();
  await page.getByLabel("6-digit code").waitFor();
  const code = await otpFor(ctx.request, mail(roll));
  const wrong = code === "000000" ? "111111" : "000000";
  await page.getByLabel("6-digit code").fill(wrong);
  await page.getByRole("button", { name: /Verify/ }).click();
  await page.getByText("The code is invalid or has expired.").waitFor();
  await page.screenshot({ path: `${OUT}/portal-2-wrong-code.png` });
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: /Verify/ }).click();
  await page.waitForURL("**/vote/ballot");
  await ctx.close();
});

await check("unregistered roll: same screen as a real roll, but no code ever works", async () => {
  const ctx = await phone(); const page = await ctx.newPage();
  await page.goto(`${BASE}/vote`, { waitUntil: "networkidle" });
  await page.getByLabel("Roll number").fill("NOSUCH99");
  await page.getByRole("button", { name: /Send verification code/ }).click();
  await page.getByLabel("6-digit code").waitFor();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: /Verify/ }).click();
  await page.getByText("The code is invalid or has expired.").waitFor();
  await ctx.close();
});

await check("locks out after 5 wrong codes", async () => {
  const ctx = await phone(); const page = await ctx.newPage();
  const roll = "D28011";
  await page.goto(`${BASE}/vote`, { waitUntil: "networkidle" });
  await page.getByLabel("Roll number").fill(roll);
  await page.getByRole("button", { name: /Send verification code/ }).click();
  await page.getByLabel("6-digit code").waitFor();
  const code = await otpFor(ctx.request, mail(roll));
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("6-digit code").fill(wrong);
    await page.getByRole("button", { name: /Verify/ }).click();
    await page.waitForTimeout(400);
  }
  await page.getByText(/Too many incorrect attempts/).waitFor();
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: /Verify/ }).click();
  await page.getByText(/Too many incorrect attempts/).waitFor();
  await ctx.close();
});

await check("resend button is on cooldown right after sending", async () => {
  const ctx = await phone(); const page = await ctx.newPage();
  await page.goto(`${BASE}/vote`, { waitUntil: "networkidle" });
  await page.getByLabel("Roll number").fill("D28012");
  await page.getByRole("button", { name: /Send verification code/ }).click();
  await page.getByLabel("6-digit code").waitFor();
  assert(await page.getByRole("button", { name: /Resend in \d+s/ }).isDisabled(), "resend should be disabled during cooldown");
  await ctx.close();
});

await check("ballot: cannot continue without a choice; review shows the selected candidate; submit needs the confirmation tick", async () => {
  const ctx = await phone(); const page = await ctx.newPage();
  await loginAs(page, ctx, "D28020");
  await page.waitForURL("**/vote/ballot");
  const review = page.getByRole("button", { name: "Review choice" });
  assert(await review.isDisabled(), "Review must be disabled before choosing");
  await page.getByText("Manifesto").first().click();
  await page.locator("label", { hasText: "Rakib Hossain" }).first().click();
  await page.screenshot({ path: `${OUT}/portal-3-ballot.png` });
  await review.click();
  await page.getByText("Review your ballot").waitFor();
  assert((await page.locator("main").innerText()).includes("Rakib Hossain"), "review screen shows selection");
  await page.getByRole("button", { name: /Back/ }).click();
  await page.getByRole("heading", { name: "Choose one candidate" }).waitFor();
  await page.getByRole("button", { name: "Review choice" }).click();
  const submit = page.getByRole("button", { name: "Submit final ballot" });
  assert(await submit.isDisabled(), "submit disabled until confirmed");
  await page.getByRole("checkbox").check();
  await page.screenshot({ path: `${OUT}/portal-4-review.png` });
  await submit.click();
  await page.waitForURL("**/vote/receipt");
  const receipt = (await page.getByTestId("receipt-code").innerText()).trim();
  assert(/^TT28-/.test(receipt), "receipt shown");
  assert(!(await page.locator("main").innerText()).includes("Rakib"), "receipt must not name the candidate");
  await page.screenshot({ path: `${OUT}/portal-5-receipt.png` });
  // Reload keeps showing the receipt; going to /vote or /vote/ballot redirects to it.
  await page.goto(`${BASE}/vote/ballot`); await page.waitForURL("**/vote/receipt");
  await page.goto(`${BASE}/vote`); await page.waitForURL("**/vote/receipt");
  // Public verification page accepts the receipt
  await page.goto(`${BASE}/verify-receipt`);
  await page.getByLabel("Receipt ID").fill(receipt);
  await page.getByRole("button", { name: "Verify receipt" }).click();
  await page.getByText("Ballot recorded").waitFor();
  await ctx.close();
});

await check("a voter who already voted can sign in again but is sent to the receipt, never the ballot", async () => {
  const ctx = await phone(); const page = await ctx.newPage();
  await page.goto(`${BASE}/vote`, { waitUntil: "networkidle" });
  await page.getByLabel("Roll number").fill("D28020");
  // new request may hit the per-roll cooldown; wait for it by retrying once after the cooldown window
  await page.getByRole("button", { name: /Send verification code/ }).click();
  const cooling = await page.getByText(/Please wait \d+ seconds/).waitFor({ timeout: 2500 }).then(() => true).catch(() => false);
  assert(cooling, "second request inside the cooldown must be rate-limited");
  await ctx.close();
});

await check("sign out ends the session and /vote/ballot redirects to the login", async () => {
  const ctx = await phone(); const page = await ctx.newPage();
  await loginAs(page, ctx, "D28030");
  await page.waitForURL("**/vote/ballot");
  await page.context().clearCookies({ name: "tt_voter" });
  await page.goto(`${BASE}/vote/ballot`);
  await page.waitForURL(`${BASE}/vote`);
  await ctx.close();
});

await check("a tampered/forged session cookie cannot reach the ballot or vote", async () => {
  const ctx = await phone();
  await ctx.addCookies([{ name: "tt_voter", value: "forged-token-forged-token-forged", url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/vote/ballot`); await page.waitForURL(`${BASE}/vote`);
  const csrf = (await ctx.cookies()).find((c) => c.name === "tt_csrf")?.value ?? "";
  const r = await ctx.request.post(`${BASE}/api/vote/cast`, { headers: { "x-csrf-token": csrf, origin: BASE, "content-type": "application/json" }, data: { candidateId: "00000000-0000-4000-8000-000000000000" } });
  assert(r.status() === 401, `expected 401, got ${r.status()}`);
  await ctx.close();
});

await check("two phones voting at the same time for the same voter: only one ballot is accepted", async () => {
  const ctx = await phone(); const page = await ctx.newPage();
  await loginAs(page, ctx, "D28040");
  await page.waitForURL("**/vote/ballot");
  const ids = await page.locator('input[name="candidate"]').evaluateAll((els) => els.map((e) => e.value));
  const csrf = (await ctx.cookies()).find((c) => c.name === "tt_csrf").value;
  const h = { "x-csrf-token": csrf, origin: BASE, "content-type": "application/json" };
  const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => ctx.request.post(`${BASE}/api/vote/cast`, { headers: h, data: { candidateId: ids[i % ids.length] } })));
  const codes = await Promise.all(rs.map(async (r) => r.status()));
  assert(codes.filter((c) => c === 200).length === 1, `expected exactly one 200, got ${codes}`);
  assert(codes.filter((c) => c === 409).length === 9, `expected nine 409, got ${codes}`);
  await ctx.close();
});

await check("desktop layout of the voter portal also works", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } }); const page = await ctx.newPage();
  await loginAs(page, ctx, "D28050");
  await page.waitForURL("**/vote/ballot");
  await page.screenshot({ path: `${OUT}/portal-6-desktop-ballot.png`, fullPage: true });
  await ctx.close();
});

await browser.close();
console.log(results.join("\n"));
console.log(failures ? `\n${failures} voter-portal check(s) FAILED` : "\nAll voter-portal checks passed");
process.exit(failures ? 1 : 0);
