-- DrawUp V20 personal Arch Coach, file 5 of 5: earning XP (server side only).
-- NOTE: the two Connect trigger functions are plpgsql. Run the whole file at once.
-- award_arch_coach_xp can only be called with the service role (the DrawUp server) or by these triggers.
-- Each event counts once (ledger unique key) and each kind has a daily cap.
--   ask 5 (20 a day), upload 8 (10), check 15 (10), peer_like 2 (25), peer_comment 4 (25), board_help 6 (10)

create or replace function public.award_arch_coach_xp(p_user_id uuid, p_kind text, p_ref text)
returns integer language sql volatile security definer set search_path = public as $$
  with cfg as (
    select case p_kind when 'ask' then 5 when 'upload' then 8 when 'check' then 15
             when 'peer_like' then 2 when 'peer_comment' then 4 when 'board_help' then 6 else 0 end as pts,
           case p_kind when 'ask' then 20 when 'upload' then 10 when 'check' then 10
             when 'peer_like' then 25 when 'peer_comment' then 25 when 'board_help' then 10 else 0 end as cap
  ), ok as (
    select pts from cfg
     where pts > 0 and p_user_id is not null and length(trim(coalesce(p_ref, 'x'))) > 0
       and exists (select 1 from profiles where id = p_user_id)
       and (select count(*) from arch_coach_xp_events e
             where e.user_id = p_user_id and e.kind = p_kind and e.created_at > now() - interval '1 day') < cap
  ), ins as (
    insert into arch_coach_xp_events (user_id, kind, ref_id, points)
    select p_user_id, p_kind, left(p_ref, 200), pts from ok
    on conflict (user_id, kind, ref_id) do nothing
    returning points
  ), up as (
    insert into arch_coach_profiles (user_id, xp)
    select p_user_id, points from ins
    on conflict (user_id) do update set xp = arch_coach_profiles.xp + excluded.xp
    returning xp
  )
  select coalesce((select points from ins), 0)
$$;

revoke all on function public.award_arch_coach_xp(uuid, text, text) from public, anon, authenticated;
grant execute on function public.award_arch_coach_xp(uuid, text, text) to service_role;

-- Peer collecting: a like from another member on your Connect post.
create or replace function public.arch_coach_xp_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  select author_id into owner from connect_posts where id = new.post_id;
  if owner is not null and owner <> new.user_id then
    perform award_arch_coach_xp(owner, 'peer_like', new.post_id::text || ':' || new.user_id::text);
  end if;
  return new;
exception when others then
  return new;
end
$$;

-- A reply from another member on your post, and helping someone on Boards.
create or replace function public.arch_coach_xp_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
  post_kind text;
begin
  select author_id, kind into owner, post_kind from connect_posts where id = new.post_id;
  if owner is not null and owner <> new.author_id then
    perform award_arch_coach_xp(owner, 'peer_comment', new.post_id::text || ':' || new.author_id::text);
    if post_kind = 'board' then
      perform award_arch_coach_xp(new.author_id, 'board_help', new.post_id::text);
    end if;
  end if;
  return new;
exception when others then
  return new;
end
$$;

revoke all on function public.arch_coach_xp_on_like() from public, anon, authenticated;
revoke all on function public.arch_coach_xp_on_comment() from public, anon, authenticated;

drop trigger if exists arch_coach_xp_like on public.connect_likes;
create trigger arch_coach_xp_like after insert on public.connect_likes
  for each row execute function public.arch_coach_xp_on_like();

drop trigger if exists arch_coach_xp_comment on public.connect_comments;
create trigger arch_coach_xp_comment after insert on public.connect_comments
  for each row execute function public.arch_coach_xp_on_comment();

select 'DONE drawup-v20-coach-05' as status;
-- END
