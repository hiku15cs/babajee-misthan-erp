-- First create these two users in Supabase Dashboard > Authentication > Users.
-- Supabase Auth hashes each password and creates the auth.users records.
-- Replace both email addresses and names below with the actual owners' details.
-- Run this seed from the Supabase SQL Editor (or with the service-role CLI context).
--
-- Never insert plaintext passwords into SQL or edit auth.users.encrypted_password.

insert into public.profiles (id, full_name, role, is_active)
select u.id, seed.full_name, 'OWNER'::public.user_role, true
from (
  values
    ('BROTHER_ONE_EMAIL@example.com', 'Brother One'),
    ('BROTHER_TWO_EMAIL@example.com', 'Brother Two')
) as seed(email, full_name)
join auth.users as u on lower(u.email) = lower(seed.email)
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    is_active = true;

do $$
begin
  if (
    select count(*)
    from public.profiles p
    join auth.users u on u.id = p.id
    where lower(u.email) in (
      lower('BROTHER_ONE_EMAIL@example.com'),
      lower('BROTHER_TWO_EMAIL@example.com')
    )
      and p.role = 'OWNER'
  ) <> 2 then
    raise exception
      'Expected two matching Auth users. Create both users and replace the example emails before running this seed.';
  end if;
end
$$;
