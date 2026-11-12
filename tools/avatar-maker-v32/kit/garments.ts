import * as T from 'three';

// AUREVIA v4 fitted garments. Each garment is cut from the character's own body surface (a scalar "inside" field per
// vertex, clipped exactly at the zero line so hems are straight), pushed out along the surface normal by the fabric
// thickness, given a folded hem band, and skinned with the body's own bone weights. Garments therefore follow the
// body, body types and every animation without inflation, and the body skin under them is hidden so it cannot clip.

export type Top = 'none' | 'tee' | 'crop' | 'polo' | 'longsleeve' | 'tank' | 'hoodie' | 'sweater' | 'vest';
export type Jacket = 'none' | 'varsity';
export type Bottom = 'jeans' | 'cargo' | 'trousers' | 'joggers' | 'shorts' | 'basketball' | 'cargoShorts' | 'shortShorts' | 'compression' | 'leggings' | 'skirt';
export type Shoes = 'sneakers' | 'boots' | 'formal' | 'none';

export type Landmarks = {pelvisY: number; hipY: number; kneeY: number; ankleY: number; waistY: number; chestY: number; neckY: number; headY: number; shX: number; elX: number; wrX: number; armY: number; legX: number; neckZ: number};
export function landmarks(skel: T.Skeleton): Landmarks {
  const P = (n: string) => { const i = skel.bones.findIndex(b => b.name === n); return new T.Vector3().setFromMatrixPosition(new T.Matrix4().copy(skel.boneInverses[i]).invert()); };
  const pel = P('pelvis'), th = P('thigh_l'), ca = P('calf_l'), ft = P('foot_l'), s1 = P('spine_01'), s3 = P('spine_03'), nk = P('neck_01'), hd = P('Head'), ua = P('upperarm_l'), la = P('lowerarm_l'), hn = P('hand_l');
  return {pelvisY: pel.y, hipY: th.y, kneeY: ca.y, ankleY: ft.y, waistY: (s1.y + P('spine_02').y) / 2, chestY: s3.y, neckY: nk.y, headY: hd.y, shX: ua.x, elX: la.x, wrX: hn.x, armY: ua.y, legX: th.x, neckZ: nk.z};
}

// ---------- scalar fields: > 0 inside the garment ----------
const armT = (L: Landmarks, x: number, y: number) => { const ax = Math.abs(x); let t = ax < L.elX ? (ax - L.shX) / (L.elX - L.shX) : 1 + (ax - L.elX) / (L.wrX - L.elX); const pit = L.armY - .11; if (y < pit) t -= (pit - y) * 9; return t; };
const legT = (L: Landmarks, y: number) => y > L.hipY ? -(y - L.hipY) / (L.hipY - L.kneeY) : y > L.kneeY ? (L.hipY - y) / (L.hipY - L.kneeY) : 1 + (L.kneeY - y) / (L.kneeY - L.ankleY);
export type Spec = {drape?: number; cinch?: number; hull?: number; field: (L: Landmarks, x: number, y: number, z: number) => number; thick: number; loose?: (L: Landmarks, x: number, y: number, z: number) => number; hem: number};
const neckCut = (L: Landmarks, x: number, y: number, z: number, depth: number, width: number) => { const front = T.MathUtils.smoothstep(z - L.neckZ, .0, .06); return (L.neckY - .035 - depth * front * Math.max(0, 1 - Math.abs(x) / width)) - y + T.MathUtils.smoothstep(Math.abs(x), .1, .15); };
const AU = .24, LU = .41; // approx metres per arm / leg unit, so every field reads roughly in metres
const topSpec = (sleeve: number, hemDrop: number, depth: number, width: number, thick: number, loose = 0): Spec => ({hem: .012, thick: Math.max(thick, .008),
  field: (L, x, y, z) => Math.min(y - (L.hipY - hemDrop), (sleeve - armT(L, x, y)) * AU, neckCut(L, x, y, z, depth, width), (L.headY) - y),
  // tops sit over the waistband of any bottoms: extra room where they overlap
  loose: (L, x, y) => loose * T.MathUtils.smoothstep(y, L.hipY - hemDrop, L.chestY) * (armT(L, x, y) < .3 ? 1 : .5) + .009 * (1 - T.MathUtils.smoothstep(y, L.waistY - .02, L.waistY + .04))});
