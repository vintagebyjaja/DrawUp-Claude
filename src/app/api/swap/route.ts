import { NextResponse } from 'next/server';
import {
  PRIVATE_BUCKET, adminRest, adminSelectOne, adminUpdate, bytesToBase64, creditMessage, missingConfig, models,
  openaiCancel, openaiCreate, openaiGet, pathIsOwn, refundOnce, reserveCredits, signedInUser, storageDownload,
  storageUpload, type CreditAccess,
} from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DrawUp Swap (V20 threads): the member uploads an image (or picks an earlier result) and
// creates a swap_generations row (RLS). POST reserves credits and starts an image-generation
// job in the background; GET polls it and, when the image is ready, saves it to the member's
// private folder. Optional: `area` (e.g. "Floor") and `mask_path`, a PNG the size of the
// image whose transparent pixels mark the part to change.
// Every generation must finish within LIMIT_MS: past that the server stops waiting, cancels
// the job, marks it failed and refunds exactly once (conditional status change + refundOnce).
// POST { generation_id, action: 'stop' } stops a generation early the same way.

const COST = 100;
const ACTION = 'swap_generation';
const LIMIT_MS = 120_000;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_MASK_BYTES = 4 * 1024 * 1024;
const SWAP_TYPES: Record<string, string> = {
  material: 'Change only the materials/finishes described. Keep the building massing, openings, camera angle, perspective, lighting direction and every element not mentioned exactly as they are.',
  color: 'Change only the colors described. Keep geometry, materials texture, camera and lighting exactly as they are.',
  landscape: 'Change only the landscape/site elements described. Keep the building itself exactly as it is.',
  lighting: 'Change only the time of day / lighting described. Keep all geometry and materials exactly as they are.',
  interior: 'Change only the interior finishes/furnishings described. Keep the room geometry, openings and camera exactly as they are.',
  // V21 modes
  photoreal: 'Turn this image into a photorealistic architectural render, as if photographed with a real camera. Keep the exact composition, camera angle, geometry, openings and proportions. Follow the requested description closely: every material, colour, light condition and object it names must appear as described, and nothing it does not ask for should be added.',
  play: 'This image is a rough mock-up the member made in DrawUp Let’s Play: some surfaces were recoloured with flat paint and some cut-out objects were pasted on. Turn it into one photorealistic image. Re-render each recoloured surface in its new colour with its real material texture, shading and reflections. Integrate each pasted object at the same position, size and rotation with correct perspective, contact shadows and lighting. Keep everything else identical.',
};

// V21: options sent with POST (validated here, never trusted as-is).
const PEOPLE_COUNTS: Record<string, string> = { '1-2': 'one or two', few: 'a few (3 to 5)', busy: 'a busy scene of 6 to 12', crowd: 'a crowd of people' };
const SOURCE_KINDS: Record<string, string> = { sketch: 'hand sketch or drawing', model: '3D model screenshot', photo: 'photo' };
const clean = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const MAX_REFS = 3;
const MAX_REF_BYTES = 8 * 1024 * 1024;

type Opts = { lines: string[]; refs: string[] };
function readOptions(gen: any, raw: any, userId: string): Opts {
  const o = raw && typeof raw === 'object' ? raw : {};
  const lines: string[] = [];
  const refs: string[] = [];
  if (gen.swap_type === 'photoreal') {
    const kind = SOURCE_KINDS[String(o.source_kind || '')];
    if (kind) lines.push(`The input is a ${kind}.`);
    const p = o.people && typeof o.people === 'object' ? o.people : null;
    const count = p && PEOPLE_COUNTS[String(p.count || '')];
    if (count) {
      const act = clean(p.activity, 80);
      lines.push(`Add ${count} real-life people${act ? `, ${act}` : ''}, at correct scale for the space and camera, lit and shadowed to match the scene, candid (not posing), varied ages and appearances, no readable text or logos on clothing, and no recognisable real individuals.`);
    } else lines.push('Do not add people unless the description asks for them.');
  }
  if (gen.swap_type === 'play') {
    const objs = Array.isArray(o.objects) ? o.objects.slice(0, MAX_REFS) : [];
    objs.forEach((x: any, i: number) => {
      const desc = clean(x?.desc, 120);
      const ref = typeof x?.ref_path === 'string' && pathIsOwn(x.ref_path, userId) && /\/swap\/[\w-]+\.(jpg|png|webp)$/i.test(x.ref_path) ? x.ref_path : '';
      if (ref) refs.push(ref);
      lines.push(`Pasted object ${i + 1}${desc ? `: reproduce exactly this object: ${desc}` : ''}.${ref ? ` Reference image ${refs.length + 1} shows the exact object, match its shape, colours and details.` : ''}`);
    });
  }
  return { lines, refs };
}

