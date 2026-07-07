# Going live — the plain-English runbook

This is the checklist for turning ShowUp from a **demo** (fake money, fake
emails) into a **real** product (real card holds, real emails). It's written to
be followed step by step, even if you don't code.

> **Before this doc:** `docs/DEPLOYMENT.md` covers getting the app *hosted* on
> Railway with the production Supabase database. Do that first. This doc is only
> about switching **payments** and **email** from test mode to live.

## The mental model

The app has two "switches", each an environment variable you set in Railway:

| Switch | Demo value | Live value |
|---|---|---|
| `PAYMENT_PROVIDER` | `mock` | `stripe` |
| `EMAIL_PROVIDER` | `console` | `resend` |

Nothing about real money or real email happens until you flip these. Flipping
them requires accounts and keys from two companies — **Stripe** (card holds and
creator payouts) and **Resend** (email). Everything below is about getting those.

> ⚠️ **Real money warning.** Once payments are live, the app can place holds on
> real customer cards and send real money to creators. Do the whole Stripe
> section on a **test** account first and confirm the golden path end-to-end
> before you ever use live keys.

---

## Part A — Email (Resend). Easiest; do this first.

1. Create an account at **resend.com**.
2. **Verify your sending domain.** Resend walks you through adding a few DNS
   records at your domain registrar. Email won't send reliably until the domain
   shows "Verified". (You can test with Resend's shared domain first, but use
   your own before launch.)
3. Create an **API key** in the Resend dashboard. It starts with `re_`.
4. In Railway → your service → **Variables**, set:
   - `EMAIL_PROVIDER` = `resend`
   - `RESEND_API_KEY` = the `re_...` key
   - `EMAIL_FROM` = `ShowUp <notifications@yourdomain.com>` (must be on the
     verified domain)
5. Redeploy. Trigger any email (e.g. sign up a test creator) and confirm it
   lands in a real inbox.

If anything's wrong, the app **automatically falls back to console mode** (see
`src/server/providers/email/index.ts`), so a missing key won't crash it — emails
just won't send.

6. **Require email verification.** In the Supabase dashboard → Authentication →
   Providers → Email, turn **off** "Confirm email" auto-confirm (a.k.a.
   `mailer_autoconfirm`). New signups will then have to click a confirmation link
   before they get a session — the app already handles this: the sign-up form shows
   a "check your email" panel, and the link routes through `/auth/callback`. Make
   sure `${APP_URL}/auth/callback` is in the redirect allowlist (see the checklist).

---

## Part B — Payments (Stripe). The careful one.

### B1. Set up the Stripe account

1. Create an account at **stripe.com** and complete business verification.
2. ShowUp **pays creators**, which means you need **Stripe Connect** (Express).
   In the Stripe dashboard, enable Connect. Each creator will complete a short
   identity/bank onboarding ("KYC") before they can be paid — Stripe hosts those
   forms. Store each creator's connected-account id on their profile.
   *(This is the biggest piece of work and is required before any payout can go
   out. Budget real time for it.)*
3. Read the **7-item production checklist** in the header comment of
   `src/server/providers/payment/stripe.ts`. It covers card-hold expiry windows,
   manual capture rules, dispute handling, and webhooks. Every item must be
   confirmed against current Stripe docs before real money moves.

### B2. Test with sandbox keys FIRST

The code ships with a safety rail: the Stripe adapter **refuses to start** unless
the key begins with `sk_test_` (see `stripe.ts` line ~43). This is on purpose —
it makes real money impossible until you deliberately remove it.

1. Get your Stripe **test** keys (they start with `sk_test_` and `pk_test_`).
2. Set up a webhook in Stripe pointing at `https://YOUR-APP/api/webhooks/payments`
   and copy its signing secret (starts with `whsec_`).
3. In Railway, set:
   - `PAYMENT_PROVIDER` = `stripe`
   - `STRIPE_SECRET_KEY` = the `sk_test_...` key
   - `STRIPE_WEBHOOK_SECRET` = the `whsec_...` secret
4. Redeploy and run the full flow with **Stripe test cards**: creator requests a
   spot → label approves → hold is placed → attendance approved → hold released /
   payout sent. Watch it all succeed in the Stripe test dashboard.

### B3. PCI — Stripe Elements (already built ✅)

The PCI-safe card form is **done**: `src/app/creator/payments/stripe-card-form.tsx`
uses **Stripe Elements**, so the card number goes straight from the browser to
Stripe and your server only ever receives a `pm_…` token — keeping you in the
lightest PCI tier (SAQ A). It turns on automatically once the Stripe env vars are
set (below); with them unset, the app keeps using the mock/raw form.

Set all four together (test values shown):
- `PAYMENT_PROVIDER=stripe`
- `STRIPE_SECRET_KEY=sk_test_…`
- `STRIPE_WEBHOOK_SECRET=whsec_…`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`

Then go to `/creator/payments` → **Add a card**, enter Stripe test card
`4242 4242 4242 4242`, and confirm it saves. (The full card field + save was not
verifiable in the headless dev preview — check it in a real browser.)

### B4. Only then: go live

Once B1–B3 are done and the test flow is solid:

1. Remove the `sk_test_` safety rail in `src/server/providers/payment/stripe.ts`
   (the `if (!key.startsWith("sk_test_"))` block) — a deliberate, reviewed code
   change. Consider gating it on an explicit `STRIPE_LIVE_OK=true` env var so it
   can't happen by accident.
2. Swap the test keys in Railway for **live** keys (`sk_live_`, `pk_live_`,
   `whsec_` live) and point the webhook at the production URL.
3. Do one **small real transaction** yourself and confirm the hold + release in
   the live Stripe dashboard before announcing anything.

---

## Final pre-launch checklist

- [ ] App hosted on Railway + production Supabase (`docs/DEPLOYMENT.md`)
- [ ] `NEXT_PUBLIC_APP_URL` set to the real domain; that domain added to
      Supabase → Auth → URL config
- [ ] `https://YOUR-DOMAIN/auth/callback` added to Supabase → Auth → URL
      Configuration → **Redirect URLs** (password-reset links fail without it)
- [ ] Email verified and sending (`EMAIL_PROVIDER=resend`)
- [ ] Stripe Connect onboarding live; a test creator completed KYC
- [ ] Full flow passes with Stripe **test** keys
- [ ] Card form moved to Stripe Elements (PCI)
- [ ] `stripe.ts` 7-item checklist confirmed
- [ ] Safety rail removed deliberately; live keys in Railway
- [ ] One real end-to-end transaction verified in the live dashboard
- [ ] `CRON_SECRET` set (scheduled jobs place/release holds — see
      `docs/DEPLOYMENT.md` for the the cron scheduler setup)

When every box is checked, you're live.
