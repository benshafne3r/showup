# HANDOFF — ShowUp (CreatorTickets Platform)

_Last updated: 2026-07-16_

## Stripe integration (this session)
CLI + MCP paired to **Show Up LLC** (`acct_1TqDXl2KxMbOZ5Hd`). See memory
`stripe-setup.md` for full details.
- **Phase 1 DONE — deposit holds validated in test mode.** `.env.local` re-aligned to
  Show Up LLC test keys (secret was empty + pk was a different account); `PAYMENT_PROVIDER=stripe`.
  authorize→release / authorize→capture all succeed on the real test account; every
  webhook returns 200 via `stripe listen`. Not verifiable headless: typing into the
  Stripe Elements card iframe (user does that once in a real browser).
- **Phase 2 MERGED to main — Connect creator payouts (Accounts v2).** migration 0007 +
  `services/connect.ts` (v2 recipient accounts + hosted onboarding) + `payout()` transfer +
  "Getting paid" card. Fully gated on `PAYMENT_PROVIDER=stripe`, so mock (prod today/dev/e2e)
  is unchanged. Validated in test mode up to the human KYC step (has a CAPTCHA; can't automate).
  **Before prod goes Stripe:** (a) apply migration 0007 to the **prod** Supabase
  (`mpcjunweelepgcglolvx`) — dev has it, prod doesn't; safe in mock mode since the new columns
  are only read in stripe mode; (b) complete one live onboarding + confirm a transfer;
  (c) wire the v2 `account[requirements].updated` webhook backstop (return-URL sync covers the happy path).
- ⚠️ `.env.local` is on `PAYMENT_PROVIDER=stripe`; set back to `mock` before `npm run test:e2e`.


## Small UX tweaks (latest)
- **Create dialog:** the "Pop-up show" tab is now **"Event"** (label only; the
  `popup` route/action/schema identifiers are unchanged). e2e updated.
- **Creator nav:** "Settings" → **"Profile"** (nav label, page title, metadata;
  route stays `/creator/settings`).
- **Discover city filter:** was built only from cities that had published shows.
  Added `src/lib/cities.ts` (`MAJOR_CITIES`) and unioned it with live-show cities
  in `creator/page.tsx`, so the dropdown always offers major markets. Edit that
  list to add/remove cities. (Venue/profile city fields are free-text, unchanged.)
- **Stripe deposit/hold is already built** (`providers/payment/stripe.ts`): manual-
  capture auth `authorize()` places a hold → `release()` cancels on confirmed
  attendance → `capture()` charges on no-show. Live-blocked on real keys (mock only;
  adapter refuses non-`sk_test_`). 7-day auth window caveat noted in that file.

## Requests merged into Messages (this session)
Both roles: the separate **Requests** and **Messages** nav items are now one
**Messages** tab. `/label/messages` and `/creator/messages` are outer `Tabs`
(**Requests | Chats**); the requests list moved in verbatim (label keeps its inner
Pending/Waitlist/Decided tabs). Deep-linkable via `?tab=requests|messages`. Old list
routes `/label/requests` + `/creator/requests` are now redirect stubs → the merged
page (creator forwards `submitted=1`). Detail route `/label/requests/[id]` kept
(breadcrumb repointed). Badges combined: label Messages badge = pendingRequests +
unreadMessages; creator = unreadMessages. Updated notification links + revalidatePaths
(`services/requests.ts`, `bookings.ts`, both `actions.ts`) and e2e assertions
(golden-path new URLs). typecheck + lint clean (0 errors). Verified both roles in-browser
at 1280px + 375px (tabs, redirects, `submitted` banner, no overflow).

## Mobile-friendly pass (previous session)
Audited the whole app at 375px. It was already ~90% responsive — the shared
`AppShell` has a sheet nav + collapsing sidebar, inputs are 16px (no iOS zoom),
detail pages collapse to one column, card grids stack. The **one real defect was
data tables**: 7 of them rendered at `min-w-[720–900px]` and scrolled horizontally
on phones, hiding the Status + **Actions** columns off-screen. Fixed all 7 with the
**desktop-table / mobile-card** pattern — the `overflow-x-auto` table wrapper is now
`hidden md:block`, plus a `md:hidden` stacked-card `<ul>` that surfaces every field
and action. Files: `label/shows`, `admin/{bookings,payments,shows,users,companies,audit-logs}/page.tsx`.
Verified in-browser at 375px (no horizontal overflow anywhere) and at 1280px (tables
unchanged). typecheck clean; lint 0 errors (only pre-existing warnings).
- Not changed: base control density (`h-8` buttons/inputs, ~32px). Usable on mobile
  but below the 44px tap-target ideal — bumping to `h-10 md:h-8` is a possible
  follow-up if the compact feel isn't wanted on phones.

## Current state
ShowUp is a marketplace where music labels offer free concert tickets to creators
in exchange for attendance + optional social content (the creator's card gets a
temporary hold, released on verified attendance; content earns a fixed payment).
All build phases are done and committed. The app runs end-to-end on demo data with
mock payments/email. Branding is an indify-style **red** theme, a flat ticket
**logo** (`src/components/logo.tsx`), no "test mode" banner. Tests: Vitest **39** unit
green; Playwright e2e covers golden path + admin dispute + permissions + password
reset + pop-up show. **Live on Railway** (see Deploy status).

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
- **Artist create/edit** lives in the tabbed **Create** dialog and the per-tour
  merged **Edit** popup (`tours/tour-edit-dialog.tsx` = artist + tour in one save)
  — the old separate "Edit artist"/"Edit tour" buttons and `artist-form.tsx` were
  **removed**. See "Label create / manage flows" below.
- Create a show via a tour's **"Add a date"** (`/label/shows/new?tour=<id>` prefills
  artist+tour), the **Create → Pop-up** tab (standalone), or the Shows list. Artists
  only surface once they have a tour/show (discovery only shows published ones).

