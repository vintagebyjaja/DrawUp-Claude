# DrawUp v28: files and run order

v28 sits on top of v27. It adds picture answers in the AI Team, a YouTube shelf in Arch Coach › Learning, readable Learning pages, a regular-chat mode, deleting a conversation, slower transitions, Hall of Fame legend bios with chime-ins, a top header that stays on screen with tap-to-top, and one shared search for Discover and the header. Nothing is removed. The approved design stays; only text colours on the Learning page and the video tiles change.

## Run order

1. **Supabase → SQL editor: run `sql-run-in-order/v28-01_visual_answers_learn_videos.sql`.** It is additive and safe to run twice. It:
   - creates `learn_videos`, the shared list of YouTube links the AI Team found. It stores only the link, title, channel and thumbnail link. No video is stored.
     - Members can read the visible ones. HQ can hide one for everyone.
   - creates `learn_video_asks`, which records which member's question found which video. This is the "From your questions" shelf. Members see and delete only their own.
   - lets a team chat message have the speaker `legend`, so a legend's chime-in can be saved.
   - ends with `DONE drawup-v28-01`.
2. **Copy everything in `files/` (or unzip `DrawUp-v28-changed-files.zip`) into the repo at the same paths.**
   - New files:
     - `src/app/api/visual/route.ts`
     - `public/drawup-visual-v28.js` and `.css`
     - `public/drawup-legends-v28.js` and `.css`
     - `public/drawup-team-v28.css`
     - `public/drawup-learn-v28.css`
     - `public/drawup-nav-v28.js` and `.css` (pinned header, back to top, one search)
   - Changed files:
     - `src/lib/drawup-team.ts`
     - `src/app/api/team/chat/route.ts`
     - `public/drawup-team-v25.js`
     - `public/drawup-playbook-v21.js`
     - `public/drawup-studio-v26.js`
     - `public/drawup-studio-fx-v26.js`
   - `public/drawup-preview.html` has two kinds of edit:
     - 4 cache numbers change to `?v=28.0`, on the lines for drawup-team-v25.js, drawup-playbook-v21.js, drawup-studio-v26.js and drawup-studio-fx-v26.js.
     - 8 lines are added at the very end, after the v27 lines. If your copy has changed, paste just these:
       ```
       <link rel="stylesheet" href="/drawup-visual-v28.css?v=28.0">
       <link rel="stylesheet" href="/drawup-team-v28.css?v=28.0">
       <link rel="stylesheet" href="/drawup-learn-v28.css?v=28.0">
       <link rel="stylesheet" href="/drawup-legends-v28.css?v=28.0">
       <script src="/drawup-visual-v28.js?v=28.0"></script>
       <script src="/drawup-legends-v28.js?v=28.0"></script>
       <link rel="stylesheet" href="/drawup-nav-v28.css?v=28.0">
       <script src="/drawup-nav-v28.js?v=28.0"></script>
       ```
   - `supabase/migrations/0071_...` is the same SQL as step 1.
3. **Cloudflare settings: nothing is required.** The settings below are optional.
4. Commit, deploy, then hard-refresh drawup.studio.

If the SQL has not been run yet, the site keeps working. The video shelf shows "Run the v28 SQL", and a legend chime-in returns the same message and refunds its credit.

## Optional Cloudflare settings (defaults in brackets)

| Setting | What it does |
|---|---|
| `DRAWUP_YOUTUBE_API_KEY` (not set) | A free YouTube Data API v3 key from Google Cloud. When it is set, the YouTube button uses YouTube's own search: it is faster, it only returns videos that allow embedding, and it costs no credits. **Recommended.** |
| `DRAWUP_VISUAL_VIDEO_COST` (1) | Credits for one YouTube search when there is no API key, so the AI searches youtube.com instead. **Needs your OK.** Searches that reuse a topic someone already asked about in the last 45 days are free. |
| `DRAWUP_VISUAL_MODEL` (gpt-5-mini) | The model used for the AI YouTube search. |

## Credits

The new features use these credit costs. HQ accounts are free, as everywhere else.

| Action | Credits |
|---|---|
| Pictures under an answer (DrawUp library + Wikimedia Commons) | Free |
| Sketch, 3D and Construction Detail views of a DrawUp library detail | Free |
| "Draw it in DrawUp style", when the library has no match | 15. This is the existing `/api/details/draw` price (`DRAWUP_DETAIL_DRAW_COST`). The drawing is saved privately to the member's Details. |
| YouTube, with a key or a topic already found | Free |
| YouTube, using the AI search | 1. This is `DRAWUP_VISUAL_VIDEO_COST` and **needs your OK.** |
| A legend chiming in | 1. This is the normal Teammate message price. |

## Roll back

Delete the 8 lines at the end of `drawup-preview.html`, then put back the v27 copies of the 6 changed files. The new tables can stay, because nothing else reads them.
