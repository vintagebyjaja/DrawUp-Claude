// Floors (levels) on the Draw model: node tests/draw-studio/test-floors.js
const assert = require('assert');
const P = '../../public/';
const D = require(P + 'drawup-draw-core-v18.js'), F = require(P + 'drawup-draw-floors-v31.js');
global.DrawUpFloors = F; // the elevation module looks for it on the global in Node too
const E = require(P + 'drawup-draw-elev-v21.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('old one-floor drawing reads as one floor and is not rewritten', () => {
  const m = D.samplePlan(), before = JSON.stringify(m);
  const L = F.levels(m); assert.equal(L.length, 1); assert.equal(L[0].elev, 0); assert(L[0].height > 0);
  F.all(m); F.floorModel(m, L[0].id); F.describe(m);
  assert.equal(JSON.stringify(m), before);
});
t('add a floor: stacks at the floor-to-floor height, copies exterior walls and windows, not doors', () => {
  const m = D.samplePlan(); const ext = m.walls.filter(w => w.type === 'exterior').length;
  const win = m.openings.filter(o => m.walls.find(w => w.id === o.wall && w.type === 'exterior') && o.kind === 'window').length;
  const l2 = F.addFloor(m, { height: 144 });
  const L = F.levels(m); assert.equal(L.length, 2); assert.equal(L[1].id, l2.id); assert(L[1].active);
  assert.equal(L[1].elev, L[0].height);
  assert.equal(m.walls.length, ext); assert.equal(m.openings.length, win);
  assert(m.openings.every(o => o.kind === 'window'));
  assert(m.openings.every(o => m.walls.some(w => w.id === o.wall)));
});
t('switching floors keeps each floor\'s geometry', () => {
  const m = D.samplePlan(); const L1 = F.levels(m)[0], n1 = m.walls.length;
  F.addFloor(m, { height: 120 }); D.addWall(m, { x: 24, y: 24 }, { x: 96, y: 24 }, { thickness: 4.5, type: 'interior' });
  const n2 = m.walls.length; const id1 = F.levels(m)[0].id;
  F.switchTo(m, id1); assert.equal(m.walls.length, n1); assert(F.levels(m)[0].active);
  F.switchTo(m, F.levels(m)[1].id); assert.equal(m.walls.length, n2); void L1;
});
t('changing floor-to-floor height moves every floor above and full-height walls follow', () => {
  const m = D.samplePlan(); const L0 = F.levels(m)[0];
  F.addFloor(m, { height: 120 }); F.addFloor(m, { height: 120 });
  let L = F.levels(m); const e2 = L[2].elev;
  F.switchTo(m, L[0].id);
  const full = m.walls.filter(w => Math.abs(w.height - L0.height) < 0.01).length, short = m.walls.filter(w => Math.abs(w.height - L0.height) >= 0.01);
  const r = F.setHeight(m, L[0].id, L0.height + 24);
  assert.equal(r.moved, full); assert.equal(r.above, 2);
  L = F.levels(m); assert.equal(L[1].elev, L0.height + 24); assert.equal(L[2].elev, e2 + 24);
  short.forEach(w => assert.notEqual(w.height, L0.height + 24));
});
t('remove a floor; the last floor cannot be removed', () => {
  const m = D.samplePlan(); F.addFloor(m, {}); const L = F.levels(m);
  F.removeFloor(m, L[1].id); assert.equal(F.count(m), 1);
  assert.throws(() => F.removeFloor(m, F.levels(m)[0].id));
});
t('removing the bottom floor keeps the elevation of the floor above', () => {
  const m = D.samplePlan(); F.addFloor(m, { height: 132 }); const L = F.levels(m);
  F.removeFloor(m, L[0].id); const L2 = F.levels(m); assert.equal(L2.length, 1); assert.equal(L2[0].elev, L[1].elev);
});
t('roof belongs to the top floor only', () => {
  const m = D.samplePlan(); m.roof = { type: 'gable', pitch: 6 }; F.addFloor(m, {});
  const all = F.all(m); assert(!all[0].model.roof); assert(all[1].model.roof);
});
t('the model survives a save (JSON) and reload with the same floors', () => {
  const m = D.samplePlan(); F.addFloor(m, { name: 'MEZZANINE', height: 96 });
  const back = D.normalizeModel(JSON.parse(JSON.stringify(m)));
  assert.deepEqual(F.levels(back).map(l => [l.name, l.elev, l.height]), F.levels(m).map(l => [l.name, l.elev, l.height]));
});
t('elevation of a two-floor drawing shows both floors at their heights', () => {
  const m = D.samplePlan(); const h1 = F.levels(m)[0].height; F.addFloor(m, { name: 'LEVEL 2', height: 144 });
  const cams = E.defaultElevations(F.floorModel(m, F.levels(m)[0].id));
  const V = E.build(m, cams[0], 48);
  const texts = V.prims.filter(p => p.t === 'text').map(p => p.text);
  assert(texts.includes('LEVEL 1'), 'LEVEL 1 label'); assert(texts.includes('LEVEL 2'), 'LEVEL 2 label');
  assert(texts.includes(D.formatFtIn(h1)), 'level 2 elevation text');
  // the top of the drawing reaches level 2 + its wall height
  const top = Math.min(...V.prims.filter(p => p.t === 'poly').flatMap(p => p.pts.map(q => q.y)));
  assert(top <= -(h1 + 100), 'upper floor drawn above');
  const one = E.build(F.floorModel(m, F.levels(m)[0].id), cams[0], 48);
  assert(one.prims.length < V.prims.length);
});
t('a one-floor elevation is unchanged by the floors code', () => {
  const m = D.samplePlan(); const cam = E.defaultElevations(m)[0];
  const a = JSON.stringify(E.build(m, cam, 48).prims);
  delete global.DrawUpFloors; // build without the module
  const b = JSON.stringify(E.build(m, cam, 48).prims); global.DrawUpFloors = F;
  assert.equal(a, b);
});
console.log(n + ' passed');
