# HANDOFF — ShowUp (CreatorTickets Platform)

_Last updated: 2026-10-06_

## 🚦 LIVE STATE (read this first)
Prod is **live for real** on a real domain with real payments. Owner account:
**ben@50-50ventures.com** (label). Legal entity **Show Up LLC**, California, in
`src/lib/brand.ts` (used by Terms/Privacy).

**Domains (GoDaddy DNS):**
- `www.showuptickets.com` → marketing site (Railway). `app.showuptickets.com` → sign-in + portal.
- Host split in **`src/proxy.ts`** (Next 16 renamed middleware→**proxy**), gated on
  **`PORTAL_SPLIT=on`**. Marketing auth buttons link to `NEXT_PUBLIC_APP_URL` (=`https://app.showuptickets.com`).
- Bare `showuptickets.com` needs GoDaddy **Forwarding → https://www.showuptickets.com**
  (⚠️ may still show the GoDaddy WebsiteBuilder site until that's set).
- Railway `NEXT_PUBLIC_APP_URL=https://app.showuptickets.com`. Custom-domain target **port 8080**.

**Payments — LIVE (Stripe, Show Up LLC `acct_1TqDXl2KxMbOZ5Hd`):** card saving works (1 real
card on file). Card holds have never run live (0 bookings yet). **Connect payouts were broken until
2026-10-06** — migration 0007 had never reached prod, so payout setup silently failed and minted
2 orphan connected accounts; fixed (0007 applied, `connect.ts` now throws on read errors instead of
re-creating accounts). Live key gated behind `STRIPE_LIVE_OK=true`.
Live webhook registered → `app.showuptickets.com/api/webhooks/payments` (Your account + Snapshot).
Live-mode Connect requires **both** `card_payments` + `stripe_transfers` capabilities (see
`services/connect.ts` + memory `stripe-setup.md`).

**Cron:** GitHub Actions `.github/workflows/cron.yml` (`*/10`) hits `/api/cron/run`; needs
`CRON_SECRET` repo secret (set) — verified running.

**Ticketmaster:** real tour-date import live; `TICKETMASTER_API_KEY` set in Railway (key valid).
Bulk import (`/label/shows/import`) dedupes by artist+date+venue.

**Demo data: FULLY GONE (2026-07-22).** The orphaned 2nd "Columbia Records" demo company
(18 artists/14 shows, no members) was deleted, then all 4 demo accounts
(`admin` + `creator.jay/mia/zoe@demo.showup.test`) and the 3 past-dated shows. Prod now has
exactly one company `f46d4a76…` (16 shows) and two users: `ben@50-50ventures.com` (label) +
`benshafner@gmail.com` (creator).

**⬜ Pre-creator-launch, still open:**
- **Paste the auth email templates** → `supabase/email-templates/` (see its README). New
  signups still get Supabase's default-styled confirm email until then.
- **4 shows are future-dated but their apply-by deadline already passed** (Pikeville 7/23,
  Cary 7/24, N. Charleston 7/25, Shenseea LA 7/29) → invisible in Discover. Bulk import sets
  the deadline 3 days pre-show, so near-term imports expire instantly. User chose not to extend.
- **Deposit is 100% of a $400 stated value ⇒ a $400 card hold per creator.** Flagged as the
  biggest signup deterrent; user deliberately kept 100%.
- Shenseea show has a `$2` creator payment (looks like a test value).

**Prod DB access:** The Supabase MCP reaches prod project `mpcjunweelepgcglolvx`
(org `xdhgsplrxsdvjvtwyoir`) — `execute_sql`/`apply_migration`. Prod has no
`supabase_migrations` table; migrations are applied by hand, so **check columns exist** rather
than trusting notes (0007 was marked "done" but wasn't).

**Local dev (restored 2026-10-06):** local Supabase stack via Colima (no Docker Desktop):
`colima start` → `supabase start -x realtime,edge-runtime,logflare,vector,imgproxy,supavisor`
→ `npm run seed` → `npm run dev`. `.env.local` points at `http://127.0.0.1:54321`. Studio at
`http://127.0.0.1:54323`. `supabase db reset` re-applies all migrations. Types:
`supabase gen types typescript --local --schema public` (then re-add the `__InternalSupabase` header).

## ⬜ Live $1 hold test (in progress, 2026-10-06)
The $400 test booking (d8a76740…) was canceled before its hold was placed. Test event
"ShowUp hold test (internal)" (show `1eaae5c1-f7e1-408f-82db-1c1ceac64ed6`, LA, Oct 9, $1 deposit,
1 ticket, apply by Oct 8 PT, city alert pre-stamped). Flow: request as benshafner@gmail.com →
approve as ben@50-50ventures.com → accept → hold placed within ~10 min (inside the 5-day window) →
check card → cancel the booking to release. Delete/cancel the test show afterwards.
Gotcha seen: `cancelBooking` once returned "cannot be canceled in its current state" on a transient
DB error (it swallows the update error); a retry worked.

## City alerts + tour deposits (2026-10-06)
- **New-show city alerts:** creators opt in (`creator_profiles.new_show_alerts`; checkbox on
  onboarding [pre-ticked] + Profile, one-click banner on Discover). Cron step 8
  (`services/show-alerts.ts`) claims newly published opportunities (`city_alerts_sent_at`), groups
  by city (`cityKey()` in `lib/cities.ts` handles "LA", "Los Angeles, CA"), sends one email per
  creator per batch, ~2/sec. Migration **0014** (stamps all existing opportunities as announced).
- **Tour-wide deposit:** Edit tour popup has "Deposit per ticket for every date" →
  `setTourDeposit()`. Per-date deposit: open the date → Edit. Tour cards show each date's deposit.

## Reliability tooling (2026-10-06)
- **Migrations are tracked.** Prod `supabase_migrations.schema_migrations` now has all of
  0001–0013 (0001–0006/0008/0009 backfilled). `npm run db:status [-- --prod]` lists what's
  missing. Apply a new file to prod with the Supabase MCP `apply_migration` named exactly like the
  file (e.g. `0014_x`) so it's recorded.
- **`/api/health`** → 200 when the DB answers and every repo migration is recorded, else 503.
  `cron.yml` curls it every 10 min, so a failed run = GitHub email (free uptime check). For SMS
  alerts, point UptimeRobot/Better Stack at it.
- **CI** (`.github/workflows/ci.yml`): every push to main runs typecheck/lint/unit, then the full
  e2e suite on a throwaway local Supabase in GitHub Actions. ⬜ First run not yet confirmed (GitHub
  API was unreachable from this machine on 2026-10-06). Watch Actions minutes if the repo is private.
- **Sentry** wired (`src/instrumentation*.ts`, `lib/report-error.ts`, `log.error` → Sentry) but
  inert until `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` are set on Railway (⬜ needs Ben's account).
- Chat: Enter sends, Shift+Enter = new line (touch keyboards keep Return = new line).

## Deposit per ticket (2026-10-06, user decision)
Ticket value + deposit % are gone from the UI. Labels set one **deposit per ticket ($)**; it's
stored as `stated_ticket_value_cents = deposit`, `deposit_percentage = 100`, so hold math and
bookings are unchanged. Older shows display `depositPerTicketCents(value, pct)` (`lib/money.ts`).
Validation: $1–$2,000 per ticket (`opportunities.ts`). Admin "deposit % templates" setting removed
from the UI (key still in `platform_settings`, unused). Terms page §4 reworded to match.

## Emails (2026-10-06)
New-request emails to labels carry show/date/tickets/creator city+audience+socials and the
creator's pitch (`EmailExtras` in `providers/email/template.ts`); chat emails carry the full message.
Resend key on Railway is valid and `showuptickets.com` is verified in that team.

## Private partner landing pages (2026-10-06)
A partner invite link (`/join/<token>`) is the landing page: pitch for labels or management + sign-up
on the page (`src/app/join/[token]/partner-landing.tsx`). Unindexed. Mint with `npm run invite`.

## Management companies + invite-only partners (built 2026-10-06)
New role **`manager`** with its own portal at `/manager` (Roster · Shows · Messages · Payments ·
Settings). Decisions (user's): label↔creator chats for a managed creator go to the **manager only**
(creator can't see them — enforced in RLS too); **either** creator or manager can request tickets;
content payouts go to the **agency's** Stripe account (`payee_agency_id` recorded). Creators under
management are "sub-accounts": own login to browse shows + add their card; accepting a booking
(card hold) stays with the creator.
- Tables (0012): `agencies`, `agency_members`, `agency_creators` (roster, 1 agency per creator),
  `agency_invites` (hashed tokens), `partner_invites`. Helpers `manages_creator()`,
  `is_managed_creator()`. Service: `services/agencies.ts`.
- Managers invite creators from the Roster ("Add creator" → email + copyable `/join/<token>`).
- `notify()` copies a managed creator's notifications to their agency (links mapped by
  `lib/manager-links.ts`); `deliver()` is the no-copy primitive.
- **Public sign-up is creator-only.** Labels/managers only via **private single-use links**:
  `npm run invite -- label|manager --org "Name" [--email x] [--days 7] --prod` (also `list`,
  `revoke <id>`). Prints `https://app.showuptickets.com/join/<token>`.
- **Security fix:** `handle_new_user` used to trust client signup metadata for role — anyone could
  self-assign `label` via the Supabase API. Now always `creator`; server promotes after a vetted
  invite. Role mirrored into `app_metadata` (trigger `sync_role_claim`) which the proxy reads.
- Label teammate invite emails now link to `/join/<token>` (was `/sign-up?role=label`).
- Demo (local seed): `manager@demo.showup.test` = Northside Talent (Ava + Nia on roster).
- **LIVE 2026-10-06:** 0011 + 0012 applied to prod, commit `4c86257` deployed, smoke-tested.
  Tests: 55 unit + 30 e2e green (`e2e/management.spec.ts` covers partner link → manager
  onboarding, manager request, label↔manager chat, managed creator locked out of chats).
- Not built (by design / later): manager accepting a booking for the creator (card-hold consent
  stays with the cardholder); agency teammate invites (Settings says "contact support");
  admin UI for agencies.

**✅ Email — LIVE (Resend):** password reset delivers end-to-end with the correct
`app.showuptickets.com` link. Two independent keys, both must come from the Resend **team
where `showuptickets.com` is verified** (team mismatch → `403 domain not verified`):
- **Supabase Auth → Custom SMTP** (host `smtp.resend.com`, port 465, user `resend`, pass = Resend
  key, sender `notifications@showuptickets.com`) → auth emails (reset/verify).
- **Railway `RESEND_API_KEY`** (+ `EMAIL_PROVIDER=resend`, `EMAIL_FROM`) → app notifications/invites.
  ⬜ Confirm this key is from the verified team + redeploy, or invites will 403.

Gotchas fixed: (1) Supabase **Site URL** must be `https://app.showuptickets.com` + **Redirect URLs**
must include `https://app.showuptickets.com/**` (wildcard) or Supabase drops the app's redirectTo.
(2) `auth/callback/route.ts` now builds redirects from `publicEnv.appUrl`, not `request.nextUrl.origin`
(Railway proxy origin = internal `localhost:8080`). (3) `otp_expired` on click = stale/old email or
link-prefetch by a mail scanner; if it recurs, disable Resend click/open tracking. Rotate the Resend
keys pasted in chat.

**✅ `0008_hide_venue.sql` is applied on prod** (verified 2026-10-06). As of that date prod has
16 published shows, 4 still upcoming, **3 open in creator Discover** (latest show 2026-10-31) —
add new dates before demoing to creators or Discover will go empty.

**Secret-location feature (Events):** event form has a "Venue / Address" field + "Hide exact
location until approved" checkbox → `shows.hide_venue_until_approved`. Creators see city-only
(venue/address stripped from the payload) on discover/show-detail/requests until their request is
`approved`; labels always see it. Events-only for now (not tour shows).

**Optional:** promote ben to `admin` (one-line SQL) for the admin dashboard; wire Sentry; wire the
v2 `account[requirements].updated` webhook backstop; harden the creator booking-dispute dialog
against the same mid-form close bug fixed on the tour create/edit dialogs.

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
  **Before prod goes Stripe:** (a) migration 0007 — was NOT actually on prod (payout setup silently failed, leaving 2 orphan
  Stripe accounts); applied 2026-10-06 and linked benshafner@gmail.com → `acct_1Tvlqm2LBt5afwiz`;
  (b) complete one live onboarding + confirm a transfer; (c) wire the v2
  `account[requirements].updated` webhook backstop (return-URL sync covers the happy path).
- **Live-key safety rail** now gated behind `STRIPE_LIVE_OK=true` (`env.ts` + `stripe.ts`): test
  keys always work; an `sk_live_` key only starts with the flag set. See `docs/GO_LIVE.md`.
- ⚠️ `.env.local` is back on `PAYMENT_PROVIDER=mock` (safe for tests/seed).


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

**Management (2026-10-06):** (1) mint a real partner link (`npm run invite -- manager --org … --prod`)
and walk a real agency through onboarding + Stripe payout setup (KYC can't be automated);
(2) decide if managers need teammate invites; (3) seed show dates are hard-coded 2026 dates, so
local Discover is nearly empty — make them relative to "today" if local demos matter.

**Content verification + view tracking — SHIPPED 2026-10-06.** The backlog's
"highest-leverage product bet" is implemented locally (typecheck ✓ lint ✓ 52/52 unit tests ✓
`next build` ✓), porting the battle-tested TikWM lookup from the Soundwave bot. What exists:
- `supabase/migrations/0010_content_verification.sql` — `content_verification_status` enum +
  `verification_status/platform/view_count/like_count/last_checked_at` on `content_submissions`
  (+ partial index). Applied to prod 2026-10-06.
- `src/server/providers/social-metrics/` — TikWM provider: per-video `?url=` → Pro
  `/user/posts` profile-feed fallback; feed = the arbiter of gone-vs-unknown (only a
  CONFIRMED-gone post is flagged; outages hold). Pure logic in `tiktok-logic.ts`, unit-tested.
- `src/server/services/content-verification.ts` — batch checker (25/tick, 6h recheck cooldown),
  wired as step 7 in `jobs.ts`; a post seen live HOLDS its badge through inconclusive lookups.
- UI: views + live/removed badge on `/label/content` and the booking detail content card.
Live: migration 0010 applied, `TIKWM_API_KEY` set on Railway (copied from Soundwave's
`TIKTOK_API_KEY` — same Pro key). ⬜ Verify: submit a TikTok link, watch the next cron tick fill views.

Production-readiness pass — remaining (security, resilience, auth email, Stripe Elements done):
1. Add **error tracking** (Sentry) + basic analytics. `src/server/log.ts` is the
   natural hook point — pipe its `error` level to Sentry.
2. **Gate/remove demo accounts** (`*@demo.showup.test`) before real users.
3. Finish the Railway deploy (env vars + domain + Supabase URL config + cron service) — last mile to go live.
4. When ready for real money/email, follow **`docs/GO_LIVE.md`** end to end
   (Stripe Connect KYC + live keys are still required for payouts / real charges).
5. Optional: add a Bandsintown/Ticketmaster key for live tour-date imports.

### Improvement backlog (discussed, not chosen yet)
- ~~**Content verification + view tracking**~~ — **built 2026-08-13**, see top of Next steps
  (ship checklist). Follow-ups that remain backlog: IG/YouTube support, campaign-level ROI rollup.
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
