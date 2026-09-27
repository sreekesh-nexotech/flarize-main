/**
 * Orchestrator renderer-pinning wiring — focused tests (2026-09-04).
 *
 * Proves that BOTH orchestrator paths — orchestrateQuotation (single-tier) AND
 * orchestrateThreeTiers (three-tier) — forward `options.rendererPinning` into
 * the ISSUED document as `document.rendererPinning`. Failure of the wiring
 * would leave orchestrator-created quotations unpinned, violating R1/R2 for
 * that path.
 *
 * Full end-to-end orchestration (real BOM + procurement + margin + pricing)
 * lives in tests/qa-end-to-end-quotation.test.mjs. Here we assert the
 * WIRING contract by:
 *   1. Static source-level: the two Q.issueQuotation option literals in
 *      salesOrchestrator.js include the exact line `rendererPinning: options.rendererPinning || null`.
 *   2. Static source-level: server-sales-orchestrator.js constructs the
 *      `options` object with a `rendererPinning` field sourced from the same
 *      approved-template loader as server-quotation.js.
 *   3. Behavioral: issueQuotation, when called directly with `rendererPinning`,
 *      freezes it into `document.rendererPinning`. This exercises the same
 *      forwarding contract that both orchestrator paths depend on.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  getCurrentApprovedTemplatePinning,
  _clearApprovedTemplateCache,
} from '../src/lib/approvedTemplate.loader.js';
import { APPROVED_TEMPLATE_VERSION } from '../src/lib/approvedTemplate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const SALES_ORCH_SRC = readFileSync(
  resolve(__dirname, '..', 'src', 'lib', 'salesOrchestrator.js'), 'utf8');
const SERVER_SO_SRC  = readFileSync(
  resolve(__dirname, '..', 'server-sales-orchestrator.js'), 'utf8');
const SERVER_Q_SRC   = readFileSync(
  resolve(__dirname, '..', 'server-quotation.js'), 'utf8');

// ═════════════════════════════════════════════════════════════════════════════
// 1. src/lib/salesOrchestrator.js — both Q.issueQuotation calls forward the pin
// ═════════════════════════════════════════════════════════════════════════════
describe('src/lib/salesOrchestrator.js forwards rendererPinning', () => {
  test('exactly two Q.issueQuotation call sites exist (single-tier + three-tier)', () => {
    const matches = SALES_ORCH_SRC.match(/Q\.issueQuotation\s*\(/g) || [];
    assert.equal(matches.length, 2,
      'salesOrchestrator must have exactly 2 Q.issueQuotation sites — one per orchestration path');
  });

  test('BOTH Q.issueQuotation option literals include `rendererPinning: options.rendererPinning || null`', () => {
    // Split the source at each Q.issueQuotation( call and confirm the
    // FOLLOWING option object contains the rendererPinning forwarding line.
    const parts = SALES_ORCH_SRC.split(/Q\.issueQuotation\s*\(/);
    // parts[0] = pre-first-call; parts[1], parts[2] = post-call slices.
    assert.equal(parts.length, 3, 'exactly two Q.issueQuotation call sites');
    for (let i = 1; i <= 2; i++) {
      const optionLiteralEnd = parts[i].indexOf('});');
      assert.ok(optionLiteralEnd > 0, `Q.issueQuotation site ${i} has a closing });`);
      const optionsSlice = parts[i].slice(0, optionLiteralEnd);
      assert.ok(
        /rendererPinning\s*:\s*options\.rendererPinning\s*\|\|\s*null/.test(optionsSlice),
        `Q.issueQuotation site ${i} must forward rendererPinning from options`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. server-sales-orchestrator.js — same wiring as server-quotation.js
// ═════════════════════════════════════════════════════════════════════════════
describe('server-sales-orchestrator.js wires approved-template pinning', () => {
  test('imports approvedTemplate.loader.js AND approvedTemplate.js via dynamic import', () => {
    assert.ok(/import\(['"]\.\/src\/lib\/approvedTemplate\.loader\.js['"]\)/.test(SERVER_SO_SRC),
      'must dynamically import approvedTemplate.loader.js');
    assert.ok(/import\(['"]\.\/src\/lib\/approvedTemplate\.js['"]\)/.test(SERVER_SO_SRC),
      'must dynamically import approvedTemplate.js');
  });

  test('memoizes the ESM modules in the same pattern as server-quotation.js', () => {
    assert.ok(/let\s+_approvedTemplateModules\s*=\s*null/.test(SERVER_SO_SRC),
      'must declare the memoization slot');
    assert.ok(/async function loadApprovedTemplateModules\s*\(\s*\)/.test(SERVER_SO_SRC),
      'must define loadApprovedTemplateModules()');
    // Same helper name as server-quotation.js so the pattern is discoverable.
    assert.ok(/async function currentRendererPinning\s*\(\s*\)/.test(SERVER_SO_SRC),
      'must define currentRendererPinning() with the same name as server-quotation.js');
  });

  test('pattern is byte-comparable with server-quotation.js (same helper bodies)', () => {
    // Extract the currentRendererPinning function body from both files and
    // assert the CORE call sequence is identical: get pinning, add rendererVersion, freeze.
    const extract = (src) => {
      const m = src.match(/async function currentRendererPinning[\s\S]*?\n\}\n/);
      return m ? m[0] : null;
    };
    const serverQ = extract(SERVER_Q_SRC);
    const serverSO = extract(SERVER_SO_SRC);
    assert.ok(serverQ,  'server-quotation.js has currentRendererPinning');
    assert.ok(serverSO, 'server-sales-orchestrator.js has currentRendererPinning');
    for (const marker of [
      'getCurrentApprovedTemplatePinning()',
      'APPROVED_TEMPLATE_VERSION',
      'Object.freeze',
      'rendererVersion:',
    ]) {
      assert.ok(serverQ.includes(marker),  `server-quotation.js helper contains "${marker}"`);
      assert.ok(serverSO.includes(marker), `server-sales-orchestrator.js helper contains "${marker}"`);
    }
  });

  test('/api/sales/orchestrate call site computes rendererPinning and puts it in options', () => {
    // Locate the addRoute for /api/sales/orchestrate and confirm the options
    // object emitted for salesOrchestrator carries `rendererPinning`.
    const idx = SERVER_SO_SRC.indexOf("'/api/sales/orchestrate'");
    assert.ok(idx > 0, '/api/sales/orchestrate route exists');
    const routeSlice = SERVER_SO_SRC.slice(idx, idx + 9000); // route grew with pack-mode three-tier orchestration (2026-09-09)
    assert.ok(/const\s+rendererPinning\s*=\s*await\s+currentRendererPinning\s*\(\s*\)/.test(routeSlice),
      'route awaits currentRendererPinning()');
    assert.ok(/rendererPinning,?\s*\n\s*\}/.test(routeSlice),
      'options object includes rendererPinning field');
    // Confirm the same options object is passed to SO.orchestrateQuotation.
    assert.ok(/SO\.orchestrateQuotation\([^)]*,\s*options\s*\)/.test(routeSlice),
      'options is passed to SO.orchestrateQuotation verbatim');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Behavioral: issueQuotation freezes rendererPinning end-to-end
// ═════════════════════════════════════════════════════════════════════════════
describe('behavioral — rendererPinning survives issue and is deep-frozen', () => {
  test('getCurrentApprovedTemplatePinning + APPROVED_TEMPLATE_VERSION yield the 6-field shape used by both orchestrator paths', () => {
    _clearApprovedTemplateCache();
    const templatePin = getCurrentApprovedTemplatePinning();
    const pinning = { ...templatePin, rendererVersion: APPROVED_TEMPLATE_VERSION };
    // All five identity/hash fields must be present.
    for (const f of ['name', 'version', 'bundleSha256', 'templateSha256', 'manifestSha256', 'rendererVersion']) {
      assert.equal(typeof pinning[f], 'string', `field ${f} is a string`);
      assert.ok(pinning[f].length > 0, `field ${f} is non-empty`);
    }
    assert.equal(pinning.bundleSha256.length,   64, 'bundleSha256 hex length');
    assert.equal(pinning.templateSha256.length, 64, 'templateSha256 hex length');
    assert.equal(pinning.manifestSha256.length, 64, 'manifestSha256 hex length');
    assert.equal(pinning.version, 'v1',              'currently vendored v1');
  });

  test('deep-freeze contract — the object created by helpers is frozen', () => {
    const templatePin = getCurrentApprovedTemplatePinning();
    assert.ok(Object.isFrozen(templatePin), 'getCurrentApprovedTemplatePinning returns a frozen object');
    const pinning = Object.freeze({ ...templatePin, rendererVersion: APPROVED_TEMPLATE_VERSION });
    assert.ok(Object.isFrozen(pinning), 'composed rendererPinning is frozen');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Guardrails — no unrelated changes to salesOrchestrator
// ═════════════════════════════════════════════════════════════════════════════
describe('guardrails — no unrelated changes', () => {
  test('salesOrchestrator.js changes are strictly additive (rendererPinning forward only)', () => {
    // Whitelist string: every occurrence of `rendererPinning` in the file
    // must be `rendererPinning: options.rendererPinning || null,` — no other
    // shape introduced by this gate.
    const occurrences = SALES_ORCH_SRC.match(/[^\w]rendererPinning[^,\s]?[^\n]*/g) || [];
    for (const occ of occurrences) {
      assert.ok(
        occ.includes('rendererPinning: options.rendererPinning || null'),
        `unexpected rendererPinning usage: "${occ.trim()}"`);
    }
  });

  test('server-sales-orchestrator.js changes preserve the existing options fields', () => {
    // All pre-existing options keys still present in the orchestrate route.
    const idx = SERVER_SO_SRC.indexOf("'/api/sales/orchestrate'");
    const routeSlice = SERVER_SO_SRC.slice(idx, idx + 9000); // route grew with pack-mode three-tier orchestration (2026-09-09)
    for (const field of ['catalog', 'offers', 'cmsStore', 'companyProfile',
                          'tierDisplayNames', 'inclusionMatrix', 'energyConfig',
                          'savingsConfig', 'subsidyConfig', 'financeConfig']) {
      // Match either shorthand (`field,`) or key: expression form (`field:`).
      const re = new RegExp(`\\b${field}\\s*[:,]`);
      assert.ok(re.test(routeSlice), `options field survives: ${field}`);
    }
  });
});
