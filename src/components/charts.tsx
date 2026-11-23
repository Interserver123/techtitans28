"use client";
import { bnNum } from "@/lib/format";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const fmtHour = (iso: string) =>
  new Intl.DateTimeFormat("bn-BD", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: true, day: "2-digit", month: "short" }).format(new Date(iso)).replace(/\bAM\b/, "পূর্বাহ্ণ").replace(/\bPM\b/, "অপরাহ্ণ");

export function ParticipationChart({ data, dark = false }: { data: { bucket: string; votes: number; cumulative: number }[]; dark?: boolean }) {
  if (!data.length) return <p className="py-12 text-center text-sm text-slate-500">এখনো কোনো ব্যালট জমা পড়েনি।</p>;
  const axis = dark ? "#64748b" : "#94a3b8";
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="partFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f7a4f" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#0f7a4f" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={dark ? "rgba(255,255,255,0.06)" : "#e2e8f0"} vertical={false} />
          <XAxis dataKey="bucket" tickFormatter={fmtHour} tick={{ fontSize: 11, fill: axis }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tickFormatter={(v) => bnNum(Number(v))} tick={{ fontSize: 11, fill: axis }} tickLine={false} axisLine={false} />
          <Tooltip
            labelFormatter={(v) => fmtHour(String(v))}
            contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, background: dark ? "#111a2e" : "#fff", color: dark ? "#e2e8f0" : "#0f172a" }}
            formatter={(v, n) => [bnNum(Number(v)), n === "cumulative" ? "মোট ব্যালট" : "এই ঘণ্টার ব্যালট"]}
          />
          <Area type="monotone" dataKey="cumulative" stroke="#0f7a4f" strokeWidth={2.5} fill="url(#partFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ResultsBarChart({ data, dark = false }: { data: { name: string; votes: number; lead: boolean }[]; dark?: boolean }) {
  const axis = dark ? "#94a3b8" : "#475569";
  return (
    <div className="w-full" style={{ height: Math.max(160, data.length * 56) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: axis }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v) => [bnNum(Number(v)), "ভোট"]} cursor={{ fill: dark ? "rgba(255,255,255,0.04)" : "#f1f5f9" }} contentStyle={{ borderRadius: 12, fontSize: 12, background: dark ? "#111a2e" : "#fff", border: "1px solid #e2e8f0" }} />
          <Bar dataKey="votes" radius={[0, 8, 8, 0]} barSize={26} label={{ position: "right", fontSize: 12, fill: axis, formatter: (v: unknown) => bnNum(Number(v)) }}>
            {data.map((d) => <Cell key={d.name} fill={d.lead ? "#c9a24a" : dark ? "#334155" : "#cbd5e1"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
