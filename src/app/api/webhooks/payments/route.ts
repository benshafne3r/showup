import { NextResponse, type NextRequest } from "next/server";
import { paymentProvider } from "@/server/providers/payment";
import { receiveWebhookEvent } from "@/server/services/webhooks";
import { log, errorFields } from "@/server/log";

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

  try {
    const result = await receiveWebhookEvent(event);
    return NextResponse.json({ received: true, processed: result.processed, duplicate: result.duplicate });
  } catch (err) {
    // Return 500 so the provider retries; the stored event is marked failed
    // and is reprocessed on redelivery (or by the recovery job).
    log.error("Webhook processing failed", { eventId: event.id, ...errorFields(err) });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
