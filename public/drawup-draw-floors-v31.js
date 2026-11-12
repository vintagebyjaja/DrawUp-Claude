/* DrawUp Draw Studio (v31): floors (levels) on the shared Draw model.
 *
 * Every existing tool edits model.walls / openings / rooms / items / curves. To add floors
 * without touching any of them, the floor being edited stays in those arrays, and every
 * other floor is parked in model.floors (same keys). Switching floors swaps them.
 *
 *   model.level   = { id, name, height }            the floor being edited
 *   model.floors  = [{ id, name, height, walls, openings, rooms, items, curves }]  the others
 *   model.levelOrder = [id, ...]                    bottom to top
 *   model.levelBase  = elevation of the lowest floor (inches, default 0)
 *
 * Elevations are never stored: a floor sits at levelBase + the floor-to-floor heights of the
 * floors below it, so changing one height moves every floor above it.
 * A drawing that never had a second floor has no model.floors and is not rewritten here
 * (levels() reads it without changing it), so old drawings save back exactly as they were.
 * Units: inches. Browser: window.DrawUpFloors. Node: module.exports.
 */
(function (root) {
  'use strict';
  const PER = ['walls', 'openings', 'rooms', 'items', 'curves'];
  const clone = o => JSON.parse(JSON.stringify(o));
  const uid = () => 'lvl_' + Math.random().toString(36).slice(2, 9);
  const DEFAULT_HEIGHT = 120; // 10'-0" floor to floor when nothing else is known

  function maxWallHeight(walls) { return (walls || []).reduce((h, w) => Math.max(h, +w.height || 0), 0); }
  /** Floor-to-floor height of a floor that never had one: its tallest wall, else 10'-0". */
  function inferHeight(geom) { const h = maxWallHeight(geom.walls); return h > 0 ? h : DEFAULT_HEIGHT; }
  function multi(m) { return Array.isArray(m.floors) && m.floors.length > 0; }

  /** Turns a one-floor drawing into a floors drawing (only called when a floor is added). */
  function ensure(m) {
    if (!m.level || typeof m.level !== 'object') m.level = { name: 'LEVEL 1', elev: 0 };
    if (!m.level.id) m.level.id = uid();
    if (!(m.level.height > 0)) m.level.height = inferHeight(m);
    if (!m.level.name) m.level.name = 'LEVEL 1';
    if (!Array.isArray(m.floors)) m.floors = [];
    if (!Array.isArray(m.levelOrder) || !m.levelOrder.length) m.levelOrder = [m.level.id].concat(m.floors.map(f => f.id));
    if (!(typeof m.levelBase === 'number')) m.levelBase = +m.level.elev || 0;
    PER.forEach(k => { if (!Array.isArray(m[k])) m[k] = []; });
    m.floors.forEach(f => PER.forEach(k => { if (!Array.isArray(f[k])) f[k] = []; }));
    // repair: every floor listed once, in order
    const ids = [m.level.id].concat(m.floors.map(f => f.id));
    m.levelOrder = m.levelOrder.filter((id, i, a) => ids.includes(id) && a.indexOf(id) === i);
    ids.forEach(id => { if (!m.levelOrder.includes(id)) m.levelOrder.push(id); });
    return m;
  }

  /** All floors bottom to top: [{ id, name, height, elev, active }]. Read-only. */
  function levels(m) {
    if (!multi(m)) {
      const L = m.level || {};
      return [{ id: L.id || 'L1', name: L.name || 'LEVEL 1', height: L.height > 0 ? L.height : inferHeight(m), elev: +L.elev || 0, active: true }];
    }
    const byId = {}; byId[m.level.id] = m.level; m.floors.forEach(f => { byId[f.id] = f; });
    const order = (m.levelOrder || []).filter(id => byId[id]);
    Object.keys(byId).forEach(id => { if (!order.includes(id)) order.push(id); });
    let z = typeof m.levelBase === 'number' ? m.levelBase : 0;
    return order.map(id => { const f = byId[id], h = f.height > 0 ? f.height : inferHeight(f), out = { id, name: f.name || 'LEVEL', height: h, elev: z, active: id === m.level.id }; z += h; return out; });
  }
  function count(m) { return multi(m) ? m.floors.length + 1 : 1; }
  function active(m) { return levels(m).find(l => l.active); }
  function top(m) { const L = levels(m); return L[L.length - 1]; }
  function get(m, id) { return levels(m).find(l => l.id === id) || null; }

  /** The geometry of one floor as a plain model the core, elevation and 3D code can read. */
  function floorModel(m, id) {
    const L = get(m, id); if (!L) return null;
    const src = L.active ? m : m.floors.find(f => f.id === id);
    const out = { units: m.units || 'in', ws: m.ws, cameras: m.cameras, level: { id: L.id, name: L.name, elev: L.elev, height: L.height } };
    PER.forEach(k => { out[k] = Array.isArray(src[k]) ? src[k] : []; });
    if (id === top(m).id && m.roof) out.roof = m.roof;
    return out;
  }
  /** Every floor: [{ level, model }], bottom to top. */
  function all(m) { return levels(m).map(l => ({ level: l, model: floorModel(m, l.id) })); }

  /** Makes floor `id` the one being edited. Returns true if it changed. */
  function switchTo(m, id) {
    if (!multi(m) || m.level.id === id) return false;
    const i = m.floors.findIndex(f => f.id === id); if (i < 0) throw new Error('That floor is not in this drawing.');
    ensure(m);
    const next = m.floors[i], park = { id: m.level.id, name: m.level.name, height: m.level.height };
    PER.forEach(k => { park[k] = m[k]; m[k] = Array.isArray(next[k]) ? next[k] : []; });
    m.floors.splice(i, 1, park);
    m.level = { id: next.id, name: next.name, height: next.height };
    return true;
  }

  /** Adds a floor. opts: { name, height, copy: 'exterior' | 'all' | 'none', below: id (the floor it goes on) }.
   *  New floors go above the given floor (default: the top one) and become the active floor. */
  function addFloor(m, opts) {
    opts = opts || {}; ensure(m);
    const L = levels(m), below = opts.below ? L.find(l => l.id === opts.below) : L[L.length - 1];
    if (!below) throw new Error('That floor is not in this drawing.');
    const h = opts.height > 0 ? +opts.height : below.height;
    if (!(h >= 24 && h <= 1200)) throw new Error('Enter a floor-to-floor height between 2\'-0" and 100\'-0".');
    const src = floorModel(m, below.id), id = uid(), f = { id, name: opts.name || ('LEVEL ' + (L.length + 1)), height: h };
    PER.forEach(k => { f[k] = []; });
    const copy = opts.copy || 'exterior';
    if (copy !== 'none') {
      const keep = copy === 'all' ? src.walls : src.walls.filter(w => w.type === 'exterior');
      const map = {};
      keep.forEach(w => { const n = clone(w); n.id = 'w_' + Math.random().toString(36).slice(2, 9); map[w.id] = n.id; if (n.height === below.height || !(n.height > 0)) n.height = h; f.walls.push(n); });
      if (copy === 'all') {
        src.openings.filter(o => map[o.wall]).forEach(o => { const n = clone(o); n.id = 'o_' + Math.random().toString(36).slice(2, 9); n.wall = map[o.wall]; f.openings.push(n); });
        src.rooms.forEach(r => { const n = clone(r); n.id = 'r_' + Math.random().toString(36).slice(2, 9); f.rooms.push(n); });
      } else {
        // windows carry up with the exterior walls; doors do not (an upper floor has no street doors)
        src.openings.filter(o => map[o.wall] && o.kind === 'window').forEach(o => { const n = clone(o); n.id = 'o_' + Math.random().toString(36).slice(2, 9); n.wall = map[o.wall]; f.openings.push(n); });
      }
      (src.curves || []).forEach(cv => { const n = clone(cv); f.curves.push(n); });
      // curve records point at their wall segments by curve id; segments copied above keep w.curve, so the records stay valid
      if (copy !== 'all') f.curves = f.curves.filter(cv => f.walls.some(w => w.curve && w.curve.id === cv.id));
    }
    m.floors.push(f);
    const at = m.levelOrder.indexOf(below.id);
    m.levelOrder.splice(at + 1, 0, id);
    switchTo(m, id);
    return get(m, id);
  }

  /** Removes a floor (never the last one). If it is the one being edited, the floor below opens. */
  function removeFloor(m, id) {
    if (!multi(m)) throw new Error('A drawing needs at least one floor.');
    const L = levels(m), i = L.findIndex(l => l.id === id); if (i < 0) throw new Error('That floor is not in this drawing.');
    if (L[i].active) switchTo(m, (L[i - 1] || L[i + 1]).id);
    m.floors = m.floors.filter(f => f.id !== id);
    m.levelOrder = m.levelOrder.filter(x => x !== id);
    if (i === 0 && L[1]) m.levelBase = L[1].elev; // the floor above keeps its elevation
    if (!m.floors.length) m.level.elev = m.levelBase || 0;
    return true;
  }

  function rec(m, id) { if (m.level && m.level.id === id) return m.level; return (m.floors || []).find(f => f.id === id) || null; }
  function geomOf(m, id) { return m.level && m.level.id === id ? m : (m.floors || []).find(f => f.id === id); }

  /** Floor-to-floor height. Walls on that floor that ran the full old height follow the new
   *  height; shorter walls (partitions to a ceiling, low walls) keep theirs. Returns
   *  { moved: walls changed, above: floors that moved up or down }. */
  function setHeight(m, id, h) {
    h = +h; if (!(h >= 24 && h <= 1200)) throw new Error('Enter a floor-to-floor height between 2\'-0" and 100\'-0".');
    if (!multi(m)) { if (!m.level || typeof m.level !== 'object') m.level = { name: 'LEVEL 1', elev: 0 }; }
    const r = multi(m) ? rec(m, id) : m.level; if (!r) throw new Error('That floor is not in this drawing.');
    const old = r.height > 0 ? r.height : inferHeight(geomOf(m, id) || m);
    let moved = 0; (geomOf(m, id) || m).walls.forEach(w => { if (Math.abs((+w.height || 0) - old) < 0.01) { w.height = h; moved++; } });
    r.height = h;
    const L = levels(m), i = L.findIndex(l => l.id === (r.id || L[0].id));
    return { moved, above: Math.max(0, L.length - 1 - i) };
  }
  function rename(m, id, name) { const r = multi(m) ? rec(m, id) : m.level; if (!r) throw new Error('That floor is not in this drawing.'); r.name = String(name || '').trim().slice(0, 40) || r.name; return r.name; }
  function setBase(m, z) { if (!multi(m)) { m.level = m.level || { name: 'LEVEL 1' }; m.level.elev = +z || 0; return; } m.levelBase = +z || 0; }

  /** Moves a floor up or down in the stack (dir +1 / -1). */
  function reorder(m, id, dir) {
    ensure(m); const i = m.levelOrder.indexOf(id), j = i + dir; if (i < 0 || j < 0 || j >= m.levelOrder.length) return false;
    const t = m.levelOrder[i]; m.levelOrder[i] = m.levelOrder[j]; m.levelOrder[j] = t; return true;
  }

  /** Short text for Arch Coach / Teammate / the AI change route. */
  function describe(m) {
    const F = v => { const ft = Math.floor(Math.round(v) / 12), inch = Math.round(v) - ft * 12; return ft + "'-" + inch + '"'; };
    return levels(m).map(l => `${l.name}${l.active ? ' (open)' : ''}: elevation ${F(l.elev)}, floor to floor ${F(l.height)}`).join('\n');
  }

  const api = { PER, DEFAULT_HEIGHT, levels, count, active, top, get, floorModel, all, switchTo, addFloor, removeFloor, setHeight, rename, setBase, reorder, ensure, describe, multi, inferHeight };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DrawUpFloors = api;
})(typeof window !== 'undefined' ? window : globalThis);
