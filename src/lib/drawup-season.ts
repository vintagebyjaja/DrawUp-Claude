// DrawUp Season registry (Season 1 restructure).
// Pure code, no imports: the server (/api/features) and the browser (public/drawup-season-core-v30.js, bundled from
// this file with esbuild, global DrawUpSeasonCore) read the same list.
//
// Season 1 = pre-design, concept, schematic design and DD preparation. Season 2 = design development and
// construction documentation. A Season 2 feature is HIDDEN from the Season 1 interface, never removed: its code,
// API routes, tables, stored rows and tests stay in place, and the flag below turns it back on.
//
// Turning Season 2 Details back on:
//   - Cloudflare / .env: DRAWUP_SEASON_2_DETAILS_ENABLED=true (read at request time by /api/features)
//   - development or a preview host: open the portal with ?season2=1 (stored for that browser; ?season2=0 clears it)
//   - production: DrawUp HQ admins get a "Preview Season 2" button on the Details screen (this browser tab only)
// See SEASONS.md at the repo root.

export type Season = 1 | 2;
export type FeatureStatus = 'live' | 'building' | 'planned' | 'hidden';
export type Phase = 'pre-design' | 'concept' | 'schematic' | 'dd-prep' | 'checkup' | 'platform' | 'construction-docs';

export type SeasonFeature = {
  id: string;
  name: string;
  season: Season;
  phase: Phase;
  status: FeatureStatus;           // status in the Season 1 interface
  flag?: keyof SeasonFlags;        // Season 2 features: the flag that turns them back on
  where: string;                   // where a member finds it (or found it)
  code: string[];                  // files that implement it (kept as they are)
  api?: string[];                  // API routes (never deleted)
  tables?: string[];               // Supabase tables (never dropped)
  note?: string;
};

export type SeasonFlags = {
  /** Draw a Detail, Details · 3D, the Details library/table, Visual Detail Intelligence, detail reviews. */
  season2Details: boolean;
};

export const SEASON_ENV = { season2Details: 'DRAWUP_SEASON_2_DETAILS_ENABLED' } as const;
export const DEFAULT_FLAGS: SeasonFlags = { season2Details: false };
export const REGISTRY_VERSION = '30.0';

