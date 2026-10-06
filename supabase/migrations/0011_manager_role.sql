-- Management companies / agencies that represent creators get their own role.
-- A new enum value can't be used in the transaction that adds it, so this
-- lives in its own migration ahead of 0012.
alter type public.user_role add value if not exists 'manager';
