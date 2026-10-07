-- DrawUp V21: firm chats get two sides.
--   Internal: the firm chat plus group chats only for people on the same firm roster.
--   External: collaboration chats with other firms (their whole roster joins) and with individuals.
-- Group chats keep working as before (scope stays empty for them). Additive and safe to re-run.

alter table public.connect_chats add column if not exists scope text;
alter table public.connect_chats add column if not exists home_firm_id uuid references public.firms(id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'connect_chats_scope_check') then
    alter table public.connect_chats add constraint connect_chats_scope_check check (scope is null or scope in ('internal', 'external'));
  end if;
end $$;
create index if not exists connect_chats_home_firm_idx on public.connect_chats (home_firm_id) where home_firm_id is not null;

-- Firms taking part in an external collaboration chat (for the chat name and badges).
create table if not exists public.connect_chat_firms (
  chat_id uuid not null references public.connect_chats(id) on delete cascade,
  firm_id uuid not null references public.firms(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (chat_id, firm_id)
);
alter table public.connect_chat_firms enable row level security;
revoke all on public.connect_chat_firms from anon;
grant select on public.connect_chat_firms to authenticated;
drop policy if exists connect_chat_firms_members_read on public.connect_chat_firms;
create policy connect_chat_firms_members_read on public.connect_chat_firms
  for select to authenticated using (public.connect_is_chat_member(chat_id));

-- Starts an internal or external firm chat. The caller must be on the firm roster.
-- Internal: only people on that same roster are added. External: the people picked plus every
-- member of each partner firm picked. Everyone added sees it under Firm chats and can leave.
create or replace function public.connect_create_firm_chat(p_firm uuid, p_scope text, p_name text, p_members uuid[], p_firms uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not exists (select 1 from firm_members where firm_id = p_firm and user_id = auth.uid()) then
    raise exception 'Only members of this firm can start its chats';
  end if;
  if p_scope not in ('internal', 'external') then
    raise exception 'Choose internal or external';
  end if;
  insert into connect_chats (kind, name, created_by, scope, home_firm_id)
  values ('group', case when p_name is null or char_length(btrim(p_name)) = 0 then null else left(btrim(p_name), 120) end, auth.uid(), p_scope, p_firm)
  returning id into v_id;
  insert into connect_chat_members (chat_id, user_id, role, added_by) values (v_id, auth.uid(), 'owner', auth.uid());
  insert into connect_chat_members (chat_id, user_id, role, added_by)
  select v_id, p.id, 'member', auth.uid() from profiles p
   where p.id = any (coalesce(p_members, array[]::uuid[])) and p.id <> auth.uid()
     and (p_scope = 'external' or exists (select 1 from firm_members fm where fm.firm_id = p_firm and fm.user_id = p.id))
  on conflict do nothing;
  if p_scope = 'external' then
    insert into connect_chat_firms (chat_id, firm_id, added_by)
    select v_id, f.id, auth.uid() from firms f where f.id = any (coalesce(p_firms, array[]::uuid[])) and f.id <> p_firm
    on conflict do nothing;
    insert into connect_chat_members (chat_id, user_id, role, added_by)
    select v_id, fm.user_id, 'member', auth.uid() from firm_members fm
     where fm.firm_id = any (coalesce(p_firms, array[]::uuid[])) and fm.user_id <> auth.uid()
    on conflict do nothing;
  end if;
  return v_id;
end;
$$;

-- Same list as connect_my_chats, plus the side (internal or external), the home firm and partner firms.
create or replace function public.connect_my_chats_v21()
returns table (id uuid, kind text, name text, firm_id uuid, firm_slug text, last_message_at timestamptz,
               last_body text, member_count int, scope text, home_firm_id uuid, partner_firms text[])
language sql security definer set search_path = public as $$
  select m.id, m.kind, m.name, m.firm_id, m.firm_slug, m.last_message_at, m.last_body, m.member_count,
         c.scope, coalesce(c.home_firm_id, c.firm_id),
         (select array_agg(f.name order by f.name) from connect_chat_firms x join firms f on f.id = x.firm_id where x.chat_id = m.id)
    from public.connect_my_chats() m
    join connect_chats c on c.id = m.id
$$;

revoke all on function public.connect_create_firm_chat(uuid, text, text, uuid[], uuid[]) from public, anon;
revoke all on function public.connect_my_chats_v21() from public, anon;
grant execute on function public.connect_create_firm_chat(uuid, text, text, uuid[], uuid[]) to authenticated;
grant execute on function public.connect_my_chats_v21() to authenticated;

select 'DONE 0036 firm chat internal and external' as status;
-- END
