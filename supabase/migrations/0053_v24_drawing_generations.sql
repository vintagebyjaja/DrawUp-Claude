-- DrawUp v24-02: "Draw it up" drawing sets. One row per generated set: the building model every sheet is drawn from,
-- the source pictures (drawup-private/<user id>/drawings/...), the details it flagged and the title block status.
-- Rows are written by /api/drawings/generate (service role); the owner reads, renames, updates status and deletes.
-- Additive and safe to run twice.
create table if not exists public.drawing_generations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_thread_id uuid references public.project_threads(id) on delete set null,
  coach_thread_id uuid references public.coach_threads(id) on delete set null,
  title text not null default 'Drawing set',
  model jsonb not null,
  source_paths text[] not null default array[]::text[],
  notes text,
  location text,
  details_needed jsonb not null default '[]'::jsonb,
  issue_status text not null default 'Preliminary',
  reviewer text,
  license_no text,
  credits_charged integer not null default 0,
  ai_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists drawing_generations_owner_idx on public.drawing_generations (owner_id, created_at desc);
create index if not exists drawing_generations_project_idx on public.drawing_generations (project_thread_id);
alter table public.drawing_generations enable row level security;
drop policy if exists "drawing generations own read" on public.drawing_generations;
create policy "drawing generations own read" on public.drawing_generations for select using (owner_id = auth.uid());
drop policy if exists "drawing generations own update" on public.drawing_generations;
create policy "drawing generations own update" on public.drawing_generations for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "drawing generations own delete" on public.drawing_generations;
create policy "drawing generations own delete" on public.drawing_generations for delete using (owner_id = auth.uid());
grant select, delete on public.drawing_generations to authenticated;
grant update (title, issue_status, reviewer, license_no, project_thread_id, updated_at) on public.drawing_generations to authenticated;
select 'DONE v24-02 drawing generations' as status;
