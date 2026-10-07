-- DrawUp V21 Playbook (migration 0041). Additive and idempotent.
-- Same content as drawup-v21-playbook-01..12.sql in the v21 sql-parts/playbook deliverables.

-- ===== drawup-v21-playbook-01-tables.sql
-- DrawUp V21 Playbook, file 1 of 12: lesson and member tables. Migration 0041.
-- Additive and idempotent. New tables only. Nothing existing is dropped or rewritten.

-- Lessons, Arch Coach Challenges and PM Simulations. Only DrawUp HQ can write them (file 2).
create table if not exists public.playbook_lessons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  path_key text not null,
  channel_key text not null,
  kind text not null default 'lesson',
  title text not null,
  summary text,
  level text not null default 'Fundamentals',
  positions text[] not null default '{}',
  minutes integer not null default 20,
  badge_name text,
  modes text[] not null default array['watch','learn','practice','field'],
  watch jsonb not null default '[]'::jsonb,
  learn text[] not null default '{}',
  practice text,
  practice_kind text not null default 'draw',
  field text[] not null default '{}',
  field_links jsonb not null default '[]'::jsonb,
  rubric text[] not null default '{}',
  scenario text,
  choices jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  official boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint playbook_lessons_path_check check (path_key in ('architecture','engineering','construction','pm','career')),
  constraint playbook_lessons_kind_check check (kind in ('lesson','challenge','simulation')),
  constraint playbook_lessons_status_check check (status in ('draft','published')),
  constraint playbook_lessons_practice_kind_check check (practice_kind in ('draw','upload','answer','decision')),
  constraint playbook_lessons_modes_check check (modes <@ array['watch','learn','practice','field']),
  constraint playbook_lessons_slug_check check (slug !~ '[^a-z0-9-]' and char_length(slug) between 3 and 80),
  constraint playbook_lessons_len check (char_length(title) between 3 and 140 and char_length(coalesce(summary,'x')) <= 600 and char_length(channel_key) <= 60),
  constraint playbook_lessons_json_check check (jsonb_typeof(watch) = 'array' and jsonb_typeof(field_links) = 'array' and jsonb_typeof(choices) = 'array' and jsonb_typeof(sources) = 'array')
);
create index if not exists playbook_lessons_path_idx on public.playbook_lessons (path_key, channel_key, sort_order);

-- The chosen position of each member (changes the recommended path).
create table if not exists public.playbook_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  position text not null default 'Architect',
  path_key text not null default 'architecture',
  updated_at timestamptz not null default now(),
  constraint playbook_members_len check (char_length(position) <= 60 and path_key in ('architecture','engineering','construction','pm','career'))
);

select 'DONE drawup-v21-playbook-01' as status;
-- END

-- ===== drawup-v21-playbook-02-progress.sql
-- DrawUp V21 Playbook, file 2 of 12: progress, Verify attempts and badges. Migration 0041.
-- Additive and idempotent. New tables only.

-- Progress through the self-paced modes. Verify and Complete are never written here by the browser.
create table if not exists public.playbook_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.playbook_lessons(id) on delete cascade,
  modes text[] not null default '{}',
  last_mode text,
  practice_note text,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id),
  constraint playbook_progress_modes_check check (modes <@ array['watch','learn','practice','field']),
  constraint playbook_progress_last_check check (last_mode is null or last_mode in ('watch','learn','practice','field','verify','complete')),
  constraint playbook_progress_note_len check (char_length(coalesce(practice_note,'x')) <= 4000)
);
create index if not exists playbook_progress_recent_idx on public.playbook_progress (user_id, updated_at desc);

-- Verify attempts: written only by the DrawUp server after Arch Coach grades the work.
create table if not exists public.playbook_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.playbook_lessons(id) on delete cascade,
  answer text,
  image_path text,
  score integer not null default 0,
  passed boolean not null default false,
  found text[] not null default '{}',
  missing text[] not null default '{}',
  feedback text,
  model text,
  created_at timestamptz not null default now(),
  constraint playbook_attempts_score check (score between 0 and 100)
);
-- One attempt per graded AI response, so a repeated poll never stores the same grade twice.
alter table public.playbook_attempts add column if not exists response_id text;
create unique index if not exists playbook_attempts_response_uidx on public.playbook_attempts (response_id);
create index if not exists playbook_attempts_user_idx on public.playbook_attempts (user_id, lesson_id, created_at desc);

-- Badges earned. Public, so Playbook accomplishments can show on member profiles.
create table if not exists public.playbook_awards (
  id bigint generated by default as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.playbook_lessons(id) on delete cascade,
  badge_name text not null,
  path_key text not null,
  xp integer not null default 0,
  score integer,
  created_at timestamptz not null default now(),
  constraint playbook_awards_once unique (user_id, lesson_id)
);
create index if not exists playbook_awards_user_idx on public.playbook_awards (user_id, created_at desc);

select 'DONE drawup-v21-playbook-02' as status;
-- END

-- ===== drawup-v21-playbook-03-security.sql
-- DrawUp V21 Playbook, file 3 of 12: row level security and grants. Migration 0041.
-- Only DrawUp HQ accounts (is_drawup_admin: founder or drawup_admin) can create, edit or publish
-- lessons. Students, Campus Managers and Organization Managers can only read published lessons.
-- Members write only their own position and progress. Verify grades and badges are server only.

alter table public.playbook_lessons enable row level security;
alter table public.playbook_members enable row level security;
alter table public.playbook_progress enable row level security;
alter table public.playbook_attempts enable row level security;
alter table public.playbook_awards enable row level security;

revoke all on public.playbook_lessons from anon, authenticated;
revoke all on public.playbook_members from anon, authenticated;
revoke all on public.playbook_progress from anon, authenticated;
revoke all on public.playbook_attempts from anon, authenticated;
revoke all on public.playbook_awards from anon, authenticated;

grant select on public.playbook_lessons to anon, authenticated;
grant insert, update, delete on public.playbook_lessons to authenticated;
grant select on public.playbook_members to authenticated;
grant insert (user_id, position, path_key) on public.playbook_members to authenticated;
grant update (position, path_key, updated_at) on public.playbook_members to authenticated;
grant select on public.playbook_progress to authenticated;
grant insert (user_id, lesson_id, modes, last_mode, practice_note) on public.playbook_progress to authenticated;
grant update (modes, last_mode, practice_note, updated_at) on public.playbook_progress to authenticated;
grant select on public.playbook_attempts to authenticated;
grant select on public.playbook_awards to anon, authenticated;

