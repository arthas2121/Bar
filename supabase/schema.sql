-- The Pour House: Supabase setup
-- Run this in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.staff_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true
);
alter table public.staff_users enable row level security;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  table_number text not null,
  items jsonb not null,
  total numeric(10,2) not null check (total >= 0),
  status text not null default 'received' check (status in ('received','preparing','ready')),
  created_at timestamptz not null default now()
);
alter table public.orders enable row level security;

-- Public customers may submit orders, but cannot read the order queue.
create policy "Anyone can submit an order"
on public.orders for insert
to anon, authenticated
with check (true);

-- Only user IDs explicitly added to staff_users can read/update orders.
create policy "Approved staff can view orders"
on public.orders for select
to authenticated
using (exists (select 1 from public.staff_users s where s.user_id = auth.uid() and s.is_active));

create policy "Approved staff can update orders"
on public.orders for update
to authenticated
using (exists (select 1 from public.staff_users s where s.user_id = auth.uid() and s.is_active))
with check (exists (select 1 from public.staff_users s where s.user_id = auth.uid() and s.is_active)
  and status in ('received','preparing','ready'));

-- After creating a staff login in Supabase Authentication > Users,
-- add that user's UUID here using the SQL Editor:
-- insert into public.staff_users (user_id) values ('PASTE-STAFF-AUTH-USER-UUID');

-- Enable Realtime for the staff order queue.
alter publication supabase_realtime add table public.orders;
