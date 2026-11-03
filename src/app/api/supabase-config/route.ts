import { NextResponse } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/drawup-env";

export const dynamic = "force-dynamic";

// The browser's Supabase settings (public URL + anon key only). V23.1: read at run time, and when one is
// missing the reply names the setting so the page can say what to fix instead of a dead Sign in button.
export async function GET() {
  const url = supabaseUrl(), key = supabaseAnonKey();
  const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !key && "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter(Boolean);
  return NextResponse.json({ url, key, missing }, { headers: { "Cache-Control": "no-store" } });
}