-- Profiles may be private, so badge visibility follows the owner profile setting.
create or replace function public.playbook_profile_visible(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user = auth.uid() or exists (select 1 from profiles where id = p_user and is_public)
$$;
grant execute on function public.playbook_profile_visible(uuid) to anon, authenticated;

drop policy if exists playbook_lessons_read on public.playbook_lessons;
create policy playbook_lessons_read on public.playbook_lessons
  for select to anon, authenticated using (status = 'published' or public.is_drawup_admin());

drop policy if exists playbook_lessons_hq_insert on public.playbook_lessons;
create policy playbook_lessons_hq_insert on public.playbook_lessons
  for insert to authenticated with check (public.is_drawup_admin() and created_by = auth.uid());

drop policy if exists playbook_lessons_hq_update on public.playbook_lessons;
create policy playbook_lessons_hq_update on public.playbook_lessons
  for update to authenticated using (public.is_drawup_admin()) with check (public.is_drawup_admin());

drop policy if exists playbook_lessons_hq_delete on public.playbook_lessons;
create policy playbook_lessons_hq_delete on public.playbook_lessons
  for delete to authenticated using (public.is_drawup_admin());

drop policy if exists playbook_members_own on public.playbook_members;
create policy playbook_members_own on public.playbook_members
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists playbook_progress_own_select on public.playbook_progress;
create policy playbook_progress_own_select on public.playbook_progress
  for select to authenticated using (user_id = auth.uid());

drop policy if exists playbook_progress_own_insert on public.playbook_progress;
create policy playbook_progress_own_insert on public.playbook_progress
  for insert to authenticated with check (user_id = auth.uid()
    and exists (select 1 from public.playbook_lessons l where l.id = lesson_id and l.status = 'published'));

drop policy if exists playbook_progress_own_update on public.playbook_progress;
create policy playbook_progress_own_update on public.playbook_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists playbook_attempts_own_select on public.playbook_attempts;
create policy playbook_attempts_own_select on public.playbook_attempts
  for select to authenticated using (user_id = auth.uid());

drop policy if exists playbook_awards_read on public.playbook_awards;
create policy playbook_awards_read on public.playbook_awards
  for select to anon, authenticated using (public.playbook_profile_visible(user_id));

select 'DONE drawup-v21-playbook-03' as status;
-- END

-- ===== drawup-v21-playbook-04-functions.sql
-- DrawUp V21 Playbook, file 4 of 12: XP and Complete. Migration 0041.
-- award_arch_coach_xp gains three kinds. Every existing kind keeps its points and daily cap.
--   lesson 40 (10 a day), challenge 30 (10 a day), simulation 30 (10 a day)
-- Single statement sql functions only (no plpgsql in this file).

create or replace function public.award_arch_coach_xp(p_user_id uuid, p_kind text, p_ref text)
returns integer language sql volatile security definer set search_path = public as $$
  with cfg as (
    select case p_kind when 'ask' then 5 when 'upload' then 8 when 'check' then 15
             when 'peer_like' then 2 when 'peer_comment' then 4 when 'board_help' then 6
             when 'lesson' then 40 when 'challenge' then 30 when 'simulation' then 30 else 0 end as pts,
           case p_kind when 'ask' then 20 when 'upload' then 10 when 'check' then 10
             when 'peer_like' then 25 when 'peer_comment' then 25 when 'board_help' then 10
             when 'lesson' then 10 when 'challenge' then 10 when 'simulation' then 10 else 0 end as cap
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

-- Complete: the signed in member claims the badge for one lesson. It only succeeds when every
-- self paced mode of the lesson is done AND the DrawUp server recorded a passing Verify grade.
-- XP goes through the shared ledger once per lesson (unique key), then the badge row is written.
create or replace function public.playbook_complete(p_lesson uuid)
returns jsonb language sql volatile security definer set search_path = public as $$
  with me as (
    select auth.uid() as uid
  ), l as (
    select id, kind, title, badge_name, path_key, modes from playbook_lessons where id = p_lesson and status = 'published'
  ), pr as (
    select coalesce((select p.modes from playbook_progress p, me where p.user_id = me.uid and p.lesson_id = p_lesson), '{}'::text[]) as modes
  ), best as (
    select max(a.score) as score from playbook_attempts a, me where a.user_id = me.uid and a.lesson_id = p_lesson and a.passed
  ), ok as (
    select l.*, me.uid, best.score from l, me, best, pr
     where me.uid is not null and best.score is not null and pr.modes @> l.modes
  ), xp as (
    select award_arch_coach_xp(ok.uid, ok.kind, ok.id::text) as pts from ok
  ), ins as (
    insert into playbook_awards (user_id, lesson_id, badge_name, path_key, xp, score)
    select ok.uid, ok.id, coalesce(ok.badge_name, ok.title), ok.path_key, coalesce((select pts from xp), 0), ok.score from ok
    on conflict (user_id, lesson_id) do nothing
    returning xp, badge_name
  )
  select jsonb_build_object(
    'ok', exists (select 1 from ok),
    'new_badge', exists (select 1 from ins),
    'badge', coalesce((select badge_name from ins), (select coalesce(badge_name, title) from l)),
    'xp', coalesce((select xp from ins), 0),
    'verified', (select score from best) is not null,
    'missing_modes', coalesce((select to_jsonb(array(select unnest(l.modes) except select unnest(pr.modes))) from l, pr), '[]'::jsonb),
    'signed_in', (select uid from me) is not null,
    'found', exists (select 1 from l))
$$;

revoke all on function public.playbook_complete(uuid) from public, anon;
grant execute on function public.playbook_complete(uuid) to authenticated;

select 'DONE drawup-v21-playbook-04' as status;
-- END

-- ===== drawup-v21-playbook-05-seed-architecture.sql
-- DrawUp V21 Playbook, file 5 of 12: official Architecture lessons. Migration 0041.
-- Inserted once by slug. A rerun never overwrites a lesson that HQ has since edited.
-- Videos are YouTube searches (no invented video ids). Codes are cited by name and edition only.

insert into public.playbook_lessons (slug, path_key, channel_key, kind, title, summary, level, positions, minutes, badge_name,
  watch, learn, practice, practice_kind, field, field_links, rubric, sources, status, sort_order) values
('wall-section-play', 'architecture', 'how-to-draw', 'lesson', 'Wall Section Play',
 'Read and draw an exterior wall section from footing to parapet: every layer, every flashing, every datum.',
 'Fundamentals', array['Architect','Interior Designer','Project Architect','Student','BIM Manager'], 45, 'Wall Section Play',
 '[{"label":"YouTube search: how to draw an architectural wall section","url":"https://www.youtube.com/results?search_query=how+to+draw+an+architectural+wall+section","kind":"search"},
   {"label":"YouTube search: brick veneer cavity wall explained","url":"https://www.youtube.com/results?search_query=brick+veneer+cavity+wall+explained","kind":"search"}]'::jsonb,
 array[
  'What it is: a wall section cuts vertically through the exterior wall for the full height of the building. It shows how the assembly is built and how it keeps out water, air, heat and fire. It is usually drawn at 3/4 in = 1 ft 0 in or 1/2 in = 1 ft 0 in and is called out from the building sections.',
  'Foundation and slab: footing and foundation wall, slab on grade over a vapor retarder and compacted base, perimeter insulation where the energy code requires it, and the finished floor datum (for example T.O. SLAB 100 ft 0 in).',
  'Structure and backup: studs or masonry backup, top and bottom tracks or plates, floor and roof framing bearing on or connecting to the wall, and the structural slab edge.',
  'The control layers: water (cladding plus the water resistive barrier behind it), air (a continuous air barrier), vapor (where climate calls for it) and thermal (cavity and continuous insulation). Trace each one with a finger from bottom to top. A gap in any line is a future leak or cold spot.',
  'Cladding and cavity: for anchored brick veneer, an air space between the brick and the backup, veneer anchors tied to the backup, and through wall flashing with weeps at the base, at shelf angles and at every window head.',
  'Openings: window head with flashing and end dams, jamb, and sill with a sloped sill pan, sealant joints with backer rod.',
  'Roof edge: parapet or eave, roof membrane turned up the wall, coping or edge metal sloped toward the roof, blocking, and the air barrier tied from wall to roof.',
  'Annotation: vertical datums (floor, ceiling, top of parapet), material tags that match the specifications, references to enlarged details, and the drawing title and scale. A section with no datums and no tags cannot be built from.'
 ],
 'Draw (or upload) an exterior wall section for a two story building with brick veneer over metal stud backup. Show footing to parapet, label every layer, show flashing and weeps, and add floor and roof datums.',
 'draw',
 array[
  'Before the brick goes up, look for the water resistive barrier lapped shingle style, the continuous insulation, and flashing with end dams at window heads.',
  'Weeps should sit just above the base flashing. Mortar droppings that block the cavity are a classic field problem.',
  'Compare the installed parapet coping and roof membrane turn up with the drawn detail. This is where most roof edge leaks start.'
 ],
 '[{"label":"YouTube search: brick veneer flashing installation","url":"https://www.youtube.com/results?search_query=brick+veneer+through+wall+flashing+installation","kind":"search"},
   {"label":"YouTube search: air barrier installation commercial wall","url":"https://www.youtube.com/results?search_query=air+barrier+installation+commercial+wall","kind":"search"}]'::jsonb,
 array['Footing or foundation wall','Slab on grade with vapor retarder','Stud or masonry backup','Sheathing','Water resistive or air barrier','Insulation (cavity or continuous)','Air space or cavity','Brick veneer with anchors or ties','Base flashing with weeps','Window head flashing','Window sill or sill pan','Floor and roof framing at the wall','Roof membrane and parapet or coping','Interior gypsum board','Vertical datums (floor and roof levels)','Material tags or notes','Drawing title and scale'],
 '[{"label":"International Code Council (IBC)","url":"https://www.iccsafe.org"},{"label":"National Institute of Building Sciences","url":"https://www.nibs.org"}]'::jsonb,
 'published', 10),
