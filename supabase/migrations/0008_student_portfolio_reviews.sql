-- DrawUp V8: Student portfolio review foundation
create table if not exists public.portfolio_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  discipline text not null check (discipline in ('architecture','interior_design')),
  file_path text not null,
  file_name text not null,
  file_size_bytes bigint,
  status text not null default 'submitted' check (status in ('submitted','reviewing','complete','failed')),
  feedback jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.portfolio_reviews enable row level security;
create policy "Users can read own portfolio reviews" on public.portfolio_reviews for select using (auth.uid() = user_id);
create policy "Users can create own portfolio reviews" on public.portfolio_reviews for insert with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-portfolios','student-portfolios',false,20971520,array['application/pdf'])
on conflict (id) do update set public=false, file_size_limit=20971520, allowed_mime_types=array['application/pdf'];

create policy "Users upload own portfolio PDFs" on storage.objects for insert to authenticated
with check (bucket_id='student-portfolios' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users read own portfolio PDFs" on storage.objects for select to authenticated
using (bucket_id='student-portfolios' and (storage.foldername(name))[1] = auth.uid()::text);
