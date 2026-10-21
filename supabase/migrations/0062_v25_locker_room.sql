-- DrawUp v25-03: The Locker Room. Saved ideas, bookmarked messages, approved decisions, rejected alternatives,
-- 6th Man plays, Coach findings and project notes. Items can belong to a project (they then feed that
-- project's memory for the whole AI Design Team) or stand alone. Owner-only. Additive and safe to run twice.
create table if not exists public.locker_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_thread_id uuid references public.project_threads(id) on delete set null,
  coach_thread_id uuid references public.coach_threads(id) on delete set null,
  message_id uuid references public.coach_messages(id) on delete set null,
  kind text not null default 'idea',
  title text not null,
  body text not null default '',
  speaker text,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locker_items_kind_check check (kind in ('idea','bookmark','decision','rejected','play','finding','note','unfinished','proposal')),
  constraint locker_items_title_len check (char_length(title) between 1 and 200),
  constraint locker_items_body_len check (char_length(body) <= 20000)
);
create index if not exists locker_items_owner_idx on public.locker_items (owner_id, created_at desc);
create index if not exists locker_items_project_idx on public.locker_items (project_thread_id, created_at desc) where project_thread_id is not null;

alter table public.locker_items enable row level security;
drop policy if exists "locker own read" on public.locker_items;
create policy "locker own read" on public.locker_items for select to authenticated using (owner_id = auth.uid());
drop policy if exists "locker own insert" on public.locker_items;
create policy "locker own insert" on public.locker_items for insert to authenticated with check (
  owner_id = auth.uid()
  and (project_thread_id is null or exists (select 1 from public.project_threads p where p.id = project_thread_id and p.owner_id = auth.uid()))
  and (coach_thread_id is null or public.drawup_coach_thread_member(coach_thread_id)));
drop policy if exists "locker own update" on public.locker_items;
create policy "locker own update" on public.locker_items for update to authenticated using (owner_id = auth.uid()) with check (
  owner_id = auth.uid()
  and (project_thread_id is null or exists (select 1 from public.project_threads p where p.id = project_thread_id and p.owner_id = auth.uid())));
drop policy if exists "locker own delete" on public.locker_items;
create policy "locker own delete" on public.locker_items for delete to authenticated using (owner_id = auth.uid());
grant select, insert, update, delete on public.locker_items to authenticated;

select 'DONE v25-03 locker room' as status;
