import { NextResponse } from 'next/server';
import {
  PRIVATE_BUCKET, adminSelectOne, adminUpdate, bytesToBase64, creditMessage, missingConfig, models,
  openaiCreate, openaiGet, outputText, pathIsOwn, refundCredits, reserveCredits, signedInUser, sourcesFrom,
  storageDownload, type CreditAccess,
} from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DrawUp Check: a member uploads a PDF drawing set to their private folder and creates a
// check_reviews row (RLS). POST starts the review: credits are reserved, the PDF is sent
// to the AI as a background job, and the row moves to "reviewing". GET polls the job and,
// when it finishes, saves the findings to the row (or refunds and marks it failed).
// Background mode keeps every request short, so hosting function time limits don't apply.

const MAX_BYTES = 32 * 1024 * 1024;
const CATEGORIES = ['code', 'accessibility', 'life_safety', 'coordination', 'dimensions', 'documentation', 'structural', 'mep', 'site'];

const SCHEMA = {
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
        required: ['category', 'severity', 'sheet', 'location', 'issue', 'recommendation', 'reference', 'confidence'],
        properties: {
          category: { type: 'string', enum: CATEGORIES },
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'info'] },
          sheet: { type: 'string' },
          location: { type: 'string' },
          issue: { type: 'string' },
          recommendation: { type: 'string' },
          reference: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    limitations: { type: 'string' },
  },
};

function countPdfPages(bytes: ArrayBuffer) {
  const text = Buffer.from(bytes).toString('latin1');
  return (text.match(/\/Type\s*\/Page(?!s)/g) || []).length || null;
}

function priceFor(pages: number | null) {
  return pages && pages > 10 ? { action: 'large_document_analysis', cost: 150 } : { action: 'plan_analysis', cost: 30 };
}

const INSTRUCTIONS = `You are DrawUp Check, a plan reviewer for architecture, engineering and construction drawing sets.
Review ONLY the attached PDF. Every finding must point to something you can actually see in it: give the sheet number/title and where on the sheet.
Never invent sheets, rooms, dimensions or notes that are not in the file. If the set is too incomplete to judge an item, say so in limitations instead of guessing.
Review for: building code (use the jurisdiction and adopted code edition when given; otherwise state the model code you assumed), accessibility (2010 ADA Standards / ICC A117.1), life safety and egress, coordination between plans/sections/elevations/schedules, dimension strings that do not add up or are missing, documentation completeness (title block, scale, north arrow, sheet index, references), and obvious structural/MEP/site coordination gaps.
Cite the specific code section in "reference" only when you are confident of it; otherwise write the topic (for example "IBC egress width — verify section for adopted edition").
Severity: critical = life-safety or likely permit rejection; major = must be fixed before issue; minor = drafting/quality; info = note for the designer.
This is guidance for the design team, not a permit approval. Return JSON only, matching the schema.`;

async function loadOwned(id: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = await adminSelectOne<any>('check_reviews', `id=eq.${id}&select=*`);
  return row && row.owner_id === userId ? row : null;
}

