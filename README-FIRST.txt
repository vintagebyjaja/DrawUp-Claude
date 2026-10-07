DrawUp V21.4 — Discover project image backfill

WHY THIS FIX EXISTS
DrawUp Search could already find and display a real image for a known building (for example SoFi Stadium), while Discover still showed the blue placeholder. The missing link was cached search results: cached results were returned to the Search UI without re-running the project ingest that saves the image into project_images.

REPLACE THESE TWO FILES
1. src/app/api/project-research/route.ts
2. src/lib/drawup-ingest.ts

NO SQL REQUIRED.

WHAT CHANGES
- Fresh project research: saves a legitimate web-discovered project image into project_images when the project has no image.
- Cached project research: now ALSO runs the same idempotent ingest/backfill. This is the key fix for projects DrawUp already knows, such as SoFi Stadium.
- Existing firm/project photos always win; web imagery is only added when project_images is empty.
- A project does NOT need a known architect, engineer, contractor, or firm in order to receive an image.
- DrawUp does not invent an image of a real building; it uses the real image returned by project research and keeps the source page URL.

AFTER DEPLOY
Search/open a known project through DrawUp Search/Arch Coach once. If that result contains a valid real project image, the ingest will attach it to the existing Discover project record. Refresh Discover and the image should appear on the card and project profile.
