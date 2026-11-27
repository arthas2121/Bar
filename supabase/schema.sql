-- The Pour House: Supabase setup
-- Run this in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  table_number text not null,
  items jsonb not null,
  total numeric(10,2) not null check (total >= 0),
  status text not null default 'received' check (status in ('received','preparing','ready')),
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

-- Customers can submit orders without creating accounts.
create policy "Anyone can submit an order"
on public.orders for insert
to anon, authenticated
with check (true);

-- Only signed-in staff can view and update the order queue.
create policy "Staff can view orders"
on public.orders for select
to authenticated
using (true);

create policy "Staff can update order status"
on public.orders for update
to authenticated
using (true)
with check (status in ('received','preparing','ready'));

-- Enable Realtime for the staff order queue.
alter publication supabase_realtime add table public.orders;