('accessible-restroom-sketch', 'architecture', 'sketch-challenges', 'lesson', 'Sketch Challenge: Single User Accessible Restroom',
 'Lay out a single user toilet room that meets the 2010 ADA Standards and check every clearance yourself.',
 'Fundamentals', array['Architect','Interior Designer','Student'], 30, 'Accessible Restroom Layout',
 '[{"label":"YouTube search: ADA single user restroom layout","url":"https://www.youtube.com/results?search_query=ADA+single+user+restroom+layout","kind":"search"}]'::jsonb,
 array[
  'Turning space: a 60 in diameter circle or a T shaped turning space inside the room (2010 ADA Standards 304). It may overlap fixture clear floor spaces.',
  'Water closet: centerline 16 in to 18 in from the side wall (604.2). Clearance around it at least 60 in measured from the side wall and 56 in measured from the rear wall (604.3).',
  'Grab bars: side wall bar at least 42 in long, rear wall bar at least 36 in long, mounted 33 in to 36 in above the floor to the top of the gripping surface (604.5 and 609.4).',
  'Lavatory: rim no higher than 34 in, with knee and toe clearance and a 30 in by 48 in forward approach clear floor space (606). Insulate or guard exposed pipes below.',
  'Mirror: bottom of the reflecting surface no higher than 40 in above the floor where it sits above a lavatory (603.3).',
  'Door: 32 in minimum clear width and maneuvering clearance on both sides (404). A door may not swing into the clear floor space of any fixture unless a clear floor space beyond the door swing is provided (603.2.3).',
  'Always confirm which standard your jurisdiction enforces (2010 ADA Standards and the ICC A117.1 edition referenced by the adopted building code) and use the stricter value.'
 ],
 'Sketch a single user restroom at 1/2 in = 1 ft 0 in. Show the turning circle, toilet centerline dimension, both grab bars with lengths, lavatory clear floor space, mirror height note and the door clear width.',
 'draw',
 array['On site, measure the toilet centerline and grab bar heights before tile goes on. Blocking in the wall must already be in place for the grab bars.','A door closer, a trash can or a wall heater placed inside the turning circle is a common punch list item.'],
 '[{"label":"YouTube search: ADA restroom inspection","url":"https://www.youtube.com/results?search_query=ADA+restroom+inspection+checklist","kind":"search"}]'::jsonb,
 array['60 in turning space','Toilet centerline 16 to 18 in from side wall','Side grab bar 42 in minimum','Rear grab bar 36 in minimum','Grab bar height 33 to 36 in','Lavatory clear floor space and knee clearance','Mirror 40 in maximum to reflecting surface','Door 32 in clear width','Door swing does not block fixture clear floor space'],
 '[{"label":"2010 ADA Standards for Accessible Design","url":"https://www.ada.gov"},{"label":"International Code Council (ICC A117.1)","url":"https://www.iccsafe.org"}]'::jsonb,
 'published', 20)
