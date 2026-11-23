/** Mirrors admin_roles.permissions in the database (the DB is authoritative). */
export const PERMISSIONS = [
  "students.read", "students.write", "students.import", "students.export",
  "candidates.read", "candidates.write",
  "elections.read", "elections.configure", "elections.control",
  "results.view", "results.verify", "results.publish", "ballots.read",
  "corrections.read", "corrections.create", "corrections.review",
  "disputes.read", "disputes.manage", "audit.read", "admins.manage", "settings.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_CODES = ["SUPER_ADMIN", "ELECTION_ADMIN", "RESULTS_OFFICER", "AUDITOR"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_LABELS: Record<RoleCode, string> = {
  SUPER_ADMIN: "সুপার অ্যাডমিন",
  ELECTION_ADMIN: "নির্বাচন অ্যাডমিন",
  RESULTS_OFFICER: "ফলাফল কর্মকর্তা",
  AUDITOR: "নিরীক্ষক",
};

export function effectivePermissions(rolePermissions: string[], role: string, canPublish: boolean): Set<Permission> {
  const set = new Set(rolePermissions as Permission[]);
  if (role !== "SUPER_ADMIN" && !canPublish) set.delete("results.publish");
  return set;
}
