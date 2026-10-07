-- DrawUp V20 Swap threads, file 1 of 3: thread and message tables.
-- Additive and idempotent. Nothing is dropped or wiped. Safe to run again.
-- A swap thread starts from one image. Each request and each result is a message.
-- Results stay in swap_generations (one row per generated image).

create table if not exists public.swap_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New swap',
  source_path text not null,
  project_thread_id uuid references public.project_threads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint swap_threads_title_len check (char_length(title) <= 160)
);

create index if not exists swap_threads_owner_idx
  on public.swap_threads (owner_id, updated_at desc);

create table if not exists public.swap_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.swap_threads(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'user',
  body text,
  area text,
  image_path text,
  generation_id uuid references public.swap_generations(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint swap_messages_role_check check (role in ('user', 'assistant')),
  constraint swap_messages_body_len check (body is null or char_length(body) <= 4000),
  constraint swap_messages_area_len check (area is null or char_length(area) <= 120)
);

create index if not exists swap_messages_thread_idx
  on public.swap_messages (thread_id, created_at);

alter table public.swap_threads enable row level security;
alter table public.swap_messages enable row level security;

grant select, insert, update, delete on public.swap_threads to authenticated;
grant select, insert, delete on public.swap_messages to authenticated;

select 'V20 SWAP FILE 1 DONE' as status;
-- END-OF-V20-SWAP-FILE-1
