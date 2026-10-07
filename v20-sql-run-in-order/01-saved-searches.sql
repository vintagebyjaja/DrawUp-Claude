-- DrawUp V20B SQL, FILE 1 OF 1: saved searches (every search is stored with its answer).
-- Safe to run again. Nothing is deleted.

-- DrawUp v20: every search is saved with its researched answer.
-- Repeat searches load the saved answer instantly. Additive and idempotent.
-- Only the server (service role) reads or writes this table, so members never see each other's searches.

create table if not exists public.drawup_searches (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  query_norm text not null,
  search_type text not null default 'all',
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'running',
  response_id text,
  result jsonb,
  title text,
  entity_type text,
  location text,
  hits integer not null default 1,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists drawup_searches_norm_idx on public.drawup_searches (query_norm, search_type, completed_at desc);
create index if not exists drawup_searches_resp_idx on public.drawup_searches (response_id);

alter table public.drawup_searches enable row level security;
revoke all on public.drawup_searches from anon, authenticated;

select 'V20B FILE 1 OF 1 DONE' as status;
-- END-OF-V20B-FILE-1
