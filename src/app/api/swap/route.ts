import { NextResponse } from 'next/server';
import {
  PRIVATE_BUCKET, adminSelectOne, adminUpdate, bytesToBase64, creditMessage, missingConfig, models,
  openaiCreate, openaiGet, pathIsOwn, refundCredits, reserveCredits, signedInUser, storageDownload,
  storageUpload, type CreditAccess,
} from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DrawUp Swap: the member uploads a photo/render to their private folder and creates a
// swap_generations row (RLS). POST reserves credits and starts an image-generation job in
// the background; GET polls it and, when the image is ready, saves it to the member's
// private folder and records it on the row. Failed jobs are refunded.

const COST = 100;
const ACTION = 'swap_generation';
const MAX_BYTES = 20 * 1024 * 1024;
const SWAP_TYPES: Record<string, string> = {
  material: 'Change only the materials/finishes described. Keep the building massing, openings, camera angle, perspective, lighting direction and every element not mentioned exactly as they are.',
  color: 'Change only the colors described. Keep geometry, materials texture, camera and lighting exactly as they are.',
  landscape: 'Change only the landscape/site elements described. Keep the building itself exactly as it is.',
  lighting: 'Change only the time of day / lighting described. Keep all geometry and materials exactly as they are.',
  interior: 'Change only the interior finishes/furnishings described. Keep the room geometry, openings and camera exactly as they are.',
};

async function loadOwned(id: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = await adminSelectOne<any>('swap_generations', `id=eq.${id}&select=*`);
  return row && row.owner_id === userId ? row : null;
}

export async function POST(request: Request) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to use DrawUp Swap.' }, { status: 401 });
  const notReady = missingConfig();
  if (notReady) return NextResponse.json({ error: 'DrawUp Swap is not connected yet: ' + notReady }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const gen = await loadOwned(String(body?.generation_id || ''), user.id);
  if (!gen) return NextResponse.json({ error: 'Swap not found.' }, { status: 404 });
  if (gen.status !== 'queued') return NextResponse.json({ generation: gen });
  if (!pathIsOwn(gen.source_path, user.id)) return NextResponse.json({ error: 'That image is not yours.' }, { status: 403 });

  let file;
  try { file = await storageDownload(PRIVATE_BUCKET, gen.source_path); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  const type = /png|jpe?g|webp/.test(file.type) ? file.type : (/\.png$/i.test(gen.source_path) ? 'image/png' : /\.webp$/i.test(gen.source_path) ? 'image/webp' : 'image/jpeg');
  if (file.bytes.byteLength > MAX_BYTES) return NextResponse.json({ error: 'Image is larger than 20 MB.' }, { status: 400 });

  const claimed = await adminUpdate('swap_generations', gen.id, { status: 'generating' }, 'status=eq.queued');
  if (!claimed) return NextResponse.json({ generation: await loadOwned(gen.id, user.id) });
  const access: CreditAccess = await reserveCredits(user, COST, ACTION);
  if (!access.ok) {
    await adminUpdate('swap_generations', gen.id, { status: 'queued' });
    return NextResponse.json({ error: creditMessage(access, COST), ...access }, { status: 402 });
  }

  const rule = SWAP_TYPES[gen.swap_type] || SWAP_TYPES.material;
  try {
    const { data, model } = await openaiCreate({
      input: [{ role: 'user', content: [
        { type: 'input_text', text: `Edit this architectural image. ${rule}\nRequested change: ${gen.prompt}\nReturn one photorealistic image.` },
        { type: 'input_image', image_url: `data:${type};base64,${bytesToBase64(file.bytes)}` },
      ] }],
      tools: [{ type: 'image_generation', quality: 'high', size: 'auto' }],
      tool_choice: { type: 'image_generation' },
      background: true,
      store: true,
    }, models(process.env.DRAWUP_SWAP_MODEL, process.env.DRAWUP_COACH_MODEL));
    const updated = await adminUpdate('swap_generations', gen.id, {
      response_id: data.id, model, credits_charged: access.credits_charged ?? 0, credit_access: access, error: null,
    });
    return NextResponse.json({ generation: updated, credits_charged: access.credits_charged ?? 0, credits_remaining: access.credits_remaining ?? null });
  } catch (e: any) {
    await refundCredits(user.id, access, ACTION + '_refund');
    await adminUpdate('swap_generations', gen.id, { status: 'failed', error: (e.message || 'Swap could not start.') + ' You were not charged.', completed_at: new Date().toISOString() });
    return NextResponse.json({ error: (e.message || 'Swap could not start.') + ' You were not charged.' }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to use DrawUp Swap.' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') || '';
  const gen = await loadOwned(id, user.id);
  if (!gen) return NextResponse.json({ error: 'Swap not found.' }, { status: 404 });
  if (gen.status !== 'generating' || !gen.response_id) return NextResponse.json({ generation: gen });

  let data: any;
  try { data = await openaiGet(gen.response_id); }
  catch (e: any) { return NextResponse.json({ generation: gen, warning: e.message }); }
  if (data.status === 'queued' || data.status === 'in_progress') return NextResponse.json({ generation: gen });

  const fail = async (message: string) => {
    const r = await adminUpdate('swap_generations', gen.id, { status: 'failed', error: message + ' Your credits were refunded.', completed_at: new Date().toISOString() }, 'status=eq.generating');
    if (r) await refundCredits(user.id, gen.credit_access, ACTION + '_refund');
    return NextResponse.json({ generation: r || await loadOwned(gen.id, user.id) });
  };
  if (data.status !== 'completed') return fail(data?.error?.message || `The generation ${data.status || 'failed'}.`);
  const call = (data.output || []).find((o: any) => o?.type === 'image_generation_call' && o?.result);
  if (!call) return fail('No image came back (the request may have been declined).');

  const fmt = String(call.output_format || 'png').replace('jpeg', 'jpg');
  const resultPath = `${user.id}/swap/${gen.id}-result.${fmt}`;
  try { await storageUpload(PRIVATE_BUCKET, resultPath, new Uint8Array(Buffer.from(call.result, 'base64')), fmt === 'jpg' ? 'image/jpeg' : `image/${fmt}`); }
  catch (e: any) { return NextResponse.json({ generation: gen, warning: e.message }); }
  const r = await adminUpdate('swap_generations', gen.id, { status: 'complete', result_path: resultPath, completed_at: new Date().toISOString() }, 'status=eq.generating');
  return NextResponse.json({ generation: r || await loadOwned(gen.id, user.id) });
}
