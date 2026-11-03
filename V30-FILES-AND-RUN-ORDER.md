# DrawUp Season 1 — files, run order and what still needs doing (v30)

Branch: **`migration`**. Nothing has been merged into `main` and nothing has been deployed.
Preview page: `public/drawup-preview.html` on `migration` (the whole product UI, hash-routed).

Season 1 is pre-design → schematic design → DD preparation. Season 2 work (Details) is hidden, never
removed: every Details file, API route, table and saved row is still there, and one flag brings it back.

---

## 1. Run order

### SQL (Supabase SQL editor, in this order; each is additive and safe to run twice)

| # | File | What it adds |
|---|------|--------------|
| 1 | `supabase/migrations/0072_v29_draw_workspace.sql` | Draw Workspace 2.0 (already in the v29 package) |
| 2 | `supabase/migrations/0074_v29_help_registry.sql` | Help registry |
| 3 | `supabase/migrations/0075_drawup_specs.sql` | DrawUp Specs: `firm_documents`, formats |
| 4 | `supabase/migrations/0076_project_intelligence.sql` | `project_profiles`, `project_profile_changes`, the change trigger |
| 5 | `supabase/migrations/0077_document_studio.sql` | `project_documents`, `document_versions`, `document_imports`, the `drawup-private` policy |
| 6 | `supabase/migrations/0078_checkup_reviews.sql` | `spec_reviews` (Specifications Review and DD Readiness) |

Nothing in 0076–0078 drops, alters or renames an existing table, column or policy.

### Environment

| Variable | Value | What it does |
|---|---|---|
| `DRAWUP_SEASON_2_DETAILS_ENABLED` | `false` (or unset) | Season 1: the Details tab opens the Season 2 screen |
| | `true` | Season 2: the real Details workspace comes back, unchanged |

Read per request by `/api/features`. Two other ways to see Season 2 without touching production:
`?season2=1` in a non-production browser, and the HQ preview button on the Season 2 screen (that tab only).
Full detail in `SEASONS.md`.

---

## 2. What changed, by file

### New in v30

| File | What it is |
|---|---|
| `src/lib/drawup-season.ts` | The season registry: every Season 2 feature with the code, routes and tables it keeps, and the Season 1 features by phase. Single source of truth. |
| `src/app/api/features/route.ts` | Serves the flags (no store cache). |
| `public/drawup-season-core-v30.js` | The registry, bundled for the browser (generated — see `SEASONS.md`). |
| `public/drawup-season-v30.js` / `.css` | Applies the flags: the Season 2 Details screen over the real workspace, the Season 1 menus (`S1_COLS`), the hides, the dev switch and the HQ preview. |
| `src/lib/drawup-project-intel.ts` | Project Intelligence: the public lookups and the provenance and merge rules. |
| `src/app/api/project-intel/route.ts` | The lookup route (signed-in only, no AI, no credits). |
| `public/drawup-project-intel-core-v30.js` | The same library, bundled for the browser (generated). |
| `public/drawup-project-intel-v30.js` / `.css` | Project Information and Project Map: every value with its source, date and confidence, program, team, milestones, decisions, private files, the "used by" counts and the project-page card. |
| `public/drawup-docstudio-v30.js` / `.css` | Document Studio: the Documents tab over the member's own store, page setup per document, linked project fields with the "project information changed" notice, autosave and version history, PDF and Word import that keeps the original, PDF and editable Word export. |
| `public/drawup-checkup-v30.js` / `.css` | Specifications Review, DD Readiness and Review History. |
| `supabase/migrations/0076…0078` | As above. |
| `SEASONS.md` | What is hidden, what is kept and how to turn Season 2 on. |

### Changed (all additive; no file was replaced with an older package version)

| File | Change |
|---|---|
| `public/drawup-preview.html` | Tag lines only, appended. The v29 packages were merged into it with `git merge-file`, never overwritten. |
| `public/drawup-portal-v17.js` | The `project-info` and `documents` tabs; an optional Site address on the new-project modal; `data-project-id` on the project grid. |
| `public/drawup-studio-v26.js` | Section and info entries for the two new tabs. |
| `public/drawup-specs-v29.js` | One editor, two stores (`DOCS(S)`, `scopeFilter`, `scopeFields`); page setup per document; Project Information values in the document data; hook points for Document Studio; a CheckUp finding can open the section it came from. The firm path is unchanged. |
| `public/drawup-specs-export-v29.js` | Orientation: `pageSize(fmt)` for the preview, the PDF and `w:orient` in the .docx. |
| `public/drawup-firmkit-v22.js` | `?focus=brand` opens the logo, colors and fonts of a presentation template. Nothing else. |
| `src/lib/drawup-help.ts` | Nine Details answers now say "Season 2" instead of offering a button that is not there. |

