/* GENERATED from src/lib/drawup-project-intel.ts (esbuild --format=iife --global-name=DrawUpIntelCore). Do not edit; rebuild. */
"use strict";
var DrawUpIntelCore = (() => {
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

  // src/lib/drawup-project-intel.ts
  var drawup_project_intel_exports = {};
  __export(drawup_project_intel_exports, {
    COVERAGE_TEXT: () => COVERAGE_TEXT,
    FIELD_GROUPS: () => FIELD_GROUPS,
    FIELD_LABEL: () => FIELD_LABEL,
    REGISTRY: () => REGISTRY,
    SOURCES: () => SOURCES,
    censusUrl: () => censusUrl,
    femaPanelUrl: () => femaPanelUrl,
    femaViewer: () => femaViewer,
    femaZoneUrl: () => femaZoneUrl,
    lookupSite: () => lookupSite,
    mergeLookup: () => mergeLookup,
    parseCensus: () => parseCensus,
    parseDistrict: () => parseDistrict,
    parseFemaPanel: () => parseFemaPanel,
    parseFemaZone: () => parseFemaZone,
    parseUsgs: () => parseUsgs,
    plainValues: () => plainValues,
    solarSummary: () => solarSummary,
    sunOn: () => sunOn,
    usgsUrl: () => usgsUrl
  });

  // src/lib/drawup-jurisdiction-util.ts
  var clean = (s, max = 300) => String(s != null ? s : "").replace(/\s+/g, " ").trim().slice(0, max);
  var r6 = (n) => Math.round(n * 1e6) / 1e6;
  var fmtInt = (n) => Math.round(n).toLocaleString("en-US");
  var money = (n) => "$" + fmtInt(n);
  function arcFeatures(j) {
    if (j && j.error) throw new Error(clean(j.error.message || "ArcGIS error", 120) + (j.error.code ? ` (${j.error.code})` : ""));
    if (!j || !Array.isArray(j.features)) throw new Error("unexpected answer");
    return j.features;
  }
  var sqlSafe = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9 \-/]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  function ringAreaSf(ring) {
    if (!ring || ring.length < 3) return 0;
    const lat0 = ring.reduce((a2, p) => a2 + p[1], 0) / ring.length;
    const kx = 364e3 * Math.cos(lat0 * Math.PI / 180), ky = 364e3;
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * kx * (ring[i][1] * ky) - ring[i][0] * kx * (ring[j][1] * ky);
    return Math.abs(a / 2);
  }
  function ringCentroid(ring) {
    let x = 0, y = 0;
    ring.forEach((p) => {
      x += p[0];
      y += p[1];
    });
    return [x / ring.length, y / ring.length];
  }
  function clipRing(ring, b) {
    let out = ring.slice();
    const edges = [
      [(p) => p[0] >= b[0], (a, c) => [b[0], a[1] + (c[1] - a[1]) * (b[0] - a[0]) / (c[0] - a[0])]],
      [(p) => p[0] <= b[2], (a, c) => [b[2], a[1] + (c[1] - a[1]) * (b[2] - a[0]) / (c[0] - a[0])]],
      [(p) => p[1] >= b[1], (a, c) => [a[0] + (c[0] - a[0]) * (b[1] - a[1]) / (c[1] - a[1]), b[1]]],
      [(p) => p[1] <= b[3], (a, c) => [a[0] + (c[0] - a[0]) * (b[3] - a[1]) / (c[1] - a[1]), b[3]]]
    ];
    for (const [inside, cut] of edges) {
      const src = out;
      out = [];
      if (!src.length) break;
      for (let i = 0; i < src.length; i++) {
        const cur = src[i], prev = src[(i + src.length - 1) % src.length];
        if (inside(cur)) {
          if (!inside(prev)) out.push(cut(prev, cur));
          out.push(cur);
        } else if (inside(prev)) out.push(cut(prev, cur));
      }
    }
    return out.map((p) => [r6(p[0]), r6(p[1])]);
  }
  var clipRings = (rings, b) => (rings || []).map((r) => clipRing(r, b)).filter((r) => r.length >= 3);
  function boxAround(lat, lng, halfFt) {
    const dy = halfFt / 364e3, dx = halfFt / (364e3 * Math.cos(lat * Math.PI / 180));
    return [r6(lng - dx), r6(lat - dy), r6(lng + dx), r6(lat + dy)];
  }

  // src/lib/drawup-jurisdiction-charlotte.ts
  var GIS = "https://gis.charlottenc.gov/arcgis/rest/services";
  var CLT = {
    parcels: `${GIS}/PLN/AllParcelData/MapServer/0`,
    lines: `${GIS}/CountyData/Parcels/MapServer/0`,
    zoning: `${GIS}/PLN/Zoning/MapServer/0`,
    rezonings: `${GIS}/PLN/Rezonings/MapServer/0`,
    udo: "https://charlotteudo.org/articles",
    polaris: (pid) => `https://polaris3g.mecklenburgcountync.gov/pid/${encodeURIComponent(pid)}`,
    archived: "https://www.charlottenc.gov/Growth-and-Development/Planning-and-Development/Zoning/Zoning-Ordinance"
  };
  var SRC = {
    parcels: "Mecklenburg County parcel and assessor records (City of Charlotte GIS)",
    zoning: "City of Charlotte zoning map (GIS)",
    rezonings: "City of Charlotte pending rezonings (GIS)",
    udo: "Charlotte Unified Development Ordinance"
  };
  var UDO_AT = "Transcribed from the published UDO and checked Nov 11, 2026. The PDF edition of the UDO controls.";
  var ART = {
    4: ["Article 4. Neighborhood 1 Zoning Districts", "https://charlotteudo.org/articles/part-iii-neighborhood-zoning-districts/article-4-neighborhood-1-zoning-districts"],
    5: ["Article 5. Neighborhood 2 Zoning Districts", "https://charlotteudo.org/articles/part-iii-neighborhood-zoning-districts/article-5-neighborhood-2-zoning-districts"],
    6: ["Article 6. Commercial Zoning Districts: CG, CR", "https://charlotteudo.org/articles/part-iv-employment-zoning-districts/article-6-commercial-zoning-districts-cg-cr"],
    7: ["Article 7. Campus Zoning Districts: IC-1, IC-2, OFC, OG, RC", "https://charlotteudo.org/articles/part-iv-employment-zoning-districts/article-7-campus-zoning-districts-ic-1-ic-2-ofc-og-rc"],
    8: ["Article 8. Manufacturing & Logistics Zoning Districts: ML-1, ML-2", "https://charlotteudo.org/articles/part-iv-employment-zoning-districts/article-8-manufacturing-logistics-zoning-districts-ml-1-ml-2"],
    9: ["Article 9. Innovation Mixed-Use Zoning District: IMU", "https://charlotteudo.org/articles/part-iv-employment-zoning-districts/article-9-innovation-mixed-use-zoning-district-imu"],
    10: ["Article 10. Neighborhood Center Zoning District: NC", "https://charlotteudo.org/articles/part-v-centers-zoning-districts/article-10-neighborhood-center-zoning-district-nc"],
    11: ["Article 11. Community Activity Center Zoning Districts", "https://charlotteudo.org/articles/part-v-centers-zoning-districts/article-11-community-activity-center-zoning-districts"],
    12: ["Article 12. Regional Activity Center Zoning Districts", "https://charlotteudo.org/articles/part-v-centers-zoning-districts/article-12-regional-activity-center-zoning-districts"],
    13: ["Article 13. Transit Oriented Development Zoning Districts", "https://charlotteudo.org/articles/part-v-centers-zoning-districts/article-13-transit-oriented-development-zoning-districts"],
    14: ["Article 14. Special Purpose & Overlay Zoning Districts", "https://charlotteudo.org/articles/part-vi-special-purpose-overlay-zoning-districts/article-14-special-purpose-overlay-zoning-districts"],
    15: ["Article 15. Uses", "https://charlotteudo.org/articles/part-vii-uses/article-15-uses"],
    16: ["Article 16. General Development Regulations", "https://charlotteudo.org/articles/part-viii-general-development-zoning-standards/article-16-general-development-regulations"],
    19: ["Article 19. Off-Street Vehicle & Bicycle Parking", "https://charlotteudo.org/articles/part-viii-general-development-zoning-standards/article-19-off-street-vehicle-bicycle-parking"]
  };
  var BASE_ARTICLE = {
    "N1-A": 4,
    "N1-B": 4,
    "N1-C": 4,
    "N1-D": 4,
    "N1-E": 4,
    "N1-F": 4,
    "N2-A": 5,
    "N2-B": 5,
    "N2-C": 5,
    CG: 6,
    CR: 6,
    "IC-1": 7,
    "IC-2": 7,
    OFC: 7,
    OG: 7,
    RC: 7,
    "ML-1": 8,
    "ML-2": 8,
    IMU: 9,
    NC: 10,
    "CAC-1": 11,
    "CAC-2": 11,
    RAC: 12,
    UE: 12,
    UC: 12,
    "TOD-UC": 13,
    "TOD-NC": 13,
    "TOD-CC": 13,
    "TOD-TR": 13,
    MHP: 14
  };
  var OVERLAYS = {
    HDO: ["Historic District Overlay", "Section 14.1"],
    "HDO-S": ["Streetside Historic District Overlay", "Section 14.2"],
    NCO: ["Neighborhood Character Overlay", "Section 14.3"],
    RIO: ["Residential Infill Overlay", "Section 14.4"],
    CCO: ["Cottage Court Overlay", "Section 14.5"],
    MHO: ["Manufactured Home Overlay", "Section 14.6"],
    ANDO: ["Airport Noise Disclosure Overlay", "Section 14.8"]
  };
  var N1 = ["N1-A", "N1-B", "N1-C", "N1-D", "N1-E", "N1-F"];
  var T4 = {
    lotAreaRes: [1e4, 8e3, 6e3, 3500, 3e3, 3e3],
    lotAreaNon: 12e3,
    lotWidthRes: [70, 60, 50, 40, 30, 30],
    lotWidthNon: 70,
    front: [27, 27, 17, 17, 10, 17],
    corner: [13.5, 13.5, 10, 10, 10, 10],
    side: 5,
    rear: [40, 35, 30, 25, 20, 20],
    heightRes: [48, 48, 40, 40, 40, 48],
    heightNon: 48
  };
  var FRONTAGES = ["Uptown Signature", "Main Street", "Linear Park", "4-5 Lane Avenue/Boulevard", "6+ Lane Avenue/Boulevard", "2-3 Lane Avenue", "Transit Station, Off-Street Public Path, Public Park", "Uptown Primary", "Other \u2013 Primary", "Uptown Secondary", "Secondary", "Parkway (from ROW)", "Limited Access (from ROW)"];
  var _ = null;
  var SETBACK_LINES = {
    "N2-A": [24, 24, 36, 24, 30, 24, 20, 20, 20, _, 20, 20, 20],
    "N2-B": [24, 24, 36, 24, 30, 20, 10, 20, 20, _, 20, 20, 20],
    "N2-C": [24, 24, 36, 20, 24, 20, 5, 20, 20, _, 16, 20, 10],
    CG: [24, 24, 36, 36, 40, 36, 20, 20, 36, 16, _, 20, 20],
    CR: [24, 24, 36, 36, 40, 36, 20, 20, 36, 16, _, 20, 20],
    RAC: [24, 24, 36, 20, 24, 20, 5, 20, 20, 16, _, 20, 10],
    UE: [24, 24, 36, 20, 24, 20, 5, 20, 20, 16, _, 20, 10],
    UC: [24, 24, 36, 20, 24, 20, 5, 20, 20, 16, _, 20, 10]
  };
  var BTZ_ROWS = ["Main Street", "4-5 Lane Avenue/Boulevard", "6+ Lane Avenue/Boulevard", "2-3 Lane Avenue", "Transit Station, Off-Street Public Path, Public Park", "Other \u2013 Primary"];
  var BTZ = {
    RAC: Object.fromEntries(BTZ_ROWS.map((r) => [r, ["0\u201320", 80]])),
    UE: Object.fromEntries(BTZ_ROWS.map((r) => [r, ["0\u201320", 80]])),
    UC: Object.fromEntries(BTZ_ROWS.map((r) => [r, ["0\u201310", r === "Main Street" ? 100 : 80]])),
    CG: { "Main Street": ["0\u201320", 80] },
    CR: { "Main Street": ["0\u201320", 80] }
  };
  function standardsFor(base, lotSf) {
    const S = [], notes = [], gaps = [];
    const art = BASE_ARTICLE[base];
    const A = ART[art] || ["", ""];
    const add = (key, label, value, ref, applies, note) => S.push({ key, label, value, ref: `UDO ${ref}`, ...applies ? { applies } : {}, ...note ? { note } : {} });
    const ft = (n) => `${n} ft`;
    const i = N1.indexOf(base);
    if (i >= 0) {
      add("min_lot_area", "Minimum lot area", `${fmtInt(T4.lotAreaRes[i])} sf residential; ${fmtInt(T4.lotAreaNon)} sf nonresidential or mixed-use`, "Article 4, Table 4-1, rows A-B", void 0, "Applies to the parcel, not to individual sublots.");
      add("min_lot_width", "Minimum lot width", `${T4.lotWidthRes[i]} ft residential${base === "N1-F" ? " (50 ft for multi-family)" : ""}; ${T4.lotWidthNon} ft nonresidential or mixed-use`, "Article 4, Table 4-1, rows C-D");
      const cov = lotSf ? lotSf >= 1e4 ? "40%" : "50%" : "";
      add("lot_coverage", "Maximum building coverage", cov ? `${cov} (this lot is ${fmtInt(lotSf)} sf)` : "40% on lots of 10,000 sf or more; 50% on lots under 10,000 sf", "Article 4, Table 4-1, row E", cov ? "Table 4-1 sets 40% for lots of 10,000 sf or more and 50% for smaller lots." : void 0);
      add("front", "Front setback", `${ft(T4.front[i])} from the street right-of-way`, "Article 4, Table 4-2, row A", void 0, "A front setback on a recorded plat replaces this; an established blockface can allow a smaller one (not under 10 ft). Network-required private streets: measured from back of curb, plus 14 ft.");
      add("corner_side", "Corner side setback", `${ft(T4.corner[i])} from the street right-of-way`, "Article 4, Table 4-2, row B", void 0, "Along an arterial street the front setback applies instead.");
      add("side", "Side setback", ft(T4.side), "Article 4, Table 4-2, row C");
      add("rear", "Rear setback", ft(T4.rear[i]), "Article 4, Table 4-2, row D");
      add("height", "Maximum height", `${ft(T4.heightRes[i])} residential; ${ft(T4.heightNon)} nonresidential or mixed-use`, "Article 4, Table 4-3, rows A-B", void 0, "Height can rise 1 ft for each extra foot of side or rear setback, up to 65 ft. Duplexes and triplexes also have a 45-degree height plane at the side setback (Section 4.3.D). FAA Part 77 limits can apply.");
      gaps.push(["far", `Article 4's dimensional tables (4-1 to 4-3) set no floor area ratio for ${base}.`], ["density", `Article 4's dimensional tables set no dwelling-units-per-acre limit for ${base}; the housing types allowed come from Article 15 (Uses) and the lot sizes above.`]);
    } else if (base === "N2-A" || base === "N2-B" || base === "N2-C") {
      if (base !== "N2-C") {
        add("min_lot_area", "Minimum lot area", base === "N2-A" ? "3,000 sf per building (single-family, duplex, triplex, quadraplex, MF-A); 12,000 sf nonresidential or mixed-use" : "3,000 sf per building (single-family, duplex, triplex, quadraplex, MF-A); 12,000 sf for MF-S; 12,000 sf nonresidential or mixed-use", "Article 5, Table 5-1, rows A-B", void 0, "Multi-dwelling developments add up the minimum for each building.");
        add("min_lot_width", "Minimum lot width", base === "N2-A" ? "50 ft for MF-A; 80 ft for a multi-dwelling development; 70 ft nonresidential or mixed-use" : "50 ft for MF-A; 80 ft for a multi-dwelling development or MF-S; 80 ft nonresidential or mixed-use", "Article 5, Table 5-1, rows C-D");
        add("lot_coverage", "Maximum building coverage", base === "N2-A" ? "50%" : "60%", "Article 5, Table 5-1, row E");
      } else gaps.push(["min_lot_area", "The N2-C lot standards (Table 5-1) are not transcribed into DrawUp yet."], ["min_lot_width", "The N2-C lot standards (Table 5-1) are not transcribed into DrawUp yet."], ["lot_coverage", "The N2-C building coverage (Table 5-1, row E) is not transcribed into DrawUp yet."]);
      add("side", "Side setback", "5 ft", "Article 5, Table 5-2, row D");
      add("rear", "Rear setback", base === "N2-A" ? "20 ft" : "10 ft; 20 ft where the lot abuts a Neighborhood 1 Place Type", "Article 5, Table 5-2, row E");
      add("front", "Front setback", "Set by the street frontage type (see the frontage table), measured from the future back of curb", "Article 5, Table 5-2, row A");
      add("height", "Maximum height", base === "N2-C" ? "65 ft" : "48 ft", "Article 5, Table 5-3, rows A-B", void 0, base === "N2-C" ? "Within 200 ft of residential or vacant land in a Neighborhood 1 Place Type: 50 ft in the first 100 ft and 65 ft from 100 to 200 ft." : "Height can rise 1 ft for each extra foot of side or rear setback, up to 65 ft. Within 200 ft of a Neighborhood 1 Place Type the first 100 ft is limited to 50 ft.");
      gaps.push(["far", "Article 5's dimensional tables set no floor area ratio."], ["density", "Article 5's dimensional tables set no dwelling-units-per-acre limit; housing types come from Article 15 (Uses)."]);
      notes.push("Build-to zone columns for Table 5-2 are not transcribed into DrawUp yet; check the article.");
    } else if (base === "CG" || base === "CR") {
      add("min_lot_width", "Minimum lot width", "50 ft", "Article 6, Table 6-1, row A");
      add("front", "Front setback", "Set by the street frontage type (see the frontage table), measured from the future back of curb", "Article 6, Table 6-2, row A", void 0, "With no parking or maneuvering between the building and the street, the CAC-1 setback line may be used instead.");
      add("side", "Side setback", "10 ft", "Article 6, Table 6-2, row D");
      add("rear", "Rear setback", "20 ft", "Article 6, Table 6-2, row E");
      gaps.push(["height_limit", `The ${base} height limits (Table 6-3) are not transcribed into DrawUp yet.`], ["min_lot_area", "Table 6-1 sets a minimum lot width but no minimum lot area."], ["far", "Article 6's dimensional tables set no floor area ratio."], ["lot_coverage", "Article 6's dimensional tables set no building coverage limit."]);
    } else if (base === "RAC" || base === "UE" || base === "UC") {
      const minH = { RAC: 40, UE: 24, UC: 40 }[base], maxH = { RAC: "150 ft", UE: "150 ft", UC: "No maximum" }[base];
      add("front", "Front setback", "Set by the street frontage type (see the frontage table), with a build-to zone", "Article 12, Table 12-1, rows A-C");
      add("side", "Side setback", "0 ft; 10 ft where the lot abuts a Neighborhood 1 Place Type", "Article 12, Table 12-1, row D");
      add("rear", "Rear setback", "0 ft; 20 ft where the lot abuts a Neighborhood 1 Place Type", "Article 12, Table 12-1, row E");
      add("height", "Maximum height", maxH, "Article 12, Table 12-2, row B", void 0, "Within 200 ft of residential or vacant land in a Neighborhood 1 Place Type: 50 ft in the first 100 ft and 65 ft from 100 to 200 ft. FAA Part 77 limits can apply. A bonus height (Section 16.3, Table 12-2 row C) is not transcribed.");
      add("min_height", "Minimum height", `${minH} ft`, "Article 12, Table 12-2, row A", void 0, "Lots of half an acre or less and buildings of 2,000 sf or less are exempt.");
      gaps.push(["min_lot_area", "Article 12 sets no minimum lot area or width table."], ["far", "Article 12's dimensional tables set no floor area ratio."], ["lot_coverage", "Article 12's dimensional tables set no building coverage limit."], ["density", "Article 12's dimensional tables set no density limit."]);
    } else if (art) {
      gaps.push(["setbacks", `The ${base} dimensional tables (${A[0]}) are not transcribed into DrawUp yet.`], ["height_limit", `The ${base} height limits (${A[0]}) are not transcribed into DrawUp yet.`], ["min_lot_area", `The ${base} lot standards (${A[0]}) are not transcribed into DrawUp yet.`]);
    }
    let frontage;
    const lines = SETBACK_LINES[base];
    if (lines) {
      const tn = art === 5 ? "5-2" : art === 6 ? "6-2" : "12-1";
      const btz = BTZ[base] || {};
      const rows = FRONTAGES.map((f, k) => lines[k] == null ? null : [f, `${lines[k]} ft`, btz[f] ? `${btz[f][0]} ft` : "", btz[f] ? `${btz[f][1]}%` : ""]).filter(Boolean);
      frontage = {
        title: `${base} front setback by street frontage type`,
        ref: `UDO Article ${art}, Table ${tn}, rows A-C`,
        cols: ["Frontage type", "Setback line", "Build-to zone", "Build to at least"],
        rows,
        note: "Measured from the future back of curb (Parkway and Limited Access from the right-of-way). The frontage type of each street comes from the Charlotte Streets Map; a lot with several frontages has a setback on each. A blank build-to cell means it is not required there or not transcribed."
      };
    }
    return { standards: S, frontage, notes, gaps };
  }
  function parseDistrict(attrs) {
    const raw = clean(attrs == null ? void 0 : attrs.ZoneDes, 60);
    const up = raw.toUpperCase();
    const m = up.match(/^(N1-[A-F]|N2-[A-C]|CAC-[12]|TOD-(?:UC|NC|CC|TR)|IC-[12]|ML-[12]|NC|CG|CR|RAC|UE|UC|IMU|OFC|OG|RC|MHP)(?![A-Z0-9]|-[A-Z0-9])/);
    const base = m ? m[1] : "";
    const overlays = [];
    const seen = /* @__PURE__ */ new Set();
    const addOv = (code) => {
      const c = clean(code, 20).toUpperCase();
      if (!c || c === "NONE" || c === "NULL" || c === "CD" || c === "EX" || c === "O" || seen.has(c)) return;
      seen.add(c);
      const o = OVERLAYS[c];
      overlays.push({ code: c, name: o ? o[0] : c, ...o ? { ref: `UDO Article 14, ${o[1]}` } : {} });
    };
    (up.match(/\(([A-Z-]+)\)/g) || []).forEach((t) => addOv(t.replace(/[()]/g, "")));
    const ov = clean(attrs == null ? void 0 : attrs.Overlay, 40);
    if (ov && !/^none$/i.test(ov)) addOv(/airport noise/i.test(ov) ? "ANDO" : ov);
    const kind = up === "R/W" ? "right_of_way" : base ? "base" : up ? "legacy" : "unknown";
    const petition = clean(attrs == null ? void 0 : attrs.ZonePetition, 20);
    const link = clean(attrs == null ? void 0 : attrs.Hyperlink, 300);
    const rz = Number(attrs == null ? void 0 : attrs.RezoneDate);
    const rezoned = isFinite(rz) && rz > 0 ? new Date(rz).toISOString().slice(0, 10) : "";
    const art = base ? BASE_ARTICLE[base] : 0;
    const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      raw,
      base,
      name: clean(attrs == null ? void 0 : attrs.ZoneClass) ? title(clean(attrs.ZoneClass)) : "",
      kind,
      conditional: /\(?CD[)0]|\bCD\b|-CD\b/.test(up),
      exception: /\bEX\b|\(EX\)|EX\(/.test(up),
      ...petition && petition.toLowerCase() !== "null" ? { petition } : {},
      .../^https:\/\/www\.charlottenc\.gov\//.test(link) ? { petitionUrl: link } : {},
      ...rezoned ? { rezoned } : {},
      overlays,
      ...art ? { article: ART[art][0], articleUrl: ART[art][1] } : {}
    };
  }
  var q = (base, p) => `${base}/query?${new URLSearchParams({ f: "json", ...p })}`;
  var PARCEL_FIELDS = "parcelid,location_address,owner1lastname,owner1firstname,owner2lastname,owner2firstname,billingaddress,zipcode,state,city,landsize,landunitdescription,landusecode,landuse_description,legaldescription,deed_book,deed_page,yearid,totallandvalue,totalbuildingvalue,totalmarketvalue,num_heatedarea,total_living_units,saledate,saleprice,tax_mundist,gis1,gis2";
  var parcelByAddressUrl = (street) => q(CLT.parcels, { where: `location_address LIKE '${sqlSafe(street)} %'`, outFields: PARCEL_FIELDS, returnGeometry: "true", outSR: "4326", geometryPrecision: "6", resultRecordCount: "5" });
  var parcelByPointUrl = (lat, lng) => q(CLT.parcels, { geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: PARCEL_FIELDS, returnGeometry: "true", outSR: "4326", geometryPrecision: "6" });
  function parseParcel(f, how) {
    var _a;
    const a = (f == null ? void 0 : f.attributes) || {};
    const id = clean(a.parcelid, 20);
    if (!id) return null;
    const rings = Array.isArray((_a = f.geometry) == null ? void 0 : _a.rings) ? f.geometry.rings.filter((r) => Array.isArray(r) && r.length >= 3).map((r) => r.map((p) => [Number(p[0]), Number(p[1])])) : [];
    const unit = clean(a.landunitdescription).toUpperCase();
    const size = Number(a.landsize);
    let lotSf, lotFrom = "";
    if (isFinite(size) && size > 0) {
      lotSf = /ACRE/.test(unit) ? size * 43560 : /SQ|FEET|FT/.test(unit) ? size : void 0;
      if (lotSf) lotFrom = "assessor land size";
    }
    if (!lotSf && rings.length) {
      lotSf = Math.round(rings.reduce((s, r) => s + ringAreaSf(r), 0));
      lotFrom = "GIS parcel outline";
    }
    const lat = Number(a.gis2), lng = Number(a.gis1);
    const point = isFinite(lat) && isFinite(lng) && lat > 30 && lat < 40 && lng < -75 && lng > -85 ? [lng, lat] : rings[0] ? ringCentroid(rings[0]) : void 0;
    const name = (l, fN) => [clean(fN), clean(l)].filter((s) => s && s.toLowerCase() !== "null").join(" ");
    const owners = [name(a.owner1lastname, a.owner1firstname), name(a.owner2lastname, a.owner2firstname)].filter(Boolean);
    const sale = Number(a.saledate);
    const saleP = Number(a.saleprice);
    const deed = clean(a.deed_book) && clean(a.deed_page) && clean(a.deed_book).toLowerCase() !== "null" ? `Deed book ${clean(a.deed_book)}, page ${clean(a.deed_page)}` : "";
    const n = (x) => {
      const v = Number(x);
      return isFinite(v) && v > 0 ? v : void 0;
    };
    return {
      id,
      url: CLT.polaris(id),
      src: SRC.parcels,
      srcUrl: `${CLT.parcels}`,
      conf: how === "address" ? "high" : "medium",
      how,
      address: clean(a.location_address),
      owner: owners.join(" & "),
      ownerMail: [clean(a.billingaddress), clean(a.city), clean(a.state), clean(a.zipcode)].filter((s) => s && s.toLowerCase() !== "null").join(", "),
      landUse: clean(a.landuse_description) ? `${clean(a.landuse_description)}${clean(a.landusecode) ? " (" + clean(a.landusecode) + ")" : ""}` : "",
      lotSf: lotSf ? Math.round(lotSf) : void 0,
      lotAcres: lotSf ? Math.round(lotSf / 43560 * 1e3) / 1e3 : void 0,
      lotFrom,
      legal: clean(a.legaldescription),
      deed,
      assessedYear: n(a.yearid),
      landValue: n(a.totallandvalue),
      buildingValue: n(a.totalbuildingvalue),
      totalValue: n(a.totalmarketvalue),
      heatedSf: n(a.num_heatedarea),
      units: n(a.total_living_units),
      lastSale: isFinite(sale) && sale > 0 ? `${new Date(sale).toISOString().slice(0, 10)}${isFinite(saleP) && saleP > 0 ? " for " + money(saleP) : ""}` : "",
      town: clean(a.tax_mundist),
      point,
      rings
    };
  }
  var zoningAtUrl = (lat, lng) => q(CLT.zoning, { geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "ZoneDes,ZoneClass,ZonePetition,Overlay,RezoneDate,Hyperlink", returnGeometry: "false" });
  var env = (b) => ({ geometry: b.join(","), geometryType: "esriGeometryEnvelope", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outSR: "4326", returnGeometry: "true", geometryPrecision: "6" });
  var zoningNearUrl = (b) => q(CLT.zoning, { ...env(b), outFields: "ZoneDes", maxAllowableOffset: "0.00002", resultRecordCount: "200" });
  var linesNearUrl = (b) => q(CLT.lines, { ...env(b), outFields: "PID", maxAllowableOffset: "0.00001", resultRecordCount: "600" });
  var rezoningsNearUrl = (b) => q(CLT.rezonings, { ...env(b), where: "Status='Pen'", outFields: "Petition,ExistZone,ReqZone,Acres,Received,Hyperlink", maxAllowableOffset: "0.00002", resultRecordCount: "50" });
  var ringsOf = (f) => {
    var _a;
    return Array.isArray((_a = f == null ? void 0 : f.geometry) == null ? void 0 : _a.rings) ? f.geometry.rings.map((r) => r.map((p) => [Number(p[0]), Number(p[1])])) : [];
  };
  var VICINITY_HALF_FT = 650;
  var CHARLOTTE = {
    id: "nc-charlotte",
    label: "Charlotte, NC (zoning, UDO limits and pending rezonings) and all of Mecklenburg County, NC (parcels and assessor data)",
    covers: (geo) => geo.state === "NC" && /^mecklenburg/i.test(geo.county),
    async parcel(ctx) {
      var _a;
      const street = ctx.geo.matched.split(",")[0] || "";
      const [byAddr, byPoint] = await Promise.all([
        /^\d+\s+\S/.test(street) ? ctx.run("meck_parcel", SRC.parcels + " (by address)", parcelByAddressUrl(street), (j) => arcFeatures(j)) : Promise.resolve(null),
        ctx.run("meck_parcel_pt", SRC.parcels + " (at the map point)", parcelByPointUrl(ctx.geo.lat, ctx.geo.lng), (j) => arcFeatures(j))
      ]);
      const ids = new Set((byAddr || []).map((f) => {
        var _a2;
        return clean((_a2 = f == null ? void 0 : f.attributes) == null ? void 0 : _a2.parcelid);
      }));
      let pick = null;
      if (byAddr && byAddr.length === 1) pick = parseParcel(byAddr[0], "address");
      else if (byAddr && byAddr.length > 1 && byPoint && byPoint[0] && ids.has(clean((_a = byPoint[0].attributes) == null ? void 0 : _a.parcelid))) pick = parseParcel(byPoint[0], "address");
      else if (byPoint && byPoint.length) pick = parseParcel(byPoint[0], "point");
      if (!pick) {
        ctx.gap("parcel_id", "No Mecklenburg County parcel matched this address or its map point.", "Search the address in Polaris (polaris3g.mecklenburgcountync.gov) and enter the parcel ID.");
        return null;
      }
      const P = pick, s = P.src, u = P.url;
      const howNote = P.how === "address" ? "Matched by street address." : "Found at the map point, not by the address; confirm it is the right lot.";
      ctx.put("parcel_id", P.id, s, u, P.conf, howNote);
      if (P.lotSf) ctx.put("site_area", `${fmtInt(P.lotSf)} sf (${P.lotAcres} ac)`, s, u, "medium", `From the ${P.lotFrom}; not a survey.`);
      if (P.rings && P.rings.length) ctx.put("property_boundary", `County GIS parcel outline (${P.rings.reduce((a, r) => a + r.length - 1, 0)} points), shown on the vicinity map. Not a survey.`, s, u, "medium", "GIS parcel lines are approximate; use a boundary survey for design.");
      if (P.owner) ctx.put("parcel_owner", P.owner + (P.ownerMail ? ` (mailing: ${P.ownerMail})` : ""), s, u, "high", "Owner of record from the county tax roll.");
      if (P.landUse) ctx.put("assessor_land_use", P.landUse, s, u, "high", "Assessor land-use code, not the zoning.");
      if (P.totalValue) ctx.put("assessed_value", `${money(P.totalValue)} total${P.landValue ? " (land " + money(P.landValue) : ""}${P.buildingValue ? ", building " + money(P.buildingValue) + ")" : P.landValue ? ")" : ""}${P.assessedYear ? ", tax year " + P.assessedYear : ""}`, s, u, "high");
      if (P.legal || P.deed) ctx.put("legal_description", [P.legal, P.deed].filter(Boolean).join("; "), s, u, "high");
      return P;
    },
    async zoning(ctx, lat, lng, parcel) {
      const town = ((parcel == null ? void 0 : parcel.town) || "").toUpperCase();
      const inCharlotte = town ? /CHARLOTTE/.test(town) : /^charlotte$/i.test(ctx.geo.place);
      const box = boxAround(lat, lng, VICINITY_HALF_FT);
      const jur = { id: "nc-charlotte", name: "City of Charlotte", ordinance: "Charlotte Unified Development Ordinance (effective June 1, 2023)", ordinanceUrl: CLT.udo, mapName: SRC.zoning, mapUrl: CLT.zoning };
      const [at, zones, lines, rez] = await Promise.all([
        ctx.run("clt_zoning", SRC.zoning, zoningAtUrl(lat, lng), (j) => arcFeatures(j)),
        ctx.run("clt_zoning_near", SRC.zoning + " (vicinity)", zoningNearUrl(box), (j) => arcFeatures(j)),
        ctx.run("meck_lines", "Mecklenburg County parcel lines (City of Charlotte GIS)", linesNearUrl(box), (j) => arcFeatures(j)),
        ctx.run("clt_rezonings", SRC.rezonings, rezoningsNearUrl(box), (j) => arcFeatures(j))
      ]);
      const vicinity = {
        bbox: box,
        src: `${SRC.zoning}; Mecklenburg County parcel lines; ${SRC.rezonings}`,
        zones: (zones || []).map((f2) => {
          var _a;
          return { code: clean((_a = f2.attributes) == null ? void 0 : _a.ZoneDes, 40), rings: clipRings(ringsOf(f2), box) };
        }).filter((z) => z.rings.length),
        parcels: (lines || []).map((f2) => clipRings(ringsOf(f2), box)).filter((r) => r.length).slice(0, 600),
        rezonings: (rez || []).map((f2) => {
          const a = f2.attributes || {};
          const d2 = Number(a.Received);
          return { petition: clean(a.Petition, 20), existing: clean(a.ExistZone, 40), requested: clean(a.ReqZone, 40), ...isFinite(+a.Acres) && +a.Acres > 0 ? { acres: Math.round(+a.Acres * 100) / 100 } : {}, ...isFinite(d2) && d2 > 0 ? { received: new Date(d2).toISOString().slice(0, 10) } : {}, .../^https:\/\/www\.charlottenc\.gov\//.test(clean(a.Hyperlink, 300)) ? { url: clean(a.Hyperlink, 300) } : {}, rings: clipRings(ringsOf(f2), box) };
        }).filter((r) => r.petition)
      };
      if (vicinity.rezonings.length) {
        ctx.put("nearby_rezonings", vicinity.rezonings.slice(0, 6).map((r) => `${r.petition}: ${r.existing || "?"} to ${r.requested || "?"}${r.acres ? ` (${r.acres} ac)` : ""}`).join("; ") + (vicinity.rezonings.length > 6 ? `; and ${vicinity.rezonings.length - 6} more` : ""), SRC.rezonings, CLT.rezonings, "high", "City of Charlotte petitions pending within about 650 ft of the site. A rezoning can change what neighbors may build.");
      } else if (rez && inCharlotte) ctx.put("nearby_rezonings", "No City of Charlotte rezoning pending within about 650 ft", SRC.rezonings, CLT.rezonings, "high");
      if (!inCharlotte && town) {
        const t = town.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase());
        for (const k of ["zoning_district", "zoning_requirements", "setbacks", "height_limit", "min_lot_area", "lot_coverage", "land_use", ...vicinity.rezonings.length ? [] : ["nearby_rezonings"]])
          ctx.gap(k, `This parcel is in ${t}, which zones its own land. DrawUp covers zoning for the City of Charlotte only so far.`, `Check the ${t} zoning map and ordinance, then enter it here.`);
        return { vicinity };
      }
      const f = at && at[0];
      if (!f) {
        for (const k of ["zoning_district", "setbacks", "height_limit"])
          ctx.gap(k, at ? "The Charlotte zoning map has no district at this point." : "The Charlotte zoning map did not answer.", at ? "Check the parcel on the Charlotte zoning map; it may be right-of-way or outside the city's zoning area." : "Try the lookup again later.");
        return { vicinity };
      }
      const d = parseDistrict(f.attributes);
      const zi = { jurisdiction: jur, district: d, standards: [], notes: [], transcribed: UDO_AT };
      const zurl = d.petitionUrl || CLT.zoning;
      const pointNote = parcel ? "Read at a point inside the parcel; if the lot sits on a district line, check the vicinity map." : "Read at the geocoded street point, not inside a confirmed parcel.";
      ctx.put("zoning_district", `${d.raw}${d.name ? " (" + d.name + ")" : ""}`, SRC.zoning, CLT.zoning, parcel ? "high" : "medium", pointNote);
      const cond = [];
      if (d.conditional) cond.push(`Conditional district${d.petition ? " from rezoning petition " + d.petition : ""}: the approved site plan and its conditions apply on top of (and can be stricter than) the base district limits.`);
      if (d.exception) cond.push("Rezoned with exceptions (EX): the approved plan can change the base limits.");
      if (d.overlays.length) cond.push("Overlays: " + d.overlays.map((o) => `${o.name}${o.code !== o.name ? " (" + o.code + ")" : ""}${o.ref ? ", " + o.ref : ""}`).join("; ") + ".");
      if (d.petition && !d.conditional) cond.push(`Last rezoned by petition ${d.petition}${d.rezoned ? " (" + d.rezoned + ")" : ""}.`);
      if (cond.length) ctx.put("zoning_conditions", cond.join(" "), SRC.zoning, zurl, "high", d.petitionUrl ? "The petition page has the approved site plan." : void 0);
      ctx.put("land_use", d.overlays.length ? d.overlays.map((o) => o.name).join("; ") : "No overlay district on the zoning map at this point", SRC.zoning, CLT.zoning, "high", "Overlays only. Allowed uses come from UDO Article 15 for the district.");
      if (d.kind === "right_of_way") {
        for (const k of ["setbacks", "height_limit"]) ctx.gap(k, "The zoning map shows street right-of-way at this point, not a zoned lot.", "Check the parcel on the Charlotte zoning map.");
        zi.notes.push("Right-of-way at this point.");
        return { zoning: zi, vicinity };
      }
      if (d.kind === "legacy") {
        const why = `${d.raw} is not a UDO base district. Districts like this were kept from the zoning ordinance in effect until May 31, 2023, usually through a conditional rezoning, so their limits come from the approved rezoning plan and that ordinance, not the UDO tables.`;
        for (const k of ["setbacks", "height_limit", "min_lot_area"]) ctx.gap(k, why, d.petitionUrl ? "Open the rezoning petition for the approved site plan." : "Look up the rezoning petition for this parcel and the archived Charlotte Zoning Ordinance.");
        zi.notes.push(why);
        return { zoning: zi, vicinity };
      }
      const lotSf = parcel == null ? void 0 : parcel.lotSf;
      const { standards, frontage, notes, gaps } = standardsFor(d.base, lotSf);
      zi.standards = standards;
      zi.frontage = frontage;
      zi.notes.push(...notes);
      if (d.conditional || d.exception) zi.notes.unshift("These are the base district limits. The approved rezoning plan can change them; check it before relying on any number here.");
      const ref = d.articleUrl || CLT.udo;
      const by = (k) => standards.find((s) => s.key === k);
      const confS = d.conditional || d.exception ? "low" : "medium";
      const baseNote = (d.conditional || d.exception ? "Base district limit; the approved rezoning plan may differ. " : "") + UDO_AT;
      const sb = ["front", "corner_side", "side", "rear"].map(by).filter(Boolean);
      if (sb.length) ctx.put("setbacks", sb.map((s) => `${s.label.replace(" setback", "")}: ${s.value}`).join(" \xB7 "), SRC.udo + `, ${d.article || ""}`.replace(/, $/, ""), ref, confS, `${sb.map((s) => s.ref).filter((v, i, a) => a.indexOf(v) === i).join("; ")}. ${baseNote}`);
      const h = by("height");
      if (h) ctx.put("height_limit", h.value + (by("min_height") ? ` (minimum ${by("min_height").value})` : ""), SRC.udo, ref, confS, `${h.ref}. ${h.note ? h.note + " " : ""}${baseNote}`);
      for (const k of ["min_lot_area", "min_lot_width", "lot_coverage", "far", "density"]) {
        const s = by(k);
        if (s) ctx.put(k, s.value, SRC.udo, ref, confS, `${s.ref}. ${s.note ? s.note + " " : ""}${baseNote}`);
      }
      for (const [k, reason] of gaps) ctx.gap(k, reason, `See ${d.article || "the UDO"} (${ref}).`);
      const summary = [`${d.raw}: ${d.article || "Charlotte UDO"}.`, ...standards.map((s) => `${s.label}: ${s.value} (${s.ref})`)].join("\n");
      ctx.put("zoning_requirements", summary, SRC.udo, ref, confS, baseNote);
      return { zoning: zi, vicinity };
    }
  };

  // src/lib/drawup-jurisdictions.ts
  var REGISTRY = [CHARLOTTE];
  var COVERAGE_TEXT = REGISTRY.map((j) => j.label).join("; ");
  var findJurisdiction = (geo) => REGISTRY.find((j) => {
    try {
      return j.covers(geo);
    } catch {
      return false;
    }
  }) || null;

  // src/lib/drawup-project-intel.ts
  var SOURCES = {
    census: { name: "U.S. Census Bureau Geocoder", home: "https://geocoding.geo.census.gov/geocoder/" },
    fema: { name: "FEMA National Flood Hazard Layer", home: "https://msc.fema.gov/portal/home" },
    usgs: { name: "USGS Elevation Point Query Service (3DEP)", home: "https://apps.nationalmap.gov/epqs/" },
    sun: { name: "DrawUp sun position (NOAA solar equations)", home: "https://gml.noaa.gov/grad/solcalc/calcdetails.html" }
  };
  var FIELD_GROUPS = [
    { id: "project", label: "Project", fields: [["project_name", "Project name"], ["project_number", "Project number"], ["project_status", "Project status"], ["phase", "Phase"], ["building_type", "Building type"], ["project_description", "Description"]] },
    { id: "site", label: "Site and jurisdiction", fields: [["project_address", "Project address"], ["project_location", "City and state"], ["latitude", "Latitude"], ["longitude", "Longitude"], ["county", "County"], ["municipality", "Municipality"], ["jurisdiction", "Likely permitting jurisdiction"], ["census_tract", "Census tract"], ["parcel_id", "Parcel ID"], ["site_area", "Site area"], ["property_boundary", "Property boundary"], ["parcel_owner", "Owner of record"], ["assessor_land_use", "Assessor land use"], ["assessed_value", "Assessed value"], ["legal_description", "Legal description and deed"]] },
    { id: "zoning", label: "Zoning and land use", fields: [["zoning_district", "Zoning designation"], ["zoning_conditions", "Conditions and overlays"], ["zoning_requirements", "Zoning requirements"], ["setbacks", "Setbacks (front / side / rear)"], ["height_limit", "Height limit"], ["min_lot_area", "Minimum lot area"], ["min_lot_width", "Minimum lot width"], ["lot_coverage", "Maximum building coverage"], ["far", "Floor area ratio (FAR)"], ["density", "Density"], ["land_use", "Land-use restrictions"], ["parking_requirement", "Parking requirement"], ["nearby_rezonings", "Pending rezonings nearby"]] },
    { id: "environment", label: "Flood, terrain and environment", fields: [["flood_zone", "Flood zone"], ["firm_panel", "FIRM panel"], ["base_flood_elevation", "Base flood elevation"], ["ground_elevation", "Ground elevation"], ["solar_summer", "Sun at noon, June 21"], ["solar_winter", "Sun at noon, December 21"], ["environmental_notes", "Environmental notes"], ["existing_structures", "Existing structures"]] },
    { id: "building", label: "Building", fields: [["occupancy", "Preliminary occupancy classification"], ["construction_type", "Construction type"], ["stories", "Stories"], ["gross_area", "Gross area"], ["sprinklered", "Sprinklered"], ["code_edition", "Building code (adopted edition)"], ["code_references", "Preliminary code references"]] },
    { id: "team", label: "Owner and team", fields: [["owner_name", "Owner"], ["owner_address", "Owner address"], ["architect_name", "Architect"], ["architect_address", "Architect address"], ["pm_name", "Project manager"], ["contractor_name", "Contractor"], ["structural_engineer", "Structural engineer"], ["mep_engineer", "MEP engineer"], ["civil_engineer", "Civil engineer"]] }
  ];
  var FIELD_LABEL = Object.fromEntries(FIELD_GROUPS.flatMap((g) => g.fields.map((f) => [f[0], f[1]])));
  var r62 = (n) => Math.round(n * 1e6) / 1e6;
  var clean2 = (s, max = 300) => String(s != null ? s : "").replace(/\s+/g, " ").trim().slice(0, max);
  function censusUrl(address) {
    const q2 = new URLSearchParams({ address, benchmark: "Public_AR_Current", vintage: "Current_Current", layers: "all", format: "json" });
    return `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?${q2}`;
  }
  var NFHL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
  function femaZoneUrl(lat, lng) {
    const q2 = new URLSearchParams({ geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DFIRM_ID", returnGeometry: "false", f: "json" });
    return `${NFHL}/28/query?${q2}`;
  }
  function femaPanelUrl(lat, lng) {
    const q2 = new URLSearchParams({ geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "FIRM_PAN,EFF_DATE,PANEL_TYP", returnGeometry: "false", f: "json" });
    return `${NFHL}/3/query?${q2}`;
  }
  function usgsUrl(lat, lng) {
    const q2 = new URLSearchParams({ x: String(lng), y: String(lat), wkid: "4326", units: "Feet", includeDate: "false" });
    return `https://epqs.nationalmap.gov/v1/json?${q2}`;
  }
  var femaViewer = (lat, lng) => `https://msc.fema.gov/portal/search?AddressQuery=${encodeURIComponent(`${r62(lat)},${r62(lng)}`)}`;
  function parseCensus(j) {
    var _a, _b;
    const m = (_b = (_a = j == null ? void 0 : j.result) == null ? void 0 : _a.addressMatches) == null ? void 0 : _b[0];
    if (!m || !m.coordinates) return null;
    const g = m.geographies || {};
    const first = (...names) => {
      for (const n of names) {
        const a = g[n];
        if (Array.isArray(a) && a[0]) return a[0];
      }
      return null;
    };
    const state = first("States"), county = first("Counties"), place = first("Incorporated Places"), csub = first("County Subdivisions"), tract = first("Census Tracts");
    const lat = Number(m.coordinates.y), lng = Number(m.coordinates.x);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    const comps = m.addressComponents || {};
    return {
      matched: clean2(m.matchedAddress),
      lat: r62(lat),
      lng: r62(lng),
      state: clean2((state == null ? void 0 : state.STUSAB) || comps.state),
      stateName: clean2(state == null ? void 0 : state.NAME),
      county: clean2(county == null ? void 0 : county.NAME),
      place: clean2((place == null ? void 0 : place.BASENAME) || (place == null ? void 0 : place.NAME)),
      placeName: clean2((place == null ? void 0 : place.NAME) || (place == null ? void 0 : place.BASENAME)),
      countySub: clean2((csub == null ? void 0 : csub.BASENAME) || (csub == null ? void 0 : csub.NAME)),
      tract: clean2((tract == null ? void 0 : tract.NAME) || ((tract == null ? void 0 : tract.TRACT) ? `Census Tract ${tract.TRACT}` : "")),
      tractGeoid: clean2(tract == null ? void 0 : tract.GEOID),
      city: clean2(comps.city),
      zip: clean2(comps.zip)
    };
  }
  function parseFemaZone(j) {
    const f = j == null ? void 0 : j.features;
    if (!Array.isArray(f)) return null;
    if (!f.length) return { zone: "", subtype: "", sfha: false, bfe: "", none: true };
    const a = f[0].attributes || {};
    const bfe = Number(a.STATIC_BFE);
    return { zone: clean2(a.FLD_ZONE), subtype: clean2(a.ZONE_SUBTY), sfha: String(a.SFHA_TF).toUpperCase() === "T", bfe: isFinite(bfe) && bfe > -9e3 ? `${bfe} ft` : "", none: false };
  }
  function parseFemaPanel(j) {
    const f = j == null ? void 0 : j.features;
    if (!Array.isArray(f) || !f.length) return null;
    const a = f[0].attributes || {};
    const eff = a.EFF_DATE ? new Date(Number(a.EFF_DATE)) : null;
    return { panel: clean2(a.FIRM_PAN), effective: eff && !isNaN(eff.getTime()) ? eff.toISOString().slice(0, 10) : "" };
  }
  function parseUsgs(j) {
    const v = Number(j == null ? void 0 : j.value);
    return isFinite(v) && v > -1e4 ? Math.round(v * 10) / 10 : null;
  }
  var rad = (d) => d * Math.PI / 180;
  var deg = (r) => r * 180 / Math.PI;
  function declination(dayOfYear) {
    const g = 2 * Math.PI / 365 * (dayOfYear - 1);
    return deg(6918e-6 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 6758e-6 * Math.cos(2 * g) + 907e-6 * Math.sin(2 * g) - 2697e-6 * Math.cos(3 * g) + 148e-5 * Math.sin(3 * g));
  }
  function sunOn(lat, dayOfYear) {
    const d = declination(dayOfYear), noonAlt = 90 - Math.abs(lat - d);
    const cosH = (Math.cos(rad(90.833)) - Math.sin(rad(lat)) * Math.sin(rad(d))) / (Math.cos(rad(lat)) * Math.cos(rad(d)));
    const H = Math.acos(Math.max(-1, Math.min(1, cosH)));
    const dayHours = 2 * deg(H) / 15;
    const riseAz = deg(Math.acos(Math.max(-1, Math.min(1, Math.sin(rad(d)) / Math.cos(rad(lat))))));
    return { noonAltitude: Math.round(noonAlt * 10) / 10, dayHours: Math.round(dayHours * 10) / 10, sunriseAzimuth: Math.round(riseAz), sunsetAzimuth: Math.round(360 - riseAz) };
  }
  function solarSummary(lat) {
    const s = sunOn(lat, 172), w = sunOn(lat, 355);
    const fmt = (x) => `${x.noonAltitude}\xB0 above the horizon at solar noon; ${x.dayHours} h of daylight; rises at ${x.sunriseAzimuth}\xB0, sets at ${x.sunsetAzimuth}\xB0 (from north)`;
    return { summer: fmt(s), winter: fmt(w), facing: lat >= 0 ? "South-facing glazing gets the most winter sun; west glazing gets the hardest summer afternoon sun." : "North-facing glazing gets the most winter sun." };
  }
  var nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
  async function lookupSite(address, fetchJson) {
    var _a;
    const at = nowIso();
    const fields = {};
    const sources = [];
    const unavailable = [];
    const put = (k, v, src, url, conf, note) => {
      if (v) fields[k] = { v, src, url, at, conf, by: "auto", verified: false, ...note ? { note } : {} };
    };
    const run = async (id, name, url, parse) => {
      const t0 = Date.now();
      try {
        const out = parse(await fetchJson(url));
        sources.push({ id, name, url, ok: out != null, ms: Date.now() - t0, ...out == null ? { error: "no match" } : {} });
        return out;
      } catch (e) {
        sources.push({ id, name, url, ok: false, error: clean2((e == null ? void 0 : e.message) || e, 160), ms: Date.now() - t0 });
        return null;
      }
    };
    const geo = await run("census", SOURCES.census.name, censusUrl(address), parseCensus);
    if (!geo) {
      unavailable.push({ key: "latitude", reason: "The Census geocoder could not match this address.", next: "Check the street address (number, street, city, state, ZIP) or enter the coordinates." });
      return { fields, site: {}, sources, unavailable, at };
    }
    const cu = censusUrl(address), C = SOURCES.census.name;
    put("project_address", geo.matched, C, cu, "medium", "Matched to Census address ranges; the exact lot is not confirmed.");
    put("project_location", [geo.place || geo.city, geo.state].filter(Boolean).join(", "), C, cu, "high");
    put("latitude", String(geo.lat), C, cu, "medium", "Interpolated along the street; may be off by a few lots.");
    put("longitude", String(geo.lng), C, cu, "medium", "Interpolated along the street; may be off by a few lots.");
    put("county", [geo.county, geo.stateName].filter(Boolean).join(", "), C, cu, "high");
    if (geo.place) put("municipality", geo.place, C, cu, "high");
    else if (geo.countySub) put("municipality", `${geo.countySub} (unincorporated area)`, C, cu, "medium");
    put(
      "jurisdiction",
      geo.place ? `${geo.placeName} (incorporated place)` : geo.county ? `${geo.county} (unincorporated, county jurisdiction likely)` : "",
      C,
      cu,
      "low",
      "Inferred from Census boundaries. Confirm the permitting authority (AHJ) and any extraterritorial jurisdiction with the city or county."
    );
    put("census_tract", geo.tract, C, cu, "high");
    const J = findJurisdiction(geo);
    let parcel = null;
    let lat = geo.lat, lng = geo.lng, from = "census";
    const ctx = { address, geo, at, fetchJson, run: (id, name, url, parse) => run(id, name, url, parse), put, gap: (key, reason, next) => {
      if (!unavailable.some((u) => u.key === key)) unavailable.push({ key, reason, next });
    } };
    if (J) {
      try {
        parcel = await J.parcel(ctx);
      } catch (e) {
        ctx.gap("parcel_id", "The parcel lookup failed: " + clean2((e == null ? void 0 : e.message) || e, 120), "Try again later.");
      }
      if (parcel && parcel.point) {
        [lng, lat] = [parcel.point[0], parcel.point[1]];
        from = "parcel";
        const pn = "A point inside the county GIS parcel, more exact than the street-range geocode.";
        put("latitude", String(lat), parcel.src, parcel.url, "high", pn);
        put("longitude", String(lng), parcel.src, parcel.url, "high", pn);
      }
    }
    const zoningP = J ? J.zoning(ctx, lat, lng, parcel).catch((e) => {
      ctx.gap("zoning_district", "The zoning lookup failed: " + clean2((e == null ? void 0 : e.message) || e, 120), "Try again later.");
      return {};
    }) : Promise.resolve({});
    const [zone, panel, elev, zres] = await Promise.all([
      run("fema_zone", SOURCES.fema.name + " (flood zones)", femaZoneUrl(lat, lng), parseFemaZone),
      run("fema_panel", SOURCES.fema.name + " (FIRM panels)", femaPanelUrl(lat, lng), parseFemaPanel),
      run("usgs", SOURCES.usgs.name, usgsUrl(lat, lng), parseUsgs),
      zoningP
    ]);
    const fv = femaViewer(lat, lng), F = SOURCES.fema.name;
    if (zone && !zone.none) {
      put("flood_zone", `Zone ${zone.zone}${zone.subtype ? " (" + zone.subtype.toLowerCase() + ")" : ""}${zone.sfha ? " - Special Flood Hazard Area" : ""}`, F, fv, "medium", from === "parcel" ? "At one point inside the parcel; check the whole parcel on the FIRM." : "At the geocoded point only; check the whole parcel on the FIRM.");
      if (zone.bfe) put("base_flood_elevation", zone.bfe, F, fv, "medium");
    } else if (zone && zone.none) unavailable.push({ key: "flood_zone", reason: "FEMA returned no mapped flood zone at this point (the area may be unmapped).", next: "Check the FEMA Flood Map Service Center for the parcel." });
    else unavailable.push({ key: "flood_zone", reason: "The FEMA flood service did not answer.", next: "Try again later or check the FEMA Flood Map Service Center." });
    if (panel) put("firm_panel", `${panel.panel}${panel.effective ? ", effective " + panel.effective : ""}`, F, fv, "medium");
    if (elev != null) put("ground_elevation", `${elev} ft (NAVD 88), at ${from === "parcel" ? "a point inside the parcel" : "the geocoded point"}`, SOURCES.usgs.name, usgsUrl(lat, lng), "medium", "From 3DEP terrain data; not a survey.");
    else unavailable.push({ key: "ground_elevation", reason: "The USGS elevation service did not answer.", next: "Use a survey or try again later." });
    const sun = solarSummary(lat);
    const su = SOURCES.sun.home;
    put("solar_summer", sun.summer, SOURCES.sun.name, su, "high");
    put("solar_winter", sun.winter, SOURCES.sun.name, su, "high");
    const where = geo.county ? `${geo.county}${geo.stateName ? ", " + geo.stateName : ""}` : "this jurisdiction";
    const covered = J ? "" : ` DrawUp covers: ${COVERAGE_TEXT}.`;
    for (const [key, what] of [["parcel_id", "parcel records"], ["property_boundary", "parcel boundaries"], ["site_area", "parcel area"], ["zoning_district", "zoning"], ["setbacks", "setbacks"], ["height_limit", "height limits"], ["land_use", "land-use restrictions"]])
      if (!fields[key] && !unavailable.some((u) => u.key === key)) unavailable.push({ key, reason: J ? `The ${what} lookup for ${where} returned nothing.` : `DrawUp has no connected ${what} source for ${where} yet.${covered}`, next: key === "property_boundary" || key === "site_area" ? "Upload a survey or the county GIS parcel report, then enter it." : "Check the zoning ordinance or the city/county GIS, then enter it here." });
    unavailable.push({ key: "code_edition", reason: "The adopted building code edition is not looked up automatically.", next: "Confirm the adopted edition and local amendments with the AHJ (the ICC adoption map is a starting point)." });
    const site = { lat, lng, from, boundary: ((_a = parcel == null ? void 0 : parcel.rings) == null ? void 0 : _a.length) ? parcel.rings : null, ...J ? { jurisdiction: J.id } : {} };
    if (parcel) {
      const { rings: _r, ...rest } = parcel;
      site.parcel = rest;
    }
    if (zres && zres.zoning) site.zoning = zres.zoning;
    if (zres && zres.vicinity) site.vicinity = zres.vicinity;
    return { fields, site, sources, unavailable, at };
  }
  function mergeLookup(saved, found) {
    const out = { ...saved };
    const applied = [];
    const kept = [];
    for (const [k, v] of Object.entries(found)) {
      const cur = saved[k];
      if (cur && (cur.by === "user" || cur.verified) && String(cur.v || "").trim()) {
        if (String(cur.v) !== String(v.v)) kept.push(k);
        continue;
      }
      out[k] = v;
      applied.push(k);
    }
    return { fields: out, applied, kept };
  }
  var plainValues = (fields) => Object.fromEntries(Object.entries(fields || {}).filter(([, f]) => {
    var _a;
    return f && String((_a = f.v) != null ? _a : "").trim();
  }).map(([k, f]) => [k, String(f.v)]));
  return __toCommonJS(drawup_project_intel_exports);
})();
