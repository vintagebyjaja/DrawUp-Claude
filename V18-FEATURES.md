# DrawUp V18 — Draw, Check, Swap, Arch Coach credits, HQ

V18 builds on V17 (see `V17-FIXES.md`). The homepage hero, holograms and animations are untouched.

## New Portal tools

| Tool | What actually happens |
|---|---|
| **Draw** (`public/drawup-draw-core-v18.js`, Draw tab) | Plans are a geometry model saved to `drawings.model`: walls (segments + thickness), doors/windows hosted on walls, room labels. Dimensions are never stored. They are computed from the geometry each time the sheet is drawn: openings string, wall-location string, overall string on every side, plus interior strings to door jambs. Every string is checked to add up to the overall. Changing a wall's length stretches the plan, and all affected dimensions update. Text size, tick size and offsets follow the drawing scale. Exports: vector PDF (11×17 sheet with title block), DXF (R12, real inches, AIA-style layers), SVG. |
| **Check** (Check tab, `/api/check`) | Members upload a PDF set to their private folder. The server reserves credits, sends the actual PDF to the AI in background mode and saves structured findings (sheet, location, issue, fix, reference, severity) to `check_reviews`. The report downloads as a PDF. Failed reviews are refunded. |
| **Swap** (Swap tab, `/api/swap`) | Members upload an image and describe the change. The server reserves credits, generates the edited image in background mode and stores the result in the member's private folder (`swap_generations`). Failed jobs are refunded. |
| **Arch Coach credits** (`/api/arch-coach`) | Each answer is charged through the same server-only credit gate as the edge function: 3 credits for a basic question, 8 for code/ADA, 30 with an image. It is refunded if the AI fails. Founder/admin accounts are not charged. |
| **HQ** (HQ tab) | Shown only to `founder` / `drawup_admin` accounts, and enforced by RLS and security-definer functions. It covers: the "Add a firm" review queue (approving creates the firm and office), firm and project create/edit/delete, logo, hero and photo uploads, project images and team, member lookup, granting credits, and verifying experience. Campus managers, organization managers, firm admins and members are refused by the database. |

## Database

`supabase/migrations/0022_reserved_usernames.sql` blocks staff and brand handles such as @founder, @admin, @archcoach and @drawup, and their look-alikes.

`supabase/migrations/0023_v18_check_swap_drawings_hq.sql` adds:
- a private storage bucket
- the `check_reviews`, `swap_generations` and `drawings` tables
- HQ policies and functions

Both migrations are additive and safe to re-run.

## Environment

Uses the same variables as before. **`SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` must be set on Netlify** for Arch Coach, Check and Swap. Optional variables are `DRAWUP_CHECK_MODEL` and `DRAWUP_SWAP_MODEL`; see `env.example`.
