"use strict";
var DrawUpVDIGeo = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/lib/drawup-vdi-geometry.ts
  var drawup_vdi_geometry_exports = {};
  __export(drawup_vdi_geometry_exports, {
    area: () => area,
    bounds: () => bounds,
    distTo: () => distTo,
    formatInches: () => formatInches,
    hatchLines: () => hatchLines,
    inside: () => inside,
    layerOf: () => layerOf,
    outlineOf: () => outlineOf,
    overlapArea: () => overlapArea,
    parseDimLabel: () => parseDimLabel,
    regionsOf: () => regionsOf,
    toDXF: () => toDXF,
    validate: () => validate
  });
  var THIN_FILLS = /* @__PURE__ */ new Set(["seal", "none", "white"]);
  var MEMBRANE_DASH = /* @__PURE__ */ new Set(["wrb", "vr"]);
  var BULK = /* @__PURE__ */ new Set(["conc", "earth", "grav", "sand", "rigid", "gyp", "brick", "cmu", "ply", "wood", "mw", "tile", "act", "stone", "steel", "alum", "glass"]);
  function parseDimLabel(label2) {
    const s = String(label2 || "").toUpperCase().replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/(\d)\s*-\s*(\d+\/\d+)/g, "$1 $2");
    if (/VARIES|VAR\.|V\.I\.F|VIF|EQ\b|EQUAL|SEE\b/.test(s)) return null;
    const kind = /\bMIN\b|MIN\.|MINIMUM|≥/.test(s) ? "min" : /\bMAX\b|MAX\.|MAXIMUM|≤/.test(s) ? "max" : /±|APPROX|\+\/-|~/.test(s) ? "approx" : "exact";
    const frac = (t) => {
      const m2 = t.trim().match(/^(\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+))?$/);
      if (!m2 || !m2[1] && !m2[2]) return NaN;
      return (m2[1] ? parseFloat(m2[1]) : 0) + (m2[2] ? parseInt(m2[2], 10) / parseInt(m2[3], 10) : 0);
    };
    let m = s.match(/(\d+(?:\.\d+)?)\s*'\s*(?:-\s*)?(?:(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*")?/);
    if (m) {
      const ft = parseFloat(m[1]), inch = m[2] ? frac(m[2]) : 0;
      if (Number.isFinite(ft) && Number.isFinite(inch)) return { inches: ft * 12 + inch, kind };
    }
    m = s.match(/(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(?:"|IN\b|IN\.)/);
    if (m) {
      const v = frac(m[1]);
      if (Number.isFinite(v)) return { inches: v, kind };
    }
    m = s.match(/(\d+(?:\.\d+)?)\s*MM\b/);
    if (m) return { inches: parseFloat(m[1]) / 25.4, kind };
    return null;
  }
  function formatInches(v) {
    const neg = v < 0;
    v = Math.abs(v);
    let ft = Math.floor(v / 12), inch = v - ft * 12, eighths = Math.round(inch * 8);
    if (eighths === 96) {
      ft += 1;
      eighths = 0;
    }
    const whole = Math.floor(eighths / 8), rem = eighths % 8, g = rem ? gcd(rem, 8) : 1;
    const inStr = `${whole || (!rem ? 0 : "")}${rem ? (whole ? " " : "") + rem / g + "/" + 8 / g : ""}"`;
    return (neg ? "-" : "") + (ft ? `${ft}'-${inStr}` : inStr);
  }
  function gcd(a, b) {
    return b ? gcd(b, a % b) : a;
  }
  function outlineOf(e) {
    const p = e.pts || [];
    if (["rect", "blk", "blk1", "batt"].includes(e.kind) && p.length >= 2) {
      const x0 = Math.min(p[0][0], p[1][0]), x1 = Math.max(p[0][0], p[1][0]), y0 = Math.min(p[0][1], p[1][1]), y1 = Math.max(p[0][1], p[1][1]);
      return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    }
    if (e.kind === "poly" && p.length >= 3) return p.map((q) => [q[0], q[1]]);
    if (e.kind === "circle" && p.length >= 2) {
      const [c, r] = p, R = Math.abs(r[0]), out = [];
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * Math.PI * 2;
        out.push([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)]);
      }
      return out;
    }
    return null;
  }
  function area(P) {
    let a = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }
  function inside(pt, P) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const a = P[i], b = P[j];
      if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function distTo(pt, e) {
    const o = outlineOf(e);
    if (o) {
      if (inside(pt, o)) return 0;
      let d2 = Infinity;
      for (let i = 0; i < o.length; i++) d2 = Math.min(d2, segDist(pt, o[i], o[(i + 1) % o.length]));
      return d2;
    }
    const p = e.pts || [];
    let d = Infinity;
    for (let i = 0; i + 1 < p.length; i++) d = Math.min(d, segDist(pt, p[i], p[i + 1]));
    return d;
  }
  function bounds(g) {
    const xs = [], ys = [];
    for (const e of g.elements || []) {
      const o = outlineOf(e) || e.pts || [];
      o.forEach((p) => {
        xs.push(p[0]);
        ys.push(p[1]);
      });
    }
    for (const d of g.dims || []) {
      xs.push(d.x1, d.x2);
      ys.push(d.y1, d.y2);
      const off = d.offset || 0;
      if (Math.abs(d.y2 - d.y1) <= Math.abs(d.x2 - d.x1)) ys.push(d.y1 + off);
      else xs.push(d.x1 + off);
    }
    if (!xs.length) return { x0: 0, y0: 0, x1: 12, y1: 12 };
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  var isConvex = (P) => {
    let s = 0;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], c = P[(i + 2) % P.length], z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(z) < 1e-9) continue;
      if (!s) s = Math.sign(z);
      else if (Math.sign(z) !== s) return false;
    }
    return true;
  };
  function clip(subject, clipP) {
    let out = subject;
    const ccw = area(clipP) > 0;
    for (let i = 0; i < clipP.length && out.length; i++) {
      const a = clipP[i], b = clipP[(i + 1) % clipP.length], inp = out;
      out = [];
      const side = (p) => {
        const z = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
        return ccw ? z >= -1e-9 : z <= 1e-9;
      };
      const cross = (p, q) => {
        const A1 = q[1] - p[1], B1 = p[0] - q[0], C1 = A1 * p[0] + B1 * p[1], A2 = b[1] - a[1], B2 = a[0] - b[0], C2 = A2 * a[0] + B2 * a[1], det = A1 * B2 - A2 * B1;
        return Math.abs(det) < 1e-12 ? p : [(B2 * C1 - B1 * C2) / det, (A1 * C2 - A2 * C1) / det];
      };
      for (let j = 0; j < inp.length; j++) {
        const p = inp[j], q = inp[(j + 1) % inp.length];
        if (side(q)) {
          if (!side(p)) out.push(cross(p, q));
          out.push(q);
        } else if (side(p)) out.push(cross(p, q));
      }
    }
    return out;
  }
  function overlapArea(A, B) {
    if (isConvex(B)) return Math.abs(area(clip(A, B)));
    if (isConvex(A)) return Math.abs(area(clip(B, A)));
    return 0;
  }
  function validate(g, comps = []) {
    const issues = [], els = g.elements || [];
    const stats = { elements: els.length, notes: (g.notes || []).length, dims: (g.dims || []).length, dims_checked: 0, dims_mismatched: 0, overlaps: 0, components: comps.length };
    els.forEach((e, i) => {
      const o = outlineOf(e);
      if (o && Math.abs(area(o)) < 1e-4) issues.push({ level: "warning", code: "degenerate", text: `Element ${i + 1} (${e.fill || e.kind}) has no area.`, at: o[0], comp: e.comp });
      const p = e.pts || [];
      if (!o && p.length >= 2 && p.every((q) => Math.hypot(q[0] - p[0][0], q[1] - p[0][1]) < 1e-3)) issues.push({ level: "warning", code: "degenerate", text: `Line ${i + 1} has zero length.`, at: p[0], comp: e.comp });
    });
    for (const d of g.dims || []) {
      const hz = Math.abs(d.y2 - d.y1) <= Math.abs(d.x2 - d.x1), drawn = hz ? Math.abs(d.x2 - d.x1) : Math.abs(d.y2 - d.y1), lab = parseDimLabel(d.label);
      if (!lab) {
        issues.push({ level: "info", code: "dim_unparsed", text: `Dimension "${d.label}" has no measurable value (VARIES, EQ, SEE\u2026), so it was not checked.`, at: [d.x1, d.y1] });
        continue;
      }
      stats.dims_checked++;
      const tol = Math.max(0.25, lab.inches * 0.03);
      const bad = lab.kind === "min" ? drawn < lab.inches - tol : lab.kind === "max" ? drawn > lab.inches + tol : lab.kind === "approx" ? Math.abs(drawn - lab.inches) > Math.max(tol, lab.inches * 0.1) : Math.abs(drawn - lab.inches) > tol;
      if (bad) {
        stats.dims_mismatched++;
        issues.push({ level: "error", code: "dim_mismatch", text: `Dimension "${d.label}" is drawn ${formatInches(drawn)} long. Fix the geometry or the label.`, at: [(d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2] });
      }
      if (drawn < 1e-3) issues.push({ level: "warning", code: "dim_zero", text: `Dimension "${d.label}" has no length.`, at: [d.x1, d.y1] });
    }
    for (const n of g.notes || []) {
      const near = els.reduce((m, e) => Math.min(m, distTo([n.x, n.y], e)), Infinity);
      if (near > 1.5) issues.push({ level: "warning", code: "leader_empty", text: `Note "${n.text.slice(0, 50)}" points at empty space (${formatInches(near)} from the nearest material).`, at: [n.x, n.y] });
    }
    const solids = els.map((e, i) => ({ e, i, o: outlineOf(e) })).filter((s) => s.o && BULK.has(s.e.fill) && !MEMBRANE_DASH.has(s.e.dash));
    for (let a = 0; a < solids.length; a++) for (let b2 = a + 1; b2 < solids.length; b2++) {
      const A = solids[a], B = solids[b2];
      if (A.e.fill === B.e.fill || A.e.comp && A.e.comp === B.e.comp) continue;
      const ov = overlapArea(A.o, B.o), small = Math.min(Math.abs(area(A.o)), Math.abs(area(B.o)));
      if (ov > 0.5 && ov > small * 0.08) {
        stats.overlaps++;
        const c = A.o.reduce((s, p) => [s[0] + p[0] / A.o.length, s[1] + p[1] / A.o.length], [0, 0]);
        issues.push({ level: "warning", code: "overlap", text: `${label(A.e)} and ${label(B.e)} overlap by ${ov.toFixed(1)} sq in. Two materials can't occupy the same space: check the layer order.`, at: c, comp: A.e.comp || B.e.comp });
      }
    }
    for (const c of comps) {
      const mine = els.filter((e) => e.comp === c.id);
      if (!mine.length) {
        issues.push({ level: "warning", code: "comp_missing", text: `${c.name} is listed in the assembly but not drawn.`, comp: c.id });
        continue;
      }
      const thin = mine.every((e) => !outlineOf(e) || THIN_FILLS.has(e.fill) || MEMBRANE_DASH.has(e.dash));
      if ((c.continuous || thin) && mine.length > 1) {
        const groups = clusters(mine);
        if (groups > 1) issues.push({ level: "warning", code: "discontinuous", text: `${c.name} is drawn in ${groups} separate pieces. If it must be continuous (air, water or vapor control, flashing), show the laps or the transition.`, comp: c.id });
      }
      if (c.inferred) issues.push({ level: "info", code: "inferred", text: `${c.name} is inferred, not read from your drawing. Confirm it.`, comp: c.id });
    }
    const b = bounds(g);
    if (b.x1 - b.x0 > 240 || b.y1 - b.y0 > 240) issues.push({ level: "warning", code: "extent", text: `The detail spans ${formatInches(b.x1 - b.x0)} \xD7 ${formatInches(b.y1 - b.y0)}. That is large for one detail: check for a stray point.` });
    if (!(g.dims || []).length) issues.push({ level: "warning", code: "no_dims", text: "The detail has no dimensions." });
    return { ok: !issues.some((i) => i.level === "error"), issues, stats };
  }
  var label = (e) => ({ conc: "Concrete", earth: "Earth", grav: "Gravel", sand: "Sand", rigid: "Rigid insulation", gyp: "Gypsum board", brick: "Brick", cmu: "CMU", ply: "Sheathing", wood: "Wood", mw: "Mineral wool", tile: "Tile", act: "Ceiling tile", stone: "Stone", steel: "Steel", alum: "Aluminum", glass: "Glass" })[e.fill] || e.fill;
  function clusters(list) {
    const parent = list.map((_, i) => i), find = (i) => parent[i] === i ? i : parent[i] = find(parent[i]);
    const pts = list.map((e) => outlineOf(e) || e.pts || []);
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const near = pts[a].some((p) => distTo(p, list[b]) < 0.5) || pts[b].some((p) => distTo(p, list[a]) < 0.5);
      if (near) parent[find(a)] = find(b);
    }
    return new Set(list.map((_, i) => find(i))).size;
  }
  var LAYER = { conc: "A-DETL-CONC", earth: "A-DETL-EARTH", grav: "A-DETL-GRVL", sand: "A-DETL-SAND", rigid: "A-DETL-INSU-RIGD", mw: "A-DETL-INSU-MINW", gyp: "A-DETL-GYP", brick: "A-DETL-MASN-BRK", cmu: "A-DETL-MASN-CMU", stone: "A-DETL-MASN-STN", ply: "A-DETL-SHTH", wood: "A-DETL-WOOD", tile: "A-DETL-FINS", act: "A-DETL-CLNG", steel: "A-DETL-STL", alum: "A-DETL-ALUM", glass: "A-DETL-GLAS", seal: "A-DETL-MEMB", none: "A-DETL-LINE", white: "A-DETL-LINE", gray: "A-DETL-LINE", dark: "A-DETL-LINE" };
  var layerOf = (e) => e.kind === "batt" ? "A-DETL-INSU-BATT" : e.kind === "blk" || e.kind === "blk1" ? "A-DETL-WOOD" : MEMBRANE_DASH.has(e.dash) ? "A-DETL-MEMB" : e.kind === "brk" ? "A-DETL-BRKL" : LAYER[e.fill] || "A-DETL-LINE";
  var HATCH = { conc: [[45, 1.5]], earth: [[45, 0.6]], grav: [[30, 1], [150, 1]], sand: [[0, 0.5]], rigid: [[45, 0.35], [135, 0.35]], mw: [[60, 0.5]], gyp: [[0, 0.15]], brick: [[45, 0.25]], cmu: [[45, 0.45]], stone: [[30, 0.6]], ply: [[135, 0.12]], wood: [[0, 0.75]], tile: [[0, 0.3], [90, 0.3]], act: [[90, 0.5]] };
  function hatchLines(P, deg, step) {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const toL = (p) => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c], fromL = (p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
    const L = P.map(toL), ys = L.map((p) => p[1]), out = [];
    const y0 = Math.ceil(Math.min(...ys) / step) * step, y1 = Math.max(...ys);
    let guard = 0;
    for (let y = y0; y <= y1 && guard < 4e3; y += step, guard++) {
      const xs = [];
      for (let i = 0; i < L.length; i++) {
        const p = L[i], q = L[(i + 1) % L.length];
        if (p[1] > y !== q[1] > y) xs.push(p[0] + (y - p[1]) * (q[0] - p[0]) / (q[1] - p[1]));
      }
      xs.sort((m, n) => m - n);
      for (let i = 0; i + 1 < xs.length; i += 2) out.push([fromL([xs[i], y]), fromL([xs[i + 1], y])]);
    }
    return out;
  }
  var f = (n) => (Math.round(n * 1e4) / 1e4).toString();
  function toDXF(g, meta = {}) {
    const ents = [], layers = /* @__PURE__ */ new Set(["0"]);
    const L = (ly) => {
      layers.add(ly);
      return ly;
    };
    const line = (ly, a, b) => ents.push(`0
LINE
8
${L(ly)}
10
${f(a[0])}
20
${f(a[1])}
30
0
11
${f(b[0])}
21
${f(b[1])}
31
0`);
    const pline = (ly, P, closed) => {
      ents.push(`0
POLYLINE
8
${L(ly)}
66
1
10
0
20
0
30
0
70
${closed ? 1 : 0}`);
      P.forEach((p) => ents.push(`0
VERTEX
8
${ly}
10
${f(p[0])}
20
${f(p[1])}
30
0`));
      ents.push(`0
SEQEND
8
${ly}`);
    };
    const text = (ly, p, h, t, rot = 0, center = false) => ents.push(`0
TEXT
8
${L(ly)}
10
${f(p[0])}
20
${f(p[1])}
30
0
40
${f(h)}
1
${String(t).replace(/[\r\n]+/g, " ").slice(0, 250)}
50
${f(rot)}${center ? `
72
1
11
${f(p[0])}
21
${f(p[1])}
31
0` : ""}`);
    for (const e of g.elements || []) {
      const ly = layerOf(e), p = e.pts || [], o = outlineOf(e);
      if (e.kind === "circle" && p.length >= 2) ents.push(`0
CIRCLE
8
${L(ly)}
10
${f(p[0][0])}
20
${f(p[0][1])}
30
0
40
${f(Math.abs(p[1][0]))}`);
      else if (o) pline(ly, o, true);
      else if (e.kind === "brk" && p.length >= 2) {
        const [a, b] = p, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, u = [(b[0] - a[0]) / d, (b[1] - a[1]) / d], nn = [-u[1], u[0]], z = 0.6;
        pline(ly, [a, [m[0] - u[0] * z, m[1] - u[1] * z], [m[0] + nn[0] * z * 2, m[1] + nn[1] * z * 2], [m[0] - nn[0] * z * 2, m[1] - nn[1] * z * 2], [m[0] + u[0] * z, m[1] + u[1] * z], b], false);
      } else if (p.length >= 2) pline(ly, p, false);
      if (o && e.kind === "blk") {
        line(ly, o[0], o[2]);
        line(ly, o[1], o[3]);
      }
      if (o && e.kind === "blk1") line(ly, o[0], o[2]);
      if (o && e.kind === "batt") hatchLines(o, 60, Math.max(0.6, Math.min(Math.abs(o[1][0] - o[0][0]), Math.abs(o[2][1] - o[1][1])) / 3)).forEach((s) => line("A-DETL-INSU-BATT-PATT", s[0], s[1]));
      if (o && HATCH[e.fill]) for (const [deg, step] of HATCH[e.fill]) hatchLines(o, deg, step).forEach((s) => line(ly + "-PATT", s[0], s[1]));
    }
    for (const d of g.dims || []) {
      const hz = Math.abs(d.y2 - d.y1) <= Math.abs(d.x2 - d.x1), off = d.offset || 0;
      const a = hz ? [d.x1, d.y1 + off] : [d.x1 + off, d.y1], b = hz ? [d.x2, d.y1 + off] : [d.x1 + off, d.y2];
      line("A-ANNO-DIMS", [d.x1, d.y1], a);
      line("A-ANNO-DIMS", [d.x2, d.y2], b);
      line("A-ANNO-DIMS", a, b);
      [a, b].forEach((q) => line("A-ANNO-DIMS", [q[0] - 0.3, q[1] - 0.3], [q[0] + 0.3, q[1] + 0.3]));
      text("A-ANNO-DIMS", hz ? [(a[0] + b[0]) / 2, a[1] + 0.35] : [a[0] - 0.35, (a[1] + b[1]) / 2], 0.75, d.label, hz ? 0 : 90, true);
    }
    const bx = bounds(g), nx = bx.x1 + 6;
    (g.notes || []).slice().sort((m, n) => n.y - m.y).forEach((n, i) => {
      const ty = bx.y1 - i * 2.4;
      pline("A-ANNO-NOTE", [[n.x, n.y], [nx - 1, ty + 0.3], [nx - 0.2, ty + 0.3]], false);
      text("A-ANNO-NOTE", [nx, ty], 0.75, n.text.toUpperCase());
    });
    if (meta.title) text("A-ANNO-TTLB", [bx.x0, bx.y0 - 5], 1.25, String(meta.title).toUpperCase() + (meta.scale ? "  SCALE: " + meta.scale : ""));
    const tbl = [...layers].map((n) => `0
LAYER
2
${n}
70
0
62
${/PATT/.test(n) ? 8 : /ANNO/.test(n) ? 2 : /MEMB/.test(n) ? 1 : 7}
6
${/MEMB/.test(n) ? "DASHED" : "CONTINUOUS"}`).join("\n");
    const ext = bounds(g);
    return `0
SECTION
2
HEADER
9
$ACADVER
1
AC1009
9
$INSBASE
10
0
20
0
30
0
9
$EXTMIN
10
${f(ext.x0 - 10)}
20
${f(ext.y0 - 10)}
30
0
9
$EXTMAX
10
${f(ext.x1 + 60)}
20
${f(ext.y1 + 10)}
30
0
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LTYPE
70
2
0
LTYPE
2
CONTINUOUS
70
0
3
Solid line
72
65
73
0
40
0.0
0
LTYPE
2
DASHED
70
0
3
__ __ __
72
65
73
2
40
0.75
49
0.5
49
-0.25
0
ENDTAB
0
TABLE
2
LAYER
70
${layers.size}
${tbl}
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
${ents.join("\n")}
0
ENDSEC
0
EOF
`;
  }
  function regionsOf(g, comps = []) {
    const byId = new Map(comps.map((c) => [c.id, c]));
    const out = [];
    (g.elements || []).forEach((e, index) => {
      const c = e.comp ? byId.get(e.comp) : void 0, name = (c == null ? void 0 : c.name) || label(e), inferred = !!(c == null ? void 0 : c.inferred);
      const o = outlineOf(e);
      if (o) {
        if (e.fill === "none" && e.kind === "rect") return;
        out.push({ pts: o, fill: e.kind === "batt" ? "batt" : e.kind === "blk" || e.kind === "blk1" ? "wood" : e.fill, kind: e.kind, comp: e.comp || "", name, thin: false, inferred, index });
        return;
      }
      const membrane = MEMBRANE_DASH.has(e.dash) || e.fill === "seal" || c && /flash|membrane|barrier|retarder|wrb|tape|wrap/i.test(c.name + " " + c.material);
      if (e.kind === "brk" || (e.pts || []).length < 2) return;
      if (!membrane && (!c || e.dash === "hid" || e.dash === "cen")) return;
      const txt = c ? (c.name + " " + c.material).toLowerCase() : "";
      const fill = membrane ? e.dash === "vr" ? "vapor" : "membrane" : /bolt|anchor|rebar|screw|nail|fastener|strap/.test(txt) ? "steel" : /metal|steel|galv|alum|coping|drip|cleat|flashing|gutter|sheet/.test(txt) ? "alum" : /shingle|asphalt/.test(txt) ? "dark" : "gray";
      const w = membrane ? e.dash === "vr" ? 0.08 : 0.15 : { h: 0.3, m: 0.2, l: 0.12, x: 0.08 }[e.weight] || 0.15, P = e.pts, left = [], right = [];
      for (let i = 0; i < P.length; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
        left.push([P[i][0] - dy / L * w, P[i][1] + dx / L * w]);
        right.push([P[i][0] + dy / L * w, P[i][1] - dx / L * w]);
      }
      out.push({ pts: [...left, ...right.reverse()], fill, kind: "strip", comp: e.comp || "", name, thin: true, inferred, index });
    });
    return out;
  }
  return __toCommonJS(drawup_vdi_geometry_exports);
})();
