export const metadata = { title: "Committee sign-in", robots: { index: false } };

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="theme-admin dark min-h-dvh">{children}</div>;
}
