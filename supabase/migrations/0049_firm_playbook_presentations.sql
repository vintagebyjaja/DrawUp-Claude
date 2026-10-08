-- DrawUp V22 firm kit: firm playbook (with sharing), GM Presentation templates, document templates and documents (migration 0049).
-- Additive and idempotent. Same content as 0049_01..06 in the v22 sql-parts/firmkit deliverables, in run order.

-- ===== 0049_01_firmkit_tables.sql
-- DrawUp V22 firm kit (migration 0049) 01: firm playbook, firm kit files, GM Presentation templates.
-- Additive and idempotent. New tables only. Nothing existing is dropped, rewritten or wiped.
-- Every firm gets the DrawUp general playbook in the app with no row here. A row only stores the firm edits.

create table if not exists public.firm_kit_files (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  kind text not null default 'playbook',
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  page_count integer,
  slide_titles text[] not null default '{}',
  note text,
  uploaded_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint firm_kit_files_kind_check check (kind in ('playbook','template','asset')),
  constraint firm_kit_files_path_check check (split_part(storage_path, '/', 1) = firm_id::text),
  constraint firm_kit_files_name_check check (length(trim(file_name)) between 1 and 200)
);
create index if not exists firm_kit_files_firm_idx on public.firm_kit_files(firm_id, kind, created_at desc);

