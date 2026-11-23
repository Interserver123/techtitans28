import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("backup and recovery", () => {
  it("a pg_dump backup restores into a fresh database and reconciles", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tt-backup-"));
    try {
      const env = { ...process.env, BACKUP_DATABASE_URL: process.env.TEST_OWNER_URL!, PG_ADMIN_URL: (process.env.TEST_OWNER_URL ?? "").replace(/\/[^/]+$/, "") };
      const file = execFileSync("bash", ["scripts/backup.sh", dir], { env, encoding: "utf8" }).trim().split("\n").pop()!;
      const out = execFileSync("bash", ["scripts/verify-backup.sh", file], { env, encoding: "utf8" });
      expect(out).toContain("OK: backup restores cleanly and reconciles");
      expect(out).toMatch(/\d+ ballots/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
