# DrawUp v23: Quick Check, faster Check, Cloudflare

## What's new
- **Quick Check is back as one step.** It sits at the top of the Check tab, and `#portal/check?quick=1` jumps straight to it. You upload an image, PNG, JPG or PDF set (up to 12 pages) and pick a sheet template. Press **Check it** and you get:
  1. **Find the flaws.** Each problem shows up while it is being written.
  2. **Understand the fix.** For each problem you get what's wrong, why it matters and the change to make.
  3. **On your template.** Your drawing is placed on the template you picked with each fix drawn in green, and the revisions are listed in the title block. You can switch the view between Corrected, Redlines + fixes and Original, and download the result as a PDF.
- **Templates:** DrawUp ARCH D (36×24), ARCH E1 (42×30), Tabloid (11×17), Letter, or **My template**, where you upload your own blank sheet with your title block (PDF/PNG/JPG) and say whether the title block is on the right or the bottom. DrawUp saves it for next time.
- **Why Check was slow, and the fix.** Your current Check reviews one sheet at a time. Each sheet is a separate OpenAI background job running on the slower default reasoning effort, and the page only moves on to the next sheet when it polls. The progress screen also never showed findings until every sheet was done, so a 3-page set could sit at 90% with "Nothing written yet" for many minutes. Quick Check skips all of that: the page turns each sheet into images (plus close-up quarters so small text is readable), and the answer streams straight back on the same request, so there is no queue and no polling. It uses a faster model (gpt-5-mini, falling back to gpt-5) with low reasoning effort. On the test setup the first problem showed up in about 2 to 3 seconds. Real OpenAI timing will be longer, so expect roughly a minute for a few sheets.
- **The full Check is faster too.** Your sheet-by-sheet review now uses low reasoning effort per sheet and no web search by default, and its progress screen shows each sheet's findings as soon as that sheet is done.
- **Safety:** if you close the page in the middle of a Quick Check, the check is marked failed and your credits are refunded after 15 minutes, so it can't hang forever. If an answer gets cut off, the problems found so far are kept and you are not charged.
- Every Quick Check is saved in **Your checks**, so it opens later in the full viewer.

## Files
**This build is made on top of your current GitHub code** (DrawUp-Claude-cloudflare-migration.zip): your sheet-by-sheet Check, Project Studio, swap and HQ changes and your Cloudflare setup are all kept. DrawUp-v23-changed-files.zip uses your repo's folder layout; copy each file over your repo.

New (add):
- public/drawup-check-quick-v23.js
- public/drawup-check-quick-v23.css
- src/app/api/check/quick/route.ts
- src/lib/drawup-check-core.ts (the Check schema and parsers, now shared by both Check routes)

Changed (replace; each is your current file plus the v23 edits):
- public/drawup-preview.html: 2 new lines after the drawup-check-v22.js tag (Quick Check), and that tag is bumped to ?v=23.0 so browsers load the new copy. Your Project Studio, swap and HQ tags are unchanged.
- src/app/api/check/route.ts: your sheet-by-sheet review is kept. Each sheet now uses low reasoning effort (it was on the slower default), with a retry without it if a model refuses. Web search is off for drawing sets unless DRAWUP_CHECK_WEB_SEARCH=on. A Quick Check whose page was closed is refunded after 15 minutes (sheet-by-sheet reviews are never touched by that).
- public/drawup-check-v22.js: the progress screen of the sheet-by-sheet Check now shows "Reviewing sheet 2 of 3 · 4 findings so far" and lists findings as each sheet finishes, instead of "Nothing written yet" until the very end. The time estimate is now about a minute a sheet instead of 9 seconds.
- package.json: next ^16.4.2 (the Cloudflare adapter you use needs 16.4.1 or newer), eslint-config-next ^16.4.2, wrangler ^4.151.0. Your scripts are unchanged.
- .gitignore: ignores .open-next, .wrangler, .dev.vars

Not changed: your wrangler.jsonc (Worker "drawup-aec") and open-next.config.ts are fine as they are.

## SQL
None new. Quick Check uses your existing check_reviews table. (Your own 0051_check_sheet_progress.sql must already be applied, which it is if the sheet-by-sheet Check runs.)

## Cloudflare settings
- Keep your current build and deploy commands (`npm run build:cloudflare`, `npm run deploy:cloudflare`).
- **Use the Workers Paid plan.** The Free plan gives each request 10 ms of CPU, which Check cannot fit in: reading a PDF with pdf-lib for each sheet and sending pages to the AI takes far longer. On Free, sheet reviews can be cut off silently and restart, which looks exactly like sitting at 90% with nothing written. Paid gives 30 seconds per request.
- Secrets (Worker → Settings → Variables and Secrets, type Secret): OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET if used.
- Variables, set both as Build variables and as runtime Variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).
- Optional: DRAWUP_CHECK_QUICK_MODEL (default gpt-5-mini, then gpt-5), DRAWUP_CHECK_QUICK_EFFORT (minimal / low / medium, default low), DRAWUP_CHECK_EFFORT (per-sheet effort for the full check, default low), DRAWUP_CHECK_WEB_SEARCH=on.
- In Supabase Auth → URL Configuration, add your Cloudflare address to the allowed redirect URLs if sign-in links still go to Netlify.

## Tested
- Built on your current code: TypeScript check is clean, the OpenNext Cloudflare build passes with your wrangler.jsonc, and Quick Check ran end to end on the local Cloudflare runtime.
- Browser tests against a stand-in AI and a stand-in database covered: PDF on ARCH D, PNG on Letter, PDF + PNG on your own uploaded template at phone width (390px), a cut-off answer (the problems found so far were kept and the credits refunded), an unavailable model (it fell back to gpt-5), and a stuck row (marked failed and refunded).
- A sheet-by-sheet review sitting between sheets is left alone by the new stuck-check cleanup.
- Not tested: real OpenAI output and timing, and your live Supabase. Run one Quick Check on the Henrico set after you deploy.
