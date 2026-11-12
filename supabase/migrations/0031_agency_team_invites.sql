-- Management companies can invite teammates (like label team invites). The
-- role they join with is picked on the invite: 'admin' or 'member'.
alter table public.agency_invites
  add column if not exists role public.company_member_role not null default 'member';
