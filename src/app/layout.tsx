import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/noto-sans-bengali";
import "@fontsource-variable/noto-serif-bengali";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "সিআর নির্বাচন ২০২৬ · টেকটাইটানস-২৮", template: "%s · টেকটাইটানস-২৮ সিআর নির্বাচন" },
  description: "টেকটাইটানস-২৮, তথ্য ও যোগাযোগ প্রযুক্তি বিভাগ, ইসলামী বিশ্ববিদ্যালয়, বাংলাদেশ-এর ক্লাস রিপ্রেজেন্টেটিভ নির্বাচনের অফিসিয়াল পোর্টাল।",
  robots: { index: true, follow: true },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B1220",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="bn">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
