-- 0045 vendor lunch and learns: vendor listings, calendars, requests, deterministic recommendations.
-- Concatenation of /mnt/project-files/drawup/v22/sql-parts/vendors/0045_0*.sql in order.

-- DrawUp V22 vendors (migration 0045) 01: vendor listings, calendar slots, lunch and learn requests.
-- Additive and idempotent. Nothing is dropped or wiped.

create table if not exists public.vendor_divisions (
  code text primary key,
  name text not null,
  sort int not null default 0
);

create table if not exists public.vendor_scope_keywords (
  code text not null references public.vendor_divisions(code) on delete cascade,
  keyword text not null,
  primary key (code, keyword)
);

create table if not exists public.vendor_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  company_name text not null check (length(trim(company_name)) between 2 and 120),
  tagline text,
  about text,
  website text,
  contact_email text,
  divisions text[] not null default '{}',
  products text[] not null default '{}',
  topics jsonb not null default '[]'::jsonb,
  offers_ce boolean not null default false,
  ce_note text,
  home_city text,
  home_state text,
  travel_radius_miles int check (travel_radius_miles is null or travel_radius_miles between 0 and 3000),
  travel_areas text[] not null default '{}',
  travels_nationwide boolean not null default false,
  virtual_ok boolean not null default false,
  is_published boolean not null default true,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vendor_listings_divisions_idx on public.vendor_listings using gin (divisions);

