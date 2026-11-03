// V29 Draw Workspace 2.0: what the AI is asked for when it reads a picture into an editable plan, or turns a
// plain-English change into geometry operations, and the cleaners that keep its answers inside safe bounds.
// The AI never draws: it returns positions in the picture's pixels (or inches for perspective pictures), and the page
// turns those into walls, openings, rooms and library components (drawup-draw-ws-geo-v29.js, fromInterpretation).

const num = (v: unknown, lo: number, hi: number, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const str = (v: unknown, max: number) => String(v ?? '').slice(0, max).trim();
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const PT = { type: 'object', additionalProperties: false, required: ['x', 'y'], properties: { x: { type: 'number' }, y: { type: 'number' } } } as const;
const PT_OR_NULL = { anyOf: [PT, { type: 'null' }] } as const;
const NUM_OR_NULL = { type: ['number', 'null'] } as const;
const STR_OR_NULL = { type: ['string', 'null'] } as const;

export const SOURCE_KINDS = ['floor_plan', 'sketch', 'photo', 'axonometric', 'perspective', 'elevation', 'other'] as const;
export const WALL_KINDS = ['exterior', 'interior', 'storefront', 'low'] as const;
export const OPENING_KINDS = ['door', 'double_door', 'storefront_door', 'window', 'storefront_glass', 'cased'] as const;
export const ZONES = ['retail', 'seating', 'queue', 'service', 'back_of_house', 'production', 'circulation', 'restroom', 'living', 'sleeping', 'kitchen', 'wet', 'storage', 'outdoor', 'other'] as const;
export const SCALE_BASES = ['scale_bar', 'dimension_text', 'room_dims', 'typical_door', 'assumed'] as const;
export const ROOF_TYPES = ['none', 'flat', 'shed', 'gable', 'hip'] as const;
// Library keys the AI may use (drawup-draw-lib-v29.js). Anything else is kept as a note, not drawn.
export const COMPONENT_TYPES = [
  'chair', 'bar_stool', 'sofa', 'armchair', 'bench', 'booth', 'cafe_table', 'table_round', 'dining_table', 'bar_table', 'coffee_table', 'rug',
  'bed_queen', 'bed_king', 'bed_twin', 'nightstand', 'dresser', 'wardrobe', 'closet_rod', 'bookshelf',
  'base_cabinet', 'upper_cabinet', 'island', 'kitchen_sink', 'range', 'fridge', 'dishwasher', 'washer_dryer',
  'toilet', 'lav', 'lav_vanity', 'tub', 'shower', 'urinal',
  'wall_shelving', 'gondola', 'display_table', 'display_case', 'checkout', 'checkout_u', 'counter_oval', 'counter_curve', 'stanchion', 'queue_line', 'mannequin', 'kiosk', 'podium',
  'desk', 'desk_l', 'task_chair', 'conference', 'reception', 'file_cabinet',
  'prep_table', 'comp_sink', 'oven', 'production_line', 'walk_in', 'mop_sink', 'water_heater', 'vending',
  'pendant', 'downlight', 'linear_light', 'floor_lamp', 'wall_sign', 'blade_sign', 'person', 'car', 'tree', 'shrub', 'planter', 'planter_box',
] as const;

export const INTERPRET_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['source_kind', 'building_type', 'frame', 'image', 'scale', 'walls', 'openings', 'rooms', 'components', 'unknowns', 'assumptions', 'roof', 'notes'],
  properties: {
    source_kind: { type: 'string', enum: SOURCE_KINDS },
    building_type: { type: 'string' },
    frame: { type: 'string', enum: ['image_px', 'plan_in'] },
    image: { type: 'object', additionalProperties: false, required: ['w', 'h'], properties: { w: { type: 'number' }, h: { type: 'number' } } },
    scale: { type: 'object', additionalProperties: false, required: ['inches_per_px', 'basis', 'note'], properties: { inches_per_px: NUM_OR_NULL, basis: { type: 'string', enum: SCALE_BASES }, note: { type: 'string' } } },
    walls: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'a', 'b', 'thickness_px', 'kind', 'curved_through', 'confidence'], properties: { id: { type: 'string' }, a: PT, b: PT, thickness_px: NUM_OR_NULL, kind: { type: 'string', enum: WALL_KINDS }, curved_through: PT_OR_NULL, confidence: { type: 'number' } } } },
    openings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['wall_id', 'kind', 'at', 'width_px', 'confidence'], properties: { wall_id: STR_OR_NULL, kind: { type: 'string', enum: OPENING_KINDS }, at: PT, width_px: NUM_OR_NULL, confidence: { type: 'number' } } } },
    rooms: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'zone', 'label_at', 'dims_text', 'poly'], properties: { name: { type: 'string' }, zone: { type: 'string', enum: ZONES }, label_at: PT, dims_text: STR_OR_NULL, poly: { type: 'array', items: PT } } } },
    components: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['type', 'label', 'at', 'w_px', 'd_px', 'rot', 'note'], properties: { type: { type: 'string', enum: COMPONENT_TYPES }, label: { type: 'string' }, at: PT, w_px: NUM_OR_NULL, d_px: NUM_OR_NULL, rot: { type: 'number' }, note: STR_OR_NULL } } },
    unknowns: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['what', 'at'], properties: { what: { type: 'string' }, at: PT_OR_NULL } } },
    assumptions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'kind'], properties: { text: { type: 'string' }, kind: { type: 'string', enum: ['scale', 'dimension', 'height', 'walls', 'layout', 'use', 'roof'] } } } },
    roof: { type: 'object', additionalProperties: false, required: ['type', 'pitch'], properties: { type: { type: 'string', enum: ROOF_TYPES }, pitch: NUM_OR_NULL } },
    notes: { type: 'string' },
  },
} as const;

