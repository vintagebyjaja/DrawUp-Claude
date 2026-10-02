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
