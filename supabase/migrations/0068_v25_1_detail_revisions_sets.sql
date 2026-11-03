-- DrawUp v25.1-03: working on one detail.
--   * Revisions: comment on an AI-drawn detail (pinned or general) and regenerate it as the next revision. Every
--     revision is its own row in details, chained by root_id / parent_id / revision, so nothing is overwritten.
--   * "Needs more info": the AI says what it is missing (needs_more_info, info_requests) and the member uploads more
--     screenshots or pages to upgrade the detail.
--   * Sheet references: detail_no + sheet_no (C2 on A601) give sheet_ref "C2-A601", so Details can open that exact
--     detail. project_name, rev_label and drawing_date name the files ("C2-A601 - Project - Revision 1 - Date").
--   * Sets: source_set says where the detail came from (a Draw it up set slot, or a page box in an uploaded set PDF).
--     Approving a revision (approved_at) puts it back in that one spot. For a Draw it up set,
--     drawing_generations.detail_overrides maps the slot ("4/A501") to the approved details id; nothing else changes.
--   * Ask the team: questions about a detail and the AI team's answers (detail_team_answers).
-- Additive and safe to run twice. Run after v25.1-02.
alter table public.details add column if not exists root_id uuid;
alter table public.details add column if not exists parent_id uuid;
alter table public.details add column if not exists revision integer not null default 0;
alter table public.details add column if not exists detail_no text;
alter table public.details add column if not exists sheet_no text;
alter table public.details add column if not exists sheet_ref text;
alter table public.details add column if not exists project_name text;
alter table public.details add column if not exists rev_label text;
alter table public.details add column if not exists drawing_date text;
alter table public.details add column if not exists needs_more_info boolean not null default false;
alter table public.details add column if not exists info_requests jsonb not null default '[]'::jsonb;
alter table public.details add column if not exists revise_comments jsonb not null default '[]'::jsonb;
alter table public.details add column if not exists source_set jsonb;
alter table public.details add column if not exists approved_at timestamptz;
alter table public.details add column if not exists approved_by uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'details_parent_fk') then
    alter table public.details add constraint details_parent_fk foreign key (parent_id) references public.details(id) on delete set null;
  end if;
end $$;
create index if not exists details_sheet_ref_idx on public.details (sheet_ref) where sheet_ref is not null;
create index if not exists details_root_idx on public.details (root_id, revision);
create index if not exists details_source_set_path_idx on public.details ((source_set ->> 'path')) where source_set is not null;

-- Members may not approve, re-chain or re-point AI details by hand: /api/details/draw does that (service role).
create or replace function public.details_ai_guard() returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or (auth.uid() is null and current_user in ('postgres', 'supabase_admin')) or old.source is distinct from 'drawup_ai' then return new; end if;
  if new.drawing is distinct from old.drawing or new.root_id is distinct from old.root_id or new.parent_id is distinct from old.parent_id
     or new.revision is distinct from old.revision or new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by
     or new.source is distinct from old.source or new.ai_response_id is distinct from old.ai_response_id
     or (new.source_set - 'updated_path' - 'updated_at') is distinct from (old.source_set - 'updated_path' - 'updated_at') then
    raise exception 'Only DrawUp can change an AI-drawn detail''s drawing, revision or approval.';
  end if;
  return new;
end $$;
drop trigger if exists details_ai_guard on public.details;
create trigger details_ai_guard before update on public.details for each row execute function public.details_ai_guard();

alter table public.drawing_generations add column if not exists detail_overrides jsonb not null default '{}'::jsonb;

create table if not exists public.detail_team_answers (
  id uuid primary key default gen_random_uuid(),
  detail_id uuid not null references public.details(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  question text not null,
  answer text not null,
  verdict text not null default 'note',
  suggestions jsonb not null default '[]'::jsonb,
  info_requests jsonb not null default '[]'::jsonb,
  speaker text not null default 'Arch Coach',
  credits_charged integer not null default 0,
  ai_response_id text,
  created_at timestamptz not null default now()
);
create unique index if not exists detail_team_answers_response_idx on public.detail_team_answers (ai_response_id) where ai_response_id is not null;
create index if not exists detail_team_answers_idx on public.detail_team_answers (detail_id, created_at);
alter table public.detail_team_answers enable row level security;
drop policy if exists "detail team answers read own or owner" on public.detail_team_answers;
create policy "detail team answers read own or owner" on public.detail_team_answers for select
  using (user_id = auth.uid() or exists (select 1 from public.details d where d.id = detail_id and d.owner_id = auth.uid()));
drop policy if exists "detail team answers delete own" on public.detail_team_answers;
create policy "detail team answers delete own" on public.detail_team_answers for delete using (user_id = auth.uid());
-- Inserted only by /api/details/draw (service role).

notify pgrst, 'reload schema';
select 'DONE v25.1 detail revisions, sheet references and set replacement' as status;
