DRAWUP V21.3 — DISCOVER PROJECT IMAGE FIX

Replace these two files in your DrawUp project:
1. src/app/api/project-research/route.ts
2. src/lib/drawup-ingest.ts

No SQL migration is required for this patch. It uses the existing project_images table already used by Discover and firm project profiles.

WHAT CHANGED
- DrawUp Search now explicitly asks web research for a real project image + the page that supplied it.
- When a researched project is ingested into Discover, its web-discovered image is saved into project_images as the hero image if the project does not already have a photo.
- Existing firm-uploaded/project-uploaded photos are NEVER overwritten by web search.
- Discover already reads project_images, so the image appears automatically on the project card and project profile.
- Projects can now be ingested even when research did not identify an architect/engineer/contractor team; previously that early return could prevent the project itself from being saved.
- If no trustworthy image is returned, DrawUp keeps the existing placeholder rather than inventing a fake project image.

IMPORTANT
Previously discovered projects with no image will get an image the next time that project is researched/refreshed through DrawUp Search. New researched projects get this behavior immediately.
