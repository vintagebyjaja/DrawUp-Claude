-- DrawUp v25-01: AI Design Team messages. Teammate, 6th Man and Arch Coach share the existing Arch Coach
-- threads (coach_threads / coach_messages), so there is one conversation history, not three.
-- New columns only; existing Arch Coach messages keep working (speaker null = Arch Coach).
-- Additive and safe to run twice.
alter table public.coach_threads add column if not exists team boolean not null default false;
alter table public.coach_messages add column if not exists speaker text;
alter table public.coach_messages add column if not exists status text;
alter table public.coach_messages add column if not exists client_request_id text;
alter table public.coach_messages add column if not exists reply_to uuid references public.coach_messages(id) on delete set null;
alter table public.coach_messages add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.coach_messages add column if not exists updated_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'coach_messages_speaker_check') then
    alter table public.coach_messages add constraint coach_messages_speaker_check
      check (speaker is null or speaker in ('teammate','sixth_man','coach','system'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coach_messages_status_check') then
    alter table public.coach_messages add constraint coach_messages_status_check
      check (status is null or status in ('streaming','done','stopped','failed'));
  end if;
end $$;

-- A retried send (same request id in the same thread) is recognised, so it is never answered or charged twice.
create unique index if not exists coach_messages_request_uniq on public.coach_messages (thread_id, client_request_id) where client_request_id is not null;
create index if not exists coach_messages_reply_idx on public.coach_messages (reply_to) where reply_to is not null;
create index if not exists coach_threads_team_idx on public.coach_threads (owner_id, team, updated_at desc);

select 'DONE v25-01 team messages' as status;
