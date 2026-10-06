-- Content verification + view tracking: the cron confirms each submitted post
-- is still live and pulls its view/like counts (TikTok first — other platforms
-- stay 'unchecked'). A separate axis from the human review `status`, which
-- gates payouts and must never be written by a scraper.
-- 'gone' means CONFIRMED deleted/private; an inconclusive lookup is 'unknown'.
create type public.content_verification_status as enum ('unchecked', 'live', 'gone', 'unknown');

alter table public.content_submissions
  add column verification_status public.content_verification_status not null default 'unchecked',
  add column platform public.social_platform,
  add column view_count integer,
  add column like_count integer,
  add column last_checked_at timestamptz;

-- The verification job picks least-recently-checked reviewable posts first.
create index content_submissions_check_due_idx
  on public.content_submissions (last_checked_at asc nulls first)
  where status in ('submitted', 'approved');