export const TOPS: Record<Exclude<Top, 'none'>, Spec> = {
  tee:        {hull: 0.8, drape: 12, ...(topSpec(.42, .02, .03, .09, .006, .007))},
  longsleeve: {hull: 0.7, drape: 10, cinch: .03, ...(topSpec(1.97, .02, .025, .09, .006, .006))},
  tank:       {hull: 0.5, drape: 1, ...({...topSpec(-.05, .02, .09, .13, .005), field: (L, x, y, z) => Math.min(y - (L.hipY - .02), (-.02 - armT(L, x, y) - Math.max(0, y - L.armY + .02) * 6) * AU, neckCut(L, x, y, z, .1, .12), L.headY - y)})},
  hoodie:     {hull: 1, drape: 16, cinch: .05, ...(topSpec(1.95, .06, .015, .085, .012, .016))},
  sweater:    {hull: 1, drape: 12, cinch: .04, ...(topSpec(1.96, .045, .02, .085, .01, .01))},
  vest:       {hull: 0.9, drape: 10, ...({...topSpec(-.02, .04, .17, .1, .014), field: (L, x, y, z) => Math.min(y - (L.hipY - .04), (-.02 - armT(L, x, y) - Math.max(0, y - L.armY + .03) * 5) * AU, neckCut(L, x, y, z, .17, .1), L.headY - y)})},
  crop:       {hull: 0.6, drape: 6, ...({...topSpec(.38, 0, .03, .09, .005), field: (L, x, y, z) => Math.min(y - (L.waistY + .035), .38 * AU - armT(L, x, y) * AU, neckCut(L, x, y, z, .03, .09), L.headY - y)})},
  polo:       {hull: 0.8, drape: 12, ...(topSpec(.44, .03, .07, .035, .006, .007))},
};
// jacket layer worn open over the top: a centre-front opening shows the layer underneath
export const JACKETS: Record<Exclude<Jacket, 'none'>, Spec> = {
  varsity: {hull: 1, drape: 18, cinch: .05, hem: .016, thick: .02, loose: (L, x, y) => .02 * T.MathUtils.smoothstep(y, L.waistY - .1, L.chestY) + .006,
    field: (L, x, y, z) => Math.min(y - (L.waistY - .09), (1.94 - armT(L, x, y)) * AU, neckCut(L, x, y, z, .04, .1), L.headY - y, z < L.neckZ - .02 || armT(L, x, y) > .1 ? 1 : Math.abs(x) - (.006 + .03 * T.MathUtils.smoothstep(y, L.chestY - .04, L.neckY)))},
};
const waist = (L: Landmarks, y: number, drop: number) => L.waistY - drop - y, leg = (L: Landmarks, y: number, to: number) => (to - legT(L, y)) * LU;
const ease = (L: Landmarks, y: number, amount: number, from: number, to: number) => amount * T.MathUtils.smoothstep(legT(L, y), from, to);
export const BOTTOMS: Record<Exclude<Bottom, 'skirt'>, Spec> = {
  cargo:       {hull: 1, drape: 12, cinch: .05, hem: .014, thick: .008, field: (L, x, y) => Math.min(waist(L, y, .05), leg(L, y, 1.9)), loose: (L, x, y) => ease(L, y, .024, .3, 1.1)},
  jeans:       {hull: 0.4, drape: 3, hem: .01, thick: .006, field: (L, x, y) => Math.min(waist(L, y, .055), leg(L, y, 1.93)), loose: (L, x, y) => ease(L, y, .004, .8, 1.6)},
  trousers:    {hull: 0.9, drape: 12, hem: .01, thick: .008, field: (L, x, y) => Math.min(waist(L, y, .045), leg(L, y, 1.95)), loose: (L, x, y) => ease(L, y, .016, .25, 1.2)},
  joggers:     {hull: 0.9, drape: 10, cinch: .04, hem: .016, thick: .008, field: (L, x, y) => Math.min(waist(L, y, .04), leg(L, y, 1.9)), loose: (L, x, y) => ease(L, y, .014, .1, 1)},
  shorts:      {hull: 0.7, drape: 8, hem: .012, thick: .007, field: (L, x, y) => Math.min(waist(L, y, .05), leg(L, y, .55)), loose: (L, x, y) => ease(L, y, .012, .1, .5)},
  basketball:  {hull: 1, drape: 12, hem: .014, thick: .008, field: (L, x, y) => Math.min(waist(L, y, .05), leg(L, y, .95)), loose: (L, x, y) => ease(L, y, .03, 0, .5)},
  cargoShorts: {hull: 1, drape: 12, hem: .014, thick: .008, field: (L, x, y) => Math.min(waist(L, y, .05), leg(L, y, .72)), loose: (L, x, y) => ease(L, y, .02, .05, .6)},
  shortShorts: {hull: 0.3, drape: 4, hem: .01, thick: .006, field: (L, x, y) => Math.min(waist(L, y, .07), leg(L, y, .2)), loose: (L, x, y) => ease(L, y, .004, 0, .2)},
  compression: {hem: .006, thick: .003, field: (L, x, y) => Math.min(waist(L, y, .06), leg(L, y, .42))},
  leggings:    {hem: .006, thick: .003, field: (L, x, y) => Math.min(waist(L, y, .04), leg(L, y, 1.92))},
};
// crew socks: from mid-calf down, under the shoe
export const SOCKS: Spec = {hem: .006, thick: .003, field: (L, x, y) => Math.min(legT(L, y) - 1.55, (2.6 - legT(L, y)) * LU)};
export const SHOES: Record<Exclude<Shoes, 'none'>, Spec> = {
  sneakers: {drape: 40, hem: .012, thick: .014, field: (L, x, y) => (legT(L, y) - 1.9) * LU, loose: (L, x, y, z) => .012 * T.MathUtils.smoothstep(z, .02, .1) + .006},
  boots:    {drape: 40, hem: .008, thick: .01, field: (L, x, y) => (legT(L, y) - 1.6) * LU, loose: (L, x, y, z) => .005 * T.MathUtils.smoothstep(z, .02, .1) + .003},
  formal:   {drape: 40, hem: .006, thick: .009, field: (L, x, y) => (legT(L, y) - 1.95) * LU, loose: (L, x, y, z) => .018 * T.MathUtils.smoothstep(z, .03, .11) + .003},
};
export function fieldOf(spec: Spec, L: Landmarks, pos: T.BufferAttribute, i: number) { return spec.field(L, pos.getX(i), pos.getY(i), pos.getZ(i)); }