export async function POST(request: Request) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to use DrawUp Check.' }, { status: 401 });
  const notReady = missingConfig();
  if (notReady) return NextResponse.json({ error: 'DrawUp Check is not connected yet: ' + notReady }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const review = await loadOwned(String(body?.review_id || ''), user.id);
  if (!review) return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
  if (review.status !== 'queued') return NextResponse.json({ review });
  if (!pathIsOwn(review.file_path, user.id)) return NextResponse.json({ error: 'That file is not yours.' }, { status: 403 });

  let file;
  try { file = await storageDownload(PRIVATE_BUCKET, review.file_path); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  const head = Buffer.from(file.bytes.slice(0, 5)).toString('latin1');
  if (head !== '%PDF-') {
    await adminUpdate('check_reviews', review.id, { status: 'failed', error: 'The uploaded file is not a PDF.', completed_at: new Date().toISOString() });
    return NextResponse.json({ error: 'The uploaded file is not a PDF.' }, { status: 400 });
  }
  if (file.bytes.byteLength > MAX_BYTES) return NextResponse.json({ error: 'PDF is larger than 32 MB. Split the set and check it in parts.' }, { status: 400 });

  const pages = countPdfPages(file.bytes);
  const { action, cost } = priceFor(pages);
  // Claim the row first so a double click can never start (or charge) two reviews.
  const claimed = await adminUpdate('check_reviews', review.id, { status: 'reviewing', started_at: new Date().toISOString() }, 'status=eq.queued');
  if (!claimed) return NextResponse.json({ review: await loadOwned(review.id, user.id) });
  const access: CreditAccess = await reserveCredits(user, cost, 'check_' + action);
  if (!access.ok) {
    await adminUpdate('check_reviews', review.id, { status: 'queued', started_at: null });
    return NextResponse.json({ error: creditMessage(access, cost), ...access }, { status: 402 });
  }

  const context = [
    `Project title: ${review.title || 'not given'}`,
    `Jurisdiction: ${review.jurisdiction || 'not given — state the model code you assumed'}`,
    `Building / occupancy type: ${review.building_type || 'not given'}`,
    `Review focus: ${(review.focus || CATEGORIES).join(', ')}`,
  ].join('\n');

  try {
    const { data, model } = await openaiCreate({
      instructions: INSTRUCTIONS,
      input: [{ role: 'user', content: [
        { type: 'input_file', filename: review.file_name || 'drawings.pdf', file_data: 'data:application/pdf;base64,' + bytesToBase64(file.bytes) },
        { type: 'input_text', text: context },
      ] }],
      tools: review.jurisdiction ? [{ type: 'web_search' }] : [],
      text: { format: { type: 'json_schema', name: 'drawup_check_report', strict: true, schema: SCHEMA } },
      background: true,
      store: true,
    }, models(process.env.DRAWUP_CHECK_MODEL, process.env.DRAWUP_COACH_MODEL));
    const updated = await adminUpdate('check_reviews', review.id, {
      response_id: data.id, model, page_count: pages, credits_charged: access.credits_charged ?? 0,
      credit_access: access, error: null,
    });
    return NextResponse.json({ review: updated, credits_charged: access.credits_charged ?? 0, credits_remaining: access.credits_remaining ?? null });
  } catch (e: any) {
    await refundCredits(user.id, access, 'check_' + action);
    await adminUpdate('check_reviews', review.id, { status: 'failed', error: (e.message || 'Review could not start.') + ' You were not charged.', completed_at: new Date().toISOString() });
    return NextResponse.json({ error: (e.message || 'Review could not start.') + ' You were not charged.' }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to use DrawUp Check.' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') || '';
  const review = await loadOwned(id, user.id);
  if (!review) return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
  if (review.status !== 'reviewing' || !review.response_id) return NextResponse.json({ review });

  let data: any;
  try { data = await openaiGet(review.response_id); }
  catch (e: any) { return NextResponse.json({ review, warning: e.message }); }
  if (data.status === 'queued' || data.status === 'in_progress') return NextResponse.json({ review });

  const fail = async (message: string) => {
    const r = await adminUpdate('check_reviews', review.id, { status: 'failed', error: message + ' Your credits were refunded.', completed_at: new Date().toISOString() }, 'status=eq.reviewing');
    if (r) await refundCredits(user.id, review.credit_access, 'check_refund');
    return NextResponse.json({ review: r || await loadOwned(review.id, user.id) });
  };
  if (data.status !== 'completed') return fail(data?.error?.message || `The review ${data.status || 'failed'}.`);

  let report: any;
  try { report = JSON.parse(outputText(data)); } catch { return fail('The review came back unreadable.'); }
  const findings = (Array.isArray(report?.findings) ? report.findings : [])
    .filter((f: any) => f && typeof f.issue === 'string' && f.issue.trim())
    .map((f: any) => ({
      category: CATEGORIES.includes(f.category) ? f.category : 'documentation',
      severity: ['critical', 'major', 'minor', 'info'].includes(f.severity) ? f.severity : 'info',
      sheet: String(f.sheet || ''), location: String(f.location || ''), issue: String(f.issue),
      recommendation: String(f.recommendation || ''), reference: String(f.reference || ''),
      confidence: ['high', 'medium', 'low'].includes(f.confidence) ? f.confidence : 'medium',
    }));
  const r = await adminUpdate('check_reviews', review.id, {
    status: 'complete',
    summary: [String(report?.summary || ''), report?.code_basis ? `Code basis: ${report.code_basis}` : '', report?.limitations ? `Limits of this review: ${report.limitations}` : ''].filter(Boolean).join('\n\n'),
    findings,
    sources: sourcesFrom(data),
    page_count: Number.isInteger(report?.page_count) && report.page_count > 0 ? report.page_count : review.page_count,
    completed_at: new Date().toISOString(),
  }, 'status=eq.reviewing');
  return NextResponse.json({ review: r || await loadOwned(review.id, user.id) });
}
