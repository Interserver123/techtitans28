import { DisputeForm } from "./dispute-form";
import { DISPUTE_CATEGORIES } from "@/lib/services/disputes";
import { getPublicSettings } from "@/lib/services/settings";

export const metadata = { title: "Help & disputes" };

export default async function HelpPage() {
  const s = await getPublicSettings();
  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">Help desk</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Report a problem</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Your report goes to the Election Committee and is handled manually. Keep your reference number.
        </p>
        <div className="mt-6 space-y-3 text-sm leading-relaxed text-slate-700">
          <p><strong>Identity misuse.</strong> If the portal says you have already voted but you did not, report it here and contact the committee in person with your university ID.
            The committee investigates every case; a report never automatically issues another ballot.</p>
          <p><strong>Code not received.</strong> Wait one minute and request a new code. Check spam folders. If your registered contact is wrong, the committee must correct it.</p>
        </div>
        {(s.contact.email || s.contact.phone || s.contact.office) && (
          <div className="mt-6 rounded-xl border border-line bg-surface p-4 text-sm">
            <p className="font-semibold">Committee contact</p>
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
