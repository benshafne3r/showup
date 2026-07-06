# HANDOFF — ShowUp (CreatorTickets Platform)

_Last updated: 2026-07-06_

## Current state
ShowUp is a marketplace where music labels offer free concert tickets to creators
in exchange for attendance + optional social content (the creator's card gets a
temporary hold, released on verified attendance; content earns a fixed payment).
All build phases are done and committed. The app runs end-to-end on demo data with
mock payments/email. Branding is an indify-style **red** theme, a flat ticket
**logo** (`src/components/logo.tsx`), no "test mode" banner. Tests: Vitest 34 unit
green; Playwright e2e covers the golden path + admin dispute + permissions.

Demo label is **Columbia Records** (owner **Ben Shafner**) with a 16-artist roster.
Two headliners carry real 2026 tours: **Baby Keem** (Ca$ino Tour) and **Ella
Langley** (Dandelion Tour), with photos on cards.

## Label IA is Tours-first (recent change)
- The **Artists** nav item/page were removed. **Tours** is now the artist-forward
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

## Next steps
1. **Agreed next build — production-readiness pass** (not started). Concretely:
   - Add a **password-reset** flow (Supabase `resetPasswordForEmail` + `/reset` page).
   - Turn OFF `mailer_autoconfirm` and add real **email verification** (dev currently
     auto-confirms; see the auth config on each Supabase project).
   - Wire **Resend** for real emails (`EMAIL_PROVIDER=resend` + `RESEND_API_KEY`) — the
     adapter exists in `src/server/providers/email/`, nothing sends until keyed.
   - Add **error tracking** (Sentry) + basic product analytics.
   - **Gate/remove the demo accounts** (`*@demo.showup.test`) before real users.
2. Finish the Vercel deploy (dashboard import + env vars) — the only thing left to go live.
3. Optional: add a Bandsintown/Ticketmaster key for live tour-date imports.

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
