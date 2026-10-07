DrawUp V21.5 — Search Match + Canonical Project + Back Button Fix

Replace these 3 files in your project:

public/drawup-live-v17.js
public/drawup-v19.js
public/drawup-preview.html

No SQL migration is required for this patch.

WHAT THIS PATCH FIXES
1. Fuzzy project matching
   - Searches like "CarMax Park Baseball Field" can match the existing "CarMax Park" project.
   - Generic building words such as field, park, stadium, arena, building, project, sports, baseball, etc. no longer force DrawUp to treat a known project as a new unknown item.

2. One canonical answer
   - A strong existing DrawUp project match wins before web/AI research.
   - DrawUp does not show a separate Quick Answer that can contradict the existing project profile.
   - The existing DrawUp project record is opened as the canonical result.
   - Web research remains for searches that do not already have a strong DrawUp match.

3. Internal Back button
   - Public firm/project profile pages now have an internal DrawUp Back button.
   - It returns to the DrawUp page the user came from when possible, with Discover as the safe fallback.
   - This avoids relying on the browser Back button, which may leave DrawUp.

This patch is designed to sit on top of the V21/V21.4 Discover image work.
