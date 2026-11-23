import { Activity, AlertOctagon, CheckCheck, GraduationCap, Hourglass, Percent, UserCheck, Users } from "lucide-react";
import { adminPage } from "@/lib/session";
import { getAdminElections } from "@/lib/admin-context";
import { getTurnout, participationTimeline } from "@/lib/services/elections";
import { getResultSummary } from "@/lib/services/results";
import { listAudit, countAction } from "@/lib/services/audit-read";
import { one, query } from "@/lib/db";
import { PageHeader, Stat, ElectionStatusBadge, Sealed, NoElection } from "@/components/admin/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ParticipationChart, ResultsBarChart } from "@/components/charts";
import { Progress } from "@/components/ui/progress";
import { Alert } from "@/components/ui/alert";
import { fmtDateTime } from "@/lib/format";

export default async function Overview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const admin = await adminPage(null);
  const { denied } = await searchParams;
  const { selected: e } = await getAdminElections();
  const counts = await one<{ total: number; eligible: number }>(
    `select count(*)::int as total,
            count(*) filter (where is_active and is_eligible and batch = setting_text('election.batch','TechTitans-28'))::int as eligible
       from students`,
  );
  const turnout = e ? await getTurnout(e) : null;
  const timeline = e ? await participationTimeline(e.id) : [];
  const failures = e
    ? (await one<{ n: number }>(
        `select count(*)::int as n from audit_logs where action in ('VOTER.OTP_FAILED','VOTER.OTP_DELIVERY_FAILED') and occurred_at >= $1`,
        [e.opens_at],
      ))?.n ?? 0
    : await countAction("VOTER.OTP_FAILED");
  const canResults = admin.permissions.has("results.view");
  const results = e && canResults && ["CLOSED", "RESULTS_PUBLISHED"].includes(e.status) ? await getResultSummary(e.id) : null;
  const activity = admin.permissions.has("audit.read")
    ? await listAudit({ limit: 8 })
    : await query<{ id: string; occurred_at: Date; action: string; actor_label: string | null; entity_type: string | null }>(
        `select id::text, occurred_at, action, actor_label, entity_type from audit_logs where actor_admin_id = $1 order by id desc limit 8`,
        [admin.adminId],
      );

  return (
    <div>
      {denied && <Alert tone="warning" className="mb-6" title="Access denied">Your role does not include that section. The attempt was recorded in the audit log.</Alert>}
      <PageHeader
        title={`Welcome, ${admin.fullName.split(" ")[0]}`}
        description={e ? <span className="inline-flex flex-wrap items-center gap-2">{e.title} <ElectionStatusBadge status={e.status} /> · {fmtDateTime(e.opens_at)} – {fmtDateTime(e.closes_at)}</span> : "No election configured yet."}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Registered" value={counts?.total ?? 0} icon={GraduationCap} tone="slate" hint="Students on register" />
        <Stat label="Eligible" value={turnout?.eligible ?? counts?.eligible ?? 0} icon={Users} hint="Active, eligible, batch" />
        <Stat label="Votes" value={turnout?.voted ?? 0} icon={UserCheck} tone="green" hint="Ballots submitted" />
        <Stat label="Remaining" value={Math.max(0, (turnout?.eligible ?? 0) - (turnout?.voted ?? 0))} icon={Hourglass} tone="amber" hint="Yet to vote" />
        <Stat label="Turnout" value={`${turnout?.turnoutPct ?? 0}%`} icon={Percent} hint={<Progress value={turnout?.turnoutPct ?? 0} className="mt-2 h-1.5" />} />
        <Stat label="Verification failures" value={failures} icon={AlertOctagon} tone="red" hint="Wrong/undelivered OTPs" />
      </div>

      {!e ? <div className="mt-6"><NoElection /></div> : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader><CardTitle className="text-white">Voting participation over time</CardTitle><CardDescription>Cumulative ballots by hour (Asia/Dhaka)</CardDescription></CardHeader>
            <CardContent><ParticipationChart dark data={timeline.map((t) => ({ bucket: new Date(t.bucket).toISOString(), votes: t.votes, cumulative: t.cumulative }))} /></CardContent>
          </Card>
          {results ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-white">Candidate results {results.official ? "(official)" : "(provisional)"}</CardTitle>
                <CardDescription>{results.totals.valid_ballots} valid ballots · {results.reconciled ? "reconciled" : "NOT reconciled"}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResultsBarChart dark data={results.tally.map((t) => ({ name: t.display_name, votes: t.votes, lead: t.rank === 1 && t.votes > 0 }))} />
              </CardContent>
            </Card>
          ) : (
            <Sealed title={canResults ? "Candidate results sealed" : "Results not available for your role"}>
              {canResults ? "Turnout is visible while voting is open. Candidate-wise counts become computable only after the election is closed." : undefined}
            </Sealed>
          )}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white"><Activity className="size-4 text-blue-400" /> Recent administrative activity</CardTitle>
          <CardDescription>{admin.permissions.has("audit.read") ? "Latest audit log entries" : "Your recent actions"}</CardDescription>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? <p className="text-sm text-slate-500">No activity yet.</p> : (
            <ul className="divide-y divide-white/[0.06]">
              {activity.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex items-center gap-2 text-slate-200"><CheckCheck className="size-3.5 text-slate-500" /> <code className="text-xs text-blue-300">{a.action}</code> <span className="text-slate-500">{a.actor_label ?? "system"}</span></span>
                  <span className="text-xs text-slate-500">{fmtDateTime(a.occurred_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
