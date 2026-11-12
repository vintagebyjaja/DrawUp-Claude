import * as T from 'three';
import {cutGarment, type Landmarks} from './garments';

// AUREVIA v4 extras: hairstyles grown from the character's own scalp (afro, tapered afro, puff, ponytail, locs, braids,
// cornrows) and accessories (glasses, hoops, cap, necklace, watch, backpack, scarf). Everything is skinned to the base
// skeleton, so it moves with the head, neck and body in every animation and body type.

export type HeadMarks = {eyeY: number; eyeX: number; eyeZ: number; headZ: number; headR: number; topY: number; earX: number; earY: number; earZ: number};
export function headMarks(body: T.BufferGeometry, eyes: T.BufferGeometry, L: Landmarks): HeadMarks {
  const e = eyes.attributes.position; let sx = 0, sy = 0, sz = 0, n = 0, maxZ = -1; for (let i = 0; i < e.count; i++) { if (e.getX(i) <= 0) continue; sx += e.getX(i); sy += e.getY(i); sz += e.getZ(i); n++; maxZ = Math.max(maxZ, e.getZ(i)); }
  const eyeX = sx / n, eyeY = sy / n, eyeZ = maxZ, p = body.attributes.position; let topY = 0, minZ = 1, earX = 0;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < L.neckY + .04) continue; topY = Math.max(topY, y); minZ = Math.min(minZ, p.getZ(i)); if (Math.abs(y - (eyeY - .02)) < .012) earX = Math.max(earX, Math.abs(p.getX(i))); }
  const headZ = (eyeZ + minZ) / 2; let headR = 0; for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - (eyeY + .03)) < .01) headR = Math.max(headR, Math.hypot(p.getX(i), p.getZ(i) - headZ));
  return {eyeY, eyeX, eyeZ, headZ, headR, topY, earX, earY: eyeY - .045, earZ: headZ - .005};
}

// ---------- rigid skinning helper (one bone, full weight) with the attributes the fabric shader reads ----------
export function rigid(g: T.BufferGeometry, bone: number, keepEdge = false) { const n = g.attributes.position.count; const edge = keepEdge ? g.attributes.aEdge : null;
  g.setAttribute('skinIndex', new T.Uint16BufferAttribute(new Array(n * 4).fill(0).map((_, i) => i % 4 ? 0 : bone), 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(new Array(n * 4).fill(0).map((_, i) => i % 4 ? 0 : 1), 4));
  g.setAttribute('aRest', g.attributes.position.clone()); g.setAttribute('aEdge', edge || new T.Float32BufferAttribute(new Array(n).fill(1), 1)); g.setAttribute('aArm', new T.Float32BufferAttribute(new Array(n).fill(0), 1)); return g; }
function merge(parts: T.BufferGeometry[]) { const P: number[] = [], N: number[] = [], U: number[] = [], I: number[] = []; let off = 0;
  for (let g of parts) { if (!g.index) g = g.toNonIndexed(), g.setIndex(Array.from({length: g.attributes.position.count}, (_, i) => i)); const a = g.attributes.position, nn = g.attributes.normal, uv = g.attributes.uv; for (let i = 0; i < a.count; i++) { P.push(a.getX(i), a.getY(i), a.getZ(i)); N.push(nn.getX(i), nn.getY(i), nn.getZ(i)); U.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0); } const ix = g.index!.array; for (let i = 0; i < ix.length; i++) I.push(ix[i] + off); off += a.count; g.dispose(); }
  const m = new T.BufferGeometry(); m.setAttribute('position', new T.Float32BufferAttribute(P, 3)); m.setAttribute('normal', new T.Float32BufferAttribute(N, 3)); m.setAttribute('uv', new T.Float32BufferAttribute(U, 2)); m.setIndex(I); return m; }
const tube = (pts: T.Vector3[], r: number | ((t: number) => number), seg = 24, rad = 8, closed = false) => { const c = new T.CatmullRomCurve3(pts, closed), g = new T.TubeGeometry(c, seg, typeof r === 'number' ? r : .01, rad, closed);
  if (typeof r !== 'number') { const p = g.attributes.position, fr = c.computeFrenetFrames(seg, closed); for (let i = 0; i <= seg; i++) { const t = i / seg, cp = c.getPointAt(t), k = r(t) / .01; for (let j = 0; j <= rad; j++) { const v = i * (rad + 1) + j, d = new T.Vector3(p.getX(v), p.getY(v), p.getZ(v)).sub(cp).multiplyScalar(k).add(cp); p.setXYZ(v, d.x, d.y, d.z); } } void fr; g.computeVertexNormals(); }
  return g; };

