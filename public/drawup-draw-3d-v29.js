/* DrawUp Draw — V29 coordinated 3D view (window.DrawUpDraw3D).
 * The 3D model is built from the same Draw model the plan, elevations and sections use: walls
 * (with their openings cut), floors from the rooms, roof planes, columns, stairs, fixtures and
 * library components. Nothing is stored here; change the plan and the 3D rebuilds.
 * Styles (CD, Sketch, Presentation, Realistic) only change materials, edges and light.
 * three.js 0.147.0 (MIT) is vendored in /vendor/three-0.147.0 and loaded the first time 3D opens. */
(function (root) {
  'use strict';
  const IN = 0.0254; // the scene is in metres, so GLB files open at true size
  const BASE = '/vendor/three-0.147.0/';
  let loading = null;
  function loadThree() {
    if (root.THREE && root.THREE.OrbitControls && root.THREE.GLTFExporter) return Promise.resolve(root.THREE);
    if (loading) return loading;
    const add = src => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = BASE + src; s.onload = ok; s.onerror = () => bad(new Error('3D library did not load (' + src + ').')); document.head.appendChild(s); });
    loading = (root.THREE ? Promise.resolve() : add('three.min.js')).then(() => root.THREE.OrbitControls ? 0 : add('OrbitControls.js')).then(() => root.THREE.GLTFExporter ? 0 : add('GLTFExporter.js')).then(() => root.THREE);
    loading.catch(() => { loading = null; });
    return loading;
  }
  const core = () => root.DrawUpDrawCore, geo = () => root.DrawUpWSGeo, lib = () => root.DrawUpDrawLib;

  /* ------------------------------------------------------------ finishes and style palettes */
  const FINISHES = {
    floor: { oak: '#c8a073', walnut: '#7a5536', concrete: '#a7a9a8', 'polished concrete': '#b9bcbb', terrazzo: '#e7e1d6', 'white tile': '#eeeeea', 'black tile': '#2b2b2d', 'grey carpet': '#8b8f95', marble: '#ecebe7', vinyl: '#cdbfa8' },
    wall: { white: '#f3f2ee', 'warm white': '#f2ebdd', 'light grey': '#d9dbdc', sage: '#b7c2ad', navy: '#273a56', terracotta: '#c0745a', black: '#2a2a2a', brick: '#a65a43', wood: '#b58a5e' },
    accent: { brass: '#c2a15a', black: '#1d1d1d', walnut: '#6e4a30', green: '#2f6b4f', red: '#c8102e', white: '#ffffff' },
  };
  const isHex = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));
  function finishColor(group, v, dflt) { if (isHex(v)) return v; const k = String(v || '').toLowerCase().trim(); return FINISHES[group][k] || dflt; }
  const MATS = { fabric: '#7d8b99', wood: '#b48a5f', metal: '#9aa1a8', white: '#f4f4f2', glass: '#bfe3f2', stone: '#d8d3ca', steel: '#c4c9ce', plant: '#4f8a4a', dark: '#3a3d41', person: '#c9b8a4', brand: '#c8102e', accent: '#c2a15a', custom: '#a3b6c9' };
  const STYLES = {
    cd: { bg: '#ffffff', clay: '#f6f6f6', edge: '#111111', edges: true, light: 1, shadows: false, label: 'CD (black and white)' },
    sketch: { bg: '#fbf8f1', clay: '#fffdf8', edge: '#3b3b3b', edges: true, light: 0.95, shadows: false, label: 'Sketch' },
    presentation: { bg: '#eef2f5', edge: '#55606b', edges: true, edgeOpacity: 0.25, light: 1, shadows: true, label: 'Presentation' },
    realistic: { bg: '#dfe7ee', edges: false, light: 1.1, shadows: true, label: 'Realistic' },
  };

  /* ------------------------------------------------------------ geometry helpers (plan inches) */
  const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y }), add = (p, q) => ({ x: p.x + q.x, y: p.y + q.y }), mul = (p, k) => ({ x: p.x * k, y: p.y * k }), dot = (p, q) => p.x * q.x + p.y * q.y;
  /** A plan polygon extruded from z0 to z1 (inches). Plan y runs south, which is +Z in 3D. */
  function prism(T, pts, z0, z1) {
    if (!pts || pts.length < 3 || !(z1 > z0)) return null;
    const s = new T.Shape(pts.map(p => new T.Vector2(p.x, -p.y)));
    const g = new T.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); g.translate(0, z0, 0); return g;
  }
  function ringShape(T, rx, ry, band) {
    const s = new T.Shape(); s.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
    if (band > 0 && band < Math.min(rx, ry)) { const h = new T.Path(); h.absellipse(0, 0, rx - band, ry - band, 0, Math.PI * 2, true, 0); s.holes.push(h); }
    return s;
  }

  /** Wall pieces: the mitred wall outline, cut into strips along the wall so each opening leaves
   *  a sill below and a header above. Returns [{pts, z0, z1, kind}] in plan inches. */
  function wallPieces(m, w) {
    const C = core(), o = C.wallOutline(m, w), d = o.dir, L = C.wallLength(w), H = w.height || 96;
    const tOf = p => dot(sub(p, w.a), d);
    const onEdge = (A, B, t) => { const ta = tOf(A), tb = tOf(B); const k = Math.abs(tb - ta) < 1e-9 ? 0 : (t - ta) / (tb - ta); return add(A, mul(sub(B, A), k)); };
    const ops = (m.openings || []).filter(x => x.wall === w.id).map(x => ({ o: x, t0: x.offset - x.width / 2, t1: x.offset + x.width / 2 })).sort((a, b) => a.t0 - b.t0);
    const strip = (t0, t1, first, last) => [first ? o.outerA : onEdge(o.outerA, o.outerB, t0), last ? o.outerB : onEdge(o.outerA, o.outerB, t1), last ? o.innerB : onEdge(o.innerA, o.innerB, t1), first ? o.innerA : onEdge(o.innerA, o.innerB, t0)];
    const out = []; let t = 0, first = true;
    ops.forEach(({ o: op, t0, t1 }) => {
      if (t0 > t + 0.01) out.push({ pts: strip(t, t0, first, false), z0: 0, z1: H, kind: 'wall' });
      else if (first && t0 <= 0.01) { /* opening at the very start */ }
      const P = strip(Math.max(0, t0), Math.min(L, t1), first && t0 <= 0.01, t1 >= L - 0.01);
      const sill = op.kind === 'window' ? Math.max(0, op.sill || 0) : 0, head = Math.min(H, op.head || (op.kind === 'window' ? 84 : 80));
      if (sill > 0) out.push({ pts: P, z0: 0, z1: sill, kind: 'wall' });
      if (head < H) out.push({ pts: P, z0: head, z1: H, kind: 'wall' });
      out.push({ pts: P, z0: sill, z1: head, kind: op.kind, op });
      t = Math.max(t, t1); first = false;
    });
    if (t < L - 0.01) out.push({ pts: strip(t, L, first, true), z0: 0, z1: H, kind: 'wall' });
    return out;
  }

  /* ------------------------------------------------------------ scene */
  function build(T, m, opts) {
    opts = Object.assign({ style: 'presentation', roof: true, cutaway: false }, opts || {});
    const C = core(), G = geo(), Lb = lib(), ws = (m.ws || {}), st = STYLES[opts.style] || STYLES.presentation, finAll = ws.finishes || {}, fin = Object.assign({}, finAll, finAll.all || {}), brand = ws.brand || {};
    const clay = st.clay;
    const mats = new Map();
    const mat = (key, color, o) => {
      const col = clay && !/glass/.test(key) ? clay : color, id = key + '|' + col + '|' + (o ? JSON.stringify(o) : '');
      if (!mats.has(id)) { const M = new T.MeshStandardMaterial(Object.assign({ color: new T.Color(col), roughness: 0.82, metalness: 0 }, o || {})); M.name = key; mats.set(id, M); }
      return mats.get(id);
    };
    const wallCol = finishColor('wall', fin.wall, '#f1efe9'), floorCol = finishColor('floor', fin.floor, '#d9d4ca'), accent = finishColor('accent', fin.accent, MATS.accent);
    const brandCol = isHex(brand.primary) ? brand.primary : MATS.brand;
    const compMat = k => {
      if (k === 'glass') return mat('glass', MATS.glass, { transparent: true, opacity: clay ? 0.18 : 0.35, roughness: 0.1, metalness: 0.1, depthWrite: false });
      if (k === 'brand') return mat('brand', brandCol);
      if (k === 'accent') return mat('accent', accent, { metalness: 0.3, roughness: 0.4 });
      if (k === 'metal' || k === 'steel') return mat(k, MATS[k], { metalness: 0.45, roughness: 0.45 });
      return mat(k || 'white', MATS[k] || MATS.white);
    };
    const root3 = new T.Group(); root3.name = 'DrawUp model'; root3.scale.setScalar(IN);
    const edgeMat = st.edges ? new T.LineBasicMaterial({ color: st.edge, transparent: (st.edgeOpacity || 1) < 1, opacity: st.edgeOpacity || 1 }) : null;
    const put = (geom, M, sel, parent, name) => {
      if (!geom) return null; const mesh = new T.Mesh(geom, M); mesh.castShadow = st.shadows; mesh.receiveShadow = st.shadows; mesh.userData.sel = sel || null; if (name) mesh.name = name;
      (parent || root3).add(mesh);
      if (edgeMat && !(M.transparent && M.opacity < 0.3)) { const e = new T.LineSegments(new T.EdgesGeometry(geom, 25), edgeMat); e.userData.edge = true; mesh.add(e); }
      return mesh;
    };
    const walls = new T.Group(); walls.name = 'Walls'; root3.add(walls);
    (m.walls || []).forEach(w => {
      let pieces; try { pieces = wallPieces(m, w); } catch (_e) { return; }
      const wm = w.wtype === 'curtain' ? compMat('glass') : w.wtype === 'brick' && !clay ? mat('brick', FINISHES.wall.brick) : mat('wall', w.type === 'exterior' && fin.exterior ? finishColor('wall', fin.exterior, wallCol) : wallCol);
      const cut = opts.cut > 0 ? opts.cut : 0; // dollhouse cut: walls stop at this height so the inside shows
      if (cut) pieces = pieces.filter(p => p.z0 < cut).map(p => Object.assign({}, p, { z1: Math.min(p.z1, cut) }));
      pieces.forEach(p => {
        const sel = { type: p.op ? 'opening' : 'wall', id: p.op ? p.op.id : w.id };
        if (p.kind === 'wall') { put(prism(T, p.pts, p.z0, p.z1), wm, sel, walls, 'Wall ' + w.id); return; }
        if (p.kind === 'window') { // glass pane in the middle of the wall and a thin frame
          const q = p.pts, lerp = (A, B, k) => add(A, mul(sub(B, A), k)), thin = [lerp(q[0], q[3], 0.44), lerp(q[1], q[2], 0.44), lerp(q[1], q[2], 0.56), lerp(q[0], q[3], 0.56)];
          put(prism(T, thin, p.z0, p.z1), compMat('glass'), sel, walls, 'Window');
          put(prism(T, p.pts, p.z0, p.z0 + 1.5), mat('frame', '#e9e9e6'), sel, walls); put(prism(T, p.pts, p.z1 - 1.5, p.z1), mat('frame', '#e9e9e6'), sel, walls);
        } else if (p.kind === 'door') {
          const g = C.openingGeometry(m, p.op), dd = g.dir, n = g.normal, j1 = g.jamb1, sw = p.op.swing === 'right' ? -1 : 1, open = 0.5; // leaf drawn partly open
          const hinge = sw > 0 ? j1 : g.jamb2, along = mul(dd, sw), ang = open * (p.op.opens === 'out' ? 1 : -1);
          const dirLeaf = { x: along.x * Math.cos(ang) - along.y * Math.sin(ang), y: along.x * Math.sin(ang) + along.y * Math.cos(ang) }, wid = p.op.width * (p.op.kind === 'door' && p.op.width > 60 ? 0.5 : 1), nl = { x: -dirLeaf.y, y: dirLeaf.x };
          const leaf = [hinge, add(hinge, mul(dirLeaf, wid)), add(add(hinge, mul(dirLeaf, wid)), mul(nl, 1.75)), add(hinge, mul(nl, 1.75))];
          void n; put(prism(T, leaf, 0, p.z1 - 0.5), mat('door', clay ? clay : '#b9936a'), sel, walls, 'Door');
        }
      });
    });
    // floors: rooms that close, else one slab under the walls
    const floors = new T.Group(); floors.name = 'Floors'; root3.add(floors);
    let outlines = []; try { outlines = G.roomOutlines(m).filter(r => r.poly && r.poly.length >= 3); } catch (_e) { /* */ }
    const env = (() => { try { return G.envelope(m); } catch (_e) { return null; } })();
    if (env) put(prism(T, [{ x: env.x0, y: env.y0 }, { x: env.x1, y: env.y0 }, { x: env.x1, y: env.y1 }, { x: env.x0, y: env.y1 }], -4, -0.6), mat('slab', clay ? '#ededed' : '#c9c6bf'), null, floors, 'Slab');
    outlines.forEach(r => { const rf = (finAll[r.room.id] && finAll[r.room.id].floor) || fin.floor; put(prism(T, r.poly, -0.25, 0), mat('floor', finishColor('floor', rf, floorCol), { roughness: 0.7 }), { type: 'room', id: r.room.id }, floors, 'Floor ' + r.room.name); });
    if (opts.ceilings && !opts.cutaway) outlines.forEach(r => put(prism(T, r.poly, r.room.ceiling || 96, (r.room.ceiling || 96) + 1), mat('ceiling', '#fbfbfb'), { type: 'room', id: r.room.id }, floors, 'Ceiling'));
    // roof
    if (opts.roof && !opts.cutaway) {
      const rg = new T.Group(); rg.name = 'Roof'; root3.add(rg);
      (G.roofPlanes(m) || []).forEach(pl => {
        if (pl.kind === 'parapet') { const r = pl.rect, t = 6, z = pl.z; [[r.x0, r.y0, r.x1, r.y0 + t], [r.x0, r.y1 - t, r.x1, r.y1], [r.x0, r.y0, r.x0 + t, r.y1], [r.x1 - t, r.y0, r.x1, r.y1]].forEach(([a, b, c2, d2]) => put(prism(T, [{ x: a, y: b }, { x: c2, y: b }, { x: c2, y: d2 }, { x: a, y: d2 }], z, z + pl.parapet), mat('wall', wallCol), null, rg, 'Parapet')); return; }
        const P = pl.pts.map(p => new T.Vector3(p.x, p.z + 0.75, p.y)); // just above the wall tops, so they never flicker if (P.length < 3) return;
        const g = new T.BufferGeometry(), pos = [];
        for (let i = 1; i < P.length - 1; i++) [P[0], P[i], P[i + 1]].forEach(v => pos.push(v.x, v.y, v.z));
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
        put(g, mat(pl.kind === 'gable' ? 'wall' : 'roof', pl.kind === 'gable' ? wallCol : '#59606a', { side: T.DoubleSide }), null, rg, pl.kind === 'gable' ? 'Gable' : 'Roof plane');
      });
    }
    // items
    const items = new T.Group(); items.name = 'Furniture and components'; root3.add(items);
    (m.items || []).forEach(it => {
      const sel = { type: 'item', id: it.id };
      if (it.kind === 'component') {
        const g = new T.Group(); g.name = it.label || (Lb.get(it.comp) || {}).name || 'Component'; g.position.set(it.at.x, it.z || 0, it.at.y); g.rotation.y = -(it.rot || 0) * Math.PI / 180; items.add(g);
        let parts = []; try { parts = Lb.parts(it); } catch (_e) { parts = []; }
        parts.forEach(p => {
          const M = compMat(it.mat && p.mat !== 'glass' ? it.mat : p.mat); let geom = null;
          if (p.shape === 'box') { geom = new T.BoxGeometry(Math.max(0.1, p.w), Math.max(0.1, p.h), Math.max(0.1, p.d)); geom.translate(p.x || 0, (p.z || 0) + p.h / 2, p.y || 0); }
          else if (p.shape === 'cyl') { geom = new T.CylinderGeometry(p.r2 != null ? p.r2 : p.r, p.r, Math.max(0.1, p.h), 20); geom.translate(p.x || 0, (p.z || 0) + p.h / 2, p.y || 0); }
          else if (p.shape === 'extrude') geom = prism(T, p.pts, p.z || 0, (p.z || 0) + p.h);
          else if (p.shape === 'ring') { geom = new T.ExtrudeGeometry(ringShape(T, p.rx, p.ry, p.band), { depth: p.h, bevelEnabled: false, curveSegments: 40 }); geom.rotateX(-Math.PI / 2); geom.translate(0, p.z || 0, 0); }
          put(geom, M, sel, g);
        });
        return;
      }
      let pts = null, z1 = 0, M = mat('white', MATS.white);
      if (it.kind === 'column') { pts = C.itemOutline(it); z1 = 120; const top = (m.walls || []).reduce((h, w) => Math.max(h, w.height || 0), 0); if (top) z1 = top; M = mat('column', clay ? clay : '#cfcac1'); }
      else if (it.kind === 'fixture') { pts = C.itemOutline(it); z1 = it.fixture === 'shower' ? 3 : it.fixture === 'tub' ? 20 : it.fixture === 'wc' ? 16 : 34; }
      else if (it.kind === 'stair') {
        const n = Math.max(3, Math.round((it.rise || 120) / 7)), run = it.length / n, a = (it.rot || 0) * Math.PI / 180, d = { x: Math.cos(a), y: Math.sin(a) }, nn = { x: -d.y, y: d.x };
        for (let i = 0; i < n; i++) { const p0 = add(it.at, mul(d, i * run)), p1 = add(it.at, mul(d, (i + 1) * run)), hw = it.width / 2; put(prism(T, [add(p0, mul(nn, -hw)), add(p1, mul(nn, -hw)), add(p1, mul(nn, hw)), add(p0, mul(nn, hw))], 0, (i + 1) * (it.rise || 120) / n), mat('stair', clay ? clay : '#cbb393'), sel, items, 'Stair'); }
        return;
      }
      if (pts && z1 > 0) put(prism(T, pts, 0, z1), M, sel, items, it.kind);
    });
    // centre the model on the origin, floor at y = 0
    const box = new T.Box3().setFromObject(root3); const c = box.getCenter(new T.Vector3());
    root3.position.set(-c.x, 0, -c.z);
    return { group: root3, box, style: st };
  }

  /* ------------------------------------------------------------ viewer */
  /** mount(el, model, {style, onPick(sel)}) → viewer. Viewer: update(model, opts), setStyle, view('iso'|'top'|'front'|'side'), png(), glb(), dispose(). */
  async function mount(el, model, opts) {
    const T = await loadThree(); opts = Object.assign({ style: 'presentation', roof: true }, opts || {});
    const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    if ('outputEncoding' in renderer) renderer.outputEncoding = T.sRGBEncoding;
    el.appendChild(renderer.domElement); renderer.domElement.className = 'dw29-3dcanvas'; renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute('aria-label', '3D model. Drag to orbit, scroll to zoom, right-drag to pan.');
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(40, 1, 0.05, 2000);
    const controls = new T.OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.12; controls.maxPolarAngle = Math.PI * 0.495;
    const hemi = new T.HemisphereLight(0xffffff, 0xb8b2a6, 0.75), sun = new T.DirectionalLight(0xffffff, 0.8);
    sun.position.set(-12, 20, 14); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(hemi, sun, sun.target);
    const ground = new T.Mesh(new T.PlaneGeometry(400, 400), new T.ShadowMaterial({ opacity: 0.18 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.11; ground.receiveShadow = true; scene.add(ground);
    let cur = null, state = Object.assign({}, opts), raf = 0, dirty = true;
    const V = { el, state, three: T };
    function fit(kind) {
      if (!cur) return; const b = new T.Box3().setFromObject(cur.group), s = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3()), R = Math.max(s.x, s.y, s.z) * 0.62 + 0.5;
      const d = R / Math.sin(camera.fov * Math.PI / 360) * 0.9; const dir = { iso: [-0.75, 0.62, 0.95], top: [0, 1, 0.0001], front: [0, 0.18, 1], side: [1, 0.18, 0], back: [0, 0.18, -1] }[kind || 'iso'];
      const v = new T.Vector3(...dir).normalize().multiplyScalar(d); camera.position.copy(c).add(v); controls.target.copy(c); camera.near = d / 100; camera.far = d * 20; camera.updateProjectionMatrix(); controls.update(); dirty = true;
      const S = Math.max(s.x, s.z); Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 0.5, far: 80 }); sun.shadow.camera.updateProjectionMatrix(); sun.position.set(c.x - S * 0.6, S * 1.2 + 6, c.z + S * 0.7); sun.target.position.copy(c);
    }
    function dispose3(g) { g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    V.update = (m, o) => {
      Object.assign(state, o || {}); const first = !cur;
      if (cur) { scene.remove(cur.group); dispose3(cur.group); }
      cur = build(T, m, state); scene.add(cur.group); scene.background = new T.Color(cur.style.bg);
      hemi.intensity = 0.75 * cur.style.light; sun.intensity = 0.8 * cur.style.light; sun.castShadow = !!cur.style.shadows; ground.visible = !!cur.style.shadows;
      if (first) fit('iso'); dirty = true; return V;
    };
    V.view = k => fit(k);
    function size() { const w = el.clientWidth || 640, h = el.clientHeight || 420; renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
    const ro = root.ResizeObserver ? new ResizeObserver(size) : null; ro && ro.observe(el); size();
    controls.addEventListener('change', () => { dirty = true; });
    const loop = () => { raf = requestAnimationFrame(loop); if (controls.update() || dirty) { renderer.render(scene, camera); dirty = false; } };
    loop();
    // pick: a click (not a drag) selects the wall, opening, room or item under the pointer
    const ray = new T.Raycaster(); let down = null;
    renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    renderer.domElement.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || !cur) return; down = null;
      const r = renderer.domElement.getBoundingClientRect(); ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
      const hit = ray.intersectObject(cur.group, true).find(h => !h.object.userData.edge && (h.object.userData.sel || h.object.parent?.userData?.sel));
      const sel = hit ? (hit.object.userData.sel || hit.object.parent.userData.sel) : null; V.highlight(sel); opts.onPick && opts.onPick(sel);
    });
    let hi = [];
    V.highlight = sel => {
      hi.forEach(([o, e]) => { o.material = o.userData._m; void e; }); hi = [];
      if (!sel || !cur) { dirty = true; return; }
      cur.group.traverse(o => { if (o.isMesh && o.userData.sel && o.userData.sel.type === sel.type && o.userData.sel.id === sel.id) { o.userData._m = o.material; const M = o.material.clone(); M.emissive = new T.Color('#1b8cff'); M.emissiveIntensity = 0.35; o.material = M; hi.push([o]); } });
      dirty = true;
    };
    V.png = (w, h) => { const ow = el.clientWidth, oh = el.clientHeight; if (w && h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); } renderer.render(scene, camera); const url = renderer.domElement.toDataURL('image/png'); if (w && h) { renderer.setSize(ow, oh, false); camera.aspect = ow / oh; camera.updateProjectionMatrix(); dirty = true; } return url; };
    V.glb = () => new Promise((ok, bad) => { const ex = new T.GLTFExporter(); const g = cur.group.clone(true); g.traverse(o => { if (o.userData && o.userData.edge) o.visible = false; }); const onDone = r => ok(new Blob([r], { type: 'model/gltf-binary' })); try { ex.parse(g, onDone, bad, { binary: true, onlyVisible: true }); } catch (e) { bad(e); } });
    V.stats = () => { const s = { meshes: 0, walls: 0, openings: 0, items: 0, roof: 0 }; if (cur) cur.group.traverse(o => { if (!o.isMesh) return; s.meshes++; const t = o.userData.sel && o.userData.sel.type; if (t === 'wall') s.walls++; else if (t === 'opening') s.openings++; else if (t === 'item') s.items++; if (/Roof|Gable|Parapet/.test(o.name)) s.roof++; }); return s; };
    V.dispose = () => { cancelAnimationFrame(raf); ro && ro.disconnect(); controls.dispose(); if (cur) dispose3(cur.group); renderer.dispose(); renderer.domElement.remove(); };
    V.update(model);
    return V;
  }

  root.DrawUpDraw3D = { loadThree, build, mount, wallPieces, STYLES, FINISHES, finishColor, MATS };
})(typeof window !== 'undefined' ? window : globalThis);
