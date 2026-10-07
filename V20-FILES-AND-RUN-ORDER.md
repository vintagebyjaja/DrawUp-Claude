# DrawUp v20 — files and run order (updated)

This zip is cumulative: everything from 20a, 20b and the first v20 package, plus the new updates
(phone app layout, fast answers, firm featured work + Locations & Studios, personal Arch Coach,
keyboard shortcuts). Copy each file over the same path in your repo (DrawUp-Claude-main/...), then deploy.

## SQL — run in Supabase in this order (folder `v20-sql-run-in-order`)
Each file is under 100 lines, ends with a DONE row and an END line, and is safe to run twice.
Nothing is dropped or wiped. If you already ran 01 to 11, start at 12.

1. 01-saved-searches.sql
2. 02 to 07 connect (chats, timeline, boards)
3. 08 to 10 swap (Swap threads)
4. 11-university-01.sql (after Connect)
5. 12 to 14 firms (featured work, Locations & Studios)
6. 15-speed-01.sql (fast search: saved quick answers, firms listed from search)
7. 16 to 20 coach (personal Arch Coach, points, legends)
   Files 18 and 20 contain plpgsql functions. Paste each file whole and run it as one.

## Changed or new files
### Server
- src/app/api/arch-coach/route.ts (quick answer, clarifying options, personal coach, points)
- src/app/api/project-research/route.ts (quick answer, clarifying options, saved searches, new firms from search)
- src/app/api/check/route.ts (points for Check)
- src/app/api/swap/route.ts
- src/lib/drawup-server.ts, src/lib/drawup-quick.ts (NEW), src/lib/drawup-ingest.ts (NEW), src/lib/drawup-coach-persona.ts (NEW)

### Page and scripts (public/)
- drawup-preview.html (tags + cache versions)
- drawup-portal-v17.js, drawup-live-v17.js, drawup-v19.js, drawup-v19.css, drawup-v20.js, drawup-v20.css
- drawup-connect-v20.*, drawup-swap-v20.*, drawup-draw-core-v18.js, drawup-tools-v18.js, drawup-draw-v20.css
- NEW: drawup-firms-v20.js/.css, drawup-coach-v20.js/.css, drawup-keys-v20.js/.css, drawup-mobile-v20.js/.css
- vendor/ (pdf-lib, world land outlines + licenses)

### Migrations (same SQL as above, for the repo record)
- supabase/migrations/0027 to 0034

## Netlify settings (all optional)
- DRAWUP_FAST_MODEL: model for the quick first answer (default gpt-4.1-mini)
- DRAWUP_SWAP_MODEL: model that hands Swap requests to the image tool (default gpt-4.1-mini)