on conflict (slug) do nothing;

select 'DONE drawup-v21-playbook-05' as status;
-- END

-- ===== drawup-v21-playbook-06-seed-code.sql
-- DrawUp V21 Playbook, file 6 of 12: Code Playbook lesson and an Arch Coach Challenge. Migration 0041.
-- Inserted once by slug. Code sections follow 2021 IBC numbering. Members are told to verify their adopted edition.

insert into public.playbook_lessons (slug, path_key, channel_key, kind, title, summary, level, positions, minutes, badge_name,
  modes, watch, learn, practice, practice_kind, field, field_links, rubric, scenario, sources, status, sort_order) values
('occupancy-classification', 'architecture', 'code-playbook', 'lesson', 'Code Playbook: Occupancy Classification',
 'Classify spaces the way IBC Chapter 3 does, because occupancy drives egress, fire protection and construction type.',
 'Fundamentals', array['Architect','Interior Designer','Code Consultant','Student','Project Manager'], 30, 'Occupancy Classification',
 array['watch','learn','practice'],
 '[{"label":"YouTube search: IBC occupancy classification explained","url":"https://www.youtube.com/results?search_query=IBC+occupancy+classification+explained","kind":"search"}]'::jsonb,
 array[
  'Why it matters: the occupancy group is the first decision in a code analysis. It sets allowable height and area, fire separations, sprinkler triggers, plumbing fixture counts and egress requirements.',
  'The groups in IBC Chapter 3: A Assembly, B Business, E Educational, F Factory, H High hazard, I Institutional, M Mercantile, R Residential, S Storage and U Utility and miscellaneous. Most groups have numbered subgroups, for example A-2 for restaurants and bars or I-2 for hospitals.',
  'Small assembly spaces: an assembly room with fewer than 50 occupants, or one accessory to another occupancy within the limits of Section 303, is classified with that main occupancy (often B) rather than as Group A.',
  'Education: Group E covers education through the 12th grade. College and university classrooms are Group B.',
  'Mixed use: a building with more than one occupancy is designed under Section 508 as accessory, nonseparated or separated occupancies. Each option changes the separations required.',
  'Always confirm the code edition and local amendments adopted by the jurisdiction before relying on any section number.'
 ],
 'Classify each space and give one sentence of reasoning: (1) a 30 seat conference room in an office building, (2) a 120 seat restaurant, (3) a high school science classroom, (4) a university lecture hall used only for classes, (5) a self storage warehouse.',
 'answer', '{}', '[]'::jsonb,
 array['Conference room classified with the office as Group B (fewer than 50 occupants)','Restaurant classified as A-2','High school classroom classified as Group E','University lecture classroom classified as Group B','Self storage classified as Group S (S-1)','Reasoning given for each space'],
 null,
 '[{"label":"International Code Council","url":"https://www.iccsafe.org"},{"label":"ICC Digital Codes","url":"https://codes.iccsafe.org"}]'::jsonb,
 'published', 30),
('hospital-corridor-challenge', 'architecture', 'arch-coach-challenges', 'challenge', 'Arch Coach Challenge: The Hospital Corridor',
 'This new hospital corridor does not comply. Find every problem and say how to fix it.',
 'Intermediate', array['Architect','Interior Designer','Healthcare Planner','Code Consultant'], 20, 'Healthcare Corridor Check',
 array['learn','practice'],
 '[]'::jsonb,
 array[
  'Group I-2 hospitals move patients in beds, so corridors and doors used for bed movement have larger minimums than other occupancies.',
  'IBC corridor width table (Table 1020.3 in the 2021 IBC): 96 in minimum in Group I-2 areas where required for bed movement. NFPA 101 health care chapters also set an 8 ft corridor for new hospitals.',
  'IBC Section 1010.1.1: in Group I-2, means of egress doors used for the movement of beds need at least 41.5 in clear width.',
  'Protruding objects (2010 ADA Standards 307.2): objects with leading edges between 27 in and 80 in above the floor may protrude no more than 4 in into the circulation path.'
 ],
 'List each code problem you see, cite the requirement, and propose a fix.',
 'answer', '{}', '[]'::jsonb,
 array['Corridor clear width of 72 in is below the 96 in required for bed movement','Patient room doors with 33.5 in clear are below the 41.5 in required for bed movement','Wall mounted drinking fountain protrudes 8 in, more than the 4 in allowed','Fix proposed for each problem','Requirements cited by code name and section'],
 'New construction, Group I-2 hospital, inpatient unit. The corridor outside the patient rooms is 6 ft 0 in wide clear and is used to move patients in beds. Patient room doors are single 36 in leaves with 33.5 in clear opening. A wall mounted drinking fountain at 36 in above the floor projects 8 in from the corridor wall with no cane detectable element below it.',
 '[{"label":"International Code Council","url":"https://www.iccsafe.org"},{"label":"NFPA 101 Life Safety Code","url":"https://www.nfpa.org"},{"label":"2010 ADA Standards","url":"https://www.ada.gov"}]'::jsonb,
 'published', 40)
on conflict (slug) do nothing;

select 'DONE drawup-v21-playbook-06' as status;
-- END

-- ===== drawup-v21-playbook-07-seed-engineering.sql
-- DrawUp V21 Playbook, file 7 of 12: official Engineering lessons. Migration 0041.
-- Inserted once by slug.

insert into public.playbook_lessons (slug, path_key, channel_key, kind, title, summary, level, positions, minutes, badge_name,
  modes, watch, learn, practice, practice_kind, field, field_links, rubric, scenario, sources, status, sort_order) values
