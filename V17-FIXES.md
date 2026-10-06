# DrawUp V17 — sign in, profile persistence, Portal, live data

V17 builds on V16.3. It does not rebuild the homepage: the hero, holograms, courts,
moving lights and every `<style>` block in `public/drawup-preview.html` are byte-identical
to V16.3.

## What was actually wrong

1. **The Portal script crashed on every page load.** `public/v1311-portal.js` looked for a
   `#du-exit-portal` button that does not exist, which aborted its startup before it
   connected to Supabase. Session restore after refresh, sign out, and saving from
   onboarding all depended on that startup.
2. **Every "fix" since V15 never ran.** The V15–V16.2 patches were appended after the
   script's closing `})();`, outside the scope they patched, so the browser stopped at
   `openPortalTab is not defined`. Portal search, the native Arch Coach, the profile edit
   modals and the Athletic Storage starter project were all in the file but dead.
3. **A slow profile load looked like a new member.** The old code gave the profile query
   1.8 seconds; if it was slower it treated the member as brand new and showed onboarding.
4. **Any member could make themselves founder.** The profiles update policy let a member
   set their own `account_type`, `is_admin` and verification flags, which opens every
   `is_drawup_admin()` gate. Campus/organization managers and students included.
5. **Arch Coach threads could never load.** The 0004 policies on `coach_threads` and
   `thread_participants` referenced each other ("infinite recursion detected in policy").
6. **Email-confirmation links dropped the sign-in token.** The homepage iframe did not pass
   the address-bar `#access_token…` to the page that runs DrawUp.

## What changed

| File | Change |
|---|---|
| `public/drawup-portal-v17.js` | New single-scope Portal (replaces `v1311-portal.js`, which is kept but no longer loaded). Sign-in/restore/sign-out, onboarding that saves each step, Profile with add/edit/delete for work experience and education, Projects (create/edit/delete, saved to `project_threads`), the Athletic Storage starter project (3 steps, progress saved per member), Arch Coach threads/messages saved to `coach_threads`/`coach_messages` and linkable to a project, database search, Details, Firm, Team, Account. |
| `public/drawup-live-v17.js` | Public site firm/project lists, firm and project profile pages, and "Add a firm" (→ `firm_submissions`) read from Supabase. `is_demo` rows are never shown. |
| `public/drawup-v17.css` | Styles for the new screens only. |
| `public/drawup-preview.html` | Fake roster (Atlas & Finch, Example Studio A …, 555 phone numbers) and hard-coded project cards/images replaced by live containers; public search checks the DrawUp database first and labels web research as unverified; Check and Swap say plainly they are not live yet. Hero untouched. |
| `src/app/page.tsx` | Passes the URL hash/query into the iframe (email confirmation + `#portal/<tab>` deep links). |
| `src/app/api/arch-coach/route.ts` | Requires a signed-in Supabase session. |
| `src/app/api/profile-sync/route.ts` | Only accepts member-editable fields (it writes with the service role). |
| `supabase/migrations/0020_…sql` | **Required.** Additive and idempotent. See the header of the file. |
| `supabase/migrations/0021_…sql` | **Optional.** Imports the 216 real firm names that used to be hard-coded on Connect as unverified listings. |

## Deploy

1. Supabase → SQL editor: run `0020_v17_auth_profile_portal_foundation.sql`. Optional: `0021_optional_import_listed_firm_names.sql`.
2. Push this folder to the GitHub repo Netlify deploys from (same env vars as before:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`).
3. Supabase → Authentication → URL Configuration: Site URL = your live domain, and add it to Redirect URLs.
