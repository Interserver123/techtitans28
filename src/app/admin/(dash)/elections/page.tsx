import { adminPage } from "@/lib/session";
import { listElections } from "@/lib/services/elections";
import { query } from "@/lib/db";
import { PageHeader, Empty } from "@/components/admin/ui";
import { ElectionForm, ElectionCard } from "./client";

export default async function ElectionsPage() {
  const admin = await adminPage("elections.read");
  const elections = await listElections();
  const stats = await query<{ election_id: string; approved: number; votes: number }>(
    `select e.id as election_id,
            (select count(*)::int from candidates c where c.election_id = e.id and c.status = 'APPROVED') as approved,
            (select count(*)::int from voter_participation p where p.election_id = e.id) as votes
       from elections e`,
  );
  const byId = new Map(stats.map((s) => [s.election_id, s]));
  const canConfigure = admin.permissions.has("elections.configure");
  const canControl = admin.permissions.has("elections.control");
  return (
    <div>
      <PageHeader title="নির্বাচন" description="সময়সূচি নির্ধারণ করুন এবং নির্বাচনের প্রতিটি ধাপ নিয়ন্ত্রণ করুন। প্রতিটি অবস্থা-পরিবর্তন ডেটাবেসে কার্যকর ও অডিট করা হয়।" actions={canConfigure && <ElectionForm />} />
      {elections.length === 0 ? <Empty>এখনো কোনো নির্বাচন নেই।{canConfigure && " শুরু করতে সিআর নির্বাচন তৈরি করুন।"}</Empty> : (
        <div className="grid gap-4">
          {elections.map((e) => (
            <ElectionCard key={e.id} canConfigure={canConfigure} canControl={canControl}
              election={{ id: e.id, title: e.title, description: e.description, status: e.status, opensAt: new Date(e.opens_at).toISOString(), closesAt: new Date(e.closes_at).toISOString(),
                openedAt: e.opened_at ? new Date(e.opened_at).toISOString() : null, closedAt: e.closed_at ? new Date(e.closed_at).toISOString() : null,
                publishedAt: e.results_published_at ? new Date(e.results_published_at).toISOString() : null,
                approved: byId.get(e.id)?.approved ?? 0, votes: byId.get(e.id)?.votes ?? 0 }} />
          ))}
        </div>
      )}
    </div>
  );
}
