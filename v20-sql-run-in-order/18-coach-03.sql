-- DrawUp V20 personal Arch Coach, file 3 of 5: the guard trigger.
-- NOTE: this file uses one plpgsql function (a trigger has to be plpgsql). Run the whole file at once.
-- Every save is checked in the database, so the page cannot be bypassed:
--   all 14 skills present, whole numbers 25..99, total within the XP point budget,
--   and an adopted legend must already be unlocked by the member XP.

create or replace function public.arch_coach_profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k text;
  v numeric;
  total integer := 0;
  need integer;
begin
  if new.skills is null or jsonb_typeof(new.skills) <> 'object' then
    raise exception 'Arch Coach skills must be a set of ratings';
  end if;
  if (select count(*) from jsonb_object_keys(new.skills)) <> cardinality(arch_coach_skill_keys()) then
    raise exception 'Arch Coach needs exactly the 14 skills';
  end if;
  foreach k in array arch_coach_skill_keys() loop
    if jsonb_typeof(new.skills -> k) is distinct from 'number' then
      raise exception 'Arch Coach skill % is missing', k;
    end if;
    v := (new.skills ->> k)::numeric;
    if v < 25 or v > 99 or mod(v, 1) <> 0 then
      raise exception 'Arch Coach skill % must be a whole number from 25 to 99', k;
    end if;
    total := total + v::integer;
  end loop;
  if total > arch_coach_budget(new.xp) then
    raise exception 'Arch Coach skills use % points but your budget is % (earn XP to grow it)', total, arch_coach_budget(new.xp);
  end if;
  if new.legend is not null then
    select xp_required into need from arch_coach_legends where key = new.legend;
    if need is null then
      raise exception 'Unknown legend';
    end if;
    if new.xp < need then
      raise exception 'That legend unlocks at % XP', need;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.xp < old.xp then
    new.xp := old.xp;
  end if;
  if new.mode is not null and new.prompt_answered_at is null then
    new.prompt_answered_at := now();
  end if;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists arch_coach_profiles_guard on public.arch_coach_profiles;
create trigger arch_coach_profiles_guard
  before insert or update on public.arch_coach_profiles
  for each row execute function public.arch_coach_profiles_guard();

select 'DONE drawup-v20-coach-03' as status;
-- END
