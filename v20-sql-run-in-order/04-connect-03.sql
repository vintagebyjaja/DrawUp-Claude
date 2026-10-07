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
