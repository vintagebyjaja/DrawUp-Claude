# DrawUp V23 — Full source release candidate

This is a **full source tree**, not a patch-only ZIP. It combines the supplied V22 project with the previous combined Projects/Firm/Details update and adds a public 3D visual reference to the 35 existing detail listings. It does **not** delete or regenerate the existing 35 2D detail catalog entries.

## Included
- Existing DrawUp source tree and original categorized 35-detail catalog.
- DrawUp 2D / DrawUp 3D / My 3D / Firm navigation.
- V23 concept showcase featuring four holographic architectural detail examples, plus the WS-01 target UI reference asset.
- Previous three-stage Projects workflow and coordination-notes export.
- Previous Firm Playbook candidate extraction, firm override/general fallback, DrawUp General PDF/PPTX.
- Previous sheet-by-sheet Check route and Supabase migration.
- `pdf-lib` in package.json.

## NOT YET IMPLEMENTED (do not market as complete)
- 35 accurate 3D construction assemblies with separate 3D/exploded/section/layer/realistic images. The four showcased images are illustrative design references, **not verified geometry**.
- Automatic redrawing of each existing PDF sheet, producing revised CD sheets, or editable titleblock extraction.
- Production-grade firm PDF standards interpretation and reliable standards enforcement.
- Former-employer access permissions beyond existing RLS.
- Real DWG/RVT export of generated details or permit certification.

## Deploy safely
1. Back up the live repository and Supabase. Test in a new branch, not production.
2. Review changed files and run `npm install` to synchronize package-lock.json, then `npm run build`.
3. Only apply `0051_check_sheet_progress.sql` if it has not already been applied.
4. Test existing 35 details and all downloads, project saving, playbook uploads, personal 3D viewer, firm permissions, and Check progress before publishing.
5. Do not use the four concept images as construction instructions. Technical detail drawings must be verified against project conditions and manufacturer requirements.

## Next production milestone
Build 35 **source-matched**, technically reviewed 3D assemblies with consistent fixed-angle Hologram, Exploded, Section, Layers and Realistic images and a mapped bill of materials. These require inspection of each 2D source detail and verification; generating arbitrary plausible pictures would be misleading to students in the field.

## V23 project-first clarification (2026-10-10)
Updated project studio language to explicitly prohibit automatic inclusion of general public details in project revisions. The project-specific drawing set is the source of truth; DrawUp 3D public holograms are educational and proportionate rather than scale-verified. See `V23-PROJECT-FIRST-REQUIREMENTS.md`. This update is a UI/requirements guardrail, not a completed drawing-generation engine.
