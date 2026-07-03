import { formatCents } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, Ticket, Wallet } from "lucide-react";

/**
 * The canonical economics breakdown, shown on show detail pages and again
 * before a creator accepts a booking. Always distinguishes the three
 * numbers — ticket value, temporary hold, creator payment — and never frames
 * the hold as earnings.
 */
export function TermsBreakdown({
  statedTicketValueCents,
  depositPercentage,
  ticketCount,
  authorizationAmountCents,
  creatorPaymentCents,
  className,
}: {
  statedTicketValueCents: number;
  depositPercentage: number;
  ticketCount: number;
  authorizationAmountCents: number;
  creatorPaymentCents: number;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Ticket &amp; hold details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-start justify-between gap-4">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Ticket className="size-4" aria-hidden />
            Stated ticket value
          </span>
          <span className="font-medium">
            {formatCents(statedTicketValueCents)}
            <span className="text-muted-foreground"> / ticket</span>
          </span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <span className="text-muted-foreground">Tickets</span>
          <span className="font-medium">
            {ticketCount} {ticketCount === 2 ? "(you + guest)" : ""}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <span className="text-muted-foreground">Deposit percentage</span>
          <span className="font-medium">{depositPercentage}%</span>
        </div>
        <Separator />
        <div className="flex items-start justify-between gap-4">
          <span className="flex items-center gap-2 font-medium">
            <ShieldCheck className="size-4 text-amber-400" aria-hidden />
            Temporary hold
          </span>
          <span className="font-semibold">{formatCents(authorizationAmountCents)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatCents(statedTicketValueCents)} × {ticketCount} ticket
          {ticketCount > 1 ? "s" : ""} × {depositPercentage}%. This is a temporary card
          hold covering every ticket you request — it is <strong>not</strong> a charge and{" "}
          <strong>not</strong> money you earn. Attend the show and it is released in full.
        </p>
        <Separator />
        <div className="flex items-start justify-between gap-4">
          <span className="flex items-center gap-2 font-medium">
            <Wallet className="size-4 text-emerald-400" aria-hidden />
            Creator payment
          </span>
          <span className="font-semibold text-emerald-300">
            {creatorPaymentCents > 0 ? formatCents(creatorPaymentCents) : "—"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {creatorPaymentCents > 0
            ? "Earned when your content deliverables are completed and approved."
            : "This is an attend-only opportunity with no additional payment."}
        </p>
      </CardContent>
    </Card>
  );
}
