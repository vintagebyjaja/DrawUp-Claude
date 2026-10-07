// Arch Coach routing pseudocode
// Merge conceptually with the existing DrawUp Arch Coach router.

export type ArchCoachMode = "coach" | "advisor" | "verify" | "combined";

export function routeArchCoachIntent(message: string): ArchCoachMode {
  const q = message.toLowerCase();

  const explicitVerify =
    /\b(code|compliant|compliance|ibc|ada|nfpa|standard|require|required|minimum|maximum|verify|source|citation|cite|jurisdiction)\b/.test(q);

  const coachIntent =
    /\b(what would you|what do you think|how would you|what would you choose|what would you include|your approach|which .* would you (choose|pick|prefer))\b/.test(q);

  const playerAdvice =
    /\b(what should i|how should i|should i|what do i|my (plan|design|project|drawing)|what should we|how should we)\b/.test(q);

  if (coachIntent && explicitVerify) return "combined";
  if (explicitVerify) return "verify";
  if (coachIntent) return "coach";
  if (playerAdvice) return "advisor";

  // Existing semantic classifier can resolve ambiguous cases.
  return "advisor";
}

export function shouldRunVerification(mode: ArchCoachMode) {
  return mode === "verify" || mode === "combined";
}

export function shouldShowVerificationUI(mode: ArchCoachMode) {
  return shouldRunVerification(mode);
}

/*
IMPORTANT:
Regex is only a fast-path example. Existing AI/semantic classification should
handle paraphrases and context. Do not make the production router dependent
solely on exact phrases or pronouns.
*/
