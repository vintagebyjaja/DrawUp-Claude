// V23.1: settings are read when a request runs. Next.js replaces `process.env.NEXT_PUBLIC_…` with the value
// present during `next build`; on Cloudflare the Build variables and the Worker's runtime Variables are set
// separately. Looking names up through a variable key reads the runtime value; the build-time copy is the
// fallback (V23.2). Values are trimmed and stray quotes from copy-paste are removed.

const clean = (v: string | undefined) => String(v ?? '').trim().replace(/^(["'])(.*)\1$/, '$2').trim();
const read = (name: string) => clean((process.env as Record<string, string | undefined>)[name]);

/** The first of these settings that has a value, or ''. */
export function runtimeEnv(...names: string[]) {
  for (const n of names) { const v = read(n); if (v) return v; }
  return '';
}

// V23.2: the Worker's runtime Variables win; when a value only exists as a Cloudflare Build variable, the copy
// Next.js baked in at build time is used (written out literally below so the build can fill it in).
const BUILT_URL = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const BUILT_KEY = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) || clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

export const supabaseUrl = () => (runtimeEnv('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL') || BUILT_URL).replace(/\/+$/, '');
export const supabaseAnonKey = () => runtimeEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY') || BUILT_KEY;
