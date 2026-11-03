# DrawUp seasons: what is live, what is hidden, and how to turn it back on

DrawUp Season 1 covers early design: pre-design, concept, schematic design and DD preparation.
Season 2 covers design development and construction documentation.

A Season 2 feature is **hidden from the Season 1 screens, not removed**. Its code, API routes, Supabase tables,
stored rows and tests all stay in the repo. Turning its flag on brings back the same screens. Nobody has to rebuild
anything, and projects never need to be restarted.

## The registry

`src/lib/drawup-season.ts` is the single list of features. Each one records:
- its season and phase
- its status
- where members find it
- the files, API routes and tables behind it

The browser copy `public/drawup-season-core-v30.js` is generated from it. After editing the .ts file, rebuild it:

```
npx esbuild src/lib/drawup-season.ts --bundle --format=iife --global-name=DrawUpSeasonCore --target=es2019 --outfile=public/drawup-season-core-v30.js
```

`public/drawup-season-v30.js` (window.DrawUpSeason) applies the flags in the page.

## Flags

| Setting | Default | What it controls |
|---|---|---|
| `DRAWUP_SEASON_2_DETAILS_ENABLED` | `false` | Draw a Detail, Details · 3D, the Details library and table, Visual Detail Intelligence, detail reviews, Firm details |

The setting is read on each request by `GET /api/features`, so changing it in Cloudflare (Worker › Settings ›
Variables) takes effect without a rebuild. An unset or unreadable value counts as `false`.

### Turning Season 2 Details on without changing production
- **Local development or a preview host:** open the portal with `?season2=1`. The browser remembers it.
  `?season2=0` clears it. This is ignored on drawup.studio.
- **Production, HQ only:** DrawUp HQ admins see an **HQ · Preview Season 2** button on the Details screen. It
  applies to that browser tab only, and regular members are not affected.

## What Season 1 does with Details (flag off)

- The **Details** tab stays in the top menu and the mobile More sheet. It opens a full-screen Details screen with
  a blurred, non-interactive copy of the real Details workspace underneath. The copy is marked `inert`, so it gets
  no clicks and no keyboard focus. The centered message reads "DETAILS — COMING IN SEASON 2". The screen also tells
  members that their saved details are kept.
- The Details mega-menu, the Draw menu's detail items, "Draw a detail" quick actions, Draw › "Draw a detail in 3D",
  the Draw editor's "Details · 3D" button, and Draw it up's "open in Details" buttons are hidden.
  `#portal/draw?detail=…` links open the Season 2 screen.
- Help answers Details questions with "Season 2" and no Open button.
- **Not changed:**
  - `/api/details/draw` and `/api/vdi`
  - the tables `details`, `detail_assets`, `detail_finds`, `detail_find_events`, `detail_comments`,
    `detail_verifications`, `detail_team_answers`, `draw_details`, and `vdi_*`
  - Draw it up's detail sheets in generated sets
  - every Details file in `public/`

## Season 1 features

Season 1 features are listed in `src/lib/drawup-season.ts` by phase, from pre-design through to CheckUp.

## Tests

`tests/season1/test-season.js` checks:
- the Season 1 screen and hides
- that saved details and 3D detail rows are unchanged
- the HQ preview
- the flag-on path, where the real Details library and Draw › My details are back with the saved 3D detail
- the `?season2=1` development switch

`tests/season1/test-help-unit.js` re-runs the 54 saved Help questions.
