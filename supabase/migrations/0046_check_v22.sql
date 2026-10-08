-- DrawUp V22 Check: design narrative review, narrative vs. plans, approved rewrite, and
-- a notice for reviews that finished from partial output. Additive and safe to run twice.
-- No existing column, row or policy behaviour is removed.

alter table public.check_reviews add column if not exists mode text not null default 'plans';
alter table public.check_reviews add column if not exists plans_path text;
alter table public.check_reviews add column if not exists plans_name text;
alter table public.check_reviews add column if not exists report jsonb not null default '{}'::jsonb;
alter table public.check_reviews add column if not exists approved jsonb;
alter table public.check_reviews add column if not exists rewrite jsonb;
alter table public.check_reviews add column if not exists rewrite_status text not null default 'none';
alter table public.check_reviews add column if not exists rewrite_response_id text;
alter table public.check_reviews add column if not exists rewrite_error text;
alter table public.check_reviews add column if not exists notice text;

alter table public.check_reviews drop constraint if exists check_reviews_mode_check;
alter table public.check_reviews add constraint check_reviews_mode_check
  check (mode in ('plans', 'narrative', 'narrative_plans'));
alter table public.check_reviews drop constraint if exists check_reviews_rewrite_status_check;
alter table public.check_reviews add constraint check_reviews_rewrite_status_check
  check (rewrite_status in ('none', 'writing', 'complete', 'failed'));

-- Members still only create queued rows with nothing filled in by the AI. The plans file of a
-- narrative vs. plans review must sit in their own private folder too.
drop policy if exists "check owner create" on public.check_reviews;
create policy "check owner create" on public.check_reviews for insert with check (
  owner_id = auth.uid()
  and status = 'queued' and response_id is null and summary is null
  and findings = '[]'::jsonb and credits_charged = 0 and credit_access is null
  and storage_path_is_own(file_path)
  and (plans_path is null or storage_path_is_own(plans_path))
  and report = '{}'::jsonb and approved is null and rewrite is null
  and rewrite_status = 'none' and rewrite_response_id is null and notice is null
);

-- Reviews still running are looked up per owner when the page reconciles them.
create index if not exists check_reviews_owner_status_idx on public.check_reviews(owner_id, status);

notify pgrst, 'reload schema';

select 'DONE 0046_check_v22' as status;
-- END
