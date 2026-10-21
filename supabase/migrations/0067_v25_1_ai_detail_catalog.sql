-- DrawUp v25.1-02: "Draw a detail" on the Details tab. A member uploads one detail; DrawUp finds the flaws, explains
-- each fix and redraws it as one clean detail at a true architectural scale. The result is a row in details
-- (source = 'drawup_ai') holding the drawing model and the review, so it shows in the Detail Catalog for everyone
-- (visibility 'drawup') or only its owner ('private'), and Draw it up can point to it from a set's "details needed".
-- Rows are written only by /api/details/draw (service role); the owner can still edit or remove their row as before.
-- Additive and safe to run twice. Run after v25.1-01.
alter table public.details add column if not exists source text not null default 'upload';
alter table public.details add column if not exists detail_code text;
alter table public.details add column if not exists drawing jsonb;
alter table public.details add column if not exists review jsonb;
alter table public.details add column if not exists source_paths text[] not null default array[]::text[];
alter table public.details add column if not exists ai_response_id text;
alter table public.details add column if not exists ai_model text;
alter table public.details add column if not exists credits_charged integer not null default 0;
alter table public.details drop constraint if exists details_source_check;
alter table public.details add constraint details_source_check check (source in ('upload', 'drawup_ai'));
alter table public.details drop constraint if exists details_drawing_size_check;
alter table public.details add constraint details_drawing_size_check check (drawing is null or pg_column_size(drawing) < 400000);
create unique index if not exists details_ai_response_idx on public.details (ai_response_id) where ai_response_id is not null;
create index if not exists details_source_idx on public.details (source, status, created_at desc);

-- Members may not turn their own upload into an "AI-drawn" catalog item or change its drawing by hand.
drop policy if exists "details ai fields server only" on public.details;
create policy "details ai fields server only" on public.details as restrictive
  for insert with check (source = 'upload' and drawing is null and ai_response_id is null);

notify pgrst, 'reload schema';
select 'DONE v25.1 AI details in the Detail Catalog' as status;
