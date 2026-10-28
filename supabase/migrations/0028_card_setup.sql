-- Cards are saved through a SetupIntent (Stripe's "save a card for later"
-- flow): the bank confirms the card once, up front, so later off-session
-- charges (holds, label content charges) aren't declined for authentication.

-- Each person's payment-provider customer, stored instead of searched for
-- (search lags and could mint a duplicate customer).
alter table public.users add column payment_customer_id text unique;

-- The confirmed SetupIntent a saved card came from (null = saved before this,
-- without the bank's up-front confirmation).
alter table public.payment_methods add column setup_intent_id text;
