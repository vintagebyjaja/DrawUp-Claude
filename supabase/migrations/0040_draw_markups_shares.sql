-- DrawUp V21 Draw, migration 0040 file 1 of 3: markups (redlines on an uploaded image or PDF).
-- Additive and safe to run twice. Nothing is dropped or rewritten.
-- The uploaded file stays in the private bucket drawup-private under the owner folder.

create table if not exists public.draw_markups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Markup',
  source_path text not null,
  source_kind text not null default 'image',
  source_name text,
  page integer not null default 1,
  page_count integer not null default 1,
  width integer,
  height integer,
  marks jsonb not null default '[]'::jsonb,
  drawing_id uuid references public.drawings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint draw_markups_kind_check check (source_kind in ('image', 'pdf')),
  constraint draw_markups_name_len check (char_length(name) between 1 and 200),
  constraint draw_markups_page_check check (page >= 1 and page_count >= 1 and page <= page_count),
  constraint draw_markups_marks_array check (jsonb_typeof(marks) = 'array')
);

create index if not exists draw_markups_owner_idx
  on public.draw_markups (owner_id, updated_at desc);

alter table public.draw_markups enable row level security;

-- Owners only. The file path must sit in the owner folder of the private bucket.
drop policy if exists "draw markups owner all" on public.draw_markups;
create policy "draw markups owner all" on public.draw_markups
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and split_part(source_path, '/', 1) = auth.uid()::text);

grant select, insert, update, delete on public.draw_markups to authenticated;

select 'DONE 0040_1_draw_markups' as status;
-- END

-- DrawUp V21 Draw, migration 0040 file 2 of 3: share links for a drawing or a markup.
-- Additive and safe to run twice. Nothing is dropped or rewritten.
-- A link opens only for the owner and the people it was shared with: named people,
-- everyone in one firm the owner belongs to, or the members of one chat the owner is in.

create table if not exists public.draw_shares (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  drawing_id uuid references public.drawings(id) on delete cascade,
  markup_id uuid references public.draw_markups(id) on delete cascade,
  firm_id uuid references public.firms(id) on delete cascade,
  chat_id uuid references public.connect_chats(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint draw_shares_one_target check ((drawing_id is null) <> (markup_id is null)),
  constraint draw_shares_note_len check (note is null or char_length(note) <= 500)
);

create index if not exists draw_shares_owner_idx on public.draw_shares (owner_id, created_at desc);

create table if not exists public.draw_share_people (
  share_id uuid not null references public.draw_shares(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (share_id, user_id)
);

create index if not exists draw_share_people_user_idx on public.draw_share_people (user_id);

alter table public.draw_shares enable row level security;
alter table public.draw_share_people enable row level security;

-- Owners manage their own shares, only for their own drawing or markup, only to a firm
-- they belong to, and only to a chat they are a member of.
drop policy if exists "draw shares owner all" on public.draw_shares;
create policy "draw shares owner all" on public.draw_shares
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (drawing_id is null or exists (select 1 from public.drawings d where d.id = drawing_id and d.owner_id = auth.uid()))
    and (markup_id is null or exists (select 1 from public.draw_markups k where k.id = markup_id and k.owner_id = auth.uid()))
    and (firm_id is null or exists (select 1 from public.firm_members f where f.firm_id = draw_shares.firm_id and f.user_id = auth.uid()))
    and (chat_id is null or public.connect_is_chat_member(chat_id))
  );

drop policy if exists "draw share people owner all" on public.draw_share_people;
create policy "draw share people owner all" on public.draw_share_people
  for all to authenticated
  using (exists (select 1 from public.draw_shares s where s.id = share_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.draw_shares s where s.id = share_id and s.owner_id = auth.uid()));

drop policy if exists "draw share people see own" on public.draw_share_people;
create policy "draw share people see own" on public.draw_share_people
  for select to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.draw_shares to authenticated;
grant select, insert, update, delete on public.draw_share_people to authenticated;

select 'DONE 0040_2_draw_shares' as status;
-- END

-- DrawUp V21 Draw, migration 0040 file 3 of 3: opening a share link.
-- Additive and safe to run twice. Functions are single sql statements (no plpgsql).
-- draw_share_open returns nothing (null) to anyone the link was not shared with.

create or replace function public.draw_share_allowed(p_share uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from draw_shares s
     where s.id = p_share and s.revoked_at is null
       and (s.owner_id = auth.uid()
         or exists (select 1 from draw_share_people p where p.share_id = s.id and p.user_id = auth.uid())
         or (s.firm_id is not null and exists (select 1 from firm_members f where f.firm_id = s.firm_id and f.user_id = auth.uid()))
         or (s.chat_id is not null and connect_is_chat_member(s.chat_id))))
$$;

create or replace function public.draw_share_open(p_token uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'share_id', s.id,
    'kind', case when s.drawing_id is not null then 'drawing' else 'markup' end,
    'is_owner', s.owner_id = auth.uid(),
    'owner_name', (select coalesce(p.display_name, p.username, 'DrawUp member') from profiles p where p.id = s.owner_id),
    'note', s.note,
    'shared_at', s.created_at,
    'drawing', (select jsonb_build_object('id', d.id, 'name', d.name, 'sheet_number', d.sheet_number,
        'scale_denominator', d.scale_denominator, 'model', d.model, 'revision', d.revision, 'updated_at', d.updated_at)
        from drawings d where d.id = s.drawing_id),
    'markup', (select jsonb_build_object('id', k.id, 'name', k.name, 'source_path', k.source_path,
        'source_kind', k.source_kind, 'source_name', k.source_name, 'page', k.page, 'page_count', k.page_count,
        'width', k.width, 'height', k.height, 'marks', k.marks, 'updated_at', k.updated_at)
        from draw_markups k where k.id = s.markup_id))
  from draw_shares s
  where s.token = p_token and draw_share_allowed(s.id)
$$;

-- Lets the people a markup was shared with read its source file from the private bucket.
create or replace function public.draw_share_file_ok(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from draw_markups k join draw_shares s on s.markup_id = k.id
     where k.source_path = p_name and draw_share_allowed(s.id))
$$;

revoke execute on function public.draw_share_allowed(uuid) from anon;
revoke execute on function public.draw_share_open(uuid) from anon;
revoke execute on function public.draw_share_file_ok(text) from anon;
grant execute on function public.draw_share_allowed(uuid) to authenticated;
grant execute on function public.draw_share_open(uuid) to authenticated;
grant execute on function public.draw_share_file_ok(text) to authenticated;

drop policy if exists "drawup private shared markup read" on storage.objects;
create policy "drawup private shared markup read" on storage.objects
  for select to authenticated
  using (bucket_id = 'drawup-private' and public.draw_share_file_ok(name));

select 'DONE 0040_3_draw_share_open' as status;
-- END