export const INTERPRET_INSTRUCTIONS = `You read one architectural picture (a floor plan, a hand sketch, a rendering, an axonometric or a photo) and describe its layout so DrawUp can rebuild it as an EDITABLE plan. You never draw. You only report positions.
COORDINATES: for floor plans and sketches seen from above, use frame "image_px": x to the right and y down, in pixels of the picture as sent (image.w x image.h). For perspective pictures, axonometrics and photos, use frame "plan_in": estimate a top-down plan in inches, x east and y south, origin at the north-west corner, and say in notes that the plan is estimated from a perspective view.
WALLS: one entry per straight wall run, drawn along the wall's CENTERLINE, end to end. Walls that meet share end points exactly. Keep walls that run straight across or up the picture exactly level or plumb. A curved wall or curved storefront is one entry from end to end with curved_through set to a point on the curve near its middle. kind: exterior (outside walls), interior (partitions), storefront (glazed shop fronts), low (half walls and pony walls). thickness_px is the drawn wall thickness.
OPENINGS: doors, windows, storefront doors and glazing, and cased openings (gaps between rooms with no door). at = the centre of the opening on its wall. width_px = clear width.
ROOMS AND ZONES: one entry per room or zone with its name exactly as written (or a plain name if none, such as SEATING, QUEUE, BACK OF HOUSE). zone sorts it: for shops and food service use retail, seating, queue, service (counters), production, back_of_house, restroom; for homes use living, sleeping, kitchen, wet, storage, circulation. dims_text = a size written on the plan such as 13' x 17', or null. poly = the room's outline corners when it is clear, otherwise [].
COMPONENTS: furniture, fixtures, equipment, counters and displays you can see, using the closest library type. A curved, oval or racetrack counter (such as a doughnut production counter) is counter_oval or counter_curve; a U-shaped checkout is checkout_u; a line of stanchions is queue_line; merchandise shelving islands are gondola; feature tables are display_table; a conveyor or production line is production_line. w_px and d_px are the overall footprint along and across the item at its rotation (rot, degrees clockwise). Do not list items you cannot see.
SCALE: if the picture has a scale bar or written dimensions, set inches_per_px from it and say how (basis scale_bar or dimension_text). Otherwise give your best estimate from typical sizes (doors about 34 in, chairs about 18 in) with basis assumed. Never claim measured accuracy.
UNKNOWNS: anything you cannot read (hidden areas, cropped edges, unclear symbols), with a point when you can. ASSUMPTIONS: every guess you made, in a short sentence each.
ROOF: only when the picture shows it; otherwise type none.
Never include brand names, logos or trademarked words from the picture in names or labels; use generic names (for example PRODUCTION COUNTER, not a company name).`;

