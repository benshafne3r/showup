import { NextResponse, type NextRequest } from "next/server";
import { paymentProvider } from "@/server/providers/payment";
import { handleWebhookEvent } from "@/server/services/payments";

export const dynamic = "force-dynamic";

/**
 * Payment provider webhooks. The signature is verified against the raw body
 * before anything is trusted; events are deduplicated by id downstream.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-mock-signature") ?? request.headers.get("stripe-signature");

  const event = await paymentProvider().verifyWebhook(rawBody, signature);
  if (!event) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const result = await handleWebhookEvent(event);
  return NextResponse.json({ received: true, processed: result.processed });
}
