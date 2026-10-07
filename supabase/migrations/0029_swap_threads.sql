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
-- DrawUp V20 Swap threads, file 2 of 3: new columns on swap_generations.
-- Additive and idempotent. Nothing is dropped or wiped. Safe to run again.
-- thread_id links a result to its thread, area is the part of the image to change
-- (for example Floor), mask_path is the brushed mask PNG in the member private folder,
-- started_at is set by the server when generation starts (for the two minute limit).

alter table public.swap_generations add column if not exists thread_id uuid references public.swap_threads(id) on delete set null;
alter table public.swap_generations add column if not exists area text;
alter table public.swap_generations add column if not exists mask_path text;
alter table public.swap_generations add column if not exists started_at timestamptz;

create index if not exists swap_generations_thread_idx
  on public.swap_generations (thread_id, created_at);

-- Extra rules for new rows (restrictive policies only narrow what members can insert).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'swap_generations' and policyname = 'swap v20 insert limits') then
    create policy "swap v20 insert limits" on public.swap_generations as restrictive for insert to authenticated
      with check (
        started_at is null
        and (mask_path is null or storage_path_is_own(mask_path))
        and (area is null or char_length(area) <= 120)
        and (thread_id is null or exists (select 1 from public.swap_threads t where t.id = thread_id and t.owner_id = auth.uid()))
      );
  end if;
end $$;

select 'V20 SWAP FILE 2 DONE' as status;
-- END-OF-V20-SWAP-FILE-2
-- DrawUp V20 Swap threads, file 3 of 3: row level security policies.
-- Additive and idempotent. Nothing is dropped or wiped. Safe to run again.
-- Members see and change only their own swap threads and messages. No admin access is added.

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'swap_threads' and policyname = 'swap thread owner read') then
    create policy "swap thread owner read" on public.swap_threads for select to authenticated
      using (owner_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'swap_threads' and policyname = 'swap thread owner create') then
    create policy "swap thread owner create" on public.swap_threads for insert to authenticated
      with check (owner_id = auth.uid() and storage_path_is_own(source_path));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'swap_threads' and policyname = 'swap thread owner update') then
    create policy "swap thread owner update" on public.swap_threads for update to authenticated
      using (owner_id = auth.uid())
      with check (owner_id = auth.uid() and storage_path_is_own(source_path));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'swap_threads' and policyname = 'swap thread owner delete') then
    create policy "swap thread owner delete" on public.swap_threads for delete to authenticated
      using (owner_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'swap_messages' and policyname = 'swap message owner read') then
    create policy "swap message owner read" on public.swap_messages for select to authenticated
      using (owner_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'swap_messages' and policyname = 'swap message owner create') then
    create policy "swap message owner create" on public.swap_messages for insert to authenticated
      with check (
        owner_id = auth.uid()
        and exists (select 1 from public.swap_threads t where t.id = thread_id and t.owner_id = auth.uid())
        and (image_path is null or storage_path_is_own(image_path))
        and (generation_id is null or exists (select 1 from public.swap_generations g where g.id = generation_id and g.owner_id = auth.uid()))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'swap_messages' and policyname = 'swap message owner delete') then
    create policy "swap message owner delete" on public.swap_messages for delete to authenticated
      using (owner_id = auth.uid());
  end if;
end $$;

select 'V20 SWAP FILE 3 DONE' as status;
-- END-OF-V20-SWAP-FILE-3
