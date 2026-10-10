-- Run after 0046_check_v22.sql. Additive; preserves existing reviews and RLS.
alter table public.check_reviews add column if not exists sheet_total integer;
alter table public.check_reviews add column if not exists sheet_index integer not null default 0;
alter table public.check_reviews add column if not exists sheet_state text;
alter table public.check_reviews add column if not exists sheet_started_at timestamptz;
alter table public.check_reviews add column if not exists sheet_attempts integer not null default 0;
alter table public.check_reviews add column if not exists sheet_completed jsonb not null default '[]'::jsonb;
alter table public.check_reviews add column if not exists sheet_failed jsonb not null default '[]'::jsonb;
create index if not exists check_sheet_running_idx on public.check_reviews(status, sheet_state) where status = 'reviewing';
notify pgrst, 'reload schema';
