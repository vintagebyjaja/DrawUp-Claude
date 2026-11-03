-- 0077 Season 1 Document Studio: personal and project documents, version history and imported files.
-- Additive and safe to run twice. Nothing existing is changed or dropped; firm documents stay in firm_documents
-- (0049 + 0075) and keep working exactly as they do.
--   1. project_documents  : documents a member owns (letters, memos, reports, outline specs, RFIs, minutes...),
--      optionally filed under one of their projects. Same column shape as firm_documents, so the DrawUp Specs
--      editor opens either store.
--   2. document_versions   : a snapshot each time a document is saved (at most one a minute), so a member can see
--      what changed and restore an earlier version. Works for both stores.
--   3. document_imports    : an imported PDF or Word file is kept as uploaded next to the editable copy.
--   4. drawup-private storage: documents/<uid>/... for imports, letterheads and inserted images.

-- ===== 1. personal and project documents
create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  project_thread_id uuid references public.project_threads(id) on delete set null,
  doc_type text not null default 'letter',
  title text not null,
  doc_number text,
  status text not null default 'draft',
  format_id uuid,
  assigned_to uuid references public.profiles(id) on delete set null,
  revision integer not null default 0,
  fields jsonb not null default '{}'::jsonb,
  cover jsonb not null default '{}'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  source text not null default 'specs',
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_documents_title_check check (length(trim(title)) between 1 and 200),
  constraint project_documents_sections_arr check (jsonb_typeof(sections) = 'array'),
  constraint project_documents_status_check check (status in ('draft','in_progress','in_review','issued','archived')),
  constraint project_documents_type_check check (doc_type ~ '^[a-z0-9_]{2,40}$'),
  constraint project_documents_source_check check (source in ('manual','check','import','specs')),
  constraint project_documents_size check (pg_column_size(sections) < 8000000)
);
create index if not exists project_documents_owner_idx on public.project_documents(owner_id, updated_at desc);
create index if not exists project_documents_project_idx on public.project_documents(project_thread_id, updated_at desc);
alter table public.project_documents enable row level security;
grant select, insert, update, delete on public.project_documents to authenticated;

-- The owner always has access. A document filed under a firm project is also readable by that firm's members,
-- so a team can see the project's documents; only the owner may change or delete it.
drop policy if exists "project documents read" on public.project_documents;
create policy "project documents read" on public.project_documents for select to authenticated
  using (owner_id = auth.uid() or (project_thread_id is not null and exists (
    select 1 from public.project_threads t where t.id = project_thread_id and t.firm_id is not null and public.drawup_is_firm_member(t.firm_id))));
drop policy if exists "project documents insert" on public.project_documents;
create policy "project documents insert" on public.project_documents for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists "project documents update" on public.project_documents;
create policy "project documents update" on public.project_documents for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "project documents delete" on public.project_documents;
create policy "project documents delete" on public.project_documents for delete to authenticated
  using (owner_id = auth.uid());

-- ===== 2. version history (both stores)
create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  store text not null,
  document_id uuid not null,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  firm_id uuid references public.firms(id) on delete cascade,
  label text,
  title text,
  doc_type text,
  fields jsonb not null default '{}'::jsonb,
  cover jsonb not null default '{}'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  constraint document_versions_store_check check (store in ('project','firm')),
  constraint document_versions_sections_arr check (jsonb_typeof(sections) = 'array'),
  constraint document_versions_size check (pg_column_size(sections) < 8000000)
);
create index if not exists document_versions_doc_idx on public.document_versions(document_id, created_at desc);
alter table public.document_versions enable row level security;
grant select, insert, delete on public.document_versions to authenticated;

drop policy if exists "document versions read" on public.document_versions;
create policy "document versions read" on public.document_versions for select to authenticated
  using (owner_id = auth.uid() or (firm_id is not null and public.drawup_is_firm_member(firm_id)));
drop policy if exists "document versions insert" on public.document_versions;
create policy "document versions insert" on public.document_versions for insert to authenticated
  with check (owner_id = auth.uid() and (firm_id is null or public.drawup_is_firm_member(firm_id)));
drop policy if exists "document versions delete" on public.document_versions;
create policy "document versions delete" on public.document_versions for delete to authenticated
  using (owner_id = auth.uid());

-- ===== 3. imported files (the original is always kept)
create table if not exists public.document_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  document_id uuid,
  store text not null default 'project',
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text not null,
  pages integer,
  extracted boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  constraint document_imports_store_check check (store in ('project','firm')),
  constraint document_imports_name_check check (length(file_name) between 1 and 240)
);
create index if not exists document_imports_owner_idx on public.document_imports(owner_id, created_at desc);
alter table public.document_imports enable row level security;
grant select, insert, delete on public.document_imports to authenticated;
drop policy if exists "document imports own" on public.document_imports;
create policy "document imports own" on public.document_imports for select to authenticated using (owner_id = auth.uid());
drop policy if exists "document imports insert" on public.document_imports;
create policy "document imports insert" on public.document_imports for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "document imports delete" on public.document_imports;
create policy "document imports delete" on public.document_imports for delete to authenticated using (owner_id = auth.uid());

-- ===== 4. storage: documents/ inside each member's own folder of the existing private bucket
do $$ begin
  if exists (select 1 from storage.buckets where id = 'drawup-private') then
    drop policy if exists "drawup documents own files" on storage.objects;
    create policy "drawup documents own files" on storage.objects for all to authenticated
      using (bucket_id = 'drawup-private' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'drawup-private' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

select 'DONE document-studio-0077' as status;
