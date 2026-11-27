-- Ace Bar DYOD bartender feedback
-- Run once in Supabase Dashboard > SQL Editor after deploying the site update.
create table if not exists public.dyod_feedback (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  recipe_name text not null,
  feedback text not null check (feedback in ('excellent','balanced','too_sour','too_sweet','too_strong','too_weak','poor_match','other')),
  notes text,
  created_at timestamptz not null default now()
);
alter table public.dyod_feedback enable row level security;
drop policy if exists "Approved staff can manage DYOD feedback" on public.dyod_feedback;
create policy "Approved staff can manage DYOD feedback"
on public.dyod_feedback for all to authenticated
using (exists (select 1 from public.staff_users s where s.user_id = auth.uid() and s.is_active))
with check (exists (select 1 from public.staff_users s where s.user_id = auth.uid() and s.is_active));
