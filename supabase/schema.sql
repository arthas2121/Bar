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
  guest_name text,
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


-- Allow active staff members to clear the shared order queue.
drop policy if exists "Approved staff can delete orders" on public.orders;
create policy "Approved staff can delete orders"
on public.orders for delete
to authenticated
using (exists (select 1 from public.staff_users s where s.user_id = auth.uid() and s.is_active));

-- Enable Realtime for the staff order queue.
alter publication supabase_realtime add table public.orders;


-- Customer order tracking: expose only status for an order when its private token matches.
alter table public.orders add column if not exists tracking_token text;

create or replace function public.get_customer_order_status(
  p_order_id uuid,
  p_tracking_token text
)
returns table(id uuid, table_number text, status text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select o.id, o.table_number, o.status, o.created_at
  from public.orders o
  where o.id = p_order_id
    and o.tracking_token = p_tracking_token;
$$;

revoke all on function public.get_customer_order_status(uuid, text) from public;
grant execute on function public.get_customer_order_status(uuid, text) to anon, authenticated;


-- DYOD ingredient inventory and reservation requests
create table if not exists public.bar_ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  notes text,
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.bar_ingredients enable row level security;
drop policy if exists "Anyone can view available bar ingredients" on public.bar_ingredients;
create policy "Anyone can view available bar ingredients"
on public.bar_ingredients for select to anon, authenticated using (is_available = true);
drop policy if exists "Staff manage bar ingredients" on public.bar_ingredients;
create policy "Staff manage bar ingredients"
on public.bar_ingredients for all to authenticated
using (exists (select 1 from public.staff_users s where s.user_id = auth.uid() and s.is_active))
with check (exists (select 1 from public.staff_users s where s.user_id = auth.uid() and s.is_active));

create table if not exists public.bar_reservations (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null,
  contact text not null,
  reservation_date date not null,
  reservation_time time not null,
  party_size integer not null check (party_size between 1 and 30),
  notes text,
  status text not null default 'requested' check (status in ('requested','confirmed','declined')),
  created_at timestamptz not null default now()
);
alter table public.bar_reservations enable row level security;
drop policy if exists "Guests can request reservations" on public.bar_reservations;
create policy "Guests can request reservations"
on public.bar_reservations for insert to anon, authenticated with check (true);
drop policy if exists "Staff manage reservations" on public.bar_reservations;
create policy "Staff manage reservations"
on public.bar_reservations for all to authenticated
using (exists (select 1 from public.staff_users s where s.user_id = auth.uid() and s.is_active))
with check (exists (select 1 from public.staff_users s where s.user_id = auth.uid() and s.is_active));


-- Guest display name for identifying shared orders.
alter table public.orders add column if not exists guest_name text;
