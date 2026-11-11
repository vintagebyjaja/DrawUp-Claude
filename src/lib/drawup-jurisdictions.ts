// Site lookup by jurisdiction: the registry of covered places. Types and helpers: drawup-jurisdiction-util.ts.
// Adding a jurisdiction: write an adapter like drawup-jurisdiction-charlotte.ts, add it to REGISTRY, add a fixture
// to tests/season1/fixtures-intel.js and checks to tests/season1/test-site-lookup.js.
export * from './drawup-jurisdiction-util';
import type { Geo, Jurisdiction } from './drawup-jurisdiction-util';
import { CHARLOTTE } from './drawup-jurisdiction-charlotte';

/* ------------------------------------------------------------------ registry */
export const REGISTRY: Jurisdiction[] = [CHARLOTTE];
/** Plain-language list of what DrawUp covers, for "not covered" messages. */
export const COVERAGE_TEXT = REGISTRY.map(j => j.label).join('; ');
export const findJurisdiction = (geo: Geo) => REGISTRY.find(j => { try { return j.covers(geo); } catch { return false; } }) || null;

