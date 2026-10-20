// V23.1: settings are read when a request runs, never baked in at build time. Next.js replaces
// `process.env.NEXT_PUBLIC_…` with the value present during `next build`; on Cloudflare the build
// variables and the Worker's runtime variables are set separately, so a missing or mistyped build
// variable used to override a correct runtime one (sign-in then silently stopped working).
// Looking names up through a variable key keeps them out of the build. Values are trimmed and stray
// quotes from copy-paste are removed.

const read = (name: string) => {
  const env = process.env as Record<string, string | undefined>;
  return String(env[name] ?? '').trim().replace(/^(["'])(.*)\1$/, '$2').trim();
};

/** The first of these settings that has a value, or ''. */
export function runtimeEnv(...names: string[]) {
  for (const n of names) { const v = read(n); if (v) return v; }
  return '';
}

export const supabaseUrl = () => runtimeEnv('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL').replace(/\/+$/, '');
export const supabaseAnonKey = () => runtimeEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY');
