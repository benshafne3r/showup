# ShowUp — User Flows

## 1. Creator signup → first booking (golden path)

```
Sign up (role: creator)
  → Onboarding wizard: name, city, socials (platform, handle, followers, avg views),
    categories, example work links, bio
  → Discover: shows in my city (searchable, filterable by city/date/payment/deliverable)
  → Show detail: artist imagery, venue, date/time, creator payment, deliverables,
    availability, application deadline
      + "Ticket & hold details" section: stated ticket value, deposit %, per-ticket math,
        computed hold for 1 or 2 tickets
  → Request access (modal): 1 ticket or +1 (if allowed), pitch message / content idea
  → Request = pending. Thread created. Notification to label.
```

## 2. Label review → approval

```
Label dashboard → Requests inbox (per show or global)
  → Open request: creator profile, social metrics, example work, pitch, ticket count (+1 flagged)
  → Actions: Approve | Reject | Waitlist | Message
  → Approve: confirms ticket count (can decline the +1 if allowed), inventory is held,
    booking created status=awaiting_acceptance, acceptance_deadline = now + 24h
  → Creator notified (in-app + email)
```

## 3. Creator acceptance → confirmed booking

```
Creator → My Requests → Approved card shows countdown (24h)
  → Accept flow (3 steps):
    1. Review final terms: show, tickets, stated ticket value, deposit %, computed hold,
       creator payment, deliverables + deadlines, cancellation rules. Explicit copy:
       "Attend and you won't be charged. Post and you get paid."
    2. Payment method: add card via provider (mock in dev). Card verified.
    3. Agree: checkbox consent to the temporary authorization terms (records timestamp,
       terms version, amount, IP)
  → Booking = confirmed. Authorization scheduled for (show_date − auth_window_days).
    If the show is within the window → authorization placed immediately.
  → If deadline passes without acceptance → approval expires, inventory released,
    request = expired. Label may approve someone else.
```

## 4. Pre-show: authorization placement

```
Cron (or admin manual run) finds due scheduled authorizations
  → PaymentProvider.authorize(amount, payment_method, idempotency_key)
  → success: authorization = authorized. Creator notified ("hold placed, attend to release").
  → failure: booking = authorization_failed. Creator notified with grace deadline
    (configurable days). Creator updates card → retry.
  → unresolved by deadline (or show date) → booking canceled, inventory released,
    label notified.
```

## 5. Show day: attendance

```
Creator → Booking details → "Check in" (available on show day)
  → Upload timestamped photo / proof + optional note → attendance = submitted
  → Label → Attendance review queue → view proof → Approve | Reject
    → Approve: authorization released (provider call), attendance = approved,
      booking = attended (or completed if no content required). Creator notified.
    → Reject: booking = no_show_review. Options: capture hold | excuse (release).
      Creator may dispute → admin resolves.
```

## 6. Post-show: content

```
Creator → Booking details → Content tab → submit deliverable: post URL + screenshot proof
  → content = submitted → label review: Approve | Request revision | Reject
    → Approve: creator payment released (provider payout), content = approved,
      booking = completed
    → Revision: content = revision_requested, creator resubmits
    → Reject: no payment; creator may dispute → admin resolves
Attend-only opportunities skip this track (content = not_required, payment = not_required).
```

## 7. Messaging

```
Any request/booking → Thread
  Creator ↔ company members. Attachments (images/pdf ≤ 10 MB). Unread badges in nav.
  Ticket delivery instructions are sent as a special "instructions" message type +
  stored on the booking so they're always findable.
```

## 8. Label setup flow

```
Sign up (role: label) → Company onboarding: company name, type (label/management/agency),
  website → creates company + owner membership
  → Invite team members by email (role: admin/member) — invite becomes membership at signup
  → Create artist (name, genre, image)
  → Create tour (name, artist) → add shows (venue: name/city/address, date, time,
    ticket qty, delivery method)
  → Publish opportunity per show: stated ticket value, deposit % (template), creator
    payment, deliverables, +1 policy, application deadline
```

## 9. Cancellation / postponement

```
Label (or admin) cancels a show
  → all active bookings → canceled; scheduled authorizations canceled; active holds released;
    creators + team notified; audit logged.
Postponement: show date updated + status=postponed → bookings stay, authorization
  schedule recalculated, everyone notified.
```

## 10. Disputes

```
Creator or label opens dispute on a booking (attendance / content / charge)
  → dispute = open, booking = disputed (freeze money movement)
  → Admin reviews evidence (proof uploads, thread, audit trail)
  → Resolution actions: release hold / capture hold / pay creator / deny payment / notes
  → dispute = resolved, booking returns to the correct terminal state, audit logged
```

## 11. Admin oversight

```
Admin dashboard: platform KPIs (users, active shows, pending disputes, holds volume)
  → Users: verify / suspend
  → Companies: verify / suspend
  → Bookings: inspect any; manual authorization release/capture when state-legal
  → Payouts: approve / pause / cancel
  → Settings: deposit % templates, acceptance window hours, auth window days,
    payment grace days
  → Audit logs: filterable ledger of sensitive actions
```