// ---------- cut, offset and hem one garment from the body ----------
export function cutGarment(body: T.BufferGeometry, L: Landmarks, spec: Spec, armBones?: Set<number>) {
  const pos = body.attributes.position as T.BufferAttribute, nrm = body.attributes.normal as T.BufferAttribute, si = body.attributes.skinIndex as T.BufferAttribute, sw = body.attributes.skinWeight as T.BufferAttribute, idx = body.index!.array;
  const f = new Float32Array(pos.count); for (let i = 0; i < pos.count; i++) f[i] = fieldOf(spec, L, pos, i);
  const P: number[] = [], N: number[] = [], SI: number[] = [], SW: number[] = [], E: number[] = [], map = new Map<string, number>(), out: number[] = [];
  const v = new T.Vector3(), n = new T.Vector3();
  const addBlend = (a: number, b: number, t: number) => { // vertex on edge a→b (t = 0 → a)
    const key = a < b ? `${a}_${b}` : `${b}_${a}`; if (map.has(key)) return map.get(key)!;
    v.set(pos.getX(a), pos.getY(a), pos.getZ(a)).lerp(new T.Vector3(pos.getX(b), pos.getY(b), pos.getZ(b)), t); n.set(nrm.getX(a), nrm.getY(a), nrm.getZ(a)).lerp(new T.Vector3(nrm.getX(b), nrm.getY(b), nrm.getZ(b)), t).normalize();
    const w = new Map<number, number>(); for (let c = 0; c < 4; c++) { w.set(si.getComponent(a, c), (w.get(si.getComponent(a, c)) || 0) + sw.getComponent(a, c) * (1 - t)); w.set(si.getComponent(b, c), (w.get(si.getComponent(b, c)) || 0) + sw.getComponent(b, c) * t); }
    const top = [...w.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4); while (top.length < 4) top.push([0, 0]); const s = top.reduce((u, e) => u + e[1], 0) || 1;
    const k = P.length / 3; P.push(v.x, v.y, v.z); N.push(n.x, n.y, n.z); top.forEach(e => { SI.push(e[0]); SW.push(e[1] / s); }); E.push(f[a] + (f[b] - f[a]) * t); map.set(key, k); return k; };
  const own = (a: number) => addBlend(a, a, 0);
  for (let t = 0; t < idx.length; t += 3) { const tri = [idx[t], idx[t + 1], idx[t + 2]], ins = tri.map(i => f[i] >= 0); const cnt = ins.filter(Boolean).length; if (!cnt) continue;
    if (cnt === 3) { out.push(own(tri[0]), own(tri[1]), own(tri[2])); continue; }
    const poly: number[] = []; for (let k = 0; k < 3; k++) { const a = tri[k], b = tri[(k + 1) % 3]; if (ins[k]) poly.push(own(a)); if (ins[k] !== ins[(k + 1) % 3]) poly.push(addBlend(a, b, f[a] / (f[a] - f[b]))); }
    for (let k = 1; k + 1 < poly.length; k++) out.push(poly[0], poly[k], poly[k + 1]); }
  // arm coordinate per vertex (sleeves vs body), measured before the offset
  // sleeve weight per vertex: how much the body's arm bones drive it (a clean shoulder seam for two-tone sleeves)
  const ARM: number[] = []; for (let i = 0; i < P.length / 3; i++) { let w = 0; if (armBones) for (let c = 0; c < 4; c++) if (armBones.has(SI[i * 4 + c])) w += SW[i * 4 + c]; ARM.push(w); }
  // fabric spans hollows: per cross-section (torso and legs sliced by height, arms by length) every point moves out toward
  // the slice's convex outline, so cloth bridges the cleavage, abs, spine and between muscles while waist and hips keep their shape
  if (spec.hull) { const groups = new Map<string, number[]>(), nv = P.length / 3;
    for (let i = 0; i < nv; i++) { const x = P[i * 3], y = P[i * 3 + 1], key = ARM[i] > .5 ? 'a' + Math.sign(x) + ':' + Math.round(Math.abs(x) / .012) : y < L.hipY - .07 ? 'l' + Math.sign(x) + ':' + Math.round(y / .012) : 't:' + Math.round(y / .012); const g = groups.get(key); if (g) g.push(i); else groups.set(key, [i]); }
    for (const [key, ids] of groups) { if (ids.length < 4) continue; const arm = key[0] === 'a', pt = (i: number): [number, number] => arm ? [P[i * 3 + 1], P[i * 3 + 2]] : [P[i * 3], P[i * 3 + 2]];
      const pts = ids.map(pt).sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo: number[][] = [], hi: number[][] = [];
      for (const q of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (let k = pts.length - 1; k >= 0; k--) { const q = pts[k]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
      const hull = lo.slice(0, -1).concat(hi.slice(0, -1)); if (hull.length < 3) continue; const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cz = pts.reduce((a, q) => a + q[1], 0) / pts.length;
      for (const i of ids) { const [px, pz] = pt(i), dx = px - cx, dz = pz - cz; if (Math.abs(dx) + Math.abs(dz) < 1e-5) continue; let best = 1;
        for (let k = 0; k < hull.length; k++) { const a = hull[k], b = hull[(k + 1) % hull.length], ex = b[0] - a[0], ez = b[1] - a[1], den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue; const t = ((a[0] - cx) * ez - (a[1] - cz) * ex) / den, u = ((a[0] - cx) * dz - (a[1] - cz) * dx) / den; if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t); }
        const k2 = 1 + (best - 1) * spec.hull, nx = cx + dx * k2, nz = cz + dz * k2; if (arm) { P[i * 3 + 1] = nx; P[i * 3 + 2] = nz; } else { P[i * 3] = nx; P[i * 3 + 2] = nz; } } } }
  // offset along the normal (fabric thickness + optional ease)
  for (let i = 0; i < P.length / 3; i++) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], d = spec.thick + (spec.loose ? spec.loose(L, x, y, z) : 0) * (spec.cinch ? T.MathUtils.smoothstep(E[i], 0, spec.cinch) : 1); P[i * 3] += N[i * 3] * d; P[i * 3 + 1] += N[i * 3 + 1] * d; P[i * 3 + 2] += N[i * 3 + 2] * d; }
  // drape: smooth the shell so fabric bridges hollows (no painted-on look), never closer to the body than its thickness
  if (spec.drape) { const nv = P.length / 3, nb: Set<number>[] = Array.from({length: nv}, () => new Set()), base = P.slice(); for (let t = 0; t < out.length; t += 3) for (let k = 0; k < 3; k++) { nb[out[t + k]].add(out[t + (k + 1) % 3]); nb[out[t + k]].add(out[t + (k + 2) % 3]); }
    const cnt = new Map<string, number>(); for (let t = 0; t < out.length; t += 3) for (let k = 0; k < 3; k++) { const a = out[t + k], b = out[t + (k + 1) % 3], key = a < b ? a + '_' + b : b + '_' + a; cnt.set(key, (cnt.get(key) || 0) + 1); }
    const rim = new Set<number>(); for (const [key, c] of cnt) if (c === 1) key.split('_').forEach(v => rim.add(+v));
    for (let it = 0; it < spec.drape; it++) { const Q = P.slice(); for (let i = 0; i < nv; i++) { if (rim.has(i) || !nb[i].size) continue; let x = 0, y = 0, z = 0; for (const j of nb[i]) { x += Q[j * 3]; y += Q[j * 3 + 1]; z += Q[j * 3 + 2]; } const n = nb[i].size; x /= n; y /= n; z /= n;
      const bx = base[i * 3] - N[i * 3] * 0, d = (x - base[i * 3]) * N[i * 3] + (y - base[i * 3 + 1]) * N[i * 3 + 1] + (z - base[i * 3 + 2]) * N[i * 3 + 2]; void bx; const push = Math.max(0, -d); P[i * 3] = x + N[i * 3] * push; P[i * 3 + 1] = y + N[i * 3 + 1] * push; P[i * 3 + 2] = z + N[i * 3 + 2] * push; } } }
  // hem: a band folded inward along every open edge, so edges have visible thickness
  const edges = new Map<string, [number, number, number]>(); for (let t = 0; t < out.length; t += 3) for (let k = 0; k < 3; k++) { const a = out[t + k], b = out[t + (k + 1) % 3], key = a < b ? `${a}_${b}` : `${b}_${a}`; const e = edges.get(key); if (e) e[2]++; else edges.set(key, [a, b, 1]); }
  const inner = new Map<number, number>(); const dup = (a: number) => { if (inner.has(a)) return inner.get(a)!; const k = P.length / 3, d = spec.thick + .004; P.push(P[a * 3] - N[a * 3] * d, P[a * 3 + 1] - N[a * 3 + 1] * d, P[a * 3 + 2] - N[a * 3 + 2] * d); N.push(-N[a * 3], -N[a * 3 + 1], -N[a * 3 + 2]); for (let c = 0; c < 4; c++) { SI.push(SI[a * 4 + c]); SW.push(SW[a * 4 + c]); } E.push(0); ARM.push(ARM[a]); inner.set(a, k); return k; };
  for (const [a, b, c] of edges.values()) if (c === 1) { const ia = dup(a), ib = dup(b); out.push(b, a, ia, b, ia, ib); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(N, 3)); g.setAttribute('skinIndex', new T.Uint16BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(SW, 4));
  g.setAttribute('aRest', new T.Float32BufferAttribute(P.slice(), 3)); g.setAttribute('aEdge', new T.Float32BufferAttribute(E, 1)); g.setAttribute('aArm', new T.Float32BufferAttribute(ARM, 1)); g.setIndex(out); g.computeVertexNormals();
  // keep the hem band normals from smoothing the outer surface: recompute is fine for shading; boundary bands are thin
  g.computeBoundingSphere(); return {geometry: g, field: f};
}

