/* GENERATED from src/lib/drawup-season.ts (esbuild --format=iife --global-name=DrawUpSeasonCore). Do not edit; rebuild. */
"use strict";
var DrawUpSeasonCore = (() => {
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

  // src/lib/drawup-season.ts
  var drawup_season_exports = {};
  __export(drawup_season_exports, {
    DEFAULT_FLAGS: () => DEFAULT_FLAGS,
    FEATURES: () => FEATURES,
    REGISTRY_VERSION: () => REGISTRY_VERSION,
    SEASON_ENV: () => SEASON_ENV,
    flagsFromEnv: () => flagsFromEnv,
    isOn: () => isOn,
    season1Features: () => season1Features,
    season2Features: () => season2Features
  });
  var SEASON_ENV = { season2Details: "DRAWUP_SEASON_2_DETAILS_ENABLED" };
  var DEFAULT_FLAGS = { season2Details: false };
  var REGISTRY_VERSION = "30.0";
  var truthy = (v) => /^(1|true|yes|on)$/i.test(String(v != null ? v : "").trim().replace(/^(["'])(.*)\1$/, "$2"));
  function flagsFromEnv(env) {
    return { season2Details: truthy(env[SEASON_ENV.season2Details]) };
  }
  var FEATURES = [
    // ---------------------------------------------------------------- Season 2: preserved, hidden in Season 1
    {
      id: "details-library",
      name: "Details library and table",
      season: 2,
      phase: "construction-docs",
      status: "hidden",
      flag: "season2Details",
      where: "Details tab (shows the Season 2 screen in Season 1)",
      code: ["public/drawup-details-v21.js", "public/drawup-details-kit-v21.js", "public/drawup-details-catalog-v21.js", "public/drawup-details-v21.css"],
      tables: ["details", "detail_assets", "detail_finds", "detail_find_events"],
      note: "The tab stays in the menu and opens a blurred, non-interactive Details screen. Rows are untouched."
    },
    {
      id: "draw-a-detail",
      name: "Draw a Detail (from a picture)",
      season: 2,
      phase: "construction-docs",
      status: "hidden",
      flag: "season2Details",
      where: "Details \u203A Upload one detail; Draw it up \u203A needed details",
      code: ["public/drawup-detail-draw-v25.js", "public/drawup-detail-draw-v25.css", "src/lib/drawup-detail-draw.ts"],
      api: ["/api/details/draw"],
      tables: ["details (source drawup_ai)", "detail_team_answers"]
    },
    {
      id: "details-3d",
      name: "Details \xB7 3D (plan and section details as 3D holograms)",
      season: 2,
      phase: "construction-docs",
      status: "hidden",
      flag: "season2Details",
      where: "Draw \u203A Draw a detail in 3D, Draw \u203A My details (#portal/draw?detail=\u2026)",
      code: ["public/drawup-draw-v22.js (detail editor, wire())", "public/drawup-draw-v22.css"],
      tables: ["draw_details"]
    },
    {
      id: "vdi",
      name: "Visual Detail Intelligence (Find the flaws \u2192 Understand the fix \u2192 DrawUp Ready)",
      season: 2,
      phase: "construction-docs",
      status: "hidden",
      flag: "season2Details",
      where: "Details \u203A Visual Detail Intelligence card",
      code: ["public/drawup-vdi-v27.js", "public/drawup-vdi-view-v27.js", "public/drawup-vdi-geometry-v27.js", "public/drawup-vdi-v27.css", "src/lib/drawup-vdi.ts", "src/lib/drawup-vdi-geometry.ts"],
      api: ["/api/vdi"],
      tables: ["vdi_reviews", "vdi_manufacturer_sources", "vdi_manufacturer_refs", "vdi_code_adoptions"]
    },
    {
      id: "detail-reviews",
      name: "Detail reviews, comments and architect verification",
      season: 2,
      phase: "construction-docs",
      status: "hidden",
      flag: "season2Details",
      where: "Details \u203A Reviews + comments",
      code: ["public/drawup-detail-reviews-v24.js", "public/drawup-detail-reviews-v24.css"],
      tables: ["detail_comments", "detail_verifications", "architect_credentials"]
    },
    {
      id: "firm-details",
      name: "Firm Details library",
      season: 2,
      phase: "construction-docs",
      status: "hidden",
      flag: "season2Details",
      where: "Details \u203A Firm; Firm menu \u203A Firm Details library",
      code: ["public/drawup-details-v21.js"],
      tables: ["details (firm_id)"]
    },
    // ---------------------------------------------------------------- Season 1: Phase A, pre-design
    { id: "project-brief", name: "Project intake and brief", season: 1, phase: "pre-design", status: "live", where: "Projects \u203A Start a new project", code: ["public/drawup-portal-v17.js", "public/drawup-project-studio-v22.js"], tables: ["project_threads"] },
    { id: "project-info", name: "Project Information and site data (with sources)", season: 1, phase: "pre-design", status: "building", where: "Projects \u203A Project Information", code: [], note: "Season 1 restructure, stage 2." },
    { id: "project-map", name: "Project map", season: 1, phase: "pre-design", status: "live", where: "Firm \u203A DrawUp Specs \u203A Map", code: ["public/drawup-specs-v29.js"], tables: ["project_threads", "firm_project_info"] },
    { id: "site-photos", name: "Existing conditions and site photos", season: 1, phase: "pre-design", status: "live", where: "Projects \u203A project \u203A files; AI Team attachments", code: ["public/drawup-project-studio-v22.js"] },
    // ---------------------------------------------------------------- Phase B, concept
    { id: "photo-to-plan", name: "Photo \u2192 Plan (Draw Workspace 2.0)", season: 1, phase: "concept", status: "live", where: "Draw \u203A Start from a picture", code: ["public/drawup-draw-ws-v29.js", "public/drawup-draw-trace-v29.js", "src/lib/drawup-draw-ws.ts"], api: ["/api/draw/workspace"], tables: ["drawing_versions", "draw_components"] },
    { id: "ai-brainstorm", name: "AI-assisted design brainstorming", season: 1, phase: "concept", status: "live", where: "AI Team", code: ["public/drawup-team-v25.js", "src/lib/drawup-team.ts"], api: ["/api/team/chat"] },
    { id: "swap", name: "Material and visualization studies", season: 1, phase: "concept", status: "live", where: "Swap", code: ["public/drawup-swap-v21.js"], api: ["/api/swap"] },
    // ---------------------------------------------------------------- Phase C, schematic design
    { id: "draw-plans", name: "Editable floor plans, walls, doors and windows", season: 1, phase: "schematic", status: "live", where: "Draw \u203A Design Workspace", code: ["public/drawup-draw-v21.js", "public/drawup-draw-core-v18.js", "public/drawup-draw-v22.js (shapes)"] },
    { id: "draw-3d", name: "3D massing and model view", season: 1, phase: "schematic", status: "live", where: "Draw \u203A plan \u203A 3D", code: ["public/drawup-draw-3d-v29.js"] },
    { id: "elevations-sections", name: "Elevation and section previews", season: 1, phase: "schematic", status: "live", where: "Draw \u203A plan \u203A Elevations", code: ["public/drawup-draw-elev-v21.js"] },
    { id: "draw-it-up", name: "Draw it up (picture \u2192 schematic drawing set)", season: 1, phase: "schematic", status: "live", where: "Draw \u203A Drawing Generation", code: ["public/drawup-drawit-v24.js", "public/drawup-drawit-sheets-v24.js"], api: ["/api/drawings/generate"], tables: ["drawing_generations"] },
    // ---------------------------------------------------------------- Phase D, DD preparation
    { id: "specs", name: "DrawUp Specs (outline and preliminary specifications, project documents)", season: 1, phase: "dd-prep", status: "live", where: "Firm \u203A DrawUp Specs", code: ["public/drawup-specs-v29.js", "public/drawup-specs-data-v29.js", "public/drawup-specs-export-v29.js"], tables: ["firm_documents", "firm_spec_formats", "firm_project_info"] },
    { id: "presentations", name: "Presentation builder", season: 1, phase: "dd-prep", status: "live", where: "Firm \u203A GM Presentation", code: ["public/drawup-playbook-v21.js", "public/drawup-firmkit-v22.js"] },
    { id: "dd-readiness", name: "DD Readiness review and handoff", season: 1, phase: "dd-prep", status: "building", where: "CheckUp \u203A DD Readiness", code: [], note: "Season 1 restructure, stage 4." },
    // ---------------------------------------------------------------- CheckUp
    { id: "checkup", name: "CheckUp: code, ADA, life safety, drawing review, narratives", season: 1, phase: "checkup", status: "live", where: "CheckUp", code: ["public/drawup-check-v22.js", "public/drawup-check-quick-v23.js", "src/lib/drawup-check-core.ts"], api: ["/api/check", "/api/check/quick"], tables: ["check_reviews"] },
    { id: "portfolio-review", name: "Portfolio Review", season: 1, phase: "checkup", status: "live", where: "CheckUp \u203A Portfolio Review; Discover \u203A Portfolio Review", code: ["public/drawup-portfolio-review-s1.js", "src/lib/drawup-portfolio.ts"], api: ["/api/portfolio"], tables: ["portfolio_reviews"] },
    { id: "specs-review", name: "Specifications Review", season: 1, phase: "checkup", status: "building", where: "CheckUp \u203A Specifications Review", code: [], note: "Season 1 restructure, stage 4." }
  ];
  var season2Features = () => FEATURES.filter((f) => f.season === 2);
  var season1Features = () => FEATURES.filter((f) => f.season === 1);
  function isOn(id, flags) {
    const f = FEATURES.find((x) => x.id === id);
    if (!f) return true;
    if (f.season === 2) return !!(f.flag && flags[f.flag]);
    return f.status !== "planned";
  }
  return __toCommonJS(drawup_season_exports);
})();