('load-path-play', 'engineering', 'engineering-fundamentals', 'lesson', 'Load Path Play',
 'Follow gravity and lateral loads from the roof to the soil, and learn to spot a broken load path on drawings.',
 'Fundamentals', array['Structural Engineer','Civil Engineer','Architect','Student','Superintendent'], 35, 'Load Path Fundamentals',
 array['watch','learn','practice','field'],
 '[{"label":"YouTube search: structural load path explained","url":"https://www.youtube.com/results?search_query=structural+load+path+explained","kind":"search"},
   {"label":"YouTube search: lateral force resisting system explained","url":"https://www.youtube.com/results?search_query=lateral+force+resisting+system+explained","kind":"search"}]'::jsonb,
 array[
  'Loads: dead load (the weight of the building itself), live load (people, furniture, storage), snow, rain, wind and seismic. In the United States the minimum design loads come from ASCE 7, which the IBC references.',
  'Gravity load path: roof or floor deck spans to joists or beams, beams frame into girders, girders bear on columns or bearing walls, and columns and walls carry the load to footings, which spread it into the soil.',
  'Lateral load path: wind or seismic forces are collected by the roof and floor diaphragms, delivered through collectors (drag struts) and chords to vertical elements such as shear walls, braced frames or moment frames, and taken down into the foundations.',
  'Continuity: every element must be connected to the next. A missing hold down, a beam with no post below it or a diaphragm with no collector to the shear wall breaks the path.',
  'Transfers: when a column does not line up with the one below, a transfer beam or girder has to pick it up. Transfers are expensive and should be flagged early in design.',
  'On drawings: structural framing plans, column schedules, foundation plans and shear wall or brace frame elevations together describe the path. Read them as one system.'
 ],
 'Draw or upload a simple framing diagram of a one story building (roof deck, joists, beams, columns, footings, and one braced frame or shear wall). Use arrows to trace the gravity path and the lateral path, and label each element.',
 'draw',
 array['On a steel job, watch for the moment when the deck is welded or screwed off. Until then the diaphragm does not exist, which is why temporary bracing matters during erection.','Look at shear wall hold downs and anchor bolts before the wall is covered. They are the bottom of the lateral load path.'],
 '[{"label":"YouTube search: steel erection temporary bracing","url":"https://www.youtube.com/results?search_query=steel+erection+temporary+bracing","kind":"search"}]'::jsonb,
 array['Roof or floor deck','Joists or beams','Girders','Columns or bearing walls','Footings or foundations','Gravity path traced to the soil','Diaphragm identified','Collector or drag strut identified','Shear wall, braced frame or moment frame identified','Lateral path traced to the foundation','Elements labeled'],
 null,
 '[{"label":"American Society of Civil Engineers (ASCE 7)","url":"https://www.asce.org"},{"label":"American Institute of Steel Construction","url":"https://www.aisc.org"}]'::jsonb,
 'published', 10),
('ceiling-coordination-challenge', 'engineering', 'coordination-challenges', 'challenge', 'Coordination Challenge: The 10 ft Ceiling',
 'The architect wants a 10 ft ceiling, but structure and ductwork occupy the same zone. Coordinate a solution.',
 'Intermediate', array['MEP Engineer','Structural Engineer','Architect','BIM Manager','Project Engineer'], 25, 'Ceiling Zone Coordination',
 array['learn','practice'],
 '[]'::jsonb,
 array[
  'Start with the vertical budget: floor to floor height, minus slab and deck, minus beam depth and fireproofing, minus the largest duct with its insulation and hangers, minus sprinkler mains and lights recessed into the ceiling, minus ceiling grid and clearance.',
  'Typical moves: route the main duct between beams or under the shallowest framing, flatten the duct (same area, lower height, while watching aspect ratio and pressure drop), split one large duct into two, move the main to the corridor where a lower ceiling is acceptable, or provide a local soffit.',
  'Web openings in steel beams are possible only when the structural engineer designs and approves them. Never assume a penetration.',
  'Document the agreed solution with a coordination sketch or section, update the model, and record any decision that changes design intent through the proper channel such as an RFI or ASI.'
 ],
 'Write your coordination plan: show the vertical budget math, list at least two options with tradeoffs, pick one, and say who must approve it.',
 'answer', '{}', '[]'::jsonb,
 array['Vertical budget calculated with each layer','Beam depth and fireproofing accounted for','Duct size and insulation accounted for','Sprinklers and lights accounted for','At least two options compared','Structural engineer approval for any beam penetration','Decision documented (sketch, model update, RFI or ASI)'],
 'Floor to floor height is 14 ft 0 in. The concrete on metal deck is 6 in thick. Steel beams are W18 (about 18 in deep) with 1 in of spray fireproofing. A 30 in by 16 in supply duct with 2 in of insulation runs perpendicular under the beams. Sprinkler branch lines need about 4 in and recessed lights need 8 in above the ceiling. The architect wants a 10 ft 0 in ceiling in the open office.',
 '[{"label":"ASHRAE","url":"https://www.ashrae.org"},{"label":"American Institute of Steel Construction","url":"https://www.aisc.org"}]'::jsonb,
 'published', 20)
on conflict (slug) do nothing;

select 'DONE drawup-v21-playbook-07' as status;
-- END

-- ===== drawup-v21-playbook-08-seed-construction.sql
-- DrawUp V21 Playbook, file 8 of 12: official Construction lessons. Migration 0041.
-- Inserted once by slug.

insert into public.playbook_lessons (slug, path_key, channel_key, kind, title, summary, level, positions, minutes, badge_name,
  modes, watch, learn, practice, practice_kind, field, field_links, rubric, scenario, sources, status, sort_order) values
