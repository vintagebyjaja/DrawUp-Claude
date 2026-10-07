-- 0039 DrawUp v21 Detail Library (see /mnt/project-files/drawup/v21/sql-parts/details)

-- ===== 0039a_detail_finds_tables.sql
-- DrawUp v21 Detail Library, part A: shared detail database of details members
-- searched for in Arch Coach or DrawUp Search. Additive and safe to run twice.
create table if not exists public.detail_finds (
  id uuid primary key default gen_random_uuid(),
  query_key text not null unique,
  title text not null,
  category text not null default 'Typical Details',
  first_query text,
  sources jsonb not null default '[]'::jsonb,
  sources_seen text[] not null default array[]::text[],
  last_source text,
  hits integer not null default 1,
  status text not null default 'unconfirmed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.detail_finds drop constraint if exists detail_finds_status_check;
alter table public.detail_finds add constraint detail_finds_status_check
  check (status in ('unconfirmed', 'reviewed', 'hidden'));
create index if not exists detail_finds_category_idx on public.detail_finds (category);
create index if not exists detail_finds_seen_idx on public.detail_finds (last_seen_at desc);

create table if not exists public.detail_find_events (
  id bigint generated always as identity primary key,
  find_id uuid references public.detail_finds(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  source text not null,
  query text,
  attached boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists detail_find_events_user_idx
  on public.detail_find_events (user_id, source, created_at desc);
create index if not exists detail_find_events_find_idx on public.detail_find_events (find_id);

alter table public.detail_finds enable row level security;
alter table public.detail_find_events enable row level security;

drop policy if exists "detail finds readable" on public.detail_finds;
create policy "detail finds readable" on public.detail_finds
  for select using (status <> 'hidden' or public.is_drawup_admin());
drop policy if exists "detail finds admin review" on public.detail_finds;
create policy "detail finds admin review" on public.detail_finds
  for update using (public.is_drawup_admin()) with check (public.is_drawup_admin());
drop policy if exists "detail find events own" on public.detail_find_events;
create policy "detail find events own" on public.detail_find_events
  for select using (user_id = auth.uid());

grant select on public.detail_finds to anon, authenticated;
grant update (status, title, category) on public.detail_finds to authenticated;
grant select on public.detail_find_events to authenticated;

select 'DONE 0039a_detail_finds_tables' as status;

-- ===== 0039b_detail_finds_note.sql
-- DrawUp v21 Detail Library, part B: one call records a detail query (deduplicated by
-- query_key) and its event. Called only by the server with the service role.
create or replace function public.drawup_detail_find_note(
  p_key text, p_title text, p_category text, p_query text, p_source text, p_user uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
  with up as (
    insert into detail_finds as f (query_key, title, category, first_query, sources_seen, last_source)
    values (p_key, p_title, p_category, p_query, array[p_source], p_source)
    on conflict (query_key) do update set
      hits = f.hits + 1,
      last_seen_at = now(),
      updated_at = now(),
      last_source = excluded.last_source,
      sources_seen = (select array_agg(distinct s) from unnest(f.sources_seen || excluded.sources_seen) s)
    returning f.id
  ), ev as (
    insert into detail_find_events (find_id, user_id, source, query)
    select up.id, p_user, p_source, p_query from up
    returning find_id
  )
  select find_id from ev
$$;

revoke all on function public.drawup_detail_find_note(text, text, text, text, text, uuid) from public;
revoke all on function public.drawup_detail_find_note(text, text, text, text, text, uuid) from anon, authenticated;
grant execute on function public.drawup_detail_find_note(text, text, text, text, text, uuid) to service_role;

select 'DONE 0039b_detail_finds_note' as status;

-- ===== 0039c_details_firm_profile.sql
-- DrawUp v21 Detail Library, part C: firm uploads can attach to the firm profile.
-- Adds columns to details only, keeps every existing row and policy.
alter table public.details add column if not exists firm_id uuid references public.firms(id) on delete set null;
alter table public.details add column if not exists show_on_firm boolean not null default false;
alter table public.details add column if not exists material text;
alter table public.details add column if not exists assembly text;
create index if not exists details_firm_id_idx on public.details (firm_id);

create or replace function public.drawup_is_firm_member(p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from firm_members m where m.firm_id = p_firm and m.user_id = auth.uid())
$$;
grant execute on function public.drawup_is_firm_member(uuid) to authenticated;

-- Coworkers can read their firm library. The public reads details a firm admin put on the profile.
drop policy if exists "details firm members read" on public.details;
create policy "details firm members read" on public.details
  for select using (firm_id is not null and public.drawup_is_firm_member(firm_id));
drop policy if exists "details on firm profile" on public.details;
create policy "details on firm profile" on public.details
  for select using (firm_id is not null and show_on_firm and status = 'published');

-- Restrictive: only members may tag their firm, only firm admins may show it on the profile.
drop policy if exists "details firm tag check ins" on public.details;
create policy "details firm tag check ins" on public.details as restrictive
  for insert with check (
    firm_id is null or (public.drawup_is_firm_member(firm_id)
      and (not show_on_firm or public.is_firm_admin(firm_id))));
drop policy if exists "details firm tag check upd" on public.details;
create policy "details firm tag check upd" on public.details as restrictive
  for update using (true) with check (
    firm_id is null or public.is_drawup_admin() or (public.drawup_is_firm_member(firm_id)
      and (not show_on_firm or public.is_firm_admin(firm_id))));

drop policy if exists "detail assets firm read" on public.detail_assets;
create policy "detail assets firm read" on public.detail_assets
  for select using (exists (select 1 from public.details d where d.id = detail_assets.detail_id
    and d.firm_id is not null
    and ((d.show_on_firm and d.status = 'published') or public.drawup_is_firm_member(d.firm_id))));

select 'DONE 0039c_details_firm_profile' as status;
