# ShowUp — Product Specification

> Working name: **ShowUp**. Branding is centralized in `src/lib/brand.ts` so it can be renamed later by changing one file.

## 1. Concept

ShowUp is a marketplace connecting **music labels, artist managers, and creator-marketing teams** with **influencers/creators** who want complimentary access to concerts in exchange for reliable attendance and optional social content.

- Labels/managers post tour dates and make a limited number of tickets available to creators.
- Creators browse eligible shows in their city, request one ticket or a ticket + `+1`, message the artist team, and agree to a **temporary card authorization** that encourages attendance.
- The creator is **never charged upfront**. Their payment method is authorized for a percentage of the stated ticket value chosen by the label.
- When attendance is verified, the authorization is **released**.
- When the agreed social deliverables are completed and approved, the creator **receives the agreed creator payment**.

### Non-negotiable messaging (shown throughout the product)

1. **Attend the show and you will not be charged.** Attendance releases the temporary hold.
2. **Complete the content deliverables and you earn the creator payment.**
3. **Attend + post** → hold released **and** payment received.
4. The authorization applies to **every ticket requested, including a `+1`**.
5. The authorization amount is **never** described as money the creator earns.

## 2. Users and roles

| Role | Description |
|---|---|
| `creator` | Influencer requesting complimentary tickets. Has a profile with city, socials, audience metrics, categories, example work. |
| `label` (company member) | Belongs to a company (label/management/marketing team). Roles within company: `owner`, `admin`, `member`. Manages artists, tours, shows, opportunities, requests, bookings, reviews. |
| `admin` | Platform administrator. Full oversight: users, companies, shows, bookings, authorizations, payouts, disputes, audit logs, platform settings. |

## 3. Core objects

- **Company** → has **members** (invited by email) → owns **Artists** → have **Tours** → contain **Shows** (at **Venues**).
- A Show has one **Opportunity**: tickets offered, stated ticket value, deposit percentage (template), creator payment, deliverables, application deadline, `+1` policy.
- A creator files a **Request** (1 or 2 tickets + pitch message) → label approves → **Booking** created (`awaiting_acceptance`, 24h deadline) → creator accepts terms + adds payment method → **confirmed**.
- Booking tracks **tickets** (per-ticket rows), an **authorization record**, an **attendance submission**, **content submissions**, and a **creator payment record**.
- Every request/booking has a **message thread**.
- **Disputes** can be raised on attendance/content/authorization outcomes; admins resolve them.
- Every sensitive action writes an **audit log** row.

## 4. Business rules (confirmed)

### Stated ticket value
- Set by the label per opportunity. Always labeled **“stated ticket value”** in the UI.

### Deposit percentage
- No arbitrary flat fees. Percentage templates only: **25% / 50% / 75% / 100%**.
- Templates live in `platform_settings` and are editable by admins.

### Deposit (authorization) calculation
```
authorization = stated ticket value × number of tickets × deposit percentage
```
Example: $100 ticket × 2 tickets × 50% = **$100 hold**. The hold covers the creator's ticket *and* the +1.

### Visibility rules
- Discovery cards prioritize: artist, city, venue, date, **creator payment**, deliverable summary, ticket availability. The deposit is *not* dominant on cards.
- The show detail page clearly shows: stated ticket value, selected percentage, ticket count options, and the calculated authorization.
- The full terms breakdown is shown **again** before the creator accepts a booking.

### Approval & confirmation workflow
1. Creator requests access (1 or 2 tickets, optional pitch).
2. Label reviews the request (profile + social metrics visible).
3. Label approves / rejects / waitlists / messages.
4. Approved creator has **24 hours** to accept (configurable via platform settings).
5. Creator reviews final terms and adds a payment method.
6. Booking becomes **confirmed** after the payment-method verification + terms acceptance succeed (authorization is scheduled, see §5).
7. If not accepted in 24h → approval **expires**, ticket inventory is released, spot can be offered to someone else.

### Attendance vs. content (independent tracks)
- **Attendance verified** → release authorization; attendance requirement complete.
- **Content approved** → pay the agreed creator payment; content requirement complete.
- Attend-without-posting → authorization released, **no** creator payment.
- No-show → booking enters `no_show_review`; label may capture the authorization; disputes go to admin.

### Attendance verification (MVP)
- Creator checks in via the app on show day and uploads timestamped proof (photo).
- Label confirms attendance.
- Admin resolves disputes.
- Code is structured behind an `AttendanceVerificationMethod` concept so QR, ticketing-provider, or geolocation verification can be added later.

### Creator compensation
- Fixed payment per opportunity set by the label ($0 = attend-only).
- UI always distinguishes: **complimentary ticket value** vs **temporary hold** vs **creator payment**.

### Ticket quantities
- Creator requests 1 ticket, or 1 + guest when the label allows `+1`.
- Each ticket is a separate `booking_tickets` row to support future partial no-show handling.

## 5. Payments (MVP model)

See `docs/PAYMENT_FLOW.md` for the complete design. Summary:

- Provider-agnostic `PaymentProvider` interface; **MockPaymentProvider** fully implements the lifecycle for development/tests; **StripePaymentProvider** adapter ships behind the same interface (inactive without sandbox keys).
- Card is saved + verified at acceptance; the **actual authorization is placed N days before the show** (admin-configurable window) because card-network holds expire (~7 days for standard authorizations).
- Authorization failure → notify creator → configurable grace period to fix the payment method → cancel booking if unresolved before deadline.
- All money amounts are **integer cents**, USD.

## 6. Messaging

- One thread per request/booking. Participants: the creator + the company's team members.
- Text messages + basic file/image attachments (Supabase Storage), timestamps, unread indicators.
- Personal email/phone stay private; the UI only exposes display names and in-app messaging.

## 7. Notifications

In-app notification center + email (provider abstraction; console transport in dev). Events: request submitted / approved / rejected / waitlisted, new message, approval expiring, booking confirmed, payment method problem, authorization successful, upcoming show reminder, ticket instructions received, attendance proof submitted, attendance approved, content deadline approaching, content submitted, content approved, payment released, show canceled/postponed.

## 8. Page inventory

**Public:** landing, how it works, for creators, for labels, sign in, sign up, privacy placeholder, terms placeholder.

**Creator:** onboarding, profile, discover (search/filter), show details, request modal, my requests, upcoming shows, booking details, messages, attendance submission, content submission, payments & authorization history, notification center, settings.

**Label:** company onboarding, dashboard, artists, artist details, tours, tour details, create/edit show, show dashboard, requests, creator profile review, booking details, messages, attendance review, content review, payments & campaign spending, team & permissions, company settings.

**Admin:** dashboard, users, companies, shows, bookings, payments & authorizations, disputes, audit logs, platform settings.

## 9. Definition of done (acceptance criteria)

1. A label can create an artist, tour, show, and creator opportunity.
2. A creator can discover a show and request 1–2 tickets.
3. The label can approve the request.
4. The creator has 24 hours to accept.
5. The authorization amount is calculated correctly for all requested tickets.
6. The booking can be confirmed using the mock payment provider.
7. The label and creator can message each other.
8. The creator can submit attendance proof.
9. The label can approve attendance and trigger authorization release.
10. The creator can submit a post URL and proof.
11. The label can approve the deliverable and trigger the creator payment.
12. Both sides see complete activity and payment history.
13. An administrator can review and resolve a dispute.
14. Permission tests prevent cross-company/creator data access.
15. Main workflows pass automated end-to-end tests.
16. README contains setup, migration, testing, and deployment instructions.
