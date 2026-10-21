import { teamCosts } from '@/lib/drawup-team';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// V25: the AI Design Team prices the page shows before anything runs (Cloudflare settings DRAWUP_TEAM_*_COST).
// Voice uses the browser's own speech recognition, so it needs no service; DRAWUP_TEAM_VOICE=0 hides it.
export async function GET() {
  return new Response(JSON.stringify({ costs: teamCosts(), voice: process.env.DRAWUP_TEAM_VOICE !== '0' }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  });
}
