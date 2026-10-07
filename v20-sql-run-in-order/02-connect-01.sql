-- DrawUp V20 Connect hub, file 1 of 6: chat tables (group chats and firm chats).
-- Additive and idempotent. Nothing is dropped or wiped. Safe to run again.
-- One to one messages keep using the existing direct_messages table (see file 4).

create table if not exists public.connect_chats (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'group',
  name text,
  firm_id uuid references public.firms(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint connect_chats_kind_check check (kind in ('group', 'firm')),
  constraint connect_chats_firm_check check ((kind = 'firm') = (firm_id is not null)),
  constraint connect_chats_name_len check (name is null or char_length(name) <= 120)
);

create unique index if not exists connect_chats_one_per_firm
  on public.connect_chats (firm_id) where kind = 'firm';

create table if not exists public.connect_chat_members (
  chat_id uuid not null references public.connect_chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (chat_id, user_id),
  constraint connect_chat_members_role_check check (role in ('owner', 'member'))
);

create index if not exists connect_chat_members_user_idx
  on public.connect_chat_members (user_id);

create table if not exists public.connect_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.connect_chats(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  image_url text,
  created_at timestamptz not null default now(),
  constraint connect_chat_messages_body_len check (body is null or char_length(body) <= 5000),
  constraint connect_chat_messages_has_content check (
    (body is not null and char_length(btrim(body)) > 0) or image_url is not null
  )
);

create index if not exists connect_chat_messages_chat_idx
  on public.connect_chat_messages (chat_id, created_at desc);

alter table public.connect_chats enable row level security;
alter table public.connect_chat_members enable row level security;
alter table public.connect_chat_messages enable row level security;

select 'V20 CONNECT FILE 1 DONE' as status;
-- END-OF-V20-CONNECT-FILE-1