('how-buildings-get-built', 'construction', 'how-buildings-get-built', 'lesson', 'How Buildings Get Built',
 'The construction sequence from sitework to turnover, and the inspections that happen before anything is covered up.',
 'Fundamentals', array['Superintendent','Project Engineer','Estimator','Project Manager','Student','Trades'], 35, 'Construction Sequence',
 array['watch','learn','practice','field'],
 '[{"label":"YouTube search: commercial construction sequence timelapse","url":"https://www.youtube.com/results?search_query=commercial+building+construction+sequence+timelapse","kind":"search"}]'::jsonb,
 array[
  'Preconstruction: permits, submittals for long lead items, site logistics plan (crane, laydown, deliveries, fencing) and the safety plan. OSHA rules apply from the first day on site.',
  'Sitework and foundations: clearing, erosion control, excavation, underground utilities, footings, foundation walls and under slab plumbing and electrical. Foundation and under slab inspections happen before concrete is placed.',
  'Structure: steel, concrete or wood framing, then floor and roof decks. The structure is usually inspected by special inspectors where the code requires it.',
  'Enclosure (dry in): roofing, exterior wall assemblies, windows and doors. Getting the building dry protects interior materials and drives the schedule.',
  'MEP rough in: ductwork, piping, conduit and sprinkler piping in walls and ceilings. Rough in inspections must pass before walls and ceilings are closed.',
  'Interiors and finishes: framing and drywall, ceilings, flooring, millwork, paint, fixtures and equipment.',
  'Commissioning, closeout and turnover: testing and balancing, commissioning of building systems, final inspections, certificate of occupancy, punch list, record drawings, operation and maintenance manuals and warranties.'
 ],
 'Put these activities in order and note the inspection that must happen before each cover up: drywall, footings, roofing, under slab plumbing, duct rough in, slab on grade, steel erection, punch list, certificate of occupancy.',
 'answer',
 array['Find the in wall inspection sticker or signed card before drywall goes up.','Compare one detail from the drawings with the installed work and photograph both side by side.'],
 '[{"label":"YouTube search: construction rough in inspection","url":"https://www.youtube.com/results?search_query=construction+rough+in+inspection","kind":"search"},{"label":"OSHA construction industry","url":"https://www.osha.gov"}]'::jsonb,
 array['Footings before under slab plumbing and slab on grade','Steel erection after foundations','Roofing (dry in) before interior finishes','Duct rough in before drywall','Rough in inspection before drywall cover','Punch list near the end','Certificate of occupancy after final inspections'],
 null,
 '[{"label":"Occupational Safety and Health Administration","url":"https://www.osha.gov"},{"label":"International Code Council","url":"https://www.iccsafe.org"}]'::jsonb,
 'published', 10),
('write-an-rfi', 'construction', 'rfis-submittals', 'lesson', 'RFI Drill: Write a Clear RFI',
 'A Request for Information that gets a fast, useful answer: one question, the right references, and a proposed solution.',
 'Fundamentals', array['Project Engineer','Superintendent','Project Manager','Architect','Estimator'], 25, 'RFI Writer',
 array['watch','learn','practice'],
 '[{"label":"YouTube search: how to write a good RFI construction","url":"https://www.youtube.com/results?search_query=how+to+write+a+good+RFI+construction","kind":"search"}]'::jsonb,
 array[
  'Purpose: an RFI asks the design team to clarify the contract documents. It is not a change order, though the answer may lead to one.',
  'One issue per RFI with a short, specific subject line, for example Conflict between door 112 frame and column C4.',
  'References: sheet number, detail or grid location, and specification section. Attach a marked up drawing or photo.',
  'The question: state what the documents show, why it does not work, and exactly what you need answered.',
  'Proposed solution: suggest a fix. It speeds up the answer and shows you checked constructability.',
  'Impact: note any possible cost or schedule impact and the date a response is needed to avoid delay. Log it and track it to closure.'
 ],
 'Write an RFI: on sheet A-201 the storefront head is at 10 ft 0 in, but structural sheet S-301 shows a steel lintel bottom at 9 ft 8 in at the same opening on grid line B.',
 'answer', '{}', '[]'::jsonb,
 array['Specific subject line','Sheet and detail references','Specification section referenced','Conflict described clearly','Specific question asked','Proposed solution offered','Cost or schedule impact noted','Response needed by date'],
 null,
 '[{"label":"Construction Specifications Institute","url":"https://www.csiresources.org"},{"label":"Construction Management Association of America","url":"https://www.cmaanet.org"}]'::jsonb,
 'published', 20)
on conflict (slug) do nothing;

select 'DONE drawup-v21-playbook-08' as status;
-- END

-- ===== drawup-v21-playbook-09-seed-pm.sql
-- DrawUp V21 Playbook, file 9 of 12: Project Management lesson and PM Simulation. Migration 0041.
-- Inserted once by slug. Simulation consequences are coaching guidance, not contract advice.

insert into public.playbook_lessons (slug, path_key, channel_key, kind, title, summary, level, positions, minutes, badge_name,
  modes, watch, learn, practice, practice_kind, field, field_links, rubric, scenario, choices, sources, status, sort_order) values
('project-phases-play', 'pm', 'project-phases', 'lesson', 'Project Phases Play',
 'Programming to closeout: what each phase produces, who decides, and where fee and schedule usually go wrong.',
 'Fundamentals', array['Project Manager','Architect','Project Engineer','Owner','Student'], 30, 'Project Phases',
 array['watch','learn','practice'],
 '[{"label":"YouTube search: architecture design phases SD DD CD explained","url":"https://www.youtube.com/results?search_query=architecture+design+phases+SD+DD+CD+explained","kind":"search"}]'::jsonb,
 array[
  'Programming: the owner needs, spaces, sizes and adjacencies are defined and agreed. Output is a program document.',
  'Schematic Design (SD): overall form, plans and massing, and a first cost check. The owner approves the direction.',
  'Design Development (DD): systems are chosen and coordinated (structure, MEP, envelope), materials are selected and outline specifications are written.',
  'Construction Documents (CD): the drawings and specifications that will be permitted, bid and built from.',
  'Permit and Bid or Negotiation: the building department reviews the set while contractors price it. Addenda answer bidder questions.',
  'Construction Administration (CA): submittals, RFIs, ASIs, change orders, site observation reports, pay application review and the punch list.',
  'Closeout: substantial completion, certificate of occupancy, record documents, warranties and lessons learned.',
  'Fee split: a commonly cited rule of thumb is about 15 percent SD, 20 percent DD, 40 percent CD, 5 percent bidding and 20 percent CA. It is a starting point, not a standard. Every contract sets its own.'
 ],
 'For a 40,000 sq ft office building, list each phase, its main deliverable, and the decision the owner must make before the next phase starts.',
 'answer', '{}', '[]'::jsonb,
 array['Programming with a program document','SD with owner approval of direction','DD with coordinated systems and outline specs','CD with permit and bid set','Bid or negotiation with addenda','CA with submittals, RFIs and site observation','Closeout with record documents and occupancy','Owner decision named for each phase'],
 null, '[]'::jsonb,
 '[{"label":"The American Institute of Architects","url":"https://www.aia.org"},{"label":"Project Management Institute","url":"https://www.pmi.org"}]'::jsonb,
 'published', 10),
