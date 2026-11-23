import { ReceiptVerifier } from "./verifier";

export const metadata = { title: "রসিদ যাচাই" };

export default function VerifyReceiptPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">রসিদ যাচাই</p>
      <h1 className="font-display mt-2 text-3xl font-bold">আপনার ব্যালটের রসিদ যাচাই করুন</h1>
      <p className="mt-2 text-[15px] text-muted">
        ভোট দেওয়ার পর যে রসিদ আইডি পেয়েছেন, সেটি লিখুন। এই রসিদের বিপরীতে ব্যালট জমা পড়েছে কি না এবং কখন, তা আমরা নিশ্চিত করব। রসিদে কখনোই আপনি কাকে ভোট দিয়েছেন তা প্রকাশ পায় না, আপনার পরিচয়ও না।
      </p>
      <ReceiptVerifier />
    </div>
  );
}
