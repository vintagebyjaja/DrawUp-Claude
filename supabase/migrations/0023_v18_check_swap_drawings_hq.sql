-- DrawUp V18 — DrawUp Check, DrawUp Swap, Draw (geometry + dimensions), HQ owner console
--
-- Run AFTER 0020. Additive and idempotent: it only creates tables/policies/functions
-- that do not exist yet (or replaces V18's own functions/policies). It never drops a
-- table, column or row, and it is safe to run more than once.
--
-- Security model
--   * Members can only see and create their own Check reviews, Swap generations and
--     drawings. Results (findings, generated images, credits charged) are written only
--     by the DrawUp server with the service role — a member cannot fake a review.
--   * HQ (owner console) actions require is_drawup_admin(): account_type 'founder'
--     or 'drawup_admin'. Campus managers, organization managers, firm admins and
--     students are NOT DrawUp admins, and 0020 already blocks members from changing
--     their own account_type.

-------------------------------------------------------------------------------
-- 1. Private storage for drawings and images members upload for review/generation
-------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('drawup-private', 'drawup-private', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "drawup private owner read" on storage.objects;
create policy "drawup private owner read" on storage.objects for select to authenticated
  using (bucket_id = 'drawup-private' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "drawup private owner upload" on storage.objects;
create policy "drawup private owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'drawup-private' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "drawup private owner delete" on storage.objects;
create policy "drawup private owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'drawup-private' and (storage.foldername(name))[1] = auth.uid()::text);

-- A member may only point a review/generation at a file inside their own private folder.
create or replace function public.storage_path_is_own(p_path text)
returns boolean language sql stable as $$
  select p_path is not null and split_part(p_path, '/', 1) = auth.uid()::text and p_path not like '%..%';
$$;

-------------------------------------------------------------------------------
-- 2. DrawUp Check — one row per uploaded drawing set review
-------------------------------------------------------------------------------
create table if not exists public.check_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_thread_id uuid references public.project_threads(id) on delete set null,
  title text not null default 'Drawing set review',
  file_path text not null,
  file_name text,
  file_size bigint,
  jurisdiction text,
  building_type text,
  focus text[] not null default array['code','accessibility','life_safety','coordination','dimensions']::text[],
  status text not null default 'queued' check (status in ('queued','reviewing','complete','failed')),
  response_id text,
  model text,
  summary text,
  findings jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  page_count integer,
  credits_charged integer not null default 0,
  credit_access jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index if not exists check_reviews_owner_idx on public.check_reviews(owner_id, created_at desc);
alter table public.check_reviews enable row level security;

drop policy if exists "check owner read" on public.check_reviews;
create policy "check owner read" on public.check_reviews for select using (owner_id = auth.uid() or public.is_drawup_admin());
drop policy if exists "check owner create" on public.check_reviews;
create policy "check owner create" on public.check_reviews for insert with check (
  owner_id = auth.uid()
  and status = 'queued' and response_id is null and summary is null
  and findings = '[]'::jsonb and credits_charged = 0 and credit_access is null
  and (storage_path_is_own(file_path))
);
drop policy if exists "check owner delete" on public.check_reviews;
create policy "check owner delete" on public.check_reviews for delete using (owner_id = auth.uid());
-- No UPDATE policy: only the DrawUp server (service role) writes review results.

-------------------------------------------------------------------------------
-- 3. DrawUp Swap — one row per generation request
-------------------------------------------------------------------------------
create table if not exists public.swap_generations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_thread_id uuid references public.project_threads(id) on delete set null,
  source_path text not null,
  result_path text,
  swap_type text not null default 'material',
  prompt text not null,
  status text not null default 'queued' check (status in ('queued','generating','complete','failed')),
  response_id text,
  model text,
  credits_charged integer not null default 0,
  credit_access jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists swap_generations_owner_idx on public.swap_generations(owner_id, created_at desc);
alter table public.swap_generations enable row level security;

drop policy if exists "swap owner read" on public.swap_generations;
create policy "swap owner read" on public.swap_generations for select using (owner_id = auth.uid() or public.is_drawup_admin());
drop policy if exists "swap owner create" on public.swap_generations;
create policy "swap owner create" on public.swap_generations for insert with check (
  owner_id = auth.uid()
  and status = 'queued' and response_id is null and result_path is null
  and credits_charged = 0 and credit_access is null
  and storage_path_is_own(source_path)
);
drop policy if exists "swap owner delete" on public.swap_generations;
create policy "swap owner delete" on public.swap_generations for delete using (owner_id = auth.uid());

-------------------------------------------------------------------------------
-- 4. Draw — structured drawing model (walls, openings, rooms). Dimensions are NOT
--    stored as text: they are computed from this geometry every time it is drawn.
-------------------------------------------------------------------------------
create table if not exists public.drawings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_thread_id uuid references public.project_threads(id) on delete set null,
  name text not null default 'Floor Plan',
  sheet_number text,
  scale_denominator integer not null default 48 check (scale_denominator > 0),  -- 48 = 1/4" = 1'-0"
  model jsonb not null default '{"walls":[],"openings":[],"rooms":[]}'::jsonb,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists drawings_owner_idx on public.drawings(owner_id, updated_at desc);
alter table public.drawings enable row level security;
drop policy if exists "drawings owner all" on public.drawings;
create policy "drawings owner all" on public.drawings for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-------------------------------------------------------------------------------
-- 5. HQ owner console — DrawUp admins/founders only
-------------------------------------------------------------------------------
-- Directory records: admins may create/edit/delete firms, projects and their photos.
drop policy if exists "drawup admins insert firms" on public.firms;
create policy "drawup admins insert firms" on public.firms for insert with check (public.is_drawup_admin());
drop policy if exists "drawup admins delete firms" on public.firms;
create policy "drawup admins delete firms" on public.firms for delete using (public.is_drawup_admin());

drop policy if exists "drawup admins insert projects" on public.aec_projects;
create policy "drawup admins insert projects" on public.aec_projects for insert with check (public.is_drawup_admin());
drop policy if exists "drawup admins delete projects" on public.aec_projects;
create policy "drawup admins delete projects" on public.aec_projects for delete using (public.is_drawup_admin());

drop policy if exists "drawup admins manage project images" on public.project_images;
create policy "drawup admins manage project images" on public.project_images for all using (public.is_drawup_admin()) with check (public.is_drawup_admin());
drop policy if exists "drawup admins manage project firms" on public.project_firms;
create policy "drawup admins manage project firms" on public.project_firms for all using (public.is_drawup_admin()) with check (public.is_drawup_admin());

-- Experience verification is done by HQ (0020's trigger already lets admins set it).
drop policy if exists "drawup admins verify career" on public.career_timeline;
create policy "drawup admins verify career" on public.career_timeline for update using (public.is_drawup_admin()) with check (public.is_drawup_admin());

create or replace function public.drawup_slugify(p text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p,'')), '[^a-z0-9]+', '-', 'g'));
$$;

-- Approve or reject a public "Add a firm" submission. Approving creates the firm
-- (or links an existing firm with the same name) and its office in one transaction.
create or replace function public.drawup_hq_review_submission(p_submission_id uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.firm_submissions%rowtype;
  v_firm uuid;
  v_slug text;
  n int := 1;
begin
  if not public.is_drawup_admin() then
    raise exception 'DrawUp HQ only' using errcode = '42501';
  end if;
  select * into s from public.firm_submissions where id = p_submission_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if s.status <> 'pending' then
    return jsonb_build_object('ok', true, 'status', s.status, 'firm_id', s.created_firm_id, 'note', 'already reviewed');
  end if;
  if not p_approve then
    update public.firm_submissions set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid() where id = s.id;
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;
  select id into v_firm from public.firms where lower(name) = lower(trim(s.firm_name)) limit 1;
  if v_firm is null then
    v_slug := nullif(public.drawup_slugify(s.firm_name), '');
    if v_slug is null then v_slug := 'firm'; end if;
    while exists (select 1 from public.firms where slug = case when n = 1 then v_slug else v_slug || '-' || n end) loop n := n + 1; end loop;
    if n > 1 then v_slug := v_slug || '-' || n; end if;
    insert into public.firms (slug, name, website, is_verified)
    values (v_slug, trim(s.firm_name), s.website, false)
    returning id into v_firm;
    if coalesce(s.city, '') <> '' then
      insert into public.firm_offices (firm_id, city, state, country, is_headquarters)
      values (v_firm, s.city, s.state, coalesce(s.country, 'US'), true);
    end if;
  end if;
  update public.firm_submissions set status = 'approved', created_firm_id = v_firm, reviewed_at = now(), reviewed_by = auth.uid() where id = s.id;
  return jsonb_build_object('ok', true, 'status', 'approved', 'firm_id', v_firm);
end; $$;
revoke all on function public.drawup_hq_review_submission(uuid, boolean) from public, anon;
grant execute on function public.drawup_hq_review_submission(uuid, boolean) to authenticated;

-- Grant Arch Coach / Check / Swap credits to a member (purchased bucket), with a ledger entry.
create or replace function public.drawup_hq_grant_credits(p_user_id uuid, p_amount integer, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_total integer;
begin
  if not public.is_drawup_admin() then
    raise exception 'DrawUp HQ only' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then raise exception 'Amount must be between -100000 and 100000'; end if;
  insert into public.arch_coach_credit_accounts (user_id) values (p_user_id) on conflict (user_id) do nothing;
  update public.arch_coach_credit_accounts
     set purchased_credits_remaining = greatest(purchased_credits_remaining + p_amount, 0), updated_at = now()
   where user_id = p_user_id
   returning monthly_credits_remaining + purchased_credits_remaining into v_total;
  insert into public.arch_coach_credit_ledger (user_id, delta, reason, metadata)
  values (p_user_id, p_amount, 'hq_grant', jsonb_build_object('by', auth.uid(), 'note', p_note));
  return jsonb_build_object('ok', true, 'credits_remaining', v_total);
end; $$;
revoke all on function public.drawup_hq_grant_credits(uuid, integer, text) from public, anon;
grant execute on function public.drawup_hq_grant_credits(uuid, integer, text) to authenticated;

-- Member lookup for HQ (email lives in auth.users, which members cannot read).
create or replace function public.drawup_hq_find_members(p_query text)
returns table (id uuid, email text, display_name text, username text, account_type text, credits integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_drawup_admin() then
    raise exception 'DrawUp HQ only' using errcode = '42501';
  end if;
  return query
    select p.id, u.email::text, p.display_name, p.username, p.account_type::text,
           coalesce(a.monthly_credits_remaining + a.purchased_credits_remaining, 0)
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.arch_coach_credit_accounts a on a.user_id = p.id
     where coalesce(p_query, '') = ''
        or u.email ilike '%' || p_query || '%'
        or p.display_name ilike '%' || p_query || '%'
        or p.username ilike '%' || p_query || '%'
     order by p.created_at desc nulls last
     limit 50;
end; $$;
revoke all on function public.drawup_hq_find_members(text) from public, anon;
grant execute on function public.drawup_hq_find_members(text) to authenticated;

grant select, insert, delete on public.check_reviews to authenticated;
grant select, insert, delete on public.swap_generations to authenticated;
grant select, insert, update, delete on public.drawings to authenticated;
grant execute on function public.is_drawup_admin() to authenticated;
