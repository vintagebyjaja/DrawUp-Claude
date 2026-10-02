# DrawUp GitHub Ready V5

V5 preserves everything from V4 and fixes the homepage hologram layering. The legacy foreground logo/SVG callouts are disabled because the approved command-center hero art already contains the DrawUp medallion. Added subtle live collaboration motion over the people: Arch Coach drawing/sketching on the holographic plan, teammates pointing toward the drawing, pulsing collaboration glow, moving lasers, scan, walking figure, beam and HUD motion.

Deploy as before with the existing repository.

# DrawUp — GitHub-ready recovery build

This repo restores the validated **DrawUp Season 1** preview as the working site instead of the placeholder “DrawUp Studio” scaffold screen.

## What opens at `/`

The Next.js home page loads `public/drawup-preview.html`, which contains the validated hash-routed Season 1 experience (Home, Discover, Arch Coach, Check, Details, Resources, Swap, Connect, For Firms, Pricing, etc.). The preview-only yellow banner is hidden in the deployed copy.

The untouched source artifact is preserved at `design/drawup-preview-original.html`.

## Branding

- Official blue/white DrawUp logo: favicon + PWA/app icon.
- The multicolor/glowing treatment remains a homepage hologram effect only.
- The homepage hologram has extra aura, scan glow, particles, and stronger light treatment without replacing the official app icon.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy to Netlify

Connect this GitHub repository to Netlify. `netlify.toml` already uses `next build` and the official Next.js Netlify plugin.

If Supabase is needed for the next implementation phase, copy `.env.example` to `.env.local` and add your real values locally / in Netlify environment variables. Never commit `.env.local` or the service-role key.

## Supabase

The supplied migrations are preserved in `supabase/migrations/` in run order. This recovery build does **not** delete or replace the Supabase work.

## Where to edit the current site

The current working Season 1 site is:

`public/drawup-preview.html`

The Next.js shell is intentionally thin so you can get back into the site immediately. Future routes/components can be migrated out of the preview one at a time without losing the validated design.


## Season 1 hologram animation update
The home hero now includes animated architectural holograms: a walking human-flow figure, an Arch Coach figure drawing a building on a holographic board, court study, project-goal massing, window detail, extra projection lasers, orbiting HUD nodes, and floating particles. Motion respects `prefers-reduced-motion`. The former RFI marker was moved away from the central logo and relabeled as a window-detail marker.

## V3 approved hero
The home hero uses the exact approved command-center artwork supplied by the owner (`public/drawup-hero-command-center.png`) with lightweight CSS motion layered over it: pulsing projector/medallion, moving scan beam and lasers, floating HUD panels, a walking Human Flow figure, particles, and an Arch Coach drawing trace. Navigation and the rest of the Season 1 preview remain functional.


## V4 cleanup
- Removed the prototype PREVIEW / DEMO banner from the public marketing experience.
- The DrawUp navigation now sits at the top of the public site.
- Join Preseason remains public-facing launch language.
- V3 animated command-center hero and Supabase migrations are preserved.


## V6 — Global AEC Network
V6 expands Discover, Firms, Resources/Codes and Connect internationally. Discover now includes a Universities directory with U.S.-by-state, international-by-continent/country and Study Abroad pathways. Connect adds worldwide precedent search. A migration (`0007_global_directory.sql`) adds the university/program data foundation. The current HTML includes seeded directory UI and filter controls; production search should bind these controls to Supabase data as records are verified.


## V7 university starter directory
Adds 10 starter schools with working search, U.S./international/study-abroad scope, state, continent and program filters. School/program buttons link to official university or department sites. Starter records are intentionally a head start, not a complete global directory.


## V7 featured-university update
The Universities directory now opens with Featured Universities: Hampton University (HBCU), MIT (U.S. research), and Holy Spirit University of Kaslik / USEK (international). MIT and USEK are also included in the searchable starter directory.
