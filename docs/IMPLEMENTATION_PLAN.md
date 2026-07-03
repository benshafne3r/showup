# ShowUp — Implementation Plan & Checklist

Stack: Next.js 16 (App Router, TS strict) · Tailwind v4 + shadcn/ui · Supabase (hosted Postgres 17, Auth, RLS, Storage) · Zod + React Hook Form · Vitest · Playwright · Mock payment provider (+ Stripe adapter skeleton) · Email provider abstraction (console/Resend).

## Phase 1 — Planning ✅
- [x] PRODUCT_SPEC / USER_FLOWS / DATA_MODEL / PAYMENT_FLOW / SECURITY / IMPLEMENTATION_PLAN / ASSUMPTIONS

## Phase 2 — Foundation
- [x] git init, Next.js scaffold (TS, Tailwind v4, src dir, App Router)
- [ ] shadcn/ui init + base components; design tokens (dark, music-forward)
- [ ] `.env.example` + env validation (`src/lib/env.ts`)
- [ ] Supabase project (hosted) + `supabase/migrations`:
  - [ ] `0001_schema.sql` — enums, tables, indexes, triggers (updated_at, auth.users → users)
  - [ ] `0002_rls.sql` — RLS policies + helper functions
  - [ ] `0003_settings_seed.sql` — platform_settings defaults, storage buckets
- [ ] Typed Supabase clients (browser anon / server anon+cookies / server service-role, `server-only`)
- [ ] Auth: sign-up (role select), sign-in, sign-out, middleware guards, `guards.ts`
- [ ] Seed script (`scripts/seed.ts`): full demo dataset + demo credentials in README

## Phase 3 — Creator experience
- [ ] Onboarding wizard (profile, city, socials, categories, example work)
- [ ] Discover grid + search/filters (city, date, payment, deliverable, availability)
- [ ] Show detail (imagery header, economics breakdown, deliverables, deadline)
- [ ] Request modal (ticket count, +1, pitch) + withdraw
- [ ] My requests (status tabs) / Upcoming shows
- [ ] Acceptance flow (countdown → terms review → payment method → consent → confirmed)
- [ ] Booking detail (timeline, tickets, hold status, instructions, actions)
- [ ] Messaging (threads, attachments, unread)
- [ ] Attendance submission (check-in + proof upload)
- [ ] Content submission (post URL + proof)
- [ ] Payments & authorization history / Notification center / Settings

## Phase 4 — Label experience
- [ ] Company onboarding + team invites (roles)
- [ ] Dashboard (KPIs, action queues)
- [ ] Artists CRUD / Tours CRUD / Venues inline / Shows CRUD (+ cancel/postpone)
- [ ] Opportunity form (value, % templates from settings, payment, deliverables, +1, deadline)
- [ ] Show dashboard (inventory, requests, bookings, attendance, content)
- [ ] Request review (profile + metrics, approve/reject/waitlist/message)
- [ ] Ticket instructions send
- [ ] Attendance review queue / Content review queue (approve/revision/reject)
- [ ] Payments & campaign spend + analytics (attendance %, completion %, no-shows, spend)
- [ ] Company settings

## Phase 5 — Payments
- [ ] `PaymentProvider` interface + provider registry (env-selected)
- [ ] MockPaymentProvider (methods, verify, authorize/decline cards, release, capture, payout, signed webhooks, `mock_payment_state`)
- [ ] `services/payments.ts` (schedule/place/release/capture/payout, idempotency, guarded claims)
- [ ] `/api/webhooks/payments` (signature verify, dedupe) + `/api/cron/run` (expiry, due auths, grace, reminders)
- [ ] Failure → grace → retry → cancel path
- [ ] StripePaymentProvider skeleton (test-mode only, documented checklist)

## Phase 6 — Admin
- [ ] Dashboard (platform KPIs)
- [ ] Users (verify/suspend) / Companies (verify/suspend)
- [ ] Shows + bookings oversight (cancel show, cancel booking)
- [ ] Payment oversight (manual release/capture where legal, payout approve/pause/cancel)
- [ ] Disputes (review evidence, resolve with actions)
- [ ] Audit log viewer (filters)
- [ ] Platform settings editor (templates + windows)

## Phase 7 — Testing & polish
- [ ] Vitest: money math, state machines, permission guards, webhook handling
- [ ] Playwright e2e: creator golden path, label golden path, admin dispute, permission denial
- [ ] Empty/loading/error states everywhere; responsive pass; a11y pass
- [ ] README: setup, env, migrate, seed, test, deploy; demo credentials
- [ ] Supabase advisors clean (security lints)

## Definition of Done — 16 acceptance criteria in PRODUCT_SPEC §9
