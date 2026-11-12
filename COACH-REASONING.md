# How the DrawUp assistants reason (v32)

Arch Coach, Teammate, 6th Man and every Hall of Fame legend now differ in how they think, not only in how they sound.
The difference is built into the server prompts in `src/lib/drawup-reasoning.ts`. It is used by the team chat
(`buildTeamPrompt`, background jobs), the Arch Coach page (`/api/arch-coach`) and the legend second opinion
(`/api/arch-coach/legend`).

## The lens

Each profile has a lens with seven parts: what it notices first, how it reads the problem, which questions matter,
how it develops a solution, how it communicates, how it explains trade-offs, and which knowledge it leans on.

| Profile | Reasons as | Notices first |
|---|---|---|
| Arch Coach | instructor | the principle being tested (scale, proportion, hierarchy, circulation, code) |
| Teammate | design collaborator | the intent and atmosphere the user wants |
| 6th Man | troubleshooter | the most likely root causes, ranked, and how to test fixes in the model |
| Legends | their documented work | e.g. Pei: geometry and toplight; Ando: the quality of emptiness and light; Khan: legible structure |

Legend lenses list only documented facts (works and dates) plus where to check them (`sources`). A legend added to
`arch_coach_legends` without a lens falls back to its principles and is told to leave out anything it is not sure
is documented.

## Request types

Each message is classified (quick, technical, critique, learning, brainstorm, troubleshoot, general). The type sets
the depth and the output budget, and each profile has its own way of handling each type. Technical and learning
answers get full depth even when the member prefers concise answers.

## Shared standards

`SHARED_STANDARDS` is added before every lens: accuracy over personality, name the code edition, say when unsure,
never invent quotes, never claim compliance, never trade away safety or accessibility.

## Tests

- `node tests/coach-reasoning/test-reasoning.js` runs all 13 profiles against the same 7 scenarios with the real prompt
  builders (no AI) and writes `tests/coach-reasoning/out/reasoning-report.json`.
- `OPENAI_API_KEY=... node tests/coach-reasoning/live-compare.js lobby` sends the student center lobby to every
  profile live and writes the replies side by side with their overlap.

To add a legend: add its row in SQL, then a `LEGEND_LENSES` entry with documented facts and sources, then run the test.