export const EDIT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['summary', 'clarify', 'choices', 'ops'],
  properties: {
    summary: { type: 'string' },
    clarify: STR_OR_NULL,
    choices: { type: 'array', items: { type: 'string' } },
    ops: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['op', 'args_json'], properties: { op: { type: 'string' }, args_json: { type: 'string' } } } },
  },
} as const;

export const EDIT_OPS = ['move', 'remove', 'roof', 'ceiling', 'curve_wall', 'straighten', 'wall_height', 'wall_thickness', 'wall_length', 'wall_type', 'opening_size', 'add_opening', 'item_size', 'rotate', 'add_wall', 'add_room', 'rename_room', 'add_component', 'replace_component', 'finish'] as const;

export const EDIT_INSTRUCTIONS = `You change an architectural floor plan for a member by returning geometry operations. You do not draw; DrawUp applies the operations, shows the member a preview and waits for them to confirm.
The plan is described in the DRAWING text: inches, x east, y south, every wall, opening, room and component with its id.
Return ops in order. Each op has "op" and "args_json", a JSON object string with the op's arguments:
move {target:{type:'wall'|'item'|'room'|'opening', id}, dx, dy} · remove {target:{type,id}} · roof {type:'flat'|'shed'|'gable'|'hip'|'none', pitch (inches per foot), overhang, ridge:'x'|'y'} · ceiling {room:id|'all', height} · curve_wall {id, bulge (inches, + bows to the wall's left)} · straighten {id: curve id} · wall_height {id|'all', height} · wall_thickness {id, thickness} · wall_length {id, length, anchor:'a'|'b'} · wall_type {id, wtype} · opening_size {id, width, head, sill} · add_opening {wall, kind:'door'|'window'|'cased', offset, width} · item_size {id, w, d, h} · rotate {target:{type,id}, deg} · add_wall {a:{x,y}, b:{x,y}, wtype} · add_room {name, at:{x,y}, ceiling} · rename_room {id, name} · add_component {comp: library key, at:{x,y}, rot, w, d, h} · replace_component {id, comp, keepSize} · finish {room:id|'all', floor, wall, ceiling, accent}.
Library keys: ${COMPONENT_TYPES.join(', ')}.
Lengths are inches. Keep furniture inside rooms and clear of walls and door swings. Keep at least 36 in clear paths and 44 in in commercial aisles.
If the request is ambiguous (for example "move the counter" when there are two), return no ops, set clarify to one short question and list up to 4 choices. If it cannot be done with these ops, return no ops and say why in summary.
summary is one plain sentence saying what will change. Never claim the result is construction-ready.`;

type P = { x: number; y: number };
const pt = (v: any, lim = 1e5): P | null => (v && Number.isFinite(Number(v.x)) && Number.isFinite(Number(v.y)) ? { x: Math.round(num(v.x, -lim, lim) * 10) / 10, y: Math.round(num(v.y, -lim, lim) * 10) / 10 } : null);
const plainName = (v: unknown, max: number) => str(v, max).replace(/[™®©]/g, '');

