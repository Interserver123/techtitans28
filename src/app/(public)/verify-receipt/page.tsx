import { ReceiptVerifier } from "./verifier";

export const metadata = { title: "Verify a receipt" };

export default function VerifyReceiptPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">Receipt check</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Verify your ballot receipt</h1>
      <p className="mt-2 text-[15px] text-muted">
        Enter the receipt ID you received after voting. We confirm that a ballot was recorded for it and when. Receipts never reveal
        who you voted for, and do not identify you.
      </p>
      <ReceiptVerifier />
    </div>
  );
}
