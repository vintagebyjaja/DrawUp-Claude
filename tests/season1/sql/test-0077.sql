\set ON_ERROR_STOP on
\i stub.sql
\i ../../../supabase/migrations/0077_document_studio.sql
\i ../../../supabase/migrations/0077_document_studio.sql
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111"}', false);
insert into public.project_documents(title, doc_type, project_thread_id) values ('Letter to owner','letter','aaaaaaaa-0000-4000-8000-000000000003') returning 'T1 own document created: ' || title;
insert into public.document_versions(store, document_id, title, sections) select 'project', id, title, '[]'::jsonb from public.project_documents returning 'T2 version saved';
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333"}', false);
select 'T3 firm member can read a firm project document: ' || count(*) from public.project_documents;
do $$ begin
  begin update public.project_documents set title='hijack'; if (select count(*) from public.project_documents where title='hijack') > 0 then raise exception 'T4 FAIL: another member changed it'; end if;
    raise notice 'T4 PASS: another member cannot change it (0 rows)';
  exception when insufficient_privilege then raise notice 'T4 PASS: another member cannot change it'; end;
end $$;
select 'T5 firm member cannot read the owner''s versions: ' || count(*) from public.document_versions;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222"}', false);
select 'T6 unrelated member sees no documents: ' || count(*) from public.project_documents;
