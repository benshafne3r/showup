# HANDOFF — ShowUp (CreatorTickets Platform)

_Last updated: 2026-07-05_

## Current state
ShowUp is a marketplace where music labels offer free concert tickets to creators
in exchange for attendance + optional content (card gets a temporary hold, released
on attendance). Phases 4–7 are complete: label app, admin app, payment system (mock
provider default), and a test suite (Vitest 34 unit, Playwright 18 e2e, all green).
Landing page was recently redesigned and Geist font wiring fixed. App runs end-to-end
on demo data.

## In progress
- **Event provider integration** (untracked, `src/server/providers/events/`):
  `ticketmaster.ts`, `bandsintown.ts`, `demo.ts`, `index.ts`, `types.ts` — abstraction
  to import real shows. Not yet wired/committed.
- **Label show import UI** (untracked): `src/app/label/import-actions.ts`,
  `src/app/label/shows/import-panel.tsx`, `src/app/label/shows/importable-show-form.tsx`.
- **New logo component** (untracked): `src/components/logo.tsx`.
- Uncommitted edits across layouts, `globals.css`, `app-shell.tsx`, `seed.ts` — tied
  to the landing/branding refresh and the import feature.

## Next steps
1. Finish wiring the event-provider import flow into the label "new show" path and
   test the import panel end-to-end.
2. Commit the event-provider + import-UI + logo work (currently all untracked).
3. Run `npm test` and `npm run test:e2e` after wiring; fix any regressions.

## Key decisions
- Branding is centralized in `src/lib/brand.ts` for easy renaming.
- Payments and email both use provider abstractions; defaults are mock/console (no real
  money, no real sends). Stripe + Resend are adapter skeletons only.
- **This is a modified Next.js (v16)** — APIs/conventions differ from stock. Read the
  relevant guide in `node_modules/next/dist/docs/` before writing Next code (see AGENTS.md).

## Gotchas / setup
- Run: `npm run dev` · Seed demo data: `npm run seed` · Cron: `npm run cron`
- Tests: `npm test` (unit) · `npm run test:e2e` (Playwright) · `npm run typecheck` · `npm run lint`
- Supabase-backed (Postgres 17, Auth, RLS, Storage). Hosted ref: `mvtmomgepsgrqptsfqak`.
- Planning docs live in `docs/`.

## Open questions
- Which event provider(s) go live first — Ticketmaster, Bandsintown, or demo-only for now?
- Should imported shows be committed before or after the import UI is fully tested?
