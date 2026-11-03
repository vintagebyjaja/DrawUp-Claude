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
    FIELD_GROUPS: () => FIELD_GROUPS,
    FIELD_LABEL: () => FIELD_LABEL,
    SOURCES: () => SOURCES,
    censusUrl: () => censusUrl,
    femaPanelUrl: () => femaPanelUrl,
    femaViewer: () => femaViewer,
    femaZoneUrl: () => femaZoneUrl,
    lookupSite: () => lookupSite,
    mergeLookup: () => mergeLookup,
    parseCensus: () => parseCensus,
    parseFemaPanel: () => parseFemaPanel,
    parseFemaZone: () => parseFemaZone,
    parseUsgs: () => parseUsgs,
    plainValues: () => plainValues,
    solarSummary: () => solarSummary,
    sunOn: () => sunOn,
    usgsUrl: () => usgsUrl
  });
  var SOURCES = {
    census: { name: "U.S. Census Bureau Geocoder", home: "https://geocoding.geo.census.gov/geocoder/" },
    fema: { name: "FEMA National Flood Hazard Layer", home: "https://msc.fema.gov/portal/home" },
    usgs: { name: "USGS Elevation Point Query Service (3DEP)", home: "https://apps.nationalmap.gov/epqs/" },
    sun: { name: "DrawUp sun position (NOAA solar equations)", home: "https://gml.noaa.gov/grad/solcalc/calcdetails.html" }
  };
  var FIELD_GROUPS = [
    { id: "project", label: "Project", fields: [["project_name", "Project name"], ["project_number", "Project number"], ["project_status", "Project status"], ["phase", "Phase"], ["building_type", "Building type"], ["project_description", "Description"]] },
    { id: "site", label: "Site and jurisdiction", fields: [["project_address", "Project address"], ["project_location", "City and state"], ["latitude", "Latitude"], ["longitude", "Longitude"], ["county", "County"], ["municipality", "Municipality"], ["jurisdiction", "Likely permitting jurisdiction"], ["census_tract", "Census tract"], ["parcel_id", "Parcel ID"], ["site_area", "Site area"], ["property_boundary", "Property boundary"]] },
    { id: "zoning", label: "Zoning and land use", fields: [["zoning_district", "Zoning designation"], ["zoning_requirements", "Zoning requirements"], ["setbacks", "Setbacks (front / side / rear)"], ["height_limit", "Height limit"], ["land_use", "Land-use restrictions"], ["parking_requirement", "Parking requirement"]] },
    { id: "environment", label: "Flood, terrain and environment", fields: [["flood_zone", "Flood zone"], ["firm_panel", "FIRM panel"], ["base_flood_elevation", "Base flood elevation"], ["ground_elevation", "Ground elevation"], ["solar_summer", "Sun at noon, June 21"], ["solar_winter", "Sun at noon, December 21"], ["environmental_notes", "Environmental notes"], ["existing_structures", "Existing structures"]] },
    { id: "building", label: "Building", fields: [["occupancy", "Preliminary occupancy classification"], ["construction_type", "Construction type"], ["stories", "Stories"], ["gross_area", "Gross area"], ["sprinklered", "Sprinklered"], ["code_edition", "Building code (adopted edition)"], ["code_references", "Preliminary code references"]] },
    { id: "team", label: "Owner and team", fields: [["owner_name", "Owner"], ["owner_address", "Owner address"], ["architect_name", "Architect"], ["architect_address", "Architect address"], ["pm_name", "Project manager"], ["contractor_name", "Contractor"], ["structural_engineer", "Structural engineer"], ["mep_engineer", "MEP engineer"], ["civil_engineer", "Civil engineer"]] }
  ];
  var FIELD_LABEL = Object.fromEntries(FIELD_GROUPS.flatMap((g) => g.fields.map((f) => [f[0], f[1]])));
  var r6 = (n) => Math.round(n * 1e6) / 1e6;
  var clean = (s, max = 300) => String(s != null ? s : "").replace(/\s+/g, " ").trim().slice(0, max);
  function censusUrl(address) {
    const q = new URLSearchParams({ address, benchmark: "Public_AR_Current", vintage: "Current_Current", layers: "all", format: "json" });
    return `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?${q}`;
  }
  var NFHL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
  function femaZoneUrl(lat, lng) {
    const q = new URLSearchParams({ geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DFIRM_ID", returnGeometry: "false", f: "json" });
    return `${NFHL}/28/query?${q}`;
  }
  function femaPanelUrl(lat, lng) {
    const q = new URLSearchParams({ geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "FIRM_PAN,EFF_DATE,PANEL_TYP", returnGeometry: "false", f: "json" });
    return `${NFHL}/3/query?${q}`;
  }
  function usgsUrl(lat, lng) {
    const q = new URLSearchParams({ x: String(lng), y: String(lat), wkid: "4326", units: "Feet", includeDate: "false" });
    return `https://epqs.nationalmap.gov/v1/json?${q}`;
  }
  var femaViewer = (lat, lng) => `https://msc.fema.gov/portal/search?AddressQuery=${encodeURIComponent(`${r6(lat)},${r6(lng)}`)}`;
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
      matched: clean(m.matchedAddress),
      lat: r6(lat),
      lng: r6(lng),
      state: clean((state == null ? void 0 : state.STUSAB) || comps.state),
      stateName: clean(state == null ? void 0 : state.NAME),
      county: clean(county == null ? void 0 : county.NAME),
      place: clean((place == null ? void 0 : place.BASENAME) || (place == null ? void 0 : place.NAME)),
      placeName: clean((place == null ? void 0 : place.NAME) || (place == null ? void 0 : place.BASENAME)),
      countySub: clean((csub == null ? void 0 : csub.BASENAME) || (csub == null ? void 0 : csub.NAME)),
      tract: clean((tract == null ? void 0 : tract.NAME) || ((tract == null ? void 0 : tract.TRACT) ? `Census Tract ${tract.TRACT}` : "")),
      tractGeoid: clean(tract == null ? void 0 : tract.GEOID),
      city: clean(comps.city),
      zip: clean(comps.zip)
    };
  }
  function parseFemaZone(j) {
    const f = j == null ? void 0 : j.features;
    if (!Array.isArray(f)) return null;
    if (!f.length) return { zone: "", subtype: "", sfha: false, bfe: "", none: true };
    const a = f[0].attributes || {};
    const bfe = Number(a.STATIC_BFE);
    return { zone: clean(a.FLD_ZONE), subtype: clean(a.ZONE_SUBTY), sfha: String(a.SFHA_TF).toUpperCase() === "T", bfe: isFinite(bfe) && bfe > -9e3 ? `${bfe} ft` : "", none: false };
  }
  function parseFemaPanel(j) {
    const f = j == null ? void 0 : j.features;
    if (!Array.isArray(f) || !f.length) return null;
    const a = f[0].attributes || {};
    const eff = a.EFF_DATE ? new Date(Number(a.EFF_DATE)) : null;
    return { panel: clean(a.FIRM_PAN), effective: eff && !isNaN(eff.getTime()) ? eff.toISOString().slice(0, 10) : "" };
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
        sources.push({ id, name, url, ok: false, error: clean((e == null ? void 0 : e.message) || e, 160), ms: Date.now() - t0 });
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
    const { lat, lng } = geo;
    const [zone, panel, elev] = await Promise.all([
      run("fema_zone", SOURCES.fema.name + " (flood zones)", femaZoneUrl(lat, lng), parseFemaZone),
      run("fema_panel", SOURCES.fema.name + " (FIRM panels)", femaPanelUrl(lat, lng), parseFemaPanel),
      run("usgs", SOURCES.usgs.name, usgsUrl(lat, lng), parseUsgs)
    ]);
    const fv = femaViewer(lat, lng), F = SOURCES.fema.name;
    if (zone && !zone.none) {
      put("flood_zone", `Zone ${zone.zone}${zone.subtype ? " (" + zone.subtype.toLowerCase() + ")" : ""}${zone.sfha ? " - Special Flood Hazard Area" : ""}`, F, fv, "medium", "At the geocoded point only; check the whole parcel on the FIRM.");
      if (zone.bfe) put("base_flood_elevation", zone.bfe, F, fv, "medium");
    } else if (zone && zone.none) unavailable.push({ key: "flood_zone", reason: "FEMA returned no mapped flood zone at this point (the area may be unmapped).", next: "Check the FEMA Flood Map Service Center for the parcel." });
    else unavailable.push({ key: "flood_zone", reason: "The FEMA flood service did not answer.", next: "Try again later or check the FEMA Flood Map Service Center." });
    if (panel) put("firm_panel", `${panel.panel}${panel.effective ? ", effective " + panel.effective : ""}`, F, fv, "medium");
    if (elev != null) put("ground_elevation", `${elev} ft (NAVD 88), at the geocoded point`, SOURCES.usgs.name, usgsUrl(lat, lng), "medium", "From 3DEP terrain data; not a survey.");
    else unavailable.push({ key: "ground_elevation", reason: "The USGS elevation service did not answer.", next: "Use a survey or try again later." });
    const sun = solarSummary(lat);
    const su = SOURCES.sun.home;
    put("solar_summer", sun.summer, SOURCES.sun.name, su, "high");
    put("solar_winter", sun.winter, SOURCES.sun.name, su, "high");
    const where = geo.county ? `${geo.county}${geo.stateName ? ", " + geo.stateName : ""}` : "this jurisdiction";
    for (const [key, what] of [["parcel_id", "parcel records"], ["property_boundary", "parcel boundaries"], ["site_area", "parcel area"], ["zoning_district", "zoning"], ["setbacks", "setbacks"], ["height_limit", "height limits"], ["land_use", "land-use restrictions"]])
      unavailable.push({ key, reason: `DrawUp has no connected ${what} source for ${where} yet.`, next: key === "property_boundary" || key === "site_area" ? "Upload a survey or the county GIS parcel report, then enter it." : "Check the zoning ordinance or the city/county GIS, then enter it here." });
    unavailable.push({ key: "code_edition", reason: "The adopted building code edition is not looked up automatically.", next: "Confirm the adopted edition and local amendments with the AHJ (the ICC adoption map is a starting point)." });
    return { fields, site: { lat, lng, boundary: null }, sources, unavailable, at };
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
