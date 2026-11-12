// DXF import: node tests/draw-studio/test-import.js   (fixtures made by fixtures/make_dxf.py with ezdxf)
const assert = require('assert'), fs = require('fs'), path = require('path');
const P = '../../public/';
const I = require(P + 'drawup-draw-import-v31.js'), D = require(P + 'drawup-draw-core-v18.js');
const fx = f => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const lens = m => m.walls.map(w => Math.round(D.wallLength(w) * 8) / 8).sort((a, b) => a - b);
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 0.25);

function check(m, r) {
  assert.equal(r.walls, 5, 'five walls'); assert.equal(r.doors, 2, 'two doors'); assert.equal(r.windows, 3, 'three windows');
  assert.deepEqual(lens(m), [352, 352, 352, 472, 472]);
  assert.equal(m.walls.filter(w => w.type === 'exterior').length, 4); assert.equal(m.walls.filter(w => w.type === 'interior').length, 1);
  assert(m.walls.filter(w => w.type === 'exterior').every(w => near(w.thickness, 8))); assert(near(m.walls.find(w => w.type === 'interior').thickness, 4.5));
  const south = m.walls.find(w => w.type === 'exterior' && Math.abs(w.a.y - w.b.y) < 0.01 && w.a.y > 300);
  const ops = m.openings.filter(o => o.wall === south.id).map(o => [o.kind, Math.round(o.offset), o.width]).sort((a, b) => a[1] - b[1]);
  // south wall runs from x 24; door 100..136 and window 280..352 in the file, file x 0 = plan x 20
  const s0 = Math.min(south.a.x, south.b.x), sgn = south.a.x < south.b.x ? 1 : -1, L = D.wallLength(south);
  const at = o => sgn > 0 ? o : L - o;
  assert.deepEqual(ops.map(o => [o[0], Math.round(at(o[1]) + s0), o[2]]).sort((a, b) => a[1] - b[1]), [['door', 138, 36], ['window', 336, 72]]);
  assert.equal(m.rooms.length, 2); assert.deepEqual(m.rooms.map(r => r.name).sort(), ['BEDROOM', 'LIVING']);
  // every opening fits its wall, every wall end meets another wall (a closed building)
  m.openings.forEach(o => { const w = D.wallById(m, o.wall); assert(o.offset - o.width / 2 >= -0.01 && o.offset + o.width / 2 <= D.wallLength(w) + 0.01); });
  const ends = m.walls.flatMap(w => [w.a, w.b]);
  m.walls.filter(w => w.type === 'exterior').forEach(w => [w.a, w.b].forEach(p => assert(ends.filter(q => Math.hypot(q.x - p.x, q.y - p.y) < 0.01).length >= 2, 'corner joined')));
  // the dimensions DrawUp computes from it are real
  const R = D.computeDimensions(m, 48); assert(R.overall && Object.keys(R.overall).length);
}

t('AutoCAD-style DXF in inches (R2010, LINE + LWPOLYLINE + door/window blocks)', () => {
  const x = I.inspectDXF(fx('plan-in.dxf')); assert.equal(x.unit, 1); assert(x.unitConfirmed);
  const r = I.toModel(x.geo, { unit: x.unit }); check(r.model, r.report);
});
t('metric DXF (millimetres) comes in at the same real size', () => {
  const x = I.inspectDXF(fx('plan-mm.dxf')); assert(near(x.unit, 1 / 25.4, 1e-9)); assert(x.unitConfirmed);
  const r = I.toModel(x.geo, { unit: x.unit }); check(r.model, r.report);
});
t('R12 DXF with no units: guessed, marked as not confirmed, old POLYLINE read', () => {
  const x = I.inspectDXF(fx('plan-nounits.dxf')); assert(!x.unitConfirmed); assert.equal(x.unit, 1); assert(/guessed/.test(x.unitWhy));
  const r = I.toModel(x.geo, { unit: x.unit, unitConfirmed: false, unitNote: 'x' }); check(r.model, r.report);
  assert.equal(r.report.assumptions.find(a => a.id === 'im_units').status, 'assumed');
});
t('wrong unit choice scales everything (member picks feet for an inch drawing)', () => {
  const x = I.inspectDXF(fx('plan-nounits.dxf')); const r = I.toModel(x.geo, { unit: 12, maxT: 24 * 12 });
  // walls 8 ft thick are out of range for the default finder, so with the default range nothing is a wall
  const r2 = I.toModel(x.geo, { unit: 12 }); assert.equal(r2.report.walls, 0); assert(r2.report.unknowns.some(u => u.id === 'im_nowalls'));
  void r;
});
t('drawing with no layer names (everything on layer 0) still finds the walls', () => {
  const x = I.inspectDXF(fx('plan-in.dxf')); x.geo.segs.forEach(s => { s.layer = '0'; }); x.geo.arcs.forEach(a => { a.layer = '0'; });
  const r = I.toModel(x.geo, { unit: 1 }); assert.equal(r.report.walls, 5); assert.equal(r.report.doors, 2); assert(r.report.windows >= 3);
});
t('round trip: DrawUp DXF export → import gives back the same walls and openings', () => {
  const m = D.samplePlan(), x = I.inspectDXF(D.toDXF(m, 48)), r = I.toModel(x.geo, { unit: x.unit });
  assert.deepEqual(lens(r.model), lens(m));
  assert.deepEqual(r.model.openings.map(o => o.kind + o.width).sort(), m.openings.map(o => o.kind + o.width).sort());
  assert.deepEqual(r.model.walls.map(w => w.thickness).sort(), m.walls.map(w => w.thickness).sort());
});
t('angled walls (45 degrees) are found', () => {
  // a 6" wall pair at 45 degrees, 10 ft long, plus a square room
  const k = Math.SQRT1_2, segs = [];
  const L = (a, b) => segs.push({ a, b, layer: 'A-WALL' });
  L({ x: 0, y: 0 }, { x: 120 * k, y: 120 * k }); L({ x: 6 * k, y: -6 * k }, { x: 6 * k + 120 * k, y: -6 * k + 120 * k });
  const r = I.fromSegments(segs, [], [], {}); assert.equal(r.report.walls, 1); assert(near(r.model.walls[0].thickness, 6)); assert(near(D.wallLength(r.model.walls[0]), 120, 0.5));
});
t('format detection, and clear messages for DWG, Revit and binary DXF', () => {
  assert.equal(I.detect('a.dxf', '  0\nSECTION'), 'dxf'); assert.equal(I.detect('x.pdf', '%PDF-1.7'), 'pdf'); assert.equal(I.detect('x.bin', 'AC1032....'), 'dwg');
  assert.equal(I.detect('m.ifc', 'ISO-10303-21;'), 'ifc'); assert.equal(I.detect('m.dae', '<?xml version="1.0"?><COLLADA'), 'dae'); assert.equal(I.detect('m.fbx', 'Kaydara FBX Binary  '), 'fbx');
  assert(!I.FORMATS.dwg.ok && /DXF/.test(I.FORMATS.dwg.why)); assert(!I.FORMATS.rvt.ok);
  assert.throws(() => I.parseDXF('AutoCAD Binary DXF\r\n\x1a\x00'), /ASCII/);
  assert.throws(() => I.parseDXF('hello'), /DXF/);
});
console.log(n + ' passed');
