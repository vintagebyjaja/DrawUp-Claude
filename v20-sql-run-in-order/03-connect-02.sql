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
