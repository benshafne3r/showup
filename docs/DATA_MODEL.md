# ShowUp — Data Model

Postgres 17 (hosted Supabase). All money = **integer cents** (USD). All timestamps `timestamptz`. Every table has `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at` (trigger-maintained) unless noted. RLS enabled on every table (see `docs/SECURITY.md`).

## Enums

| Enum | Values |
|---|---|
| `user_role` | `creator`, `label`, `admin` |
| `account_status` | `active`, `suspended` |
| `company_member_role` | `owner`, `admin`, `member` |
| `show_status` | `draft`, `published`, `canceled`, `postponed`, `completed` |
| `request_status` | `pending`, `approved`, `rejected`, `waitlisted`, `expired`, `withdrawn` |
| `booking_status` | `awaiting_acceptance`, `awaiting_payment_method`, `confirmed`, `authorization_failed`, `attended`, `no_show_review`, `completed`, `canceled`, `disputed` |
| `attendance_status` | `not_started`, `submitted`, `approved`, `rejected`, `disputed` |
| `content_status` | `not_required`, `pending`, `submitted`, `revision_requested`, `approved`, `rejected`, `disputed` |
| `authorization_status` | `not_scheduled`, `scheduled`, `pending`, `authorized`, `failed`, `released`, `captured`, `canceled` |
| `creator_payment_status` | `not_required`, `awaiting_funding`, `funded`, `pending_fulfillment`, `ready`, `paid`, `failed`, `disputed`, `canceled` |
| `ticket_kind` | `primary`, `plus_one` |
| `ticket_status` | `reserved`, `issued`, `used`, `unused`, `canceled` |
| `deliverable_platform` | `instagram_story`, `instagram_reel`, `instagram_post`, `tiktok_video`, `youtube_short`, `youtube_video`, `twitter_post`, `other` |
| `dispute_status` | `open`, `under_review`, `resolved`, `closed` |
| `dispute_kind` | `attendance`, `content`, `charge`, `other` |
| `notification_type` | (all events from spec — see `notifications`) |
| `message_kind` | `text`, `attachment`, `ticket_instructions`, `system` |
| `social_platform` | `instagram`, `tiktok`, `youtube`, `twitter`, `twitch`, `other` |

## Tables

### Identity & profiles
- **`users`** — mirrors `auth.users` (same id). `email`, `full_name`, `role user_role`, `status account_status`, `avatar_url`, `email_verified_at`. Created by trigger on `auth.users` insert (role from signup metadata).
- **`creator_profiles`** — 1:1 user. `city`, `country`, `bio`, `categories text[]`, `audience_size int`, `avg_views int`, `example_work jsonb` (url list), `onboarded_at`, `verified_at` (admin verification).
- **`creator_social_accounts`** — n:1 profile. `platform social_platform`, `handle`, `url`, `followers int`, `avg_views int`.

### Companies & catalog
- **`companies`** — `name`, `kind` (label/management/agency), `website`, `verified_at`, `suspended_at`, `onboarded_at`.
- **`company_members`** — user ↔ company, `role company_member_role`. Unique `(company_id, user_id)`.
- **`company_invites`** — `email`, `role`, `token`, `expires_at`, `accepted_at`. Claimed at signup/sign-in by email match.
- **`artists`** — n:1 company. `name`, `genre`, `image_url`, `spotify_url`, `instagram_handle`.
- **`venues`** — global list, created by labels inline. `name`, `city`, `state`, `country`, `address`, `capacity`.
- **`tours`** — n:1 artist (+ company denorm). `name`, `starts_on`, `ends_on`, `description`.
- **`shows`** — n:1 artist, optional tour, n:1 venue. `title` (optional override), `date`, `doors_time`, `start_time`, `status show_status`, `image_url`, `ticket_delivery_method` (`will_call`/`digital_transfer`/`guest_list`/`box_office`), `canceled_at`, `postponed_from`.

### Opportunities
- **`show_opportunities`** — 1:1 show. `stated_ticket_value_cents`, `deposit_percentage int` (must match an active template at creation), `creator_payment_cents`, `plus_one_allowed bool`, `tickets_total int`, `tickets_claimed int` (service-guarded), `application_deadline`, `content_deadline_days int` (days after show), `notes`, `published_at`. Check: `tickets_claimed BETWEEN 0 AND tickets_total`.
- **`deliverable_requirements`** — n:1 opportunity. `platform deliverable_platform`, `quantity`, `description`, `required bool` (false = attend-only extra).

