-- DrawUp v24-03: architect license on file. A member submits their license (state + number); DrawUp HQ approves it.
-- Only approved architects can mark a detail "Verified by an architect" (v24-05). Additive and safe to run twice.
create table if not exists public.architect_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  full_name text not null,
  license_state text not null,
  license_number text not null,
  status text not null default 'pending',
  note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.architect_credentials drop constraint if exists architect_credentials_status_check;
alter table public.architect_credentials add constraint architect_credentials_status_check check (status in ('pending', 'approved', 'rejected'));
alter table public.architect_credentials enable row level security;
drop policy if exists "architect credentials own read" on public.architect_credentials;
create policy "architect credentials own read" on public.architect_credentials for select using (user_id = auth.uid() or public.is_drawup_admin());
drop policy if exists "architect credentials own insert" on public.architect_credentials;
create policy "architect credentials own insert" on public.architect_credentials for insert with check (user_id = auth.uid());
drop policy if exists "architect credentials own or hq update" on public.architect_credentials;
create policy "architect credentials own or hq update" on public.architect_credentials for update using (user_id = auth.uid() or public.is_drawup_admin()) with check (user_id = auth.uid() or public.is_drawup_admin());
grant select, insert, update on public.architect_credentials to authenticated;
select 'DONE v24-03 architect credentials table' as status;
