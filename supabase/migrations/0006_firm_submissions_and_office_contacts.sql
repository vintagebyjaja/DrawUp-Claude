-- SEASON 1 — Migration 0006: Firm submissions, office contacts, firm photos
-- Closes three gaps surfaced while building the Gallery/Connect/Firm Profile
-- preview:
--   1. A lightweight, public "add a firm" path — distinct from firm_claims
--      (0002), which is for claiming a firm that's already in the directory.
--      This is for a firm that ISN'T listed yet. Verification here is
--      intentionally light: a website URL or an Instagram/LinkedIn handle,
--      not an email-domain match. Every submission sits in a review queue;
--      nothing becomes a public firm row until a founder/admin approves it.
--   2. Head of Office + a short team list per office, with a per-office
--      visibility toggle (firms may not want every office's roster public),
--      plus a phone number clients can call.
--   3. A firm photo gallery — `firms.hero_image_url` is one image; founders
--      and firm admins need to add more than one photo of the firm itself
--      (office photos, team photos), separate from `project_images` (0003),
--      which is for photos of a specific project.

create type verification_method as enum ('website', 'instagram', 'linkedin');

-- ---------------------------------------------------------------------
-- 1. Firm submissions (self-service "add a firm")
-- ---------------------------------------------------------------------

create table firm_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references profiles(id) on delete cascade,
  firm_name text not null,
  city text,
  state text,
  country text not null default 'US',
  website text,
  instagram_url text,
  linkedin_url text,
  verification_method verification_method not null,
  note text, -- optional context from the submitter ("I work here", "local firm, not listed yet")
  status claim_status not null default 'pending',
  created_firm_id uuid references firms(id), -- set once approved and promoted into a real firm row
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id),
  constraint firm_submissions_has_verification check (
    (verification_method = 'website' and website is not null)
    or (verification_method = 'instagram' and instagram_url is not null)
    or (verification_method = 'linkedin' and linkedin_url is not null)
  )
);

alter table firm_submissions enable row level security;

create policy "submitters see their own submissions" on firm_submissions for select
  using (submitted_by = auth.uid() or is_drawup_admin());
create policy "signed-in users can submit a firm" on firm_submissions for insert
  with check (submitted_by = auth.uid());
create policy "founders and admins review submissions" on firm_submissions for update
  using (is_drawup_admin());

-- ---------------------------------------------------------------------
-- 2. Office contacts: Head of Office, team list, phone, visibility toggle
-- ---------------------------------------------------------------------

alter table firm_offices add column if not exists phone text;
alter table firm_offices add column if not exists show_team boolean not null default false;

create table firm_office_people (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references firm_offices(id) on delete cascade,
  name text not null,
  title text, -- 'Head of Office' | 'Project Architect' | ...
  is_head boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table firm_office_people enable row level security;

-- Public can read an office's people only when that office has opted in
-- (show_team = true); firm admins and DrawUp admins can always see it,
-- toggle on or off, so they can preview before publishing.
create policy "office team visible when office opts in, or to admins" on firm_office_people for select
  using (
    exists (
      select 1 from firm_offices fo
      where fo.id = office_id
        and (fo.show_team = true or is_firm_admin(fo.firm_id) or is_drawup_admin())
    )
  );
create policy "firm admins manage their office team" on firm_office_people for all
  using (
    exists (
      select 1 from firm_offices fo
      where fo.id = office_id
        and (is_firm_admin(fo.firm_id) or is_drawup_admin())
    )
  );

-- ---------------------------------------------------------------------
-- 3. Firm photo gallery (photos of the firm/offices, not a specific project)
-- ---------------------------------------------------------------------

create table firm_photos (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  image_url text not null,
  caption text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table firm_photos enable row level security;

create policy "firm photos are publicly readable" on firm_photos for select using (true);
create policy "firm admins manage their firm's photos" on firm_photos for all
  using (is_firm_admin(firm_id) or is_drawup_admin());

-- ---------------------------------------------------------------------
-- Founder console note: there's no special schema for "founder adds a firm
-- directly" — a founder account already clears is_drawup_admin() (0005), and
-- every write policy above and in 0002/0003 already accepts is_drawup_admin().
-- A founder can insert straight into firms/firm_offices/firm_photos/
-- aec_projects/project_images with no new table. firm_submissions exists
-- only for the OTHER path: a user or firm with no DrawUp account access
-- proposing a firm that isn't listed yet.
-- ---------------------------------------------------------------------
