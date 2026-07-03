import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Placeholder — not legal advice.</p>
      <div className="mt-8 space-y-4 text-sm text-muted-foreground">
        <p>
          These placeholder terms describe the intended mechanics of {BRAND.name} and must be
          replaced by counsel-reviewed terms before public launch.
        </p>
        <p>
          <strong className="text-foreground">Temporary authorizations.</strong> When a creator accepts
          an opportunity, they authorize a temporary hold on their payment method equal to the
          stated ticket value × tickets requested × the deposit percentage selected by the
          organizer. The hold applies to every requested ticket, including guest tickets. Verified
          attendance releases the hold in full. An unexcused no-show may result in the hold being
          captured.
        </p>
        <p>
          <strong className="text-foreground">Creator payments.</strong> Organizers may offer a fixed
          payment for completed, approved content deliverables. The hold is not compensation;
          only the creator payment constitutes earnings.
        </p>
        <p>
          <strong className="text-foreground">Disputes.</strong> Either party may open a dispute on a
          booking. Money movement pauses until a platform administrator resolves it.
        </p>
      </div>
    </div>
  );
}
