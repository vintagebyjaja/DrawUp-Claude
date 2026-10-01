# DrawUp Studio

The real DrawUp product app — distinct from the marketing/waitlist site.
Hand-scaffolded (Next.js 16, React 19, TypeScript, Tailwind v4, App Router,
pnpm) because Claude's cloud sandbox has the npm registry blocked by org
policy, so `pnpm create next-app` couldn't run there. This gives you the
same result — you just need to install dependencies yourself.

## Get started

```bash
pnpm install
pnpm dev
```

Then open http://localhost:3000.

## Design reference

`design/drawup-preview.html` is the validated Season 1 design — open it
directly in a browser, no build step needed. It's a static, hash-routed
single-file mockup covering every Season 1 page (Home, Discover, Arch Coach,
Check, Details, Resources, Swap, Connect, Firm Profile, Pricing, For Firms)
and is the source of truth for layout, copy, and the DrawUp Lab / DrawUp
Gallery visual system. `src/app/globals.css` already carries the same design
tokens (`--paper`, `--ink`, `--holo-blue`, `.world-gallery`, etc.) pulled
straight from it, so real routes you build here start from the real palette
instead of reinventing it. Build real pages against this reference instead
of treating it as the deliverable — it has no backend, no auth, and every
interaction is a client-side mock.

## Structure

- `src/app/` — App Router pages (layout.tsx, page.tsx, globals.css)
- `design/drawup-preview.html` — the validated Season 1 design reference
- `supabase/migrations/` — the full Season 1 data model, numbered in run order
- `next.config.ts` — Next.js config
- `postcss.config.mjs` — Tailwind v4 PostCSS plugin
- `eslint.config.mjs` — flat ESLint config extending `next/core-web-vitals`

## Next steps toward the real product

- Build out the App Router routes for each Season 1 page against the design
  reference above (`/discover`, `/coach`, `/check`, `/details`, `/resources`,
  `/swap`, `/connect`, `/firm/[slug]`, `/pricing`, `/firms`).
- Founder console: a `/hq` (or similar) route, gated on `is_founder()`, for
  adding firms directly and uploading firm/project photos — the schema for
  this already exists (`firms`, `firm_offices`, `firm_photos`,
  `project_images`; a founder account already clears every `is_drawup_admin()`
  write policy, so no new tables are needed for this path).
- Public "add a firm" flow: a form backed by the new `firm_submissions` table
  (migration `0006`) — firm name + a website or Instagram/LinkedIn URL as
  lightweight verification, landing in a review queue a founder/admin
  approves before it becomes a real `firms` row.
- The AI Checkup feature (Netlify Functions + OpenAI), PDF upload/export, and
  the UpCodes compliance integration are the other big remaining pieces.

## Supabase / backend

Season 1's data model (firms, projects, Arch Coach threads, etc.) lives in
`supabase/migrations/`, numbered in the order they should be run. Once you've
created a Supabase project (Project Settings → API for your keys):

1. Create `.env.local` from `.env.example` and fill in your project's URL and
   keys. `.env.local` is gitignored — never commit real keys.
2. Run the migrations in order, either by pasting each file's contents into
   the Supabase SQL Editor (simplest to start), or via the Supabase CLI:
   `supabase link --project-ref <your-ref>` then `supabase db push`.
3. Current migrations:
   - `0001` — profiles, account types, roles
   - `0002` — firm search + firm profiles
   - `0003` — project search + project profiles + "Who Designed It"
   - `0004` — Arch Coach / AEC Chat / Project Threads
   - `0005` — founder / HQ role
   - `0006` — firm submissions (self-service "add a firm"), office contacts
     (Head of Office, team list, phone, per-office visibility toggle), and a
     firm photo gallery

Every table has row-level security enabled from the start. Nothing is
publicly writable; firm/project edit rights are scoped to verified firm
admins, and chat/thread content is private to its participants.

## Founder / HQ role

Migration `0005_founder_role.sql` adds a `founder` account type — one level
above `drawup_admin`, meant for the single account that owns the whole
platform. The enum value itself stays plain (`founder`); what gets *shown*
is a separate `title` text field on `profiles`, so you can set it to "HQ",
"HNIC", or anything else without touching the schema again. After you sign
up for the first time, bootstrap yourself with the UPDATE statement at the
bottom of that migration file (there's no self-service UI for this yet —
it's meant to be done once, by hand).

A founder account automatically clears `is_drawup_admin()` everywhere, so it
can add firms, offices, photos, and projects directly through the same
tables and policies a DrawUp admin uses — no separate founder-only schema.

## Firm submissions (migration 0006)

Two different ways a firm ends up verified on DrawUp:

- **Claiming an existing listing** (`firm_claims`, migration `0002`) — for a
  firm that's already in the directory; verification is an email-domain
  match.
- **Submitting a firm that isn't listed yet** (`firm_submissions`, migration
  `0006`) — open to any signed-in user, not just firm staff. Verification is
  lighter on purpose: a website URL, or an Instagram/LinkedIn handle. Every
  submission starts `pending` and only becomes a public `firms` row once a
  founder/admin reviews and approves it — nothing goes live unreviewed.

`firm_office_people` (also migration `0006`) holds each office's Head of
Office and short team list, plus `firm_offices.phone` for a number clients
can call. `firm_offices.show_team` defaults to `false` — a firm's roster
only becomes publicly visible once that firm (or a founder/admin) opts in
per office, previewable by firm admins/founders before it's public.
