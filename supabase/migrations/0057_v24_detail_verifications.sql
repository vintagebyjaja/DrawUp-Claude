-- DrawUp v24-06: "Verified by an architect". An approved architect (v24-04) verifies a detail as drawn, or only
-- for stated conditions. Their name and license state are copied in when they verify. One per architect per
-- detail; the architect or HQ can withdraw it. Safe to run twice.
create table if not exists public.detail_verifications (
  id uuid primary key default gen_random_uuid(),
  detail_key text not null,
  architect_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  architect_name text,
  license_state text,
  scope text not null default 'as_drawn',
  conditions text,
  note text,
  created_at timestamptz not null default now(),
  unique (detail_key, architect_id)
);
alter table public.detail_verifications drop constraint if exists detail_verifications_key_check;
alter table public.detail_verifications add constraint detail_verifications_key_check check (detail_key ~ '^(typical|find|upload):[A-Za-z0-9_.-]{1,80}$');
alter table public.detail_verifications drop constraint if exists detail_verifications_scope_check;
alter table public.detail_verifications add constraint detail_verifications_scope_check check (scope in ('as_drawn', 'with_conditions'));
create index if not exists detail_verifications_key_idx on public.detail_verifications (detail_key);

create or replace function public.drawup_verification_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare c record;
begin
  select full_name, license_state into c from architect_credentials where user_id = new.architect_id and status = 'approved';
  if not found then raise exception 'Only an approved architect can verify a detail.'; end if;
  new.architect_name := c.full_name;
  new.license_state := c.license_state;
  if new.scope = 'with_conditions' and coalesce(trim(new.conditions), '') = '' then raise exception 'Say which conditions the detail works for.'; end if;
  return new;
end
$$;
drop trigger if exists drawup_verification_fill on public.detail_verifications;
create trigger drawup_verification_fill before insert or update on public.detail_verifications
  for each row execute function public.drawup_verification_fill();

alter table public.detail_verifications enable row level security;
drop policy if exists "detail verifications read" on public.detail_verifications;
create policy "detail verifications read" on public.detail_verifications for select using (true);
drop policy if exists "detail verifications architect insert" on public.detail_verifications;
create policy "detail verifications architect insert" on public.detail_verifications for insert
  with check (architect_id = auth.uid() and public.is_verified_architect(auth.uid()));
drop policy if exists "detail verifications architect update" on public.detail_verifications;
create policy "detail verifications architect update" on public.detail_verifications for update
  using (architect_id = auth.uid()) with check (architect_id = auth.uid() and public.is_verified_architect(auth.uid()));
drop policy if exists "detail verifications withdraw" on public.detail_verifications;
create policy "detail verifications withdraw" on public.detail_verifications for delete using (architect_id = auth.uid() or public.is_drawup_admin());
grant select on public.detail_verifications to anon, authenticated;
grant insert, update, delete on public.detail_verifications to authenticated;
select 'DONE v24-06 detail verifications' as status;
