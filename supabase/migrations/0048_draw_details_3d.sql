-- DrawUp V22 Draw, migration 0048 file 1 of 2: drawn details (plan or section) with a 3D hologram.
-- Additive and safe to run twice. Nothing is dropped or rewritten.
-- The model is the detail geometry (material regions, lines, notes, dimensions) in inches.
-- Image files (hologram snapshot, shaded model view) stay in the private bucket drawup-private
-- under the owner folder. The realistic render is a normal Swap generation the owner made.

create table if not exists public.draw_details (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Detail',
  kind text not null default 'section',
  category text,
  scale_denominator integer not null default 8,
  model jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  drawing_id uuid references public.drawings(id) on delete set null,
  holo_path text,
  model_path text,
  render_path text,
  swap_generation_id uuid references public.swap_generations(id) on delete set null,
  swap_thread_id uuid references public.swap_threads(id) on delete set null,
  in_library boolean not null default false,
  in_playbook boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint draw_details_kind_check check (kind in ('section', 'plan')),
  constraint draw_details_name_len check (char_length(name) between 1 and 200),
  constraint draw_details_category_len check (category is null or char_length(category) <= 80),
  constraint draw_details_scale_check check (scale_denominator between 1 and 96),
  constraint draw_details_model_obj check (jsonb_typeof(model) = 'object'),
  constraint draw_details_settings_obj check (jsonb_typeof(settings) = 'object')
);

create index if not exists draw_details_owner_idx
  on public.draw_details (owner_id, updated_at desc);
create index if not exists draw_details_library_idx
  on public.draw_details (owner_id, updated_at desc) where in_library;
create index if not exists draw_details_playbook_idx
  on public.draw_details (owner_id, updated_at desc) where in_playbook;

select 'DONE 0048_1_draw_details_table' as status;
-- END
-- DrawUp V22 Draw, migration 0048 file 2 of 2: row level security for draw_details.
-- Additive and safe to run twice. Nothing is dropped except the policy of this file, re-created.
-- Owners only: no admin, campus manager, organization manager or firm access is added.
-- Every stored file path must sit in the owner folder, and a linked Swap generation or
-- Swap thread must belong to the owner.

alter table public.draw_details enable row level security;

drop policy if exists "draw details owner all" on public.draw_details;
create policy "draw details owner all" on public.draw_details
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (holo_path is null or public.storage_path_is_own(holo_path))
    and (model_path is null or public.storage_path_is_own(model_path))
    and (render_path is null or public.storage_path_is_own(render_path))
    and (swap_generation_id is null or exists (
      select 1 from public.swap_generations g where g.id = swap_generation_id and g.owner_id = auth.uid()))
    and (swap_thread_id is null or exists (
      select 1 from public.swap_threads t where t.id = swap_thread_id and t.owner_id = auth.uid()))
  );

grant select, insert, update, delete on public.draw_details to authenticated;

select 'DONE 0048_2_draw_details_rls' as status;
-- END