## Label create / manage flows (this session)
- **Create dialog** (`tours/create-dialog.tsx`): the tours-page "Create" button opens
  a tabbed dialog — **Tour** (`TourCreateForm`) or **Pop-up show** (`PopupShowForm`,
  a standalone tour-less show published instantly via `createPopupShowAction`). Shared
  existing/new-artist picker extracted to `tours/artist-selector.tsx`.
- **Delete**: `deleteTour`/`deleteShow` (`catalog.ts`, admin-only actions) — hard
  delete, but **refuse when a show has bookings** (also FK-restricted at the DB).
  `DeleteTourButton` on tour cards, `DeleteShowButton` on the shows table.
- **Shareable invite pages**: public `/invite/[kind]/[id]` (kind = tour|show), no
  login — artist hero, dates, "Apply for free tickets" CTA, "How ShowUp works". Only
  renders when a published opportunity exists. `ShareButton` (copy/native-share) on
  tour cards + show rows. Apply CTA → `/sign-up?role=creator&next=/creator/shows/<id>`.
- **Auth `next`**: `signIn`/`signUp` now honor a safe `next` form field (forwarded by
  the sign-in/up pages), so invite → sign-up lands on the event.
- e2e: `e2e/popup-show.spec.ts` (pop-up publish). Delete/invite dialogs verified via
  typecheck + the public invite page rendered in-browser; AlertDialog confirms open
  in a real browser (harness can't drive Radix dialogs).

## Spotify artist picker (built this session)
Adding an artist can auto-fill from Spotify instead of manual entry:
- `SpotifyArtistPicker` (`src/app/label/tours/spotify-artist-picker.tsx`) — debounced
  type-ahead calling `searchSpotifyArtistsAction`. On select it fills name + genre +
  Spotify URL + photo, then **enriches bio + Instagram** (Spotify has neither) via
  `enrichArtistAction` → `src/server/providers/artist-enrich/` (bio = Wikipedia
  summary, Instagram = MusicBrainz URL relations; best-effort, keyless).
- On save, `upsertArtist` (`catalog.ts`) fetches the photo and **stores it in our
  `artist-images` bucket** (via `fetchRemoteImage` + `uploadFile`), so we own the
  asset — not a hot-link. Fields stay editable; manual entry + file upload remain.
- Lives in the shared `tours/artist-selector.tsx` (used by the Create dialog + the
  merged Edit popup). Provider: `src/server/providers/spotify/` (Client Credentials
  flow, token cached ~1h); `spotifyConfigured()` gates it.
- **Needs creds:** `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` (free app at
  developer.spotify.com/dashboard). Unset → picker returns nothing, manual entry works
  (verified). Real search + photo-pull needs the keys → verify once added.

## Branding & link previews (this session)
- **Favicon:** `src/app/icon.svg` (the red ticket mark on a dark tile). The default
  Next.js `favicon.ico` was removed. Browsers cache favicons hard → hard-refresh.
- **Link-preview / Open Graph card:** `src/app/opengraph-image.tsx` (generated via
  `next/og` — ticket + tagline on the brand background) shows when the site link is
  shared (Messenger/iMessage/Slack/etc.). `layout.tsx` sets `metadataBase` (from
  `NEXT_PUBLIC_APP_URL` — must be the real domain for the image URL to resolve) +
  openGraph/twitter fields.
- **Tried + reverted:** a full-width artist-photo *banner* on the tour cards — the
  user preferred the original side-strip layout, so it was reverted (commit history).

## Tour-date import
`/label/shows/new` has an **Import a tour date** panel: pick an artist → fetch →
click a date to prefill venue/city/date. Provider chain in
`src/server/providers/events/` (Bandsintown → Ticketmaster → offline **demo**).
Set `BANDSINTOWN_APP_ID` or `TICKETMASTER_API_KEY` for live data; otherwise the demo
provider returns the real dates for the two demo artists.

## Deploy status
- **LIVE on Railway:** https://showup-production-05d8.up.railway.app (homepage +
  sign-in render; Supabase-backed artist images load, so the prod DB is connected).
  Host is Railway (not Vercel — `vercel.json` removed); redeploys on push to `main`.
- **Port gotcha (resolved):** Railway injects `PORT=8080` and `next start` binds to
  it — the generated domain must route to **8080**, not the Next.js default 3000
  (that caused the initial 502). Match the domain port to whatever the runtime log
  shows (`Local: http://localhost:8080`).
- Cron should run as a **second Railway service** (`npm run cron`, `*/10 * * * *`).
- **Two Supabase projects:** dev `mvtmomgepsgrqptsfqak` (`.env.local`, paid org);
  **production `Show Up` `mpcjunweelepgcglolvx`** in a **free** org — fully migrated,
  seeded, artist photos uploaded, email auto-confirm on. Its keys are in
  **`.env.production.local`** (gitignored).
- Remaining (user): confirm the web service is up, set `NEXT_PUBLIC_APP_URL` to the
  Railway domain + redeploy, add that domain **and** `/auth/callback` to the prod
  Supabase Auth → URL config, and add the cron service. Full steps in
  `docs/DEPLOYMENT.md`.

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
3. Finish the Railway deploy (env vars + domain + Supabase URL config + cron service) — last mile to go live.
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
