-- Labels can mark a creator attended in one tap (no creator check-in needed),
-- and can let photo check-ins release automatically when nobody reviews them.

alter table public.companies
  add column auto_release_attendance boolean not null default true;

alter table public.attendance_submissions
  drop constraint attendance_submissions_method_check;
alter table public.attendance_submissions
  add constraint attendance_submissions_method_check
  check (method in ('photo', 'location', 'label'));

-- The auto-release job scans unreviewed check-ins by age.
create index attendance_submissions_unreviewed_idx
  on public.attendance_submissions (created_at)
  where status = 'submitted';
