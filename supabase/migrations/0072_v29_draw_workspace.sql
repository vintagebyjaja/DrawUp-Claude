-- DrawUp v29 Draw Workspace 2.0 (migration 0072, SQL v29-01).
-- Additive and safe to run twice. Nothing existing is dropped or changed.
--  * drawing_versions: saved versions of a drawing (revision history and rollback). Written by the page, owner only.
--    Each drawing keeps its newest 60 versions; older ones are pruned when a new one is saved.
--  * draw_components: a member's own library components (name, size, category, optional picture in drawup-private).
--    Private to the member.
--  The workspace's own settings (style, finishes, assumptions, brand palette) live inside drawings.model.ws, so the
--  drawings table itself does not change.

create table if not exists public.drawing_versions (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references public.drawings(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  revision integer not null default 1,
  label text not null default 'Autosave' check (char_length(label) <= 120),
  reason text not null default 'auto' check (reason in ('auto', 'manual', 'import', 'ai_edit', 'command', 'restore')),
  model jsonb not null,
  geom_hash text,
  created_at timestamptz not null default now()
);
create index if not exists drawing_versions_drawing_idx on public.drawing_versions (drawing_id, created_at desc);
alter table public.drawing_versions enable row level security;
drop policy if exists "drawing versions owner all" on public.drawing_versions;
create policy "drawing versions owner all" on public.drawing_versions for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.drawings d where d.id = drawing_id and d.owner_id = auth.uid()));

create or replace function public.drawing_versions_prune() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.drawing_versions v
   where v.drawing_id = new.drawing_id
     and v.id not in (select id from public.drawing_versions where drawing_id = new.drawing_id order by created_at desc limit 60);
  return null;
end $$;
drop trigger if exists drawing_versions_prune on public.drawing_versions;
create trigger drawing_versions_prune after insert on public.drawing_versions for each row execute function public.drawing_versions_prune();

create table if not exists public.draw_components (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  category text not null default 'custom' check (char_length(category) <= 30),
  w numeric not null default 24 check (w > 0 and w <= 12000),
  d numeric not null default 24 check (d > 0 and d <= 12000),
  h numeric not null default 30 check (h >= 0 and h <= 12000),
  shape text not null default 'box' check (shape in ('box', 'round')),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  image_path text check (image_path is null or image_path like (owner_id::text || '/draw/%')),
  tags text not null default '' check (char_length(tags) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists draw_components_owner_idx on public.draw_components (owner_id, created_at desc);
alter table public.draw_components enable row level security;
drop policy if exists "draw components owner all" on public.draw_components;
create policy "draw components owner all" on public.draw_components for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

select 'DONE drawup-v29-01' as status;
