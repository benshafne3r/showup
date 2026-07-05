# Deploying ShowUp

The app is a Next.js 16 frontend backed by a hosted Supabase project. Supabase
is already live, so deploying = hosting the Next.js app. **Vercel** is the
recommended host (native Next.js support, free tier, built-in cron).

Repo: https://github.com/benshafne3r/showup

## 1. Import the repo into Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with **GitHub**.
2. **Add New → Project** → import **benshafne3r/showup**.
3. Framework preset auto-detects **Next.js**. Leave build settings default
   (`next build`). Don't deploy yet — set env vars first (next step).

## 2. Environment variables

In the Vercel project → **Settings → Environment Variables**, add each of these
(scope: Production + Preview). Most values you can copy verbatim from your local
`.env.local`.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | copy from `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | copy from `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | copy from `.env.local` — **server-only, keep secret** |
| `NEXT_PUBLIC_APP_URL` | **your Vercel URL**, e.g. `https://showup.vercel.app` (NOT localhost) |
| `PAYMENT_PROVIDER` | `mock` (no real money) |
| `MOCK_WEBHOOK_SECRET` | copy from `.env.local` |
| `EMAIL_PROVIDER` | `console` (or `resend` + `RESEND_API_KEY`) |
| `EMAIL_FROM` | `ShowUp <notifications@example.com>` |
| `CRON_SECRET` | copy from `.env.local` |
| `BANDSINTOWN_APP_ID` | optional — live tour-date import |
| `TICKETMASTER_API_KEY` | optional — live tour-date import fallback |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | leave blank (mock mode) |

> **`NEXT_PUBLIC_APP_URL` is the one to get right.** Notification links and the
> mock payment webhook self-post use it. After the first deploy gives you a
> URL, set this to it and redeploy.

Then click **Deploy**.

## 3. Supabase configuration

In the Supabase dashboard (project `mvtmomgepsgrqptsfqak`):

- **Authentication → URL Configuration** → set **Site URL** to your Vercel URL
  and add it to **Redirect URLs**.
- The database is already migrated (`supabase/migrations/`) and seeded. To
  reset demo data against production, run `npm run seed` locally (it targets the
  same hosted DB — see the caveat below).

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

- **Shared database.** Dev and production point at the same Supabase project.
  Running `npm run seed` locally **wipes and reseeds production data**. For a
  real launch, create a separate Supabase project for production and point the
  Vercel env vars at it.
- **Demo accounts are reachable.** The seeded logins (`*@demo.showup.test` /
  `ShowUp!Demo1`) work on the live URL. Fine for a demo; remove them before a
  real launch.
- **Mock payments.** Keep `PAYMENT_PROVIDER=mock` until Stripe is fully set up
  (see the checklist in `src/server/providers/payment/stripe.ts`). The Stripe
  adapter refuses non-test keys until then.
- **Terms/Privacy** are placeholders — replace before a public launch.
