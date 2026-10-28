import { describe, expect, it } from "vitest";
import { paymentProvider } from "@/server/providers/payment";
import { companyDefaultPaymentMethod, finishCardSetup, startCardSetup } from "@/server/services/payments";
import { db } from "./fixtures";

/**
 * Saving cards through a card setup (Stripe SetupIntent): the setup belongs
 * to the person's stored payment customer, a card is only saved once the
 * setup is confirmed, finishing twice saves it once, and nobody can finish
 * someone else's setup.
 */

async function user(email: string) {
  return (await db.from("users").select("id, payment_customer_id").eq("email", email).single()).data!;
}

/** What the browser + Stripe do in between: confirm the setup with a card. */
async function confirmInBrowser(clientSecret: string, customerId: string) {
  const setupIntentId = clientSecret.split("_secret_")[0];
  const card = await paymentProvider().attachPaymentMethod(customerId, {
    cardNumber: "4242424242424242",
    expMonth: 12,
    expYear: new Date().getFullYear() + 2,
    cvc: "123",
  });
  const { data: row } = await db.from("mock_payment_state").select("state").eq("id", setupIntentId).single();
  await db
    .from("mock_payment_state")
    .update({ state: { ...(row!.state as object), status: "succeeded", paymentMethodId: card.providerMethodId } })
    .eq("id", setupIntentId);
  return setupIntentId;
}

describe("saving a card through a card setup", () => {
  it("stores the payment customer once and saves the card only after it's confirmed, once", async () => {
    const zoe = await user("creator.zoe@demo.showup.test");
    const started = await startCardSetup(zoe.id);
    expect(started.ok).toBe(true);
    const customerId = (await user("creator.zoe@demo.showup.test")).payment_customer_id!;
    expect(customerId).toBeTruthy();

    const setupIntentId = (started as { clientSecret: string }).clientSecret.split("_secret_")[0];
    const early = await finishCardSetup(zoe.id, setupIntentId);
    expect(early.ok).toBe(false); // not confirmed by the bank / browser yet

    await confirmInBrowser((started as { clientSecret: string }).clientSecret, customerId);
    const [first, second] = [await finishCardSetup(zoe.id, setupIntentId), await finishCardSetup(zoe.id, setupIntentId)];
    expect(first.ok && second.ok).toBe(true);
    const { data: saved } = await db.from("payment_methods").select("id, is_default, setup_intent_id").eq("setup_intent_id", setupIntentId);
    expect(saved).toHaveLength(1);
    expect(saved![0].is_default).toBe(true);

    // The next setup reuses the stored customer.
    await startCardSetup(zoe.id);
    expect((await user("creator.zoe@demo.showup.test")).payment_customer_id).toBe(customerId);
  });

  it("won't finish someone else's card setup", async () => {
    const mia = await user("creator.mia@demo.showup.test");
    const jay = await user("creator.jay@demo.showup.test");
    const started = (await startCardSetup(mia.id)) as { ok: true; clientSecret: string };
    const miaCustomer = (await user("creator.mia@demo.showup.test")).payment_customer_id!;
    const setupIntentId = await confirmInBrowser(started.clientSecret, miaCustomer);

    const stolen = await finishCardSetup(jay.id, setupIntentId);
    expect(stolen.ok).toBe(false);
    const { count } = await db.from("payment_methods").select("id", { count: "exact", head: true }).eq("setup_intent_id", setupIntentId);
    expect(count).toBe(0);
  });

  it("saves a label's card for the company", async () => {
    const owner = await user("label.owner@demo.showup.test");
    const { data: member } = await db.from("company_members").select("company_id").eq("user_id", owner.id).single();
    const companyId = member!.company_id;
    const before = await companyDefaultPaymentMethod(companyId);

    const started = (await startCardSetup(owner.id, { companyId })) as { ok: true; clientSecret: string };
    const customerId = (await user("label.owner@demo.showup.test")).payment_customer_id!;
    const setupIntentId = await confirmInBrowser(started.clientSecret, customerId);
    expect((await finishCardSetup(owner.id, setupIntentId, { companyId })).ok).toBe(true);

    const card = await companyDefaultPaymentMethod(companyId);
    expect(card?.setup_intent_id).toBe(setupIntentId);
    expect(card?.id).not.toBe(before?.id);
    // The person's own default card is untouched by a company card.
    const { count } = await db
      .from("payment_methods")
      .select("id", { count: "exact", head: true })
      .eq("user_id", owner.id)
      .is("company_id", null)
      .eq("setup_intent_id", setupIntentId);
    expect(count).toBe(0);
    // Put the seeded card back as the default for the other tests.
    if (before) {
      await db.from("payment_methods").update({ is_default: false }).eq("company_id", companyId);
      await db.from("payment_methods").update({ is_default: true }).eq("id", before.id);
    }
  });
});