async function loadOwned(id: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = await adminSelectOne<any>('swap_generations', `id=eq.${id}&select=*`);
  return row && row.owner_id === userId ? row : null;
}

/** Width/height from a PNG, JPEG or WebP header (null when unknown). */
function imageSize(buf: Uint8Array): { w: number; h: number } | null {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return null;
  }
  if (b.length > 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const kind = b.toString('latin1', 12, 16);
    if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

const nowIso = () => new Date().toISOString();
const expired = (gen: any) => gen.status === 'generating' && gen.started_at && Date.now() - new Date(gen.started_at).getTime() > LIMIT_MS;

/** Moves a generating row to failed exactly once, cancels the job and refunds once. */
async function stopGeneration(gen: any, userId: string, message: string) {
  const r = await adminUpdate('swap_generations', gen.id, { status: 'failed', error: message, completed_at: nowIso() }, 'status=eq.generating');
  if (r) {
    if (r.response_id) await openaiCancel(r.response_id);
    await refundOnce(userId, r.credit_access, ACTION + '_refund', gen.id);
  }
  return r || await loadOwned(gen.id, userId);
}

async function failUncharged(gen: any, userId: string, message: string, status = 400) {
  await adminUpdate('swap_generations', gen.id, { status: 'failed', error: message + ' You were not charged.', completed_at: nowIso() }, 'status=eq.queued');
  return NextResponse.json({ error: message + ' You were not charged.', generation: await loadOwned(gen.id, userId) }, { status });
}

async function threadContext(gen: any, userId: string): Promise<string[]> {
  if (!gen.thread_id) return [];
  const r = await adminRest(`swap_generations?thread_id=eq.${gen.thread_id}&owner_id=eq.${userId}&status=eq.complete&id=neq.${gen.id}&select=prompt,area&order=created_at.desc&limit=4`);
  if (!r.ok) return [];
  return ((await r.json()) as any[]).reverse().map(g => String(g.prompt || '').slice(0, 200) + (g.area ? ` (${String(g.area).slice(0, 60)})` : ''));
}

export async function POST(request: Request) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to use DrawUp Swap.' }, { status: 401 });
  const notReady = missingConfig();
  if (notReady) return NextResponse.json({ error: 'DrawUp Swap is not connected yet: ' + notReady }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const gen = await loadOwned(String(body?.generation_id || ''), user.id);
  if (!gen) return NextResponse.json({ error: 'Swap not found.' }, { status: 404 });

  if (body?.action === 'stop') {
    if (gen.status === 'queued') return failUncharged(gen, user.id, 'Stopped before it started.', 200);
    if (gen.status !== 'generating') return NextResponse.json({ generation: gen });
    const timedOut = body?.reason === 'timeout' || expired(gen);
    const g = await stopGeneration(gen, user.id, (timedOut ? 'Shot clock ran out: DrawUp stopped this generation at 2:00.' : 'Stopped.') + ' Your credits were refunded.');
    return NextResponse.json({ generation: g });
  }

  if (gen.status !== 'queued') return NextResponse.json({ generation: gen });
  if (!pathIsOwn(gen.source_path, user.id)) return NextResponse.json({ error: 'That image is not yours.' }, { status: 403 });

  let file;
  try { file = await storageDownload(PRIVATE_BUCKET, gen.source_path); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  const type = /png|jpe?g|webp/.test(file.type) ? file.type : (/\.png$/i.test(gen.source_path) ? 'image/png' : /\.webp$/i.test(gen.source_path) ? 'image/webp' : 'image/jpeg');
  if (file.bytes.byteLength > MAX_BYTES) return failUncharged(gen, user.id, 'Image is larger than 20 MB.');

  // The brushed mask: must be the member's own PNG, the same size as the image being edited.
  let maskData = '';
  if (gen.mask_path) {
    if (!pathIsOwn(gen.mask_path, user.id)) return NextResponse.json({ error: 'That mask is not yours.' }, { status: 403 });
    let mask;
    try { mask = await storageDownload(PRIVATE_BUCKET, gen.mask_path); }
    catch { return failUncharged(gen, user.id, 'The marked area could not be read.'); }
    const mBytes = new Uint8Array(mask.bytes), iBytes = new Uint8Array(file.bytes);
    const ms = imageSize(mBytes), is = imageSize(iBytes);
    if (!ms || mBytes[0] !== 0x89 || mask.bytes.byteLength > MAX_MASK_BYTES) return failUncharged(gen, user.id, 'The marked area must be a PNG under 4 MB.');
    if (is && (ms.w !== is.w || ms.h !== is.h)) return failUncharged(gen, user.id, `The marked area (${ms.w}x${ms.h}) does not match the image (${is.w}x${is.h}). Mark the area again.`);
    maskData = `data:image/png;base64,${bytesToBase64(mBytes)}`;
  }

  const claimed = await adminUpdate('swap_generations', gen.id, { status: 'generating', started_at: nowIso() }, 'status=eq.queued');
  if (!claimed) return NextResponse.json({ generation: await loadOwned(gen.id, user.id) });
  const access: CreditAccess = await reserveCredits(user, COST, ACTION);
  if (!access.ok) {
    await adminUpdate('swap_generations', gen.id, { status: 'queued', started_at: null });
    return NextResponse.json({ error: creditMessage(access, COST), ...access }, { status: 402 });
  }
  // Record what was charged first, so a stop or time-out from here on can refund it.
  const held = await adminUpdate('swap_generations', gen.id, { credits_charged: access.credits_charged ?? 0, credit_access: access }, 'status=eq.generating');
  if (!held) {
    await refundOnce(user.id, access, ACTION + '_refund', gen.id);
    return NextResponse.json({ generation: await loadOwned(gen.id, user.id) });
  }

  const rule = SWAP_TYPES[gen.swap_type] || SWAP_TYPES.material;
  const area = String(gen.area || '').trim().slice(0, 120);
  const earlier = await threadContext(gen, user.id);
  const opts = readOptions(gen, body?.options, user.id);
  // V21 Let’s Play: the member’s own reference images of the objects they dragged in (best effort).
  const refImages: { type: string; image_url: string }[] = [];
  for (const p of opts.refs) {
    try {
      const f = await storageDownload(PRIVATE_BUCKET, p);
      if (f.bytes.byteLength <= MAX_REF_BYTES) refImages.push({ type: 'input_image', image_url: `data:${/png|webp/.test(f.type) ? f.type : 'image/jpeg'};base64,${bytesToBase64(f.bytes)}` });
    } catch { /* a missing reference only weakens the match */ }
  }
  const text = [
    `Edit this architectural image. ${rule}`,
    gen.swap_type === 'photoreal' ? `Description to follow: ${gen.prompt}` : `Requested change: ${gen.prompt}`,
    ...opts.lines,
    area ? `Where: apply the change only to ${area === 'Marked area' ? 'the marked area' : 'the ' + area.toLowerCase()}. Leave every other surface as it is.` : '',
    maskData ? 'A mask is attached: its transparent pixels mark the exact region to change. Keep everything outside that region identical.' : '',
    refImages.length ? 'The first image is the one to edit. The images after it are references only, do not return them.' : '',
    earlier.length ? `Earlier changes in this thread (already visible in the image, keep them): ${earlier.join('; ')}` : '',
    'Return one photorealistic image with the same framing.',
  ].filter(Boolean).join('\n');
  try {
    const tool: Record<string, unknown> = { type: 'image_generation', quality: process.env.DRAWUP_SWAP_QUALITY || 'medium', size: 'auto' };
    if (maskData) tool.input_image_mask = { image_url: maskData };
    const { data, model } = await openaiCreate({
      input: [{ role: 'user', content: [
        { type: 'input_text', text },
        { type: 'input_image', image_url: `data:${type};base64,${bytesToBase64(file.bytes)}` },
        ...refImages,
      ] }],
      tools: [tool],
      tool_choice: { type: 'image_generation' },
      background: true,
      store: true,
    // A light, non-reasoning model only routes the request to the image tool, which keeps the
    // wait short; override with DRAWUP_SWAP_MODEL.
    }, models(process.env.DRAWUP_SWAP_MODEL, 'gpt-4.1-mini', process.env.DRAWUP_COACH_MODEL));
    const updated = await adminUpdate('swap_generations', gen.id, { response_id: data.id, model, error: null }, 'status=eq.generating');
    if (!updated) { await openaiCancel(data.id); return NextResponse.json({ generation: await loadOwned(gen.id, user.id) }); }
    return NextResponse.json({ generation: updated, credits_charged: access.credits_charged ?? 0, credits_remaining: access.credits_remaining ?? null });
  } catch (e: any) {
    const g = await stopGeneration(gen, user.id, (e.message || 'Swap could not start.') + ' You were not charged.');
    return NextResponse.json({ error: (e.message || 'Swap could not start.') + ' You were not charged.', generation: g }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to use DrawUp Swap.' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') || '';
  const gen = await loadOwned(id, user.id);
  if (!gen) return NextResponse.json({ error: 'Swap not found.' }, { status: 404 });
  if (gen.status !== 'generating') return NextResponse.json({ generation: gen });
  const timeUp = () => stopGeneration(gen, user.id, 'Shot clock ran out: DrawUp stopped this generation at 2:00. Your credits were refunded.')
    .then(g => NextResponse.json({ generation: g }));
  if (!gen.response_id) return expired(gen) ? timeUp() : NextResponse.json({ generation: gen });

  let data: any;
  try { data = await openaiGet(gen.response_id); }
  catch (e: any) { return expired(gen) ? timeUp() : NextResponse.json({ generation: gen, warning: e.message }); }
  if (data.status === 'queued' || data.status === 'in_progress') return expired(gen) ? timeUp() : NextResponse.json({ generation: gen });

  const fail = async (message: string) => NextResponse.json({ generation: await stopGeneration(gen, user.id, message + ' Your credits were refunded.') });
  if (data.status !== 'completed') return fail(data?.error?.message || `The generation ${data.status || 'failed'}.`);
  const call = (data.output || []).find((o: any) => o?.type === 'image_generation_call' && o?.result);
  if (!call) return fail('No image came back (the request may have been declined).');

  const fmt = String(call.output_format || 'png').replace('jpeg', 'jpg');
  const resultPath = `${user.id}/swap/${gen.id}-result.${fmt}`;
  try { await storageUpload(PRIVATE_BUCKET, resultPath, new Uint8Array(Buffer.from(call.result, 'base64')), fmt === 'jpg' ? 'image/jpeg' : `image/${fmt}`); }
  catch (e: any) { return NextResponse.json({ generation: gen, warning: e.message }); }
  const r = await adminUpdate('swap_generations', gen.id, { status: 'complete', result_path: resultPath, completed_at: nowIso() }, 'status=eq.generating');
  return NextResponse.json({ generation: r || await loadOwned(gen.id, user.id) });
}