// ---------- skirt: a hanging tube (not cut from the legs), skinned between the pelvis and both thighs ----------
export function skirtGeometry(body: T.BufferGeometry, L: Landmarks, skel: T.Skeleton, length = .62) {
  const pos = body.attributes.position as T.BufferAttribute, rings = 14, segs = 48, top = L.waistY - .05, bottom = L.hipY - length * (L.hipY - L.kneeY), cz = -.02;
  const bi = (n: string) => skel.bones.findIndex(b => b.name === n), PEL = bi('pelvis'), TL = bi('thigh_l'), TR = bi('thigh_r');
  // per-ring body silhouette (max radius per angle among nearby vertices), then forced to hang (never narrower below)
  const radii: number[][] = []; for (let r = 0; r <= rings; r++) { const y = top + (bottom - top) * r / rings, row = new Array(segs).fill(0);
    for (let i = 0; i < pos.count; i++) { const vy = pos.getY(i); if (Math.abs(vy - y) > .03 || Math.abs(pos.getX(i)) > .3) continue; if (vy < L.hipY && Math.abs(pos.getX(i)) > L.legX + .12) continue; const dx = pos.getX(i), dz = pos.getZ(i) - cz, a = Math.atan2(dz, dx), k = ((Math.round(a / (Math.PI * 2) * segs) % segs) + segs) % segs; row[k] = Math.max(row[k], Math.hypot(dx, dz)); }
    for (let k = 0; k < segs; k++) if (!row[k]) row[k] = Math.max(row[(k + 1) % segs], row[(k + segs - 1) % segs]);
    radii.push(row.map((v, k) => Math.max(v + .024, r ? radii[r - 1][k] + .004 : 0))); }
  for (let pass = 0; pass < 3; pass++) for (const row of radii) { const c = row.slice(); for (let k = 0; k < segs; k++) row[k] = (c[(k + segs - 1) % segs] + 2 * c[k] + c[(k + 1) % segs]) / 4; }
  const P: number[] = [], SI: number[] = [], SW: number[] = [], E: number[] = [], out: number[] = [];
  for (let r = 0; r <= rings; r++) { const u = r / rings, y = top + (bottom - top) * u; for (let k = 0; k <= segs; k++) { const a = k / segs * Math.PI * 2, rr = radii[r][k % segs]; const x = Math.cos(a) * rr, z = cz + Math.sin(a) * rr; P.push(x, y, z);
    const side = T.MathUtils.clamp(x / .12, -1, 1), legW = .55 * T.MathUtils.smoothstep(u, .15, 1); SI.push(PEL, TL, TR, 0); SW.push(1 - legW, legW * (side + 1) / 2, legW * (1 - side) / 2, 0); E.push(Math.min(u, 1 - u) * .3); } }
  for (let r = 0; r < rings; r++) for (let k = 0; k < segs; k++) { const a = r * (segs + 1) + k, b = a + segs + 1; out.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('skinIndex', new T.Uint16BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(SW, 4)); g.setAttribute('aRest', new T.Float32BufferAttribute(P.slice(), 3)); g.setAttribute('aEdge', new T.Float32BufferAttribute(E, 1)); g.setIndex(out); g.computeVertexNormals();
  // body covered by the skirt: hips and thighs down to the hem
  const field = new Float32Array(pos.count); for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); field[i] = Math.min(top - .02 - y, y - bottom - .03, .28 - Math.abs(pos.getX(i))); }
  return {geometry: g, field}; }

