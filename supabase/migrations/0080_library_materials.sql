-- DrawUp v33: Materials library (DrawUp / Imported / Vendor) and vendor pages.
-- Additive and idempotent. Nothing is dropped or wiped. Safe to run more than once.
--
--  * material_vendors  one browsable page per vendor (company name, contact, website, about).
--                      Anyone signed in can create a vendor page; only its creator (or DrawUp HQ) can edit it.
--  * user_materials    one row per material a member adds.
--                      source 'imported' = the member's own material, private to them, image in drawup-private.
--                      source 'vendor'   = a vendor's real product with its real sizes, shown on the vendor's page
--                                          to every signed-in member, image in the public drawup-materials bucket.
--                      Anyone signed in can add a product to an existing vendor page; only the person who added it
--                      (or the vendor page owner, or HQ) can change or remove it.
--  * Swap reads a member's own materials and published vendor products as reference images (server side).
--
-- The DrawUp tab (the built-in material library) lives in the app code, so it needs no table.

-------------------------------------------------------------------------------
-- 1. Vendor pages
-------------------------------------------------------------------------------
create table if not exists public.material_vendors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  listing_id uuid references public.vendor_listings(id) on delete set null,
  name text not null,
  slug text not null,
  tagline text,
  about text,
  website text,
  contact_name text,
  contact_email text,
  contact_phone text,
  city text,
  state text,
  categories text[] not null default '{}',
  logo_path text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_vendors_name_len check (char_length(trim(name)) between 2 and 120),
  constraint material_vendors_slug_fmt check (slug ~ '^[a-z0-9][a-z0-9-]{0,80}$'),
  constraint material_vendors_tagline_len check (tagline is null or char_length(tagline) <= 160),
  constraint material_vendors_about_len check (about is null or char_length(about) <= 4000),
  constraint material_vendors_text_len check (
    coalesce(char_length(website), 0) <= 300 and coalesce(char_length(contact_name), 0) <= 120
    and coalesce(char_length(contact_email), 0) <= 200 and coalesce(char_length(contact_phone), 0) <= 40
    and coalesce(char_length(city), 0) <= 80 and coalesce(char_length(state), 0) <= 40
    and coalesce(char_length(logo_path), 0) <= 400)
);
create unique index if not exists material_vendors_slug_key on public.material_vendors (slug);
create unique index if not exists material_vendors_name_key on public.material_vendors (lower(trim(name)));
create index if not exists material_vendors_owner_idx on public.material_vendors (owner_id);

alter table public.material_vendors enable row level security;
drop policy if exists "material vendors read" on public.material_vendors;
create policy "material vendors read" on public.material_vendors for select to authenticated
  using (is_published or owner_id = auth.uid() or public.is_drawup_admin());
drop policy if exists "material vendors insert" on public.material_vendors;
create policy "material vendors insert" on public.material_vendors for insert to authenticated
  with check (owner_id = auth.uid()
    and (listing_id is null or exists (select 1 from public.vendor_listings l where l.id = listing_id and l.owner_id = auth.uid())));
drop policy if exists "material vendors update" on public.material_vendors;
create policy "material vendors update" on public.material_vendors for update to authenticated
  using (owner_id = auth.uid() or public.is_drawup_admin())
  with check ((owner_id = auth.uid() or public.is_drawup_admin())
    and (listing_id is null or public.is_drawup_admin() or exists (select 1 from public.vendor_listings l where l.id = listing_id and l.owner_id = auth.uid())));
drop policy if exists "material vendors delete" on public.material_vendors;
create policy "material vendors delete" on public.material_vendors for delete to authenticated
  using (owner_id = auth.uid() or public.is_drawup_admin());
grant select, insert, update, delete on public.material_vendors to authenticated;

