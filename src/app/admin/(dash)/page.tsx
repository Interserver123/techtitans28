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
import { bnNum, fmtDateTime } from "@/lib/format";
import { posLabel } from "@/lib/i18n";

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
      {denied && <Alert tone="warning" className="mb-6" title="প্রবেশাধিকার নেই">আপনার ভূমিকায় ওই অংশে প্রবেশের অনুমতি নেই। চেষ্টাটি অডিট লগে লিপিবদ্ধ হয়েছে।</Alert>}
      <PageHeader
        title={`স্বাগতম, ${admin.fullName.split(" ")[0]}`}
        description={e ? <span className="inline-flex flex-wrap items-center gap-2">{e.title} <ElectionStatusBadge status={e.status} /> · {fmtDateTime(e.opens_at)} – {fmtDateTime(e.closes_at)}</span> : "এখনো কোনো নির্বাচন কনফিগার করা হয়নি।"}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="নিবন্ধিত" value={counts?.total ?? 0} icon={GraduationCap} tone="slate" hint="তালিকাভুক্ত শিক্ষার্থী" />
        <Stat label="যোগ্য" value={turnout?.eligible ?? counts?.eligible ?? 0} icon={Users} hint="সক্রিয়, যোগ্য, এই ব্যাচের" />
        <Stat label="ভোট" value={turnout?.voted ?? 0} icon={UserCheck} tone="green" hint="জমা পড়া ব্যালট" />
        <Stat label="বাকি" value={Math.max(0, (turnout?.eligible ?? 0) - (turnout?.voted ?? 0))} icon={Hourglass} tone="amber" hint="এখনো ভোট দেননি" />
        <Stat label="ভোটার উপস্থিতি" value={`${bnNum(turnout?.turnoutPct ?? 0, (turnout?.turnoutPct ?? 0) % 1 ? 1 : 0)}%`} icon={Percent} hint={<Progress value={turnout?.turnoutPct ?? 0} className="mt-2 h-1.5" />} />
        <Stat label="যাচাই ব্যর্থ" value={failures} icon={AlertOctagon} tone="red" hint="ভুল বা না-পৌঁছানো ওটিপি" />
      </div>

      {!e ? <div className="mt-6"><NoElection /></div> : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader><CardTitle className="text-white">সময়ের সাথে ভোটে অংশগ্রহণ</CardTitle><CardDescription>ঘণ্টাভিত্তিক মোট ব্যালট (বাংলাদেশ সময়)</CardDescription></CardHeader>
            <CardContent><ParticipationChart dark data={timeline.map((t) => ({ bucket: new Date(t.bucket).toISOString(), votes: t.votes, cumulative: t.cumulative }))} /></CardContent>
          </Card>
          {results ? (
            <div className="space-y-6">
              {results.positions.map((pr) => (
                <Card key={pr.position.id}>
                  <CardHeader>
                    <CardTitle className="text-white">{posLabel(pr.position.gender, "bn", true)} {results.official ? "(অফিসিয়াল)" : "(অস্থায়ী)"}</CardTitle>
                    <CardDescription>{bnNum(pr.totals.valid_ballots)}টি বৈধ ভোট · {results.reconciled ? "হিসাব মিলেছে" : "হিসাব মেলেনি"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResultsBarChart dark data={pr.tally.slice(0, 10).map((t) => ({ name: t.display_name, votes: t.votes, lead: t.rank === 1 && t.votes > 0 }))} />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Sealed title={canResults ? "প্রার্থীভিত্তিক ফলাফল সিলগালা" : "আপনার ভূমিকার জন্য ফলাফল উন্মুক্ত নয়"}>
              {canResults ? "ভোটগ্রহণ চলাকালীন শুধু ভোটার উপস্থিতি দেখা যায়। নির্বাচন শেষ হওয়ার পরই প্রার্থীভিত্তিক গণনা সম্ভব।" : undefined}
            </Sealed>
          )}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white"><Activity className="size-4 text-gold" /> সাম্প্রতিক প্রশাসনিক কার্যক্রম</CardTitle>
          <CardDescription>{admin.permissions.has("audit.read") ? "অডিট লগের সর্বশেষ এন্ট্রি" : "আপনার সাম্প্রতিক কাজ"}</CardDescription>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? <p className="text-sm text-slate-500">এখনো কোনো কার্যক্রম নেই।</p> : (
            <ul className="divide-y divide-white/[0.06]">
              {activity.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex items-center gap-2 text-slate-200"><CheckCheck className="size-3.5 text-slate-500" /> <code className="text-xs text-gold-300">{a.action}</code> <span className="text-slate-500">{a.actor_label ?? "সিস্টেম"}</span></span>
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
