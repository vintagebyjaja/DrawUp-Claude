-- DrawUp v24-07: one call returns the badge for many details at once (comment counts by verdict and the
-- architects who verified it), so the library shows "Verified by an architect" on each card. Safe to run twice.
create or replace function public.detail_review_summary(p_keys text[])
returns table (detail_key text, comments integer, correct integer, conditional integer, incorrect integer,
               verified integer, verified_with_conditions integer, verified_by text[])
language sql
stable
security definer
set search_path = public
as $$
  with k as (select distinct unnest(p_keys[1:500]) as detail_key)
  select k.detail_key,
    (select count(*) from detail_comments c where c.detail_key = k.detail_key and not c.hidden)::int,
    (select count(*) from detail_comments c where c.detail_key = k.detail_key and not c.hidden and c.verdict = 'correct')::int,
    (select count(*) from detail_comments c where c.detail_key = k.detail_key and not c.hidden and c.verdict = 'conditional')::int,
    (select count(*) from detail_comments c where c.detail_key = k.detail_key and not c.hidden and c.verdict = 'incorrect')::int,
    (select count(*) from detail_verifications v where v.detail_key = k.detail_key)::int,
    (select count(*) from detail_verifications v where v.detail_key = k.detail_key and v.scope = 'with_conditions')::int,
    (select coalesce(array_agg(v.architect_name || coalesce(' (' || v.license_state || ')', '') order by v.created_at), array[]::text[]) from detail_verifications v where v.detail_key = k.detail_key)
  from k
$$;
grant execute on function public.detail_review_summary(text[]) to anon, authenticated;
select 'DONE v24-07 detail review summary' as status;
