-- Card holds expire on their own: Visa merchant-initiated holds after 4 days
-- 18 hours, other networks after ~7 days. Track each hold's real expiry
-- (Stripe's capture_before), mark lapsed holds 'expired', remind labels to
-- decide on no-shows before then, and place holds 2 days before the show
-- (was 5, which outlived Visa holds before the show even started).

alter type public.authorization_status add value if not exists 'expired';
alter type public.notification_type add value if not exists 'no_show_decision_due';

alter table public.authorization_records
  add column expires_at timestamptz;

-- The cron scans active holds by expiry.
create index authorization_records_active_expiry_idx
  on public.authorization_records (expires_at)
  where status = 'authorized';

update public.platform_settings
  set value = '2'::jsonb
  where key = 'authorization_window_days' and value = '5'::jsonb;
