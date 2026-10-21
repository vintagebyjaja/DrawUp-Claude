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
Be specific and practical. This is learning / design-development content: a licensed professional must verify it.`;

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
  };
}
