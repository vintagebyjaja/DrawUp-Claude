-- DrawUp Specs (migration 0075): spec and project document editor in Firm › DrawUp Specs.
-- Additive and idempotent. Safe to run twice. Nothing existing is dropped, rewritten or wiped.
-- Builds on 0049 (firm kit): documents live in firm_documents, uploaded format files in firm_kit_files
-- and the private bucket drawup-firmkit under firm-id/specs/.
--   1. firm_documents gets the columns a spec or CA/CM/QA/QC/PM document needs.
--   2. firm_spec_formats: the firm standard format and client formats (the DrawUp format is built in).
--   3. firm_project_info: shared project data (number, address, owner, team...) that every document pulls.
--   4. Members may upload format files under firm-id/specs/. Word files are allowed in the bucket.
--   5. drawup_spec_projects() and drawup_spec_project_brief() return the project data for the project map.

-- ===== 1. documents
alter table public.firm_documents add column if not exists doc_type text not null default 'narrative';
alter table public.firm_documents add column if not exists project_thread_id uuid references public.project_threads(id) on delete set null;
alter table public.firm_documents add column if not exists format_id uuid;
alter table public.firm_documents add column if not exists status text not null default 'draft';
alter table public.firm_documents add column if not exists doc_number text;
alter table public.firm_documents add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.firm_documents add column if not exists revision integer not null default 0;
do $$ begin
  alter table public.firm_documents add constraint firm_documents_status_check check (status in ('draft','in_progress','in_review','issued','archived'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.firm_documents add constraint firm_documents_doc_type_check check (doc_type ~ '^[a-z0-9_]{2,40}$');
exception when duplicate_object then null; end $$;
alter table public.firm_documents drop constraint if exists firm_documents_source_check;
alter table public.firm_documents add constraint firm_documents_source_check check (source in ('manual','check','import','specs'));
create index if not exists firm_documents_project_idx on public.firm_documents(project_thread_id, updated_at desc);

-- ===== 2. formats
create table if not exists public.firm_spec_formats (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  kind text not null default 'client',
  name text not null,
  client_name text,
  project_thread_id uuid references public.project_threads(id) on delete set null,
  settings jsonb not null default '{}'::jsonb,
  template_file_id uuid references public.firm_kit_files(id) on delete set null,
  reference_file_ids uuid[] not null default '{}',
  is_default boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint firm_spec_formats_kind_check check (kind in ('firm','client')),
  constraint firm_spec_formats_name_check check (length(trim(name)) between 1 and 120),
  constraint firm_spec_formats_settings_obj check (jsonb_typeof(settings) = 'object')
);
create index if not exists firm_spec_formats_firm_idx on public.firm_spec_formats(firm_id, kind, updated_at desc);
create index if not exists firm_spec_formats_project_idx on public.firm_spec_formats(project_thread_id);

-- ===== 3. shared project data
create table if not exists public.firm_project_info (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  project_thread_id uuid not null references public.project_threads(id) on delete cascade,
  info jsonb not null default '{}'::jsonb,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint firm_project_info_obj check (jsonb_typeof(info) = 'object'),
  unique (firm_id, project_thread_id)
);

-- ===== RLS: members read everything of their firm. Firm standard formats: admins write.
-- Client formats and project data: any firm member writes. The creator or a firm admin deletes.
alter table public.firm_spec_formats enable row level security;
alter table public.firm_project_info enable row level security;
revoke all on public.firm_spec_formats, public.firm_project_info from anon;
grant select, insert, update, delete on public.firm_spec_formats, public.firm_project_info to authenticated;

drop policy if exists "spec formats member read" on public.firm_spec_formats;
create policy "spec formats member read" on public.firm_spec_formats for select to authenticated
  using (public.drawup_is_firm_member(firm_id));
drop policy if exists "spec formats insert" on public.firm_spec_formats;
create policy "spec formats insert" on public.firm_spec_formats for insert to authenticated
  with check (public.is_firm_admin(firm_id) or (kind = 'client' and public.drawup_is_firm_member(firm_id)));
drop policy if exists "spec formats update" on public.firm_spec_formats;
create policy "spec formats update" on public.firm_spec_formats for update to authenticated
  using (public.is_firm_admin(firm_id) or (kind = 'client' and public.drawup_is_firm_member(firm_id)))
  with check (public.is_firm_admin(firm_id) or (kind = 'client' and public.drawup_is_firm_member(firm_id)));
drop policy if exists "spec formats delete" on public.firm_spec_formats;
create policy "spec formats delete" on public.firm_spec_formats for delete to authenticated
  using (public.is_firm_admin(firm_id) or (kind = 'client' and created_by = auth.uid()));

drop policy if exists "project info member read" on public.firm_project_info;
create policy "project info member read" on public.firm_project_info for select to authenticated
  using (public.drawup_is_firm_member(firm_id));
drop policy if exists "project info member insert" on public.firm_project_info;
create policy "project info member insert" on public.firm_project_info for insert to authenticated
  with check (public.drawup_is_firm_member(firm_id));
drop policy if exists "project info member update" on public.firm_project_info;
create policy "project info member update" on public.firm_project_info for update to authenticated
  using (public.drawup_is_firm_member(firm_id)) with check (public.drawup_is_firm_member(firm_id));
drop policy if exists "project info admin delete" on public.firm_project_info;
create policy "project info admin delete" on public.firm_project_info for delete to authenticated
  using (public.is_firm_admin(firm_id));

-- ===== 4. format files: kind spec_format, path firm-id/specs/file. Members upload, uploader or admin removes.
alter table public.firm_kit_files drop constraint if exists firm_kit_files_kind_check;
alter table public.firm_kit_files add constraint firm_kit_files_kind_check check (kind in ('playbook','template','asset','spec_format'));
drop policy if exists "firmkit files member spec insert" on public.firm_kit_files;
create policy "firmkit files member spec insert" on public.firm_kit_files for insert to authenticated
  with check (kind = 'spec_format' and split_part(storage_path, '/', 2) = 'specs' and public.drawup_is_firm_member(firm_id));
drop policy if exists "firmkit files member spec update" on public.firm_kit_files;
create policy "firmkit files member spec update" on public.firm_kit_files for update to authenticated
  using (kind = 'spec_format' and uploaded_by = auth.uid()) with check (kind = 'spec_format' and uploaded_by = auth.uid());
drop policy if exists "firmkit files member spec delete" on public.firm_kit_files;
create policy "firmkit files member spec delete" on public.firm_kit_files for delete to authenticated
  using (kind = 'spec_format' and uploaded_by = auth.uid());

update storage.buckets
   set allowed_mime_types = (select array_agg(distinct m) from unnest(coalesce(allowed_mime_types, '{}') || array[
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document']) m)
 where id = 'drawup-firmkit';

drop policy if exists "firmkit member spec upload" on storage.objects;
create policy "firmkit member spec upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'drawup-firmkit' and split_part(name, '/', 2) = 'specs' and public.drawup_firmkit_object_ok(name, false));
drop policy if exists "firmkit member spec delete" on storage.objects;
create policy "firmkit member spec delete" on storage.objects for delete to authenticated
  using (bucket_id = 'drawup-firmkit' and split_part(name, '/', 2) = 'specs' and owner = auth.uid());

-- ===== 5. project data for Specs
-- Projects a member can write documents for: the firm's projects (project_threads.firm_id) and the caller's own.
create or replace function public.drawup_spec_projects(p_firm uuid)
returns table (id uuid, project_name text, project_type text, location text, project_phase text, description text,
  client_nickname text, owner_id uuid, owner_name text, firm_id uuid, status text, updated_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.project_name, t.project_type, t.location, t.project_phase, t.description,
         case when t.owner_id = auth.uid() or public.drawup_is_firm_member(t.firm_id) then t.client_nickname end,
         t.owner_id, p.display_name, t.firm_id, t.status, t.updated_at, t.owner_id = auth.uid()
    from public.project_threads t left join public.profiles p on p.id = t.owner_id
   where public.drawup_is_firm_member(p_firm)
     and coalesce(t.starter_key, '') = ''
     and (t.firm_id = p_firm or t.owner_id = auth.uid())
   order by t.updated_at desc
   limit 300
$$;

-- Everything a document pulls from one project: the project row, its latest drawing sheets and Check findings.
create or replace function public.drawup_spec_project_brief(p_project uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t public.project_threads; ok boolean; out jsonb;
begin
  select * into t from public.project_threads where id = p_project;
  if not found then return null; end if;
  ok := t.owner_id = auth.uid() or public.is_drawup_admin() or (t.firm_id is not null and public.drawup_is_firm_member(t.firm_id));
  if not ok then return null; end if;
  select jsonb_build_object(
    'project', jsonb_build_object('id', t.id, 'project_name', t.project_name, 'project_type', t.project_type, 'location', t.location,
       'project_phase', t.project_phase, 'description', t.description, 'client_nickname', t.client_nickname, 'firm_id', t.firm_id,
       'owner_id', t.owner_id, 'updated_at', t.updated_at),
    'sheets', coalesce((select jsonb_agg(jsonb_build_object('sheet_number', s.sheet_number, 'sheet_title', s.sheet_title,
        'discipline', s.discipline, 'set_title', ps.title, 'set_date', ps.created_at) order by s.discipline nulls last, s.sheet_number)
       from public.project_set_sheets s join public.project_sets ps on ps.id = s.set_id
      where s.project_thread_id = t.id and ps.status = 'ready'
        and ps.id = (select id from public.project_sets where project_thread_id = t.id and status = 'ready' order by created_at desc limit 1)), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('discipline', r.discipline, 'summary', r.summary, 'findings', r.findings,
        'created_at', r.created_at) order by r.created_at desc)
       from (select * from public.project_set_reviews where project_thread_id = t.id and status = 'complete' order by created_at desc limit 10) r), '[]'::jsonb)
  ) into out;
  return out;
end $$;

revoke all on function public.drawup_spec_projects(uuid) from public, anon;
revoke all on function public.drawup_spec_project_brief(uuid) from public, anon;
grant execute on function public.drawup_spec_projects(uuid) to authenticated;
grant execute on function public.drawup_spec_project_brief(uuid) to authenticated;

select 'DONE drawup-specs-0075' as status;
