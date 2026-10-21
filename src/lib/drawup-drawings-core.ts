// V24 DrawUp "Draw it up": the AI reads a picture (photo, rendering, sketch, AI image or drawing) and returns ONE
// building model. The page then draws every sheet (plans, elevations, sections, details, schedules) from that one
// model, so tags, dimensions and levels agree across the whole set. The AI never draws the sheets itself.

export const DETAIL_CATEGORIES = ['Wall Sections', 'Exterior Walls', 'Roofs', 'Foundations', 'Slabs', 'Doors', 'Windows',
  'Storefront / Curtain Wall', 'Stairs', 'Railings', 'Restrooms / ADA', 'Millwork', 'Interiors', 'Ceilings', 'Structural',
  'MEP Coordination', 'Site', 'Fire / Life Safety', 'Typical Details', 'Custom'];

const num = { type: 'number' };
const str = { type: 'string' };
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const arr = (items: unknown) => ({ type: 'array', items });
const oneOf = (...values: string[]) => ({ type: 'string', enum: values });

export const DRAWINGS_SCHEMA = obj({
  title: str,
  building_use: str,
  summary: str,
  source_kind: oneOf('photo', 'rendering', 'sketch', 'drawing', 'ai_image', 'other'),
  dimension_basis: oneOf('given_by_user', 'read_from_drawing', 'estimated_from_picture'),
  stories: num,
  floor_to_floor_ft: num,
  footprint: obj({ width_ft: num, depth_ft: num }),
  wall_height_ft: num,
  floor_above_grade_in: num,
  roof: obj({
    type: oneOf('gable', 'shed', 'hip', 'flat'),
    pitch_rise_in_12: num,
    overhang_in: num,
    ridge_axis: oneOf('width', 'depth'),
    shed_high_side: oneOf('front', 'back', 'left', 'right'),
    roofing: str,
  }),
  foundation: obj({ type: oneOf('slab_on_grade', 'stem_wall', 'piers', 'crawlspace'), note: str }),
  wall_assembly: obj({ stud: oneOf('2x4', '2x6', 'cmu', 'steel_stud'), spacing_in: num, sheathing: str, wrb: str, cladding: str, insulation: str, interior_finish: str }),
  roof_framing: obj({ member: str, spacing_in: num, note: str }),
  porch: obj({ present: { type: 'boolean' }, side: oneOf('front', 'back', 'left', 'right'), depth_ft: num, length_ft: num, posts: str }),
  rooms: arr(obj({ name: str, level: num, x_ft: num, y_ft: num, w_ft: num, d_ft: num })),
  openings: arr(obj({
    kind: oneOf('door', 'double_door', 'overhead_door', 'window'),
    wall: oneOf('front', 'back', 'left', 'right'),
    level: num, center_ft: num, width_ft: num, height_ft: num, sill_ft: num, note: str,
  })),
  issues_in_source: arr(obj({ severity: oneOf('critical', 'major', 'minor'), issue: str, fix: str })),
  assumptions: arr(str),
  code_notes: arr(str),
  details_needed: arr(obj({ title: str, category: { type: 'string', enum: DETAIL_CATEGORIES }, why: str, location: str })),
  jurisdiction_note: str,
  next_steps: arr(obj({ title: str, why: str, kind: oneOf('detail', 'sheet', 'design', 'code', 'coordination', 'consultant'), instruction: str })),
  changes: arr(obj({ comment: num, element: str, what: str, done: { type: 'boolean' } })),
});

/** Explore mode: two or three different design directions, each a complete model. */
export const EXPLORE_SCHEMA = obj({ options: arr(obj({ name: str, idea: str, model: DRAWINGS_SCHEMA })) });

