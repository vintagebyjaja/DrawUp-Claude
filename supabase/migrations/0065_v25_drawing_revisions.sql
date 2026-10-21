-- DrawUp v25 Draw it up: set modes, revisions + redlines, markups, next steps, project to-dos.
-- - drawing_generations gains: mode (preliminary | full | explore | standard for v24 sets), the revision chain
--   (parent_id, root_id, revision), the comments a revision answered, the changes the AI made, the AI's next steps,
--   explore options, and the owner's open markups (comment pins on sheets).
-- - project_todos: next steps a member saved to a project ("Add to this project").
-- Rows in drawing_generations are still written only by /api/drawings/generate (service role). The owner may edit
-- markups. Additive and safe to run twice. Run after v24-02 (0053).
alter table public.drawing_generations add column if not exists mode text not null default 'standard';
alter table public.drawing_generations add column if not exists parent_id uuid references public.drawing_generations(id) on delete set null;
alter table public.drawing_generations add column if not exists root_id uuid references public.drawing_generations(id) on delete set null;
alter table public.drawing_generations add column if not exists revision integer not null default 0;
alter table public.drawing_generations add column if not exists comments jsonb not null default '[]'::jsonb;
alter table public.drawing_generations add column if not exists changes jsonb not null default '[]'::jsonb;
alter table public.drawing_generations add column if not exists next_steps jsonb not null default '[]'::jsonb;
alter table public.drawing_generations add column if not exists options jsonb;
alter table public.drawing_generations add column if not exists markups jsonb not null default '[]'::jsonb;
alter table public.drawing_generations drop constraint if exists drawing_generations_mode_check;
alter table public.drawing_generations add constraint drawing_generations_mode_check check (mode in ('preliminary', 'full', 'explore', 'standard'));
alter table public.drawing_generations drop constraint if exists drawing_generations_markups_check;
alter table public.drawing_generations add constraint drawing_generations_markups_check
  check (jsonb_typeof(markups) = 'array' and jsonb_array_length(markups) <= 200 and pg_column_size(markups) < 200000);
create index if not exists drawing_generations_root_idx on public.drawing_generations (root_id, revision);
grant update (markups) on public.drawing_generations to authenticated;

create table if not exists public.project_todos (
  id uuid primary key default gen_random_uuid(),
  project_thread_id uuid not null references public.project_threads(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  why text,
  instruction text,
  kind text not null default 'design',
  source_generation_id uuid references public.drawing_generations(id) on delete set null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.project_todos drop constraint if exists project_todos_status_check;
alter table public.project_todos add constraint project_todos_status_check check (status in ('open', 'added', 'done'));
alter table public.project_todos drop constraint if exists project_todos_text_check;
alter table public.project_todos add constraint project_todos_text_check
  check (char_length(title) between 1 and 200 and char_length(coalesce(why, '')) <= 1000 and char_length(coalesce(instruction, '')) <= 2000 and char_length(kind) <= 30);
create index if not exists project_todos_project_idx on public.project_todos (project_thread_id, created_at desc);
alter table public.project_todos enable row level security;
drop policy if exists "project todos own" on public.project_todos;
create policy "project todos own" on public.project_todos for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.project_threads t where t.id = project_thread_id and t.owner_id = auth.uid()));
grant select, insert, update, delete on public.project_todos to authenticated;
select 'DONE v25 drawing revisions + project to-dos' as status;
