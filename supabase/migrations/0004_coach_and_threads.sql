-- SEASON 1 — Migration 0004: Arch Coach, AEC Chat, Project Threads (Phase S1-4)
-- Private by default. A thread's contents are visible only to its participants.

create type thread_type as enum ('general', 'project', 'learning');

create table coach_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  firm_id uuid references firms(id), -- set when this is a firm/team thread
  type thread_type not null default 'general',
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table thread_participants (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references coach_threads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (thread_id, user_id)
);

create table coach_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references coach_threads(id) on delete cascade,
  role text not null, -- 'user' | 'assistant'
  content text not null,
  created_at timestamptz not null default now()
);

-- Project Threads: the project-organized workspace (Section 17). Distinct
-- from a general coach_thread — this is the container future Season 2/3
-- modules attach to via project_thread_id, per the spec's own instruction.
create table project_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  firm_id uuid references firms(id),
  project_name text not null,
  project_type text,
  location text,
  project_phase text,
  description text,
  client_nickname text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_thread_files (
  id uuid primary key default gen_random_uuid(),
  project_thread_id uuid not null references project_threads(id) on delete cascade,
  uploaded_by uuid not null references profiles(id),
  file_url text not null, -- Supabase Storage signed-URL path, never a public URL
  file_type text, -- 'pdf' | 'image'
  created_at timestamptz not null default now()
);

create table project_thread_links (
  id uuid primary key default gen_random_uuid(),
  project_thread_id uuid not null references project_threads(id) on delete cascade,
  linked_type text not null, -- 'coach_thread' | 'check_session' | 'swap_generation' | 'detail'
  linked_id uuid not null,
  created_at timestamptz not null default now()
);

create table saved_coach_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  coach_message_id uuid not null references coach_messages(id) on delete cascade,
  project_thread_id uuid references project_threads(id),
  saved_at timestamptz not null default now()
);

alter table coach_threads enable row level security;
alter table thread_participants enable row level security;
alter table coach_messages enable row level security;
alter table project_threads enable row level security;
alter table project_thread_files enable row level security;
alter table project_thread_links enable row level security;
alter table saved_coach_answers enable row level security;

-- Private by default: visible only to the owner, an added participant, or a
-- DrawUp admin. No public select policy exists on any of these tables.
create policy "owner or participant can read their coach thread" on coach_threads for select
  using (
    owner_id = auth.uid()
    or is_drawup_admin()
    or exists (select 1 from thread_participants tp where tp.thread_id = id and tp.user_id = auth.uid())
  );
create policy "owner can create coach threads" on coach_threads for insert
  with check (owner_id = auth.uid());
create policy "owner can update their coach thread" on coach_threads for update
  using (owner_id = auth.uid() or is_drawup_admin());

create policy "participants readable by thread members" on thread_participants for select
  using (
    user_id = auth.uid()
    or is_drawup_admin()
    or exists (select 1 from coach_threads ct where ct.id = thread_id and ct.owner_id = auth.uid())
  );

create policy "messages readable by thread participants" on coach_messages for select
  using (
    is_drawup_admin()
    or exists (
      select 1 from coach_threads ct
      where ct.id = thread_id and (
        ct.owner_id = auth.uid()
        or exists (select 1 from thread_participants tp where tp.thread_id = ct.id and tp.user_id = auth.uid())
      )
    )
  );
create policy "participants can post messages" on coach_messages for insert
  with check (
    exists (
      select 1 from coach_threads ct
      where ct.id = thread_id and (
        ct.owner_id = auth.uid()
        or exists (select 1 from thread_participants tp where tp.thread_id = ct.id and tp.user_id = auth.uid())
      )
    )
  );

create policy "owner or firm admin can read project threads" on project_threads for select
  using (owner_id = auth.uid() or is_drawup_admin() or (firm_id is not null and is_firm_admin(firm_id)));
create policy "owner can create project threads" on project_threads for insert
  with check (owner_id = auth.uid());
create policy "owner can update their project thread" on project_threads for update
  using (owner_id = auth.uid() or is_drawup_admin());

create policy "files readable by thread owner" on project_thread_files for select
  using (
    is_drawup_admin()
    or exists (select 1 from project_threads pt where pt.id = project_thread_id and pt.owner_id = auth.uid())
  );
create policy "owner can upload files to their thread" on project_thread_files for insert
  with check (
    exists (select 1 from project_threads pt where pt.id = project_thread_id and pt.owner_id = auth.uid())
  );

create policy "links readable by thread owner" on project_thread_links for select
  using (
    is_drawup_admin()
    or exists (select 1 from project_threads pt where pt.id = project_thread_id and pt.owner_id = auth.uid())
  );

create policy "users manage their own saved answers" on saved_coach_answers for all
  using (user_id = auth.uid());
