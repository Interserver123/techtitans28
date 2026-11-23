"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";

export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="navy" className="flex-1" loading={busy} onClick={async () => { setBusy(true); await api("/api/vote/logout", { method: "POST" }); router.replace("/"); router.refresh(); }}>
      <LogOut /> {label}
    </Button>
  );
}