function mergeKeepEdge(parts: T.BufferGeometry[]) { const E: number[] = []; for (const g of parts) { const e = g.attributes.aEdge; const n = g.attributes.position.count; for (let i = 0; i < n; i++) E.push(e ? e.getX(i) : 1); } const m = merge(parts.map(g => { if (!g.index) { const n = g.attributes.position.count; g.setIndex(Array.from({length: n}, (_, i) => i)); } return g; })); m.setAttribute('aEdge', new T.Float32BufferAttribute(E, 1)); return m; }
// ---------- hair ----------
export type ExtraHair = 'afro' | 'taperedAfro' | 'puff' | 'ponytail' | 'locs' | 'longLocs' | 'braids' | 'cornrows';
const hairline = (L: Landmarks, H: HeadMarks, z: number) => T.MathUtils.lerp(H.eyeY + .05, L.neckY + .03, T.MathUtils.smoothstep(H.headZ + .03 - z, 0, .1));
// scalp shell cut from the body: everything above the hairline, pushed out by the hair volume
export function scalpVolume(body: T.BufferGeometry, L: Landmarks, H: HeadMarks, volume: (y: number, z: number) => number, drape = 24) {
  return cutGarment(body, L, {hem: .006, thick: .004, drape, field: (L2, x, y, z) => Math.min(y - hairline(L2, H, z), Math.abs(x) > H.earX - .004 && y < H.eyeY + .03 && z > H.headZ - .03 ? -.01 : 1), loose: (L2, x, y, z) => volume(y, z)}).geometry; }
