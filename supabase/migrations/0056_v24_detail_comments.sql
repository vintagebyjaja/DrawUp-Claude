-- DrawUp v24-05: comments on any detail in the Details library: is it right, does it only work in certain
-- situations, is it wrong, or a question. detail_key says which detail: typical:<catalog id>, find:<uuid>,
-- upload:<uuid>. Everyone can read; signed-in members comment; authors and HQ edit or remove. Safe to run twice.
create table if not exists public.detail_comments (
  id uuid primary key default gen_random_uuid(),
  detail_key text not null,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  verdict text not null default 'note',
  conditions text,
  body text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.detail_comments drop constraint if exists detail_comments_key_check;
alter table public.detail_comments add constraint detail_comments_key_check check (detail_key ~ '^(typical|find|upload):[A-Za-z0-9_.-]{1,80}$');
alter table public.detail_comments drop constraint if exists detail_comments_verdict_check;
alter table public.detail_comments add constraint detail_comments_verdict_check check (verdict in ('correct', 'conditional', 'incorrect', 'question', 'note'));
alter table public.detail_comments drop constraint if exists detail_comments_body_check;
alter table public.detail_comments add constraint detail_comments_body_check check (char_length(body) between 1 and 4000 and char_length(coalesce(conditions, '')) <= 1000);
create index if not exists detail_comments_key_idx on public.detail_comments (detail_key, created_at);
alter table public.detail_comments enable row level security;
drop policy if exists "detail comments read" on public.detail_comments;
create policy "detail comments read" on public.detail_comments for select using (not hidden or user_id = auth.uid() or public.is_drawup_admin());
drop policy if exists "detail comments insert own" on public.detail_comments;
create policy "detail comments insert own" on public.detail_comments for insert
  with check (user_id = auth.uid() and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and not hidden);
drop policy if exists "detail comments update own or hq" on public.detail_comments;
create policy "detail comments update own or hq" on public.detail_comments for update
  using (user_id = auth.uid() or public.is_drawup_admin()) with check (user_id = auth.uid() or public.is_drawup_admin());
drop policy if exists "detail comments delete own or hq" on public.detail_comments;
create policy "detail comments delete own or hq" on public.detail_comments for delete using (user_id = auth.uid() or public.is_drawup_admin());
grant select on public.detail_comments to anon, authenticated;
grant insert, update, delete on public.detail_comments to authenticated;
select 'DONE v24-05 detail comments' as status;
