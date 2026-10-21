-- DrawUp v24-04: only DrawUp HQ can approve. A member editing their own license always goes back to pending.
-- is_verified_architect() is what the detail verification policy checks. Safe to run twice.
create or replace function public.drawup_architect_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_drawup_admin() then
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.note := case when tg_op = 'UPDATE' then old.note else null end;
  elsif tg_op = 'INSERT' or new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  new.updated_at := now();
  return new;
end
$$;
drop trigger if exists drawup_architect_guard on public.architect_credentials;
create trigger drawup_architect_guard before insert or update on public.architect_credentials
  for each row execute function public.drawup_architect_guard();

create or replace function public.is_verified_architect(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from architect_credentials where user_id = p_user and status = 'approved')
$$;
grant execute on function public.is_verified_architect(uuid) to anon, authenticated;
select 'DONE v24-04 architect approval' as status;
