-- DrawUp V20 Swap threads, file 2 of 3: new columns on swap_generations.
-- Additive and idempotent. Nothing is dropped or wiped. Safe to run again.
-- thread_id links a result to its thread, area is the part of the image to change
-- (for example Floor), mask_path is the brushed mask PNG in the member private folder,
-- started_at is set by the server when generation starts (for the two minute limit).

alter table public.swap_generations add column if not exists thread_id uuid references public.swap_threads(id) on delete set null;
alter table public.swap_generations add column if not exists area text;
alter table public.swap_generations add column if not exists mask_path text;
alter table public.swap_generations add column if not exists started_at timestamptz;

create index if not exists swap_generations_thread_idx
  on public.swap_generations (thread_id, created_at);

-- Extra rules for new rows (restrictive policies only narrow what members can insert).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'swap_generations' and policyname = 'swap v20 insert limits') then
    create policy "swap v20 insert limits" on public.swap_generations as restrictive for insert to authenticated
      with check (
        started_at is null
        and (mask_path is null or storage_path_is_own(mask_path))
        and (area is null or char_length(area) <= 120)
        and (thread_id is null or exists (select 1 from public.swap_threads t where t.id = thread_id and t.owner_id = auth.uid()))
      );
  end if;
end $$;

select 'V20 SWAP FILE 2 DONE' as status;
-- END-OF-V20-SWAP-FILE-2
