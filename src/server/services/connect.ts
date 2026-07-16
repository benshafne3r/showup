import "server-only";

import Stripe from "stripe";
import { serverEnv, publicEnv } from "@/lib/env";
import { serviceDb } from "@/server/db/service";
import { log } from "@/server/log";

/**
 * Stripe Connect (Express) for creator payouts. Creators become connected
 * accounts (recipients) that receive Transfers after their content is approved.
 *
 * Separate from the PaymentProvider adapter (which handles the buyer-side card
 * holds): Connect is stripe-only, so everything here no-ops / refuses in mock
 * mode. The UI gates on `payoutsConfigured()` so mock dev/e2e never sees it.
 */

export function payoutsConfigured(): boolean {
  return serverEnv.paymentProvider === "stripe" && serverEnv.stripeSecretKey.startsWith("sk_");
}

let client: Stripe | null = null;
function stripe(): Stripe {
  if (!payoutsConfigured()) {
    throw new Error("Stripe Connect is not configured (PAYMENT_PROVIDER=stripe + STRIPE_SECRET_KEY).");
  }
  client ??= new Stripe(serverEnv.stripeSecretKey);
  return client;
}

export type PayoutStatus = {
  accountId: string | null;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

async function readProfile(userId: string) {
  const { data } = await serviceDb()
    .from("creator_profiles")
    .select("stripe_account_id, stripe_payouts_enabled, stripe_onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/** True once a v2 account's transfers capability is `active`. */
function transfersActive(account: Stripe.V2.Core.Account): boolean {
  return (
    account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ===
    "active"
  );
}

/**
 * Return the creator's connected-account id, creating a v2 `recipient` account
 * on first call. It can only *receive transfers* (`stripe_balance.stripe_transfers`)
 * — never accept card payments. Platform owns fees + losses (separate charges
 * and transfers).
 */
export async function ensureConnectedAccount(userId: string): Promise<string> {
  const profile = await readProfile(userId);
  if (profile?.stripe_account_id) return profile.stripe_account_id;

  const { data: user } = await serviceDb()
    .from("users")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();

  const account = await stripe().v2.core.accounts.create({
    contact_email: user?.email ?? undefined,
    display_name: user?.full_name ?? undefined,
    identity: { country: "US", entity_type: "individual" },
    dashboard: "express",
    defaults: {
      responsibilities: { fees_collector: "application", losses_collector: "application" },
    },
    configuration: {
      // Live Connect requires the merchant `card_payments` capability to be
      // requested alongside recipient `stripe_transfers` (test mode allowed
      // recipient-only). We never charge the creator's account — it exists
      // only to receive payout transfers — but Stripe couples the two.
      merchant: { capabilities: { card_payments: { requested: true } } },
      recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
    },
    metadata: { showup_user_id: userId },
    include: ["configuration.merchant", "configuration.recipient", "requirements"],
  });

  await serviceDb()
    .from("creator_profiles")
    .update({ stripe_account_id: account.id })
    .eq("user_id", userId);

  log.info("Connect account created", { userId, accountId: account.id });
  return account.id;
}

/**
 * A hosted Stripe onboarding link (v2 Account Link). The creator completes KYC
 * on Stripe's pages, then returns to `returnUrl`. Both URLs must be HTTPS — the
 * link fails to create over plain HTTP, so this can't be exercised against a
 * bare `http://localhost`.
 */
export async function createOnboardingLink(userId: string): Promise<string> {
  const accountId = await ensureConnectedAccount(userId);
  const base = publicEnv.appUrl;
  const link = await stripe().v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant", "recipient"],
        return_url: `${base}/creator/payments?onboarding=done`,
        refresh_url: `${base}/creator/payments?onboarding=refresh`,
        collection_options: { fields: "eventually_due" },
      },
    },
  });
  return link.url;
}

/**
 * Retrieve the account from Stripe and persist whether transfers are active.
 * Called after the creator returns from onboarding and from the
 * `v2.core.account…updated` webhook. Idempotent.
 */
export async function syncPayoutStatus(userId: string): Promise<PayoutStatus> {
  const profile = await readProfile(userId);
  if (!profile?.stripe_account_id) {
    return { accountId: null, payoutsEnabled: false, detailsSubmitted: false };
  }
  const account = await stripe().v2.core.accounts.retrieve(profile.stripe_account_id, {
    include: ["configuration.recipient", "requirements"],
  });
  const enabled = transfersActive(account);

  const patch: { stripe_payouts_enabled: boolean; stripe_onboarded_at?: string } = {
    stripe_payouts_enabled: enabled,
  };
  if (enabled && !profile.stripe_onboarded_at) patch.stripe_onboarded_at = new Date().toISOString();
  await serviceDb().from("creator_profiles").update(patch).eq("user_id", userId);

  return {
    accountId: account.id,
    payoutsEnabled: enabled,
    // No outstanding requirements → they finished the form.
    detailsSubmitted: (account.requirements?.summary?.minimum_deadline?.status ?? "") !== "currently_due",
  };
}

/** Persist transfers-enabled from an `account.updated` webhook (account id → creator). */
export async function syncPayoutStatusByAccount(accountId: string): Promise<void> {
  const { data } = await serviceDb()
    .from("creator_profiles")
    .select("user_id")
    .eq("stripe_account_id", accountId)
    .maybeSingle();
  if (data?.user_id) await syncPayoutStatus(data.user_id);
}

/** Current payout status without hitting Stripe (reads our stored flags). */
export async function getStoredPayoutStatus(userId: string): Promise<PayoutStatus> {
  const profile = await readProfile(userId);
  return {
    accountId: profile?.stripe_account_id ?? null,
    payoutsEnabled: profile?.stripe_payouts_enabled ?? false,
    detailsSubmitted: !!profile?.stripe_onboarded_at,
  };
}

/**
 * The destination account for a transfer, or null if the creator can't yet
 * receive one. `payoutCreatorPayment` gates on this.
 */
export async function payoutDestinationFor(userId: string): Promise<string | null> {
  const profile = await readProfile(userId);
  if (profile?.stripe_account_id && profile.stripe_payouts_enabled) return profile.stripe_account_id;
  return null;
}