('pm-sim-dd-crunch', 'pm', 'pm-simulations', 'simulation', 'PM Simulation: The DD Crunch',
 'You are the PM. Make the calls, see the consequences, then write your plan for Arch Coach to grade.',
 'Intermediate', array['Project Manager','Architect','Project Engineer'], 20, 'DD Crunch Survivor',
 array['learn','practice'],
 '[]'::jsonb,
 array[
  'Earned value thinking: compare fee spent with work actually complete. 72 percent of the fee spent at 60 percent complete means you are over budget, not on track.',
  'A client driven schedule change is a change. Look at the contract for what it says about schedule changes and additional services before you agree to absorb it.',
  'Consultant delays need a direct conversation, a written recovery date and a clear list of what you need from them first.',
  'Decide what the presentation must show and cut the rest. Communicate early and in writing.'
 ],
 'Write your plan for the next 5 working days: who you call first, what you tell the client, how you recover the structural work, how you protect the fee, and what you document.',
 'decision', '{}', '[]'::jsonb,
 array['Talks to the client early about scope of the earlier presentation','Checks the contract for schedule change and additional services terms','Gets a written recovery date from the structural engineer','Prioritizes what the presentation must include','Compares fee spent with percent complete','Adjusts team staffing or hours','Documents decisions in writing'],
 'Your structural engineer is three days late on the DD framing layout. The client just moved the DD presentation one week earlier. Your team has used 72 percent of the DD fee and you estimate DD is 60 percent complete.',
 '[{"q":"Who do you call first?","options":[{"label":"The structural engineer","result":"Good start. You learn the real status and can get a recovery date before you promise the client anything."},{"label":"The client","result":"Honest, but you do not yet know what you can deliver. Call the engineer first so the client hears a real plan."},{"label":"Nobody yet, the team will push harder","result":"Risky. Silent overtime burns the fee that is already over budget and the client is surprised later."}]},
   {"q":"How do you handle the earlier date?","options":[{"label":"Agree and absorb it","result":"The fee overrun grows. Check the contract first, since a client driven schedule change may justify additional services."},{"label":"Offer a focused presentation","result":"Strong. Show the decisions the client must make now and schedule the full DD review for the original date."},{"label":"Refuse the new date","result":"Protects the team but damages the relationship. Offer options instead of a flat no."}]}]'::jsonb,
 '[{"label":"Project Management Institute","url":"https://www.pmi.org"},{"label":"The American Institute of Architects","url":"https://www.aia.org"}]'::jsonb,
 'published', 20)
on conflict (slug) do nothing;

select 'DONE drawup-v21-playbook-09' as status;
-- END

-- ===== drawup-v21-playbook-10-seed-career.sql
-- DrawUp V21 Playbook, file 10 of 12: Licensure and Career lesson. Migration 0041.
-- Inserted once by slug. Licensure rules differ by jurisdiction and change over time, so the lesson
-- sends members to NCARB and their own licensing board for the current requirements.

insert into public.playbook_lessons (slug, path_key, channel_key, kind, title, summary, level, positions, minutes, badge_name,
  modes, watch, learn, practice, practice_kind, field, field_links, rubric, scenario, sources, status, sort_order) values
('licensure-roadmap', 'career', 'licensure-roadmap', 'lesson', 'Licensure Roadmap',
 'School, experience, exam, registration and continuing education: the path to becoming a licensed architect in the United States.',
 'Fundamentals', array['Student','Architect','Interior Designer','Emerging Professional'], 25, 'Licensure Roadmap',
 array['watch','learn','practice'],
 '[{"label":"YouTube search: NCARB AXP and ARE explained","url":"https://www.youtube.com/results?search_query=NCARB+AXP+ARE+explained","kind":"search"},
   {"label":"NCARB (official site)","url":"https://www.ncarb.org","kind":"official"}]'::jsonb,
 array[
  'Who sets the rules: each U.S. state or territory licensing board licenses architects. NCARB (the National Council of Architectural Registration Boards) writes the national programs most boards use. Always check your own board for its exact requirements.',
  'Education: most boards require a professional degree from a NAAB accredited program (B.Arch, M.Arch or D.Arch). Some boards accept other paths with more experience.',
  'Experience: the Architectural Experience Program (AXP) documents 3,740 hours across six experience areas, usually under the supervision of a licensed architect.',
  'Examination: the Architect Registration Examination (ARE). ARE 5.0 has six divisions: Practice Management, Project Management, Programming and Analysis, Project Planning and Design, Project Development and Documentation, and Construction and Evaluation. Check ncarb.org for the current version and any announced changes.',
  'Integrated path: some accredited programs offer the Integrated Path to Architectural Licensure (IPAL), which lets students take the ARE and earn AXP hours before graduation.',
  'Registration: apply to your board once education, experience and exam are complete. The NCARB Certificate helps you get licensed in other jurisdictions later.',
  'Continuing education: boards set their own renewal requirements. AIA members also have an annual AIA continuing education requirement. Check aia.org and your board for current hours.'
 ],
 'Write your personal roadmap: your degree status, how many AXP hours you have or plan to log per year, which ARE division you will take first and why, and your target licensure year.',
 'answer', '{}', '[]'::jsonb,
 array['Education status and degree type','AXP hours and a realistic logging plan','First ARE division chosen with a reason','Target jurisdiction or licensing board named','Target licensure date','Continuing education mentioned'],
 null,
 '[{"label":"NCARB","url":"https://www.ncarb.org"},{"label":"NAAB","url":"https://www.naab.org"},{"label":"The American Institute of Architects","url":"https://www.aia.org"}]'::jsonb,
 'published', 10)
on conflict (slug) do nothing;

select 'DONE drawup-v21-playbook-10' as status;
-- END

-- ===== drawup-v21-playbook-11-videos.sql
-- DrawUp V21 Playbook, file 11 of 12: curated example video. Migration 0041.
-- Adds one external creator video (an Instagram reel chosen by DrawUp HQ as the style DrawUp wants:
-- sections, construction sequence, realistic renders and plans) to the Watch mode of two lessons.
-- The tracking parameter is stripped. Appended only when the link is not already there, so a rerun
-- never duplicates it and never removes anything HQ added.

