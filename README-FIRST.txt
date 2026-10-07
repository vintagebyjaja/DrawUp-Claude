DRAWUP V21.6 — CANONICAL / ALIAS PROJECT MATCH PATCH

Fixes the remaining case where DrawUp already has a project but a natural-language or former-name search misses it.

Example now handled:
  "NFL Saints stadium" -> existing "Caesars Superdome" DrawUp record

What changed:
- Existing-project matching now checks the whole known project record, not only the current project name.
- Uses description, city/state/country, project type, owner, project tags and source names as identity context.
- Common league/type words (NFL, NBA, MLB, stadium, arena, field, etc.) are treated as descriptors instead of forcing a false mismatch.
- A strong contextual match becomes the canonical DrawUp result, so Arch Coach does not create a second competing project answer.
- Existing V21.5 fuzzy matching, internal Back behavior, and image behavior remain intact.

NO SQL REQUIRED.

Replace the included public files with these versions, preserving your existing deployment structure.


V21.7 SEARCH UX PATCH
- Shows the exact question/search the user asked.
- Never tells the user to make a search more specific after a timeout/failure.
- Keeps a usable quick answer visible instead of replacing it with a failure state.
- If clarification is genuinely needed, the existing clarification choices still ask the user a targeted question.
- When a sourced report cannot complete in-session, tells the user they can use the current answer and view the DrawUp profile later for the full report.
- Does not falsely claim a background job is running when the backend has not confirmed one.
