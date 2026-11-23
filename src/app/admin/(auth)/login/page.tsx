import { AdminLogin } from "./login-form";
import { Brand } from "@/components/site/brand";
import { ShieldCheck } from "lucide-react";

export default function AdminLoginPage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div className="bg-grid absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" aria-hidden />
      <div className="absolute left-1/2 top-0 h-80 w-[640px] -translate-x-1/2 rounded-full bg-electric/20 blur-[110px]" aria-hidden />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center"><Brand dark /></div>
        <div className="glass rounded-3xl bg-navy-800/80 p-6 sm:p-8">
          <AdminLogin />
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="size-3.5" /> Restricted to authorised Election Committee members. All access is audited.
        </p>
      </div>
    </div>
  );
}
