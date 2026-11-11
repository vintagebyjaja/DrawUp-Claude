# DrawUp Season 1 — files, run order and what still needs doing (v30)

Branch: **`migration`**, merged into `main` on 2026-11-11 at the member's request. Run the SQL below in Supabase right after the deploy.
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

| `DRAWUP_SPEC_MODEL` | optional | Model for AI spec drafting (default `gpt-5`, then `gpt-5-mini`) |
| `DRAWUP_SPEC_DRAFT_COST` | optional | Credits per AI spec draft (default 10; refunded if the model fails) |

The Details flag is read per request by `/api/features`. Two other ways to see Season 2 without touching production:
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
| `src/lib/drawup-spec-draft.ts`, `src/app/api/specs/draft/route.ts` | AI spec drafting: the prompt, the cleaning rules (no code citations, no named products or certifications, references only from real standards bodies and marked to confirm), credits reserved and refunded on failure. |
| `public/drawup-specs-ai-v30.js` | The "Draft with AI" panel in the spec editor: ask, review the questions and assumptions, then add sections. It never replaces text that was typed. |
| `public/drawup-specs-import-v30.js` | Spec imports from four sources (client, firm standard, DrawUp standard, consultant). Reads Word list numbering and typed numbering, keeps every word (notes, schedules, table rows, cover and contents pages included), checks each file word for word, keeps a duplicate section number beside the original, runs a same-format check, logs each import on the document, and offers the three layout settings. It can save a client's page layout as a client format. |
| `public/drawup-doc-marks-v30.js` | Seals and signatures. Each person keeps their own images in their private folder (`drawup-private/<uid>/marks/`). One goes on a document only when that person applies it and confirms it is theirs; the document records the name, role or license, date and who applied it. Exports place them on a Seals page at the front of a manual, or at the end of a letter or form, in PDF and Word. Only the person who applied one can take it off. |
| `public/drawup-portfolio-sources-v30.js` | Portfolio Review can use the member's own project files and firm kit as sources. |
| `public/drawup-pm-tracker-v30.js` / `.css` | Project Management tracker: RFIs, submittals, punch lists, NCRs and the other CA documents, with state, ball in court, due dates (the usual turnaround is labeled as such), a dated log and CSV. |
| `tools/specs/combine.py`, `tools/specs/verify.py` | Combine a folder of spec sections into one Word document with each section's own headers, footers and numbering, then verify that no text was lost. Used for the Division 01 set. |
| `supabase/migrations/0076…0078` | As above. |
| `SEASONS.md` | What is hidden, what is kept and how to turn Season 2 on. |

### Changed (all additive; no file was replaced with an older package version)

| File | Change |
|---|---|
| `public/drawup-preview.html` | Tag lines only, appended. The v29 packages were merged into it with `git merge-file`, never overwritten. |
| `public/drawup-portal-v17.js` | The `project-info` and `documents` tabs; an optional Site address on the new-project modal; `data-project-id` on the project grid. |
| `public/drawup-studio-v26.js` | Section and info entries for the two new tabs. |
| `public/drawup-specs-v29.js` | "Import from Word or PDF" opens the v30 importer; the format editor gained article style, number style, header block and rules; "DrawUp format" is now called "DrawUp standard". Also: one editor, two stores (`DOCS(S)`, `scopeFilter`, `scopeFields`); page setup per document; Project Information values in the document data; hook points for Document Studio; a CheckUp finding can open the section it came from. The firm path is unchanged. |
| `public/drawup-specs-export-v29.js` | Orientation: `pageSize(fmt)` for the preview, the PDF and `w:orient` in the .docx. The DrawUp standard layout now follows the member's Division 01 set (owner, project, architect and project numbers in a ruled header block; section title and "Page n of N" in a ruled footer; 1.01 articles; SECTION 01 1000 numbering). Saved formats made before keep their old look. Imported part titles and notes are laid out as they came in. |
| `public/drawup-specs-data-v29.js` | One more project field: Owner project or PO number. |
| `public/drawup-season-v30.js` / `.css` | Details is out of the portal's main menu; the public Details page shows the Season 2 preview; Projects › Project Management opens the tracker. |
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
node tests/season1/test-spec-ai.js        27 checks   AI drafting: cleaning rules, the route, credits, the editor flow
node tests/season1/test-spec-import.js    18 checks   all 27 Division 01 files and the combined manual, word for word; consultant merge; three layouts
node tests/season1/test-marks.js          17 checks   seals and signatures: private folder, confirmation, PDF and Word exports, taking off
node tests/season1/test-portfolio-sources.js 13 checks
node tests/season1/test-tracker.js        18 checks
node tests/season1/test-details-s1.js      9 checks   Details out of the main menu, links still land on the Season 2 screen, the public page
```

`test-spec-import.js` reads the Division 01 files from `/mnt/project-files/specs/division-01-source/` (set
`DIV01` to point elsewhere). It compares the import with an independent reading of each Word file
(`tests/season1/srcwords.py`).

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
3. **No live AI run was made from here** (no key in this container). AI spec drafting was tested against a
   stand-in model and stand-in credit calls; it needs one live run after deploy.
4. **AI drafts are preliminary.** Code citations, named products, certifications and unknown standards are
   taken out; what is left is marked for review, and nothing replaces text a person typed.
5. **Spec imports.** Word files come across word for word, checked against an independent reading of each
   file. Numbering is realigned to the manual's own (that is the point of a format), END OF SECTION lines are
   written by the layout, and PART 4 or later becomes the last article of Part 3. Page headers and footers of
   an imported Word file are not imported as text: they belong to the layout, and for a client file they can
   be saved as the client's format. A client format read from Word copies the page size, margins, font, size,
   header lines and numbering style; it is close, not identical, and can be adjusted under Formats. A PDF
   import drops lines that repeat on at least half the pages as page headers and footers, and says how many.
6. **Imported PDF text is text only.** Headings, paragraphs and simple lists come across. Columns, tables
   drawn as lines, scanned pages and exact page layout do not, and the screen says so. The original file is
   always kept.
7. **CM / CA / QA-QC / PM paperwork** uses the existing DrawUp Specs document types (RFI, submittal review,
   field report, punch list, daily report, change order request, QA/QC plan, inspection checklist, NCR,
   deficiency log, transmittal, minutes), and the Project Management tracker follows them. There are no
   email notifications or reminders for due dates yet.
8. **DD Readiness is advisory.** It measures how much of a checklist of your own records is in place. It is
   not a prediction, a grade, or any kind of approval, and it says that on screen and in the exported PDF.
9. **Seals and signatures are images, not digital certificates.** A placed seal is a picture with the name and date the person applied it; it is not a cryptographic (PKI) digital signature, and jurisdictions that require one need it applied in a signing tool after export. Seals on drawing sheets are not covered yet; the title block still has an empty Seal box.
10. **Merged to `main` on 2026-11-11.** Run SQL 0076–0078 in Supabase (section 1) so Project Information, Document Studio and CheckUp reviews can save. Check one live site lookup, one AI spec draft and the public GIS lookups once it is live.
