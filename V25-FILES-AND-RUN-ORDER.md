# DrawUp v25: AI Design Team + Draw it up revisions

v25 is built on v24. Copy every file in `files/` over your repo, using the same folders. It contains two pieces of work:
- **AI Design Team.** Teammate, 6th Man and Arch Coach share one conversation.
- **Draw it up.** Modes, comments with regenerate, revisions and redlines. Details are in `/mnt/project-files/drawup/v25-drawit/V25-DRAWIT-HANDOFF.md`, summarized below.

**Not deployed.** Nothing was pushed to Cloudflare or run on your Supabase. Deployment is your step, using the order below.

## Deploy in this order
1. Run the 6 SQL files in `sql-run-in-order/`, one at a time, in Supabase → SQL Editor (listed below). Each one ends by printing a "DONE v25…" line. It's safe to run any of them twice, and none of them deletes or rewrites existing data.
2. Copy `files/` over the repo, which should already have v24 applied.
3. Optional: add the Cloudflare settings below. None are required.
4. Deploy the way you deployed v24 (`npm run build:cloudflare`, then `npm run deploy:cloudflare`).
5. Hard-refresh the site. The page tags were bumped to `?v=25.0`, so browsers pick up the new files.

## SQL: run in this order
1. **v25-01** (0060): team conversations. Adds columns to coach_threads and coach_messages: which assistant spoke, message status (streaming, done, stopped, failed), request id, reply-to and meta. Old Arch Coach threads keep working.
2. **v25-02** (0061): team_preferences. Each member's communication style, awareness switches and read-aloud setting. Members only see their own.
3. **v25-03** (0062): locker_items, for **The Locker Room**: ideas, bookmarks, decisions, rejected ideas, plays, findings, notes and unfinished items. Members only see their own, and can only attach items to their own projects and threads.
4. **v25-04** (0063): team_jobs, the background work: Coach verification, 6th Man "take the shot", layout options and drawing-set tracking. Members can read their own jobs. Only the server can write them.
5. **v25-05** (0064): team_memory and team_metrics. Members can read their project memory, edit their own notes on it, and clear it. Only HQ can read the metrics.
6. **v25-06** (0065): Draw it up revisions and project_todos. This file prints "DONE v25 drawing revisions + project to-dos".

All 6 were run twice on Postgres 16, with RLS checks. A second member can't read, write or stop anything of the first member's.

## What Jaja gets
### AI Design Team (portal → **AI Team**)
- **One conversation, three team members.**
  - **Teammate** brainstorms and builds with you.
  - **6th Man** stays on the bench until called.
  - **Arch Coach** keeps all of its abilities.
  - Pick one with the selector, or just start with a name ("Coach, …", "6th Man, …"). They all read the same thread and the same project memory.
  - Old Arch Coach threads appear in the history too, labeled Arch Coach.
- **Fast and conversational.** Replies stream word by word from a fast model, and the first words arrive in well under a second when tested locally.
  - **Stop** keeps what was written. **Continue** picks up where it stopped.
  - You can keep typing and sending while an answer is streaming.
- **Arch Coach quick answer, then verification.** A code or ADA question gets a quick answer right away, labeled *Quick answer · verifying*. A deeper researched check runs in the background and attaches under the question as **✓ Verified with sources**. You get a notification when it's ready.
- **6th Man.**
  - "6th Man, check in" gives a quick read.
  - "Draw up a play" gives play cards.
  - **Take the shot** writes a detailed proposal in the background.
  - "Get in here" joins the conversation.
  - Its bench status only shows real activity: On the Bench, Reviewing Context, In the Game, Play Ready.
- **Background jobs while you chat.** These include Coach verification, take the shot, layout options and drawing-set regeneration. Each job card can be amended (changes are queued for the next revision), canceled (refunded once) or retried. **Active Generations** lists all of them.
- **Suggests what to do next.** Every reply ends with 2 or 3 next-step chips: ask another team member, save, add to the drawing set, or add to the project. Teammate can propose a change, shown as a card with **Approve & apply to a drawing set**. The team never claims it edited a drawing. Changes only happen through Draw it up when you approve.
- **Add previous things to a set or a project.** Tick any messages, then:
  - **Add to drawing set…** picks one of your sets and either adds the items as comments, or adds them and regenerates, which opens Draw it up with the revision started.
  - **Add to project…** adds them as project to-dos (they show in Draw it up and on the project page) or saves them to the Locker Room.
