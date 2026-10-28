# DrawUp v28 report

## What you asked for, and what changed

**1. Picture answers.** When someone asks to see something, like "can you show me what a window detail drawing should look like?", a **See it** card now appears under the answer.
- It shows pictures right away:
  - up to 2 matching details from the DrawUp library, drawn in DrawUp style
  - up to 3 pictures from Wikimedia Commons, each with its author and licence linked
- It then asks **How do you want to see it?** with 4 buttons: **Sketch**, **3D**, **Construction Detail Drawing** and **YouTube**.
  - **Sketch** is a hand-drawn look on paper.
  - **3D** is the v27 3D view, with Realistic, Hologram and Technical modes and the explode slider.
  - **Construction Detail Drawing** is the v27 sheet view, with SVG and DXF downloads and "Open in Details".
  - All three use the library detail for free. If the library has no match, they offer "Draw it in DrawUp style" for 15 credits, using the v25.1 drawing route.
  - **YouTube** shows 3 to 6 video cards, each with a thumbnail, title and channel.
- The card shows on the AI Team and on the Arch Coach chat. The AI also flags which answers need a picture, so it is not only keyword based.

**2. YouTube videos go into Learning.** Every video the YouTube button finds is saved to **Arch Coach › Learning › Watch & Learn**.
- "From your questions" lists the member's own finds. "Found by the AI Team" lists everyone's, with topic filters. HQ can hide any video for everyone.
- Videos are never hosted. A card shows YouTube's own thumbnail. Pressing play swaps in YouTube's embedded player (the privacy-enhanced youtube-nocookie version). The title opens YouTube and the channel name opens the channel.
- Every video ID is checked with YouTube before it is saved, so made-up links are dropped.

**3. Learning is easier to read.** The breadcrumbs, tabs, card headings and card text on the Paths hub and every Playbook page now have strong contrast. HQ's curated videos are now a grid of thumbnails with the title under each one, instead of a dark tile. Compare `previews/00-learning-before.png` with `desk-14-learning-paths.png` and `desk-12-watch-and-learn.png`.

**4. AI Team is a regular chat unless a project is picked.**
- With "General (no project)", the team answers like a normal chatbot. It offers no "Approve & apply to a drawing set" card, no add-to-set suggestions, and does not pull in project memory.
- A line under the Project menu explains it: "Regular chat. Pick a project to turn on project thinking."
- Picking a project turns all of the project tools back on.

**5. Delete a conversation.** A 🗑 button appears on each conversation in the history list when you hover over it (it is always visible on phones), and one sits in the header of the open conversation. It asks first, then deletes the conversation and its messages.

**6. Slower transitions.** The Studio slide transitions now take about 3 seconds ("Quick") or 4 seconds ("Cinematic"). Before, they took 1.2 and 1.8 seconds.

**7. Legend bios and chime-ins.**
- Clicking a legend on the Arch Coach banner now opens a bio page with:
  - the portrait from the approved artwork
  - years and city, vision, style, what they are known for, and how they chime in
- On the bio page you can **Choose as my legend**. Legends still unlock at the XP set in v20; HQ can pick any.
- Your legend's bio adds **Ask in the AI Team** and **Stop using as my legend**.
- In the AI Team, under the latest answer, "**[Legend] can chime in on this**" with a **Hear from [surname]** button. The legend then answers in the thread with their own label and colour.
- Legends answer in the spirit of their documented work. They are told never to quote or invent facts about the real person, and every bio says it is DrawUp's interpretation, not an endorsement.

**8. The top header stays on screen.** On phones and desktop, the header (DrawUp logo, search, Get Started and menu) and the Season 1 tip-off bar now stay pinned at the top while you scroll. The Portal's header already stayed pinned, and it still does.
- The cause: an old rule meant to stop sideways scrolling had turned the page body into its own scroll box, so the pinned header scrolled away with it. The fix keeps sideways scrolling blocked and lets the header stick.
- **Back to the top:** tap any empty spot on the header or on the tip-off bar to scroll back to the top. A round ↑ button also appears at the bottom right after you scroll down a few screens, and it sits above the phone tab bar. Both work on the public site and in the Portal.
- The site runs inside a full-screen frame (`index.html`), so the iPhone's own "tap the clock" shortcut cannot scroll it. That is why the header tap and the ↑ button are there.

**9. One search.** Discover and the header's DrawUp search now run the same search.
- Each Discover search box has a **Search DrawUp →** button, and pressing Enter does the same thing. It runs the same full DrawUp search as the header, with the Discover tab as the type (Projects, Firms or People).
- Typing in a Discover box still filters the Discover list right away, as before.
- Signed in, results open in the Portal's DrawUp Search tab, with your words and type already filled in. Signed out, they open in the public search, exactly like the header's search.

## Tested

The tests ran on the real `drawup-preview.html`, with a stand-in database and stand-in API answers. They ran on desktop (1440 wide) and phone (390 wide), as a member and as HQ.
- The page had no errors.
- All 4 views and the video play button worked.
- The legend chime-in sent the right request and showed the answer.
- Deleting a conversation removed it.
- Choosing a legend saved it.
- TypeScript type-check passed.
- Header and search: 30 of 30 checks passed on phone and desktop, signed in and signed out (`_work/tests/test-nav-v28.js`; previews `nav-*.png`).

**The pictures and videos in the previews are labelled stand-ins.** This test machine cannot reach Wikimedia or YouTube. Real results show up once it is deployed. Each stand-in is marked "test data" or "stand-in".

Five bugs found in testing were fixed before packaging:
- The YouTube and "Draw it" buttons lost their job ticket after the first check, so they would have stopped after about 3 seconds.
- The delete button sat on top of the conversation title.
- Two bio portraits were cropped through the face.
- Video titles in the curated grid were grey instead of dark.
- On phones, the "Saved to Learning" link broke into a box.

## Open items

- **Your OK:** 1 credit for the AI YouTube search (`DRAWUP_VISUAL_VIDEO_COST`). The AI search also costs real OpenAI money. A free YouTube API key avoids both, so I recommend adding one.
- The photoreal AI 3D picture from v27 is not offered here, because it only works on a v27 review. The 3D button uses the v27 3D model view. It can be added later.
- Wikimedia pictures are free-licence photos and drawings, so for some topics there may be none. The DrawUp library and the four views still work.
