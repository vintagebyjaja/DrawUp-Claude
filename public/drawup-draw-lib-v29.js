/* DrawUp Draw Workspace 2.0 (v29): the component library.
 *
 * Every component is a plan item {kind:'component', comp, at, rot, w, d, h, z} in the Draw model
 * (drawup-draw-core-v18.js). This file says how each one looks:
 *   symbol(it)  2D plan symbol in local inches: x across the width (-w/2..w/2), y across the depth
 *               (-d/2 is the back, the side that goes against a wall; +d/2 is the front).
 *   parts(it)   3D parts in the same frame, z up from the floor: boxes, cylinders and extrusions
 *               with a material key. The 3D view (drawup-draw-3d-v29.js) turns them into meshes.
 * Sizes are common US sizes, rounded. They are starting points that the member can change, not
 * a manufacturer's product. Custom components (a member's own top-view picture) use comp
 * 'custom:<id>' and draw as their box with the picture laid on it in Presentation mode.
 * Works in the browser (window.DrawUpDrawLib) and in Node (module.exports).
 */
(function (root) {
  'use strict';
  const R = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const E = (cx, cy, rx, ry, n) => { const o = []; n = n || 28; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; o.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }); } return o; };
  const P = (x, y) => ({ x, y });
  const box = (x, y, z, w, d, h, mat, more) => Object.assign({ shape: 'box', x, y, z, w, d, h, mat }, more || {});
  const cyl = (x, y, z, r, h, mat, more) => Object.assign({ shape: 'cyl', x, y, z, r, h, mat }, more || {});
  const ext = (pts, z, h, mat, more) => Object.assign({ shape: 'extrude', pts, z, h, mat }, more || {});
  const ring = (rx, ry, band, z, h, mat, more) => Object.assign({ shape: 'ring', rx, ry, band, z, h, mat }, more || {});

  /* ------------------------------------------------------------ symbol helpers */
  // A chair seen from above, its back toward -y.
  const chairSym = (cx, cy, s, rot) => {
    const k = s / 20, t = p => { const a = (rot || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a); return P(cx + p.x * c - p.y * sn, cy + p.x * sn + p.y * c); };
    return [R(-9 * k, -8 * k, 9 * k, 9 * k).map(t), R(-9 * k, -10 * k, 9 * k, -7 * k).map(t)];
  };
  const tableWithChairs = (w, d, round, nPerSide) => {
    const polys = [round ? E(0, 0, w / 2 - 10, d / 2 - 10, 32) : R(-w / 2 + 10, -d / 2 + 10, w / 2 - 10, d / 2 - 10)];
    if (round) { const n = nPerSide || 4, r = Math.min(w, d) / 2 - 8; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; polys.push(...chairSym(Math.cos(a) * r, Math.sin(a) * r, 16, a * 180 / Math.PI + 90)); } }
    else { const n = nPerSide || 1; for (let i = 0; i < n; i++) { const x = -((w - 20) / 2) + (w - 20) * (i + 0.5) / n; polys.push(...chairSym(x, -d / 2 + 8, 16, 0), ...chairSym(x, d / 2 - 8, 16, 180)); } }
    return { polys };
  };
  const shelves = (w, d, n) => { const lines = []; for (let i = 1; i < n; i++) { const x = -w / 2 + w * i / n; lines.push([P(x, -d / 2), P(x, d / 2)]); } return lines; };

  /* ------------------------------------------------------------ catalog
   * cat: seating | tables | beds | storage | kitchen | bath | retail | office | people | vehicles | plants | lighting | equipment | signage
   * layer: the CAD layer it is drawn on (core LAYERS). sym(w, d) and parts(w, d, h) are in local inches. */
  const C = [];
  const add = (key, name, cat, w, d, h, layer, sym, parts, more) => C.push(Object.assign({ key, name, cat, w, d, h, layer, sym, parts, tags: '' }, more || {}));
  const soft = 'fabric', wood = 'wood', metal = 'metal', white = 'white', glass = 'glass', stone = 'stone', steel = 'steel', plant = 'plant', dark = 'dark', person = 'person', brand = 'brand', accent = 'accent';

  // Seating
  add('chair', 'Chair', 'seating', 20, 21, 32, 'furn', (w, d) => ({ polys: [R(-w / 2, -d / 2 + 3, w / 2, d / 2), R(-w / 2, -d / 2, w / 2, -d / 2 + 3)] }),
    (w, d, h) => [box(0, 2, 0, w, d - 3, 18, wood), box(0, -d / 2 + 1.5, 0, w, 3, h, wood)], { tags: 'dining side chair seat' });
  add('armchair', 'Lounge chair', 'seating', 32, 34, 32, 'furn', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), R(-w / 2 + 5, -d / 2 + 7, w / 2 - 5, d / 2 - 2)] }),
    (w, d, h) => [box(0, 0, 0, w, d, 17, soft), box(0, -d / 2 + 3.5, 0, w, 7, h, soft), box(-w / 2 + 2.5, 0, 0, 5, d, 24, soft), box(w / 2 - 2.5, 0, 0, 5, d, 24, soft)], { tags: 'club armchair lounge' });
  add('sofa', 'Sofa', 'seating', 84, 36, 32, 'furn', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), R(-w / 2 + 6, -d / 2 + 8, w / 2 - 6, d / 2 - 2)], lines: [[P(0, -d / 2 + 8), P(0, d / 2 - 2)]] }),
    (w, d, h) => [box(0, 0, 0, w, d, 17, soft), box(0, -d / 2 + 4, 0, w, 8, h, soft), box(-w / 2 + 3, 0, 0, 6, d, 24, soft), box(w / 2 - 3, 0, 0, 6, d, 24, soft)], { tags: 'couch settee' });
  add('loveseat', 'Loveseat', 'seating', 60, 36, 32, 'furn', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), R(-w / 2 + 6, -d / 2 + 8, w / 2 - 6, d / 2 - 2)] }),
    (w, d, h) => [box(0, 0, 0, w, d, 17, soft), box(0, -d / 2 + 4, 0, w, 8, h, soft), box(-w / 2 + 3, 0, 0, 6, d, 24, soft), box(w / 2 - 3, 0, 0, 6, d, 24, soft)], { tags: 'small sofa couch' });
  add('bench', 'Bench', 'seating', 60, 18, 18, 'furn', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2, 0), P(w / 2, 0)]] }), (w, d, h) => [box(0, 0, h - 2, w, d, 2, wood), box(-w / 2 + 3, 0, 0, 3, d - 2, h - 2, metal), box(w / 2 - 3, 0, 0, 3, d - 2, h - 2, metal)], { tags: 'seat' });
  add('bar_stool', 'Bar stool', 'seating', 16, 16, 30, 'furn', (w, d) => ({ polys: [E(0, 0, w / 2, d / 2, 20)], circles: [{ c: P(0, 0), r: w / 4 }] }), (w, d, h) => [cyl(0, 0, h - 2, w / 2, 2, wood), cyl(0, 0, 0, 1.2, h - 2, metal), cyl(0, 0, 0, w / 2.6, 1, metal)], { tags: 'stool counter seat' });
  add('booth', 'Booth seat', 'seating', 48, 24, 42, 'furn', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), R(-w / 2, -d / 2, w / 2, -d / 2 + 6)] }), (w, d, h) => [box(0, 3, 0, w, d - 6, 18, soft), box(0, -d / 2 + 3, 0, w, 6, h, soft)], { tags: 'banquette' });

  // Tables
  add('table_round', 'Round table, 4 chairs', 'tables', 72, 72, 29, 'furn', (w, d) => tableWithChairs(w, d, true, 4), (w, d, h) => [cyl(0, 0, h - 1.5, w / 2 - 10, 1.5, wood), cyl(0, 0, 0, 2, h - 1.5, metal), ...[0, 1, 2, 3].map(i => { const a = i * Math.PI / 2, r = w / 2 - 8; return box(Math.cos(a) * r, Math.sin(a) * r, 0, 16, 16, 18, wood); })], { tags: 'dining cafe' });
  add('cafe_table', 'Cafe table, 2 chairs', 'tables', 30, 64, 29, 'furn', (w, d) => ({ polys: [R(-12, -12, 12, 12), ...chairSym(0, -22, 16, 0), ...chairSym(0, 22, 16, 180)] }), (w, d, h) => [box(0, 0, h - 1.5, 24, 24, 1.5, wood), cyl(0, 0, 0, 1.5, h - 1.5, metal), box(0, -22, 0, 16, 16, 18, wood), box(0, 22, 0, 16, 16, 18, wood)], { tags: 'two top 2-top bistro' });
  add('dining_table', 'Dining table, 6 chairs', 'tables', 72, 76, 29, 'furn', (w, d) => tableWithChairs(w, d, false, 3), (w, d, h) => [box(0, 0, h - 1.5, w - 20, d - 40, 1.5, wood), box(0, 0, 0, w - 26, d - 46, h - 1.5, wood, { frame: true })], { tags: 'rectangular' });
  add('bar_table', 'High-top table', 'tables', 30, 30, 42, 'furn', (w, d) => ({ polys: [E(0, 0, w / 2, d / 2, 24)] }), (w, d, h) => [cyl(0, 0, h - 1.5, w / 2, 1.5, wood), cyl(0, 0, 0, 1.5, h - 1.5, metal)], { tags: 'bar height standing' });
  add('coffee_table', 'Coffee table', 'tables', 48, 24, 16, 'furn', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)] }), (w, d, h) => [box(0, 0, 0, w, d, h, wood)], { tags: 'living' });
  add('rug', 'Area rug', 'tables', 96, 60, 0.5, 'furn', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), R(-w / 2 + 4, -d / 2 + 4, w / 2 - 4, d / 2 - 4)] }), (w, d, h) => [box(0, 0, 0, w, d, h, accent)], { tags: 'carpet' });

  // Beds and storage
  const bed = (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), R(-w / 2 + 3, -d / 2 + 3, -2, -d / 2 + 18), R(2, -d / 2 + 3, w / 2 - 3, -d / 2 + 18)], lines: [[P(-w / 2, -d / 2 + 26), P(w / 2, -d / 2 + 26)]] });
  const bedParts = (w, d, h) => [box(0, 0, 0, w, d, h, soft), box(0, -d / 2 + 1.5, 0, w, 3, 40, wood)];
  add('bed_queen', 'Queen bed', 'beds', 60, 80, 24, 'furn', bed, bedParts, { tags: 'bedroom' });
  add('bed_king', 'King bed', 'beds', 76, 80, 24, 'furn', bed, bedParts, { tags: 'bedroom' });
  add('bed_twin', 'Twin bed', 'beds', 39, 75, 24, 'furn', bed, bedParts, { tags: 'bedroom single' });
  add('nightstand', 'Nightstand', 'storage', 20, 18, 24, 'furn', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)] }), (w, d, h) => [box(0, 0, 0, w, d, h, wood)], { tags: 'bedside' });
  add('dresser', 'Dresser', 'storage', 60, 20, 34, 'furn', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(0, -d / 2), P(0, d / 2)]] }), (w, d, h) => [box(0, 0, 0, w, d, h, wood)], { tags: 'chest drawers' });
  add('wardrobe', 'Wardrobe', 'storage', 48, 24, 84, 'furn', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2, -d / 2), P(w / 2, d / 2)], [P(w / 2, -d / 2), P(-w / 2, d / 2)]] }), (w, d, h) => [box(0, 0, 0, w, d, h, wood)], { tags: 'closet armoire' });
  add('bookshelf', 'Bookshelf', 'storage', 36, 12, 72, 'furn', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: shelves(w, d, 3) }), (w, d, h) => [box(0, 0, 0, w, d, h, wood)], { tags: 'shelving books' });
  add('closet_rod', 'Closet shelf and rod', 'storage', 72, 24, 66, 'furn', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2, 0), P(w / 2, 0)]], dash: true }), (w, d, h) => [box(0, -d / 2 + 6, h - 1, w, 12, 1, wood), cyl(0, 0, h - 4, 0.6, 0.6, metal, { axis: 'x', len: w })], { tags: 'wic walk-in closet hanging' });

  // Kitchen
  add('base_cabinet', 'Base cabinets, 24" deep', 'kitchen', 96, 24, 36, 'case', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2, d / 2 - 1.5), P(w / 2, d / 2 - 1.5)]] }), (w, d, h) => [box(0, 0, 0, w, d - 1, h - 1.5, white), box(0, 0.5, h - 1.5, w, d + 1, 1.5, stone)], { tags: 'counter countertop kitchen run' });
  add('upper_cabinet', 'Upper cabinets (above)', 'kitchen', 96, 13, 30, 'case', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], dash: true }), (w, d, h) => [box(0, 0, 54, w, d, h, white)], { tags: 'wall cabinet overhead' });
  add('island', 'Kitchen island', 'kitchen', 72, 36, 36, 'case', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), R(-w / 2 + 1.5, -d / 2 + 1.5, w / 2 - 1.5, d / 2 - 1.5)] }), (w, d, h) => [box(0, -2, 0, w - 4, d - 8, h - 1.5, white), box(0, 0, h - 1.5, w, d, 1.5, stone)], { tags: 'peninsula counter' });
  add('kitchen_sink', 'Kitchen sink cabinet', 'kitchen', 36, 24, 36, 'case', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), R(-w / 2 + 3, -d / 2 + 3, -1, d / 2 - 3), R(1, -d / 2 + 3, w / 2 - 3, d / 2 - 3)] }), (w, d, h) => [box(0, 0, 0, w, d - 1, h - 1.5, white), box(0, 0.5, h - 1.5, w, d + 1, 1.5, stone)], { tags: 'double bowl' });
  add('range', 'Range', 'kitchen', 30, 26, 36, 'eqpm', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], circles: [{ c: P(-7, -5), r: 4.5 }, { c: P(7, -5), r: 4.5 }, { c: P(-7, 6), r: 4.5 }, { c: P(7, 6), r: 4.5 }] }), (w, d, h) => [box(0, 0, 0, w, d, h, steel)], { tags: 'stove cooktop oven' });
  add('fridge', 'Refrigerator', 'kitchen', 36, 30, 70, 'eqpm', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2, d / 2 - 2), P(w / 2, d / 2 - 2)]] }), (w, d, h) => [box(0, 0, 0, w, d, h, steel)], { tags: 'refrigerator fridge' });
  add('dishwasher', 'Dishwasher', 'kitchen', 24, 24, 34, 'eqpm', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2, -d / 2), P(w / 2, d / 2)]] }), (w, d, h) => [box(0, 0, 0, w, d, h, steel)], { tags: 'dw' });
  add('washer_dryer', 'Washer and dryer', 'kitchen', 54, 30, 38, 'eqpm', (w, d) => ({ polys: [R(-w / 2, -d / 2, 0, d / 2), R(0, -d / 2, w / 2, d / 2)], circles: [{ c: P(-w / 4, 2), r: 9 }, { c: P(w / 4, 2), r: 9 }] }), (w, d, h) => [box(-w / 4, 0, 0, w / 2 - 1, d, h, white), box(w / 4, 0, 0, w / 2 - 1, d, h, white)], { tags: 'laundry' });

  // Bath
  add('toilet', 'Toilet', 'bath', 20, 28, 30, 'case', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, -d / 2 + 8), E(0, -d / 2 + 18, 7.5, 10, 24)] }), (w, d, h) => [box(0, -d / 2 + 4, 0, w, 8, h, white), cyl(0, -d / 2 + 18, 0, 8, 16, white, { sy: 1.3 })], { tags: 'wc water closet' });
  add('lav_vanity', 'Vanity, double sink', 'bath', 60, 22, 34, 'case', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), E(-w / 4, 1, 7, 5.5, 20), E(w / 4, 1, 7, 5.5, 20)] }), (w, d, h) => [box(0, 0, 0, w, d, h - 1.5, wood), box(0, 0, h - 1.5, w, d, 1.5, stone)], { tags: 'lavatory sink bathroom' });
  add('lav', 'Lavatory', 'bath', 20, 18, 34, 'case', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), E(0, 1, 7, 5.5, 20)] }), (w, d, h) => [box(0, 0, h - 6, w, d, 6, white)], { tags: 'sink wall hung' });
  add('tub', 'Bathtub', 'bath', 60, 30, 20, 'case', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), E(0, 0, w / 2 - 4, d / 2 - 4, 28)] }), (w, d, h) => [box(0, 0, 0, w, d, h, white)], { tags: 'bath tub freestanding' });
  add('shower', 'Shower, 36" x 36"', 'bath', 36, 36, 80, 'case', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2, -d / 2), P(w / 2, d / 2)], [P(w / 2, -d / 2), P(-w / 2, d / 2)]], circles: [{ c: P(0, 0), r: 2 }] }), (w, d, h) => [box(0, 0, 0, w, d, 4, white), box(0, d / 2 - 0.25, 4, w, 0.5, h - 4, glass)], { tags: 'stall' });
  add('urinal', 'Urinal', 'bath', 18, 14, 24, 'case', (w, d) => ({ polys: [E(0, 0, w / 2, d / 2, 20)] }), (w, d, h) => [box(0, 0, 20, w, d, h, white)], { tags: 'restroom' });
  add('grab_bars', 'Accessible toilet + grab bars', 'bath', 60, 56, 30, 'case', (w, d) => ({ polys: [R(-w / 2 + 16, -d / 2, -w / 2 + 36, -d / 2 + 8), E(-w / 2 + 26, -d / 2 + 18, 7.5, 10, 24), R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2 + 1.5, -d / 2 + 12), P(-w / 2 + 1.5, -d / 2 + 54)], [P(-w / 2 + 12, -d / 2 + 1.5), P(-w / 2 + 48, -d / 2 + 1.5)]], dash: false }), (w, d, h) => [box(-w / 2 + 26, -d / 2 + 4, 0, 20, 8, h, white), cyl(-w / 2 + 26, -d / 2 + 18, 0, 8, 16, white, { sy: 1.3 })], { tags: 'ada clearance accessible restroom' });

  // Retail
  add('gondola', 'Gondola shelving, double-sided', 'retail', 48, 36, 54, 'case', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2, 0), P(w / 2, 0)], ...shelves(w, d, 4)] }), (w, d, h) => [box(0, 0, 0, w, 2, h, metal), box(0, -d / 4, 0, w, d / 2 - 1, 6, metal), box(0, d / 4, 0, w, d / 2 - 1, 6, metal), ...[18, 30, 42].map(z => box(0, 0, z, w, d - 4, 1, metal))], { tags: 'aisle shelf shelving store' });
  add('wall_shelving', 'Wall shelving', 'retail', 48, 16, 84, 'case', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: shelves(w, d, 4) }), (w, d, h) => [box(0, -d / 2 + 1, 0, w, 2, h, wood), ...[12, 30, 48, 66].map(z => box(0, 0, z, w, d, 1, wood)), box(0, 0, 0, w, d, 8, wood)], { tags: 'merchandise wall fixture shelf' });
  add('display_table', 'Merchandise display table', 'retail', 60, 36, 32, 'case', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), R(-w / 2 + 6, -d / 2 + 6, w / 2 - 6, d / 2 - 6)] }), (w, d, h) => [box(0, 0, h - 2, w, d, 2, wood), box(0, 0, 0, w - 4, d - 4, 10, metal, { frame: true }), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => box(sx * (w / 2 - 2), sy * (d / 2 - 2), 0, 2, 2, h - 2, metal))], { tags: 'feature display nesting table crates' });
  add('display_case', 'Refrigerated display case', 'retail', 72, 36, 48, 'eqpm', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2, d / 2 - 6), P(w / 2, d / 2 - 6)]] }), (w, d, h) => [box(0, 0, 0, w, d, 30, steel), box(0, 3, 30, w, d - 6, h - 30, glass)], { tags: 'bakery pastry deli glass case' });
  add('checkout', 'Checkout counter', 'retail', 72, 30, 42, 'case', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2, -d / 2 + 6), P(w / 2, -d / 2 + 6)]] }), (w, d, h) => [box(0, 0, 0, w, d, h - 1.5, accent), box(0, 0, h - 1.5, w + 1, d + 1, 1.5, white), box(-w / 4, -d / 4, h, 14, 10, 12, dark)], { tags: 'cash wrap register pos counter sales' });
  add('checkout_u', 'Checkout counter, curved (U)', 'retail', 120, 72, 42, 'case', (w, d) => uCounter(w, d), (w, d, h) => [ext(uCounter(w, d).polys[0], 0, h - 1.5, accent), ext(uCounter(w, d).polys[0], h - 1.5, 1.5, white), box(-w / 2 + 30, -d / 2 + 12, h, 14, 10, 12, dark)], { tags: 'cash wrap curved register round counter', param: 'u' });
  add('counter_oval', 'Curved counter, oval ring', 'retail', 240, 120, 42, 'case', (w, d) => ({ polys: [E(0, 0, w / 2, d / 2, 64), E(0, 0, w / 2 - 30, d / 2 - 30, 64)] }), (w, d, h) => [ring(w / 2, d / 2, 30, 0, h - 1.5, steel), ring(w / 2, d / 2, 30, h - 1.5, 1.5, white), ring(w / 2 - 2, d / 2 - 2, 1, h, 30, glass)], { tags: 'production glazing elliptical service counter curved bar viewing', param: 'band' });
  add('counter_curve', 'Curved counter, arc', 'retail', 144, 48, 42, 'case', (w, d) => ({ polys: [arcBand(w, d, 30)] }), (w, d, h) => [ext(arcBand(w, d, 30), 0, h - 1.5, accent), ext(arcBand(w, d, 30), h - 1.5, 1.5, white)], { tags: 'curved service bar counter arc', param: 'band' });
  add('stanchion', 'Queue stanchion', 'retail', 12, 12, 38, 'furn', (w, d) => ({ polys: [E(0, 0, w / 2, d / 2, 16)], circles: [{ c: P(0, 0), r: 1.2 }] }), (w, d, h) => [cyl(0, 0, 0, w / 2, 1, metal), cyl(0, 0, 0, 1.2, h, metal)], { tags: 'post rope queue line' });
  add('queue_line', 'Queue line (posts + rope)', 'retail', 144, 12, 38, 'furn', (w, d) => { const n = Math.max(2, Math.round(w / 72) + 1), circles = [], lines = []; for (let i = 0; i < n; i++) { const x = -w / 2 + 6 + (w - 12) * i / (n - 1); circles.push({ c: P(x, 0), r: 6 }); if (i) lines.push([P(-w / 2 + 6 + (w - 12) * (i - 1) / (n - 1) + 6, 0), P(x - 6, 0)]); } return { circles, lines }; },
    (w, d, h) => { const n = Math.max(2, Math.round(w / 72) + 1), o = []; for (let i = 0; i < n; i++) { const x = -w / 2 + 6 + (w - 12) * i / (n - 1); o.push(cyl(x, 0, 0, 6, 1, metal), cyl(x, 0, 0, 1.2, h, metal)); } o.push(box(0, 0, h - 4, w - 12, 0.8, 0.8, accent)); return o; }, { tags: 'stanchions rope line queue posts' });
  add('mannequin', 'Mannequin', 'retail', 20, 14, 70, 'furn', (w, d) => ({ polys: [E(0, 0, w / 2, d / 2, 18)], circles: [{ c: P(0, 0), r: 4 }] }), (w, d, h) => [cyl(0, 0, 0, 7, 1, metal), cyl(0, 0, 1, 0.8, 30, metal), box(0, 0, 31, w - 4, d - 4, 26, white), cyl(0, 0, 58, 4, 10, white)], { tags: 'form apparel' });
  add('kiosk', 'Digital sign kiosk', 'retail', 24, 12, 72, 'sign', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2, d / 2), P(w / 2, -d / 2)]] }), (w, d, h) => [box(0, 0, 0, w, d, h, brand), box(0, d / 2 + 0.3, 30, w - 4, 0.5, 36, dark)], { tags: 'digital sign screen totem wayfinding' });
  add('podium', 'Round display podium', 'retail', 36, 36, 36, 'case', (w, d) => ({ polys: [E(0, 0, w / 2, d / 2, 28)] }), (w, d, h) => [cyl(0, 0, 0, w / 2, h, white)], { tags: 'plinth display round' });

  // Office
  add('desk', 'Desk', 'office', 60, 30, 29, 'furn', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), ...chairSym(0, d / 2 + 6, 20, 180)] }), (w, d, h) => [box(0, 0, h - 1.5, w, d, 1.5, wood), box(-w / 2 + 1, 0, 0, 2, d, h - 1.5, wood), box(w / 2 - 1, 0, 0, 2, d, h - 1.5, wood)], { tags: 'workstation table' });
  add('desk_l', 'L-shaped desk', 'office', 72, 72, 29, 'furn', (w, d) => ({ polys: [[P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, -d / 2 + 30), P(-w / 2 + 30, -d / 2 + 30), P(-w / 2 + 30, d / 2), P(-w / 2, d / 2)]] }), (w, d, h) => [ext([P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, -d / 2 + 30), P(-w / 2 + 30, -d / 2 + 30), P(-w / 2 + 30, d / 2), P(-w / 2, d / 2)], h - 1.5, 1.5, wood)], { tags: 'corner desk' });
  add('task_chair', 'Task chair', 'office', 26, 26, 38, 'furn', (w, d) => ({ polys: [E(0, 0, w / 2, d / 2, 20), R(-w / 2 + 3, -d / 2, w / 2 - 3, -d / 2 + 4)] }), (w, d, h) => [cyl(0, 0, 0, w / 2, 2, dark), cyl(0, 0, 2, 1, 15, metal), box(0, 0, 17, w - 6, d - 6, 3, dark), box(0, -d / 2 + 2, 17, w - 8, 3, h - 17, dark)], { tags: 'office chair' });
  add('conference', 'Conference table, 10 seats', 'office', 144, 84, 29, 'furn', (w, d) => tableWithChairs(w, d, false, 4), (w, d, h) => [box(0, 0, h - 1.5, w - 20, d - 40, 1.5, wood), box(0, 0, 0, w - 60, 12, h - 1.5, metal)], { tags: 'meeting boardroom' });
  add('reception', 'Reception desk', 'office', 96, 30, 42, 'case', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2, d / 2 - 10), P(w / 2, d / 2 - 10)]] }), (w, d, h) => [box(0, 0, 0, w, d, 29, wood), box(0, d / 2 - 5, 29, w, 10, h - 29, wood)], { tags: 'front desk welcome' });
  add('file_cabinet', 'File cabinet', 'office', 15, 28, 52, 'furn', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2, d / 2 - 2), P(w / 2, d / 2 - 2)]] }), (w, d, h) => [box(0, 0, 0, w, d, h, metal)], { tags: 'filing' });

  // People, vehicles, plants
  add('person', 'Person standing', 'people', 24, 18, 68, 'pepl', (w, d) => ({ polys: [E(0, 0, w / 2, d / 2, 20)], circles: [{ c: P(0, 0), r: 4.5 }] }), (w, d, h) => [cyl(0, 0, 0, 6, h - 10, person, { sy: 0.7 }), cyl(0, 0, h - 10, 4.5, 10, person)], { tags: 'human figure entourage scale' });
  add('person_seated', 'Person seated', 'people', 22, 26, 48, 'pepl', (w, d) => ({ polys: [E(0, -2, w / 2, d / 2 - 4, 20)], circles: [{ c: P(0, -4), r: 4.5 }] }), (w, d, h) => [box(0, 4, 0, 14, 18, 18, person), cyl(0, -2, 18, 6, 22, person, { sy: 0.7 }), cyl(0, -2, 40, 4.5, 8, person)], { tags: 'human sitting entourage' });
  add('car', 'Car', 'vehicles', 74, 190, 58, 'vehi', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), R(-w / 2 + 6, -d / 2 + 50, w / 2 - 6, d / 2 - 40)] }), (w, d, h) => [box(0, 0, 8, w, d, 26, accent), box(0, 5, 34, w - 8, d - 90, h - 34, glass)], { tags: 'vehicle parking sedan' });
  add('bike', 'Bicycle', 'vehicles', 24, 70, 40, 'vehi', (w, d) => ({ lines: [[P(0, -d / 2), P(0, d / 2)], [P(-10, -d / 2 + 10), P(10, -d / 2 + 10)]] }), (w, d, h) => [box(0, 0, 0, 2, d, h, metal)], { tags: 'bicycle rack' });
  add('tree', 'Tree', 'plants', 120, 120, 240, 'plnt', (w, d) => ({ polys: [E(0, 0, w / 2, d / 2, 18)], circles: [{ c: P(0, 0), r: 4 }], lines: [[P(-w / 4, 0), P(w / 4, 0)], [P(0, -d / 4), P(0, d / 4)]] }), (w, d, h) => [cyl(0, 0, 0, 5, h * 0.45, wood), cyl(0, 0, h * 0.4, w / 2, h * 0.6, plant, { sphere: true })], { tags: 'landscape canopy shade' });
  add('shrub', 'Shrub', 'plants', 36, 36, 36, 'plnt', (w, d) => ({ polys: [E(0, 0, w / 2, d / 2, 14)] }), (w, d, h) => [cyl(0, 0, 0, w / 2, h, plant, { sphere: true })], { tags: 'bush hedge landscape' });
  add('planter', 'Potted plant', 'plants', 24, 24, 48, 'plnt', (w, d) => ({ polys: [E(0, 0, w / 2, d / 2, 16), E(0, 0, w / 3, d / 3, 12)] }), (w, d, h) => [cyl(0, 0, 0, w / 3, 18, white), cyl(0, 0, 16, w / 2, h - 16, plant, { sphere: true })], { tags: 'plant pot indoor' });
  add('planter_box', 'Planter box', 'plants', 72, 24, 30, 'plnt', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), R(-w / 2 + 3, -d / 2 + 3, w / 2 - 3, d / 2 - 3)] }), (w, d, h) => [box(0, 0, 0, w, d, h - 8, wood), box(0, 0, h - 8, w - 6, d - 6, 12, plant)], { tags: 'landscape box' });

  // Lighting (drawn dashed: above the cut plane)
  add('pendant', 'Pendant light', 'lighting', 16, 16, 12, 'lite', (w, d) => ({ polys: [E(0, 0, w / 2, d / 2, 20)], lines: [[P(-w / 2, 0), P(w / 2, 0)], [P(0, -d / 2), P(0, d / 2)]], dash: true }), (w, d, h) => [cyl(0, 0, 84, w / 2, h, accent, { cone: true }), cyl(0, 0, 96, 0.3, 24, metal)], { tags: 'hanging lamp light fixture', mount: 'ceiling' });
  add('downlight', 'Recessed downlight', 'lighting', 6, 6, 1, 'lite', (w, d) => ({ circles: [{ c: P(0, 0), r: w / 2 }, { c: P(0, 0), r: w / 4 }] }), (w, d, h) => [cyl(0, 0, 0, w / 2, h, white, { emissive: true })], { tags: 'can light recessed', mount: 'ceiling' });
  add('linear_light', 'Linear light', 'lighting', 48, 4, 3, 'lite', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], dash: true }), (w, d, h) => [box(0, 0, 0, w, d, h, white, { emissive: true })], { tags: 'strip led light fixture', mount: 'ceiling' });
  add('floor_lamp', 'Floor lamp', 'lighting', 16, 16, 64, 'lite', (w, d) => ({ circles: [{ c: P(0, 0), r: w / 2 }, { c: P(0, 0), r: 2 }] }), (w, d, h) => [cyl(0, 0, 0, 5, 1, metal), cyl(0, 0, 1, 0.6, h - 12, metal), cyl(0, 0, h - 12, w / 2, 12, white, { cone: true })], { tags: 'lamp' });

  // Equipment
  add('prep_table', 'Stainless prep table', 'equipment', 72, 30, 36, 'eqpm', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2, -d / 2 + 4), P(w / 2, -d / 2 + 4)]] }), (w, d, h) => [box(0, 0, h - 1.5, w, d, 1.5, steel), box(0, 0, 8, w - 2, d - 2, 1, steel), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => box(sx * (w / 2 - 1.5), sy * (d / 2 - 1.5), 0, 1.5, 1.5, h - 1.5, steel))], { tags: 'kitchen commercial work table' });
  add('comp_sink', '3-compartment sink', 'equipment', 90, 24, 36, 'eqpm', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), R(-w / 2 + 18, -d / 2 + 3, -w / 2 + 36, d / 2 - 3), R(-9, -d / 2 + 3, 9, d / 2 - 3), R(w / 2 - 36, -d / 2 + 3, w / 2 - 18, d / 2 - 3)] }), (w, d, h) => [box(0, 0, 0, w, d, h, steel)], { tags: 'commercial sink kitchen' });
  add('oven', 'Commercial oven', 'equipment', 40, 40, 60, 'eqpm', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2, -d / 2), P(w / 2, d / 2)], [P(w / 2, -d / 2), P(-w / 2, d / 2)]] }), (w, d, h) => [box(0, 0, 0, w, d, h, steel)], { tags: 'convection fryer production equipment' });
  add('production_line', 'Production line (conveyor)', 'equipment', 192, 36, 48, 'eqpm', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: shelves(w, d, 6) }), (w, d, h) => [box(0, 0, 0, w, d, 34, steel), box(0, 0, 34, w - 6, d - 6, 4, metal), box(0, 0, 38, w - 12, d - 12, 10, glass)], { tags: 'conveyor fryer glazing waterfall doughnut bakery' });
  add('walk_in', 'Walk-in cooler', 'equipment', 96, 96, 96, 'eqpm', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2), R(-w / 2 + 4, -d / 2 + 4, w / 2 - 4, d / 2 - 4)] }), (w, d, h) => [box(0, 0, 0, w, d, h, white)], { tags: 'cooler freezer refrigeration' });
  add('mop_sink', 'Mop sink', 'equipment', 24, 24, 12, 'eqpm', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], lines: [[P(-w / 2, -d / 2), P(w / 2, d / 2)]] }), (w, d, h) => [box(0, 0, 0, w, d, h, white)], { tags: 'janitor service sink' });
  add('water_heater', 'Water heater', 'equipment', 24, 24, 60, 'eqpm', (w, d) => ({ polys: [E(0, 0, w / 2, d / 2, 20)], lines: [[P(-w / 2, 0), P(w / 2, 0)]] }), (w, d, h) => [cyl(0, 0, 0, w / 2, h, white)], { tags: 'wh' });
  add('vending', 'Vending machine', 'equipment', 40, 36, 72, 'eqpm', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)] }), (w, d, h) => [box(0, 0, 0, w, d, h, accent), box(0, d / 2 + 0.3, 20, w - 8, 0.5, 44, glass)], { tags: 'snack drink' });

  // Signage
  add('wall_sign', 'Wall sign', 'signage', 96, 3, 30, 'sign', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], dash: true }), (w, d, h) => [box(0, 0, 96, w, d, h, brand, { sign: true })], { tags: 'logo signage brand graphic letters', mount: 'wall' });
  add('blade_sign', 'Blade sign', 'signage', 3, 30, 30, 'sign', (w, d) => ({ polys: [R(-w / 2, -d / 2, w / 2, d / 2)], dash: true }), (w, d, h) => [box(0, 0, 108, w, d, h, brand, { sign: true })], { tags: 'projecting sign brand', mount: 'wall' });

  function uCounter(w, d) {
    // A U-shaped counter: straight run along the back, round end toward +x. Band 30" deep.
    const b = Math.min(30, d / 2 - 2), r = d / 2, ri = r - b, cx = w / 2 - r, o = [];
    o.push(P(-w / 2, -r)); for (let i = 0; i <= 18; i++) { const a = -Math.PI / 2 + Math.PI * i / 18; o.push(P(cx + r * Math.cos(a), r * Math.sin(a))); }
    o.push(P(-w / 2 + 24, r), P(-w / 2 + 24, ri)); for (let i = 18; i >= 0; i--) { const a = -Math.PI / 2 + Math.PI * i / 18; o.push(P(cx + ri * Math.cos(a), ri * Math.sin(a))); }
    o.push(P(-w / 2, -ri));
    return { polys: [o] };
  }
  function arcBand(w, d, band) {
    // A shallow arc w wide that bows d toward +y, band deep.
    const sag = Math.max(1, d - band), half = w / 2, R0 = (half * half + sag * sag) / (2 * sag), cy = -d / 2 + R0, a0 = Math.asin(Math.min(1, half / R0)), o = [], n = 24;
    for (let i = 0; i <= n; i++) { const a = -a0 + 2 * a0 * i / n; o.push(P(R0 * Math.sin(a), cy - R0 * Math.cos(a))); }
    for (let i = n; i >= 0; i--) { const a = -a0 + 2 * a0 * i / n; o.push(P((R0 - band) * Math.sin(a), cy - (R0 - band) * Math.cos(a))); }
    return o;
  }

  const CATS = [['seating', 'Seating'], ['tables', 'Tables'], ['beds', 'Beds'], ['storage', 'Storage'], ['kitchen', 'Kitchen'], ['bath', 'Bath'], ['retail', 'Retail and displays'], ['office', 'Office'], ['equipment', 'Equipment'], ['lighting', 'Lighting'], ['signage', 'Signage'], ['people', 'People'], ['vehicles', 'Vehicles'], ['plants', 'Plants'], ['custom', 'My components']];
  const BY = new Map(C.map(c => [c.key, c]));
  /* Door and window presets live in the library too, but they are openings hosted on a wall, not items. */
  const OPENINGS = [
    { key: 'door_30', name: 'Door 2\'-6"', kind: 'door', width: 30, head: 80, tags: 'interior swing' }, { key: 'door_36', name: 'Door 3\'-0"', kind: 'door', width: 36, head: 84, tags: 'swing accessible' },
    { key: 'door_pair', name: 'Pair of doors 6\'-0"', kind: 'door', width: 72, head: 84, pair: true, tags: 'double entry' }, { key: 'storefront_door', name: 'Storefront entry pair 6\'-0"', kind: 'door', width: 72, head: 96, pair: true, tags: 'entrance glass aluminum' },
    { key: 'cased_42', name: 'Cased opening 3\'-6"', kind: 'cased', width: 42, head: 84, tags: 'passage no door' },
    { key: 'win_36', name: 'Window 3\'-0"', kind: 'window', width: 36, head: 84, sill: 36, tags: 'single hung' }, { key: 'win_60', name: 'Window 5\'-0"', kind: 'window', width: 60, head: 84, sill: 30, tags: 'double' },
    { key: 'storefront_glass', name: 'Storefront glazing 10\'-0"', kind: 'window', width: 120, head: 108, sill: 12, tags: 'glazing glass storefront curtain' },
  ];

  function get(key) { return BY.get(key) || null; }
  function customOf(it) { return /^custom:/.test(String(it.comp || '')); }
  function symbol(it) {
    const c = get(it.comp);
    if (!c) return { layer: customOf(it) ? 'furn' : 'furn', polys: [R(-it.w / 2, -it.d / 2, it.w / 2, it.d / 2)], lines: [[P(-it.w / 2, -it.d / 2), P(it.w / 2, it.d / 2)]] };
    const s = c.sym(it.w, it.d, it); return Object.assign({ layer: c.layer }, s);
  }
  function parts(it) {
    const c = get(it.comp);
    if (!c) return [box(0, 0, it.z || 0, it.w, it.d, it.h, customOf(it) ? 'custom' : 'white')];
    return c.parts(it.w, it.d, it.h, it);
  }
  function search(q, list) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean); list = list || C;
    if (!words.length) return list.slice();
    return list.map(c => { const hay = (c.name + ' ' + c.key.replace(/_/g, ' ') + ' ' + c.cat + ' ' + (c.tags || '')).toLowerCase(); let s = 0; words.forEach(w => { if (hay.includes(w)) s += hay.startsWith(w) || c.name.toLowerCase().includes(w) ? 2 : 1; }); return { c, s }; })
      .filter(x => x.s >= words.length).sort((a, b) => b.s - a.s).map(x => x.c);
  }
  /** A new item for this component, at a point, with its default size. */
  function make(key, at, extra) { const c = get(key) || {}; return Object.assign({ kind: 'component', comp: key, at: { x: at.x, y: at.y }, rot: 0, w: c.w || 24, d: c.d || 24, h: c.h || 30, z: 0 }, extra || {}); }

  const api = { CATALOG: C, CATS, OPENINGS, get, symbol, parts, search, make, uCounter, arcBand };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DrawUpDrawLib = api;
})(typeof window !== 'undefined' ? window : globalThis);
