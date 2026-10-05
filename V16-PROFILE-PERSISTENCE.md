# DrawUp V16

Carries forward V15.11.1 including the Athletic Storage starter project, DrawUp-ready starter details, Real AEC discovery, and homepage CTA hotfix.

V16 fixes profile persistence/editing:
- Work experience and education read through authenticated `/api/profile-sync` rather than depending on browser RLS timing.
- Profile sync GET returns profile + education + career with no-store caching.
- Profile sync POST accepts one or multiple education/career records and returns database errors instead of silently swallowing them.
- Overview Work Experience and Education cards open their editors reliably.
- Signed-in email is shown separately from public username during onboarding.
- Existing username owned by the current user resolves immediately; username checks debounce at 120ms.
- Onboarding completion and history save through the same server-backed request.

Run Supabase migration `0018_v16_profile_history_reliability.sql` in production before/with this frontend deployment.
