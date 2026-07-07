# Deploying ShowUp

The app is a Next.js 16 frontend backed by a hosted Supabase project. Supabase
is already live, so deploying = hosting the Next.js app. We host on **Railway**
(standard Node app: `next build` → `next start`).

Repo: https://github.com/benshafne3r/showup

**Databases:**
- **Dev** — project `showup` (`mvtmomgepsgrqptsfqak`), paid org "50 - 50". Used by
  local `npm run dev` / `npm run seed` (`.env.local`).
- **Production** — project `Show Up` (`mpcjunweelepgcglolvx`), **free** org
  "Show Up Project". Already migrated + seeded + artist photos uploaded. Its
  keys are in **`.env.production.local`** (gitignored) — copy them into Railway.

> The production DB is separate from dev, so local `npm run seed` never touches
> live data. (Free-tier note: the project pauses after ~7 days idle and needs a
> manual "Restore" click in the Supabase dashboard.)

## 1. Create the web service

Railway → **New Project → Deploy from GitHub repo** → `benshafne3r/showup`.
Nixpacks/Railpack auto-detects Next.js: install `npm ci`, build `next build`,
start `next start`. No config file needed.

## 2. Environment variables

In the service → **Variables** tab, add each of these (the **Raw Editor** lets
you paste the whole `.env.production.local` at once). **Set these BEFORE the
build runs** — `NEXT_PUBLIC_*` values are compiled into the app at build time, so
a missing `NEXT_PUBLIC_SUPABASE_URL` fails the build at "Collecting page data".

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from `.env.production.local` (**required at build**) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from `.env.production.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | from `.env.production.local` — **server-only, keep secret** |
| `NEXT_PUBLIC_APP_URL` | your Railway domain (see step 4). Placeholder is fine for the first build. |
| `PORT` | `3000` — makes `next start` listen where the domain routes (see step 3) |
| `PAYMENT_PROVIDER` | `mock` (no real money) |
| `MOCK_WEBHOOK_SECRET` | from `.env.production.local` |
| `EMAIL_PROVIDER` | `console` (or `resend` + `RESEND_API_KEY`) |
| `EMAIL_FROM` | `ShowUp <notifications@example.com>` |
| `CRON_SECRET` | from `.env.production.local` |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | optional — enables the Spotify artist picker; unset → manual entry |
| `BANDSINTOWN_APP_ID` / `TICKETMASTER_API_KEY` | optional — live tour-date import |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | leave blank (mock mode) |

## 3. Generate the public domain

Settings → **Networking → Generate Domain**. When it asks which port, enter
**3000** (matches the `PORT=3000` variable so `next start` and the domain agree —
otherwise you get a 502). You'll get a URL like
`https://showup-production.up.railway.app`.

## 4. Fix `NEXT_PUBLIC_APP_URL`

Set `NEXT_PUBLIC_APP_URL` to the real domain from step 3 → redeploy. Notification
links, the mock payment webhook self-post, and auth redirects all use it.

## 5. Supabase configuration

In the Supabase dashboard, **production project `Show Up`
(`mpcjunweelepgcglolvx`)** → **Authentication → URL Configuration**:
- **Site URL** = your Railway domain.
- **Redirect URLs** = your Railway domain **and**
  `https://YOUR-DOMAIN/auth/callback` (required for password reset + signup email
  confirmation links).

The database is already migrated (`supabase/migrations/`) and seeded, email
auto-confirm is on, and demo artist photos are uploaded — nothing else here. (To
*require* email verification later, turn off `mailer_autoconfirm`; see
`docs/GO_LIVE.md`.)

## 6. Cron (scheduled jobs)

The card-hold / acceptance-expiry / reminder jobs run via `/api/cron/run`. Add a
**second Railway service** from the same repo:
- Start command: `npm run cron` (hits `/api/cron/run` using env vars — works
  headless via `scripts/run-cron.mjs`).
- Settings → **Cron Schedule**: `*/10 * * * *`.
- Give it `NEXT_PUBLIC_APP_URL` (the web domain) + `CRON_SECRET` (same value as
  the web service). Railway runs it every 10 min; it exits after each run.

*(Simpler alternative: an external scheduler like cron-job.org or a GitHub
Actions `schedule` hitting `POST https://YOUR-DOMAIN/api/cron/run` with header
`x-cron-secret: <CRON_SECRET>`.)*

## 7. Ship updates

Railway watches the repo — every push to `main` triggers a redeploy.

```bash
git push            # → redeploy
```

## Caveats for a public/live deploy

- **Free-tier pause.** The production project is on Supabase's free plan, which
  pauses after ~7 days of inactivity — click **Restore** in the Supabase
  dashboard to wake it. Upgrade the org to Pro if you want it always-on.
- **Demo accounts are reachable.** The seeded logins (`*@demo.showup.test` /
  `ShowUp!Demo1`) work on the live URL. Fine for a demo; remove them before a
  real launch.
- **Mock payments.** Keep `PAYMENT_PROVIDER=mock` until Stripe is fully set up
  (see the checklist in `src/server/providers/payment/stripe.ts` and
  `docs/GO_LIVE.md`). The Stripe adapter refuses non-test keys until then.
- **Terms/Privacy** are placeholders — replace before a public launch.