// ---------- hood (lying on the back) and drawstrings for the hoodie ----------
export function hoodGeometry(L: Landmarks, skel: T.Skeleton, neckR = .07) {
  const S3 = skel.bones.findIndex(b => b.name === 'spine_03'), parts: T.BufferGeometry[] = [];
  const ring = new T.CatmullRomCurve3(Array.from({length: 9}, (_, i) => { const a = -Math.PI * .15 + i / 8 * Math.PI * 1.3; return new T.Vector3(Math.cos(a) * (neckR + .045), L.neckY - .02 - Math.sin(a) * .0 + (i === 0 || i === 8 ? -.015 : 0), L.neckZ - .01 - Math.sin(a) * (neckR + .05)); }));
  parts.push(new T.TubeGeometry(ring, 40, .034, 10, false));
  const bz = L.neckZ - neckR - .075, back = new T.CatmullRomCurve3([new T.Vector3(0, L.neckY - .01, bz + .01), new T.Vector3(0, L.neckY - .1, bz - .01), new T.Vector3(0, L.chestY - .02, bz)]);
  const flap = new T.TubeGeometry(back, 12, .055, 12, false); flap.scale(1.6, 1, .45); flap.translate(0, 0, bz * .55); parts.push(flap);
  for (const s of [-1, 1]) parts.push(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(s * .035, L.neckY - .04, L.neckZ + neckR + .03), new T.Vector3(s * .04, L.chestY - .02, L.neckZ + neckR + .055), new T.Vector3(s * .042, L.chestY - .1, L.neckZ + neckR + .06)]), 10, .0035, 6, false));
  const merged = new T.BufferGeometry(), P: number[] = [], Nn: number[] = [], out: number[] = []; let off = 0;
  for (const p of parts) { const a = p.attributes.position, n = p.attributes.normal; for (let i = 0; i < a.count; i++) { P.push(a.getX(i), a.getY(i), a.getZ(i)); Nn.push(n.getX(i), n.getY(i), n.getZ(i)); } const ix = p.index!.array; for (let i = 0; i < ix.length; i++) out.push(ix[i] + off); off += a.count; p.dispose(); }
  merged.setAttribute('position', new T.Float32BufferAttribute(P, 3)); merged.setAttribute('normal', new T.Float32BufferAttribute(Nn, 3)); merged.setAttribute('skinIndex', new T.Uint16BufferAttribute(new Array(off * 4).fill(0).map((_, i) => i % 4 ? 0 : S3), 4)); merged.setAttribute('skinWeight', new T.Float32BufferAttribute(new Array(off * 4).fill(0).map((_, i) => i % 4 ? 0 : 1), 4)); merged.setAttribute('aRest', new T.Float32BufferAttribute(P.slice(), 3)); merged.setAttribute('aEdge', new T.Float32BufferAttribute(new Array(off).fill(1), 1)); merged.setIndex(out);
  return merged; }

