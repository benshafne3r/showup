# ShowUp

**Free tickets for creators who show up.**

ShowUp is a marketplace connecting music labels, artist managers, and creator-marketing teams with influencers who get complimentary concert access in exchange for reliable attendance and optional social content.

The core mechanic: the creator is **never charged upfront**. Their card gets a **temporary hold** (stated ticket value × tickets × a deposit percentage the label picks). **Attend the show → the hold is released.** **Complete the content deliverables → earn the creator payment.** The hold covers every requested ticket, including a +1, and is never framed as creator earnings.

> Branding is centralized in [`src/lib/brand.ts`](src/lib/brand.ts) for easy renaming.

## Stack

- **Next.js 16** (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui
- **Supabase** — Postgres 17, Auth, Row Level Security, Storage
- **Payments** — provider abstraction: fully functional **mock provider** (default, no real money) + **Stripe adapter skeleton** (test-mode only)
- **Email** — provider abstraction: console transport (default) + Resend
- **Vitest** (unit) · **Playwright** (end-to-end)

Planning docs live in [`docs/`](docs): product spec, user flows, data model, payment flow, security model, implementation plan, and recorded assumptions.

## Getting started

### 1. Prerequisites

- Node.js 20+ (built on Node 22)
- A Supabase project (this repo is wired to a hosted project; the schema lives in `supabase/migrations/`)

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in:

| Variable | What |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From your Supabase project (Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service key — never expose to the browser |
| `PAYMENT_PROVIDER` | `mock` (default) or `stripe` (requires `sk_test_` key; the adapter refuses live keys) |
| `MOCK_WEBHOOK_SECRET` | Any random string — signs the mock provider's webhooks |
| `EMAIL_PROVIDER` | `console` (default) or `resend` + `RESEND_API_KEY` |
| `CRON_SECRET` | Any random string — protects `/api/cron/run` |

> Note: this repo includes a project-local npm cache (`.npmrc` → `.npm-cache/`) because a root-owned `~/.npm` cache breaks installs on this machine. Fix the global cache with `sudo chown -R $(whoami) ~/.npm` and delete `.npmrc` if you prefer.

### 3. Database migrations

Migrations are plain SQL in [`supabase/migrations/`](supabase/migrations), applied in order (0001 schema → 0002 RLS → 0003 settings/storage → 0004 function hygiene → 0005 inventory functions). Apply them with either:

```bash
# Supabase CLI (linked project)
supabase link --project-ref YOUR_REF
supabase db push

# or paste each file into the Supabase SQL editor in order
```

Auth setting: enable **email autoconfirm** for the local demo flow (Dashboard → Auth → Providers → Email → "Confirm email" off), or wire up real SMTP.

### 4. Install, seed, run

```bash
npm install
npm run seed     # wipes & seeds demo data (DEV ONLY)
npm run dev      # http://localhost:3000
```

### 5. Demo accounts (local/dev only)

All passwords: **`ShowUp!Demo1`**

| Account | Role |
|---|---|
| `admin@demo.showup.test` | Platform admin |
| `label.owner@demo.showup.test` | Label owner (Midnight Bloom Records) |
| `label.member@demo.showup.test` | Label teammate |
| `creator.mia@demo.showup.test` | Creator (LA) — completed collab + upcoming confirmed booking |
| `creator.jay@demo.showup.test` | Creator (NYC) — pending request + open attendance dispute |
| `creator.zoe@demo.showup.test` | Creator (Chicago) — approved, awaiting acceptance (24h countdown) |
| `creator.leo@demo.showup.test` | Creator (Austin) — clean slate, used by the e2e golden path |
| `creator.ava@demo.showup.test` | Creator (LA) — waitlisted |

**Mock test cards:** `4242 4242 4242 4242` verifies + authorizes · `4000 0000 0000 0002` declines at verification · `4000 0000 0000 9995` verifies but fails at authorization (exercises the grace-period flow).

## Testing

```bash
npm run test       # Vitest: deposit math, state machines, webhook signatures
npm run test:e2e   # Playwright: reseeds the DB, then runs the golden path,
                   # admin dispute resolution, and permission-boundary specs
npm run typecheck  # tsc --noEmit
npm run lint
```

The e2e suite starts its own dev server on port 3111 and uses the mock payment provider — no real money ever moves.

## Scheduled jobs

Time-based transitions (24h acceptance expiry, placing holds N days before the show, grace-period cancellations, reminders) run through `POST /api/cron/run` (header `x-cron-secret: $CRON_SECRET`):

```bash
npm run cron            # trigger against the local dev server
```

Admins can also trigger it from the admin dashboard ("Run scheduled jobs now"). Reads also lazily expire overdue acceptances, so the UI stays truthful between runs. In production, point a scheduler (e.g. Vercel Cron) at the endpoint every 5–15 minutes.

## Payments model (MVP)

- The label picks a **deposit percentage** from platform templates (default 25/50/75/100 — admin-editable in Platform Settings; arbitrary flat fees are not allowed).
- Hold = stated ticket value × tickets × percentage; snapshotted onto the booking at approval so later edits never change agreed terms.
- Because card-network authorizations expire (~7 days), the hold is **not** placed at booking time: the card is saved + verified at acceptance and the hold is placed `authorization_window_days` (default 5, admin-configurable) before the show. Failures → notification → configurable grace period → automatic cancellation.
- Attendance approval **releases** the hold. Content approval **pays** the creator. Attend-without-posting = released hold, no payment. No-show = the label may capture the hold (or excuse); disputes freeze everything until an admin resolves them.
- Every money mutation carries an idempotency key and claims its state with status-guarded updates — double approvals, double captures, and double payouts are structurally impossible. Webhooks are signature-verified and deduplicated.
- Before going live with Stripe: work through the checklist at the top of [`src/server/providers/payment/stripe.ts`](src/server/providers/payment/stripe.ts) (auth validity windows, extended auth, manual capture rules, Connect onboarding for payouts, dispute mapping).

## Architecture

```
src/app             → routes (marketing, auth, creator/, label/, admin/, api/)
src/server/services → ALL business logic + authorization checks (service role)
src/server/providers → payment + email provider abstractions
src/server/auth     → session guards (requireCreator / requireCompanyRole / requireAdmin)
src/lib             → money math, state machines, branding
supabase/migrations → schema, RLS policies, storage buckets, SQL functions
scripts/seed.ts     → demo data
tests/, e2e/        → Vitest + Playwright
```

Security model (details in [`docs/SECURITY.md`](docs/SECURITY.md)): the browser only ever holds the anon key (RLS-scoped); every mutation goes through server actions that re-authorize server-side; sensitive transitions (attendance approval, capture, release, payouts, inventory) are service-layer only; approvals/cancellations/money movements are audit-logged; uploads are validated server-side and served via short-lived signed URLs.

## Deployment

1. Create a production Supabase project, apply `supabase/migrations/` in order, and configure Auth email settings.
2. Deploy to Vercel (or any Node host): set every variable from `.env.example`.
3. Schedule `POST /api/cron/run` (Vercel Cron: sends `Authorization: Bearer $CRON_SECRET`).
4. Keep `PAYMENT_PROVIDER=mock` until the Stripe checklist is done and sandbox credentials are verified; the Stripe adapter hard-refuses non-test keys until then.
5. Replace the Terms/Privacy placeholders with counsel-reviewed documents before public launch.
