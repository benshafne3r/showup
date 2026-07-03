# ShowUp — Implementation Plan & Checklist

Stack: Next.js 16 (App Router, TS strict) · Tailwind v4 + shadcn/ui · Supabase (hosted Postgres 17, Auth, RLS, Storage) · Zod + React Hook Form · Vitest · Playwright · Mock payment provider (+ Stripe adapter skeleton) · Email provider abstraction (console/Resend).

## Phase 1 — Planning ✅
- [x] PRODUCT_SPEC / USER_FLOWS / DATA_MODEL / PAYMENT_FLOW / SECURITY / IMPLEMENTATION_PLAN / ASSUMPTIONS

## Phase 2 — Foundation ✅
- [x] git init, Next.js scaffold (TS, Tailwind v4, src dir, App Router)
- [x] shadcn/ui init + base components; design tokens (dark, music-forward)
- [x] `.env.example` + typed env access (`src/lib/env.ts`)
- [x] Supabase project (hosted) + `supabase/migrations`:
  - [x] `0001_schema.sql` — enums, tables, indexes, triggers
  - [x] `0002_rls.sql` — RLS policies + helper functions
  - [x] `0003_settings_and_storage.sql` — settings defaults, storage buckets
  - [x] `0004_function_hygiene.sql` — advisor fixes (search_path, RPC surface)
  - [x] `0005_inventory_functions.sql` — atomic reserve/release + read-state
- [x] Typed Supabase clients (browser anon / server anon+cookies / service role)
- [x] Auth: sign-up with role, sign-in, sign-out, proxy guards, `guards.ts`
- [x] Seed script with full demo dataset + demo credentials in README

## Phase 3 — Creator experience ✅
- [x] Onboarding wizard (city, socials, categories, metrics, example work)
- [x] Discover grid + search/filters (deposit de-emphasized per spec)
- [x] Show detail with full economics breakdown + deliverables + deadline
- [x] Request modal (1 or +1, pitch) + withdraw
- [x] My requests / Bookings (active + history)
- [x] Acceptance flow (countdown → terms review → card verify → consent → confirm)
- [x] Booking detail with activity timeline, hold status, instructions
- [x] Messaging (threads, attachments, unread badges)
- [x] Attendance submission (show-day check-in + photo proof)
- [x] Content submission (post URL + proof) / dispute dialog
- [x] Payments & authorization history / notification center / settings

## Phase 4 — Label experience ✅
- [x] Company onboarding + team invites (owner/admin/member)
- [x] Dashboard (queues, spend, upcoming shows, recent bookings)
- [x] Artists CRUD / Tours CRUD / venues inline / shows CRUD + cancel/postpone
- [x] Opportunity form (stated value, % templates from settings, payment, deliverables, +1, deadline, hold preview)
- [x] Show dashboard (inventory, requests, bookings, stats)
- [x] Request review (profile + metrics + history signal; approve/reject/waitlist; +1 confirmation)
- [x] Ticket instructions (mirrored into thread)
- [x] Attendance review queue + booking-level review (approve releases hold; reject → no-show review; capture/excuse)
- [x] Content review queue (approve & pay / revision / reject)
- [x] Payments & campaign spend + attendance/completion analytics
- [x] Team & permissions / company settings

## Phase 5 — Payments ✅
- [x] `PaymentProvider` interface + env-selected registry
- [x] MockPaymentProvider (verify/authorize/release/capture/payout, test cards, signed webhooks, DB-backed state)
- [x] `services/payments.ts` — scheduled authorization, retry, grace, idempotency keys, status-guarded claims
- [x] `/api/webhooks/payments` (signature verify + dedupe) + `/api/cron/run` (secret-protected)
- [x] Failure → notify → grace → retry → cancel path
- [x] StripePaymentProvider skeleton (test-mode-only guard + production checklist)

## Phase 6 — Admin ✅
- [x] Dashboard (platform KPIs + manual job runner)
- [x] Users (verify/suspend) / companies (verify/suspend)
- [x] Shows + bookings oversight with cancel overrides
- [x] Payment oversight (manual release/capture where state-legal; payout pay/pause/cancel)
- [x] Disputes (evidence review, five resolution outcomes)
- [x] Audit log viewer with filters
- [x] Platform settings editor (deposit templates + windows)

## Phase 7 — Testing & polish ✅
- [x] Vitest: deposit calculation, all six state machines, webhook signature verification (34 tests)
- [x] Playwright e2e: golden path (label → creator → attendance → content → payout), admin dispute resolution, permission boundaries, endpoint security
- [x] Empty states, loading/error states, responsive layouts, a11y (labels, focus, roles, status text)
- [x] README with setup, migrations, seeding, testing, deployment
- [x] Supabase security advisors addressed (0004)

## Definition of Done — see PRODUCT_SPEC §9 (all 16 criteria covered by the e2e suite + manual flows)
