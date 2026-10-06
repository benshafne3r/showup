import "server-only";

import Stripe from "stripe";
import { serverEnv, publicEnv } from "@/lib/env";
import { serviceDb } from "@/server/db/service";
import { log } from "@/server/log";

/**
 * Stripe Connect (Express) for creator payouts. Creators become connected
 * accounts (recipients) that receive Transfers after their content is approved.
 * A creator represented by a management company is paid through the agency's
 * connected account instead (a `company` entity), so payees are either a
 * creator or an agency.
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

type Payee = { kind: "creator"; userId: string } | { kind: "agency"; agencyId: string };

type PayoutColumns = {
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean;
  stripe_onboarded_at: string | null;
};
const PAYOUT_COLUMNS = "stripe_account_id, stripe_payouts_enabled, stripe_onboarded_at";

async function readPayee(payee: Payee): Promise<PayoutColumns | null> {
  const db = serviceDb();
  const { data, error } =
    payee.kind === "creator"
      ? await db.from("creator_profiles").select(PAYOUT_COLUMNS).eq("user_id", payee.userId).maybeSingle()
      : await db.from("agencies").select(PAYOUT_COLUMNS).eq("id", payee.agencyId).maybeSingle();
  // A failed read must not look like "no account yet" — that would mint a
  // duplicate connected account on every attempt.
  if (error) throw new Error(`Payout profile read failed: ${error.message}`);
  return data;
}

async function writePayee(payee: Payee, patch: Partial<PayoutColumns>): Promise<void> {
  const db = serviceDb();
  const { error } =
    payee.kind === "creator"
      ? await db.from("creator_profiles").update(patch).eq("user_id", payee.userId)
      : await db.from("agencies").update(patch).eq("id", payee.agencyId);
  if (error) throw new Error(`Payout profile write failed: ${error.message}`);
}

/** True once a v2 account's transfers capability is `active`. */
function transfersActive(account: Stripe.V2.Core.Account): boolean {
  return (
    account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ===
    "active"
  );
}

/** Contact + identity details Stripe pre-fills for the payee's account. */
async function payeeIdentity(payee: Payee) {
  const db = serviceDb();
  if (payee.kind === "creator") {
    const { data: user } = await db
      .from("users")
      .select("email, full_name")
      .eq("id", payee.userId)
      .maybeSingle();
    return {
      email: user?.email,
      displayName: user?.full_name,
      entityType: "individual" as const,
      metadata: { showup_user_id: payee.userId } as Record<string, string>,
    };
  }
  const { data: agency } = await db.from("agencies").select("name").eq("id", payee.agencyId).single();
  const { data: owner } = await db
    .from("agency_members")
    .select("users(email)")
    .eq("agency_id", payee.agencyId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  return {
    email: owner?.users?.email,
    displayName: agency?.name,
    entityType: "company" as const,
    metadata: { showup_agency_id: payee.agencyId } as Record<string, string>,
  };
}

/**
 * Return the payee's connected-account id, creating a v2 `recipient` account
 * on first call. It can only *receive transfers* (`stripe_balance.stripe_transfers`)
 * — never accept card payments. Platform owns fees + losses (separate charges
 * and transfers).
 */
async function ensurePayeeAccount(payee: Payee): Promise<string> {
  const current = await readPayee(payee);
  if (current?.stripe_account_id) return current.stripe_account_id;

  const identity = await payeeIdentity(payee);
  const account = await stripe().v2.core.accounts.create({
    contact_email: identity.email ?? undefined,
    display_name: identity.displayName ?? undefined,
    identity: { country: "US", entity_type: identity.entityType },
    dashboard: "express",
    defaults: {
      responsibilities: { fees_collector: "application", losses_collector: "application" },
    },
    configuration: {
      // Live Connect requires the merchant `card_payments` capability to be
      // requested alongside recipient `stripe_transfers` (test mode allowed
      // recipient-only). We never charge the payee's account — it exists
      // only to receive payout transfers — but Stripe couples the two.
      merchant: { capabilities: { card_payments: { requested: true } } },
      recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
    },
    metadata: identity.metadata,
    include: ["configuration.merchant", "configuration.recipient", "requirements"],
  });

  await writePayee(payee, { stripe_account_id: account.id });
  log.info("Connect account created", { ...identity.metadata, accountId: account.id });
  return account.id;
}

/**
 * A hosted Stripe onboarding link (v2 Account Link). The payee completes KYC
 * on Stripe's pages, then returns to `returnPath`. Both URLs must be HTTPS —
 * the link fails to create over plain HTTP, so this can't be exercised against
 * a bare `http://localhost`.
 */
async function onboardingLinkFor(payee: Payee, returnPath: string): Promise<string> {
  const accountId = await ensurePayeeAccount(payee);
  const base = publicEnv.appUrl;
  const link = await stripe().v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant", "recipient"],
        return_url: `${base}${returnPath}?onboarding=done`,
        refresh_url: `${base}${returnPath}?onboarding=refresh`,
        collection_options: { fields: "eventually_due" },
      },
    },
  });
  return link.url;
}

