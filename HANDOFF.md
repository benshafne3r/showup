# HANDOFF — ShowUp (CreatorTickets Platform)

_Last updated: 2026-07-06_

## Current state
ShowUp is a marketplace where music labels offer free concert tickets to creators
in exchange for attendance + optional social content (the creator's card gets a
temporary hold, released on verified attendance; content earns a fixed payment).
All build phases are done and committed. The app runs end-to-end on demo data with
mock payments/email. Branding is an indify-style **red** theme, a flat ticket
**logo** (`src/components/logo.tsx`), no "test mode" banner. Tests: Vitest **39** unit
green; Playwright e2e covers the golden path + admin dispute + permissions.

## Production-readiness pass — in progress (this session)
Working the pass in order: security → integrations → resilience.
- **Security audit: PASS.** Reviewed RLS (all 30 tables, policies correct not just
  present), service-role isolation (`server-only`), every server action guards on
  line 1, cross-company IDOR closed (`company_id` server-derived + `.eq`-scoped),
  all 6 rate limits enforced (service layer), webhook sig+dedupe, clean env split.
  Supabase advisors: 3 WARN + 3 INFO, all consciously accepted in migration `0004`.
  No real vulns found. Optional nit: add `import "server-only"` to `src/lib/env.ts`.
- **Integrations: code-complete, blocked on external setup.** Stripe (207-line
  adapter) + Resend adapters are done and env-selected. Going live needs live keys,
  Stripe Connect KYC, and removing the `sk_test_` rail — none are code. Written up
  step-by-step in **`docs/GO_LIVE.md`**. One real code gap flagged there: the
  add-card form takes raw PAN server-side (PCI) → needs Stripe Elements before live.
- **Resilience: DONE.** New `src/server/log.ts` (structured JSON logs) +
  `src/server/action-error.ts` (`toActionError`: expected errors pass through,
  unexpected are logged server-side + shown a generic message — previously the raw
  `Error.message` leaked to users and nothing was logged). All 3 action files use it.
  `jobs.ts` cron runner now isolates each step (one failure logs + continues, adds
  `errors` count) — matters because step 2 places card holds. Cron + webhook routes
  wrapped in try/catch + logging. Added `src/app/global-error.tsx` (root-layout
  boundary; `error.tsx`'s component renamed `RouteError`). Test:
  `tests/action-error.test.ts` locks the no-leak/does-log contract.
- **Gotcha caught by e2e:** a `"use server"` file may only export async functions.
  Re-exporting a *type* (`export type { ActionState }`) breaks Next's server-action
  bundler at build time (typecheck/lint/unit all pass — only e2e/build catches it).
  Fixed by declaring `export type ActionState = …` inline in each action file.

Demo label is **Columbia Records** (owner **Ben Shafner**) with a 16-artist roster.
Two headliners carry real 2026 tours: **Baby Keem** (Ca$ino Tour) and **Ella
Langley** (Dandelion Tour), with photos on cards.

## Label IA is Tours-first (recent change)
- **Nav (this session):** `Tours · Requests · Shows · Messages · Payments · Settings`.
  The **Dashboard** was removed — `/label` now redirects to `/label/tours` (the
  landing), carrying the post-onboarding `?welcome` banner onto the Tours page.
  **Team** was merged into **Settings** (`/label/settings` shows Company profile +
  Team & permissions + Invite); `/label/team` redirects to it. `homeHref=/label/tours`.
- The **Artists** nav item/page were removed. **Tours** is the artist-forward
  catalog: each tour card shows its artist (photo + name + genre), dates, and shows.
- Create/edit an artist **inline** in the tour flow: "New tour" has an
  Existing/New-artist toggle (`src/app/label/tours/tour-form.tsx`); per-tour
  "Edit artist" reuses `tours/artist-form.tsx`.
- Create a show via a tour's **"Add a date"** (`/label/shows/new?tour=<id>` prefills
  artist+tour) or standalone from the Shows list. Artists only surface once they
  have a tour (intentional — discovery only ever showed artists with published shows).

## Tour-date import
`/label/shows/new` has an **Import a tour date** panel: pick an artist → fetch →
click a date to prefill venue/city/date. Provider chain in
`src/server/providers/events/` (Bandsintown → Ticketmaster → offline **demo**).
Set `BANDSINTOWN_APP_ID` or `TICKETMASTER_API_KEY` for live data; otherwise the demo
provider returns the real dates for the two demo artists.

## Deploy status
- Code is public: **https://github.com/benshafne3r/showup**. `vercel.json` runs
  `/api/cron/run` every 10 min.
- **Two Supabase projects:** dev `mvtmomgepsgrqptsfqak` (`.env.local`, paid org);
  **production `Show Up` `mpcjunweelepgcglolvx`** in a **free** org — fully migrated,
  seeded, artist photos uploaded, email auto-confirm on. Its keys are in
  **`.env.production.local`** (gitignored).
- Remaining (user): import the repo into Vercel, paste the `.env.production.local`
  values (set `NEXT_PUBLIC_APP_URL` to the Vercel URL), and add that URL to the prod
  Supabase project's Auth → URL config. Full steps in `docs/DEPLOYMENT.md`.

## Auth email flows (built this session)
Both password reset and email verification, styled to match the auth pages. Shared
piece: **`/auth/callback`** (`src/app/auth/callback/route.ts`) exchanges the PKCE
`code` for a session, then routes on — honoring an explicit `next` (reset →
`/update-password`) or, when none is given (signup confirmation), computing the
role-appropriate landing via **`src/server/auth/destination.ts`** (`destinationFor`,
extracted from the auth actions so both callers share it). On failure →
`/forgot-password?error=expired` + structured log.

