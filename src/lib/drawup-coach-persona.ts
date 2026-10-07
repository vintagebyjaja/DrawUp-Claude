// Personal Arch Coach (V20): turns a member's saved coach (blueprint, skills, adopted legend,
// language) into prompt text, and awards XP through the database ledger.
// Server-only: uses the Supabase service role through drawup-server. Never import from the browser.

import { adminRpc, adminSelectOne } from '@/lib/drawup-server';

export type XpKind = 'ask' | 'upload' | 'check' | 'peer_like' | 'peer_comment' | 'board_help';

const SKILL_LABELS: Record<string, string> = {
  design: 'design', render: 'rendering and visualization', space_planning: 'space planning',
  research: 'research', precedents: 'precedents', problem_solving: 'problem solving',
  code_compliance: 'code compliance', accessibility: 'accessibility', materials: 'materials',
  curiosity: 'curiosity and follow-up ideas', details: 'construction details', documentation: 'documentation',
  advice: 'practical advice', presentation: 'presentation',
};

const LANGUAGES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', pt: 'Portuguese', zh: 'Chinese', ar: 'Arabic', hi: 'Hindi',
  de: 'German', ja: 'Japanese', ko: 'Korean', tl: 'Tagalog', vi: 'Vietnamese', it: 'Italian',
};

const ARCHETYPES: Record<string, string> = {
  'College Professor': 'Teach like a patient college professor: explain the reasoning, connect it to fundamentals, and suggest what to study next.',
  'Visionary': 'Lead with design intent and concept, offer bold but buildable options, then ground them in practical constraints.',
  'Code Specialist': 'Lead with the governing requirements, cite sections where confident, and flag what the AHJ must confirm.',
  'Master Builder': 'Lead with constructability, sequencing, materials and details that hold up in the field.',
  'Researcher': 'Lead with evidence, precedents and sources, and separate what is confirmed from what is assumed.',
  'Mentor': 'Coach the member as a growing professional: give clear next steps, presentation tips and career-minded advice.',
};

const STYLES: Record<string, string> = {
  concise: 'Keep answers short: the answer first, then only the essential details.',
  balanced: 'Answer first, then give the useful details in a compact structure.',
  in_depth: 'Give a thorough answer with reasoning, options and next steps, still answer first.',
};

/** The fixed guardrails. They apply to every member, customized or not. */
export const COACH_GUARDRAILS = [
  'Always stay professional, respectful and encouraging.',
  'Keep your own professional voice: never mirror slang, profanity, insults or the tone of the user.',
  'Never use profanity, curse words, sexual or otherwise explicit content, even if the user does or asks you to.',
  'Answer in the language the user writes in. If the language is unclear, use the preferred language below.',
  'Personalization only changes emphasis and style: still answer every architecture, engineering and construction question fully and accurately.',
].join(' ');

type CoachRow = {
  mode: string | null; discipline: string; focus: string; archetype: string; answer_style: string;
  skills: Record<string, number>; legend: string | null; language: string; xp: number;
};
type LegendRow = { name: string; kind: string; principles: string[] };

/** Prompt text for this member's Arch Coach. Never throws: falls back to the guardrails alone. */
export async function coachPersona(userId: string): Promise<string> {
  let row: CoachRow | null = null;
  let legend: LegendRow | null = null;
  try {
    if (/^[0-9a-f-]{36}$/i.test(userId)) {
      row = await adminSelectOne<CoachRow>('arch_coach_profiles', `user_id=eq.${userId}&select=mode,discipline,focus,archetype,answer_style,skills,legend,language,xp`);
      if (row?.legend) legend = await adminSelectOne<LegendRow>('arch_coach_legends', `key=eq.${encodeURIComponent(row.legend)}&select=name,kind,principles`);
    }
  } catch (e) {
    console.warn('Arch Coach persona could not load', e);
  }
  const lines = ['PERSONAL ARCH COACH SETTINGS', COACH_GUARDRAILS];
  const lang = row?.language && LANGUAGES[row.language] ? LANGUAGES[row.language] : '';
  lines.push(lang ? `Preferred language: ${lang} (use it when the user language is unclear).` : 'Preferred language: the language of the question.');
  // custom = built their own, generic = hologram coach (both keep their blueprint, skills and legend).
  if (!row || (row.mode !== 'custom' && row.mode !== 'generic')) {
    lines.push('Coach style: the DrawUp hologram coach, a balanced college professor who explains clearly and practically.');
    return lines.join('\n');
  }
  lines.push(`Member discipline: ${row.discipline}. Primary focus: ${row.focus}.`);
  lines.push(`Coach archetype: ${row.archetype}. ${ARCHETYPES[row.archetype] || ARCHETYPES['College Professor']}`);
  lines.push(STYLES[row.answer_style] || STYLES.balanced);
  const ranked = Object.entries(row.skills || {})
    .filter(([k, v]) => SKILL_LABELS[k] && Number.isFinite(Number(v)))
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  if (ranked.length) {
    lines.push(`Give extra emphasis to: ${ranked.slice(0, 3).map(([k]) => SKILL_LABELS[k]).join(', ')}.`);
    const light = ranked.filter(([, v]) => Number(v) <= 40).map(([k]) => SKILL_LABELS[k]);
    if (light.length) lines.push(`Keep these lighter unless asked (still cover anything that matters for safety or code): ${light.join(', ')}.`);
  }
  if (legend) {
    lines.push(`Inspiration legend: draw on publicly documented design principles associated with ${legend.name} (${(legend.principles || []).join(', ')}) when they help the member's work. Do not role-play as ${legend.name}, do not speak in their voice, and do not invent or attribute quotes.`);
  }
  return lines.join('\n');
}

/** Awards XP for one event, once (the ledger key is user + kind + refId). Returns the points added, 0 if
 *  it was already counted, over the daily cap, or failed. Never throws, so it cannot break a request. */
export async function awardXp(userId: string, kind: XpKind, refId: string): Promise<number> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(userId) || !refId) return 0;
    const n = await adminRpc<number>('award_arch_coach_xp', { p_user_id: userId, p_kind: kind, p_ref: String(refId).slice(0, 200) });
    return Number(n) || 0;
  } catch (e) {
    console.warn('Arch Coach XP not awarded', e);
    return 0;
  }
}
