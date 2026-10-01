-- SEASON 1 — Migration 0002: Firm Search + Firm Profiles (Phase S1-2)

create type firm_subscription_tier as enum ('free', 'showcase', 'pro');
create type claim_status as enum ('pending', 'approved', 'rejected');

create table firms (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  website text,
  logo_url text,
  hero_image_url text,
  subscription_tier firm_subscription_tier not null default 'free',
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table firm_offices (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  city text not null,
  state text,
  country text not null default 'US',
  is_headquarters boolean not null default false
);

create table firm_members (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member', -- 'admin' | 'member'
  created_at timestamptz not null default now(),
  unique (firm_id, user_id)
);

create table firm_services (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  service text not null
);

create table firm_markets (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  market text not null -- e.g. 'healthcare', 'education', 'hospitality'
);

create table firm_specialties (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  specialty text not null
);

create table firm_social_links (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  platform text not null,
  url text not null
);

create table firm_claims (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  claim_email text not null,
  status claim_status not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id)
);

create table firm_verifications (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  verified_domain text,
  verified_at timestamptz not null default now(),
  verified_by uuid references profiles(id)
);

create table firm_subscriptions (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  tier firm_subscription_tier not null,
  seat_limit int not null default 0,
  started_at timestamptz not null default now(),
  current_period_end timestamptz,
  stripe_subscription_id text
);

create table firm_analytics_events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  event_type text not null, -- 'profile_viewed' | 'contact_clicked' | ...
  user_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Helper: is the current user an admin of this firm?
create or replace function is_firm_admin(target_firm_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from firm_members
    where firm_id = target_firm_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

alter table firms enable row level security;
alter table firm_offices enable row level security;
alter table firm_members enable row level security;
alter table firm_services enable row level security;
alter table firm_markets enable row level security;
alter table firm_specialties enable row level security;
alter table firm_social_links enable row level security;
alter table firm_claims enable row level security;
alter table firm_verifications enable row level security;
alter table firm_subscriptions enable row level security;
alter table firm_analytics_events enable row level security;

-- Public read on firm directory + profile content.
create policy "firms are publicly readable" on firms for select using (true);
create policy "firm offices are publicly readable" on firm_offices for select using (true);
create policy "firm services are publicly readable" on firm_services for select using (true);
create policy "firm markets are publicly readable" on firm_markets for select using (true);
create policy "firm specialties are publicly readable" on firm_specialties for select using (true);
create policy "firm social links are publicly readable" on firm_social_links for select using (true);

-- Only firm admins (or DrawUp admins) can edit their firm's own content.
create policy "firm admins can update their firm" on firms for update
  using (is_firm_admin(id) or is_drawup_admin());
create policy "firm admins can manage offices" on firm_offices for all
  using (is_firm_admin(firm_id) or is_drawup_admin());
create policy "firm admins can manage services" on firm_services for all
  using (is_firm_admin(firm_id) or is_drawup_admin());
create policy "firm admins can manage markets" on firm_markets for all
  using (is_firm_admin(firm_id) or is_drawup_admin());
create policy "firm admins can manage specialties" on firm_specialties for all
  using (is_firm_admin(firm_id) or is_drawup_admin());
create policy "firm admins can manage social links" on firm_social_links for all
  using (is_firm_admin(firm_id) or is_drawup_admin());

-- Membership visible to the firm's own members + admins.
create policy "firm members readable by same firm" on firm_members for select
  using (is_firm_admin(firm_id) or user_id = auth.uid() or is_drawup_admin());
create policy "firm admins manage membership" on firm_members for all
  using (is_firm_admin(firm_id) or is_drawup_admin());

-- Claims: a user can see/create their own claims; admin review is DrawUp-admin only.
create policy "users manage their own claims" on firm_claims for select
  using (user_id = auth.uid() or is_drawup_admin());
create policy "users can submit a claim" on firm_claims for insert
  with check (user_id = auth.uid());
create policy "drawup admins review claims" on firm_claims for update
  using (is_drawup_admin());

create policy "verifications readable by firm + admins" on firm_verifications for select
  using (is_firm_admin(firm_id) or is_drawup_admin());
create policy "only drawup admins write verifications" on firm_verifications for insert
  with check (is_drawup_admin());

create policy "subscriptions readable by firm + admins" on firm_subscriptions for select
  using (is_firm_admin(firm_id) or is_drawup_admin());
create policy "only drawup admins manage subscriptions" on firm_subscriptions for all
  using (is_drawup_admin());

create policy "firm admins read their own analytics" on firm_analytics_events for select
  using (is_firm_admin(firm_id) or is_drawup_admin());
create policy "analytics events are insert-only, any authenticated user" on firm_analytics_events for insert
  with check (auth.role() = 'authenticated');
