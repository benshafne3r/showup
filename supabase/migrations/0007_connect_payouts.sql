-- Stripe Connect (Express) creator payouts.
-- Each creator becomes a connected account (recipient) that receives transfers
-- after their content is approved. We store the account id + whether the
-- transfers capability is active so we never attempt a transfer to an account
-- that can't receive one.

alter table public.creator_profiles
  add column if not exists stripe_account_id text unique,
  add column if not exists stripe_payouts_enabled boolean not null default false,
  add column if not exists stripe_onboarded_at timestamptz;

comment on column public.creator_profiles.stripe_account_id is
  'Stripe Connect connected-account id (acct_…) for receiving transfers.';
comment on column public.creator_profiles.stripe_payouts_enabled is
  'True once the account''s transfers capability is active (set from account.updated / status sync).';
