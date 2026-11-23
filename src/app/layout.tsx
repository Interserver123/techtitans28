import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
// Bengali faces: only the Bengali subset is loaded, and only when Bengali glyphs appear.
import "@fontsource/hind-siliguri/bengali-400.css";
import "@fontsource/hind-siliguri/bengali-500.css";
import "@fontsource/hind-siliguri/bengali-600.css";
import "@fontsource/hind-siliguri/bengali-700.css";
import "@fontsource-variable/noto-serif-bengali";
import { getLang } from "@/lib/i18n-server";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "CR Election 2026 · TechTitans-28", template: "%s · TechTitans-28 CR Election" },
  description: "Official Class Representative election portal of TechTitans-28, Department of ICT, Islamic University, Bangladesh.",
  robots: { index: true, follow: true },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B1220",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