export const DRAWINGS_INSTRUCTIONS = `You are DrawUp's architectural documentation engine. The user gives you one or more pictures of a building
(photo, rendering, hand sketch, AI-generated image, or existing drawings) plus optional notes. Read them and return ONE coordinated
building model as JSON matching the schema. DrawUp draws the full sheet set (floor plans, roof plan, four exterior elevations,
building sections, wall section details, foundation + framing plans, door/window schedules) from your model, so every value must
describe the SAME building.

Coordinates and conventions:
- "front" is the main elevation in the picture (where the main entry usually is). width_ft runs left-to-right along the front.
  depth_ft runs from the front wall to the back wall.
- Rooms use plan coordinates in feet: x_ft from the front-left exterior corner toward the right, y_ft from the front wall toward the
  back. Rooms must sit inside the footprint and must not overlap. Use level 1 for the ground floor. A one-room building has one room.
- openings: center_ft is measured from the LEFT end of that wall as seen standing OUTSIDE looking at it. sill_ft is 0 for doors.
  Keep every opening fully on its wall with at least 0.5 ft to each corner and no overlaps on the same wall and level.
- wall_height_ft is the top-of-plate height of the eave (low) wall above the level 1 finished floor. For shed roofs the high wall
  follows from the pitch. stories x floor_to_floor_ft must fit under wall_height_ft.
- Use the pitch you see; flat roofs use 0.25. Overhang in inches (0 if none).

Dimensions: if the user gave dimensions or the drawing prints them, use them (dimension_basis given_by_user or read_from_drawing).
Otherwise estimate from doors (about 3 ft x 6.67 ft), people, cars, bricks or siding courses, and say so (estimated_from_picture),
listing each estimate in assumptions. Round to the nearest 2 inches.

Be a careful architect:
- issues_in_source: what in the picture is uncoordinated, missing, impossible, or a code or constructability concern (for AI images:
  views that disagree, dimensions that do not add up, missing headers, egress, accessibility, guards, load path...). Give the fix.
- details_needed: the construction details a buildable set of THIS building still needs drawn (for example roof-to-wall at the
  high eave, porch beam to post, door threshold at the slab, window sill flashing, guard attachment, footing at frost depth).
  Each with the DrawUp category, why it is needed, and where it occurs. 4 to 10 items, most important first.
- code_notes: model-code items to confirm (IBC / IRC / ADA as applicable), naming what the AHJ must confirm. Never claim compliance.
- assumptions: every value you assumed.
- next_steps: 3 to 6 concrete things to do next for THIS set (a sheet or detail to add, a design question to resolve, a code item to
  confirm, a consultant to bring in). instruction is written as a comment DrawUp can apply on the next revision, for example
  "Add a 36 in x 80 in man door on the left wall near the back corner".
- changes: return an empty list for a new set.
Use plain professional language. Do not invent a site, owner or address.`;

/** Added to the instructions for a quick schematic set. */
export const PRELIMINARY_NOTE = `MODE: PRELIMINARY (schematic design, school projects, competitions, brainstorming). Get the massing, footprint, rooms,
openings and roof right. Keep details_needed to the 3 to 5 most important. Keep issues and code notes short.`;
/** Added to the instructions for a full set. */
export const FULL_NOTE = `MODE: FULL SET (construction documents starting point). Be thorough: every opening, every room, all assemblies, 6 to 10
details_needed, and complete code_notes for the code analysis sheet.`;
/** Explore mode instructions (wraps the model rules above). */
export const EXPLORE_NOTE = `MODE: EXPLORE. Return 3 different design directions for the same program and site constraints as "options". Option 1
follows the picture as closely as possible. Options 2 and 3 each change one big idea (for example roof form, entry location,
room arrangement, porch, footprint proportion) and say what and why in "idea" (2 or 3 sentences). Each option's model follows every
rule below and stands on its own. Keep each option's details_needed to 3 to 5 items.`;

