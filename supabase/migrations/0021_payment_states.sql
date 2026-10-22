-- In-flight payment states. A hold or payout is marked "in progress" before
-- the provider call and only becomes final (released / captured / paid) once
-- the provider confirms, so a crash in between can't leave a false final
-- state. (Enum values must be committed before they're used, so they live in
-- their own migration; 0022 builds on them.)
alter type public.authorization_status add value if not exists 'releasing';
alter type public.authorization_status add value if not exists 'capturing';
alter type public.creator_payment_status add value if not exists 'paying';
