# ShowUp — Security Model

## Layers

1. **Supabase Auth** — email/password sessions via `@supabase/ssr` cookies. Role (`creator`/`label`/`admin`) lives in `public.users.role`, written by a `SECURITY DEFINER` trigger at signup from vetted metadata; `admin` can never be self-assigned (trigger whitelist + RLS deny).
2. **Route-group middleware** — `/creator/*`, `/label/*`, `/admin/*` require a session; role mismatches redirect. Middleware is a convenience layer only, never the authority.
3. **Server-side authorization (the authority)** — every server action / route handler resolves the session server-side and calls `requireUser()` / `requireCreator()` / `requireCompanyRole(companyId, minRole)` / `requireAdmin()` from `src/server/auth/guards.ts` before doing anything. All mutations validate input with Zod.
4. **Postgres RLS (defense in depth)** — every table has RLS enabled. The browser client only ever holds the anon key. The service-role key exists only in server-side service code (never imported into anything reachable by client bundles; enforced by `server-only` package imports).

## RLS policy summary

| Table group | creator | company member | admin |
|---|---|---|---|
| own `users` row / profile / socials / payment methods / notifications | read+write own | — | read all |
| companies/members/invites/artists/tours/venues/shows/opportunities | read published catalog | read+write own company | all |
| requests / bookings / tickets / money records / submissions | own rows | rows for their company's shows | all |
| message threads / messages | participant | participant (company) | all |
| disputes | own bookings | company bookings | all |
| audit_logs | — | — | read (insert via service only) |
| platform_settings | read (public config) | read | read+write |

Sensitive transitions (approve, capture, release, payout, inventory, verification) are **not** granted via RLS insert/update for regular users — they run through service-role code after explicit guard checks, so a malicious client with the anon key cannot mutate money or inventory even if it crafts raw PostgREST calls.

## The five never-from-client rules

Client requests alone can never:
1. Approve attendance → `services/attendance.approve` requires company role for the show's company (or admin), status-guarded.
2. Capture an authorization → `services/payments.capture` requires company/admin + `authorized` status + idempotency key.
3. Release a payout → `services/payments.payoutCreator` requires company/admin + approved content + unique key.
4. Change ticket inventory → only inside `services/requests.approve` / `services/bookings.cancel` transactions.
5. Grant admin → no code path writes `role='admin'` except a documented SQL statement run by an operator.

## Additional controls

- **Rate limiting** — fixed-window limiter (Postgres-backed, `rate_limits` table) on sign-in, sign-up, request submission, messaging, and payment-method updates. Configurable per action.
- **Audit logs** — append-only rows for approvals, rejections, cancellations, attendance decisions, content decisions, authorization schedule/place/release/capture, payouts, disputes, admin overrides, settings changes. Written inside the same service call that performs the action.
- **Idempotency & race safety** — see `docs/PAYMENT_FLOW.md`: unique idempotency keys + status-guarded single-row UPDATE claims.
- **Webhooks** — `/api/webhooks/payments` verifies HMAC (mock) / Stripe signatures on the raw body, dedupes by event id, ignores unknown events.
- **File uploads** — private Storage buckets; server-issued signed upload URLs scoped to `{userId}/...` paths; MIME allowlist (jpeg/png/webp/pdf) + 10 MB size cap enforced in validation and bucket config; downloads via short-lived signed URLs issued only after a permission check.
- **PII** — personal emails/phones never rendered to counterparties; messaging is in-app; profiles expose display name, city, and social handles only.
- **Secrets** — only `NEXT_PUBLIC_*` values reach the browser (Supabase URL + anon key). Service role key, cron secret, webhook secrets, provider keys are server-only env vars; `.env.example` documents them; `.env*` is gitignored.
- **Canceled/postponed shows** — cancellation is a single service transaction: cancel bookings, cancel scheduled auths, release active holds, notify, audit. Postponement recalculates authorization schedules.
- **Payments safety rails** — Stripe adapter refuses non-`sk_test_` keys in this MVP; mock provider clearly labeled "TEST MODE" in every UI money surface.

## Threats explicitly considered

- Cross-company data access → RLS + `requireCompanyRole` on every query path; permission integration tests assert 403/empty results.
- Double-approve / double-capture / double-payout race → status-guarded claims + unique idempotency keys (unit-tested).
- Inventory oversell → guarded `tickets_claimed` update inside approval transaction.
- Forged webhooks → signature verification + event dedupe.
- Client-forged terms → all economics snapshot server-side from the opportunity row; client sends only ids/choices.
- Suspended accounts → guards check `users.status='active'` on every sensitive action.
