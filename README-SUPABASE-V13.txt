DRAWUP V13 — SUPABASE
1) Run migrations 0015 then 0016 in the existing DrawUp Supabase project (after prior migrations).
2) Deploy supabase/functions/arch-coach and supabase/functions/drawup-search.
3) Keep OPENAI_API_KEY in Supabase Secrets. Optional OPENAI_MODEL / OPENAI_SEARCH_MODEL may override the default.
4) Follow V13-PRODUCTION-SETUP.md to promote your signed-in account to founder and fill your public profile.
5) Test Arch Coach and Search after deployment. Failed Arch Coach AI requests now attempt to refund the reserved DrawUp credits/guest question.
