import * as T from 'three';
import {clone as cloneSkinned} from 'three/addons/utils/SkeletonUtils.js';
import {headMarks, hairGeometry, accessoryGeometry, type ExtraHair, type Accessory} from './extras';
import {landmarks, cutGarment, SOCKS, soleGeometry, SOLE, skirtGeometry, hoodGeometry, TOPS, BOTTOMS, SHOES, JACKETS, type Landmarks, type Top, type Bottom, type Shoes, type Jacket} from './garments';

// AUREVIA v4 modular character: Quaternius Universal Base Characters (CC0) body, swappable hair/beard pieces,
// recolourable skin (any tone, including blue and lavender), hair and eyes, bone-shaped body types, fitted garments
// cut from the body (garments.ts) with procedural fabric detail and school prints, and retargeted motion-capture clips.

export type Who = 'female' | 'male';
export type Hair = 'none' | 'long' | 'buns' | 'parted' | 'buzzed' | 'buzzedF' | ExtraHair;
export type {Accessory};
const EXTRA_HAIR = new Set<string>(['afro', 'taperedAfro', 'puff', 'ponytail', 'locs', 'longLocs', 'braids', 'cornrows']);
export type BodyType = 'slim' | 'athletic' | 'balanced' | 'curvy' | 'fuller' | 'muscular' | 'broader';
export type Print = {front?: HTMLCanvasElement; frontBox?: [number, number, number, number]; back?: HTMLCanvasElement; backBox?: [number, number, number, number]};
export type Look = {who: Who; skin: string; hair: Hair; hairColor: string; beard: boolean; eyes: string; body: BodyType; height: number;
  top: Top; topColor: string; topTrim: string; jacket: Jacket; jacketColor: string; jacketTrim: string; jacketAccent: string;
  bottom: Bottom; bottomColor: string; bottomTrim: string; socks: boolean; sockColor: string; shoes: Shoes; shoeColor: string; shoeTrim: string; shoeAccent: string;
  topPrint?: Print; jacketPrint?: Print; accessories?: Accessory[]; jewelry?: 'gold' | 'silver'; hatColor?: string; bagColor?: string; scarfColor?: string};
export const DEFAULT_LOOK: Look = {who: 'female', skin: '#a8714f', hair: 'long', hairColor: '#2a1a12', beard: false, eyes: '#5a3a22', body: 'balanced', height: 1,
  top: 'tee', topColor: '#f1e9da', topTrim: '#f1e9da', jacket: 'none', jacketColor: '#0f4c5c', jacketTrim: '#efe4cf', jacketAccent: '#c9a24a',
  bottom: 'jeans', bottomColor: '#2f4f74', bottomTrim: '#c98a3a', socks: true, sockColor: '#f6f3ec', shoes: 'sneakers', shoeColor: '#f4f1ea', shoeTrim: '#e9e4d8', shoeAccent: '#0f4c5c'};

const HAIR_PIECE: Record<string, string> = {long: 'Hair_Long', buns: 'Hair_Buns', parted: 'Hair_SimpleParted', buzzed: 'Hair_Buzzed', buzzedF: 'Hair_BuzzedFemale'};
const BODY: Record<BodyType, Record<string, number>> = {
  slim:     {spine_01: .88, spine_02: .9, spine_03: .9, pelvis: .9, thigh: .86, calf: .9, upperarm: .86, lowerarm: .9, neck_01: .94},
  athletic: {spine_01: .96, spine_02: 1.05, spine_03: 1.1, pelvis: .98, thigh: 1.07, calf: 1.07, upperarm: 1.12, lowerarm: 1.08, neck_01: 1.04, clavicle: 1.05},
  balanced: {},
  curvy:    {spine_01: .93, spine_02: 1.0, spine_03: 1.06, pelvis: 1.22, thigh: 1.2, calf: 1.07, upperarm: 1.04, lowerarm: 1.0},
  muscular: {spine_01: 1.0, spine_02: 1.1, spine_03: 1.2, pelvis: 1.02, thigh: 1.16, calf: 1.12, upperarm: 1.28, lowerarm: 1.16, neck_01: 1.15, clavicle: 1.12},
  broader:  {spine_01: 1.1, spine_02: 1.14, spine_03: 1.16, pelvis: 1.1, thigh: 1.12, calf: 1.07, upperarm: 1.15, lowerarm: 1.07, neck_01: 1.1, clavicle: 1.14},
  fuller:   {spine_01: 1.28, spine_02: 1.2, spine_03: 1.1, pelvis: 1.2, thigh: 1.24, calf: 1.12, upperarm: 1.2, lowerarm: 1.1, neck_01: 1.1},
};
function lengthAxis(b: T.Object3D) { const c = b.children.find((x: any) => x.isBone) as T.Object3D | undefined; if (!c) return 1; const p = c.position, a = [Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)]; return a.indexOf(Math.max(...a)); }
function applyBody(root: T.Object3D, type: BodyType) { const f = BODY[type] || {}, k = (n: string) => f[n] ?? f[n.replace(/_[lr]$/, '')] ?? 1;
  const bones: T.Bone[] = []; root.traverse((o: any) => { if (o.isBone) bones.push(o); });
  const own = new Map<T.Bone, T.Vector3>(); for (const b of bones) { const s = k(b.name), v = new T.Vector3(s, s, s); v.setComponent(lengthAxis(b), 1); own.set(b, v); }
  const m = new T.Matrix4(); for (const b of bones) { const v = own.get(b)!.clone(), p = b.parent as T.Bone; if (p && own.has(p)) { const pv = own.get(p)!; m.makeRotationFromQuaternion(b.quaternion); const e = m.elements; for (let j = 0; j < 3; j++) { let best = 0, bi = 0; for (let i = 0; i < 3; i++) { const w = Math.abs(e[j * 4 + i]); if (w > best) { best = w; bi = i; } } v.setComponent(j, v.getComponent(j) / pv.getComponent(bi)); } } b.scale.copy(v); } }

