DRAWUP v22 SHEET-BY-SHEET PROGRESS PATCH
========================================
Based on the uploaded DrawUp-v22.zip. This is NOT the previous 90-minute timeout hotfix.

INSTALL (source code deployment, not a Netlify drag-and-drop static build):
1. Back up the existing DrawUp v22 repository and Supabase database.
2. In Supabase SQL Editor, run supabase/migrations/0051_check_sheet_progress.sql.
   Existing v22 migration 0046 must already be installed.
3. Replace src/app/api/check/route.ts in your existing source repository with the supplied file.
4. Add "pdf-lib": "^1.17.1" to dependencies in package.json.
5. Run npm install (regenerates your lockfile if one is used), npm run build, then deploy.
6. Start a NEW plan-set review. Existing in-progress reviews use the legacy job path.

WHAT IT DOES:
- Reviews ONE original PDF page per OpenAI background job; commits findings and progress to Supabase after each completed page.
- Failed individual pages retry up to twice, then get marked as unreviewed while other pages continue.
- Results are saved incrementally in check_reviews.findings, sheet_completed, sheet_failed and sheet_index.
- Reports can finish partially (e.g., 75% of pages) with explicit coverage notice; no false claim of complete review.
- Drawing-set jobs are advanced by existing GET /api/check?id=... polling and GET /api/check?reconcile=1.
- Narrative modes and approved rewrite path are unchanged.
- If incomplete, existing partial-refund behavior is preserved (full refund), pending your desired billing policy.

IMPORTANT LIMITATIONS:
- A review progresses only while the client polls or another authorized process calls the reconcile endpoint.
  It resumes when the user returns. This is not a fully autonomous worker/cron deployment.
- Individual-page analysis cannot fully verify cross-sheet coordination or missing items across the set.
  A later cross-sheet synthesis pass is recommended before advertising full coordination checking.
- Large sets can generate MANY AI requests and higher API cost. Test on a small PDF first.
- The page-count is read using pdf-lib; encrypted or corrupt PDFs may fail safely.
- The frontend is unchanged; progress is persisted in API responses and summary/notice fields.
- No live environment, build, deployment or real API test was performed here.