- **Password reset:** `/forgot-password` → `requestPasswordReset` emails a link
  (rate-limited `auth.reset`, neutral "if an account exists" — no enumeration).
  `/update-password` requires the recovery session; `updatePassword` sets it.
  "Forgot password?" link added to sign-in.
- **Email verification:** `signUp` now passes `emailRedirectTo=…/auth/callback` and,
  when Supabase returns no session (i.e. confirmation required), returns a `pending`
  state → sign-up form shows a "check your email" panel instead of an error. With
  dev's `mailer_autoconfirm` **on**, signup still returns a session and routes
  straight to onboarding (verified), so this is a no-op until the flag is turned off.
- ⚠️ **Prod config:** `${NEXT_PUBLIC_APP_URL}/auth/callback` must be in the Supabase
  project's **Auth → URL Configuration → Redirect URLs**, and to *require* email
  verification turn **off** `mailer_autoconfirm` on the prod project.
- e2e: `e2e/password-reset.spec.ts` (link, neutral confirmation, both expiry guards).
  Full email→link happy paths need a live inbox → verify manually.

## Stripe Elements / PCI-safe cards (built this session)
The add-card form no longer has to send a raw PAN to the server:
- New `src/app/creator/payments/stripe-card-form.tsx` — Stripe Elements. Card is
  tokenized in the browser (`stripe.createPaymentMethod`) → only a `pm_…` id
  reaches the server. Loads Stripe.js from the publishable key.
- Provider interface gained `attachPaymentMethodToken(userId, pm_id)`
  (`types.ts`); implemented in `stripe.ts` (attaches the PM to the customer) and
  a simulated version in `mock.ts`. Service: `attachPaymentMethodByToken` +
  shared `recordPaymentMethod` (`payments.ts`). Action: `addPaymentMethodToken`.
- **Gating:** the payments page renders Elements only when
  `PAYMENT_PROVIDER=stripe` **and** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set;
  otherwise the existing raw/mock form (so dev + e2e stay on mock, unchanged).
- Env: added `publicEnv.stripePublishableKey` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  in `.env.example`. Client SDK: `@stripe/stripe-js`, `@stripe/react-stripe-js`.
- Verified: renders in stripe mode, Stripe.js loads with a real `pk_test_` key,
  gating correct, e2e mock path intact. **Not fully verified:** the card input
  field + real tokenize→attach needs a real browser + a live `sk_test_` secret →
  user to confirm. (The card-input iframe didn't paint in the headless preview.)
- **To activate:** set `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY=sk_test_…`,
  `STRIPE_WEBHOOK_SECRET=whsec_…`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`.
  (User pasted a `sk_test_` secret in chat once — it was treated as burned and
  never written to disk; rotate it in the Stripe dashboard.)

## Next steps
Production-readiness pass — remaining (security, resilience, auth email, Stripe Elements done):
1. Add **error tracking** (Sentry) + basic analytics. `src/server/log.ts` is the
   natural hook point — pipe its `error` level to Sentry.
2. **Gate/remove demo accounts** (`*@demo.showup.test`) before real users.
3. Finish the Vercel deploy (dashboard import + env vars) — last mile to go live.
4. When ready for real money/email, follow **`docs/GO_LIVE.md`** end to end
   (Stripe Connect KYC + live keys are still required for payouts / real charges).
5. Optional: add a Bandsintown/Ticketmaster key for live tour-date imports.

### Improvement backlog (discussed, not chosen yet)
- **Content verification + view tracking** — auto-check a submitted post is live and pull
  its view/like counts, show labels ROI. (Highest-leverage product bet.)
- **Real attendance** — QR / geofenced check-in instead of manual photo approval (the
  attendance module is structured for pluggable verification).
- **Live Stripe** (test mode) — manual-capture holds + Connect payouts.
- **Verified social metrics**, **realtime** messaging/notifications, label **ROI dashboard**.

## Key decisions
- Branding centralized in `src/lib/brand.ts`.
- Payments + email use provider abstractions; defaults are mock/console. Stripe
  adapter refuses non-`sk_test_` keys.
- Free prod DB pauses after ~7 days idle → "Restore" in the Supabase dashboard.
- **Modified Next.js (v16)** — read `node_modules/next/dist/docs/` before Next code (AGENTS.md).

## Gotchas / setup
- Run `npm run dev` · seed `npm run seed` (targets `.env.local` dev DB) · cron `npm run cron`.
- Tests: `npm test` · `npm run test:e2e` · `npm run typecheck` · `npm run lint`.
- **Next 16 holds a per-project dev lock** — stop the preview server before
  `npm run test:e2e` (it starts its own dev server), or it fails with "Another next
  dev server is already running."
- Preview server pinned to port 3000 in `.claude/launch.json` (mock webhooks self-post there).
- **`.env.local` drives dev AND e2e.** The seed + e2e assume `PAYMENT_PROVIDER=mock`.
  If you set it to `stripe` for sandbox testing, switch it back to `mock` before
  `npm run test:e2e` (or the tests will hit real Stripe and fail).
- **e2e golden-path is flaky under full-suite load** — the serial chain occasionally
  times out on a different step each run (file upload / streamed revalidation). It
  passes 9/9 when re-run alone (`npx playwright test golden-path`). Consider adding
  `retries: 1` to `playwright.config` to absorb it. Not a product bug.
