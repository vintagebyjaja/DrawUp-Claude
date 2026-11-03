-- DrawUp v27 Visual Detail Intelligence 1.0 (migration 0069, SQL v27-01).
-- Additive and safe to run twice. Nothing existing is dropped or changed.
--  * vdi_reviews: one drawing review (Find the flaws -> Understand the fix -> DrawUp Ready). Private to its owner.
--    The AI results are written only by the server (service role). The owner may change only user_state (marker moves,
--    decisions, student/pro view) and may delete the review.
--  * vdi_manufacturer_sources: the manufacturer libraries DrawUp may search, with their licence status. Only sources with
--    approved = true are searched. HQ approves a source after checking its terms (see V27 notes).
--  * vdi_manufacturer_refs: metadata + official links found in approved libraries. Never the drawings themselves.
--  * vdi_code_adoptions: adopted code editions per jurisdiction, each with the official page it was read on (cache).

create table if not exists public.vdi_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.project_threads(id) on delete set null,
  persona text not null default 'coach' check (persona in ('coach', 'teammate')),
  title text not null default 'Drawing review',
  source_paths text[] not null default '{}',
  file_name text,
  notes text,
  jurisdiction jsonb not null default '{}'::jsonb,
  stage text not null default 'reviewing',
  jobs jsonb not null default '{}'::jsonb,
  review jsonb,
  research jsonb,
  drawing jsonb,
  validation jsonb,
  detail_id uuid references public.details(id) on delete set null,
  followups jsonb not null default '[]'::jsonb,
  ai_image_path text,
  user_state jsonb not null default '{}'::jsonb,
  credits_charged integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vdi_reviews_owner_idx on public.vdi_reviews (owner_id, created_at desc);
alter table public.vdi_reviews enable row level security;
drop policy if exists "vdi reviews read own" on public.vdi_reviews;
create policy "vdi reviews read own" on public.vdi_reviews for select using (owner_id = auth.uid());
drop policy if exists "vdi reviews update own" on public.vdi_reviews;
create policy "vdi reviews update own" on public.vdi_reviews for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "vdi reviews delete own" on public.vdi_reviews;
create policy "vdi reviews delete own" on public.vdi_reviews for delete using (owner_id = auth.uid());

-- Members may only change user_state (and updated_at). Everything else is written by DrawUp's server.
create or replace function public.vdi_reviews_guard() returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or (auth.uid() is null and current_user in ('postgres', 'supabase_admin')) then return new; end if;
  if (to_jsonb(new) - 'user_state' - 'updated_at') is distinct from (to_jsonb(old) - 'user_state' - 'updated_at') then
    raise exception 'Only DrawUp can change a drawing review. You can move markers and record decisions.';
  end if;
  return new;
end $$;
drop trigger if exists vdi_reviews_guard on public.vdi_reviews;
create trigger vdi_reviews_guard before update on public.vdi_reviews for each row execute function public.vdi_reviews_guard();

create table if not exists public.vdi_manufacturer_sources (
  id uuid primary key default gen_random_uuid(),
  manufacturer text not null,
  domain text not null unique,
  library_url text,
  regions text[] not null default '{}',
  license_status text not null default 'link_only' check (license_status in ('link_only', 'metadata_only', 'redistribution_permitted', 'permission_requested', 'licensed')),
  license_terms_url text,
  license_summary text,
  approved boolean not null default false,
  approved_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.vdi_manufacturer_sources enable row level security;
drop policy if exists "vdi sources readable" on public.vdi_manufacturer_sources;
create policy "vdi sources readable" on public.vdi_manufacturer_sources for select using (true);

create table if not exists public.vdi_manufacturer_refs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.vdi_manufacturer_sources(id) on delete cascade,
  manufacturer text not null,
  product text,
  title text not null,
  region text,
  revision text,
  published text,
  url text not null unique,
  file_type text,
  kind text not null default 'technical' check (kind in ('visual', 'technical', 'installation_guide', 'product_page')),
  classes text[] not null default '{}',
  search_text text,
  license_status text not null default 'link_only',
  found_by text not null default 'web_search',
  first_seen timestamptz not null default now(),
  last_checked timestamptz not null default now()
);
create index if not exists vdi_refs_search_idx on public.vdi_manufacturer_refs using gin (to_tsvector('english', coalesce(search_text, title)));
alter table public.vdi_manufacturer_refs enable row level security;
drop policy if exists "vdi refs readable" on public.vdi_manufacturer_refs;
create policy "vdi refs readable" on public.vdi_manufacturer_refs for select using (true);

create table if not exists public.vdi_code_adoptions (
  id uuid primary key default gen_random_uuid(),
  jurisdiction_key text not null,
  jurisdiction text not null,
  code text not null,
  edition text,
  amendments text,
  effective text,
  source_url text not null,
  checked_at timestamptz not null default now(),
  unique (jurisdiction_key, code)
);
alter table public.vdi_code_adoptions enable row level security;
drop policy if exists "vdi adoptions readable" on public.vdi_code_adoptions;
create policy "vdi adoptions readable" on public.vdi_code_adoptions for select using (true);

-- Candidate manufacturer libraries. Only James Hardie New Zealand is approved: its terms were read on 2026-10-27
-- (https://www.jameshardie.co.nz/legal-information/copyright-conditions-of-use). They allow exact copies of the CAD
-- drawings only for detailing and specifying James Hardie products, so DrawUp stores titles + links, never the files.
-- The others are candidates (approved = false) until HQ reads each one's terms and sets approved = true.
insert into public.vdi_manufacturer_sources (manufacturer, domain, library_url, regions, license_status, license_terms_url, license_summary, approved, approved_note) values
  ('James Hardie', 'jameshardie.co.nz', 'https://www.jameshardie.co.nz/resources/cad-library', '{New Zealand}', 'link_only', 'https://www.jameshardie.co.nz/legal-information/copyright-conditions-of-use',
   'Copyright James Hardie New Zealand Limited. Exact copies or extracts of the CAD drawings may be reproduced only for detailing, specifying, using and promoting James Hardie products and systems, and never with other products. DrawUp links to the original and does not store or modify the drawings.', true, 'Terms read 2026-10-27. Link + metadata only.')
on conflict (domain) do nothing;
insert into public.vdi_manufacturer_sources (manufacturer, domain, regions) values
  ('James Hardie (US)', 'jameshardie.com', '{United States}'),
  ('USG', 'usg.com', '{United States}'),
  ('CertainTeed', 'certainteed.com', '{United States}'),
  ('Owens Corning', 'owenscorning.com', '{United States}'),
  ('ROCKWOOL', 'rockwool.com', '{}'),
  ('DuPont Tyvek', 'dupont.com', '{}'),
  ('Carlisle', 'carlisleccm.com', '{United States}'),
  ('Sika', 'sika.com', '{}'),
  ('GCP Applied Technologies', 'gcpat.com', '{}'),
  ('Tremco', 'tremcosealants.com', '{United States}'),
  ('Simpson Strong-Tie', 'strongtie.com', '{United States}'),
  ('Hilti', 'hilti.com', '{}'),
  ('ClarkDietrich', 'clarkdietrich.com', '{United States}'),
  ('Kingspan', 'kingspan.com', '{}'),
  ('Sto', 'stocorp.com', '{United States}'),
  ('ZIP System / Huber', 'huberwood.com', '{United States}'),
  ('W. R. MEADOWS', 'wrmeadows.com', '{United States}')
on conflict (domain) do nothing;
