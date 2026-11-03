// v29 DrawUp Help, server side: the registry with the founder's published HQ overrides, and the help log.
// Server-only (service role through drawup-server). The registry and matcher themselves are in drawup-help.ts.

import { adminRest } from '@/lib/drawup-server';
import { FEATURES, withOverrides, type Feature, type HelpAnswer, type Override } from '@/lib/drawup-help';

let cache: { at: number; list: Feature[] } | null = null;
const TTL_MS = 60_000;

/** The registry as members see it: built-in features plus overrides the founder published in HQ › Help registry.
 *  Before the v29 SQL is run (no help_registry table) this is simply the built-in registry. */
export async function helpFeatures(): Promise<Feature[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.list;
  let rows: Override[] = [];
  try {
    const r = await adminRest('help_registry?select=feature_id,published&published=not.is.null');
    if (r.ok) rows = ((await r.json()) as any[]).map(x => ({ feature_id: x.feature_id, ...(x.published || {}) }));
  } catch { /* table not installed yet */ }
  cache = { at: Date.now(), list: rows.length ? withOverrides(rows) : FEATURES };
  return cache.list;
}

/** One row per free help answer, so HQ can see what members ask and which answers they get. Never blocks the answer. */
export async function logHelp(row: { user_id: string | null; surface: string; question: string; answer: HelpAnswer | null; thread_id?: string | null }) {
  try {
    await adminRest('help_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
      user_id: row.user_id, surface: row.surface, question: row.question.slice(0, 300), feature_id: row.answer?.feature || null,
      kind: row.answer?.kind || 'miss', thread_id: row.thread_id || null,
    }) });
  } catch { /* the log is optional */ }
}