/** Keeps an interpretation inside the schema's ranges and limits. Brand-like words are left to the page to rename. */
export function cleanInterpretation(raw: any, image?: { w: number; h: number }) {
  const frame = raw?.frame === 'plan_in' ? 'plan_in' : 'image_px';
  const lim = frame === 'plan_in' ? 24000 : 20000;
  const walls = (Array.isArray(raw?.walls) ? raw.walls : []).slice(0, 400).map((w: any, i: number) => {
    const a = pt(w?.a, lim), b = pt(w?.b, lim); if (!a || !b) return null;
    const ct = pt(w?.curved_through, lim);
    return { id: str(w?.id, 24) || 'w' + i, a, b, thickness_px: w?.thickness_px > 0 ? num(w.thickness_px, 0.5, 400) : null, kind: pick(w?.kind, WALL_KINDS, 'interior'), curved: ct ? { through: ct } : null, confidence: num(w?.confidence, 0, 1, 0.5) };
  }).filter(Boolean);
  const openings = (Array.isArray(raw?.openings) ? raw.openings : []).slice(0, 300).map((o: any) => {
    const at = pt(o?.at, lim); if (!at) return null;
    return { wall_id: o?.wall_id ? str(o.wall_id, 24) : null, kind: pick(o?.kind, OPENING_KINDS, 'door'), at, width_px: o?.width_px > 0 ? num(o.width_px, 1, 4000) : 0, confidence: num(o?.confidence, 0, 1, 0.5) };
  }).filter(Boolean);
  const rooms = (Array.isArray(raw?.rooms) ? raw.rooms : []).slice(0, 120).map((r: any) => {
    const at = pt(r?.label_at, lim); if (!at) return null;
    const poly = (Array.isArray(r?.poly) ? r.poly : []).slice(0, 64).map((p: any) => pt(p, lim)).filter(Boolean);
    return { name: plainName(r?.name, 40) || 'ROOM', kind: pick(r?.zone, ZONES, 'other'), label_at: at, dims_text: r?.dims_text ? str(r.dims_text, 30) : null, poly: poly.length >= 3 ? poly : [] };
  }).filter(Boolean);
  const components = (Array.isArray(raw?.components) ? raw.components : []).slice(0, 400).map((c: any) => {
    const at = pt(c?.at, lim); if (!at) return null;
    return { type: pick(c?.type, COMPONENT_TYPES, 'cafe_table'), label: plainName(c?.label, 60), at, w_px: c?.w_px > 0 ? num(c.w_px, 1, 8000) : 0, d_px: c?.d_px > 0 ? num(c.d_px, 1, 8000) : 0, rot: num(c?.rot, -360, 360), note: c?.note ? str(c.note, 40) : '' };
  }).filter(Boolean);
  const scale = raw?.scale || {};
  return {
    by: 'ai', frame, source_kind: pick(raw?.source_kind, SOURCE_KINDS, 'floor_plan'), building_type: str(raw?.building_type, 60),
    image: { w: num(raw?.image?.w || image?.w, 1, 20000, image?.w || 1000), h: num(raw?.image?.h || image?.h, 1, 20000, image?.h || 1000) },
    scale: { inches_per_px: scale.inches_per_px > 0 ? num(scale.inches_per_px, 0.001, 1000) : null, basis: pick(scale.basis, SCALE_BASES, 'assumed'), note: str(scale.note, 300) },
    walls, openings, rooms, components,
    unknowns: (Array.isArray(raw?.unknowns) ? raw.unknowns : []).slice(0, 30).map((u: any) => ({ what: str(u?.what, 300), at: pt(u?.at, lim) })).filter((u: any) => u.what),
    assumptions: (Array.isArray(raw?.assumptions) ? raw.assumptions : []).slice(0, 30).map((a: any) => ({ text: str(a?.text, 300), kind: str(a?.kind, 20) || 'layout' })).filter((a: any) => a.text),
    roof: raw?.roof && raw.roof.type !== 'none' && ROOF_TYPES.includes(raw.roof.type) ? { type: raw.roof.type, pitch: raw.roof.pitch > 0 ? num(raw.roof.pitch, 0, 24) : (raw.roof.type === 'flat' ? 0 : 6) } : null,
    notes: str(raw?.notes, 1200),
  };
}

/** Parses the ops' args and drops any op DrawUp does not know. The page validates each op again when it applies it. */
export function cleanEdit(raw: any) {
  const ops = (Array.isArray(raw?.ops) ? raw.ops : []).slice(0, 40).map((o: any) => {
    if (!EDIT_OPS.includes(o?.op)) return null;
    let args: any = {}; try { args = JSON.parse(String(o.args_json || '{}')); } catch { return null; }
    if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
    return { ...args, op: o.op };
  }).filter(Boolean);
  return { summary: str(raw?.summary, 400), clarify: raw?.clarify ? str(raw.clarify, 300) : null, choices: (Array.isArray(raw?.choices) ? raw.choices : []).slice(0, 4).map((c: unknown) => str(c, 120)).filter(Boolean), ops };
}
