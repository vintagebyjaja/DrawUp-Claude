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