// ---------- recolouring: keep the painted detail (luminance and slight hue variation), replace the base colour ----------
const lin = (hex: string) => new T.Color(hex); // three converts sRGB hex to linear working colour
const meanCache = new WeakMap<object, T.Vector3>();
function textureMean(tex: T.Texture, minSat: number) { const img: any = tex.image; if (meanCache.has(img)) return meanCache.get(img)!; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; g.drawImage(img, 0, 0, 64, 64); const d = g.getImageData(0, 0, 64, 64).data, s = [0, 0, 0]; let n = 0;
  for (let i = 0; i < d.length; i += 4) { const r = (d[i] / 255) ** 2.2, gg = (d[i + 1] / 255) ** 2.2, b = (d[i + 2] / 255) ** 2.2, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); if (d[i + 3] < 128 || mx < .01 || (mx - mn) / mx < minSat) continue; s[0] += r; s[1] += gg; s[2] += b; n++; }
  const v = n ? new T.Vector3(s[0] / n, s[1] / n, s[2] / n) : new T.Vector3(.3, .2, .15); meanCache.set(img, v); return v; }
function tinted(src: T.MeshStandardMaterial, opts: {mean: T.Vector3; color: string; masked?: boolean; under?: string; sheen?: number}) {
  const m = new T.MeshPhysicalMaterial({map: src.map, normalMap: src.normalMap, roughnessMap: src.roughnessMap, roughness: src.roughnessMap ? 1 : .55, metalness: 0, transparent: src.transparent, alphaTest: src.alphaTest, side: src.side, sheen: opts.sheen ?? 0, sheenRoughness: .5, sheenColor: new T.Color('#ffd9c4'), specularIntensity: .4});
  const u = {uTone: {value: lin(opts.color)}, uMean: {value: opts.mean}, uUnder: {value: lin(opts.under || '#1b1a1d')}, uMasked: {value: opts.masked ? 1 : 0}};
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, u); sh.fragmentShader = 'uniform vec3 uTone; uniform vec3 uMean; uniform vec3 uUnder; uniform float uMasked;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
    vec4 texel = texture2D( map, vMapUv ); vec3 c = texel.rgb;
    float lum = dot(c, vec3(.2126,.7152,.0722)), lumM = dot(uMean, vec3(.2126,.7152,.0722));
    vec3 hue = clamp((c / max(uMean, vec3(1e-3))) / max(lum / lumM, 1e-3), vec3(.75), vec3(1.35));
    vec3 tone = uTone * (lum / lumM) * mix(vec3(1.), hue, .55);
    float mx = max(c.r, max(c.g, c.b)), sat = (mx - min(c.r, min(c.g, c.b))) / max(mx, 1e-4);
    float m = uMasked > .5 ? smoothstep(.22, .42, sat) : 1.;
    vec3 under = uUnder * clamp(lum / .25, .4, 1.6);
    diffuseColor *= vec4(mix(uMasked > .5 ? under : c, tone, m), texel.a);`); };
  m.customProgramCacheKey = () => 'tint' + (opts.masked ? 1 : 0); m.userData.tint = u; return m; }

// one GPU texture per print canvas, shared by every avatar wearing that print
const printTextures = new WeakMap<HTMLCanvasElement, T.CanvasTexture>();
// ---------- fabric: one physical material with procedural detail per garment kind ----------
// kinds: 0 knit/jersey, 1 denim, 2 cargo canvas, 3 chino twill, 4 jogger fleece, 5 shoe, 6 boot leather, 7 formal leather, 8 varsity wool
export function fabric(kind: number, L: Landmarks, colors: {main: string; trim: string; accent: string}, print?: Print, rib = .02) {
  const rough = [.92, .86, .9, .84, .95, .6, .55, .32, .9, .8, .9, .75, .45, .55, .85][kind], sheen = [.45, .2, .25, .3, .55, .1, .15, .05, .5, .35, .5, .05, .3, .25, .2][kind];
  const m = new T.MeshPhysicalMaterial({roughness: rough, metalness: 0, sheen, sheenRoughness: .6, sheenColor: new T.Color(colors.main).lerp(new T.Color('#ffffff'), kind >= 13 ? .15 : .5), specularIntensity: kind === 7 ? .8 : .35, side: T.DoubleSide});
  const tex = (c?: HTMLCanvasElement) => { if (!c) return null; let t = printTextures.get(c); if (!t) { t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; printTextures.set(c, t); } return t; };
  const u: any = {uKind: {value: kind}, uMain: {value: lin(colors.main)}, uTrim: {value: lin(colors.trim)}, uAcc: {value: lin(colors.accent)}, uRib: {value: rib},
    uL1: {value: new T.Vector4(L.hipY, L.kneeY, L.chestY, L.legX)}, uL2: {value: new T.Vector4(L.shX, L.waistY, L.neckY, L.ankleY)}, uL3: {value: new T.Vector4(L.armY, L.elX, L.wrX, 0)},
    uFront: {value: tex(print?.front)}, uFrontBox: {value: new T.Vector4(...(print?.frontBox || [0, 0, 0, 0]))}, uBack: {value: tex(print?.back)}, uBackBox: {value: new T.Vector4(...(print?.backBox || [0, 0, 0, 0]))}};
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute vec3 aRest; attribute float aEdge; attribute float aArm; varying vec3 vRest; varying float vEdge; varying float vArm;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRest = aRest; vEdge = aEdge; vArm = aArm;');
    sh.fragmentShader = `uniform float uKind; uniform vec3 uMain, uTrim, uAcc; uniform float uRib; uniform vec4 uL1, uL2, uL3, uFrontBox, uBackBox; uniform sampler2D uFront, uBack; varying vec3 vRest; varying float vEdge; varying float vArm;
      float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      float line(float d, float w){ return 1. - smoothstep(w*.5, w, abs(d)); }
      vec4 printAt(sampler2D t, vec4 box, vec2 p){ vec2 uv = (p - box.xy) / box.zw + .5; if (box.z <= 0. || any(lessThan(uv, vec2(0))) || any(greaterThan(uv, vec2(1)))) return vec4(0); return texture2D(t, uv); }
      vec3 garment(){ vec3 p = vRest; float ax = abs(p.x); vec3 col = uMain; int k = int(uKind + .5);
        float n = vnoise(p.xy * 180.) * .5 + vnoise(p.zy * 180.) * .5;
        bool sleeve = vArm > .5;
        float legSide = sign(p.x) * uL1.w; float aOut = atan(p.z + .02, (p.x - legSide) * sign(p.x)); // 0 = outer side of the leg, ±pi/2 front/back
        if (k == 0 || k == 4 || k == 8) { // knits: soft heather, rib at hems/cuffs/collar
          col *= .94 + .1 * n;
          if (k == 8 && sleeve) { col = uTrim * (.95 + .08 * n); // two body-colour stripes along the top of each sleeve
            float a = atan(p.z + .055, p.y - uL3.x); col = mix(col, uMain, (step(.16, abs(a + .0)) * step(abs(a), .27) + step(.36, abs(a)) * step(abs(a), .47)) * step(.5, vArm) * step(uRib * 1.2, vEdge)); }
          bool placket = k == 8 && p.z > .0 && ax < .09 && !sleeve && p.y > uL2.y - .04;
          if (vEdge < uRib && !placket) { col *= .94 + .06 * sin((p.x + p.z) * 900.); if (k == 8) { float s = vEdge / uRib; col = mix(uMain, uAcc, step(.3, s) * step(s, .42) + step(.58, s) * step(s, .7)); } }
          if (placket) { col = mix(col, uTrim, line(vEdge - .004, .004)); float snap = length(vec2(vEdge - .012, fract((p.y - uL2.y) / .065 + .5) * .065 - .0325)); col = mix(col, uTrim * 1.15, 1. - smoothstep(.0035, .0045, snap)); }
          if (k == 4 && p.y < uL1.x) { col = mix(col, uTrim, line(aOut, .09) * step(p.y, uL1.x - .05)); }
        } else if (k == 1) { // denim: diagonal twill, indigo variation, fades, seams, orange stitching, pockets
          float tw = step(.5, fract((p.y + (p.x + p.z) * .7) * 420.)); col *= .86 + .14 * tw + .12 * (n - .5);
          float fade = smoothstep(.2, .0, abs(p.z - .03)) * smoothstep(uL1.y - .05, uL1.y + .2, p.y) * smoothstep(uL1.x + .02, uL1.x - .12, p.y); col = mix(col, col * 1.45 + .03, fade * .5);
          float seam = p.y < uL1.x ? line(aOut, .025) : 0.; col = mix(col, col * .7, seam * .6); col = mix(col, uTrim, line(aOut - .06, .014) * step(p.y, uL1.x));
          col = mix(col, uTrim, line(p.y - (uL2.y - .075), .0018) + line(p.y - (uL2.y - .095), .0018) * step(uL1.x, p.y));
          if (p.z < -.04 && p.y > uL1.x - .13 && p.y < uL1.x - .01) { float px = ax - .085; col = mix(col, uTrim, (line(px - .045, .002) + line(px + .045, .002)) * step(p.y, uL1.x - .02) + line(p.y - (uL1.x - .125 + abs(px) * .3), .002) * step(abs(px), .045)); }
          if (p.z > .02 && p.y > uL1.x - .1 && p.y < uL2.y - .07) col = mix(col, uTrim, line(p.x - .025 + max(0., (uL1.x - .06) - p.y) * .4, .0018) * step(.0, p.x) * step(p.x, .035));
        } else if (k == 2) { // cargo canvas: two-tone shin panel, thigh pockets with flaps, seams
          col *= .9 + .12 * n;
          float side = aOut;
          if (p.y < uL1.y + .02 && p.y > uL2.w + .06) col = mix(col, uTrim, smoothstep(.35, .3, abs(side)) * .95);
          if (p.y < uL1.x - .12 && p.y > uL1.y + .1 && abs(side) < .55) { float top = uL1.x - .14; col *= .93; col = mix(col, col * .72, line(abs(side) - .55, .05) + line(p.y - (uL1.y + .1), .004) + line(p.y - top, .006)); col = mix(col, col * .8, step(top - .045, p.y)); col = mix(col, uAcc, line(abs(side) - .48, .03) * step(p.y, top - .05)); }
          col = mix(col, col * .75, line(p.y - (uL2.y - .07), .004));
        } else if (k == 3) { col *= .92 + .08 * step(.5, fract((p.y - p.x) * 500.)) + .06 * (n - .5); col = mix(col, col * .8, line(aOut - 1.5708, .03) * step(p.y, uL1.x - .05)); // front crease col = mix(col, col * .85, line(p.y - (uL2.y - .07), .004));
        } else if (k == 9) { // athletic shorts: contrast side panel and hem band
          col *= .95 + .07 * n; float side = aOut; col = mix(col, uTrim, smoothstep(.2, .17, abs(side)) * step(p.y, uL1.x - .02));
          if (vEdge < uRib && p.y < uL1.x - .05) col = uTrim; col = mix(col, uMain, line(vEdge - uRib * .5, uRib * .25) * step(p.y, uL1.x - .05) * .0);
        } else if (k == 10) { col = uMain * (.92 + .1 * step(.5, fract(p.x * 300. + p.z * 300.))); if (vEdge < .05) col = mix(col, uTrim, step(.3, fract(vEdge / .05 * 2.)));
        } else if (k >= 5 && k <= 7) { // footwear upper: toe box, side panel, eyelets/laces, heel counter
          float fx = (p.x - sign(p.x) * uL1.w) * sign(p.x); col *= .95 + .07 * n;
          if (k == 5) { col = mix(col, uAcc, smoothstep(.006, .0, abs(p.y - .035 - .25 * max(0., p.z + .03)) - .008) * step(.01, fx) * step(-.08, p.z) * step(p.z, .11));
            col = mix(col, uAcc, step(p.z, -.095) * step(.035, p.y)); col = mix(col, uTrim, step(p.y, .012));
            float lace = step(.03, p.z) * step(p.z, .1) * step(abs(fx), .022) * step(.045, p.y); col = mix(col, uTrim * .96, lace * line(fract(p.z * 55.) - .5, .32)); }
          if (k == 6) { col = mix(col, col * .78, step(p.y, .02) + line(p.y - .13, .006)); col = mix(col, col * .7, step(.03, p.z) * step(abs(fx), .015) * step(.05, p.y) * line(fract(p.z * 45. + p.y * 20.) - .5, .3)); }
          if (k == 7) { col = mix(col, col * .7, line(p.z - .07, .004) * step(p.y, .06)); }
        } else if (k == 13) { // hair strands: locs, braids, ponytail, cornrows
          col = uMain * (.72 + .45 * vnoise(vec2(p.y * 900., (p.x + p.z) * 140.))); col *= .85 + .15 * step(.5, fract(p.y * 160. + (p.x + p.z) * 60.));
        } else if (k == 14) { // coily volume: afro, tapered afro, puff
          col = uMain * (.78 + .3 * vnoise(p.xy * 160. + p.z * 120.)) * (.9 + .1 * vnoise(p.zy * 60.));
        } else if (k == 11) { // sole: rubber with tread and a contrast midsole line
          col = uMain * (.94 + .06 * n); col = mix(col, uAcc, line(p.y + .012, .003) * step(.25, uRib)); col *= p.y < -.02 ? .8 + .2 * step(.5, fract(p.z * 90.)) : 1.;
        } else if (k == 12) { // compression/leggings: smooth stretch knit, waistband
          col *= .97 + .05 * n; col = mix(col, uTrim, step(p.y, uL2.y - .04) * step(uL2.y - .095, p.y) * step(uL1.y, p.y));
        }
        vec4 f = printAt(uFront, uFrontBox, vec2(p.x, p.y)) * step(.0, p.z - .0); col = mix(col, f.rgb, f.a * step(-.01, p.z));
        vec4 b = printAt(uBack, uBackBox, vec2(-p.x, p.y)); col = mix(col, b.rgb, b.a * step(p.z, -.03));
        return col; }
      ` + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = garment();'); };
  m.customProgramCacheKey = () => 'fabric'; m.userData.uniforms = u; return m; }

// ---------- shared, per-sex garment geometry cache ----------
type Cut = {geometry: T.BufferGeometry; field: Float32Array};
const cutCache = new Map<string, Cut>();
const cutFor = (key: string, make: () => Cut) => { if (!cutCache.has(key)) cutCache.set(key, make()); return cutCache.get(key)!; };

export type Avatar = {root: T.Group; mixer: T.AnimationMixer; play: (m: string) => void; set: (l: Look) => void; tick: (dt: number) => void; dispose: () => void; look: Look; head: T.Object3D; tris: () => number};
export function makeAvatar(gltf: {scene: T.Object3D; animations: T.AnimationClip[]}, look: Look): Avatar {
  const root = cloneSkinned(gltf.scene) as T.Object3D, holder = new T.Group(); holder.add(root);
  const meshes: Record<string, T.SkinnedMesh> = {}; root.traverse((o: any) => { if (o.isMesh) { meshes[o.name] = o; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const body = meshes.body, skel = body.skeleton, L = landmarks(skel), baseGeo = body.geometry, neckR = neckRadius(baseGeo, L), H = headMarks(baseGeo, meshes.eyes.geometry, L), ARMB = new Set(skel.bones.map((b, i) => /upperarm|lowerarm|hand|thumb|index|middle|ring|pinky/.test(b.name) ? i : -1).filter(i => i >= 0));
  const mixer = new T.AnimationMixer(root), actions: Record<string, T.AnimationAction> = {}; for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c);
  let current: T.AnimationAction | undefined; const garments: T.SkinnedMesh[] = [], owned: T.Material[] = [];
  const bodyMat = body.material as T.MeshStandardMaterial, skinMat = tinted(bodyMat, {mean: textureMean(bodyMat.map!, .22), color: look.skin, masked: true, sheen: .25}); body.material = skinMat; owned.push(skinMat);
  const hairMats: T.MeshPhysicalMaterial[] = []; for (const [n, m] of Object.entries(meshes)) if (n.startsWith('piece_') || n === 'brows_base') { const src = m.material as T.MeshStandardMaterial, t = tinted(src, {mean: textureMean(src.map!, .05), color: look.hairColor}); m.material = t; hairMats.push(t); owned.push(t); }
  const eyeSrc = meshes.eyes.material as T.MeshStandardMaterial, eyeMat = tinted(eyeSrc, {mean: textureMean(eyeSrc.map!, .25), color: look.eyes, masked: true, under: '#ffffff'}); meshes.eyes.material = eyeMat; owned.push(eyeMat);
  // eyes: outside the iris keep the painted white (masked mix uses the texel itself there)
  eyeMat.onBeforeCompile = ((orig) => (sh: any, r: any) => { orig(sh, r); sh.fragmentShader = sh.fragmentShader.replace('mix(uMasked > .5 ? under : c, tone, m)', 'mix(c, tone, m)'); })(eyeMat.onBeforeCompile); eyeMat.customProgramCacheKey = () => 'eyes';
  const head = root.getObjectByName('Head')!;
  const a: Avatar = {root: holder, mixer, look, head,
    play: m => { const next = actions[m] || actions.idle; if (!next || next === current) return; if (m === 'wave' || m === 'laugh' || m === 'talk') next.setLoop(T.LoopRepeat, Infinity); next.reset().fadeIn(.3).play(); current?.fadeOut(.3); current = next; },
    tick: dt => mixer.update(dt),
    tris: () => { let t = 0; holder.traverse((o: any) => { if (o.isMesh && o.visible) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return t; },
    set: l => build(l), dispose: () => { clearGarments(); owned.forEach(m => m.dispose()); if (body.geometry !== baseGeo) body.geometry.dispose(); mixer.stopAllAction(); }};
  function clearGarments() { for (const g of garments) { g.parent?.remove(g); (g.material as T.Material).dispose(); } garments.length = 0; }
  function addGarment(cut: Cut | T.BufferGeometry, mat: T.Material, name: string) { const geo = (cut as any).isBufferGeometry ? cut as T.BufferGeometry : (cut as Cut).geometry; const g = new T.SkinnedMesh(geo, mat); g.name = name; g.castShadow = g.receiveShadow = true; g.frustumCulled = false; body.parent!.add(g); g.bind(skel, body.bindMatrix); garments.push(g); return g; }
  function build(l: Look) { a.look = l; clearGarments(); const who = l.who, covers: Float32Array[] = [];
    skinMat.userData.tint.uTone.value = lin(l.skin); hairMats.forEach(m => m.userData.tint.uTone.value = lin(l.hairColor)); eyeMat.userData.tint.uTone.value = lin(l.eyes);
    // longer styles sit on a short cap of the same colour so no scalp shows through partings on either base
    const acc = new Set(l.accessories || []), hatHides = (acc.has('hat') || acc.has('beanie')) && ['afro', 'puff', 'buns', 'parted', 'buzzed', 'buzzedF', 'taperedAfro', 'cornrows'].includes(l.hair), roomy = ['locs', 'longLocs', 'braids', 'ponytail', 'long'].includes(l.hair) ? .012 : 0, extra = EXTRA_HAIR.has(l.hair) && !hatHides;
    const cap = ['long', 'buns', 'parted'].includes(l.hair) || EXTRA_HAIR.has(l.hair) ? (who === 'male' ? 'piece_Hair_Buzzed' : 'piece_Hair_BuzzedFemale') : '';
    for (const [n, m] of Object.entries(meshes)) if (n.startsWith('piece_')) m.visible = (l.hair !== 'none' && !hatHides && n === 'piece_' + HAIR_PIECE[l.hair]) || n === cap || (l.beard && n === 'piece_Hair_Beard');
    if (extra) addGarment(cutFor(who + ':hair:' + l.hair, () => ({geometry: hairGeometry(l.hair as ExtraHair, baseGeo, L, H, skel), field: new Float32Array(0)})), fabric(['afro', 'taperedAfro', 'puff'].includes(l.hair) ? 14 : 13, L, {main: l.hairColor, trim: l.hairColor, accent: l.hairColor}), 'hair');
    const metal = l.jewelry === 'silver' ? '#c6cace' : '#d2a94a';
    for (const k of acc) { const hatty = k === 'hat' || k === 'beanie', geo = cutFor(who + ':acc:' + k + (hatty && roomy ? ':roomy' : ''), () => ({geometry: accessoryGeometry(k, L, H, skel, neckR, baseGeo, hatty ? roomy : 0), field: new Float32Array(0)})); let mat: T.Material;
      if (k === 'hoops' || k === 'necklace') mat = new T.MeshPhysicalMaterial({color: metal, metalness: 1, roughness: .28});
      else if (k === 'glasses') mat = new T.MeshPhysicalMaterial({color: '#1d1a19', metalness: .2, roughness: .35});
      else if (k === 'watch') mat = new T.MeshPhysicalMaterial({color: '#2a2624', metalness: .6, roughness: .4});
      else mat = fabric(k === 'bag' ? 2 : 0, L, {main: (k === 'hat' || k === 'beanie' ? l.hatColor : k === 'bag' ? l.bagColor : l.scarfColor) || '#2b2b2b', trim: '#1c1c1c', accent: '#1c1c1c'}, undefined, k === 'beanie' ? .045 : .012);
      addGarment(geo, mat, 'acc-' + k); }
    if (l.top !== 'none') { const under = l.jacket !== 'none', spec = TOPS[l.top as Exclude<Top, 'none'>], c = cutFor(who + ':top:' + l.top + (under ? ':under' : ''), () => cutGarment(baseGeo, L, under ? {...spec, thick: Math.min(spec.thick, .008), loose: spec.loose ? (L2, x, y, z) => spec.loose!(L2, x, y, z) * .25 : undefined, drape: 4} : spec, ARMB)); covers.push(c.field);
      const kind = l.top === 'hoodie' || l.top === 'sweater' ? 4 : 0; addGarment(c, fabric(kind === 4 ? 4 : 0, L, {main: l.topColor, trim: l.topTrim, accent: l.topTrim}, l.topPrint, l.top === 'polo' ? .012 : .025), 'top');
      if (l.top === 'hoodie' && l.jacket === 'none') addGarment(cutFor(who + ':hood', () => ({geometry: hoodGeometry(L, skel, neckR), field: new Float32Array(0)})), fabric(4, L, {main: l.topColor, trim: l.topTrim, accent: l.topTrim}), 'hood');
      if (l.top === 'polo') addGarment(cutFor(who + ':collar', () => ({geometry: collar(L, skel, .016, neckR + .004), field: new Float32Array(0)})), fabric(0, L, {main: l.topTrim, trim: l.topTrim, accent: l.topTrim}), 'collar'); }
    if (l.jacket !== 'none') { const c = cutFor(who + ':jacket:' + l.jacket, () => cutGarment(baseGeo, L, JACKETS[l.jacket as Exclude<Jacket, 'none'>], ARMB)); addGarment(c, fabric(8, L, {main: l.jacketColor, trim: l.jacketTrim, accent: l.jacketAccent}, l.jacketPrint, .035), 'jacket');
      addGarment(cutFor(who + ':jcollar', () => ({geometry: collar(L, skel, .018, neckR + .028), field: new Float32Array(0)})), fabric(8, L, {main: l.jacketColor, trim: l.jacketTrim, accent: l.jacketAccent}, undefined, 1), 'jacket-collar'); }
    if (l.bottom === 'skirt') { const c = cutFor(who + ':skirt', () => skirtGeometry(baseGeo, L, skel)); covers.push(c.field); addGarment(c, fabric(3, L, {main: l.bottomColor, trim: l.bottomTrim, accent: l.bottomTrim}), 'bottom'); }
    else { const c = cutFor(who + ':bottom:' + l.bottom, () => cutGarment(baseGeo, L, BOTTOMS[l.bottom as Exclude<Bottom, 'skirt'>], ARMB)); covers.push(c.field); const kind = ({jeans: 1, cargo: 2, trousers: 3, joggers: 4, shorts: 9, basketball: 9, cargoShorts: 2, shortShorts: 9, compression: 12, leggings: 12} as Record<string, number>)[l.bottom]; addGarment(c, fabric(kind, L, {main: l.bottomColor, trim: l.bottomTrim, accent: l.bottomTrim}, undefined, .03), 'bottom'); }
    if (l.socks && l.shoes !== 'boots' && ['shorts', 'skirt', 'basketball', 'cargoShorts', 'shortShorts', 'compression'].includes(l.bottom)) { const c = cutFor(who + ':socks', () => cutGarment(baseGeo, L, SOCKS)); covers.push(c.field); addGarment(c, fabric(10, L, {main: l.sockColor, trim: l.sockColor, accent: l.sockColor}), 'socks'); }
    let lift = 0; if (l.shoes !== 'none') { const sole = cutFor(who + ':sole:' + l.shoes, () => soleGeometry(baseGeo, L, skel, l.shoes as keyof typeof SOLE)); lift = SOLE[l.shoes as keyof typeof SOLE].h; addGarment(sole, fabric(11, L, {main: l.shoeTrim, trim: l.shoeTrim, accent: l.shoeAccent}, undefined, l.shoes === 'sneakers' ? 1 : 0), 'sole'); }
    if (l.shoes !== 'none') { const c = cutFor(who + ':shoes:' + l.shoes, () => cutGarment(baseGeo, L, SHOES[l.shoes as Exclude<Shoes, 'none'>])); covers.push(c.field); addGarment(c, fabric({sneakers: 5, boots: 6, formal: 7}[l.shoes], L, {main: l.shoeColor, trim: l.shoeTrim, accent: l.shoeAccent}), 'shoes'); }
    // hide body skin fully covered by clothing (no skin can poke through during motion)
    const key = who + '|' + [l.top + (l.jacket !== 'none' ? '+j' : ''), l.bottom, l.shoes, l.socks && ['shorts', 'skirt', 'basketball', 'cargoShorts', 'shortShorts', 'compression'].includes(l.bottom) ? 's' : ''].join(',');
    const idxGeo = cutFor('bodyidx:' + key, () => { const src = baseGeo.index!.array, keep: number[] = []; for (let t = 0; t < src.length; t += 3) { let hidden = false; for (const f of covers) if (f.length && f[src[t]] > .012 && f[src[t + 1]] > .012 && f[src[t + 2]] > .012) { hidden = true; break; } if (!hidden) keep.push(src[t], src[t + 1], src[t + 2]); }
      const g = new T.BufferGeometry(); for (const [n, at] of Object.entries(baseGeo.attributes)) g.setAttribute(n, at); g.setIndex(keep);
      // under clothing (and just past each hem) the skin sits a few millimetres lower, so edges never show skin through them
      const bp = baseGeo.attributes.position, bn = baseGeo.attributes.normal, P = new Float32Array(bp.array as ArrayLike<number>); for (let i = 0; i < bp.count; i++) { let m = -1; for (const f of covers) if (f.length) m = Math.max(m, f[i]); if (m < -.02) continue; const d = .005 * T.MathUtils.smoothstep(m, -.02, .005); P[i * 3] -= bn.getX(i) * d; P[i * 3 + 1] -= bn.getY(i) * d; P[i * 3 + 2] -= bn.getZ(i) * d; } g.setAttribute('position', new T.BufferAttribute(P, 3)); g.boundingSphere = baseGeo.boundingSphere; return {geometry: g, field: new Float32Array(0)}; });
    body.geometry = idxGeo.geometry;
    // shape, size and stance
    applyBody(root, l.body); root.scale.setScalar(1); root.position.set(0, 0, 0);
    const h = (who === 'female' ? 1.68 : 1.8) * Math.min(1.12, Math.max(.88, l.height || 1)), top = L.headY + .2; root.scale.setScalar(h / top); root.position.y = lift * h / top;
  }
  build(look); a.play('idle'); mixer.update(0); return a; }

// neck radius at the collar line, measured on the body
function neckRadius(g: T.BufferGeometry, L: Landmarks) { const p = g.attributes.position; let r = 0, n = 0; for (let i = 0; i < p.count; i++) { const d = Math.hypot(p.getX(i), p.getZ(i) - L.neckZ); if (Math.abs(p.getY(i) - (L.neckY - .03)) < .012 && d < .11) { r = Math.max(r, d); n++; } } return n ? Math.min(.09, r) : .065; }
// polo collar: a folded band around the neck base, on the upper spine
function collar(L: Landmarks, skel: T.Skeleton, radius = .012, ring = .075) { const S3 = skel.bones.findIndex(b => b.name === 'spine_03'), pts: T.Vector3[] = [];
  for (let i = 0; i <= 24; i++) { const a = Math.PI * .58 + i / 24 * Math.PI * 1.84; /* opening at the front (+z) */ pts.push(new T.Vector3(Math.cos(a) * ring, L.neckY - .025 + (Math.abs(Math.sin(a)) < .2 ? .0 : 0), L.neckZ - .005 + Math.sin(a) * ring * .93)); }
  const g = new T.TubeGeometry(new T.CatmullRomCurve3(pts), 48, radius, 8, false); g.scale(1, 1.6, 1); g.translate(0, (L.neckY - .025) * -.6 + .0, 0);
  const n = g.attributes.position.count; g.setAttribute('skinIndex', new T.Uint16BufferAttribute(new Array(n * 4).fill(0).map((_, i) => i % 4 ? 0 : S3), 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(new Array(n * 4).fill(0).map((_, i) => i % 4 ? 0 : 1), 4));
  g.setAttribute('aRest', g.attributes.position.clone()); const uv = g.attributes.uv; g.setAttribute('aEdge', new T.Float32BufferAttribute(Array.from({length: n}, (_, i) => uv.getY(i) * .03), 1)); return g; }
