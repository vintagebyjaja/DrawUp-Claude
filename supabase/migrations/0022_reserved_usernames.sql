-- DrawUp — reserved usernames and names
--
-- Stops members from taking a handle or display name that impersonates DrawUp staff:
-- @founder, @admin, @archcoach, @drawup, @help, @support, @staff and look-alikes such as
-- "Arch_Coach", "dr4wup", "the.founder", "admin2", "drawup-support" or "DrawUp Help".
--
-- * Checked case-insensitively, ignoring dots/dashes/underscores/spaces, with common
--   number/symbol swaps (0→o 1→i 3→e 4→a 5→s 7→t @→a $→s).
-- * Only applies when a username or display name is SET OR CHANGED, so nobody's
--   existing profile breaks. Run the query at the bottom to see any existing matches.
-- * DrawUp founders/admins and the server are exempt, so you can still claim @drawup,
--   @archcoach etc. for official accounts.
-- * Changing account_type to founder/admin was already blocked by 0020.
--
-- Additive and safe to run more than once. Requires 0020 (drawup_is_trusted_writer).

create or replace function public.drawup_normalize_handle(p text)
returns text language sql immutable as $$
  select translate(regexp_replace(regexp_replace(lower(coalesce(p, '')), '^[\s@]+', ''), '[\s._\-''"`]+', '', 'g'), '013457@$!|', 'oieastasil');
$$;

create or replace function public.drawup_is_reserved_name(p text, p_is_display boolean default false)
returns boolean language plpgsql immutable as $$
declare
  n text := public.drawup_normalize_handle(p);
  -- n with trailing digits removed: admin2, help99, founder1 → admin, help, founder
  b text := regexp_replace(public.drawup_normalize_handle(p), '[0-9]+$', '');
  exact text[] := array[
    'founder','cofounder','founders','admin','admins','administrator','sysadmin','superadmin','root','system',
    'help','helpdesk','support','supportteam','staff','team','official','moderator','mod','mods','owner','ceo','cto',
    'hq','headquarters','security','billing','payments','legal','privacy','abuse','info','contact','press','media',
    'verified','verification','api','www','mail','email','noreply','null','undefined','anonymous','everyone','all',
    'archcoach','coach','drawup','drawupcheck','drawupswap','check','swap','portal','campus','campusmanager'];
begin
  if n = '' then return false; end if;
  if n = any(exact) or b = any(exact) then return true; end if;
  -- Brand names anywhere: drawupfounder, realdrawup, archcoachbot, thearchcoach
  if n like '%drawup%' or n like '%archcoach%' then return true; end if;
  if p_is_display then return false; end if;
  -- Handles that start or end with a staff word: founderjaja, the_founder, adminteam,
  -- supportdesk, helpcenter, officialstaff, modsquad
  if b ~ '^(the|real|im|iam|ask|its|official)?(founder|cofounder|admin|administrator|support|helpdesk|moderator|staff|official)'
     or b ~ '(founder|admin|administrator|support|helpdesk|moderator|staff|official)$'
     or b ~ '^(help|mod|hq)(team|desk|center|centre|staff|official|line)$' then
    return true;
  end if;
  return false;
end; $$;

create or replace function public.drawup_block_reserved_names()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.drawup_is_trusted_writer() then return new; end if;
  if new.username is not null and (tg_op = 'INSERT' or new.username is distinct from old.username)
     and public.drawup_is_reserved_name(new.username, false) then
    raise exception 'The username "%" is reserved by DrawUp. Please choose another.', new.username
      using errcode = 'check_violation';
  end if;
  if new.display_name is not null and (tg_op = 'INSERT' or new.display_name is distinct from old.display_name)
     and public.drawup_is_reserved_name(new.display_name, true) then
    raise exception 'The name "%" is reserved by DrawUp. Please use your own name.', new.display_name
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;

drop trigger if exists drawup_block_reserved_names on public.profiles;
create trigger drawup_block_reserved_names
  before insert or update of username, display_name on public.profiles
  for each row execute function public.drawup_block_reserved_names();

grant execute on function public.drawup_is_reserved_name(text, boolean) to anon, authenticated;
grant execute on function public.drawup_normalize_handle(text) to anon, authenticated;

-- Optional check: existing profiles that already use a reserved handle or name
-- (nothing is changed; review and fix by hand if you want).
-- select id, username, display_name, account_type from public.profiles
--  where account_type not in ('founder','drawup_admin')
--    and (public.drawup_is_reserved_name(username, false) or public.drawup_is_reserved_name(display_name, true));
