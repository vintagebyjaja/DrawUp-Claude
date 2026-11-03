-- DrawUp Season 1 Portfolio Review (migration 0073, SQL portfolio-01).
-- Additive and safe to run twice. Nothing existing is dropped or overwritten.
-- Builds on the V8 foundation (0008): the portfolio_reviews table and the private student-portfolios bucket.
--  * portfolio_reviews gets the review goal, the rendered page list, the linked project, the AI job, scores and
--    the member's page questions. Rows are private: the member reads and deletes their own; only the server
--    (service role, /api/portfolio) writes reviews, scores and answers. HQ can read for support.
--  * A new row must start empty (status submitted, no feedback), so nobody can plant a finished review.
--  * The original PDF stays untouched in student-portfolios/<user id>/<review id>/. Rendered page pictures go to
--    drawup-private/<user id>/portfolio/<review id>/ (owner folder rules from 0023 already apply).

alter table public.portfolio_reviews
  add column if not exists title text,
  add column if not exists goal text not null default 'general',
  add column if not exists project_thread_id uuid references public.project_threads(id) on delete set null,
  add column if not exists page_count integer,
  add column if not exists pages jsonb not null default '[]'::jsonb,
  add column if not exists ai_response_id text,
  add column if not exists ai_model text,
  add column if not exists credits_charged integer not null default 0,
  add column if not exists credit_access jsonb,
  add column if not exists started_at timestamptz,
  add column if not exists error text,
  add column if not exists questions jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

-- Goals and disciplines. The old discipline check only allowed architecture and interior design.
do $$ begin
  alter table public.portfolio_reviews drop constraint if exists portfolio_reviews_discipline_check;
  alter table public.portfolio_reviews add constraint portfolio_reviews_discipline_check
    check (discipline in ('architecture', 'interior_design', 'landscape', 'urban_design', 'other'));
  if not exists (select 1 from pg_constraint where conname = 'portfolio_reviews_goal_check') then
    alter table public.portfolio_reviews add constraint portfolio_reviews_goal_check
      check (goal in ('internship', 'architecture_school', 'employment', 'graduate_school', 'general'));
  end if;
end $$;

create index if not exists portfolio_reviews_user_idx on public.portfolio_reviews (user_id, created_at desc);
create index if not exists portfolio_reviews_project_idx on public.portfolio_reviews (project_thread_id) where project_thread_id is not null;
create unique index if not exists portfolio_reviews_ai_response_idx on public.portfolio_reviews (ai_response_id) where ai_response_id is not null;

-- Policies: read own (HQ reads all), create own empty row, delete own. No member update policy: the server writes.
drop policy if exists "Users can read own portfolio reviews" on public.portfolio_reviews;
drop policy if exists "Users can create own portfolio reviews" on public.portfolio_reviews;
drop policy if exists "portfolio owner read" on public.portfolio_reviews;
drop policy if exists "portfolio owner create" on public.portfolio_reviews;
drop policy if exists "portfolio owner delete" on public.portfolio_reviews;
create policy "portfolio owner read" on public.portfolio_reviews for select
  using (auth.uid() = user_id or public.is_drawup_admin());
create policy "portfolio owner create" on public.portfolio_reviews for insert
  with check (
    auth.uid() = user_id and status = 'submitted' and feedback is null and ai_response_id is null
    and credits_charged = 0 and credit_access is null and questions = '[]'::jsonb and completed_at is null
    and (project_thread_id is null or exists (select 1 from public.project_threads pt where pt.id = project_thread_id and pt.owner_id = auth.uid()))
  );
create policy "portfolio owner delete" on public.portfolio_reviews for delete using (auth.uid() = user_id);
grant select, insert, delete on public.portfolio_reviews to authenticated;

-- The original PDFs: portfolios are often larger than 20 MB, so the bucket now takes up to 50 MB. Still private, PDF only.
update storage.buckets set file_size_limit = 52428800, allowed_mime_types = array['application/pdf'], public = false where id = 'student-portfolios';
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-portfolios', 'student-portfolios', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;
drop policy if exists "Users delete own portfolio PDFs" on storage.objects;
create policy "Users delete own portfolio PDFs" on storage.objects for delete to authenticated
  using (bucket_id = 'student-portfolios' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.portfolio_reviews_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists portfolio_reviews_touch on public.portfolio_reviews;
create trigger portfolio_reviews_touch before update on public.portfolio_reviews for each row execute function public.portfolio_reviews_touch();

select 'DONE drawup-portfolio-01' as result;