- **The Locker Room.** Saved ideas, bookmarks, decisions, rejected ideas, plays and notes. You can filter, search, edit, pin, reopen, add to a set, or delete.
- **Project Memory.** A running summary (refreshed every 12 messages, free), your own editable notes, and the project's decisions and rejected ideas. You can clear it.
- **Settings.** Communication style (professional, casual, creative, direct), short answers, whether 6th Man and Coach follow along, and read aloud.
- **Voice.** The mic button uses the browser's own speech recognition, and only appears where the browser supports it (Chrome, Edge, Safari). Read aloud uses the browser's voice. There are no paid voice services.
- Also in the portal:
  - AI Team is in the top nav and sidebar, on a Dashboard tile, on each project page as an "AI Design Team" card, and on the phone bottom bar (Arch Coach moved to More).
  - Keyboard shortcut: G then I.

### Public site
- **MEET YOUR AI DESIGN TEAM** appears on the home page after the starting five. It has three cards and an interactive demo. The demo is labeled "scripted answers, no AI, no credits", so it never calls the AI or charges anything.
- The **Join the Team — Start Designing Free** button opens sign-up. Members who are already signed in go straight to the AI Team tab.
- Pricing gets two new rows: a Teammate or 6th Man message, and take the shot or a layout option.

### Draw it up (from the Draw it up thread)
- **Modes:** Preliminary, Full set, and Explore (3 directions; developing one into a set is free).
- **Comments and regenerate:** pin numbered red comments on any sheet, then regenerate. The previous set is kept and the new one is Rev n.
- **Redlines:** changed areas are clouded with the delta number. You can view or download the Clean set, Redlines or My markups as one PDF or as images.
- **New sheets** in the full set: G002 Code Analysis and an Opening Details sheet.
- **AI next steps for each set,** which you can add to the set or to the project's to-do list.

## Credits (all server-side, on your existing credit system)
| What | Credits | Setting to change it |
|---|---|---|
| Teammate or 6th Man message | **1** (new) | `DRAWUP_TEAM_CHAT_COST` |
| 6th Man "take the shot" | **8** (new) | `DRAWUP_TEAM_SHOT_COST` |
| New layout option | **8** (new) | `DRAWUP_TEAM_LAYOUT_COST` |
| Any message with a picture | 30 (same as Arch Coach today) | none |
| Arch Coach question / code or ADA question | 3 / 8 (unchanged; the background verification is included) | none |
| Draw it up: preliminary / full / revise / explore | 20 / 40 / 25 / 50 | `DRAWUP_DRAWINGS_PRELIM_COST`, `_COST`, `_REVISE_COST`, `_EXPLORE_COST` |

**Please confirm the three new prices (1, 8, 8).** They are only defaults, and you can change them in Cloudflare settings without touching code.

How credits are protected:
- Charges come out of the Free plan's 50 credits like everything else, and HQ and unlimited accounts aren't charged.
- A retry of the same message is never charged twice.
- A failed answer is refunded.
- Stopping before any words appear is refunded.
- A canceled job is refunded once.
- The bench and status lights cost nothing, and so does memory.
- When you're out of credits, your message is still saved and the reply explains why it wasn't answered.

