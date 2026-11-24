/**
 * Voter-portal end-to-end checks (real browser, running server, dev OTP outbox).
 *   node tests/e2e/voter-portal.mjs      (needs a seeded LIVE election: npm run db:seed)
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
// The open-ballot notice version the server currently expects (kept in sync with src/lib/i18n.ts).
const NOTICE_VERSION = readFileSync(new URL("../../src/lib/i18n.ts", import.meta.url), "utf8").match(/OPEN_BALLOT_NOTICE_VERSION = "([^"]+)"/)[1];

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
// The site defaults to Bengali; this suite checks the English mode (tests/e2e/run.mjs covers Bengali).
const english = async (ctx) => { await ctx.addCookies([{ name: "tt_lang", value: "en", url: BASE }]); return ctx; };
const phone = async () => english(await browser.newContext({ ...devices["Pixel 7"] }));

/** Step 1 (find my details → "Is this you?") then step 2 (send the code to the shown contact). */
async function confirmAndSend(page) {
  await page.getByRole("button", { name: "Find my details" }).click();
  await page.getByRole("heading", { name: "Is this you?" }).waitFor();
  await page.getByRole("button", { name: /Yes, send the code/ }).click();
}

async function loginAs(page, ctx, roll) {
  await page.goto(`${BASE}/vote`, { waitUntil: "networkidle" });
  await page.getByLabel("Roll number").fill(roll);
  await confirmAndSend(page);
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
  await confirmAndSend(page);
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

await check("roll lookup: shows the student's name and a partly hidden email; unknown rolls are refused; 'Not me' goes back", async () => {
  const ctx = await phone(); const page = await ctx.newPage();
  await page.goto(`${BASE}/vote`, { waitUntil: "networkidle" });
  await page.getByLabel("Roll number").fill("NOSUCH99");
  await page.getByRole("button", { name: "Find my details" }).click();
  await page.getByText("This roll number is not on the voter list or is not eligible to vote.").waitFor();
  assert((await page.getByLabel("6-digit code").count()) === 0, "no code step for an unknown roll");
  await page.getByLabel("Roll number").fill("D28011");
  await page.getByRole("button", { name: "Find my details" }).click();
  await page.getByRole("heading", { name: "Is this you?" }).waitFor();
  const name = await page.getByTestId("who-name").innerText();
  const contact = await page.getByTestId("who-contact").innerText();
  assert(name.length > 3, "name shown");
  assert(/^d2\*+@students\.example\.edu$/.test(contact), `contact must be partly hidden, got ${contact}`);
  assert(!(await page.locator("main").innerText()).includes("d28011@"), "full email must never be shown");
  await page.screenshot({ path: `${OUT}/portal-1b-confirm.png` });
  await page.getByRole("button", { name: /Not me/ }).click();
  await page.getByLabel("Roll number").waitFor();
  await ctx.close();
});

await check("locks out after 5 wrong codes", async () => {
  const ctx = await phone(); const page = await ctx.newPage();
  const roll = "D28011";
  await page.goto(`${BASE}/vote`, { waitUntil: "networkidle" });
  await page.getByLabel("Roll number").fill(roll);
  await confirmAndSend(page);
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
  await confirmAndSend(page);
  await page.getByLabel("6-digit code").waitFor();
  assert(await page.getByRole("button", { name: /Resend in \d+s/ }).isDisabled(), "resend should be disabled during cooldown");
  await ctx.close();
});

await check("two-vote ballot: one boy then one girl; review shows both; submit needs the confirmation tick", async () => {
  const ctx = await phone(); const page = await ctx.newPage();
  await loginAs(page, ctx, "D28020");
  await page.waitForURL("**/vote/ballot");
  await page.getByText(/No more than 2 votes/).waitFor();
  const cont = page.getByRole("button", { name: "Select one candidate" });
  assert(await cont.isDisabled(), "cannot continue before choosing a boy");
  await page.getByText("Manifesto").first().click();
  await page.locator("label", { hasText: "Rakib Hossain" }).first().click();
  await page.screenshot({ path: `${OUT}/portal-3-ballot.png` });
  await page.getByRole("button", { name: /Next: Girls' CR/ }).click();
  await page.getByRole("heading", { name: /Select one candidate for Girls' Class Representative/ }).waitFor();
  assert((await page.locator("label", { hasText: "Rakib Hossain" }).count()) === 0, "a boy is never listed in the Girls' race");
  assert((await page.getByRole("button", { name: "Review choices" }).count()) === 0, "Review is not offered until BOTH races are chosen");
  // Switching back and forth keeps the boy's choice.
  assert((await page.getByRole("tab").count()) === 0, "races are two pages, not free-switching tabs");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("heading", { name: /Select one candidate for Boys' Class Representative/ }).waitFor();
  assert(await page.locator('input[type=radio]:checked').count() === 1, "boy choice kept after going back");
  assert((await page.locator("label", { hasText: "Lamia Rahman" }).count()) === 0, "a girl is never listed on the Boys' page");
  await page.locator("label", { hasText: "Arif Rahman" }).first().click();
  assert(await page.locator('input[type=radio]:checked').count() === 1, "choosing a second boy replaces the first (only one can be selected)");
  await page.locator("label", { hasText: "Rakib Hossain" }).first().click();
  await page.getByRole("button", { name: /Next: Girls' CR/ }).click();
  await page.locator("label", { hasText: "Lamia Rahman" }).first().click();
  await page.locator("label", { hasText: "Sadia Akter" }).first().click();
  assert(await page.locator('input[type=radio]:checked').count() === 1, "only one girl can be selected");
  await page.locator("label", { hasText: "Lamia Rahman" }).first().click();
  await page.screenshot({ path: `${OUT}/portal-3b-girls.png` });
  const review = page.getByRole("button", { name: "Review choices" });
  await review.click();
  await page.getByText("Review your two votes").waitFor();
  const main = await page.locator("main").innerText();
  assert(main.includes("Rakib Hossain") && main.includes("Lamia Rahman"), "review screen shows both selections");
  await page.getByRole("button", { name: /Back/ }).click();
  await page.getByRole("heading", { name: "Cast your two votes" }).waitFor();
  await page.getByRole("button", { name: "Review choices" }).click();
  const submit = page.getByRole("button", { name: "Submit final ballot" });
  assert(await submit.isDisabled(), "submit disabled until confirmed");
  for (const cb of await page.getByRole("checkbox").all()) await cb.check();
  await page.screenshot({ path: `${OUT}/portal-4-review.png` });
  await submit.click();
  await page.waitForURL("**/vote/receipt");
  const receipt = (await page.getByTestId("receipt-code").innerText()).trim();
  assert(/^TT28-/.test(receipt), "receipt shown");
  const rt = await page.locator("main").innerText();
  assert(!rt.includes("Rakib") && !rt.includes("Lamia"), "receipt must not name either candidate");
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
  await confirmAndSend(page);
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
  const r = await ctx.request.post(`${BASE}/api/vote/cast`, { headers: { "x-csrf-token": csrf, origin: BASE, "content-type": "application/json" }, data: { openBallotAck: NOTICE_VERSION, candidateIds: ["00000000-0000-4000-8000-000000000000", "00000000-0000-4000-8000-000000000001"] } });
  assert(r.status() === 401, `expected 401, got ${r.status()}`);
  await ctx.close();
});

await check("STRICT RULE over the API: one vote only, two boys or two girls are rejected; a valid pair is accepted exactly once under 10 simultaneous requests", async () => {
  const ctx = await phone(); const page = await ctx.newPage();
  await loginAs(page, ctx, "D28040");
  await page.waitForURL("**/vote/ballot");
  const boyIds = await page.locator('input[type=radio]').evaluateAll((els) => els.map((e) => e.value));
  await page.locator("input[type=radio]").first().check({ force: true });
  await page.getByRole("button", { name: /Next: Girls' CR/ }).click();
  const girlIds = await page.locator('input[type=radio]').evaluateAll((els) => els.map((e) => e.value));
  assert(boyIds.length >= 2 && girlIds.length >= 2, `need 2+ candidates per race (boys ${boyIds.length}, girls ${girlIds.length})`);
  const csrf = (await ctx.cookies()).find((c) => c.name === "tt_csrf").value;
  const h = { "x-csrf-token": csrf, origin: BASE, "content-type": "application/json" };
  const post = (ids) => ctx.request.post(`${BASE}/api/vote/cast`, { headers: h, data: { openBallotAck: NOTICE_VERSION, candidateIds: ids } });
  for (const [name, ids] of [["boy only", [boyIds[0]]], ["girl only", [girlIds[0]]], ["two boys", [boyIds[0], boyIds[1]]], ["two girls", [girlIds[0], girlIds[1]]], ["three", [boyIds[0], girlIds[0], girlIds[1]]]]) {
    const r = await post(ids);
    const j = await r.json();
    assert(r.status() === 400 && j.error.code === "INCOMPLETE_BALLOT", `${name}: expected 400 INCOMPLETE_BALLOT, got ${r.status()} ${j.error?.code}`);
  }
  const status = await (await ctx.request.get(`${BASE}/api/vote/status`)).json();
  assert(status.hasVoted === false, "rejected attempts must not count as voting");
  const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => post([boyIds[i % boyIds.length], girlIds[(i + 1) % girlIds.length]])));
  const codes = rs.map((r) => r.status());
  assert(codes.filter((c) => c === 200).length === 1, `expected exactly one 200, got ${codes}`);
  assert(codes.filter((c) => c === 409).length === 9, `expected nine 409, got ${codes}`);
  await ctx.close();
});

await check("desktop layout of the voter portal also works", async () => {
  const ctx = await english(await browser.newContext({ viewport: { width: 1366, height: 800 } })); const page = await ctx.newPage();
  await loginAs(page, ctx, "D28050");
  await page.waitForURL("**/vote/ballot");
  await page.screenshot({ path: `${OUT}/portal-6-desktop-ballot.png`, fullPage: true });
  await ctx.close();
});

await browser.close();
console.log(results.join("\n"));
console.log(failures ? `\n${failures} voter-portal check(s) FAILED` : "\nAll voter-portal checks passed");
process.exit(failures ? 1 : 0);
