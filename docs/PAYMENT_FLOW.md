# ShowUp — Payment Flow

## Design constraints (why it works this way)

The product promise: **the creator is never charged upfront**; a temporary card hold encourages attendance. Real-world card rails impose constraints that shape the design:

| Constraint (Stripe / card networks, to be re-verified at production integration time) | Design consequence |
|---|---|
| A standard card authorization is only valid ~7 days (extended auth: up to 31 days, only on some networks/merchant categories, requires eligibility) | We **cannot** hold at booking time for a show months away. The hold is **scheduled** for N days before the show (default 5, admin-configurable). |
| Reauthorization / incremental auth support varies by network | We keep an `attempt_count` + fresh `idempotency_key` per attempt and design so a failed/expired hold can be re-placed while the booking stays confirmed. |
| Capturing requires an active authorization; partial capture allowed | Capture (no-show penalty) is only offered while status = `authorized`; the platform never "re-charges" without an active hold in MVP. |
| Releasing = canceling the PaymentIntent / letting it expire | Explicit release call on attendance approval; release is idempotent. |
| Marketplace payouts require Stripe Connect (connected accounts, KYC) | Creator payouts flow through the provider abstraction (`payout()`); the mock models it; the Stripe adapter documents Connect Express as the production path. |
| Disputes/refunds happen out-of-band | Webhooks update our records; `disputed` states freeze automated money movement. |

> **Before real payments ship:** re-verify Stripe's current rules for auth duration, extended authorizations, reauthorization, network restrictions, manual capture, Connect payouts, and dispute flows. This is written into the Stripe adapter as a checklist.

## The provider abstraction

`src/server/providers/payment/types.ts` defines the interface every provider implements:

```ts
interface PaymentProvider {
  name: 'mock' | 'stripe'
  createSetupSession(userId, opts): Promise<{ methodDraftId }>
  attachPaymentMethod(userId, input): Promise<PaymentMethodInfo>   // tokenized, verified
  authorize(input: { methodId, amountCents, idempotencyKey, metadata }): Promise<AuthorizationResult>
  release(input: { intentId, idempotencyKey }): Promise<ReleaseResult>
  capture(input: { intentId, amountCents, idempotencyKey }): Promise<CaptureResult>
  payout(input: { userId, amountCents, idempotencyKey, metadata }): Promise<PayoutResult>
  verifyWebhook(rawBody, signature): WebhookEvent | null            // signature check
}
```

- **MockPaymentProvider** (default when `PAYMENT_PROVIDER=mock`): fully functional in-process provider. Persists provider-side objects in the `mock_payment_state` table, simulates verification, authorization success/failure (magic card numbers: `4000000000000002` always declines — mirrors Stripe test cards), emits signed webhooks (HMAC-SHA256 with `MOCK_WEBHOOK_SECRET`) against `/api/webhooks/payments` so the production code path is exercised end-to-end.
- **StripePaymentProvider**: same interface; implemented against Stripe test mode (`manual` capture PaymentIntents, SetupIntents for saving cards, Connect transfers for payouts). Activates only when `PAYMENT_PROVIDER=stripe` and `STRIPE_SECRET_KEY` is a `sk_test_...` key (guard refuses live keys in this MVP).

UI code never touches a provider; only `src/server/services/payments.ts` does.

## Lifecycle

```
approval                    acceptance                    T-5 days             show day              post-show
   │                            │                             │                    │                     │
booking:awaiting_acceptance → creator reviews terms       cron places hold     creator checks in     content submitted
authorization:not_scheduled   adds payment method         authorization:       attendance approved   content approved
                              accepts terms       ──────▶  pending→authorized ─▶ release hold    ──▶  payout creator
                              booking:confirmed            (or failed→grace)    booking:attended      booking:completed
                              authorization:scheduled
```

1. **Approve** → booking `awaiting_acceptance` with terms snapshot (`authorization_amount_cents = value × tickets × pct`, one pure function in `src/lib/money.ts`).
2. **Accept** → three-step flow: review terms (full hold math shown again) → add payment method (provider verifies) → explicit consent checkbox (stores `terms_accepted_at`, `terms_version`, amount). Booking → `confirmed`; `authorization_records` row created `scheduled` with `scheduled_for = show_date − authorization_window_days` (immediate if already inside the window).
3. **Cron** (`/api/cron/run`, `CRON_SECRET`-protected, cron-scheduler compatible; also manually runnable by admin):
   - expires overdue `awaiting_acceptance` bookings (also lazily expired on read),
   - places due authorizations (status-guarded claim: `UPDATE ... SET status='pending' WHERE status='scheduled'` → provider call → `authorized` or `failed`),
   - handles grace-period expiry (cancel booking, release inventory),
   - sends approval-expiring / upcoming-show / content-deadline reminders.
4. **Authorization failed** → booking `authorization_failed`, creator notified with `grace_deadline_at = min(now + grace_days, show_date)`. Creator updates card → service retries with a **new** idempotency key. Unresolved → booking `canceled`, inventory released.
5. **Attendance approved** → `release()` hold (idempotent), authorization `released`, booking `attended` (or `completed` when no content required).
6. **No-show** → booking `no_show_review`; label may **capture** (full amount in MVP) or excuse (release). Both admin-overridable; disputes freeze it.
7. **Content approved** → `payout()` creator payment (idempotent), record `paid`, booking `completed`.

## Idempotency & race protection

- Every provider mutation carries a deterministic idempotency key (`auth:{bookingId}:attempt{n}`, `release:{authId}`, `capture:{authId}`, `payout:{bookingId}`) stored `UNIQUE` on the money record.
- State transitions are claimed with status-guarded single-row UPDATEs; affected-rows≠1 → abort (someone else already did it). This prevents duplicate approvals, double capture, and double payout even under concurrent requests.
- Webhooks are verified (HMAC/Stripe signature), deduplicated by event id (`webhook_events` table), and only *advance* state (never regress).

## Money display rules

- `stated ticket value` — what the label says a ticket is worth (per ticket).
- `temporary hold` — value × tickets × pct. **Never** presented as creator earnings; copy always says it is released when they attend.
- `creator payment` — the only number ever labeled as earnings.
