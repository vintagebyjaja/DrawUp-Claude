# DrawUp V13.6

V13.6 builds on V13.5 with persistent Supabase-backed onboarding progress and live globally unique username checks. Completed onboarding does not reopen on normal sign-in; Profile > Edit Profile remains the intentional edit path.

# DrawUp V13.5

V13.5 consolidates the V13.3 portal workspace and V13.4 profile-history update, plus authenticated navigation cleanup.

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

## V10 responsive/mobile update
- Responsive breakpoints adapt DrawUp for phone, tablet, and desktop without user-agent sniffing.
- Phones use a compact app-style header, hamburger drawer, and fixed six-item bottom navigation.
- Mobile home hero is reorganized for a vertical, touch-first layout inspired by native mobile apps.
- Directory chips/tabs become horizontal touch scrollers; cards collapse to one column; university controls become mobile-friendly.
- Tablet navigation and spacing are tightened while retaining the desktop information architecture.


## V10 Student Portfolio Review
Arch Coach now includes Architecture and Interior Design portfolio review cards with PDF-only validation (20 MB max) and a Student plan at $10/month. Migration `0008_student_portfolio_reviews.sql` adds the private Supabase storage bucket and review metadata table. The static preview validates/selects files; production AI review still needs the authenticated upload + Arch Coach processing endpoint wired to Supabase.


## V10 directory correction
- University directory now includes 240 starter listing entries: 30 each for Architecture, Engineering, Interior Design, Construction, Planning, Landscape, HBCU and Study Abroad.
- Featured Hampton / MIT / USEK cards only display on All Programs.
- International Firms is now an interactive directory toggle with starter international firms.
- Seeded university links use discovery searches where an official department URL has not yet been verified; replace these with verified direct URLs as the production database is populated.


## V10 International Firms fix
- Connect → International Firms now opens a real visible international roster.
- Seeded 24 recognizable firms including Zaha Hadid Architects, Foster + Partners, MVRDV, Snøhetta, BIG, Kengo Kuma & Associates, WOHA, ELEMENTAL and more.
- Added clickable region filters for Europe, Asia, Middle East, Africa, North America, South America and Oceania.
- U.S. Firms toggle switches back to the existing U.S. roster.


## V10 Arch Coach free trial update
- New accounts can try the first **10 Arch Coach questions free** before a paid plan is required.
- Pricing copy now makes the 10-question allowance explicit.
- Student remains **$10/month** and includes ongoing Arch Coach student access plus Architecture and Interior Design portfolio PDF reviews.
- `0009_arch_coach_free_questions.sql` adds the server-side usage foundation. The browser counter is only preview UI; production must enforce usage in the authenticated API/server path.


## V10 credit-model update
- Explore: 10 Arch Coach questions free, no card required.
- Arch Coach: $8.20/month, 100 credits (25 standard questions).
- Student: $10/month, 500 credits (125 standard questions) + portfolio reviews.
- Emerging: $19/month, 1,200 credits (300 standard questions) + broader DrawUp tools.
- Firm Showcase: $49/month, 3,000 shared credits.
- Firm Pro: $99/month, 7,500 shared credits.
- Standard text question: 4 credits. Heavier actions may use more credits; show cost before execution.
- Paid users may purchase additional credits.
- Apply Supabase migration `0010_arch_coach_credits_and_plans.sql` after prior migrations.


## V10
Adds clickable Privacy, Terms, AI Policy, Professional Disclaimer, Q + A, and a Season 2 Coming Soon concept page.

## V10 Arch Coach live connection
The Arch Coach page now connects authenticated DrawUp users to the deployed Supabase `arch-coach` Edge Function. Configure `NEXT_PUBLIC_SUPABASE_URL` and either `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the deployment environment. Migration `0011_arch_coach_live_backend.sql` is the database support used by the live Edge Function; do not rerun it if the same backend SQL package was already applied successfully.

## V11 visual update
Season 1 countdown court now uses the balanced DrawUp hologram palette (cyan, mint, peach/orange, lavender) with continuous float, pulse, scan, electric sweep, glow, and subtle motion effects. No animation-detail labels are shown in the UI.

## V11 Arch Coach credit + AEC reference update
- Visitors: 10 guest questions before signup.
- Free Explore account: 50 starter credits.
- Arch Coach $8.20: 300 credits/month.
- Student $10: 750 credits/month.
- Emerging $19: 2,000 credits/month.
- Firm Showcase $49: 5,000 shared credits/month.
- Firm Pro $99: 12,000 shared credits/month.
- Workload pricing is shown on the Pricing page: basic 2–5, code/ADA 5–10, plan analysis 20–40, space planning 30–75, details 25–50, compliance report 50–100, photoreal 75–150, large drawing/document analysis 100–250 credits.
- Optional visual upgrades: 3D explanation +25 credits; hologram-style detail +50 credits.
- Run `supabase/migrations/0013_arch_coach_v11_credits.sql` once.
- Deploy `supabase/functions/arch-coach/index.ts` as the updated `arch-coach` Edge Function.
- The Edge Function asks for project location before jurisdiction-sensitive answers, uses OpenAI Responses web search for current source research, prioritizes ICC/AHJ/official ADA sources, and can request an original 3D/hologram visual. It does not bundle or reproduce copyrighted Ching PDFs; user-authorized uploads can be analyzed, and Ching/Wiley can be referenced educationally.

## V13.2 hotfix
V13.2 explicitly loads the portal runtime in the production preview shell and hands successful Supabase sign-ins directly to it. It adds first-time profile photo upload and fixes laptop hero containment. See `V13.2-TEST.md`.
