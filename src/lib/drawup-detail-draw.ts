// DrawUp v25.1 "Draw a detail" (Details tab): one uploaded detail in (picture / PDF page), one clean detail out.
// The AI reads the detail, lists what is wrong with it (why each item matters, the fix, and the reference), and
// returns the corrected detail as a drawing model in real inches. The page draws it with the Detail Library kit
// (drawup-details-kit-v21.js) at a standard architectural scale, so the PDF prints true to scale, and it is saved in
// the Detail Catalog (details.source = 'drawup_ai', SQL v25.1-02).

export const DETAIL_CATEGORIES = ['Wall Sections', 'Exterior Walls', 'Roofs', 'Foundations', 'Slabs', 'Doors', 'Windows', 'Storefront / Curtain Wall', 'Stairs', 'Railings', 'Restrooms / ADA', 'Millwork', 'Interiors', 'Ceilings', 'Structural', 'MEP Coordination', 'Site', 'Fire / Life Safety', 'Typical Details', 'Custom'];
/** Material hatches the kit can draw (drawup-details-kit-v21.js FILL). */
export const DETAIL_FILLS = ['conc', 'earth', 'grav', 'sand', 'rigid', 'gyp', 'brick', 'cmu', 'ply', 'wood', 'mw', 'tile', 'act', 'stone', 'steel', 'alum', 'glass', 'seal', 'white', 'none', 'gray', 'dark'];
const KINDS = ['rect', 'poly', 'polyline', 'line', 'circle', 'batt', 'blk', 'blk1', 'brk'];
const WEIGHTS = ['h', 'm', 'l', 'x'];
const DASHES = ['none', 'hid', 'cen', 'wrb', 'vr'];
const SEVERITIES = ['critical', 'major', 'minor'];

const str = { type: 'string' };
const num = { type: 'number' };
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const arr = (items: unknown) => ({ type: 'array', items });
const point = arr(num);

export const DETAIL_SCHEMA = obj({
  is_detail: { type: 'boolean' },
  source_reading: str,
  title: str,
  category: { type: 'string', enum: DETAIL_CATEGORIES },
  material: str,
  assembly: str,
  summary: str,
  flaws: arr(obj({ severity: { type: 'string', enum: SEVERITIES }, flaw: str, why: str, fix: str, reference: str })),
  drawing: obj({
    view: str,
    elements: arr(obj({ kind: { type: 'string', enum: KINDS }, pts: arr(point), fill: { type: 'string', enum: DETAIL_FILLS }, weight: { type: 'string', enum: WEIGHTS }, dash: { type: 'string', enum: DASHES } })),
    notes: arr(obj({ x: num, y: num, text: str })),
    dims: arr(obj({ x1: num, y1: num, x2: num, y2: num, label: str, offset: num })),
  }),
  general_notes: arr(str),
  assumptions: arr(str),
  // v25.1-03: where the detail sits in its set, what is still missing, and (on a revision) what changed.
  sheet_ref: obj({ detail_no: str, sheet_no: str, project_name: str, revision: str, date: str }),
  needs_more_info: { type: 'boolean' },
  info_requests: arr(str),
  changes: arr(obj({ comment: str, what: str, done: { type: 'boolean' } })),
});

