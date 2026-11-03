\set ON_ERROR_STOP on
\i stub.sql
\i ../../../supabase/migrations/0076_project_intelligence.sql
\i ../../../supabase/migrations/0076_project_intelligence.sql
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111"}', false);
insert into public.project_profiles(project_thread_id, fields) values ('aaaaaaaa-0000-4000-8000-000000000001', '{"county":{"v":"Mecklenburg County","by":"auto","src":"Census"}}');
update public.project_profiles set fields = fields || '{"county":{"v":"Mecklenburg County, North Carolina","by":"auto"},"owner_name":{"v":"Queen City Housing","by":"user"}}' where project_thread_id='aaaaaaaa-0000-4000-8000-000000000001';
select 'T1 rev after one change = 2: ' || (select rev from public.project_profiles where project_thread_id='aaaaaaaa-0000-4000-8000-000000000001');
select 'T2 change rows = 2: ' || count(*) from public.project_profile_changes;
update public.project_profiles set fields = fields where project_thread_id='aaaaaaaa-0000-4000-8000-000000000001';
select 'T3 no-op update keeps rev 2: ' || (select rev from public.project_profiles where project_thread_id='aaaaaaaa-0000-4000-8000-000000000001');
do $$ begin
  begin insert into public.project_profiles(project_thread_id) values ('aaaaaaaa-0000-4000-8000-000000000002'); raise exception 'T4 FAIL: wrote to another member''s project';
  exception when insufficient_privilege then raise notice 'T4 PASS: cannot write another member''s project'; end;
end $$;
insert into public.project_profiles(project_thread_id) values ('aaaaaaaa-0000-4000-8000-000000000003');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222"}', false);
select 'T5 other member sees 0 profiles: ' || count(*) from public.project_profiles;
select 'T6 other member sees 0 changes: ' || count(*) from public.project_profile_changes;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333"}', false);
select 'T7 firm member sees the firm project only (1): ' || count(*) from public.project_profiles;
update public.project_profiles set fields = '{"zoning_district":{"v":"UR-2","by":"user"}}' where project_thread_id='aaaaaaaa-0000-4000-8000-000000000003';
select 'T8 firm member can edit firm project info: ' || (select fields->'zoning_district'->>'v' from public.project_profiles where project_thread_id='aaaaaaaa-0000-4000-8000-000000000003');