### Requests & bookings
- **`show_requests`** — creator ↔ opportunity. `status request_status`, `ticket_count int` (1–2), `includes_plus_one bool`, `message`, `decided_at`, `decided_by`, `waitlisted_at`, `expired_at`, `withdrawn_at`. Unique partial index: one non-terminal request per (creator, opportunity).
- **`request_tickets`** — n:1 request, `kind ticket_kind`. (Kept for symmetric per-ticket tracking pre-booking.)
- **`bookings`** — 1:1 approved request. Snapshot of terms at approval: `stated_ticket_value_cents`, `deposit_percentage`, `authorization_amount_cents`, `creator_payment_cents`, `ticket_count`, `includes_plus_one`. Status machine field `status booking_status` + `attendance_status`, `content_status` denorm for list views. `acceptance_deadline_at`, `accepted_at`, `terms_accepted_at`, `terms_version`, `ticket_instructions`, `ticket_instructions_sent_at`, `canceled_at`, `cancel_reason`, `completed_at`.
- **`booking_tickets`** — n:1 booking. `kind ticket_kind`, `status ticket_status`. One row per ticket → future partial no-show support.

### Money
- **`payment_methods`** — n:1 user. `provider` (`mock`/`stripe`), `provider_method_id`, `brand`, `last4`, `exp_month`, `exp_year`, `verified_at`, `is_default`. **No PAN/PCI data ever stored.**
- **`authorization_records`** — n:1 booking (history kept; one active). `status authorization_status`, `amount_cents`, `provider`, `provider_intent_id`, `scheduled_for`, `authorized_at`, `released_at`, `captured_at`, `capture_amount_cents`, `failed_at`, `failure_reason`, `grace_deadline_at`, `attempt_count`, `idempotency_key unique`.
- **`creator_payment_records`** — n:1 booking. `status creator_payment_status`, `amount_cents`, `provider`, `provider_transfer_id`, `paid_at`, `failed_at`, `failure_reason`, `idempotency_key unique`.

### Fulfillment
- **`attendance_submissions`** — n:1 booking. `status attendance_status`, `checked_in_at`, `proof_paths text[]` (storage), `note`, `reviewed_by`, `reviewed_at`, `review_note`.
- **`content_submissions`** — n:1 booking, optional n:1 deliverable_requirement. `status content_status`, `post_url`, `proof_paths text[]`, `caption_note`, `submitted_at`, `reviewed_by`, `reviewed_at`, `review_note`.

### Communication
- **`message_threads`** — 1:1 request (carries over to booking). `creator_id`, `company_id`, `subject`, `last_message_at`.
- **`messages`** — n:1 thread. `sender_id`, `kind message_kind`, `body`, `attachment_paths text[]`, `read_by uuid[]` (simple MVP read tracking).
- **`notifications`** — n:1 user. `type notification_type`, `title`, `body`, `link`, `read_at`, `emailed_at`.

### Governance
- **`disputes`** — n:1 booking. `kind dispute_kind`, `status dispute_status`, `opened_by`, `reason`, `evidence_paths text[]`, `resolution`, `resolved_by`, `resolved_at`.
- **`audit_logs`** — append-only. `actor_id`, `actor_role`, `action` (verb string, e.g. `booking.approve_attendance`), `entity_type`, `entity_id`, `company_id`, `metadata jsonb`, `ip`. No UPDATE/DELETE grants.
- **`platform_settings`** — `key text pk`, `value jsonb`, `updated_by`. Keys: `deposit_percentage_templates` (`[25,50,75,100]`), `acceptance_window_hours` (24), `authorization_window_days` (5), `payment_method_grace_days` (3), `content_deadline_default_days` (7).

## Key integrity rules

- **Terms snapshot:** approval copies opportunity economics onto the booking; later opportunity edits never mutate existing bookings.
- **Inventory:** `tickets_claimed` changes only via service-layer status-guarded UPDATEs (`... WHERE tickets_claimed + n <= tickets_total`), never from the client.
- **State machines:** every transition validated against `src/lib/statuses.ts` maps both in app code and by `CHECK`-friendly guarded updates (`UPDATE ... WHERE status = 'expected'` and verify affected-rows = 1) to kill double-approve/double-capture races.
- **Idempotency:** provider mutations carry unique `idempotency_key`s stored on the money records.
- **Storage:** proof/attachment files in private buckets (`proofs`, `attachments`, `avatars`, `artists`); DB stores paths; access via short-lived signed URLs generated server-side after permission checks.