create table if not exists public.vendor_slots (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_listings(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  mode text not null default 'in_person' check (mode in ('in_person', 'virtual', 'either')),
  note text,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint vendor_slots_span check (ends_at > starts_at and ends_at <= starts_at + interval '12 hours')
);
create index if not exists vendor_slots_vendor_idx on public.vendor_slots (vendor_id, starts_at);

create table if not exists public.vendor_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_listings(id) on delete cascade,
  slot_id uuid references public.vendor_slots(id) on delete set null,
  firm_id uuid not null references public.firms(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  topic text,
  attendees int check (attendees is null or attendees between 1 and 500),
  location text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  vendor_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vendor_requests_vendor_idx on public.vendor_requests (vendor_id, starts_at);
create index if not exists vendor_requests_firm_idx on public.vendor_requests (firm_id, starts_at);
create unique index if not exists vendor_requests_one_accepted
  on public.vendor_requests (slot_id) where status = 'accepted' and slot_id is not null;
create unique index if not exists vendor_requests_one_open_per_firm
  on public.vendor_requests (slot_id, firm_id) where status in ('pending', 'accepted') and slot_id is not null;

alter table public.vendor_divisions enable row level security;
alter table public.vendor_scope_keywords enable row level security;
alter table public.vendor_listings enable row level security;
alter table public.vendor_slots enable row level security;
alter table public.vendor_requests enable row level security;

select 'DONE vendors 01 tables' as status;
-- END

-- DrawUp V22 vendors (migration 0045) 02: fixed scope list (CSI MasterFormat division numbers and titles).
-- Reference data only. Safe to run twice: existing rows keep their values.

insert into public.vendor_divisions (code, name, sort) values
  ('01', 'General Requirements', 1),
  ('02', 'Existing Conditions', 2),
  ('03', 'Concrete', 3),
  ('04', 'Masonry', 4),
  ('05', 'Metals', 5),
  ('06', 'Wood, Plastics, and Composites', 6),
  ('07', 'Thermal and Moisture Protection', 7),
  ('08', 'Openings', 8),
  ('09', 'Finishes', 9),
  ('10', 'Specialties', 10),
  ('11', 'Equipment', 11),
  ('12', 'Furnishings', 12),
  ('13', 'Special Construction', 13),
  ('14', 'Conveying Equipment', 14),
  ('21', 'Fire Suppression', 21),
  ('22', 'Plumbing', 22),
  ('23', 'Heating, Ventilating, and Air Conditioning (HVAC)', 23),
  ('25', 'Integrated Automation', 25),
  ('26', 'Electrical', 26),
  ('27', 'Communications', 27),
  ('28', 'Electronic Safety and Security', 28),
  ('31', 'Earthwork', 31),
  ('32', 'Exterior Improvements', 32),
  ('33', 'Utilities', 33),
  ('34', 'Transportation', 34),
  ('35', 'Waterway and Marine Construction', 35),
  ('48', 'Electrical Power Generation', 48)
on conflict (code) do nothing;

select 'DONE vendors 02 divisions' as status;
-- END

-- DrawUp V22 vendors (migration 0045) 03: plain project keywords that map a project to a division.
-- A project matches a division when one of these words appears as a whole word in its
-- name, type, phase, description or tags. Safe to run twice.

insert into public.vendor_scope_keywords (code, keyword) values
  ('02', 'demolition'), ('02', 'abatement'), ('02', 'existing conditions'), ('02', 'historic restoration'),
  ('02', 'adaptive reuse'),
  ('03', 'concrete'), ('03', 'cast-in-place'), ('03', 'precast'), ('03', 'tilt-up'), ('03', 'post-tensioned'),
  ('04', 'masonry'), ('04', 'brick'), ('04', 'cmu'), ('04', 'stone veneer'),
  ('05', 'structural steel'), ('05', 'steel frame'), ('05', 'metal deck'), ('05', 'railings'), ('05', 'metal stairs'),
  ('06', 'mass timber'), ('06', 'clt'), ('06', 'millwork'), ('06', 'casework'), ('06', 'cabinetry'),
  ('06', 'wood framing'), ('06', 'timber'),
  ('07', 'roof'), ('07', 'roofing'), ('07', 'reroof'), ('07', 'waterproofing'), ('07', 'insulation'),
  ('07', 'air barrier'), ('07', 'vapor barrier'), ('07', 'building envelope'), ('07', 'envelope'),
  ('07', 'cladding'), ('07', 'siding'), ('07', 'metal panels'), ('07', 'green roof'),
  ('08', 'door'), ('08', 'doors'), ('08', 'window'), ('08', 'windows'), ('08', 'glazing'),
  ('08', 'curtain wall'), ('08', 'storefront'), ('08', 'skylight'), ('08', 'skylights'),
  ('08', 'door hardware'), ('08', 'entrances'),
  ('09', 'flooring'), ('09', 'carpet'), ('09', 'tile'), ('09', 'ceiling'), ('09', 'ceilings'),
  ('09', 'acoustical'), ('09', 'acoustics'), ('09', 'drywall'), ('09', 'gypsum'), ('09', 'paint'),
  ('09', 'painting'), ('09', 'interior finishes'), ('09', 'wall covering'), ('09', 'terrazzo'),
  ('09', 'tenant improvement'), ('09', 'interior fit-out'),
  ('10', 'signage'), ('10', 'wayfinding'), ('10', 'toilet partitions'), ('10', 'lockers'),
  ('10', 'operable partitions'), ('10', 'wall protection'),
  ('11', 'laboratory'), ('11', 'lab equipment'), ('11', 'foodservice'), ('11', 'commercial kitchen'),
  ('11', 'athletic equipment'), ('11', 'medical equipment'),
  ('12', 'furniture'), ('12', 'furnishings'), ('12', 'ff&e'), ('12', 'seating'),
  ('12', 'window shades'), ('12', 'window treatments'),
  ('13', 'swimming pool'), ('13', 'natatorium'), ('13', 'pre-engineered building'),
  ('14', 'elevator'), ('14', 'elevators'), ('14', 'escalator'), ('14', 'escalators'),
  ('21', 'fire sprinkler'), ('21', 'sprinkler'), ('21', 'sprinklers'), ('21', 'fire suppression'),
  ('22', 'plumbing'), ('22', 'plumbing fixtures'), ('22', 'restrooms'), ('22', 'water heaters'),
  ('23', 'hvac'), ('23', 'mechanical'), ('23', 'ventilation'), ('23', 'air conditioning'),
  ('23', 'heat pump'), ('23', 'heat pumps'), ('23', 'geothermal'), ('23', 'chiller'),
  ('25', 'building automation'), ('25', 'integrated automation'), ('25', 'smart building'),
  ('26', 'electrical'), ('26', 'lighting'), ('26', 'solar'), ('26', 'photovoltaic'),
  ('26', 'ev charging'), ('26', 'generator'),
  ('27', 'audio visual'), ('27', 'audiovisual'), ('27', 'telecommunications'), ('27', 'structured cabling'),
  ('27', 'data center'),
  ('28', 'access control'), ('28', 'fire alarm'), ('28', 'security cameras'), ('28', 'video surveillance'),
  ('31', 'earthwork'), ('31', 'excavation'), ('31', 'sitework'), ('31', 'site work'), ('31', 'grading'),
  ('31', 'deep foundations'),
  ('32', 'landscape'), ('32', 'landscaping'), ('32', 'paving'), ('32', 'hardscape'), ('32', 'playground'),
  ('32', 'fencing'), ('32', 'irrigation'), ('32', 'site furnishings'),
  ('33', 'utilities'), ('33', 'stormwater'), ('33', 'sanitary sewer'), ('33', 'water distribution'),
  ('48', 'solar array'), ('48', 'microgrid'), ('48', 'battery storage')
on conflict (code, keyword) do nothing;

select 'DONE vendors 03 keywords' as status;
-- END

-- DrawUp V22 vendors (migration 0045) 04: helper functions (all single-statement language sql, no plpgsql).
-- Safe to run twice (create or replace).

-- Who may see a listing: its owner, DrawUp HQ, or anyone when it is published and not a sample.
create or replace function public.vendor_can_see(p_published boolean, p_sample boolean, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_owner = auth.uid(), false) or public.is_drawup_admin() or (p_published and not p_sample)
$$;

-- True when a firm already holds an accepted booking for this slot.
create or replace function public.vendor_slot_taken(p_slot uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vendor_requests r where r.slot_id = p_slot and r.status = 'accepted')
$$;

-- Public calendar: upcoming open slots of visible vendors, with a taken flag and no firm details.
create or replace function public.vendor_slot_board(p_vendor uuid default null)
returns table (id uuid, vendor_id uuid, starts_at timestamptz, ends_at timestamptz, mode text, note text, taken boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.vendor_id, s.starts_at, s.ends_at, s.mode, s.note,
    exists (select 1 from public.vendor_requests r where r.slot_id = s.id and r.status = 'accepted')
  from public.vendor_slots s join public.vendor_listings l on l.id = s.vendor_id
  where (p_vendor is null or s.vendor_id = p_vendor) and not s.is_closed and s.ends_at > now()
    and public.vendor_can_see(l.is_published, l.is_sample, l.owner_id)
  order by s.starts_at limit 3000
$$;

-- Deterministic recommendations for one firm, one row per vendor, project and matched division.
-- A vendor is recommended when one of the
-- firm's active projects contains a keyword of a division the vendor lists.
-- Only members of the firm (or HQ) get rows. Workspace projects only count for their owner
-- or a firm admin, so other members never learn private project names.
create or replace function public.vendor_recommendations(p_firm uuid)
returns table (vendor_id uuid, company_name text, project_id uuid, project_name text,
  project_source text, division_code text, division_name text, keyword text)
language sql stable security definer set search_path = public as $$
  with allowed as (select (public.drawup_is_firm_member(p_firm) or public.is_drawup_admin()) as ok),
  projects as (
    select 'workspace'::text as src, t.id, t.project_name as pname,
      concat_ws(' ', t.project_name, t.project_type, t.project_phase, t.description) as txt
    from public.project_threads t, allowed a
    where a.ok and t.firm_id = p_firm and t.status = 'active'
      and (t.owner_id = auth.uid() or public.is_firm_admin(p_firm) or public.is_drawup_admin())
    union all
    select 'portfolio'::text, p.id, p.name,
      concat_ws(' ', p.name, p.project_type, p.description,
        (select string_agg(g.tag, ' ') from public.project_tags g where g.project_id = p.id))
    from public.aec_projects p, allowed a
    where a.ok
      and exists (select 1 from public.project_firms pf where pf.project_id = p.id and pf.firm_id = p_firm)
      and lower(coalesce(p.status, 'x')) ~ '^(active|in design|design|under construction|construction|in progress|underway|proposed|planning|in planning)'
  ),
  hits as (
    select distinct on (v.id, pr.id, d.code) v.id as vendor_id, v.company_name, pr.id as project_id,
      pr.pname as project_name, pr.src as project_source, d.code as division_code,
      d.name as division_name, k.keyword
    from projects pr
    join public.vendor_scope_keywords k on pr.txt ~* ('\m' || k.keyword || '\M')
    join public.vendor_divisions d on d.code = k.code
    join public.vendor_listings v on k.code = any (v.divisions)
    where public.vendor_can_see(v.is_published, v.is_sample, v.owner_id)
      and v.owner_id is distinct from auth.uid()
    order by v.id, pr.id, d.code, length(k.keyword) desc
  )
  select h.vendor_id, h.company_name, h.project_id, h.project_name, h.project_source,
    h.division_code, h.division_name, h.keyword
  from hits h order by h.project_name, h.company_name, h.division_code
$$;

revoke all on function public.vendor_recommendations(uuid) from public, anon;
grant execute on function public.vendor_recommendations(uuid) to authenticated;
grant execute on function public.vendor_slot_board(uuid) to anon, authenticated;
grant execute on function public.vendor_can_see(boolean, boolean, uuid) to anon, authenticated;
grant execute on function public.vendor_slot_taken(uuid) to authenticated;

select 'DONE vendors 04 functions' as status;
-- END

-- DrawUp V22 vendors (migration 0045) 05: row level security and column grants.
-- Vendors edit only their own listing, calendar and replies. Firm members only request for
-- firms they belong to. Policies are recreated by name, which never touches data. Safe to run twice.

drop policy if exists "vendor divisions readable" on public.vendor_divisions;
create policy "vendor divisions readable" on public.vendor_divisions for select using (true);
drop policy if exists "vendor keywords readable" on public.vendor_scope_keywords;
create policy "vendor keywords readable" on public.vendor_scope_keywords for select using (true);

drop policy if exists "vendor listings visible" on public.vendor_listings;
create policy "vendor listings visible" on public.vendor_listings for select
  using (public.vendor_can_see(is_published, is_sample, owner_id));
drop policy if exists "vendor creates own listing" on public.vendor_listings;
create policy "vendor creates own listing" on public.vendor_listings for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists "vendor edits own listing" on public.vendor_listings;
create policy "vendor edits own listing" on public.vendor_listings for update to authenticated
  using (owner_id = auth.uid() or public.is_drawup_admin())
  with check (owner_id = auth.uid() or public.is_drawup_admin());
drop policy if exists "vendor deletes own listing" on public.vendor_listings;
create policy "vendor deletes own listing" on public.vendor_listings for delete to authenticated
  using (owner_id = auth.uid() or public.is_drawup_admin());

drop policy if exists "vendor slots visible" on public.vendor_slots;
create policy "vendor slots visible" on public.vendor_slots for select
  using (exists (select 1 from public.vendor_listings l where l.id = vendor_id
    and public.vendor_can_see(l.is_published, l.is_sample, l.owner_id)));
drop policy if exists "vendor manages own slots" on public.vendor_slots;
create policy "vendor manages own slots" on public.vendor_slots for all to authenticated
  using (exists (select 1 from public.vendor_listings l where l.id = vendor_id and l.owner_id = auth.uid()))
  with check (exists (select 1 from public.vendor_listings l where l.id = vendor_id and l.owner_id = auth.uid()));

drop policy if exists "vendor requests readable by parties" on public.vendor_requests;
create policy "vendor requests readable by parties" on public.vendor_requests for select to authenticated
  using (requested_by = auth.uid() or public.drawup_is_firm_member(firm_id) or public.is_drawup_admin()
    or exists (select 1 from public.vendor_listings l where l.id = vendor_id and l.owner_id = auth.uid()));
drop policy if exists "firm members request slots" on public.vendor_requests;
create policy "firm members request slots" on public.vendor_requests for insert to authenticated
  with check (requested_by = auth.uid() and status = 'pending' and vendor_note is null and decided_at is null
    and public.drawup_is_firm_member(firm_id)
    and not public.vendor_slot_taken(slot_id)
    and exists (select 1 from public.vendor_slots s join public.vendor_listings l on l.id = s.vendor_id
      where s.id = slot_id and s.vendor_id = vendor_requests.vendor_id and not s.is_closed
        and s.starts_at > now() and s.starts_at = vendor_requests.starts_at
        and s.ends_at = vendor_requests.ends_at and l.owner_id <> auth.uid()
        and public.vendor_can_see(l.is_published, l.is_sample, l.owner_id)));
drop policy if exists "vendor answers requests" on public.vendor_requests;
create policy "vendor answers requests" on public.vendor_requests for update to authenticated
  using (exists (select 1 from public.vendor_listings l where l.id = vendor_id and l.owner_id = auth.uid()))
  with check (status in ('accepted', 'declined', 'cancelled')
    and exists (select 1 from public.vendor_listings l where l.id = vendor_id and l.owner_id = auth.uid()));
drop policy if exists "requester cancels request" on public.vendor_requests;
create policy "requester cancels request" on public.vendor_requests for update to authenticated
  using (requested_by = auth.uid()) with check (requested_by = auth.uid() and status = 'cancelled');

-- Requests: after insert only the status, the vendor reply and timestamps can change.
revoke update on public.vendor_requests from anon, authenticated;
grant update (status, vendor_note, decided_at, updated_at) on public.vendor_requests to authenticated;
revoke insert, update, delete on public.vendor_requests from anon;
revoke insert, update, delete on public.vendor_listings, public.vendor_slots from anon;
revoke insert, update, delete on public.vendor_divisions, public.vendor_scope_keywords from anon, authenticated;
grant select on public.vendor_divisions, public.vendor_scope_keywords, public.vendor_listings, public.vendor_slots to anon, authenticated;
grant select, insert on public.vendor_requests to authenticated;
grant insert, update, delete on public.vendor_listings, public.vendor_slots to authenticated;

select 'DONE vendors 05 rls' as status;
-- END