export function hairGeometry(kind: ExtraHair, body: T.BufferGeometry, L: Landmarks, H: HeadMarks, skel: T.Skeleton): T.BufferGeometry {
  const HEAD = skel.bones.findIndex(b => b.name === 'Head'), c = new T.Vector3(0, H.eyeY + .02, H.headZ);
  const top = (y: number) => T.MathUtils.smoothstep(y, H.eyeY - .02, H.topY);
  if (kind === 'afro') return scalpVolume(body, L, H, (y, z) => .05 + .05 * top(y) + .025 * T.MathUtils.smoothstep(H.headZ - z, -.02, .06), 40);
  if (kind === 'taperedAfro') return scalpVolume(body, L, H, (y) => .006 + .045 * T.MathUtils.smoothstep(y, H.eyeY + .02, H.topY), 24);
  if (kind === 'cornrows') return scalpVolume(body, L, H, () => .003, 2);
  // strands from scalp points: locs and braids hang down, a ponytail gathers at the back, a puff sits on top
  const pts: T.Vector3[] = []; const p = body.attributes.position; for (let i = 0; i < p.count; i += 1) { const y = p.getY(i), z = p.getZ(i), x = p.getX(i); if (y < hairline(L, H, z) + .01 || y < H.eyeY + .0) continue; pts.push(new T.Vector3(x, y, z)); }
  const pick: T.Vector3[] = []; for (const q of pts) if (pick.every(o => o.distanceTo(q) > (kind === 'braids' ? .028 : .032))) pick.push(q);
  const parts: T.BufferGeometry[] = [];
  if (kind === 'ponytail' || kind === 'puff') {
    parts.push(scalpVolume(body, L, H, () => .004, 4));
    if (kind === 'puff') { const s = new T.SphereGeometry(.075, 24, 18); s.scale(1.1, .95, 1); s.translate(0, H.topY + .035, H.headZ - .02); parts.push(s); }
    else { const b = new T.Vector3(0, H.eyeY + .05, H.headZ - H.headR - .005); parts.push(tube([b, b.clone().add(new T.Vector3(0, -.02, -.05)), b.clone().add(new T.Vector3(0, -.12, -.07)), b.clone().add(new T.Vector3(0, -.24, -.05))], t => .028 * (1 - t * .6) + .006, 24, 12));
      const tie = new T.TorusGeometry(.03, .006, 8, 20); tie.rotateX(Math.PI / 2 - .5); tie.translate(b.x, b.y - .006, b.z - .012); parts.push(tie); }
  } else {
    const len = kind === 'longLocs' || kind === 'braids' ? .36 : .17, r = kind === 'braids' ? .0065 : .0095;
    parts.push(scalpVolume(body, L, H, () => .004, 4));
    // every strand hangs at the sides or the back of the head, never over the face: roots on the front half sweep back and out
    pick.forEach((q, k) => { let dx = q.x, dz = q.z - H.headZ; if (dz > -.01) { const side = Math.abs(dx) < .012 ? (k % 2 ? 1 : -1) : Math.sign(dx); dx = side * Math.max(Math.abs(dx), .05); dz = -.35 * Math.hypot(dx, dz) - .01; }
      const out = new T.Vector3(dx, 0, dz).normalize(), root = q.clone().add(q.clone().sub(c).normalize().multiplyScalar(.012)), reach = H.headR + .018;
      const mid = new T.Vector3(c.x + out.x * reach, Math.min(root.y - .02, H.eyeY - .005), c.z + out.z * reach), end = mid.clone().add(new T.Vector3(out.x * .03, -len, out.z * .03 - .01));
      const over = root.clone().lerp(mid, .5).add(new T.Vector3(out.x, .4, out.z).multiplyScalar(.02));
      parts.push(tube([root, over, mid, end], t => r * (1 - t * .25), 10, 6)); });
  }
  return rigid(merge(parts.map(g => { g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight'); g.deleteAttribute('aRest'); g.deleteAttribute('aEdge'); g.deleteAttribute('aArm'); return g; })), HEAD);
}

// ---------- accessories ----------
export type Accessory = 'glasses' | 'hoops' | 'hat' | 'beanie' | 'necklace' | 'watch' | 'bag' | 'scarf';
export function accessoryGeometry(kind: Accessory, L: Landmarks, H: HeadMarks, skel: T.Skeleton, neckR: number, body?: T.BufferGeometry, roomy = 0): T.BufferGeometry {
  const bi = (n: string) => skel.bones.findIndex(b => b.name === n), HEAD = bi('Head'), S3 = bi('spine_03'), parts: T.BufferGeometry[] = [];
  if (kind === 'glasses') { const z = H.eyeZ + .02; for (const s of [-1, 1]) { const rim = new T.TorusGeometry(.021, .0025, 8, 28); rim.scale(1.15, .85, 1); rim.translate(s * H.eyeX, H.eyeY, z); parts.push(rim);
      parts.push(tube([new T.Vector3(s * (H.eyeX + .024), H.eyeY + .005, z), new T.Vector3(s * (H.earX + .004), H.eyeY + .01, H.headZ + .02), new T.Vector3(s * (H.earX + .002), H.eyeY - .01, H.headZ - .02)], .0018, 12, 5)); }
    parts.push(tube([new T.Vector3(-H.eyeX + .022, H.eyeY + .004, z), new T.Vector3(0, H.eyeY + .008, z + .004), new T.Vector3(H.eyeX - .022, H.eyeY + .004, z)], .002, 8, 5)); return rigid(merge(parts), HEAD); }
  if (kind === 'hoops') { for (const s of [-1, 1]) { const t = new T.TorusGeometry(.013, .0016, 8, 28); t.rotateY(Math.PI / 2); t.translate(s * (H.earX + .002), H.earY - .016, H.earZ); parts.push(t); } return rigid(merge(parts), HEAD); }
  // cap and beanie: the crown is the scalp itself, lifted by fabric thickness (plus room for the hairstyle under it)
  if ((kind === 'hat' || kind === 'beanie') && body) { const beanie = kind === 'beanie';
    const line = (z: number) => beanie ? T.MathUtils.lerp(H.eyeY + .032, H.eyeY - .03, T.MathUtils.smoothstep(H.headZ + .02 - z, 0, .1)) : T.MathUtils.lerp(H.eyeY + .052, H.eyeY - .005, T.MathUtils.smoothstep(H.headZ + .02 - z, 0, .1));
    const shell = cutGarment(body, L, {hem: .008, thick: .006, drape: 30, hull: 1,
      field: (L2, x, y, z) => Math.min(y - line(z), !beanie && Math.abs(x) > H.earX - .006 && y < H.eyeY + .035 && z > H.headZ - .04 ? -.01 : 1),
      loose: (L2, x, y) => .008 + roomy + (beanie ? .016 * T.MathUtils.smoothstep(y, H.eyeY + .04, H.topY) : 0)}).geometry;
    for (const a of ['skinIndex', 'skinWeight', 'aRest', 'aArm']) shell.deleteAttribute(a);
    const parts2: T.BufferGeometry[] = [shell];
    if (!beanie) { const r = H.headR + .02 + roomy, brim = new T.CylinderGeometry(r * .82, r * .82, .006, 32, 1, false, -Math.PI * .5, Math.PI); brim.scale(1, 1, 1.25); brim.rotateX(.14); brim.translate(0, H.eyeY + .05, H.eyeZ - .035 + r * .3); brim.setAttribute('aEdge', new T.Float32BufferAttribute(new Array(brim.attributes.position.count).fill(1), 1)); parts2.push(brim);
      const btn = new T.SphereGeometry(.008, 10, 8); btn.translate(0, H.topY + .016 + roomy, H.headZ - .005); btn.setAttribute('aEdge', new T.Float32BufferAttribute(new Array(btn.attributes.position.count).fill(1), 1)); parts2.push(btn); }
    const g = mergeKeepEdge(parts2); return rigid(g, HEAD, true); }
  if (kind === 'necklace') { const ring: T.Vector3[] = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, front = Math.max(0, Math.sin(a)); ring.push(new T.Vector3(Math.cos(a) * (neckR + .012), L.neckY - .04 - front * .05, L.neckZ + Math.sin(a) * (neckR + .02))); }
    parts.push(tube(ring, .0018, 64, 5, true)); const pend = new T.SphereGeometry(.007, 10, 8); pend.translate(0, L.neckY - .095, L.neckZ + neckR + .03); parts.push(pend); return rigid(merge(parts), S3); }
  if (kind === 'watch') { const LA = bi('lowerarm_l'), x = L.wrX - .035, band = new T.CylinderGeometry(.03, .03, .018, 24, 1, true); band.rotateZ(Math.PI / 2); band.translate(x, L.armY, -.005); const face = new T.CylinderGeometry(.014, .014, .006, 20); face.translate(x, L.armY + .031, -.005); parts.push(band, face); return rigid(merge(parts), LA); }
  if (kind === 'scarf') { const ring: T.Vector3[] = []; for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; ring.push(new T.Vector3(Math.cos(a) * (neckR + .03), L.neckY - .045 + Math.sin(a * 2) * .004, L.neckZ + Math.sin(a) * (neckR + .032))); }
    parts.push(tube(ring, .022, 48, 10, true)); parts.push(tube([new T.Vector3(.04, L.neckY - .06, L.neckZ + neckR + .04), new T.Vector3(.05, L.chestY - .02, L.neckZ + neckR + .07), new T.Vector3(.055, L.chestY - .14, L.neckZ + neckR + .07)], .02, 12, 8)); return rigid(merge(parts), S3); }
  // backpack: body on the upper back plus two shoulder straps
  const bz = L.neckZ - neckR - .09, box = new T.BoxGeometry(.26, .32, .11, 4, 4, 2); { const p = box.attributes.position; for (let i = 0; i < p.count; i++) { const v = new T.Vector3(p.getX(i), p.getY(i), p.getZ(i)), k = new T.Vector3(Math.sign(v.x) * .1, Math.sign(v.y) * .13, Math.sign(v.z) * .03); v.sub(k).clampLength(0, .03).add(k); p.setXYZ(i, v.x, v.y, v.z); } box.computeVertexNormals(); }
  box.translate(0, L.chestY - .1, bz - .03); parts.push(box);
  for (const s of [-1, 1]) parts.push(tube([new T.Vector3(s * .07, L.chestY + .04, bz + .03), new T.Vector3(s * .085, L.neckY - .02, L.neckZ - .02), new T.Vector3(s * .095, L.neckY - .05, L.neckZ + neckR + .03), new T.Vector3(s * .1, L.chestY - .12, L.neckZ + neckR + .06), new T.Vector3(s * .11, L.chestY - .2, bz + .04)], .012, 24, 6));
  return rigid(merge(parts), S3);
}
