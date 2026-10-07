-- DrawUp V20 Connect hub, file 5 of 6: timeline posts, discussion boards, replies and likes.
-- kind timeline = projects, photos, event flyers. kind board = discussion board question or topic.

create table if not exists public.connect_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'timeline',
  topic text,
  title text,
  body text,
  image_urls text[] not null default '{}',
  link_url text,
  event_date date,
  event_place text,
  created_at timestamptz not null default now(),
  constraint connect_posts_kind_check check (kind in ('timeline', 'board')),
  constraint connect_posts_title_len check (title is null or char_length(title) <= 200),
  constraint connect_posts_body_len check (body is null or char_length(body) <= 8000),
  constraint connect_posts_topic_len check (topic is null or char_length(topic) <= 60),
  constraint connect_posts_images_max check (coalesce(array_length(image_urls, 1), 0) <= 8),
  constraint connect_posts_board_title check (kind <> 'board' or (title is not null and char_length(btrim(title)) > 0)),
  constraint connect_posts_has_content check (
    (body is not null and char_length(btrim(body)) > 0)
    or (title is not null and char_length(btrim(title)) > 0)
    or coalesce(array_length(image_urls, 1), 0) > 0
  )
);

create index if not exists connect_posts_kind_idx on public.connect_posts (kind, created_at desc);
create index if not exists connect_posts_author_idx on public.connect_posts (author_id);

create table if not exists public.connect_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.connect_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint connect_comments_body_len check (char_length(btrim(body)) between 1 and 5000)
);

create index if not exists connect_comments_post_idx on public.connect_comments (post_id, created_at);

create table if not exists public.connect_likes (
  post_id uuid not null references public.connect_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.connect_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  reason text,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  constraint connect_reports_type_check check (target_type in ('post', 'comment', 'chat_message', 'direct_message', 'profile')),
  constraint connect_reports_status_check check (status in ('open', 'reviewed', 'dismissed')),
  constraint connect_reports_reason_len check (reason is null or char_length(reason) <= 120),
  constraint connect_reports_details_len check (details is null or char_length(details) <= 2000)
);

create index if not exists connect_reports_status_idx on public.connect_reports (status, created_at desc);

alter table public.connect_posts enable row level security;
alter table public.connect_comments enable row level security;
alter table public.connect_likes enable row level security;
alter table public.connect_reports enable row level security;

select 'V20 CONNECT FILE 5 DONE' as status;
-- END-OF-V20-CONNECT-FILE-5