export const DETAIL_INSTRUCTIONS = `You are a senior architect and building-envelope consultant at DrawUp. A member uploaded ONE construction
detail (a picture, a PDF page, a sketch, or a CAD/BIM export) and wants it checked and redrawn as ONE clean, corrected detail.
Do not design a building or a drawing set. Work only on this detail.

1. source_reading: say in 1-3 sentences what the upload shows (assembly, view, materials, any scale or dimensions you can read).
   is_detail = false only if the upload is clearly not a construction detail; still return the closest useful detail from the notes.
2. flaws: every real problem in the uploaded detail, most serious first: missing or wrong flashing, water / air / vapor / thermal
   control layers that are discontinuous or in the wrong order, missing ventilation, drainage, slope, laps, sealant joints, backer
   rod, fasteners, blocking, fire or code items, accessibility, structural support, wrong material sizes, drafting errors
   (missing notes, dimensions, scale, line weights, hatches). For each: flaw (what is wrong, where), why (the reason it matters:
   the failure it causes, building science, or the code requirement), fix (exactly what the clean detail does instead) and
   reference (model code section, standard or manufacturer guidance, for example "IRC R905.2.8.5" or "ASTM E2112"; "" if none;
   never invent section numbers you are not sure of, say "verify with the adopted code" instead).
3. drawing: the CORRECTED detail, complete, drawn as a real architectural detail.
   - Units are REAL INCHES at full size. x to the right, y UP. Put the origin at a clear reference point (for example the top of
     the wall plate or the top of slab) so most coordinates are small. Use true member sizes (2x6 = 1.5 x 5.5, 2x10 = 1.5 x 9.25,
     1/2" sheathing = 0.5, 5/8" gypsum = 0.625, 3/4" plywood = 0.75). Keep the drawing inside about 60 x 50 in; use break lines
     ("brk") where long members are cut off. DrawUp picks the drawing scale to fit, so draw everything at full size.
   - elements: kind rect = pts [[x1,y1],[x2,y2]] opposite corners; poly = closed polygon (3+ points); polyline = open line through
     the points; line = 2 points; circle = [[cx,cy],[radius,0]]; batt = batt insulation in the rectangle [[x1,y1],[x2,y2]];
     blk = lumber cut in section (box with an X) [[x1,y1],[x2,y2]]; blk1 = lumber seen in elevation (one diagonal); brk = break
     line from point 1 to point 2. fill = the material hatch (conc concrete, earth, grav gravel, sand, rigid insulation, gyp gypsum,
     brick, cmu, ply plywood/OSB, wood, mw mineral wool, tile, act ceiling tile, stone, steel, alum aluminum, glass, seal
     sealant/membrane (solid black), white plain, gray, dark, none) - use "none" for lines. weight: h = cut profile (heavy), m =
     object, l = light / beyond, x = hatch-weight. dash: none, hid (hidden), cen (centerline), wrb (membranes / WRB), vr (vapor
     retarder). Draw thin layers (membranes, flashing, WRB) as polylines or thin rects so they read; show laps.
   - Order matters: draw big materials first, thin layers and lines after, so nothing important is covered.
   - notes: a leader note for every material and every fix (x, y = the point the arrow touches, inside that material; text short,
     like a construction document note, e.g. "SELF-ADHERED ICE BARRIER, 24 IN MIN. INSIDE EXT. WALL LINE"). 8 to 18 notes.
   - dims: 2 to 6 key dimensions, horizontal (y1 = y2) or vertical (x1 = x2) only; offset moves the dimension line (inches,
     positive = up / right); label like 1'-6" or 24" MIN.
   - view: the view name, e.g. "SECTION AT EAVE".
4. general_notes: 2-6 notes that apply to the whole detail. assumptions: what you assumed (code edition, climate zone, sizes).
5. sheet_ref: read the detail's own reference if it is visible: detail_no from the detail bubble or view title (for example "C2",
   "D4" or "3"), sheet_no from the bubble's lower half or the sheet's title block (for example "A601"), project_name, revision
   (for example "2" or "Rev 2") and date from the title block. Use the values in MEMBER NOTES / SET REFERENCE when given.
   "" for anything you cannot read; never invent them.
6. needs_more_info: true when the upload is not enough to draw this detail accurately (cut off, too blurry, a key layer or size
   unreadable, or it depends on another view: the wall section, the window product, the structure, the roof slope). Then
   info_requests lists 1-4 specific things to upload, each one sentence, naming the sheet or view when you can (for example
   "A screenshot of section 3/A301 showing the wall layers above this window" or "The window manufacturer's head detail").
   Still draw the best detail you can. false and [] when the detail is complete enough.
7. changes: [] for a first drawing. On a REVISION (PREVIOUS DETAIL is given) one entry per comment: comment = its number,
   what = what you changed for it, done = false if you could not do it (say why in what).
Be specific and practical. This is learning / design-development content: a licensed professional must verify it.`;

/** Added to the instructions when a detail is revised from comments or upgraded with more pictures. */
export const REVISE_INSTRUCTIONS = `
THIS IS A REVISION. PREVIOUS DETAIL is the current drawing model (same units and origin) with its flaws list. COMMENTS are what
the member and their team want changed; a comment with AT x,y points to that spot in the drawing (real inches, same origin).
NEW PICTURES (if any) are extra screenshots or set pages the member added so the detail can be more accurate.
- Do every comment. Keep everything a comment does not touch exactly as it was (same coordinates, notes and dims), so the
  revision only changes what was asked, plus anything the new pictures prove was wrong.
- flaws: the flaws of the ORIGINAL upload that still matter, plus any new ones the new pictures show.
- Re-check needs_more_info: set it false once the new pictures answer the earlier requests.`;

/** "C2 / A601" -> "C2-A601" (Details lookup key). */
export function sheetRefOf(detailNo: string, sheetNo: string) {
  const d = String(detailNo || '').toUpperCase().replace(/[^A-Z0-9.]/g, ''), sh = String(sheetNo || '').toUpperCase().replace(/[^A-Z0-9.]/g, '');
  return d && sh ? `${d}-${sh}` : '';
}

