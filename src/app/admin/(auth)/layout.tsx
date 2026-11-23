export const metadata = { title: "কমিটির লগইন", robots: { index: false } };

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="theme-admin dark min-h-dvh">{children}</div>;
}
