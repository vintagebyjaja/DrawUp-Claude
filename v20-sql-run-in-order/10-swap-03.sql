-- DrawUp V20 Swap threads, file 3 of 3: row level security policies.
-- Additive and idempotent. Nothing is dropped or wiped. Safe to run again.
-- Members see and change only their own swap threads and messages. No admin access is added.

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'swap_threads' and policyname = 'swap thread owner read') then
    create policy "swap thread owner read" on public.swap_threads for select to authenticated
      using (owner_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'swap_threads' and policyname = 'swap thread owner create') then
    create policy "swap thread owner create" on public.swap_threads for insert to authenticated
      with check (owner_id = auth.uid() and storage_path_is_own(source_path));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'swap_threads' and policyname = 'swap thread owner update') then
    create policy "swap thread owner update" on public.swap_threads for update to authenticated
      using (owner_id = auth.uid())
      with check (owner_id = auth.uid() and storage_path_is_own(source_path));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'swap_threads' and policyname = 'swap thread owner delete') then
    create policy "swap thread owner delete" on public.swap_threads for delete to authenticated
      using (owner_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'swap_messages' and policyname = 'swap message owner read') then
    create policy "swap message owner read" on public.swap_messages for select to authenticated
      using (owner_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'swap_messages' and policyname = 'swap message owner create') then
    create policy "swap message owner create" on public.swap_messages for insert to authenticated
      with check (
        owner_id = auth.uid()
        and exists (select 1 from public.swap_threads t where t.id = thread_id and t.owner_id = auth.uid())
        and (image_path is null or storage_path_is_own(image_path))
        and (generation_id is null or exists (select 1 from public.swap_generations g where g.id = generation_id and g.owner_id = auth.uid()))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'swap_messages' and policyname = 'swap message owner delete') then
    create policy "swap message owner delete" on public.swap_messages for delete to authenticated
      using (owner_id = auth.uid());
  end if;
end $$;

select 'V20 SWAP FILE 3 DONE' as status;
-- END-OF-V20-SWAP-FILE-3
