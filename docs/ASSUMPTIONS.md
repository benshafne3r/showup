# ShowUp — MVP Assumptions

Decisions made without asking, per the brief ("make reasonable MVP assumptions and record them"). Each is reversible.

## Money & payments
1. **USD only**; all amounts stored as integer cents. Multi-currency is a later column (`currency`) away.
2. **No platform fee/commission** in MVP. Campaign spend analytics report label-side costs only.
3. **Mock provider is the default** (`PAYMENT_PROVIDER=mock`). The Stripe adapter ships behind the same interface but activates only with `sk_test_` sandbox keys; it refuses live keys.
4. **No-show capture is all-or-nothing** in MVP (full authorization amount). Per-ticket partial capture is supported by the data model (`booking_tickets`) but not the UI.
5. Creator payouts in the mock provider settle instantly. Production path documented as Stripe Connect Express (requires creator KYC onboarding — out of MVP scope).
6. Authorization window default **5 days** before show; payment-method grace period default **3 days**; both admin-editable platform settings.
7. If a card hold fails on the day of the show, the booking is canceled rather than letting the creator attend unheld.

## Product behavior
8. **One opportunity per show** (1:1). Multiple creator tiers per show is a v2 concept.
9. **Acceptance window 24 hours** (admin-configurable `acceptance_window_hours`).
10. A creator may hold **one active request per opportunity**; withdrawn/rejected/expired allows re-request only if the deadline hasn't passed.
11. Approving a request **immediately reserves inventory**; expiry/cancel releases it. Waitlist does not reserve.
12. The label can approve a +1 request as single-ticket (confirming ticket count at approval, per spec); the creator sees the change before accepting.
13. **Content deadline** = configurable days after the show (default 7, per-opportunity override).
14. Social metrics (followers, avg views) are **self-reported** at onboarding. No TikTok/IG OAuth in MVP.
15. Attendance check-in becomes available **on the show date** (venue-local date approximated by show date, no timezone table in MVP; shows store a single local date/time).
16. Ticket delivery = free-text instructions (+ a structured `ticket_delivery_method` field) sent via the thread and stored on the booking. No ticketing-provider integration yet; the attendance module is structured for QR/provider/geo verification later.
17. Creators cannot cancel a confirmed booking in-app in MVP; they message the label (label/admin cancel). Withdrawing is only possible while a request is pending/waitlisted.
18. Postponed shows keep bookings alive and recompute authorization schedules; creators are notified and may ask the label to cancel.
19. **Team invites**: email invite with token; membership is claimed when that email signs up / signs in. Invite emails log to console in dev.
20. Demo/dev email transport is the console (`EMAIL_PROVIDER=console`); Resend activates with an API key. Emails are best-effort (failures logged, never block the action).

## Platform
21. Hosted Supabase project (`showup`, org "50 - 50", us-east-1, $10/mo — user approved) is the dev database. e2e tests run against it with seeded data.
22. Admin accounts are created by seed (dev) or manual SQL (documented in README) — no self-serve admin signup.
23. Cron = secret-protected route hit by Vercel Cron in production or `npm run cron` locally; plus lazy expiry on read so UIs are truthful without the cron.
24. In-app notifications + email only; SMS/push are stubs behind the `NotificationChannel` abstraction.
25. Messaging read-state is a simple `read_by uuid[]` per message (fine at MVP scale).
26. Brand name is centralized in `src/lib/brand.ts` (name, tagline) for easy renaming.
27. Images: artist/show imagery uploaded by labels or seeded gradients; no external image API dependency.
28. Timezones: dates render in the viewer's locale with the raw venue-local date/time shown as stored; a `venue.timezone` column is a later addition.