const truthy = (v: unknown) => /^(1|true|yes|on)$/i.test(String(v ?? '').trim().replace(/^(["'])(.*)\1$/, '$2'));

/** Flags from an environment object (process.env on the server). Missing = Season 1 default (hidden). */
export function flagsFromEnv(env: Record<string, string | undefined>): SeasonFlags {
  return { season2Details: truthy(env[SEASON_ENV.season2Details]) };
}

export const FEATURES: SeasonFeature[] = [
  // ---------------------------------------------------------------- Season 2: preserved, hidden in Season 1
  { id: 'details-library', name: 'Details library and table', season: 2, phase: 'construction-docs', status: 'hidden', flag: 'season2Details',
    where: 'Details tab (shows the Season 2 screen in Season 1)',
    code: ['public/drawup-details-v21.js', 'public/drawup-details-kit-v21.js', 'public/drawup-details-catalog-v21.js', 'public/drawup-details-v21.css'],
    tables: ['details', 'detail_assets', 'detail_finds', 'detail_find_events'],
    note: 'The tab stays in the menu and opens a blurred, non-interactive Details screen. Rows are untouched.' },
  { id: 'draw-a-detail', name: 'Draw a Detail (from a picture)', season: 2, phase: 'construction-docs', status: 'hidden', flag: 'season2Details',
    where: 'Details › Upload one detail; Draw it up › needed details',
    code: ['public/drawup-detail-draw-v25.js', 'public/drawup-detail-draw-v25.css', 'src/lib/drawup-detail-draw.ts'],
    api: ['/api/details/draw'], tables: ['details (source drawup_ai)', 'detail_team_answers'] },
  { id: 'details-3d', name: 'Details · 3D (plan and section details as 3D holograms)', season: 2, phase: 'construction-docs', status: 'hidden', flag: 'season2Details',
    where: 'Draw › Draw a detail in 3D, Draw › My details (#portal/draw?detail=…)',
    code: ['public/drawup-draw-v22.js (detail editor, wire())', 'public/drawup-draw-v22.css'],
    tables: ['draw_details'] },
  { id: 'vdi', name: 'Visual Detail Intelligence (Find the flaws → Understand the fix → DrawUp Ready)', season: 2, phase: 'construction-docs', status: 'hidden', flag: 'season2Details',
    where: 'Details › Visual Detail Intelligence card',
    code: ['public/drawup-vdi-v27.js', 'public/drawup-vdi-view-v27.js', 'public/drawup-vdi-geometry-v27.js', 'public/drawup-vdi-v27.css', 'src/lib/drawup-vdi.ts', 'src/lib/drawup-vdi-geometry.ts'],
    api: ['/api/vdi'], tables: ['vdi_reviews', 'vdi_manufacturer_sources', 'vdi_manufacturer_refs', 'vdi_code_adoptions'] },
  { id: 'detail-reviews', name: 'Detail reviews, comments and architect verification', season: 2, phase: 'construction-docs', status: 'hidden', flag: 'season2Details',
    where: 'Details › Reviews + comments',
    code: ['public/drawup-detail-reviews-v24.js', 'public/drawup-detail-reviews-v24.css'],
    tables: ['detail_comments', 'detail_verifications', 'architect_credentials'] },
  { id: 'firm-details', name: 'Firm Details library', season: 2, phase: 'construction-docs', status: 'hidden', flag: 'season2Details',
    where: 'Details › Firm; Firm menu › Firm Details library', code: ['public/drawup-details-v21.js'], tables: ['details (firm_id)'] },

  // ---------------------------------------------------------------- Season 1: Phase A, pre-design
  { id: 'project-brief', name: 'Project intake and brief', season: 1, phase: 'pre-design', status: 'live', where: 'Projects › Start a new project', code: ['public/drawup-portal-v17.js', 'public/drawup-project-studio-v22.js'], tables: ['project_threads'] },
  { id: 'project-info', name: 'Project Information and site data (with sources)', season: 1, phase: 'pre-design', status: 'live', where: 'Projects › Project Information', code: ['public/drawup-project-intel-v30.js', 'src/lib/drawup-project-intel.ts'], api: ['/api/project-intel'], tables: ['project_profiles', 'project_profile_changes'] },
  { id: 'project-map', name: 'Project map', season: 1, phase: 'pre-design', status: 'live', where: 'Firm › DrawUp Specs › Map', code: ['public/drawup-specs-v29.js'], tables: ['project_threads', 'firm_project_info'] },
  { id: 'site-photos', name: 'Existing conditions and site photos', season: 1, phase: 'pre-design', status: 'live', where: 'Projects › project › files; AI Team attachments', code: ['public/drawup-project-studio-v22.js'] },

  // ---------------------------------------------------------------- Phase B, concept
  { id: 'photo-to-plan', name: 'Photo → Plan (Draw Workspace 2.0)', season: 1, phase: 'concept', status: 'live', where: 'Draw › Start from a picture', code: ['public/drawup-draw-ws-v29.js', 'public/drawup-draw-trace-v29.js', 'src/lib/drawup-draw-ws.ts'], api: ['/api/draw/workspace'], tables: ['drawing_versions', 'draw_components'] },
  { id: 'ai-brainstorm', name: 'AI-assisted design brainstorming', season: 1, phase: 'concept', status: 'live', where: 'AI Team', code: ['public/drawup-team-v25.js', 'src/lib/drawup-team.ts'], api: ['/api/team/chat'] },
  { id: 'swap', name: 'Material and visualization studies', season: 1, phase: 'concept', status: 'live', where: 'Swap', code: ['public/drawup-swap-v21.js'], api: ['/api/swap'] },

  // ---------------------------------------------------------------- Phase C, schematic design
  { id: 'draw-plans', name: 'Editable floor plans, walls, doors and windows', season: 1, phase: 'schematic', status: 'live', where: 'Draw › Design Workspace', code: ['public/drawup-draw-v21.js', 'public/drawup-draw-core-v18.js', 'public/drawup-draw-v22.js (shapes)'] },
  { id: 'draw-3d', name: '3D massing and model view', season: 1, phase: 'schematic', status: 'live', where: 'Draw › plan › 3D', code: ['public/drawup-draw-3d-v29.js'] },
  { id: 'elevations-sections', name: 'Elevation and section previews', season: 1, phase: 'schematic', status: 'live', where: 'Draw › plan › Elevations', code: ['public/drawup-draw-elev-v21.js'] },
  { id: 'draw-it-up', name: 'Draw it up (picture → schematic drawing set)', season: 1, phase: 'schematic', status: 'live', where: 'Draw › Drawing Generation', code: ['public/drawup-drawit-v24.js', 'public/drawup-drawit-sheets-v24.js'], api: ['/api/drawings/generate'], tables: ['drawing_generations'] },

  // ---------------------------------------------------------------- Phase D, DD preparation
  { id: 'specs', name: 'DrawUp Specs (outline and preliminary specifications, project documents)', season: 1, phase: 'dd-prep', status: 'live', where: 'Firm › DrawUp Specs', code: ['public/drawup-specs-v29.js', 'public/drawup-specs-data-v29.js', 'public/drawup-specs-export-v29.js'], tables: ['firm_documents', 'firm_spec_formats', 'firm_project_info'] },
  { id: 'presentations', name: 'Presentation builder', season: 1, phase: 'dd-prep', status: 'live', where: 'Firm › GM Presentation', code: ['public/drawup-playbook-v21.js', 'public/drawup-firmkit-v22.js'] },
  { id: 'dd-readiness', name: 'DD Readiness review and handoff', season: 1, phase: 'dd-prep', status: 'live', where: 'CheckUp › DD Readiness', code: ['public/drawup-checkup-v30.js'], tables: ['spec_reviews'] },
  { id: 'documents', name: 'Document Studio (letters, reports, CA/CM/QA-QC/PM documents, versions, imports)', season: 1, phase: 'dd-prep', status: 'live', where: 'Projects › Documents', code: ['public/drawup-docstudio-v30.js'], tables: ['project_documents', 'document_versions', 'document_imports'] },
  { id: 'spec-ai', name: 'AI specification drafting (preliminary sections, reviewed before they are added)', season: 1, phase: 'dd-prep', status: 'live', where: 'Specifications › Draft with AI', code: ['public/drawup-specs-ai-v30.js', 'src/lib/drawup-spec-draft.ts'], api: ['/api/specs/draft'] },
  { id: 'pm-tracker', name: 'Project tracker (RFIs, submittals, change orders, punch lists, QA/QC)', season: 1, phase: 'dd-prep', status: 'live', where: 'Projects › Project Management', code: ['public/drawup-pm-tracker-v30.js'], tables: ['project_documents'] },

  // ---------------------------------------------------------------- CheckUp
  { id: 'checkup', name: 'CheckUp: code, ADA, life safety, drawing review, narratives', season: 1, phase: 'checkup', status: 'live', where: 'CheckUp', code: ['public/drawup-check-v22.js', 'public/drawup-check-quick-v23.js', 'src/lib/drawup-check-core.ts'], api: ['/api/check', '/api/check/quick'], tables: ['check_reviews'] },
  { id: 'portfolio-review', name: 'Portfolio Review', season: 1, phase: 'checkup', status: 'live', where: 'CheckUp › Portfolio Review; Discover › Portfolio Review', code: ['public/drawup-portfolio-review-s1.js', 'public/drawup-portfolio-sources-v30.js', 'src/lib/drawup-portfolio.ts'], api: ['/api/portfolio'], tables: ['portfolio_reviews'] },
  { id: 'specs-review', name: 'Specifications Review', season: 1, phase: 'checkup', status: 'live', where: 'CheckUp › Specifications Review', code: ['public/drawup-checkup-v30.js'], tables: ['spec_reviews'] },
];

export const season2Features = () => FEATURES.filter(f => f.season === 2);
export const season1Features = () => FEATURES.filter(f => f.season === 1);

/** Is a registry feature usable with these flags? Season 1 features always are (unless still building). */
export function isOn(id: string, flags: SeasonFlags): boolean {
  const f = FEATURES.find(x => x.id === id);
  if (!f) return true;
  if (f.season === 2) return !!(f.flag && flags[f.flag]);
  return f.status !== 'planned';
}