---

## 3. Tests

```
node tests/season1/test-season.js         30 checks   Season 2 screen, hides, saved rows, HQ preview, flag on
node tests/season1/test-help-unit.js      54 checks   every saved Help question routes as before
node tests/season1/test-project-intel.js  35 checks   lookups, provenance, merge rules, the route, the page, the map, phone
node tests/season1/test-docstudio.js      34 checks   page setup, linked fields, versions, PDF/Word round trip
node tests/season1/test-nav.js            18 checks   the Season 1 menus, nothing dropped, each destination opens
node tests/season1/test-checkup.js        37 checks   the rules, a real run, open-fix-save-re-run, both exports
node tests/season1/test-acceptance.js     the 12 acceptance tests, in order
```

SQL (local PostgreSQL 16 with the Supabase stand-in in `tests/season1/sql/stub.sql`, a fresh database each run):

```
psql -d <fresh> -f tests/season1/sql/test-0076.sql    8 checks
psql -d <fresh> -f tests/season1/sql/test-0077.sql    6 checks
psql -d <fresh> -f tests/season1/sql/test-0078.sql    9 checks
```

All of them pass with no failures. The browser tests run the real page files against an in-memory
Supabase stand-in and, where a route is involved, the real route code.

---

## 4. The 12 acceptance tests

`node tests/season1/test-acceptance.js` → **12 of 12 pass**, written to `tests/season1/out/acceptance.json`.

| # | Test | Result |
|---|---|---|
| 1 | New project connected to a real site | pass — project created, coordinates saved |
| 2 | Site and jurisdiction data populated | pass — 13 values, each with its source and date; parcel, zoning, setbacks, height, land use and code edition flagged as not available, with the reason and where to get them |
| 3 | A professional letter with linked project fields | pass — the saved letter keeps the fields; they resolve to the project record |
| 4 | PDF and editable Word export | pass — a real PDF and a .docx with editable paragraphs |
| 5 | An editable preliminary specification section | pass — 07 54 00 written with the choices left open |
| 6 | Saved to the project | pass |
| 7 | Reviewed in CheckUp | pass — 13 items, each pointing at the section it came from |
| 8 | An omission identified and corrected | pass — opened the section from the finding, filled it in, re-ran: 13 → 11, 2 recorded as settled |
| 9 | A project report from information already in DrawUp | pass — filed under the project and downloaded as a PDF |
| 10 | An existing presentation opens without loss | pass — colors, header and preview intact, the saved row byte-for-byte unchanged |
| 11 | Details functionality and data preserved | pass — the Details files still load, the real workspace still renders under the screen, the saved detail rows are unchanged |
| 12 | A Season 1 member sees the blurred Details screen | pass — the tab stays, the frosted overlay is over the real workspace, and it says saved details are kept |

---

## 5. Known limitations, honestly

1. **The public GIS services cannot be reached from the build container.** Outbound HTTPS to
   `geocoding.geo.census.gov`, `hazards.fema.gov`, `epqs.nationalmap.gov` and OpenStreetMap is refused by
   the agent proxy, so the lookups were written against the documented shapes of those APIs and tested
   against recorded answers (`tests/season1/fixtures-intel.js`). **They need one live check after deploy.**
2. **Parcel boundaries, zoning, setbacks, height limits and land use are not looked up.** There is no
   national source for them; each county and city publishes its own. DrawUp says so and names the next step
   instead of guessing. Connecting a jurisdiction at a time is the next piece of work.
3. **No AI run was made from here** (no key in this container). The AI paths that already existed are
   untouched; nothing new in v30 calls a model.
4. **AI specification drafting is not built.** Specifications Review is deterministic: it reads your own
   documents and records and says what is missing, what does not add up and what disagrees. It does not
   draft spec text for you yet. That is the one part of the brief still to do, and it is not claimed as done.
5. **Imported PDF text is text only.** Headings, paragraphs and simple lists come across. Columns, tables
   drawn as lines, scanned pages and exact page layout do not, and the screen says so. The original file is
   always kept.
6. **CM / CA / QA-QC / PM paperwork** uses the existing DrawUp Specs document types (RFI, submittal review,
   field report, punch list, daily report, change order request, QA/QC plan, inspection checklist, NCR,
   deficiency log, transmittal, minutes). They are real documents with linked project fields and exports;
   there is no separate tracking board yet.
7. **DD Readiness is advisory.** It measures how much of a checklist of your own records is in place. It is
   not a prediction, a grade, or any kind of approval, and it says that on screen and in the exported PDF.
8. **Nothing is deployed.** Merging to `main` and deploying is waiting on your explicit go-ahead.
