// DrawUp Check shared pieces: the drawing-set schema and reviewer brief, and the parsers that turn the
// model's JSON (complete or cut off) into saved findings. Used by /api/check (background reviews) and
// /api/check/quick (V23 quick check, streamed straight to the page). Server-only.

export const CATEGORIES = ['code', 'accessibility', 'life_safety', 'coordination', 'dimensions', 'documentation', 'structural', 'mep', 'site'];
export const BOX = {
  type: 'object', additionalProperties: false, required: ['x', 'y', 'w', 'h'],
  properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
};
export const FIX = {
  type: 'object', additionalProperties: false, required: ['type', 'symbol', 'label', 'lines', 'box'],
  properties: {
    type: { type: 'string', enum: ['dimension', 'tag', 'note', 'code_summary', 'table', 'none'] },
    symbol: { type: 'string', enum: ['door', 'window', 'wall', 'room', 'keynote', 'none'] },
    label: { type: 'string' },
    lines: { type: 'array', items: { type: 'string' } },
    box: BOX,
  },
};

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'page_count', 'sheets_reviewed', 'code_basis', 'findings', 'limitations'],
  properties: {
    summary: { type: 'string' },
    page_count: { type: 'integer' },
    sheets_reviewed: { type: 'array', items: { type: 'string' } },
    code_basis: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'severity', 'sheet', 'page', 'box', 'anchors', 'location', 'issue', 'recommendation', 'fix', 'reference', 'confidence'],
        properties: {
          category: { type: 'string', enum: CATEGORIES },
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'info'] },
          sheet: { type: 'string' },
          page: { type: 'integer' },
          box: BOX,
          anchors: { type: 'array', items: { type: 'string' } },
          location: { type: 'string' },
          issue: { type: 'string' },
          recommendation: { type: 'string' },
          fix: FIX,
          reference: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    limitations: { type: 'string' },
  },
};
export const clamp01 = (n: number) => Math.max(0, Math.min(0.98, n));
export const INSTRUCTIONS = `You are DrawUp Check, a plan reviewer for architecture, engineering and construction drawing sets.
Review ONLY the attached PDF. Every finding must point to something you can actually see in it: give the sheet number/title and where on the sheet.
Never invent sheets, rooms, dimensions or notes that are not in the file. If the set is too incomplete to judge an item, say so in limitations instead of guessing.
Review for: building code (use the jurisdiction and adopted code edition when given; otherwise state the model code you assumed), accessibility (2010 ADA Standards / ICC A117.1), life safety and egress, coordination between plans/sections/elevations/schedules, dimension strings that do not add up or are missing, documentation completeness (title block, scale, north arrow, sheet index, references), and obvious structural/MEP/site coordination gaps.
Cite the specific code section in "reference" only when you are confident of it; otherwise write the topic (for example "IBC egress width — verify section for adopted edition").
Severity: critical = life-safety or likely permit rejection; major = must be fixed before issue; minor = drafting/quality; info = note for the designer.
For every finding also give "page" (the 1-based page number of the PDF where it is) and "box": the region on that page as fractions of the page width and height measured from the TOP-LEFT corner (x, y, w, h each between 0 and 1). The box is used to draw a redline cloud on the sheet, so cover the whole area concerned, a little generously. For a sheet-wide issue (title block, missing note) use the area you would mark up by hand.
"sheet" is the sheet number exactly as printed in the title block (for example A101). If one issue repeats on several sheets, give the first sheet where it occurs and list the others in "location".
"anchors": up to 4 short text strings printed on that sheet right at the issue (room name, door or wall tag, grid label, keynote, note heading), copied EXACTLY as printed. DrawUp finds them in the PDF text layer to place the cloud precisely, so never paraphrase them and never list text that is not on the sheet.
Write "recommendation" as the specific change to make on the drawing (for example: Add 32 in. minimum clear width dimension at Door 101).
"fix" describes how that part of THIS sheet should look once corrected, so DrawUp can draw it on top of the original sheet in drafting style. Never redesign the building or invent a different layout. type: "dimension" (label = the dimension text, for example 3'-0" CLR MIN.), "tag" (symbol = door/window/wall/room/keynote; label = the tag text), "note" (lines = note text in drafting capitals), "code_summary" (lines = "LABEL: value" rows), "table" (lines = rows with cells separated by |), or "none". Use only values that are shown in the set or are the code minimum you cite; for anything the set does not establish write NEEDS CONFIRMATION instead of a value. "fix.box" is where to draw it on the same page (same fractions as box): an empty area next to the issue for notes and tables, the dimensioned span for dimensions.
A TEXT LAYER may follow: the text printed on each page, extracted from the PDF by DrawUp. Use it to confirm page numbers and copy anchors exactly.
This is guidance for the design team, not a permit approval. Return JSON only, matching the schema.`;
/* ---------------------------------------------------------------- partial output (V22) */
/** Complete objects already written inside the JSON array `key`, even when the text is cut off. */
function arrayObjects(text: string, key: string): any[] {
  const k = text.indexOf('"' + key + '"');
  if (k < 0) return [];
  let i = text.indexOf('[', k);
  if (i < 0) return [];
  const out: any[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (i = i + 1; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0 && start >= 0) { try { out.push(JSON.parse(text.slice(start, i + 1))); } catch {} start = -1; } }
    else if (ch === ']' && depth === 0) break;
  }
  return out;
}
function stringField(text: string, key: string) {
  const m = text.match(new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
  try { return m ? JSON.parse('"' + m[1] + '"') : ''; } catch { return ''; }
}
/** Parses the model's JSON; when it was cut off, keeps every complete item that arrived. */
export function parseReport(text: string, arrays: string[], strings: string[]): { report: any; partial: boolean } | null {
  try { const r = JSON.parse(text); if (r && typeof r === 'object') return { report: r, partial: false }; } catch {}
  if (!text || !text.trim().startsWith('{')) return null;
  const r: any = {};
  arrays.forEach(k => { r[k] = arrayObjects(text, k); });
  strings.forEach(k => { r[k] = stringField(text, k); });
  return { report: r, partial: true };
}

/* ---------------------------------------------------------------- normalizers */
export const goodBox = (b: any) => b && [b.x, b.y, b.w, b.h].every((n: any) => typeof n === 'number' && isFinite(n)) && b.w > 0 && b.h > 0
  ? { x: clamp01(b.x), y: clamp01(b.y), w: Math.max(0.02, Math.min(1, b.w)), h: Math.max(0.02, Math.min(1, b.h)) } : null;
export const strs = (a: any, n = 8) => (Array.isArray(a) ? a : []).filter((s: any) => typeof s === 'string' && s.trim()).map((s: string) => s.trim().slice(0, 240)).slice(0, n);
function normFix(x: any) {
  if (!x || typeof x !== 'object') return null;
  const type = ['dimension', 'tag', 'note', 'code_summary', 'table'].includes(x.type) ? x.type : null;
  if (!type) return null;
  return { type, symbol: ['door', 'window', 'wall', 'room', 'keynote'].includes(x.symbol) ? x.symbol : 'none', label: String(x.label || '').slice(0, 120), lines: strs(x.lines, 14), box: goodBox(x.box) };
}
export function normFindings(list: any): any[] {
  return (Array.isArray(list) ? list : [])
    .filter((f: any) => f && typeof f.issue === 'string' && f.issue.trim())
    .map((f: any) => ({
      category: CATEGORIES.includes(f.category) ? f.category : 'documentation',
      severity: ['critical', 'major', 'minor', 'info'].includes(f.severity) ? f.severity : 'info',
      sheet: String(f.sheet || ''), location: String(f.location || ''), issue: String(f.issue),
      page: Number.isInteger(f.page) && f.page > 0 ? f.page : null,
      box: goodBox(f.box),
      anchors: strs(f.anchors, 4),
      recommendation: String(f.recommendation || ''), reference: String(f.reference || ''),
      ...(typeof f.why === 'string' && f.why.trim() ? { why: f.why.trim().slice(0, 1200) } : {}),
      fix: normFix(f.fix),
      confidence: ['high', 'medium', 'low'].includes(f.confidence) ? f.confidence : 'medium',
    }));
}

/* ---------------------------------------------------------------- V23 quick check */
// Same finding shape as SCHEMA plus "why" (plain-language explanation), with findings FIRST so the
// first issue streams to the page within seconds instead of after the summary.
export const QUICK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings', 'sheets_reviewed', 'summary', 'code_basis', 'limitations'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'category', 'sheet', 'page', 'issue', 'why', 'recommendation', 'box', 'anchors', 'location', 'fix', 'reference', 'confidence'],
        properties: {
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'info'] },
          category: { type: 'string', enum: CATEGORIES },
          sheet: { type: 'string' },
          page: { type: 'integer' },
          issue: { type: 'string' },
          why: { type: 'string' },
          recommendation: { type: 'string' },
          box: BOX,
          anchors: { type: 'array', items: { type: 'string' } },
          location: { type: 'string' },
          fix: FIX,
          reference: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    sheets_reviewed: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    code_basis: { type: 'string' },
    limitations: { type: 'string' },
  },
};

