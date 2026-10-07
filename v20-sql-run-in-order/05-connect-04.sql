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