/* ------------------------------------------------------------------ Ask the team about a detail */
export const ASK_SCHEMA = obj({
  speaker: { type: 'string', enum: ['Arch Coach', 'Teammate', '6th Man'] },
  verdict: { type: 'string', enum: ['looks_right', 'needs_changes', 'needs_more_info', 'answer'] },
  answer: str,
  suggestions: arr(str),
  info_requests: arr(str),
});
export const ASK_INSTRUCTIONS = `You are DrawUp's AI design team answering a question about ONE construction detail (Arch Coach: codes, building science
and constructability; Teammate: drafting and coordination; 6th Man: the blunt second opinion). Pick the speaker who fits the question.
You get the detail's drawing model (real inches, x right, y up), its notes and dimensions, the flaws DrawUp already found, the
earlier questions and answers, and the member's new question.
- answer: 2-8 sentences, direct and practical. Say plainly whether the detail is right for the stated conditions, and what is
  missing or wrong. Cite the code or standard only when you are sure (otherwise "verify with the adopted code").
- verdict: looks_right, needs_changes, needs_more_info, or answer (a plain question that is not a check).
- suggestions: 0-5 change instructions, each one sentence, written so they can be pasted as a comment for the next revision
  (for example "Lap the WRB over the head flashing 2 in min. and tape the top edge").
- info_requests: 0-3 things to upload (a screenshot of another view, a product detail, the set page) if you need them.
This is design-development guidance; a licensed professional must verify it.`;
export function cleanAsk(m: any) {
  const list = (v: any, k: number, max: number) => (Array.isArray(v) ? v : []).slice(0, k).map((x: any) => s(x, max)).filter(Boolean);
  return {
    speaker: pick(m?.speaker, ['Arch Coach', 'Teammate', '6th Man'], 'Arch Coach'),
    verdict: pick(m?.verdict, ['looks_right', 'needs_changes', 'needs_more_info', 'answer'], 'answer'),
    answer: s(m?.answer, 3000) || 'The team could not answer that. Try asking it another way.',
    suggestions: list(m?.suggestions, 5, 300),
    info_requests: list(m?.info_requests, 3, 300),
  };
}

const n = (v: any, lo: number, hi: number, d = 0) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const s = (v: any, max = 400) => String(v ?? '').slice(0, max);
const pick = (v: any, list: string[], d: string) => (list.includes(v) ? v : d);
const LIMIT = 2000; // inches

/** Keeps the detail inside drawable limits so a bad value can never break the page. */
export function cleanDetail(m: any) {
  const pts = (list: any) => (Array.isArray(list) ? list : []).slice(0, 200).map((p: any) => [n(p?.[0], -LIMIT, LIMIT), n(p?.[1], -LIMIT, LIMIT)]);
  const elements = (Array.isArray(m?.drawing?.elements) ? m.drawing.elements : []).slice(0, 500)
    .map((e: any) => ({ kind: pick(e?.kind, KINDS, 'line'), pts: pts(e?.pts), fill: pick(e?.fill, DETAIL_FILLS, 'none'), weight: pick(e?.weight, WEIGHTS, 'm'), dash: pick(e?.dash, DASHES, 'none') }))
    .filter((e: any) => e.pts.length >= (e.kind === 'poly' ? 3 : 2));
  return {
    is_detail: m?.is_detail !== false,
    source_reading: s(m?.source_reading, 800),
    title: s(m?.title, 120) || 'Corrected Detail',
    category: pick(m?.category, DETAIL_CATEGORIES, 'Typical Details'),
    material: s(m?.material, 60), assembly: s(m?.assembly, 60), summary: s(m?.summary, 1200),
    flaws: (Array.isArray(m?.flaws) ? m.flaws : []).slice(0, 25).map((f: any) => ({ severity: pick(f?.severity, SEVERITIES, 'minor'), flaw: s(f?.flaw, 400), why: s(f?.why, 600), fix: s(f?.fix, 600), reference: s(f?.reference, 160) })).filter((f: any) => f.flaw),
    drawing: {
      view: s(m?.drawing?.view, 60) || 'SECTION',
      elements,
      notes: (Array.isArray(m?.drawing?.notes) ? m.drawing.notes : []).slice(0, 24).map((x: any) => ({ x: n(x?.x, -LIMIT, LIMIT), y: n(x?.y, -LIMIT, LIMIT), text: s(x?.text, 160) })).filter((x: any) => x.text),
      dims: (Array.isArray(m?.drawing?.dims) ? m.drawing.dims : []).slice(0, 10).map((x: any) => ({ x1: n(x?.x1, -LIMIT, LIMIT), y1: n(x?.y1, -LIMIT, LIMIT), x2: n(x?.x2, -LIMIT, LIMIT), y2: n(x?.y2, -LIMIT, LIMIT), label: s(x?.label, 30), offset: n(x?.offset, -200, 200) })).filter((x: any) => x.label),
    },
    general_notes: (Array.isArray(m?.general_notes) ? m.general_notes : []).slice(0, 8).map((x: any) => s(x, 300)).filter(Boolean),
    assumptions: (Array.isArray(m?.assumptions) ? m.assumptions : []).slice(0, 8).map((x: any) => s(x, 300)).filter(Boolean),
    sheet_ref: { detail_no: s(m?.sheet_ref?.detail_no, 12).trim(), sheet_no: s(m?.sheet_ref?.sheet_no, 16).trim(), project_name: s(m?.sheet_ref?.project_name, 120).trim(), revision: s(m?.sheet_ref?.revision, 20).trim(), date: s(m?.sheet_ref?.date, 30).trim() },
    needs_more_info: m?.needs_more_info === true,
    info_requests: (Array.isArray(m?.info_requests) ? m.info_requests : []).slice(0, 4).map((x: any) => s(x, 300)).filter(Boolean),
    changes: (Array.isArray(m?.changes) ? m.changes : []).slice(0, 30).map((c: any) => ({ comment: s(c?.comment, 12), what: s(c?.what, 400), done: c?.done !== false })).filter((c: any) => c.what),
  };
}
