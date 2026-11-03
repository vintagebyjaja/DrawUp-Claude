\set ON_ERROR_STOP on
\i stub.sql
\i ../../../supabase/migrations/0078_checkup_reviews.sql
\i ../../../supabase/migrations/0078_checkup_reviews.sql
set role authenticated;
-- the owner of the project (see stub.sql): makes both kinds of review
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111"}', false);
insert into public.spec_reviews(project_thread_id, kind, title, document_title, summary, findings)
  values ('aaaaaaaa-0000-4000-8000-000000000003', 'specs', 'Specifications review — Project Manual', 'Project Manual', '6 items to settle', '[{"id":"open-item:s2","severity":"major"}]'::jsonb)
  returning 'T1 specifications review saved: ' || title;
insert into public.spec_reviews(project_thread_id, kind, title, score, summary)
  values ('aaaaaaaa-0000-4000-8000-000000000003', 'dd_readiness', 'DD readiness — Queen City', 62, '8 of 14 items not settled')
  returning 'T2 readiness saved with an advisory score: ' || score;
do $$ begin
  begin insert into public.spec_reviews(kind, title) values ('something_else', 'Bad kind'); raise exception 'T3 FAIL: an unknown kind was accepted';
  exception when check_violation then raise notice 'T3 PASS: only specs and dd_readiness are accepted'; end;
  begin insert into public.spec_reviews(kind, title, score) values ('specs', 'Bad score', 140); raise exception 'T4 FAIL: a score over 100 was accepted';
  exception when check_violation then raise notice 'T4 PASS: a score must be 0-100'; end;
end $$;
-- a member of the project's firm can read it but not change it
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333"}', false);
select 'T5 firm member can read the project reviews: ' || count(*) from public.spec_reviews;
do $$ begin
  begin update public.spec_reviews set summary = 'hijack';
    if (select count(*) from public.spec_reviews where summary = 'hijack') > 0 then raise exception 'T6 FAIL: another member changed a review'; end if;
    raise notice 'T6 PASS: another member cannot change a review (0 rows)';
  exception when insufficient_privilege then raise notice 'T6 PASS: another member cannot change a review'; end;
  begin delete from public.spec_reviews;
    if (select count(*) from public.spec_reviews) = 0 then raise exception 'T7 FAIL: another member deleted the reviews'; end if;
    raise notice 'T7 PASS: another member cannot delete a review';
  exception when insufficient_privilege then raise notice 'T7 PASS: another member cannot delete a review'; end;
end $$;
-- someone with no connection to the project sees nothing
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222"}', false);
select 'T8 unrelated member sees no reviews: ' || count(*) from public.spec_reviews;
-- the owner's update bumps updated_at
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111"}', false);
update public.spec_reviews set summary = '3 items to settle' where kind = 'specs';
select 'T9 owner can re-run a review and updated_at moves: ' || (updated_at > created_at) from public.spec_reviews where kind = 'specs';
