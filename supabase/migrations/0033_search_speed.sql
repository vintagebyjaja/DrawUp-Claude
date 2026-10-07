-- DrawUp v20 speed: saved searches also keep the quick answer, clarifying questions,
-- an order-free key for near-duplicate searches and which clarification people picked.
-- Firms and projects listed automatically from DrawUp Search are marked listed_via.
-- Additive and idempotent. Never drops or rewrites existing data.

alter table public.drawup_searches add column if not exists query_key text;
alter table public.drawup_searches add column if not exists quick jsonb;
alter table public.drawup_searches add column if not exists clarify jsonb;
alter table public.drawup_searches add column if not exists parent_norm text;
alter table public.drawup_searches add column if not exists ingest jsonb;

create index if not exists drawup_searches_key_idx on public.drawup_searches (query_key, search_type, completed_at desc);
create index if not exists drawup_searches_parent_idx on public.drawup_searches (parent_norm, search_type);
create index if not exists drawup_searches_running_idx on public.drawup_searches (query_key, search_type, created_at desc) where status = 'running';

alter table public.firms add column if not exists listed_via text;
alter table public.aec_projects add column if not exists listed_via text;

comment on column public.firms.listed_via is 'How DrawUp listed this firm. drawup_search means listed automatically from public sources found by DrawUp Search, unclaimed and unconfirmed.';
comment on column public.aec_projects.listed_via is 'How DrawUp listed this project. drawup_search means listed automatically from public sources found by DrawUp Search, unconfirmed.';

select 'DONE drawup-v20-speed-01' as status;
-- END
