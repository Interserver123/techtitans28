import "server-only";
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from "pdf-lib";
import { getResultSummary } from "./results";
import { getPublicSettingsRaw } from "./settings";
import { fmtDateTimeEn as fmtDateTime, pct, STATUS_LABEL_EN as STATUS_LABEL } from "../format";
import { one } from "../db";

const NAVY = rgb(11 / 255, 18 / 255, 32 / 255);
const BLUE = rgb(59 / 255, 130 / 255, 246 / 255);
const MUTED = rgb(100 / 255, 116 / 255, 139 / 255);
const LINE = rgb(226 / 255, 232 / 255, 240 / 255);

/** pdf-lib standard fonts are WinAnsi only; strip anything else rather than crash. */
const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "?");

export async function buildResultReport(electionId: string) {
  const r = await getResultSummary(electionId);
  const settings = await getPublicSettingsRaw();
  const publisher = r.election.results_published_by
    ? await one<{ full_name: string; designation: string | null }>(`select full_name, designation from election_admins where id = $1`, [r.election.results_published_by])
    : null;
  const verifier = r.election.results_verified_by
    ? await one<{ full_name: string; designation: string | null }>(`select full_name, designation from election_admins where id = $1`, [r.election.results_verified_by])
    : null;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${r.election.title} — Official Result Report`);
  pdf.setAuthor(`${settings.batch} Election Committee`);
  pdf.setSubject(`${settings.institution} · ${settings.department}`);
  pdf.setCreationDate(new Date());
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 48;
  let page = pdf.addPage([W, H]);
  let y = H - M;

  const text = (p: PDFPage, s: string, x: number, yy: number, size = 10, f: PDFFont = font, color = NAVY) =>
    p.drawText(safe(s), { x, y: yy, size, font: f, color });
  const ensure = (needed: number) => {
    if (y - needed < M + 40) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };

  // Header band
  page.drawRectangle({ x: 0, y: H - 118, width: W, height: 118, color: NAVY });
  text(page, settings.institution.toUpperCase(), M, H - 44, 9, bold, rgb(0.75, 0.82, 0.95));
  text(page, settings.department, M, H - 58, 9, font, rgb(0.75, 0.82, 0.95));
  text(page, `${settings.batch} · Class Representative Election`, M, H - 84, 18, bold, rgb(1, 1, 1));
  text(page, r.official ? "OFFICIAL RESULT REPORT" : "PROVISIONAL RESULT REPORT — NOT PUBLISHED", M, H - 104, 10, bold, r.official ? rgb(0.55, 0.75, 1) : rgb(1, 0.7, 0.4));
  y = H - 150;

  const kv = (k: string, v: string) => {
    ensure(18);
    text(page, k, M, y, 9, font, MUTED);
    text(page, v, M + 150, y, 10, bold);
    y -= 17;
  };
  const heading = (s: string) => {
    ensure(40);
    y -= 8;
    text(page, s.toUpperCase(), M, y, 9, bold, BLUE);
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: LINE });
    y -= 16;
  };

  heading("Election information");
  kv("Election", r.election.title);
  kv("Position", "Class Representative (CR)");
  kv("Voting opened", fmtDateTime(r.election.opened_at ?? r.election.opens_at));
  kv("Voting closed", fmtDateTime(r.election.closed_at ?? r.election.closes_at));
  kv("Status", STATUS_LABEL[r.election.status]);
  kv("Result published", r.official ? fmtDateTime(r.election.results_published_at) : "Not yet published");

  heading("Participation");
  kv("Total eligible voters", String(r.turnout.eligible));
  kv("Total ballots cast", String(r.totals.total_ballots));
  kv("Valid ballots", String(r.totals.valid_ballots));
  kv("Invalidated ballots", `${r.totals.invalidated_ballots} (approved corrections: ${r.appliedCorrections})`);
  kv("Voter turnout", `${r.turnout.turnoutPct}%`);
  kv("Reconciliation", r.reconciled ? "Ballots = participation records (reconciled)" : "MISMATCH — investigate");

  heading("Candidate-wise results");
  ensure(24);
  text(page, "Rank", M, y, 9, bold, MUTED);
  text(page, "Candidate", M + 44, y, 9, bold, MUTED);
  text(page, "Roll", M + 280, y, 9, bold, MUTED);
  text(page, "Votes", M + 370, y, 9, bold, MUTED);
  text(page, "Share", M + 430, y, 9, bold, MUTED);
  y -= 8;
  for (const t of r.tally) {
    ensure(26);
    y -= 12;
    const lead = r.outcome.kind === "WINNER" ? r.outcome.winner.candidate_id === t.candidate_id : r.outcome.kind === "TIE" && r.outcome.tied.some((x) => x.candidate_id === t.candidate_id);
    if (lead) page.drawRectangle({ x: M - 6, y: y - 6, width: W - 2 * M + 12, height: 22, color: rgb(0.93, 0.96, 1) });
    text(page, String(t.rank), M, y, 10, bold);
    text(page, t.display_name, M + 44, y, 10, lead ? bold : font);
    text(page, t.roll_number, M + 280, y, 10);
    text(page, String(t.votes), M + 370, y, 10, bold);
    text(page, `${pct(t.votes, r.totals.valid_ballots)}%`, M + 430, y, 10);
    y -= 10;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE });
  }
  y -= 18;
  ensure(40);
  const outcome =
    r.outcome.kind === "WINNER"
      ? `Elected Class Representative: ${r.outcome.winner.display_name} (${r.outcome.winner.roll_number}) with ${r.outcome.winner.votes} votes.`
      : r.outcome.kind === "TIE"
        ? `TIED RESULT between ${r.outcome.tied.map((t) => t.display_name).join(", ")} (${r.outcome.tied[0].votes} votes each).`
        : "No valid votes were cast.";
  text(page, outcome, M, y, 11, bold, r.outcome.kind === "TIE" ? rgb(0.75, 0.35, 0.05) : NAVY);
  y -= 18;
  if (r.election.result_note) {
    for (const line of wrap(`Committee note: ${r.election.result_note}`, 95)) {
      ensure(14);
      text(page, line, M, y, 9, font, MUTED);
      y -= 13;
    }
  }

  heading("Authorisation");
  kv("Results verified by", verifier ? `${verifier.full_name}${verifier.designation ? `, ${verifier.designation}` : ""}` : "—");
  kv("Verified at", fmtDateTime(r.election.results_verified_at));
  kv("Published by", publisher ? `${publisher.full_name}${publisher.designation ? `, ${publisher.designation}` : ""}` : "—");
  ensure(20);
  text(page, "Tally fingerprint (SHA-256)", M, y, 9, font, MUTED);
  text(page, r.currentHash, M + 150, y, 7.5, font);
  y -= 22;

  if (settings.committee.length) {
    heading("Election committee");
    const colW = (W - 2 * M) / 3;
    settings.committee.forEach((m, i) => {
      const col = i % 3;
      if (col === 0) {
        ensure(60);
        y -= 34;
      }
      const x = M + col * colW;
      page.drawLine({ start: { x, y: y + 12 }, end: { x: x + colW - 20, y: y + 12 }, thickness: 0.6, color: MUTED });
      text(page, m.name, x, y, 9, bold);
      text(page, m.designation, x, y - 11, 8, font, MUTED);
      if (col === 2 || i === settings.committee.length - 1) y -= 16;
    });
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    if (!r.official) {
      p.drawText("PROVISIONAL", { x: 120, y: 300, size: 80, font: bold, color: rgb(0.85, 0.1, 0.1), opacity: 0.08, rotate: degrees(35) });
    }
    p.drawText(safe(`Generated ${fmtDateTime(new Date())} (Asia/Dhaka) · ${settings.batch} CR Election Portal · Page ${i + 1} of ${pages.length}`), {
      x: M, y: 24, size: 7.5, font, color: MUTED,
    });
  });
  return Buffer.from(await pdf.save());
}

function wrap(s: string, n: number) {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > n) {
      lines.push(cur.trim());
      cur = w;
    } else cur += " " + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}
