"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { useAction } from "@/components/admin/use-action";

/** Welcome message every voter sees on the page after voting. {name} = voter's name, {roll} = roll number. */
export function WelcomeForm({ initial, defaultText }: { initial: string; defaultText: string }) {
  const [msg, setMsg] = useState(initial);
  const { run, busy, error } = useAction();
  return (
    <Card className="p-5">
      <p className="font-semibold text-white">ভোট শেষে স্বাগত বার্তা</p>
      <p className="mt-1 text-xs text-slate-500">ভোট দেওয়ার পর প্রত্যেক ভোটার এই বার্তাটি দেখবেন। <code>{"{name}"}</code> লিখলে ভোটারের নাম এবং <code>{"{roll}"}</code> লিখলে রোল নম্বর বসে যাবে। ফাঁকা রাখলে ডিফল্ট বার্তা দেখাবে।</p>
      <form className="mt-4 space-y-3" onSubmit={async (e) => { e.preventDefault(); await run("/api/admin/settings/welcome", { method: "PUT", json: { message: msg } }, "স্বাগত বার্তা সংরক্ষিত হয়েছে"); }}>
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={600} rows={4} placeholder={defaultText}
          className="w-full rounded-xl border border-line bg-transparent p-3 text-sm text-white outline-none focus:border-gold" aria-label="স্বাগত বার্তা" />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="rounded-xl border border-gold/30 bg-white/5 p-3">
          <p className="text-[11px] font-semibold text-slate-400">প্রিভিউ (নমুনা নাম ও রোল দিয়ে)</p>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-100">{(msg.trim() || defaultText).replace(/\{name\}/gi, "রাহিম আহমেদ").replace(/\{roll\}/gi, "2518001")}</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">{msg.length}/600</span>
          <Button type="submit" loading={busy}>বার্তা সংরক্ষণ করুন</Button>
        </div>
      </form>
    </Card>
  );
}
