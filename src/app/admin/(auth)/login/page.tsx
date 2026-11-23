import Image from "next/image";
import { AdminLogin } from "./login-form";
import { Brand } from "@/components/site/brand";
import { ShieldCheck } from "lucide-react";

export default function AdminLoginPage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <Image src="/campus/aerial.jpg" alt="" fill priority sizes="100vw" className="object-cover opacity-40" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-b from-navy/85 via-navy/80 to-navy" aria-hidden />
      <div className="absolute left-1/2 top-0 h-80 w-[640px] -translate-x-1/2 rounded-full bg-gold/15 blur-[110px]" aria-hidden />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center"><Brand dark /></div>
        <div className="rounded-2xl border border-gold/30 bg-navy-800/90 p-6 shadow-2xl backdrop-blur sm:p-8">
          <AdminLogin />
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="size-3.5" /> শুধু অনুমোদিত নির্বাচন কমিটির সদস্যদের জন্য। প্রতিটি প্রবেশ অডিট করা হয়।
        </p>
      </div>
    </div>
  );
}