/** Revision mode: the member's comments on the previous set. */
export const REVISE_INSTRUCTIONS = `You are revising an existing DrawUp building model. You get the PREVIOUS MODEL (JSON), the member's numbered
COMMENTS (some pinned on a sheet, with a picture of the marked area: the red circle is where they clicked), and optional general notes.
Return the COMPLETE updated model in the same schema.
Rules:
- Change only what the comments ask for, plus what must change to stay coordinated (for example a moved door also moves its room
  door swing, a taller wall raises the roof). Everything else stays EXACTLY as it was: same values, same order of rooms and openings,
  same text. Consistency with the previous set matters more than anything else.
- In "changes" list every change: comment = the comment number it answers (0 if it was a coordination change), element (for
  example "Door 101" or "Roof pitch"), what changed with the old and new value, done = true. If a comment cannot be done, add an
  entry with done = false and say why in "what".
- Keep issues_in_source, assumptions and code_notes from before unless a comment changes them, and update next_steps for what is
  left to do. Add a details_needed item if a change creates a new condition that needs a detail.
Then follow the model rules below.

`;

export type DrawingModel = Record<string, any>;

/** Keeps the model inside drawable limits so a bad value can never break the sheets. */
export function cleanModel(m: any): DrawingModel {
  const n = (v: any, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  const s = (v: any, max = 400) => String(v ?? '').slice(0, max);
  const W = n(m?.footprint?.width_ft, 6, 400, 20), D = n(m?.footprint?.depth_ft, 6, 400, 16);
  const stories = Math.round(n(m?.stories, 1, 3, 1));
  const f2f = n(m?.floor_to_floor_ft, 8, 20, 10);
  const H = Math.max(n(m?.wall_height_ft, 7, 60, 9), (stories - 1) * f2f + 8);
  const wallLen = (w: string) => (w === 'front' || w === 'back' ? W : D);
  const openings = (Array.isArray(m?.openings) ? m.openings : []).slice(0, 60).map((o: any) => {
    const wall = ['front', 'back', 'left', 'right'].includes(o?.wall) ? o.wall : 'front';
    const L = wallLen(wall), width = n(o?.width_ft, 1, Math.max(1, L - 1), 3);
    const kind = ['door', 'double_door', 'overhead_door', 'window'].includes(o?.kind) ? o.kind : 'window';
    const level = Math.round(n(o?.level, 1, stories, 1));
    const height = n(o?.height_ft, 1, kind === 'window' ? 12 : 20, kind === 'window' ? 4 : 7);
    return { kind, wall, level, width_ft: width, height_ft: height,
      center_ft: n(o?.center_ft, width / 2 + 0.5, L - width / 2 - 0.5, L / 2),
      sill_ft: kind === 'window' ? n(o?.sill_ft, 0, 10, 3) : 0, note: s(o?.note, 160) };
  });
  const rooms = (Array.isArray(m?.rooms) ? m.rooms : []).slice(0, 40).map((r: any) => {
    const x = n(r?.x_ft, 0, W - 2, 0), y = n(r?.y_ft, 0, D - 2, 0);
    return { name: s(r?.name, 40) || 'Room', level: Math.round(n(r?.level, 1, stories, 1)), x_ft: x, y_ft: y, w_ft: n(r?.w_ft, 2, W - x, W - x), d_ft: n(r?.d_ft, 2, D - y, D - y) };
  });
  const list = (v: any, max: number, len = 300) => (Array.isArray(v) ? v : []).slice(0, max).map((x: any) => s(x, len)).filter(Boolean);
  const roofType = ['gable', 'shed', 'hip', 'flat'].includes(m?.roof?.type) ? m.roof.type : 'gable';
  const details = (Array.isArray(m?.details_needed) ? m.details_needed : []).slice(0, 12).map((x: any) => ({ title: s(x?.title, 120), category: DETAIL_CATEGORIES.includes(x?.category) ? x.category : 'Typical Details', why: s(x?.why, 300), location: s(x?.location, 160) })).filter((x: any) => x.title);
  // The sheets draw upper floors but not the stair, so a multi-story set always flags the stair detail.
  if (stories > 1 && !details.some((x: any) => x.category === 'Stairs')) details.push({ title: 'Interior stair section with guards and handrails', category: 'Stairs', why: 'The building has more than one floor; stair rise, run, headroom, guards and handrails must be detailed.', location: 'Stair between levels' });
  return {
    title: s(m?.title, 90) || 'DrawUp Building', building_use: s(m?.building_use, 120), summary: s(m?.summary, 1200),
    source_kind: s(m?.source_kind, 20), dimension_basis: s(m?.dimension_basis, 30),
    stories, floor_to_floor_ft: f2f, footprint: { width_ft: W, depth_ft: D }, wall_height_ft: H,
    floor_above_grade_in: n(m?.floor_above_grade_in, 0, 60, 8),
    roof: { type: roofType, pitch_rise_in_12: roofType === 'flat' ? 0.25 : n(m?.roof?.pitch_rise_in_12, 1, 18, 4),
      overhang_in: n(m?.roof?.overhang_in, 0, 48, 12), ridge_axis: m?.roof?.ridge_axis === 'depth' ? 'depth' : 'width',
      shed_high_side: ['front', 'back', 'left', 'right'].includes(m?.roof?.shed_high_side) ? m.roof.shed_high_side : 'back', roofing: s(m?.roof?.roofing, 120) },
    foundation: { type: ['slab_on_grade', 'stem_wall', 'piers', 'crawlspace'].includes(m?.foundation?.type) ? m.foundation.type : 'slab_on_grade', note: s(m?.foundation?.note, 200) },
    wall_assembly: { stud: ['2x4', '2x6', 'cmu', 'steel_stud'].includes(m?.wall_assembly?.stud) ? m.wall_assembly.stud : '2x6',
      spacing_in: n(m?.wall_assembly?.spacing_in, 12, 24, 16), sheathing: s(m?.wall_assembly?.sheathing, 120), wrb: s(m?.wall_assembly?.wrb, 120),
      cladding: s(m?.wall_assembly?.cladding, 120), insulation: s(m?.wall_assembly?.insulation, 120), interior_finish: s(m?.wall_assembly?.interior_finish, 120) },
    roof_framing: { member: s(m?.roof_framing?.member, 80) || '2x8 rafters', spacing_in: n(m?.roof_framing?.spacing_in, 12, 48, 16), note: s(m?.roof_framing?.note, 200) },
    porch: { present: !!m?.porch?.present, side: ['front', 'back', 'left', 'right'].includes(m?.porch?.side) ? m.porch.side : 'front',
      depth_ft: n(m?.porch?.depth_ft, 3, 30, 6), length_ft: n(m?.porch?.length_ft, 3, 400, 10), posts: s(m?.porch?.posts, 80) },
    rooms, openings,
    issues_in_source: (Array.isArray(m?.issues_in_source) ? m.issues_in_source : []).slice(0, 20).map((x: any) => ({ severity: ['critical', 'major', 'minor'].includes(x?.severity) ? x.severity : 'minor', issue: s(x?.issue, 300), fix: s(x?.fix, 300) })).filter((x: any) => x.issue),
    assumptions: list(m?.assumptions, 20), code_notes: list(m?.code_notes, 14),
    details_needed: details,
    jurisdiction_note: s(m?.jurisdiction_note, 400),
    next_steps: (Array.isArray(m?.next_steps) ? m.next_steps : []).slice(0, 8).map((x: any) => ({ title: s(x?.title, 160), why: s(x?.why, 400), kind: ['detail', 'sheet', 'design', 'code', 'coordination', 'consultant'].includes(x?.kind) ? x.kind : 'design', instruction: s(x?.instruction, 600) })).filter((x: any) => x.title),
    changes: (Array.isArray(m?.changes) ? m.changes : []).slice(0, 40).map((x: any) => ({ comment: Math.round(n(x?.comment, 0, 99, 0)), element: s(x?.element, 120), what: s(x?.what, 400), done: x?.done !== false })).filter((x: any) => x.what),
  };
}

/** De-dup key for the shared detail database, same style as drawup-details.ts. */
export function detailKey(title: string) {
  const FILL = new Set('a an the of at for and to on in with typical detail details new'.split(' '));
  const words = String(title).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w && !FILL.has(w)).map(w => w.replace(/(?<=[a-z]{3})s$/, ''));
  return [...new Set(words)].sort().join(' ').slice(0, 160);
}
