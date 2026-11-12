-- v32 member avatars: each member's own Arch Coach, Teammate and 6th Man made in the 3D avatar maker
-- (AUREVIA character kit v4). `look` is the avatar maker's choices; `face` is the face shot shown as the picture
-- (a small webp or jpeg data URL). Private to the member.
create table if not exists public.member_avatars (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('coach', 'teammate', 'sixth_man')),
  look jsonb not null default '{}'::jsonb check (jsonb_typeof(look) = 'object' and char_length(look::text) <= 4000),
  face text check (face is null or (face ~ '^data:image/(webp|jpeg|png);base64,' and char_length(face) <= 120000)),
  updated_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.member_avatars enable row level security;
drop policy if exists member_avatars_select on public.member_avatars;
drop policy if exists member_avatars_insert on public.member_avatars;
drop policy if exists member_avatars_update on public.member_avatars;
drop policy if exists member_avatars_delete on public.member_avatars;
create policy member_avatars_select on public.member_avatars for select to authenticated using (user_id = auth.uid());
create policy member_avatars_insert on public.member_avatars for insert to authenticated with check (user_id = auth.uid());
create policy member_avatars_update on public.member_avatars for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy member_avatars_delete on public.member_avatars for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.member_avatars to authenticated;
