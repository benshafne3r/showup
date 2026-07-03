-- ShowUp — platform settings defaults + storage buckets

insert into public.platform_settings (key, value) values
  ('deposit_percentage_templates', '[25, 50, 75, 100]'),
  ('acceptance_window_hours', '24'),
  ('authorization_window_days', '5'),
  ('payment_method_grace_days', '3'),
  ('content_deadline_default_days', '7')
on conflict (key) do nothing;

-- Storage buckets. All uploads flow through the server (service role) after
-- MIME/size validation, so no client write policies are created.
-- avatars + artist-images are public-read (display assets, no PII);
-- proofs + attachments are private and served via short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',       'avatars',       true,  5242880,  array['image/jpeg','image/png','image/webp']),
  ('artist-images', 'artist-images', true,  10485760, array['image/jpeg','image/png','image/webp']),
  ('proofs',        'proofs',        false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('attachments',   'attachments',   false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
