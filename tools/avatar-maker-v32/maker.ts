// DrawUp v32 avatar maker: the AUREVIA character kit v4 (kit/, copied unchanged) in a small live viewer, plus a
// face-shot camera. Built to public/drawup-avatar-v32/maker.js by tools/avatar-maker-v32/build.sh and loaded only when a
// member opens the avatar maker. Models: public/drawup-avatar-v32/aurevia-v4-{female,male}.glb (see THIRD_PARTY_NOTICE.txt).
//   window.DrawUpAvatarMaker = { mount(el, look) -> Promise<View>, faceShot(look) -> Promise<dataURL>, DEFAULT_LOOK }
//   View = { set(look), view('body'|'face'), turn(rad), faceShot() -> Promise<dataURL>, dispose() }
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {makeAvatar, DEFAULT_LOOK, type Look, type Who, type Avatar} from './kit/avatar-v4';

const BASE = '/drawup-avatar-v32/';
const cache: Partial<Record<Who, Promise<any>>> = {};
function load(who: Who) {
  return cache[who] ||= new GLTFLoader().loadAsync(`${BASE}aurevia-v4-${who}.glb`).catch(e => { delete cache[who]; throw e; });
}
const clean = (l: Partial<Look>): Look => ({...DEFAULT_LOOK, ...l} as Look);

function lights(scene: T.Scene, r: T.WebGLRenderer) {
  const hemi = new T.HemisphereLight('#fff8ef', '#8f7d63', .55), key = new T.DirectionalLight('#fff0dc', 2.4), rim = new T.DirectionalLight('#bfe0ff', 1.8), fill = new T.DirectionalLight('#ffe2cc', .6);
  key.position.set(1.6, 2.6, 3); rim.position.set(-2.5, 2.4, -2.5); fill.position.set(-2.2, 1.4, 2.4); scene.add(hemi, key, rim, fill);
  const pm = new T.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; (scene as any).environmentIntensity = .45;
}
function renderer(canvas?: HTMLCanvasElement) {
  const r = new T.WebGLRenderer({canvas, antialias: true, alpha: true, preserveDrawingBuffer: true});
  r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = .95; r.setClearColor(0x000000, 0);
  return r;
}
function frameFace(cam: T.PerspectiveCamera, a: Avatar, dist = 1.05) {
  const h = a.head.getWorldPosition(new T.Vector3()); const tgt = new T.Vector3(h.x, h.y + .03, h.z);
  cam.position.set(tgt.x + .12, tgt.y + .04, tgt.z + dist); cam.lookAt(tgt);
}
function frameBody(cam: T.PerspectiveCamera, a: Avatar) {
  const box = new T.Box3().setFromObject(a.root); const c = box.getCenter(new T.Vector3()), hgt = box.max.y - box.min.y;
  const dist = (hgt * .62) / Math.tan(T.MathUtils.degToRad(cam.fov / 2));
  cam.position.set(c.x, c.y + hgt * .04, c.z + dist); cam.lookAt(c);
}
// the face shot: a 256px square on the DrawUp cream-to-sky background, as a webp data URL (about 10 to 20 KB)
function toFace(src: HTMLCanvasElement) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, S); grd.addColorStop(0, '#FFF5EF'); grd.addColorStop(1, '#DCEBFF');
  g.fillStyle = grd; g.fillRect(0, 0, S, S); g.drawImage(src, 0, 0, S, S);
  const webp = c.toDataURL('image/webp', .85); return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', .85);
}
let shotR: T.WebGLRenderer | null = null, shotScene: T.Scene | null = null;
async function faceShot(look: Partial<Look>) {
  const l = clean(look), g = await load(l.who);
  if (!shotR) { const cv = document.createElement('canvas'); cv.width = cv.height = 512; shotR = renderer(cv); shotR.setSize(512, 512, false); shotScene = new T.Scene(); lights(shotScene, shotR); }
  const cam = new T.PerspectiveCamera(22, 1, .05, 50), a = makeAvatar(g, l); shotScene!.add(a.root); a.play('idle'); a.tick(.8);
  a.root.rotation.y = .12; a.root.updateMatrixWorld(true); frameFace(cam, a);
  shotR.render(shotScene!, cam); const url = toFace(shotR.domElement); shotScene!.remove(a.root); a.dispose(); return url;
}

async function mount(el: HTMLElement, look: Partial<Look>) {
  const r = renderer(); el.appendChild(r.domElement); r.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;cursor:grab';
  const scene = new T.Scene(); lights(scene, r); const cam = new T.PerspectiveCamera(22, 1, .05, 50);
  let a: Avatar | null = null, cur = clean(look), mode: 'body' | 'face' = 'body', yaw = .2, zoom = 1, raf = 0, alive = true, token = 0;
  const clock = new T.Clock();
  const fit = () => { const w = el.clientWidth || 300, h = el.clientHeight || 300; r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  const place = () => { if (!a) return; a.root.rotation.y = yaw; a.root.updateMatrixWorld(true); mode === 'face' ? frameFace(cam, a, 1.25 / Math.min(1, cam.aspect)) : frameBody(cam, a);
    const tgt = new T.Vector3(); cam.getWorldDirection(tgt); cam.position.addScaledVector(tgt, (1 - zoom) * cam.position.length() * .5); };
  async function set(l: Partial<Look>) {
    const my = ++token; cur = clean(l); const g = await load(cur.who); if (!alive || my !== token) return;
    if (a && a.look.who === cur.who) { a.set(cur); } else { if (a) { scene.remove(a.root); a.dispose(); } a = makeAvatar(g, cur); scene.add(a.root); a.play('idle'); }
    place();
  }
  const ro = new ResizeObserver(() => { fit(); place(); }); ro.observe(el); fit();
  let drag: {x: number; yaw: number} | null = null;
  r.domElement.addEventListener('pointerdown', e => { drag = {x: e.clientX, yaw}; r.domElement.setPointerCapture(e.pointerId); r.domElement.style.cursor = 'grabbing'; });
  r.domElement.addEventListener('pointermove', e => { if (!drag) return; yaw = drag.yaw + (e.clientX - drag.x) * .01; place(); });
  r.domElement.addEventListener('pointerup', () => { drag = null; r.domElement.style.cursor = 'grab'; });
  r.domElement.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(.6, Math.min(1.6, zoom - e.deltaY * .001)); place(); }, {passive: false});
  const loop = () => { if (!alive) return; raf = requestAnimationFrame(loop); const dt = Math.min(.05, clock.getDelta()); if (a) { a.tick(dt); if (mode === 'face') place(); } r.render(scene, cam); };
  await set(cur); loop();
  return {
    set,
    view(m: 'body' | 'face') { mode = m; zoom = 1; place(); },
    turn(d: number) { yaw += d; place(); },
    faceShot: () => faceShot(cur),
    dispose() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); if (a) { scene.remove(a.root); a.dispose(); } r.dispose(); r.domElement.remove(); },
  };
}

(window as any).DrawUpAvatarMaker = {mount, faceShot, DEFAULT_LOOK, load};
