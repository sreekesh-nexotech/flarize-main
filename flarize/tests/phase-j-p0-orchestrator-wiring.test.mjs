// tests/phase-j-p0-orchestrator-wiring.test.mjs
//
// P0-1 + P0-2 (2026-09-05) — HTTP orchestrator wiring regression.
//
// COVERAGE
//   P0-1: sizeKw parser strips phase suffix so "5sp"/"5tp"/"3sp"/"3tp" all
//         resolve to a numeric kW; numeric input stays untouched.
//   P0-2: sales orchestrator passes commercialFreezeInputs → issueQuotation
//         so the issued document carries the Phase F–J 10-domain snapshot
//         (not just a null placeholder).

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const ORCH_SRC   = readFileSync('src/lib/salesOrchestrator.js', 'utf-8');
const HTTP_SO    = readFileSync('server-sales-orchestrator.js', 'utf-8');
const HTTP_QUOTE = readFileSync('server-quotation.js', 'utf-8');

// ─────────────────────────────────────────────────────────────────────────────
// P0-1: sizeKw parsing pattern is applied at every relevant orchestrator site.
// ─────────────────────────────────────────────────────────────────────────────
describe('P0-1 — phase-suffix-safe sizeKw parse', () => {
  const parse = (s) => Number(String(s).replace(/[^0-9.]/g, ''));

  it('parses phase-suffixed sizes to their numeric kW', () => {
    assert.equal(parse('5sp'), 5);
    assert.equal(parse('5tp'), 5);
    assert.equal(parse('3sp'), 3);
    assert.equal(parse('3tp'), 3);
    assert.equal(parse('10sp'), 10);
    assert.equal(parse('10tp'), 10);
  });

  it('leaves purely numeric sizes unchanged', () => {
    assert.equal(parse('5'), 5);
    assert.equal(parse('10'), 10);
    assert.equal(parse('7.5'), 7.5);
    assert.equal(parse(5), 5);
  });

  it('salesOrchestrator.js no longer contains raw Number(input.size) — every site uses the phase-safe pattern', () => {
    // Every appearance of "Number(input.size" must be inside the pattern
    // Number(String(input.size).replace(/[^0-9.]/g, ''))
    const rawMatches = ORCH_SRC.match(/Number\(input\.size\)/g) || [];
    assert.equal(rawMatches.length, 0,
      'salesOrchestrator.js still contains raw Number(input.size) — that returns NaN for "5sp"/"5tp"');
    // At least one occurrence of the safe pattern
    const safeMatches = ORCH_SRC.match(/Number\(String\(input\.size\)\.replace\(\/\[\^0-9\.\]\/g/g) || [];
    assert.ok(safeMatches.length >= 3,
      `expected at least 3 phase-safe sizeKw parses in orchestrator, found ${safeMatches.length}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P0-2: HTTP callers assemble commercialFreezeInputs.
// ─────────────────────────────────────────────────────────────────────────────
describe('P0-2 — HTTP callers pass commercialFreezeInputs', () => {
  it('server-sales-orchestrator.js loads branding + policy stores from disk', () => {
    assert.match(HTTP_SO, /loadJson\(dataPath\('quotation-branding-state\.json'\)/);
    assert.match(HTTP_SO, /loadJson\(dataPath\('quotation-policy\.json'\)/);
  });

  it('server-sales-orchestrator.js reads productionMode from process.env.PRODUCTION_MODE', () => {
    assert.match(HTTP_SO, /process\.env\.PRODUCTION_MODE/);
    assert.match(HTTP_SO, /productionMode/);
  });

  it('server-sales-orchestrator.js hands brandingStore + policy + productionMode into options', () => {
    // The options object must include the three fields.
    assert.match(HTTP_SO, /brandingStore,\s*\n\s*policy,\s*\n\s*productionMode,/);
  });

  it('salesOrchestrator.js assembles commercialFreezeInputs before both issueQuotation calls', () => {
    // Single-tier path
    assert.match(ORCH_SRC, /commercialFreezeInputs\s*=\s*\{[\s\S]*brandingStore:\s*options\.brandingStore/);
    assert.match(ORCH_SRC, /commercialFreezeInputs,\s*\n\s*\}\);/);
    // Two calls to issueQuotation
    const issueCalls = ORCH_SRC.match(/Q\.issueQuotation\(/g) || [];
    assert.ok(issueCalls.length >= 2, `expected 2 issueQuotation call sites, found ${issueCalls.length}`);
  });

  it('server-quotation.js /issue route also assembles commercialFreezeInputs', () => {
    assert.match(HTTP_QUOTE, /\/api\/quotation\/quotations\/:id\/issue/);
    assert.match(HTTP_QUOTE, /commercialFreezeInputs\s*=\s*\{/);
    assert.match(HTTP_QUOTE, /brandingStore/);
    assert.match(HTTP_QUOTE, /process\.env\.PRODUCTION_MODE/);
  });

  it('The orchestrator surfaces validityOverrideDays and brandingOverrides from input', () => {
    assert.match(ORCH_SRC, /validityOverrideDays:\s*input\.validityOverrideDays/);
    assert.match(ORCH_SRC, /brandingOverrides:\s*input\.brandingOverrides/);
  });
});