## Cloudflare settings (all optional)
- `DRAWUP_TEAM_CHAT_COST` (1), `DRAWUP_TEAM_SHOT_COST` (8) and `DRAWUP_TEAM_LAYOUT_COST` (8).
- `DRAWUP_TEAM_MODEL`: the model for Teammate and 6th Man chat. By default it uses your existing `DRAWUP_FAST_MODEL`, then gpt-4.1-mini, then gpt-4o-mini.
- `DRAWUP_TEAM_COACH_FAST_MODEL`: the model for Coach's quick answer. It has the same default.
- `DRAWUP_TEAM_DEEP_MODEL`: the model for take the shot and layout options. Default gpt-5-mini, then gpt-5.
- Coach verification uses your existing `DRAWUP_COACH_MODEL` / `DRAWUP_SEARCH_MODEL` with web search.
- `DRAWUP_TEAM_VOICE`: set it to 0 to hide the mic button.
- The Draw it up settings are in the table above.
- No new secrets are needed. It uses your existing OpenAI key and Supabase settings. The Supabase sign-in code (drawup-env.ts, the supabase-config route and the page's sign-in code) is untouched.

## Files
New:
- `src/lib/drawup-team.ts`: routing by name, personas, prompts, prices and project context.
- `src/app/api/team/chat/route.ts`: the streaming chat, Stop, and starting background jobs.
- `src/app/api/team/jobs/route.ts`: background job progress, results, cancel, amend, retry and revise.
- `src/app/api/team/config/route.ts`: prices and the voice switch for the page.
- `public/drawup-team-v25.js` and `.css`: the AI Team tab.
- `public/drawup-team-site-v25.js` and `.css`: the home page section, the demo and the pricing rows.
- `supabase/migrations/0060` … `0065`: the same SQL as above.

Changed:
- `public/drawup-preview.html`: only script and style tags. 4 new lines after drawup-drawit-v24.js, and version bumps to `?v=25.0` on the portal, Draw it up, keys and mobile tags.
- `public/drawup-portal-v17.js`: the AI Team tab, the dashboard tile and the project card.
- `public/drawup-mobile-v20.js`: AI Team is on the bottom bar, and Arch Coach moved to More.
- `public/drawup-keys-v20.js`: the G then I shortcut.
- Draw it up: `public/drawup-drawit-v24.js`, `.css` and `public/drawup-drawit-sheets-v24.js`, plus `src/app/api/drawings/generate/route.ts` and `src/lib/drawup-drawings-core.ts`.

Previews (screenshots from the local test) are in `previews/ai-team/` and `previews/draw-it-up/`.

## Tested
- The TypeScript check passes, and both `next build` and the Cloudflare build (`opennextjs-cloudflare build`) succeed.
- I ran the API against a local Postgres with Supabase's security rules and a stand-in AI. This all passed:
  - streaming
  - model fallback
  - no hidden markers shown
  - routing by name, and plays
  - the same request sent twice is charged once
  - the Coach quick answer plus the verified result attached, with a notification
  - Stop saves the partial answer
  - take the shot charges 8, and cancel refunds once
  - amend queues changes, and retry works
  - layout option
  - out of credits returns a saved message
  - memory summary, and metrics
  - a second member is blocked from another member's thread, project and Stop
- In a real browser (desktop and phone width), this all worked with no page errors:
  - the site demo, the pricing rows, and no sideways scrolling at 390px
  - the AI Team tab and opening history
  - streaming, the next-step chips and the proposal card
  - asking 6th Man and Coach while streaming
  - the verified result
  - Save play, add to project, and the Locker Room
  - Memory, Active Generations
  - Stop, then Continue
  - everything still there after a refresh
- The browser test found two layout bugs, and both are fixed. The Stop label only appeared after a refresh. The site's page-footer style turned each message's action row into a large dark box.

## Limits and notes
- **No live AI call was made** (there was no OpenAI key here). Run one real question per team member after deploying.
- **Background results are collected while a DrawUp page is open.** The AI keeps working on OpenAI's side. When you come back, the result is picked up and you're notified. There is no server timer (cron).
- **Draw it up still opens inside the Arch Coach tab.** When the team says "Add + regenerate", it switches to Arch Coach → Draw it up with the revision started.
- **Voice** depends on the browser. Firefox has no speech recognition, so the mic button is hidden there.
- **Why Arch Coach felt slow, and why the team is faster.** Arch Coach answers with a large reasoning model, often with web search, and falls back to a background job that the page checks on. That's thorough but slow to start. The team chat streams a fast model straight to the page, and does only the slow researched check in the background, after the quick answer.
- The existing Arch Coach tab is unchanged and still works on its own.
