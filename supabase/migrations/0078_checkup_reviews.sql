-- 0078 Season 1 CheckUp: Specifications Review and DD Readiness.
-- Additive and safe to run twice. Nothing existing is changed or dropped; drawing, narrative and portfolio
-- reviews stay in check_reviews and portfolio_reviews and keep working exactly as they do.
--
-- Both of these reviews read the member's own records (their specifications, their project information,
-- their drawing sets and their finished checks) and write what they found. No AI writes these rows, so
-- a member creates them directly; the findings always say which rule and which record each one came from.

create table if not exists public.spec_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  project_thread_id uuid references public.project_threads(id) on delete set null,
  kind text not null default 'specs',
  title text not null,
  document_id uuid,                -- the specification reviewed (project_documents or firm_documents)
  document_store text,             -- 'project' | 'firm'
  document_title text,
  check_review_id uuid references public.check_reviews(id) on delete set null,
  status text not null default 'complete',
  score integer,                   -- advisory readiness, 0-100, never a prediction or an approval
  summary text,
  findings jsonb not null default '[]'::jsonb,
  resolved jsonb not null default '[]'::jsonb,
  runs jsonb not null default '[]'::jsonb,   -- one entry per run: when, counts, what was resolved since
  report_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spec_reviews_kind_check check (kind in ('specs', 'dd_readiness')),
  constraint spec_reviews_store_check check (document_store is null or document_store in ('project', 'firm')),
  constraint spec_reviews_status_check check (status in ('complete', 'in_progress', 'failed')),
  constraint spec_reviews_title_check check (length(trim(title)) between 1 and 200),
  constraint spec_reviews_score_check check (score is null or (score between 0 and 100)),
  constraint spec_reviews_findings_arr check (jsonb_typeof(findings) = 'array'),
  constraint spec_reviews_resolved_arr check (jsonb_typeof(resolved) = 'array'),
  constraint spec_reviews_runs_arr check (jsonb_typeof(runs) = 'array'),
  constraint spec_reviews_size check (pg_column_size(findings) < 4000000)
);
create index if not exists spec_reviews_owner_idx on public.spec_reviews(owner_id, created_at desc);
create index if not exists spec_reviews_project_idx on public.spec_reviews(project_thread_id, created_at desc);
create index if not exists spec_reviews_doc_idx on public.spec_reviews(document_id, created_at desc);

alter table public.spec_reviews enable row level security;
grant select, insert, update, delete on public.spec_reviews to authenticated;

-- The owner always has access. A review of a firm project is also readable by that firm's members, so the
-- team can see where the project stands; only the owner may change or delete it.
drop policy if exists "spec reviews read" on public.spec_reviews;
create policy "spec reviews read" on public.spec_reviews for select to authenticated
  using (owner_id = auth.uid() or (project_thread_id is not null and exists (
    select 1 from public.project_threads t where t.id = project_thread_id and t.firm_id is not null and public.drawup_is_firm_member(t.firm_id))));
drop policy if exists "spec reviews insert" on public.spec_reviews;
create policy "spec reviews insert" on public.spec_reviews for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists "spec reviews update" on public.spec_reviews;
create policy "spec reviews update" on public.spec_reviews for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "spec reviews delete" on public.spec_reviews;
create policy "spec reviews delete" on public.spec_reviews for delete to authenticated
  using (owner_id = auth.uid());

create or replace function public.spec_reviews_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists spec_reviews_touch on public.spec_reviews;
create trigger spec_reviews_touch before update on public.spec_reviews
  for each row execute function public.spec_reviews_touch();

select 'DONE checkup-reviews-0078' as status;
