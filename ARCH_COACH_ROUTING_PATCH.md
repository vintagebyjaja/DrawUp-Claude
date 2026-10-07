# PATCH SPEC — ARCH COACH “YOU” VS “I” ROUTING

## 1. Intent classes

### COACH_MODE
Use when the player asks for Arch Coach's own judgment, approach, preference, design thinking, critique, brainstorming, or choice.

Examples:
- What would you do?
- What do you think?
- How would you design this?
- What would you choose?
- How would you approach this?
- What would you include?
- If you were the architect, what would you change?
- Which option do you like better?

Behavior:
1. Answer immediately.
2. Use first-person coach language naturally: "I'd...", "My approach...", "I'd start with..."
3. DO NOT automatically start web/source/code verification.
4. DO NOT show "Checking sources for the full answer..."
5. DO NOT hold the full answer behind a verification progress screen.
6. If useful, Arch Coach may offer: "Want me to verify that against code/project requirements?"
7. Personal reasoning must not falsely claim a code requirement or verified fact.

### ADVISOR_MODE
Use when the player asks what THEY should do on a real design/project/task.

Examples:
- What should I do here?
- How should I lay this out?
- What should I change on my plan?
- Is this a good approach for my hospital?
- What should I tell the contractor?

Behavior:
1. Understand the player's question/project context.
2. Give useful immediate guidance when safe to do so.
3. Verify external requirements when the recommendation depends on code, standards, manufacturer data, jurisdiction, project documents, or other factual constraints.
4. Clearly distinguish design advice from verified requirements.

### VERIFY_MODE
Use when the player asks for compliance, authoritative requirements, exact standards, factual confirmation, or citations.

Examples:
- Is this code compliant?
- What does IBC require?
- What is the minimum corridor width?
- Verify this ADA requirement.
- Cite the source.
- What does NFPA say?
- Is this allowed by code?

Behavior:
1. Source verification is required.
2. Prefer authoritative/current sources.
3. Show verification state only when verification is actually running.
4. Return the answer with the relevant source/citation information.

## 2. Routing precedence

Explicit verification/compliance intent overrides pronoun routing.

Examples:
- "What would you do, and can you verify it against IBC?" => VERIFY/COMBINED
- "What do you think the code requires?" => VERIFY_MODE
- "How would you design this?" => COACH_MODE
- "How should I design this to meet code?" => ADVISOR_MODE + VERIFY

Do NOT route based only on the presence of the word "you" or "I".
Classify the semantic intent of the complete question.

## 3. Required example / regression test

QUESTION:
"You’re designing a new patient waiting area for an Atrium Health hospital. What are three design features you would include to make the space comfortable, accessible, and easy for patients and visitors to navigate?"

EXPECTED ROUTE:
COACH_MODE

EXPECTED BEHAVIOR:
Arch Coach answers immediately from its design reasoning.

EXAMPLE ANSWER:
"I’d start with clear sightlines to check-in, separate quieter seating from the main circulation path, and bring natural light into the waiting area. I’d also integrate accessible seating spaces throughout the room so wheelchair users and companions can sit together naturally."

MUST NOT:
- trigger source lookup automatically
- display "Checking sources for the full answer..."
- display a 2:00 verification countdown
- delay the answer while searching
- tell the player to be more specific

OPTIONAL FOLLOW-UP:
"Want me to check this approach against healthcare accessibility and code requirements?"

## 4. Familiarity / player relationship

Coach Mode is part of the Arch Coach/player relationship.

Where existing DrawUp memory/profile context is available, Arch Coach may adapt:
- explanation depth
- terminology
- preferred design approaches
- recurring project types
- skills the player is practicing
- previous choices/preferences

Do not invent remembered preferences. Personalization must come from available player context.

## 5. UI state rules

COACH_MODE:
question -> classify -> stream answer immediately
No verification progress component.

ADVISOR_MODE:
question -> classify -> answer/gather needed context -> verify only if recommendation depends on external requirements.

VERIFY_MODE:
question -> classify -> verification state -> sourced answer.

If background enrichment is used for a non-critical Coach Mode answer, it MUST NOT block or replace the immediate answer. Any later enrichment should be clearly secondary.

## 6. Acceptance tests

PASS:
"What would you do with this lobby?"
=> Immediate first-person design answer. No source checker.

PASS:
"Which façade option would you choose?"
=> Immediate preference with reasoning. No source checker.

PASS:
"What should I do if my corridor is too narrow?"
=> Advisor behavior; determine whether project/code context is needed and verify requirements before asserting a minimum.

PASS:
"What is the required hospital corridor width under the applicable code?"
=> Verify Mode.

PASS:
"How would you design this waiting room, then verify whether your idea meets accessibility requirements?"
=> Give design reasoning + run verification for the compliance portion.

FAIL:
Any purely personal Coach Mode prompt automatically launches the 2-minute source-checking UI.
