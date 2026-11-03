-- DrawUp v24-01: Arch Coach attachments. Each message can list the pictures / PDFs / text files attached to it.
-- The files live in the private bucket drawup-private under <user id>/coach/<thread id>/ (existing owner-folder policies).
-- Additive and safe to run twice.
alter table public.coach_messages add column if not exists attachments jsonb not null default '[]'::jsonb;
select 'DONE v24-01 coach attachments' as status;