/**
 * Retrieve the account from Stripe and persist whether transfers are active.
 * Called after the payee returns from onboarding and from the
 * `account.updated` webhook. Idempotent.
 */
async function syncPayee(payee: Payee): Promise<PayoutStatus> {
  const current = await readPayee(payee);
  if (!current?.stripe_account_id) {
    return { accountId: null, payoutsEnabled: false, detailsSubmitted: false };
  }
  const account = await stripe().v2.core.accounts.retrieve(current.stripe_account_id, {
    include: ["configuration.recipient", "requirements"],
  });
  const enabled = transfersActive(account);

  const patch: Partial<PayoutColumns> = { stripe_payouts_enabled: enabled };
  if (enabled && !current.stripe_onboarded_at) patch.stripe_onboarded_at = new Date().toISOString();
  await writePayee(payee, patch);

  return {
    accountId: account.id,
    payoutsEnabled: enabled,
    // No outstanding requirements → they finished the form.
    detailsSubmitted: (account.requirements?.summary?.minimum_deadline?.status ?? "") !== "currently_due",
  };
}

async function storedStatus(payee: Payee): Promise<PayoutStatus> {
  const current = await readPayee(payee);
  return {
    accountId: current?.stripe_account_id ?? null,
    payoutsEnabled: current?.stripe_payouts_enabled ?? false,
    detailsSubmitted: !!current?.stripe_onboarded_at,
  };
}

// ── Creators ────────────────────────────────────────────────────────────

export function createOnboardingLink(userId: string): Promise<string> {
  return onboardingLinkFor({ kind: "creator", userId }, "/creator/payments");
}

export function syncPayoutStatus(userId: string): Promise<PayoutStatus> {
  return syncPayee({ kind: "creator", userId });
}

/** Current payout status without hitting Stripe (reads our stored flags). */
export function getStoredPayoutStatus(userId: string): Promise<PayoutStatus> {
  return storedStatus({ kind: "creator", userId });
}

// ── Management companies ────────────────────────────────────────────────

export function createAgencyOnboardingLink(agencyId: string): Promise<string> {
  return onboardingLinkFor({ kind: "agency", agencyId }, "/manager/payments");
}

export function syncAgencyPayoutStatus(agencyId: string): Promise<PayoutStatus> {
  return syncPayee({ kind: "agency", agencyId });
}

export function getAgencyPayoutStatus(agencyId: string): Promise<PayoutStatus> {
  return storedStatus({ kind: "agency", agencyId });
}

// ── Shared ──────────────────────────────────────────────────────────────

/** Persist transfers-enabled from an `account.updated` webhook (account id → payee). */
export async function syncPayoutStatusByAccount(accountId: string): Promise<void> {
  const db = serviceDb();
  const { data: creator } = await db
    .from("creator_profiles")
    .select("user_id")
    .eq("stripe_account_id", accountId)
    .maybeSingle();
  if (creator?.user_id) {
    await syncPayee({ kind: "creator", userId: creator.user_id });
    return;
  }
  const { data: agency } = await db
    .from("agencies")
    .select("id")
    .eq("stripe_account_id", accountId)
    .maybeSingle();
  if (agency?.id) await syncPayee({ kind: "agency", agencyId: agency.id });
}

/**
 * Where a creator's content payment goes: their management company's account
 * when represented, otherwise their own. `accountId` is null until that payee
 * has finished payout onboarding — `payoutCreatorPayment` gates on it.
 */
export async function payoutDestinationFor(creatorId: string): Promise<{
  accountId: string | null;
  agency: { id: string; name: string } | null;
}> {
  const { data: managed } = await serviceDb()
    .from("agency_creators")
    .select("agency_id, agencies(name)")
    .eq("creator_id", creatorId)
    .maybeSingle();
  const agency = managed ? { id: managed.agency_id, name: managed.agencies?.name ?? "Management" } : null;
  const payee: Payee = agency ? { kind: "agency", agencyId: agency.id } : { kind: "creator", userId: creatorId };
  const current = await readPayee(payee);
  const accountId =
    current?.stripe_account_id && current.stripe_payouts_enabled ? current.stripe_account_id : null;
  return { accountId, agency };
}