create table if not exists public.firm_playbooks (
  firm_id uuid primary key references public.firms(id) on delete cascade,
  mode text not null default 'drawup',
  standards jsonb not null default '{}'::jsonb,
  primary_file_id uuid references public.firm_kit_files(id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint firm_playbooks_mode_check check (mode in ('drawup','edited','upload')),
  constraint firm_playbooks_standards_obj check (jsonb_typeof(standards) = 'object')
);

create table if not exists public.firm_presentation_templates (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  name text not null,
  spec jsonb not null default '{}'::jsonb,
  background_file_id uuid references public.firm_kit_files(id) on delete set null,
  is_default boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint firm_pres_templates_name_check check (length(trim(name)) between 1 and 120),
  constraint firm_pres_templates_spec_obj check (jsonb_typeof(spec) = 'object')
);
create index if not exists firm_pres_templates_firm_idx on public.firm_presentation_templates(firm_id, updated_at desc);

select 'DONE 0049_01_firmkit_tables' as status;
-- END

-- ===== 0049_02_firmkit_share_doc_tables.sql
-- DrawUp V22 firm kit (migration 0049) 02: playbook sharing, document templates, documents.
-- Additive and idempotent. New tables only.

-- A firm admin shares the firm playbook with a partner firm or with one person (consultant without a firm).
-- Revoking access deletes the row. Partners can read, never edit.
create table if not exists public.firm_playbook_shares (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  partner_firm_id uuid references public.firms(id) on delete cascade,
  partner_user_id uuid references public.profiles(id) on delete cascade,
  note text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint firm_playbook_shares_one_partner check (num_nonnulls(partner_firm_id, partner_user_id) = 1),
  constraint firm_playbook_shares_not_self check (partner_firm_id is distinct from firm_id)
);
create unique index if not exists firm_playbook_shares_firm_uq on public.firm_playbook_shares(firm_id, partner_firm_id) where partner_firm_id is not null;
create unique index if not exists firm_playbook_shares_user_uq on public.firm_playbook_shares(firm_id, partner_user_id) where partner_user_id is not null;
create index if not exists firm_playbook_shares_pf_idx on public.firm_playbook_shares(partner_firm_id);
create index if not exists firm_playbook_shares_pu_idx on public.firm_playbook_shares(partner_user_id);

-- Narrative, report and other document templates: cover sheet, info fields, default sections.
create table if not exists public.firm_doc_templates (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  name text not null,
  kind text not null default 'narrative',
  spec jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint firm_doc_templates_name_check check (length(trim(name)) between 1 and 120),
  constraint firm_doc_templates_kind_check check (kind in ('narrative','report','proposal','memo','other')),
  constraint firm_doc_templates_spec_obj check (jsonb_typeof(spec) = 'object')
);
create index if not exists firm_doc_templates_firm_idx on public.firm_doc_templates(firm_id, updated_at desc);

-- Documents made from a template. Any member of the firm can create and edit them.
create table if not exists public.firm_documents (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  template_id uuid references public.firm_doc_templates(id) on delete set null,
  title text not null,
  fields jsonb not null default '{}'::jsonb,
  cover jsonb not null default '{}'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  source text not null default 'manual',
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint firm_documents_title_check check (length(trim(title)) between 1 and 200),
  constraint firm_documents_sections_arr check (jsonb_typeof(sections) = 'array'),
  constraint firm_documents_source_check check (source in ('manual','check','import'))
);
create index if not exists firm_documents_firm_idx on public.firm_documents(firm_id, updated_at desc);

select 'DONE 0049_02_firmkit_share_doc_tables' as status;
-- END

-- ===== 0049_03_firmkit_functions.sql
-- DrawUp V22 firm kit (migration 0049) 03: access helpers.
-- drawup_firmkit_shared(firm) is true when the firm shared its playbook with the caller or the caller firm.
-- drawup_firmkit_can_read(firm) is member or shared partner. Used only for the playbook and playbook files.

create or replace function public.drawup_firmkit_shared(p_firm uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.firm_playbook_shares s
    where s.firm_id = p_firm
      and (s.partner_user_id = auth.uid()
        or exists (select 1 from public.firm_members m where m.firm_id = s.partner_firm_id and m.user_id = auth.uid()))
  )
$$;

create or replace function public.drawup_firmkit_can_read(p_firm uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.drawup_is_firm_member(p_firm) or public.drawup_firmkit_shared(p_firm)
$$;

-- Storage paths look like firm-id/kind/file. Admin writes. Members read all. Partners read only kind playbook.
create or replace function public.drawup_firmkit_object_ok(p_name text, p_admin boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from public.firm_members m
      where m.firm_id::text = split_part(p_name, '/', 1)
        and m.user_id = auth.uid()
        and (not p_admin or m.role = 'admin'))
    or (not p_admin and split_part(p_name, '/', 2) = 'playbook' and exists (
      select 1 from public.firm_playbook_shares s
      where s.firm_id::text = split_part(p_name, '/', 1)
        and (s.partner_user_id = auth.uid()
          or exists (select 1 from public.firm_members m2 where m2.firm_id = s.partner_firm_id and m2.user_id = auth.uid()))))
$$;

revoke all on function public.drawup_firmkit_shared(uuid) from public, anon;
revoke all on function public.drawup_firmkit_can_read(uuid) from public, anon;
revoke all on function public.drawup_firmkit_object_ok(text, boolean) from public, anon;
grant execute on function public.drawup_firmkit_shared(uuid) to authenticated;
grant execute on function public.drawup_firmkit_can_read(uuid) to authenticated;
grant execute on function public.drawup_firmkit_object_ok(text, boolean) to authenticated;

select 'DONE 0049_03_firmkit_functions' as status;
-- END

-- ===== 0049_04_firmkit_rls.sql
-- DrawUp V22 firm kit (migration 0049) 04: row level security for the playbook, kit files and slide templates.
-- Firm members read. Only firm admins insert, update or delete. Shared partners read the playbook and
-- playbook files only. Everyone else sees nothing.

alter table public.firm_kit_files enable row level security;
alter table public.firm_playbooks enable row level security;
alter table public.firm_presentation_templates enable row level security;
revoke all on public.firm_kit_files, public.firm_playbooks, public.firm_presentation_templates from anon;
grant select, insert, update, delete on public.firm_kit_files, public.firm_playbooks, public.firm_presentation_templates to authenticated;

drop policy if exists "firmkit files member read" on public.firm_kit_files;
create policy "firmkit files member read" on public.firm_kit_files for select to authenticated
  using (public.drawup_is_firm_member(firm_id) or (kind = 'playbook' and public.drawup_firmkit_shared(firm_id)));
drop policy if exists "firmkit files admin insert" on public.firm_kit_files;
create policy "firmkit files admin insert" on public.firm_kit_files for insert to authenticated
  with check (public.is_firm_admin(firm_id));
drop policy if exists "firmkit files admin update" on public.firm_kit_files;
create policy "firmkit files admin update" on public.firm_kit_files for update to authenticated
  using (public.is_firm_admin(firm_id)) with check (public.is_firm_admin(firm_id));
drop policy if exists "firmkit files admin delete" on public.firm_kit_files;
create policy "firmkit files admin delete" on public.firm_kit_files for delete to authenticated
  using (public.is_firm_admin(firm_id));

drop policy if exists "firm playbook member read" on public.firm_playbooks;
create policy "firm playbook member read" on public.firm_playbooks for select to authenticated
  using (public.drawup_firmkit_can_read(firm_id));
drop policy if exists "firm playbook admin insert" on public.firm_playbooks;
create policy "firm playbook admin insert" on public.firm_playbooks for insert to authenticated
  with check (public.is_firm_admin(firm_id));
drop policy if exists "firm playbook admin update" on public.firm_playbooks;
create policy "firm playbook admin update" on public.firm_playbooks for update to authenticated
  using (public.is_firm_admin(firm_id)) with check (public.is_firm_admin(firm_id));
drop policy if exists "firm playbook admin delete" on public.firm_playbooks;
create policy "firm playbook admin delete" on public.firm_playbooks for delete to authenticated
  using (public.is_firm_admin(firm_id));

drop policy if exists "firm templates member read" on public.firm_presentation_templates;
create policy "firm templates member read" on public.firm_presentation_templates for select to authenticated
  using (public.drawup_is_firm_member(firm_id));
drop policy if exists "firm templates admin insert" on public.firm_presentation_templates;
create policy "firm templates admin insert" on public.firm_presentation_templates for insert to authenticated
  with check (public.is_firm_admin(firm_id));
drop policy if exists "firm templates admin update" on public.firm_presentation_templates;
create policy "firm templates admin update" on public.firm_presentation_templates for update to authenticated
  using (public.is_firm_admin(firm_id)) with check (public.is_firm_admin(firm_id));
drop policy if exists "firm templates admin delete" on public.firm_presentation_templates;
create policy "firm templates admin delete" on public.firm_presentation_templates for delete to authenticated
  using (public.is_firm_admin(firm_id));

select 'DONE 0049_04_firmkit_rls' as status;
-- END

-- ===== 0049_05_firmkit_share_doc_rls.sql
-- DrawUp V22 firm kit (migration 0049) 05: row level security for sharing, document templates and documents.
-- Shares: owner firm admins create, see and revoke. Partners see only the rows that name them. No updates.
-- Document templates: members read, admins write. Documents: members read, create and edit.
-- The creator or a firm admin deletes a document.

alter table public.firm_playbook_shares enable row level security;
alter table public.firm_doc_templates enable row level security;
alter table public.firm_documents enable row level security;
revoke all on public.firm_playbook_shares, public.firm_doc_templates, public.firm_documents from anon;
grant select, insert, delete on public.firm_playbook_shares to authenticated;
grant select, insert, update, delete on public.firm_doc_templates, public.firm_documents to authenticated;

drop policy if exists "playbook shares read" on public.firm_playbook_shares;
create policy "playbook shares read" on public.firm_playbook_shares for select to authenticated
  using (public.is_firm_admin(firm_id) or partner_user_id = auth.uid()
    or (partner_firm_id is not null and public.drawup_is_firm_member(partner_firm_id)));
drop policy if exists "playbook shares admin insert" on public.firm_playbook_shares;
create policy "playbook shares admin insert" on public.firm_playbook_shares for insert to authenticated
  with check (public.is_firm_admin(firm_id) and created_by = auth.uid());
drop policy if exists "playbook shares admin delete" on public.firm_playbook_shares;
create policy "playbook shares admin delete" on public.firm_playbook_shares for delete to authenticated
  using (public.is_firm_admin(firm_id));

drop policy if exists "doc templates member read" on public.firm_doc_templates;
create policy "doc templates member read" on public.firm_doc_templates for select to authenticated
  using (public.drawup_is_firm_member(firm_id));
drop policy if exists "doc templates admin insert" on public.firm_doc_templates;
create policy "doc templates admin insert" on public.firm_doc_templates for insert to authenticated
  with check (public.is_firm_admin(firm_id));
drop policy if exists "doc templates admin update" on public.firm_doc_templates;
create policy "doc templates admin update" on public.firm_doc_templates for update to authenticated
  using (public.is_firm_admin(firm_id)) with check (public.is_firm_admin(firm_id));
drop policy if exists "doc templates admin delete" on public.firm_doc_templates;
create policy "doc templates admin delete" on public.firm_doc_templates for delete to authenticated
  using (public.is_firm_admin(firm_id));

drop policy if exists "documents member read" on public.firm_documents;
create policy "documents member read" on public.firm_documents for select to authenticated
  using (public.drawup_is_firm_member(firm_id));
drop policy if exists "documents member insert" on public.firm_documents;
create policy "documents member insert" on public.firm_documents for insert to authenticated
  with check (public.drawup_is_firm_member(firm_id) and created_by = auth.uid());
drop policy if exists "documents member update" on public.firm_documents;
create policy "documents member update" on public.firm_documents for update to authenticated
  using (public.drawup_is_firm_member(firm_id)) with check (public.drawup_is_firm_member(firm_id));
drop policy if exists "documents owner delete" on public.firm_documents;
create policy "documents owner delete" on public.firm_documents for delete to authenticated
  using (created_by = auth.uid() or public.is_firm_admin(firm_id));

select 'DONE 0049_05_firmkit_share_doc_rls' as status;
-- END

-- ===== 0049_06_firmkit_storage.sql
-- DrawUp V22 firm kit (migration 0049) 06: private storage bucket drawup-firmkit.
-- Object paths start with the firm id (firm-id/kind/file). Members read. Only firm admins write.
-- Shared partners read only files under firm-id/playbook. Access check: public.drawup_firmkit_object_ok (file 03).
-- Document cover images go under firm-id/doc and any firm member may upload them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('drawup-firmkit', 'drawup-firmkit', false, 52428800, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false;

drop policy if exists "firmkit member read" on storage.objects;
create policy "firmkit member read" on storage.objects for select to authenticated
  using (bucket_id = 'drawup-firmkit' and public.drawup_firmkit_object_ok(name, false));
drop policy if exists "firmkit admin upload" on storage.objects;
create policy "firmkit admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'drawup-firmkit' and (public.drawup_firmkit_object_ok(name, true)
    or (split_part(name, '/', 2) = 'doc' and public.drawup_firmkit_object_ok(name, false))));
drop policy if exists "firmkit admin update" on storage.objects;
create policy "firmkit admin update" on storage.objects for update to authenticated
  using (bucket_id = 'drawup-firmkit' and public.drawup_firmkit_object_ok(name, true))
  with check (bucket_id = 'drawup-firmkit' and public.drawup_firmkit_object_ok(name, true));
drop policy if exists "firmkit admin delete" on storage.objects;
create policy "firmkit admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'drawup-firmkit' and public.drawup_firmkit_object_ok(name, true));

select 'DONE 0049_06_firmkit_storage' as status;
-- END