export const QUICK_INSTRUCTIONS = `You are DrawUp Check doing a QUICK review of the drawing pages attached as images (an uploaded image, PNG, or PDF set rendered page by page). Speed matters: start writing findings right away, most important first.
Each page is attached as one full-page image ("PAGE n") and, for small sets, close-up quarters of that page ("PAGE n, top-left quarter" and so on) so small text can be read. Boxes and positions are always fractions of the FULL page.
Review ONLY what is shown. Every finding must point to something visible: give the sheet number exactly as printed in the title block (or "Page n" when there is no title block) and where on the sheet. Never invent sheets, rooms, dimensions or notes. If something cannot be judged from the image, say so in limitations.
Look for: building code issues (use the jurisdiction when given; otherwise state the model code you assumed), accessibility (2010 ADA Standards / ICC A117.1), life safety and egress, coordination between views, dimension strings that are missing or do not add up, documentation completeness (title block, scale, north arrow, sheet references, keynotes), and obvious structural/MEP/site gaps.
For each finding: "issue" = what is wrong, one sentence. "why" = a plain-language explanation for a student or junior designer of why it matters and what the code or standard practice expects (2 to 3 sentences). "recommendation" = the specific change to make on the drawing.
"page" is the 1-based page number. "box" is the region on that page as fractions of page width and height from the TOP-LEFT (x, y, w, h each 0 to 1), a little generous, used to draw a redline cloud. "anchors": up to 4 short text strings printed right at the issue, copied EXACTLY as printed (room names, tags, grid labels), or [] if none can be read.
"fix" describes how that part of THIS sheet should look once corrected, drawn in drafting style next to the issue: type "dimension" (label = the dimension text), "tag" (symbol + label), "note" (lines in drafting capitals), "code_summary" (lines "LABEL: value"), "table" (rows with cells separated by |), or "none". Never redesign the building. For any value the drawing does not establish write NEEDS CONFIRMATION. "fix.box" = an empty area next to the issue on the same page (same fractions).
Cite a code section in "reference" only when confident; otherwise name the topic and say to verify the adopted edition.
Severity: critical = life-safety or likely permit rejection; major = must fix before issue; minor = drafting quality; info = note.
Keep it focused: at most 15 findings, the most important ones. This is guidance for the design team, not a permit approval. Return JSON only, matching the schema.`;
