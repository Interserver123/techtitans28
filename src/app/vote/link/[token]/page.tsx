import { redirect } from "next/navigation";
import { voterFromCookies } from "@/lib/session";
import { getDict } from "@/lib/i18n-server";
import { LinkLogin } from "./link-login";

export const metadata = { title: "Personal voting link", robots: { index: false, follow: false } };

export default async function LinkPage({ params }: { params: Promise<{ token: string }> }) {
  const s = await voterFromCookies();
  if (s) redirect(s.hasVoted ? "/vote/receipt" : "/vote/ballot");
  const { token } = await params;
  const { lang } = await getDict();
  return <LinkLogin token={token} lang={lang} />;
}
