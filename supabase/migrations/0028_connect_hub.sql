-- DrawUp V20 Connect hub (0028). Additive and idempotent: new tables, policies and functions only.
-- Same content as /mnt/project-files/drawup/v20/connect-sql/drawup-v20-connect-01..06.sql, in order.

-- ===== drawup-v20-connect-01.sql
-- DrawUp V20 Connect hub, file 1 of 6: chat tables (group chats and firm chats).
-- Additive and idempotent. Nothing is dropped or wiped. Safe to run again.
-- One to one messages keep using the existing direct_messages table (see file 4).

create table if not exists public.connect_chats (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'group',
  name text,
  firm_id uuid references public.firms(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint connect_chats_kind_check check (kind in ('group', 'firm')),
  constraint connect_chats_firm_check check ((kind = 'firm') = (firm_id is not null)),
  constraint connect_chats_name_len check (name is null or char_length(name) <= 120)
);

create unique index if not exists connect_chats_one_per_firm
  on public.connect_chats (firm_id) where kind = 'firm';

create table if not exists public.connect_chat_members (
  chat_id uuid not null references public.connect_chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (chat_id, user_id),
  constraint connect_chat_members_role_check check (role in ('owner', 'member'))
);

create index if not exists connect_chat_members_user_idx
  on public.connect_chat_members (user_id);

create table if not exists public.connect_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.connect_chats(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  image_url text,
  created_at timestamptz not null default now(),
  constraint connect_chat_messages_body_len check (body is null or char_length(body) <= 5000),
  constraint connect_chat_messages_has_content check (
    (body is not null and char_length(btrim(body)) > 0) or image_url is not null
  )
);

create index if not exists connect_chat_messages_chat_idx
  on public.connect_chat_messages (chat_id, created_at desc);

alter table public.connect_chats enable row level security;
alter table public.connect_chat_members enable row level security;
alter table public.connect_chat_messages enable row level security;

select 'V20 CONNECT FILE 1 DONE' as status;
-- END-OF-V20-CONNECT-FILE-1

-- ===== drawup-v20-connect-02.sql
-- DrawUp V20 Connect hub, file 2 of 6: membership helpers.
-- A firm chat has no member rows. Its members are the firm_members of that firm.

create or replace function public.connect_is_chat_member(p_chat uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from connect_chats c
     where c.id = p_chat
       and auth.uid() is not null
       and (
         (c.kind = 'group' and exists (
            select 1 from connect_chat_members m
             where m.chat_id = c.id and m.user_id = auth.uid()))
         or
         (c.kind = 'firm' and exists (
            select 1 from firm_members fm
             where fm.firm_id = c.firm_id and fm.user_id = auth.uid()))
       )
  );
$$;

-- Creates a group chat owned by the caller, with the people picked.
create or replace function public.connect_create_group(p_name text, p_members uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to start a group chat';
  end if;
  insert into connect_chats (kind, name, created_by)
  values ('group', case when p_name is null or char_length(btrim(p_name)) = 0 then null else left(btrim(p_name), 120) end, auth.uid())
  returning id into v_id;
  insert into connect_chat_members (chat_id, user_id, role, added_by)
  values (v_id, auth.uid(), 'owner', auth.uid());
  insert into connect_chat_members (chat_id, user_id, role, added_by)
  select v_id, p.id, 'member', auth.uid()
    from profiles p
   where p.id = any (coalesce(p_members, array[]::uuid[])) and p.id <> auth.uid()
  on conflict do nothing;
  return v_id;
end;
$$;

-- Returns the chat for a firm, creating it the first time. Firm members only.
create or replace function public.connect_firm_chat(p_firm uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from firm_members where firm_id = p_firm and user_id = auth.uid()) then
    raise exception 'Only members of this firm can open its firm chat';
  end if;
  select id into v_id from connect_chats where kind = 'firm' and firm_id = p_firm;
  if v_id is null then
    insert into connect_chats (kind, name, firm_id, created_by)
    select 'firm', f.name, f.id, auth.uid() from firms f where f.id = p_firm
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from connect_chats where kind = 'firm' and firm_id = p_firm;
    end if;
  end if;
  return v_id;
end;
$$;

-- Keeps the chat list ordered by latest activity.
create or replace function public.connect_touch_chat()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update connect_chats set last_message_at = new.created_at where id = new.chat_id;
  return new;
end;
$$;

drop trigger if exists connect_touch_chat on public.connect_chat_messages;
create trigger connect_touch_chat after insert on public.connect_chat_messages
  for each row execute function public.connect_touch_chat();

select 'V20 CONNECT FILE 2 DONE' as status;
-- END-OF-V20-CONNECT-FILE-2

-- ===== drawup-v20-connect-03.sql
-- DrawUp V20 Connect hub, file 3 of 6: chat list, roster and read receipts.

-- The chats the caller belongs to: their group chats plus one chat per firm they are a member of.
create or replace function public.connect_my_chats()
returns table (
  id uuid, kind text, name text, firm_id uuid, firm_slug text,
  last_message_at timestamptz, last_body text, member_count int
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into connect_chats (kind, name, firm_id, created_by)
  select 'firm', f.name, f.id, auth.uid()
    from firm_members fm join firms f on f.id = fm.firm_id
   where fm.user_id = auth.uid()
     and not exists (select 1 from connect_chats c where c.kind = 'firm' and c.firm_id = f.id)
  on conflict do nothing;
  return query
  select c.id, c.kind, coalesce(f.name, c.name), c.firm_id, f.slug, c.last_message_at,
         (select left(coalesce(m.body, 'Photo'), 140) from connect_chat_messages m
           where m.chat_id = c.id order by m.created_at desc limit 1),
         case when c.kind = 'firm'
              then (select count(*)::int from firm_members x where x.firm_id = c.firm_id)
              else (select count(*)::int from connect_chat_members x where x.chat_id = c.id) end
    from connect_chats c
    left join firms f on f.id = c.firm_id
   where (c.kind = 'group' and exists (select 1 from connect_chat_members m
                                        where m.chat_id = c.id and m.user_id = auth.uid()))
      or (c.kind = 'firm' and exists (select 1 from firm_members fm
                                       where fm.firm_id = c.firm_id and fm.user_id = auth.uid()))
   order by c.last_message_at desc;
end;
$$;

-- Who is in a chat. Only members of that chat get rows back.
create or replace function public.connect_chat_roster(p_chat uuid)
returns table (user_id uuid, display_name text, username text, avatar_url text, title text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.username, p.avatar_url, p.title, x.role
    from (
      select m.user_id, m.role from connect_chat_members m
        join connect_chats c on c.id = m.chat_id and c.kind = 'group'
       where m.chat_id = p_chat
      union all
      select fm.user_id, fm.role from firm_members fm
        join connect_chats c on c.firm_id = fm.firm_id and c.kind = 'firm'
       where c.id = p_chat
    ) x
    join profiles p on p.id = x.user_id
   where public.connect_is_chat_member(p_chat)
   order by p.display_name;
$$;

-- Marks the direct messages the caller received from one person as read.
create or replace function public.connect_mark_dm_read(p_other uuid)
returns int
language sql security definer set search_path = public as $$
  with u as (
    update direct_messages set read_at = now()
     where recipient_id = auth.uid() and sender_id = p_other and read_at is null
    returning 1
  )
  select count(*)::int from u;
$$;

revoke all on function public.connect_create_group(text, uuid[]) from anon;
revoke all on function public.connect_firm_chat(uuid) from anon;
revoke all on function public.connect_my_chats() from anon;
revoke all on function public.connect_mark_dm_read(uuid) from anon;
grant execute on function public.connect_is_chat_member(uuid) to authenticated;
grant execute on function public.connect_create_group(text, uuid[]) to authenticated;
grant execute on function public.connect_firm_chat(uuid) to authenticated;
grant execute on function public.connect_my_chats() to authenticated;
grant execute on function public.connect_chat_roster(uuid) to authenticated;
grant execute on function public.connect_mark_dm_read(uuid) to authenticated;

select 'V20 CONNECT FILE 3 DONE' as status;
-- END-OF-V20-CONNECT-FILE-3

-- ===== drawup-v20-connect-04.sql
-- DrawUp V20 Connect hub, file 4 of 6: chat security rules and direct message upgrades.

-- Chats: members only.
drop policy if exists "connect chats readable by members" on public.connect_chats;
create policy "connect chats readable by members" on public.connect_chats
  for select using (public.connect_is_chat_member(id));

drop policy if exists "connect group owners rename" on public.connect_chats;
create policy "connect group owners rename" on public.connect_chats
  for update using (kind = 'group' and created_by = auth.uid())
  with check (kind = 'group' and created_by = auth.uid());

-- Chat members: members see the list, members add people to group chats, anyone can leave.
drop policy if exists "connect members readable by members" on public.connect_chat_members;
create policy "connect members readable by members" on public.connect_chat_members
  for select using (public.connect_is_chat_member(chat_id));

drop policy if exists "connect members add people" on public.connect_chat_members;
create policy "connect members add people" on public.connect_chat_members
  for insert with check (
    public.connect_is_chat_member(chat_id)
    and added_by = auth.uid()
    and role = 'member'
    and exists (select 1 from public.connect_chats c where c.id = chat_id and c.kind = 'group')
  );

drop policy if exists "connect members leave" on public.connect_chat_members;
create policy "connect members leave" on public.connect_chat_members
  for delete using (user_id = auth.uid());

-- Chat messages: members read and post, authors delete their own.
drop policy if exists "connect messages readable by members" on public.connect_chat_messages;
create policy "connect messages readable by members" on public.connect_chat_messages
  for select using (public.connect_is_chat_member(chat_id));

drop policy if exists "connect messages posted by members" on public.connect_chat_messages;
create policy "connect messages posted by members" on public.connect_chat_messages
  for insert with check (author_id = auth.uid() and public.connect_is_chat_member(chat_id));

drop policy if exists "connect messages deleted by author" on public.connect_chat_messages;
create policy "connect messages deleted by author" on public.connect_chat_messages
  for delete using (author_id = auth.uid());

-- Direct messages (existing table): add an optional photo and let senders delete their own.
alter table public.direct_messages add column if not exists image_url text;

create index if not exists direct_messages_sender_idx
  on public.direct_messages (sender_id, created_at desc);
create index if not exists direct_messages_recipient_idx
  on public.direct_messages (recipient_id, created_at desc);

drop policy if exists "connect senders delete own messages" on public.direct_messages;
create policy "connect senders delete own messages" on public.direct_messages
  for delete using (auth.uid() = sender_id);

select 'V20 CONNECT FILE 4 DONE' as status;
-- END-OF-V20-CONNECT-FILE-4

-- ===== drawup-v20-connect-05.sql
-- DrawUp V20 Connect hub, file 5 of 6: timeline posts, discussion boards, replies and likes.
-- kind timeline = projects, photos, event flyers. kind board = discussion board question or topic.

create table if not exists public.connect_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'timeline',
  topic text,
  title text,
  body text,
  image_urls text[] not null default '{}',
  link_url text,
  event_date date,
  event_place text,
  created_at timestamptz not null default now(),
  constraint connect_posts_kind_check check (kind in ('timeline', 'board')),
  constraint connect_posts_title_len check (title is null or char_length(title) <= 200),
  constraint connect_posts_body_len check (body is null or char_length(body) <= 8000),
  constraint connect_posts_topic_len check (topic is null or char_length(topic) <= 60),
  constraint connect_posts_images_max check (coalesce(array_length(image_urls, 1), 0) <= 8),
  constraint connect_posts_board_title check (kind <> 'board' or (title is not null and char_length(btrim(title)) > 0)),
  constraint connect_posts_has_content check (
    (body is not null and char_length(btrim(body)) > 0)
    or (title is not null and char_length(btrim(title)) > 0)
    or coalesce(array_length(image_urls, 1), 0) > 0
  )
);

create index if not exists connect_posts_kind_idx on public.connect_posts (kind, created_at desc);
create index if not exists connect_posts_author_idx on public.connect_posts (author_id);

create table if not exists public.connect_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.connect_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint connect_comments_body_len check (char_length(btrim(body)) between 1 and 5000)
);

create index if not exists connect_comments_post_idx on public.connect_comments (post_id, created_at);

create table if not exists public.connect_likes (
  post_id uuid not null references public.connect_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.connect_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  reason text,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  constraint connect_reports_type_check check (target_type in ('post', 'comment', 'chat_message', 'direct_message', 'profile')),
  constraint connect_reports_status_check check (status in ('open', 'reviewed', 'dismissed')),
  constraint connect_reports_reason_len check (reason is null or char_length(reason) <= 120),
  constraint connect_reports_details_len check (details is null or char_length(details) <= 2000)
);

create index if not exists connect_reports_status_idx on public.connect_reports (status, created_at desc);

alter table public.connect_posts enable row level security;
alter table public.connect_comments enable row level security;
alter table public.connect_likes enable row level security;
alter table public.connect_reports enable row level security;

select 'V20 CONNECT FILE 5 DONE' as status;
-- END-OF-V20-CONNECT-FILE-5

-- ===== drawup-v20-connect-06.sql
-- DrawUp V20 Connect hub, file 6 of 6: security rules for timeline, boards, likes and reports.
-- Anyone (even signed out) can read the timeline and boards. Signed in members post and reply.
-- Only the author can edit or delete their own post or reply. Reports are read by DrawUp HQ only.

drop policy if exists "connect posts public read" on public.connect_posts;
create policy "connect posts public read" on public.connect_posts
  for select using (true);

drop policy if exists "connect posts by author" on public.connect_posts;
create policy "connect posts by author" on public.connect_posts
  for insert with check (auth.uid() is not null and author_id = auth.uid());

drop policy if exists "connect posts author edits" on public.connect_posts;
create policy "connect posts author edits" on public.connect_posts
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "connect posts author deletes" on public.connect_posts;
create policy "connect posts author deletes" on public.connect_posts
  for delete using (author_id = auth.uid());

drop policy if exists "connect comments public read" on public.connect_comments;
create policy "connect comments public read" on public.connect_comments
  for select using (true);

drop policy if exists "connect comments by author" on public.connect_comments;
create policy "connect comments by author" on public.connect_comments
  for insert with check (auth.uid() is not null and author_id = auth.uid());

drop policy if exists "connect comments author deletes" on public.connect_comments;
create policy "connect comments author deletes" on public.connect_comments
  for delete using (author_id = auth.uid());

drop policy if exists "connect likes public read" on public.connect_likes;
create policy "connect likes public read" on public.connect_likes
  for select using (true);

drop policy if exists "connect likes by self" on public.connect_likes;
create policy "connect likes by self" on public.connect_likes
  for insert with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "connect likes removed by self" on public.connect_likes;
create policy "connect likes removed by self" on public.connect_likes
  for delete using (user_id = auth.uid());

drop policy if exists "connect reports filed by members" on public.connect_reports;
create policy "connect reports filed by members" on public.connect_reports
  for insert with check (auth.uid() is not null and reporter_id = auth.uid() and status = 'open');

drop policy if exists "connect reports read by hq" on public.connect_reports;
create policy "connect reports read by hq" on public.connect_reports
  for select using (public.is_drawup_admin());

drop policy if exists "connect reports updated by hq" on public.connect_reports;
create policy "connect reports updated by hq" on public.connect_reports
  for update using (public.is_drawup_admin()) with check (public.is_drawup_admin());

grant select on public.connect_posts, public.connect_comments, public.connect_likes to anon, authenticated;
grant insert, update, delete on public.connect_posts, public.connect_comments, public.connect_likes to authenticated;
grant select, insert, update, delete on public.connect_chats, public.connect_chat_members, public.connect_chat_messages to authenticated;
grant select, insert, update on public.connect_reports to authenticated;

select 'V20 CONNECT FILE 6 DONE' as status;
-- END-OF-V20-CONNECT-FILE-6