-------------------------------------------------------------------------------
-- 2. Materials members add (imported) and vendor products
-------------------------------------------------------------------------------
create table if not exists public.user_materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  source text not null default 'imported',
  vendor_id uuid references public.material_vendors(id) on delete cascade,
  name text not null,
  category text not null default 'other',
  finish text,
  color text,
  description text,
  image_path text not null,
  sku text,
  width numeric,
  length numeric,
  thickness numeric,
  unit text not null default 'in',
  sizes_available text[] not null default '{}',
  product_url text,
  price_note text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_materials_source_check check (source in ('imported', 'vendor')),
  constraint user_materials_vendor_check check ((source = 'vendor') = (vendor_id is not null)),
  constraint user_materials_category_check check (category in
    ('flooring', 'tile', 'stone', 'wood', 'concrete', 'brick', 'metal', 'glass', 'wall', 'paint', 'roofing', 'siding', 'fabric', 'countertop', 'landscape', 'fixture', 'other')),
  constraint user_materials_unit_check check (unit in ('in', 'ft', 'mm', 'cm', 'm')),
  constraint user_materials_size_check check (
    (width is null or (width > 0 and width < 100000)) and (length is null or (length > 0 and length < 100000))
    and (thickness is null or (thickness > 0 and thickness < 100000))),
  constraint user_materials_text_len check (
    char_length(trim(name)) between 1 and 120 and coalesce(char_length(finish), 0) <= 120 and coalesce(char_length(color), 0) <= 120
    and coalesce(char_length(description), 0) <= 2000 and char_length(image_path) <= 400 and coalesce(char_length(sku), 0) <= 80
    and coalesce(char_length(product_url), 0) <= 400 and coalesce(char_length(price_note), 0) <= 120
    and coalesce(array_length(sizes_available, 1), 0) <= 30),
  constraint user_materials_path_safe check (image_path not like '%..%')
);
create index if not exists user_materials_owner_idx on public.user_materials (owner_id, created_at desc);
create index if not exists user_materials_vendor_idx on public.user_materials (vendor_id, created_at desc) where vendor_id is not null;

alter table public.user_materials enable row level security;
drop policy if exists "user materials read" on public.user_materials;
create policy "user materials read" on public.user_materials for select to authenticated using (
  owner_id = auth.uid() or public.is_drawup_admin()
  or (source = 'vendor' and is_published and exists (select 1 from public.material_vendors v where v.id = vendor_id and v.is_published))
  or (source = 'vendor' and exists (select 1 from public.material_vendors v where v.id = vendor_id and v.owner_id = auth.uid())));
drop policy if exists "user materials insert" on public.user_materials;
create policy "user materials insert" on public.user_materials for insert to authenticated with check (
  owner_id = auth.uid() and split_part(image_path, '/', 1) = auth.uid()::text
  and (source = 'imported' or exists (select 1 from public.material_vendors v where v.id = vendor_id and (v.is_published or v.owner_id = auth.uid()))));
drop policy if exists "user materials update" on public.user_materials;
create policy "user materials update" on public.user_materials for update to authenticated
  using (owner_id = auth.uid() or public.is_drawup_admin()
    or (source = 'vendor' and exists (select 1 from public.material_vendors v where v.id = vendor_id and v.owner_id = auth.uid())))
  with check (split_part(image_path, '/', 1) = owner_id::text);
drop policy if exists "user materials delete" on public.user_materials;
create policy "user materials delete" on public.user_materials for delete to authenticated
  using (owner_id = auth.uid() or public.is_drawup_admin()
    or (source = 'vendor' and exists (select 1 from public.material_vendors v where v.id = vendor_id and v.owner_id = auth.uid())));
grant select, insert, update, delete on public.user_materials to authenticated;

-- A product row cannot move to another owner, source or vendor after it is created.
create or replace function public.user_materials_guard() returns trigger language plpgsql as $$
begin
  if new.owner_id <> old.owner_id or new.source <> old.source or new.vendor_id is distinct from old.vendor_id then
    raise exception 'A material keeps its owner, source and vendor.';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists user_materials_guard on public.user_materials;
create trigger user_materials_guard before update on public.user_materials for each row execute function public.user_materials_guard();

create or replace function public.material_vendors_guard() returns trigger language plpgsql as $$
begin
  if new.owner_id <> old.owner_id and not public.is_drawup_admin() then
    raise exception 'A vendor page keeps its owner.';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists material_vendors_guard on public.material_vendors;
create trigger material_vendors_guard before update on public.material_vendors for each row execute function public.material_vendors_guard();

-------------------------------------------------------------------------------
-- 3. Public bucket for vendor product pictures and vendor logos
--    (imported materials stay in the private drawup-private bucket, in the member's own folder)
-------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('drawup-materials', 'drawup-materials', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "drawup materials read" on storage.objects;
create policy "drawup materials read" on storage.objects for select
  using (bucket_id = 'drawup-materials');
drop policy if exists "drawup materials upload" on storage.objects;
create policy "drawup materials upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'drawup-materials' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "drawup materials delete" on storage.objects;
create policy "drawup materials delete" on storage.objects for delete to authenticated
  using (bucket_id = 'drawup-materials' and (storage.foldername(name))[1] = auth.uid()::text);

select 'DONE v33 library and materials' as status;
