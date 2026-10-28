// Checks the Stripe card-setup adapter against Stripe TEST mode (needs a
// working sk_test_ key in STRIPE_SECRET_KEY):
//   npx tsx --conditions=react-server scripts/check-stripe-card-setup.ts
import { config } from "dotenv";
config({ path: ".env.local" });
import Stripe from "stripe";
import { randomUUID } from "node:crypto";

async function main() {
  if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) throw new Error("test key required");
  const { StripePaymentProvider } = await import("../src/server/providers/payment/stripe");
  const p = new StripePaymentProvider();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const userA = `check-${randomUUID()}`;
  const userB = `check-${randomUUID()}`;
  const custA = await p.ensureCustomer(userA, null);
  const custA2 = await p.ensureCustomer(userA, null); // idempotent create / search
  const custB = await p.ensureCustomer(userB, null);
  console.log("customer reused:", custA === custA2);

  // 1. Plain card: confirm, finish, then an off-session hold works.
  const s1 = await p.startCardSetup(custA, { showup_user_id: userA });
  await stripe.setupIntents.confirm(s1.setupIntentId, { payment_method: "pm_card_visa" });
  const f1 = await p.finishCardSetup(custA, s1.setupIntentId);
  console.log("plain card saved:", f1.verified, f1.brand, f1.last4);
  const hold = await p.authorize({ providerMethodId: f1.providerMethodId, amountCents: 1000, idempotencyKey: `check:${randomUUID()}`, metadata: {} });
  console.log("off-session hold:", hold.ok);
  if (hold.ok) await p.release({ providerIntentId: hold.providerIntentId, idempotencyKey: `check:${randomUUID()}` });

  // 2. Someone else's setup can't be finished.
  const stolen = await p.finishCardSetup(custB, s1.setupIntentId);
  console.log("other customer refused:", !stolen.verified, "-", stolen.failureReason);

  // 3. A card whose bank wants confirmation: not saved until confirmed.
  const s2 = await p.startCardSetup(custA, { showup_user_id: userA });
  const confirmed = await stripe.setupIntents.confirm(s2.setupIntentId, { payment_method: "pm_card_authenticationRequiredSetupForOffSession", return_url: "https://example.com" });
  console.log("3DS card status after confirm:", confirmed.status);
  const f2 = await p.finishCardSetup(custA, s2.setupIntentId);
  console.log("3DS card refused until confirmed:", !f2.verified, "-", f2.failureReason);

  await stripe.customers.del(custA);
  await stripe.customers.del(custB);
  console.log("cleaned up test customers");
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
