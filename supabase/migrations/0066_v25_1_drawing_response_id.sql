-- DrawUp v25.1-01: Draw it up runs the AI as a background job (Cloudflare CPU fix). drawing_generations remembers
-- which AI answer each set came from, so when two polls (two tabs, or a retry) see the same finished answer, the set
-- is saved once. Additive and safe to run twice. Run after v25-06 (0065).
alter table public.drawing_generations add column if not exists ai_response_id text;
create unique index if not exists drawing_generations_ai_response_idx on public.drawing_generations (ai_response_id) where ai_response_id is not null;
notify pgrst, 'reload schema';

select 'DONE v25.1 drawing background jobs' as status;
