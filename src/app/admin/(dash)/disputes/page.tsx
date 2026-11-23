import { adminPage } from "@/lib/session";
import { listDisputes, DISPUTE_CATEGORIES } from "@/lib/services/disputes";
import { PageHeader, Empty } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { fmtDateTime } from "@/lib/format";
import { DisputeAction } from "./client";

export default async function DisputesPage() {
  const admin = await adminPage("disputes.read");
  const rows = await listDisputes();
  const tone = { OPEN: "amber", UNDER_REVIEW: "blue", RESOLVED: "green", REJECTED: "neutral" } as const;
  return (
    <div>
      <PageHeader title="অভিযোগ ও সহায়তার অনুরোধ" description="পাবলিক সহায়তা পাতা থেকে জমা পড়া অভিযোগ।" />
      <Alert tone="warning" className="mb-4" title="কমিটির সহায়তায় পরিচালিত প্রক্রিয়া">
        অভিযোগ নিষ্পত্তি করলে কোনো শিক্ষার্থীর জন্য ভোট আবার খোলে না বা নতুন ব্যালট দেওয়া হয় না। পরিচয়ের অপব্যবহারের ঘটনা সরাসরি তদন্ত করতে হবে;
        নির্বাচন শেষে জাল ব্যালট নিশ্চিত হলে সংশোধনের অনুরোধ (দুইজনের অনুমোদন) ব্যবহার করুন।
      </Alert>
      {rows.length === 0 ? <Empty>কোনো অভিযোগ জমা পড়েনি।</Empty> : (
        <div className="grid gap-3">
          {rows.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-sm font-semibold text-gold-300">{d.reference}</code>
                    <Badge tone={tone[d.status as keyof typeof tone] ?? "neutral"}>{({ OPEN: "নতুন", UNDER_REVIEW: "পর্যালোচনাধীন", RESOLVED: "নিষ্পন্ন", REJECTED: "প্রত্যাখ্যাত" } as Record<string, string>)[d.status] ?? d.status}</Badge>
                    <Badge tone={d.category === "IDENTITY_MISUSE" ? "red" : "neutral"}>{DISPUTE_CATEGORIES[d.category as keyof typeof DISPUTE_CATEGORIES]}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-200">{d.description}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {d.reporter_name} · {d.reporter_contact} · রোল {d.roll_number ?? "—"}
                    {d.student_name && <> · তালিকায়: {d.student_name} · {d.has_voted ? "অংশগ্রহণ লিপিবদ্ধ" : "ভোট দেননি"}</>} · {fmtDateTime(d.created_at)}
                  </p>
                  {d.resolution_note && <p className="mt-2 text-xs text-slate-400">সিদ্ধান্ত ({d.handled_by_name}): {d.resolution_note}</p>}
                </div>
                {admin.permissions.has("disputes.manage") && !["RESOLVED", "REJECTED"].includes(d.status) && <DisputeAction id={d.id} />}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