// ---------- shoe soles: a real sole under each foot (outline from the foot, rounded edge, heel for formal shoes) ----------
export const SOLE = {sneakers: {h: .034, grow: .02, heel: 0, spring: .01}, boots: {h: .026, grow: .01, heel: .012, spring: .004}, formal: {h: .012, grow: .005, heel: .02, spring: .002}};
export function soleGeometry(body: T.BufferGeometry, L: Landmarks, skel: T.Skeleton, kind: keyof typeof SOLE) {
  const pos = body.attributes.position as T.BufferAttribute, k = SOLE[kind], segs = 40, P: number[] = [], SI: number[] = [], SW: number[] = [], out: number[] = [];
  let footMin = Infinity; for (let i = 0; i < pos.count; i++) if (legT(L, pos.getY(i)) > 1.95) footMin = Math.min(footMin, pos.getY(i));
  for (const side of [1, -1]) { const s = side > 0 ? 'l' : 'r', FOOT = skel.bones.findIndex(b => b.name === 'foot_' + s), BALL = skel.bones.findIndex(b => b.name === 'ball_' + s);
    const ballZ = new T.Vector3().setFromMatrixPosition(new T.Matrix4().copy(skel.boneInverses[BALL]).invert()).z;
    const pts: number[][] = []; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); if (Math.sign(x) !== side || legT(L, y) < 1.95 || y > footMin + .05) continue; pts.push([x, pos.getZ(i)]); }
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length, r = new Array(segs).fill(0);
    for (const [x, z] of pts) { const a = Math.atan2(z - cz, x - cx), b = ((Math.round(a / (Math.PI * 2) * segs) % segs) + segs) % segs; r[b] = Math.max(r[b], Math.hypot(x - cx, z - cz)); }
    for (let b = 0; b < segs; b++) if (!r[b]) r[b] = (r[(b + 1) % segs] + r[(b + segs - 1) % segs]) / 2;
    for (let pass = 0; pass < 2; pass++) { const c = r.slice(); for (let b = 0; b < segs; b++) r[b] = (c[(b + segs - 1) % segs] + 2 * c[b] + c[(b + 1) % segs]) / 4; }
    const top = footMin + .002, base = P.length / 3;
    // rings: top inner lip, top edge, upper wall, lower wall (rounded), bottom edge; then a bottom cap centre
    const rings: [number, number][] = [[-.006, 0], [0, 0], [0, -.55], [-.002, -.92], [-.007, -1]];
    for (const [inset, t] of rings) for (let b = 0; b <= segs; b++) { const a = b / segs * Math.PI * 2, rr = r[b % segs] + k.grow + inset, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const back = T.MathUtils.smoothstep(cz - z, .02, .07), toe = T.MathUtils.smoothstep(z - ballZ, 0, .05), h = k.h + k.heel * back, y = top + t * h + (t < -.5 ? toe * k.spring : 0);
      P.push(x, y, z); const wb = T.MathUtils.smoothstep(z, ballZ - .025, ballZ + .015); SI.push(FOOT, BALL, 0, 0); SW.push(1 - wb, wb, 0, 0); }
    const c0 = P.length / 3; P.push(cx, top - k.h, cz); SI.push(FOOT, 0, 0, 0); SW.push(1, 0, 0, 0); const c1 = P.length / 3; P.push(cx, top - .004, cz); SI.push(FOOT, 0, 0, 0); SW.push(1, 0, 0, 0);
    for (let ri = 0; ri < rings.length - 1; ri++) for (let b = 0; b < segs; b++) { const a = base + ri * (segs + 1) + b, d = a + segs + 1; out.push(a, a + 1, d, a + 1, d + 1, d); }
    const last = base + (rings.length - 1) * (segs + 1); for (let b = 0; b < segs; b++) out.push(c0, last + b + 1, last + b);
    for (let b = 0; b < segs; b++) out.push(c1, base + b, base + b + 1); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('skinIndex', new T.Uint16BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(SW, 4));
  g.setAttribute('aRest', new T.Float32BufferAttribute(P.map((v, i) => i % 3 === 1 ? v - footMin : v), 3)); g.setAttribute('aEdge', new T.Float32BufferAttribute(new Array(P.length / 3).fill(1), 1)); g.setIndex(out); g.computeVertexNormals();
  return {geometry: g, field: new Float32Array(0), lift: k.h + k.heel * 0, footMin}; }
