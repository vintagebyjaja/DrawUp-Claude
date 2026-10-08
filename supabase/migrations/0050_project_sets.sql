-- 0050 DrawUp V22 Project drawing sets, part 1 of 3: membership helper and tables.
-- A member uploads a full drawing set PDF to a project. The browser splits it page by page,
-- reads each sheet number and files the sheet into discipline folders 01 General to 10 Electrical
-- and sheet type subfolders 0 General to 9 Misc. Additive only. Safe to run twice.

-- Project members: the project owner, admins of the project firm, and DrawUp HQ.
-- Same people who can read the project_threads row.
create or replace function public.project_set_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_threads t
    where t.id = pid
      and (t.owner_id = auth.uid() or public.is_drawup_admin()
           or (t.firm_id is not null and public.is_firm_admin(t.firm_id)))
  )
$$;

-- Storage paths in the project sets bucket start with the project id.
create or replace function public.project_set_path_ok(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.project_set_member(t.id) from public.project_threads t
    where t.id::text = split_part(p_path, '/', 1)
  ), false)
$$;

create table if not exists public.project_sets (
  id uuid primary key default gen_random_uuid(),
  project_thread_id uuid not null references public.project_threads(id) on delete cascade,
  uploaded_by uuid default auth.uid() references public.profiles(id) on delete set null,
  title text not null default 'Drawing set',
  file_path text,
  file_name text,
  file_size bigint,
  page_count integer,
  status text not null default 'uploading' check (status in ('uploading','splitting','ready','failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_sets_project_idx on public.project_sets(project_thread_id, created_at desc);

-- One row per sheet (one page of the uploaded set, saved as its own single page PDF).
-- discipline is null for sheets in Unsorted, needs a sheet number.
create table if not exists public.project_set_sheets (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.project_sets(id) on delete cascade,
  project_thread_id uuid not null references public.project_threads(id) on delete cascade,
  page_no integer not null check (page_no > 0),
  sheet_number text,
  sheet_title text,
  designator text,
  discipline text check (discipline is null or discipline in ('01','02','03','04','05','06','07','08','09','10')),
  sheet_type smallint check (sheet_type is null or sheet_type between 0 and 9),
  sheet_series text,
  file_path text not null,
  auto_number text,
  auto_title text,
  filed_by text not null default 'auto' check (filed_by in ('auto','manual')),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (set_id, page_no)
);
create index if not exists project_set_sheets_set_idx on public.project_set_sheets(set_id, discipline, sheet_type);

-- One row per Review this set run on a discipline folder. The review itself is a check_reviews
-- row owned by the requester. Results are copied here so every project member sees them.
create table if not exists public.project_set_reviews (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.project_sets(id) on delete cascade,
  project_thread_id uuid not null references public.project_threads(id) on delete cascade,
  discipline text not null check (discipline in ('01','02','03','04','05','06','07','08','09','10')),
  check_review_id uuid references public.check_reviews(id) on delete set null,
  requested_by uuid default auth.uid() references public.profiles(id) on delete set null,
  sheet_ids uuid[] not null default array[]::uuid[],
  sheet_numbers text[] not null default array[]::text[],
  status text not null default 'queued' check (status in ('queued','reviewing','complete','failed')),
  summary text,
  error text,
  finding_count integer not null default 0,
  critical_count integer not null default 0,
  major_count integer not null default 0,
  findings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_set_reviews_set_idx on public.project_set_reviews(set_id, discipline, created_at desc);

select 'DONE 0050_01_sets_tables' as status;
-- END
-- 0050 DrawUp V22 Project drawing sets, part 2 of 3: row level security.
-- Only project members (owner, firm admins of the project firm, DrawUp HQ) see or change a set.
-- Safe to run twice.

alter table public.project_sets enable row level security;
alter table public.project_set_sheets enable row level security;
alter table public.project_set_reviews enable row level security;

drop policy if exists "project sets member read" on public.project_sets;
create policy "project sets member read" on public.project_sets for select
  using (public.project_set_member(project_thread_id));
drop policy if exists "project sets member insert" on public.project_sets;
create policy "project sets member insert" on public.project_sets for insert
  with check (public.project_set_member(project_thread_id) and uploaded_by = auth.uid());
drop policy if exists "project sets member update" on public.project_sets;
create policy "project sets member update" on public.project_sets for update
  using (public.project_set_member(project_thread_id))
  with check (public.project_set_member(project_thread_id));
drop policy if exists "project sets member delete" on public.project_sets;
create policy "project sets member delete" on public.project_sets for delete
  using (public.project_set_member(project_thread_id));

-- A sheet must belong to a set of the same project.
drop policy if exists "project set sheets member read" on public.project_set_sheets;
create policy "project set sheets member read" on public.project_set_sheets for select
  using (public.project_set_member(project_thread_id));
drop policy if exists "project set sheets member insert" on public.project_set_sheets;
create policy "project set sheets member insert" on public.project_set_sheets for insert
  with check (public.project_set_member(project_thread_id) and exists (
    select 1 from public.project_sets s where s.id = set_id and s.project_thread_id = project_set_sheets.project_thread_id));
drop policy if exists "project set sheets member update" on public.project_set_sheets;
create policy "project set sheets member update" on public.project_set_sheets for update
  using (public.project_set_member(project_thread_id))
  with check (public.project_set_member(project_thread_id) and exists (
    select 1 from public.project_sets s where s.id = set_id and s.project_thread_id = project_set_sheets.project_thread_id));
drop policy if exists "project set sheets member delete" on public.project_set_sheets;
create policy "project set sheets member delete" on public.project_set_sheets for delete
  using (public.project_set_member(project_thread_id));

drop policy if exists "project set reviews member read" on public.project_set_reviews;
create policy "project set reviews member read" on public.project_set_reviews for select
  using (public.project_set_member(project_thread_id));
drop policy if exists "project set reviews member insert" on public.project_set_reviews;
create policy "project set reviews member insert" on public.project_set_reviews for insert
  with check (public.project_set_member(project_thread_id) and requested_by = auth.uid() and exists (
    select 1 from public.project_sets s where s.id = set_id and s.project_thread_id = project_set_reviews.project_thread_id));
-- Only the member who asked for the review writes its result back.
drop policy if exists "project set reviews requester update" on public.project_set_reviews;
create policy "project set reviews requester update" on public.project_set_reviews for update
  using (public.project_set_member(project_thread_id) and requested_by = auth.uid())
  with check (public.project_set_member(project_thread_id) and requested_by = auth.uid());
drop policy if exists "project set reviews member delete" on public.project_set_reviews;
create policy "project set reviews member delete" on public.project_set_reviews for delete
  using (public.project_set_member(project_thread_id));

grant select, insert, update, delete on public.project_sets, public.project_set_sheets, public.project_set_reviews to authenticated;
revoke all on public.project_sets, public.project_set_sheets, public.project_set_reviews from anon;
grant execute on function public.project_set_member(uuid) to authenticated;
grant execute on function public.project_set_path_ok(text) to authenticated;

select 'DONE 0050_02_sets_rls' as status;
-- END
-- 0050 DrawUp V22 Project drawing sets, part 3 of 3: private storage bucket.
-- Files live at project id / set id / source.pdf and project id / set id / sheets / page.pdf.
-- Only project members can read or write them. The bucket has no size cap of its own, so the
-- project wide Supabase upload limit applies (50 MB on the free plan, raise it in the
-- Supabase dashboard storage settings for very large sets). Safe to run twice.

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('drawup-project-sets', 'drawup-project-sets', false, array['application/pdf'])
on conflict (id) do update set public = false, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "project sets files member read" on storage.objects;
create policy "project sets files member read" on storage.objects for select to authenticated
  using (bucket_id = 'drawup-project-sets' and public.project_set_path_ok(name));
drop policy if exists "project sets files member insert" on storage.objects;
create policy "project sets files member insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'drawup-project-sets' and public.project_set_path_ok(name));
drop policy if exists "project sets files member update" on storage.objects;
create policy "project sets files member update" on storage.objects for update to authenticated
  using (bucket_id = 'drawup-project-sets' and public.project_set_path_ok(name))
  with check (bucket_id = 'drawup-project-sets' and public.project_set_path_ok(name));
drop policy if exists "project sets files member delete" on storage.objects;
create policy "project sets files member delete" on storage.objects for delete to authenticated
  using (bucket_id = 'drawup-project-sets' and public.project_set_path_ok(name));

select 'DONE 0050_03_sets_storage' as status;
-- END
