# Deploying ShowUp

The app is a Next.js 16 frontend backed by a hosted Supabase project. Supabase
is already live, so deploying = hosting the Next.js app. **Vercel** is the
recommended host (native Next.js support, free tier, built-in cron).

Repo: https://github.com/benshafne3r/showup

**Databases:**
- **Dev** — project `showup` (`mvtmomgepsgrqptsfqak`), paid org "50 - 50". Used by
  local `npm run dev` / `npm run seed` (`.env.local`).
- **Production** — project `Show Up` (`mpcjunweelepgcglolvx`), **free** org
  "Show Up Project". Already migrated + seeded + artist photos uploaded. Its
  keys are in **`.env.production.local`** (gitignored) — copy them into Vercel.

> The production DB is separate from dev, so local `npm run seed` never touches
> live data. (Free-tier note: the project pauses after ~7 days idle and needs a
> manual "Restore" click in the Supabase dashboard.)

## 1. Import the repo into Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with **GitHub**.
2. **Add New → Project** → import **benshafne3r/showup**.
3. Framework preset auto-detects **Next.js**. Leave build settings default
   (`next build`). Don't deploy yet — set env vars first (next step).

## 2. Environment variables

In the Vercel project → **Settings → Environment Variables**, add each of these
(scope: Production + Preview). **Open `.env.production.local`** (in the project
root, gitignored) — it already has your production Supabase URL + keys and the
shared secrets filled in; copy them straight across.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from `.env.production.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from `.env.production.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | from `.env.production.local` — **server-only, keep secret** |
| `NEXT_PUBLIC_APP_URL` | **your Vercel URL**, e.g. `https://showup.vercel.app` (NOT localhost) |
| `PAYMENT_PROVIDER` | `mock` (no real money) |
| `MOCK_WEBHOOK_SECRET` | from `.env.production.local` |
| `EMAIL_PROVIDER` | `console` (or `resend` + `RESEND_API_KEY`) |
| `EMAIL_FROM` | `ShowUp <notifications@example.com>` |
| `CRON_SECRET` | from `.env.production.local` |
| `BANDSINTOWN_APP_ID` | optional — live tour-date import |
| `TICKETMASTER_API_KEY` | optional — live tour-date import fallback |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | leave blank (mock mode) |

> **`NEXT_PUBLIC_APP_URL` is the one to get right.** In `.env.production.local`
> it's a placeholder — set it to your real Vercel URL. Notification links and the
> mock payment webhook self-post use it. After the first deploy gives you a URL,
> set this and redeploy.

Then click **Deploy**.

## 3. Supabase configuration

In the Supabase dashboard, **production project `Show Up` (`mpcjunweelepgcglolvx`)**:

- **Authentication → URL Configuration** → set **Site URL** to your Vercel URL
  and add it to **Redirect URLs**.
- The database is already migrated (`supabase/migrations/`) and seeded, email
  auto-confirm is on, and the demo artist photos are uploaded — nothing to do
  here beyond the URL config.

## 4. Cron (already configured)

`vercel.json` registers `/api/cron/run` to run every 10 minutes. Vercel Cron
automatically sends `Authorization: Bearer $CRON_SECRET`, which the route
verifies — so just make sure `CRON_SECRET` is set in Vercel. This is what places
card holds before shows, expires 24h acceptance windows, and sends reminders.

## 5. Ship updates

Every `git push` to `main` triggers an automatic production deploy. Pull
requests get preview deploys.

```bash
git push            # → production deploy
```

## Caveats for a public/live deploy

- **Free-tier pause.** The production project is on Supabase's free plan, which
  pauses after ~7 days of inactivity — click **Restore** in the Supabase
  dashboard to wake it. Upgrade the org to Pro if you want it always-on.
- **Demo accounts are reachable.** The seeded logins (`*@demo.showup.test` /
  `ShowUp!Demo1`) work on the live URL. Fine for a demo; remove them before a
  real launch.
- **Mock payments.** Keep `PAYMENT_PROVIDER=mock` until Stripe is fully set up
  (see the checklist in `src/server/providers/payment/stripe.ts`). The Stripe
  adapter refuses non-test keys until then.
- **Terms/Privacy** are placeholders — replace before a public launch.
