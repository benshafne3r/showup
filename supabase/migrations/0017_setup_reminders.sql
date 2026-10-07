-- "Finish your setup" nudges for creators who signed up but never finished
-- their profile or added a card (scheduled job, services/setup-reminders.ts).
alter type public.notification_type add value if not exists 'setup_reminder';
