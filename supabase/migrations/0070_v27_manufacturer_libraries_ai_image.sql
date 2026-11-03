-- DrawUp v27 update 2 (migration 0070, SQL v27-02). Run after v27-01. Additive and safe to run twice.
-- Jaja (2026-10-27): use manufacturers architects actually specify, use BIMobject, stay away from RevitCity.
--  * vdi_manufacturer_sources gets kind (manufacturer | platform | blocked) and classes (which assembly types each covers, so a
--    slab review searches Stego, W. R. MEADOWS, GCP... and a window review searches Andersen, Pella, Marvin...).
--  * 46 manufacturer sites commonly specified in US practice are approved as LINK + METADATA ONLY: DrawUp searches their public
--    pages, stores title / product / region / revision / link, and always opens the original. It never downloads, stores,
--    redraws or relabels their drawings. Copying any of their files into DrawUp would need that manufacturer's permission.
--  * BIMobject is approved as a platform, link only. Its terms (business.bimobject.com/terms-of-service-eula, effective
--    2024-09-27, read 2026-10-27) let professionals use objects in their own project documents, but forbid redistributing
--    content, building it into a product for third parties (4.7 f, g) and training AI on it (4.7 j). So DrawUp only links
--    to BIMobject product pages; members download from BIMobject themselves, under BIMobject's terms.
--  * RevitCity and other sites where anyone can upload models are BLOCKED (also blocked in code: BLOCKED_HOSTS).
--  * vdi_reviews gets ai_image_ref_path (the render of DrawUp's own 3D model the AI illustration must follow) and
--    ai_image_check (the automatic comparison of the illustration with that model).

alter table public.vdi_reviews add column if not exists ai_image_ref_path text;
alter table public.vdi_reviews add column if not exists ai_image_check jsonb;

alter table public.vdi_manufacturer_sources add column if not exists kind text not null default 'manufacturer';
alter table public.vdi_manufacturer_sources add column if not exists classes text[] not null default '{}';
alter table public.vdi_manufacturer_sources drop constraint if exists vdi_manufacturer_sources_kind_check;
alter table public.vdi_manufacturer_sources add constraint vdi_manufacturer_sources_kind_check check (kind in ('manufacturer', 'platform', 'blocked'));
alter table public.vdi_manufacturer_sources drop constraint if exists vdi_manufacturer_sources_license_status_check;
alter table public.vdi_manufacturer_sources add constraint vdi_manufacturer_sources_license_status_check check (license_status in ('link_only', 'metadata_only', 'redistribution_permitted', 'permission_requested', 'licensed', 'blocked'));
create index if not exists vdi_sources_classes_idx on public.vdi_manufacturer_sources using gin (classes);

-- BIMobject: platform, link only
insert into public.vdi_manufacturer_sources (manufacturer, domain, library_url, regions, kind, classes, license_status, license_terms_url, license_summary, approved, approved_note) values
  ('BIMobject', 'bimobject.com', 'https://www.bimobject.com', '{}', 'platform', '{}', 'link_only', 'https://business.bimobject.com/terms-of-service-eula',
   'Manufacturer BIM content platform. Professionals may use objects in their own project documents. Redistribution, building content into a product for third parties and AI training are not allowed. DrawUp links to BIMobject product pages only.', true, 'Terms read 2026-10-27. Link only.')
on conflict (domain) do update set kind = excluded.kind, license_status = excluded.license_status, license_terms_url = excluded.license_terms_url, license_summary = excluded.license_summary, approved = true, approved_note = excluded.approved_note, updated_at = now();

-- James Hardie NZ (approved in v27-01) covers walls
update public.vdi_manufacturer_sources set classes = '{exterior_walls,envelope_transitions}', kind = 'manufacturer' where domain = 'jameshardie.co.nz';

-- Manufacturers commonly specified in US practice: link + metadata only
insert into public.vdi_manufacturer_sources (manufacturer, domain, classes, regions, kind) values
  ('James Hardie (US)', 'jameshardie.com', '{exterior_walls,envelope_transitions}', '{United States}', 'manufacturer'),
  ('LP Building Solutions', 'lpcorp.com', '{exterior_walls,roofs}', '{United States}', 'manufacturer'),
  ('Nichiha', 'nichiha.com', '{exterior_walls}', '{United States}', 'manufacturer'),
  ('Sto Corp', 'stocorp.com', '{exterior_walls,envelope_transitions}', '{United States}', 'manufacturer'),
  ('Dryvit', 'dryvit.com', '{exterior_walls,envelope_transitions}', '{United States}', 'manufacturer'),
  ('DuPont (Tyvek, Styrofoam)', 'dupont.com', '{exterior_walls,envelope_transitions,windows,thermal_insulation}', '{}', 'manufacturer'),
  ('Huber (ZIP System, AdvanTech)', 'huberwood.com', '{exterior_walls,roofs,envelope_transitions}', '{United States}', 'manufacturer'),
  ('Henry', 'henry.com', '{envelope_transitions,waterproofing,roofs,exterior_walls}', '{United States}', 'manufacturer'),
  ('PROSOCO', 'prosoco.com', '{envelope_transitions,waterproofing,exterior_walls,windows}', '{United States}', 'manufacturer'),
  ('Carlisle Construction Materials', 'carlisleccm.com', '{roofs,parapets,waterproofing,envelope_transitions,foundations}', '{United States}', 'manufacturer'),
  ('Carlisle SynTec', 'carlislesyntec.com', '{roofs,parapets}', '{United States}', 'manufacturer'),
  ('GCP Applied Technologies (Saint-Gobain)', 'gcpat.com', '{waterproofing,foundations,slabs,envelope_transitions,windows}', '{}', 'manufacturer'),
  ('Tremco Sealants', 'tremcosealants.com', '{envelope_transitions,waterproofing,curtain_walls,windows}', '{United States}', 'manufacturer'),
  ('Tremco Roofing', 'tremcoroofing.com', '{roofs,parapets}', '{United States}', 'manufacturer'),
  ('Sika', 'sika.com', '{waterproofing,roofs,parapets,foundations,slabs,envelope_transitions}', '{}', 'manufacturer'),
  ('W. R. MEADOWS', 'wrmeadows.com', '{slabs,foundations,waterproofing,envelope_transitions}', '{United States}', 'manufacturer'),
  ('Stego Industries', 'stegoindustries.com', '{slabs,foundations}', '{United States}', 'manufacturer'),
  ('GAF', 'gaf.com', '{roofs,parapets}', '{United States}', 'manufacturer'),
  ('Owens Corning', 'owenscorning.com', '{roofs,thermal_insulation,exterior_walls}', '{United States}', 'manufacturer'),
  ('CertainTeed', 'certainteed.com', '{roofs,exterior_walls,interior_partitions,thermal_insulation,fire_rated_assemblies}', '{United States}', 'manufacturer'),
  ('Holcim Elevate (Firestone)', 'holcimelevate.com', '{roofs,parapets}', '{United States}', 'manufacturer'),
  ('Johns Manville', 'jm.com', '{roofs,thermal_insulation}', '{United States}', 'manufacturer'),
  ('ROCKWOOL', 'rockwool.com', '{thermal_insulation,fire_rated_assemblies,exterior_walls,roofs}', '{}', 'manufacturer'),
  ('Kingspan', 'kingspan.com', '{thermal_insulation,exterior_walls,roofs}', '{}', 'manufacturer'),
  ('Knauf Insulation', 'knaufnorthamerica.com', '{thermal_insulation}', '{United States}', 'manufacturer'),
  ('USG', 'usg.com', '{interior_partitions,fire_rated_assemblies,exterior_walls}', '{United States}', 'manufacturer'),
  ('National Gypsum', 'nationalgypsum.com', '{interior_partitions,fire_rated_assemblies}', '{United States}', 'manufacturer'),
  ('Georgia-Pacific Gypsum (DensGlass)', 'buildgp.com', '{interior_partitions,exterior_walls,fire_rated_assemblies}', '{United States}', 'manufacturer'),
  ('ClarkDietrich', 'clarkdietrich.com', '{interior_partitions,exterior_walls,structural_connections}', '{United States}', 'manufacturer'),
  ('Simpson Strong-Tie', 'strongtie.com', '{structural_connections,foundations}', '{United States}', 'manufacturer'),
  ('Hilti', 'hilti.com', '{structural_connections,fire_rated_assemblies}', '{}', 'manufacturer'),
  ('MiTek', 'mitek-us.com', '{structural_connections,roofs}', '{United States}', 'manufacturer'),
  ('Andersen Windows & Doors', 'andersenwindows.com', '{windows,doors}', '{United States}', 'manufacturer'),
  ('Pella', 'pella.com', '{windows,doors}', '{United States}', 'manufacturer'),
  ('Marvin', 'marvin.com', '{windows,doors}', '{United States}', 'manufacturer'),
  ('Kawneer', 'kawneer.com', '{curtain_walls,windows,doors}', '{}', 'manufacturer'),
  ('YKK AP', 'ykkap.com', '{curtain_walls,windows,doors}', '{United States}', 'manufacturer'),
  ('Hohmann & Barnard', 'h-b.com', '{exterior_walls,envelope_transitions}', '{United States}', 'manufacturer'),
  ('Mortar Net Solutions', 'mortarnet.com', '{exterior_walls,envelope_transitions}', '{United States}', 'manufacturer'),
  ('Metal-Era', 'metalera.com', '{parapets,roofs}', '{United States}', 'manufacturer'),
  ('3M (fire protection, air barriers)', '3m.com', '{fire_rated_assemblies,envelope_transitions}', '{}', 'manufacturer'),
  ('Specified Technologies (STI)', 'stifirestop.com', '{fire_rated_assemblies}', '{United States}', 'manufacturer'),
  ('Dow (DOWSIL sealants)', 'dow.com', '{envelope_transitions,curtain_walls,windows}', '{}', 'manufacturer'),
  ('Pecora', 'pecora.com', '{envelope_transitions,curtain_walls,windows}', '{United States}', 'manufacturer'),
  ('Schluter Systems', 'schluter.com', '{waterproofing,interior_partitions}', '{}', 'manufacturer'),
  ('LATICRETE', 'laticrete.com', '{waterproofing,interior_partitions}', '{}', 'manufacturer')
on conflict (domain) do update set manufacturer = excluded.manufacturer, classes = excluded.classes, regions = excluded.regions, kind = 'manufacturer', updated_at = now();
update public.vdi_manufacturer_sources set approved = true, license_status = 'link_only',
  license_summary = coalesce(license_summary, 'Public manufacturer website. DrawUp stores the title, product, region, revision and link only, and opens the original. It does not copy, store or redraw the manufacturer''s drawings.'),
  approved_note = coalesce(approved_note, 'Approved 2026-10-27 as link + metadata only (Jaja: use manufacturers architects actually specify).'), updated_at = now()
where kind = 'manufacturer' and license_status in ('link_only', 'metadata_only') and domain <> 'jameshardie.co.nz';

-- Never sources: user-upload model sites
insert into public.vdi_manufacturer_sources (manufacturer, domain, kind) values
  ('revitcity.com', 'revitcity.com', 'blocked'),
  ('3dwarehouse.sketchup.com', '3dwarehouse.sketchup.com', 'blocked'),
  ('grabcad.com', 'grabcad.com', 'blocked'),
  ('bibliocad.com', 'bibliocad.com', 'blocked'),
  ('cadblocksfree.com', 'cadblocksfree.com', 'blocked'),
  ('cad-blocks.net', 'cad-blocks.net', 'blocked'),
  ('dwgmodels.com', 'dwgmodels.com', 'blocked'),
  ('cadforum.cz', 'cadforum.cz', 'blocked'),
  ('free-cad-blocks.com', 'free-cad-blocks.com', 'blocked'),
  ('turbosquid.com', 'turbosquid.com', 'blocked'),
  ('cgtrader.com', 'cgtrader.com', 'blocked'),
  ('sketchfab.com', 'sketchfab.com', 'blocked')
on conflict (domain) do update set kind = 'blocked', updated_at = now();
update public.vdi_manufacturer_sources set approved = false, license_status = 'blocked', approved_note = 'Blocked: anyone can upload models here; not manufacturer content.', updated_at = now() where kind = 'blocked';
delete from public.vdi_manufacturer_refs r using public.vdi_manufacturer_sources s where s.kind = 'blocked' and (r.url ilike '%://' || s.domain || '/%' or r.url ilike '%.' || s.domain || '/%');
