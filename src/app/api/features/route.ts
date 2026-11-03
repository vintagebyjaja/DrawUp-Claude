import { NextResponse } from "next/server";
import { DEFAULT_FLAGS, REGISTRY_VERSION, flagsFromEnv } from "@/lib/drawup-season";

export const dynamic = "force-dynamic";

// Season flags for the browser (public, no secrets). Read at request time so a Cloudflare variable change
// (DRAWUP_SEASON_2_DETAILS_ENABLED) takes effect without a rebuild. Missing or unreadable = Season 1 defaults.
export async function GET() {
  let flags = DEFAULT_FLAGS;
  try { flags = flagsFromEnv(process.env as Record<string, string | undefined>); } catch { /* defaults */ }
  return NextResponse.json({ season: 1, version: REGISTRY_VERSION, flags }, { headers: { "Cache-Control": "no-store" } });
}
