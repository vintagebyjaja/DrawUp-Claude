DRAWUP V21.2 — ARCH COACH BACKGROUND COMPLETION + NOTIFICATIONS

WHAT THIS DOES
- Keeps a successful Quick Answer permanently instead of letting a later full-answer failure erase it.
- Lets simple/sufficient Quick Answers end immediately (the prior 3-file fix is included here).
- For deeper questions, the OpenAI background response continues even if the page's live waiting window ends.
- Persists a durable Arch Coach job in Supabase.
- In Portal threads, saves the Quick Answer immediately as the assistant message, then replaces/expands that SAME message when the full answer is ready.
- Creates an in-app notification when a background answer completes (or when deeper verification fails while the Quick Answer remains saved).
- On the user's next DrawUp visit, unfinished jobs are reconciled before notifications are shown, so this works even without a hosting cron.
- Includes an optional Vercel cron config to reconcile jobs every minute while the user is away.

INSTALL
1) Run this SQL ONCE in Supabase SQL Editor:
   supabase/migrations/0042_arch_coach_background_answers.sql

2) Replace/add these project files at the exact paths shown:
   src/app/api/arch-coach/route.ts
   src/app/api/arch-coach/reconcile/route.ts   (NEW)
   src/lib/drawup-quick.ts
   public/drawup-v20.js
   public/drawup-portal-v17.js

3) OPTIONAL SCHEDULER:
   vercel.json is included for Vercel deployments. Set CRON_SECRET in the host environment.
   If you are not on Vercel, you can omit vercel.json. The system still reconciles a user's jobs automatically on their next DrawUp visit. A host scheduler can also call GET /api/arch-coach/reconcile with Authorization: Bearer <CRON_SECRET>.

IMPORTANT
- Do not cancel a job just because the browser stopped waiting. That was the old behavior that prevented true background completion.
- Browser/system notifications are only mirrored if the user has already granted notification permission. DrawUp does not force a permission prompt. The in-app notification works independently.
- Portal answers are durable because they have a coach thread/message to update. Public/guest questions still get durable job + notification state; their Quick Answer remains on-screen for the current session, while completed background state is retained in arch_coach_jobs.