update public.playbook_lessons
   set watch = watch || '[{"label":"Wall section to construction, rendered: external creator reel on Instagram (not made by DrawUp)","url":"https://www.instagram.com/reel/DeIIEPOCaat/","kind":"external","style":true,"note":"The style DrawUp wants: sections, construction sequence, realistic renders and plans."}]'::jsonb,
       updated_at = now()
 where slug in ('wall-section-play', 'how-buildings-get-built')
   and not watch @> '[{"url":"https://www.instagram.com/reel/DeIIEPOCaat/"}]'::jsonb;

select 'DONE drawup-v21-playbook-11' as status;
-- END

-- ===== drawup-v21-playbook-12-the-line.sql
-- DrawUp V21 Playbook, file 12 of 12: The Line (NEOM, Saudi Arabia) case study. Migration 0041.
-- The project is listed from public sources and is UNCONFIRMED (listed_via public_sources, no firm credit).
-- Figures are the ones announced in July 2022 as reported by Dezeen. Scale back figures are Bloomberg
-- reports cited by Dezeen in April 2024. Design team and current status are marked reported.
-- Inserted once by slug. A rerun never overwrites edits.

insert into public.aec_projects (slug, name, city, state, country, project_type, status, description, owner_name, size_text, capacity_text, key_facts, conflicts, listed_via)
values ('the-line-neom', 'The Line', 'NEOM', 'Tabuk Province', 'SA', 'Linear city megaproject', 'Reported paused or scaled back (unconfirmed)',
  'Unconfirmed. Listed by DrawUp from public sources. A planned linear city in the NEOM region of northwest Saudi Arabia, presented in July 2022 as two parallel mirrored buildings 500 m tall and 170 km long with 200 m between their outer faces. Status and phasing have changed since announcement according to news reports.',
  'NEOM (reported)', 'Announced design: 170 km long, 200 m wide, 500 m tall (Dezeen, July 2022)', 'Announced design: 9 million residents (Dezeen, July 2022)',
  '["Unveiled by Crown Prince Mohammed bin Salman in July 2022 as a 170 km long, 500 m tall, 200 m wide mirrored megastructure for 9 million residents (Dezeen).","Dezeen reported in 2022 that the design was by US studio Morphosis, not officially confirmed at the time (Dezeen).","Bloomberg reported in April 2024 that only about 2.4 km of the 170 km would be completed by 2030 (Dezeen citing Bloomberg)."]'::jsonb,
  '["Scale: Bloomberg and WSJ reports of a much shorter first phase were disputed by Saudi officials (Wikipedia summary of reports). Treat current status as unconfirmed."]'::jsonb,
  'public_sources')
on conflict (slug) do nothing;

insert into public.project_sources (project_id, source_name, source_url)
select p.id, s.n, s.u from public.aec_projects p,
  (values ('NEOM (official site)', 'https://www.neom.com'),
          ('Dezeen, July 2022: Saudi Arabia reveals 170 km long mirrored skyscraper', 'https://www.dezeen.com/2022/07/26/neon-170-kilometre-long-skyscraper-city-saudi-arabia/'),
          ('Dezeen, April 2024: The Line residents by 2030 lowered (citing Bloomberg)', 'https://www.dezeen.com/2024/04/08/saudi-arabia-lowers-the-line-residents-2030/'),
          ('Wikipedia: The Line, Saudi Arabia', 'https://en.wikipedia.org/wiki/The_Line,_Saudi_Arabia')) as s(n, u)
 where p.slug = 'the-line-neom'
   and not exists (select 1 from public.project_sources x where x.project_id = p.id and x.source_url = s.u);

insert into public.playbook_lessons (slug, path_key, channel_key, kind, title, summary, level, positions, minutes, badge_name,
  modes, watch, learn, practice, practice_kind, rubric, sources, status, sort_order) values
('the-line-neom-case-study', 'architecture', 'project-walkthroughs', 'lesson', 'Case Study: The Line, NEOM',
 'A linear city proposed for northwest Saudi Arabia. Separate what was announced from what has been reported since, then critique it like a design reviewer.',
 'Intermediate', array['Architect','Student','Project Manager','Owner / Developer','Civil Engineer'], 30, 'Megaproject Case Study',
 array['watch','learn','practice'],
 '[{"label":"YouTube search: The Line NEOM design explained","url":"https://www.youtube.com/results?search_query=The+Line+NEOM+design+explained","kind":"search"},{"label":"NEOM (official site)","url":"https://www.neom.com","kind":"official"}]'::jsonb,
 array[
  'What was announced: in July 2022 Saudi Arabia presented The Line as two parallel mirrored buildings, 500 m tall and 170 km long, 200 m wide overall, planned for 9 million residents (Dezeen).',
  'The idea: a linear city concentrates everything along one spine so daily needs are close by and transit runs the length. Linear city proposals go back to Arturo Soria y Mata in 1880s Madrid.',
  'What has been reported since: in April 2024 Bloomberg reported that only about 2.4 km would be finished by 2030 and that the 2030 population estimate was cut. Saudi officials disputed reports of a scale back. Treat the current status as unconfirmed.',
  'Design team: Dezeen reported in 2022 that Morphosis designed the scheme, which was not officially confirmed at the time. Other firms have been named in later press reports. DrawUp lists none of them as confirmed.',
  'Review questions: how does a 200 m wide section get daylight and air to its lower levels, how is phasing handled when a city is one continuous building, and what does a mirrored facade mean for heat, glare and wildlife. Answer with evidence, not opinion.'
 ],
 'Write a one page design review of The Line: one strength, three risks (daylight, phasing, environment or cost), and one question you would ask the design team. Label every fact as announced or reported and name the source.',
 'answer',
 array['States the announced dimensions and population correctly','Separates announced facts from later reports','Names a source for each fact','Discusses daylight or section depth','Discusses phasing or construction risk','Discusses environmental or facade impact','Asks a specific question of the design team'],
 '[{"label":"Dezeen, July 2022","url":"https://www.dezeen.com/2022/07/26/neon-170-kilometre-long-skyscraper-city-saudi-arabia/"},{"label":"Dezeen, April 2024 (citing Bloomberg)","url":"https://www.dezeen.com/2024/04/08/saudi-arabia-lowers-the-line-residents-2030/"},{"label":"NEOM","url":"https://www.neom.com"}]'::jsonb,
 'published', 50)
on conflict (slug) do nothing;

select 'DONE drawup-v21-playbook-12' as status;
-- END
