import { DisputeForm } from "./dispute-form";
import { DISPUTE_CATEGORIES } from "@/lib/services/disputes";
import { getPublicSettings } from "@/lib/services/settings";

export const metadata = { title: "সহায়তা ও অভিযোগ" };

export default async function HelpPage() {
  const s = await getPublicSettings();
  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">হেল্প ডেস্ক</p>
        <h1 className="font-display mt-2 text-3xl font-bold">সমস্যা জানান</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          আপনার অভিযোগ সরাসরি নির্বাচন কমিটির কাছে যাবে এবং তাঁরা নিজেরা তা দেখবেন। রেফারেন্স নম্বরটি সংরক্ষণ করুন।
        </p>
        <div className="mt-6 space-y-3 text-sm leading-relaxed text-slate-700">
          <p><strong>পরিচয়ের অপব্যবহার।</strong> আপনি ভোট দেননি অথচ পোর্টাল বলছে আপনার ভোট দেওয়া হয়ে গেছে — এমন হলে এখানে জানান এবং বিশ্ববিদ্যালয়ের আইডি কার্ড নিয়ে সরাসরি কমিটির সাথে দেখা করুন।
            কমিটি প্রতিটি ঘটনা তদন্ত করে; অভিযোগ করলেই স্বয়ংক্রিয়ভাবে নতুন ব্যালট দেওয়া হয় না।</p>
          <p><strong>কোড আসেনি।</strong> এক মিনিট অপেক্ষা করে নতুন কোড চান। স্প্যাম ফোল্ডারও দেখুন। নিবন্ধিত ফোন নম্বর বা ইমেইল ভুল থাকলে কমিটিকেই তা সংশোধন করতে হবে।</p>
        </div>
        {(s.contact.email || s.contact.phone || s.contact.office) && (
          <div className="mt-6 rounded-xl border border-line bg-surface p-4 text-sm">
            <p className="font-semibold">কমিটির সাথে যোগাযোগ</p>
            {s.contact.email && <p className="mt-1 text-muted">{s.contact.email}</p>}
            {s.contact.phone && <p className="text-muted">{s.contact.phone}</p>}
            {s.contact.office && <p className="text-muted">{s.contact.office}</p>}
          </div>
        )}
      </div>
      <DisputeForm categories={DISPUTE_CATEGORIES} />
    </div>
  );
}
