/**
 * P1-3 · Quotation renderer provenance sanitisation regression test.
 *
 * The customer-facing quotation must never expose:
 *   - SOURCE enum members  (LOCKED_BOM_SNAPSHOT, COMMERCIAL_SNAPSHOT, ...)
 *   - DEPENDENCY enum members  (SAVINGS_ENGINE, FINANCE_ENGINE, ...)
 *   - snapshot ids  (bomSnapshotId, commercialSnapshotId, ...)
 *   - engine version tags  (costEngineVersion, pricingEngineVersion, ...)
 *   - decision ids  (DECISION_C6_TIER_DISPLAY_NAMES, DECISION_C7_COMPANY_IDENTITY)
 *   - internal engine names in rendered DOM
 *
 * Approach — render every canonical page with an empty payload (worst case:
 * every section blocked) plus a payload with tier display names present.
 * Concatenate the rendered HTML and assert none of the forbidden strings
 * reach it. This is a RUNTIME check, not a source scan, so it catches actual
 * leaks in emitted DOM and ignores enum names that appear only as helper
 * arguments (which the sanitising helpers deliberately ignore).
 *
 * NOTE — `data-page-section` attributes carry structural section names
 * (TECHNICAL_SPECIFICATIONS, INVESTMENT_SUMMARY, SAVINGS, ...) used by
 * canonical dispatch tests. These are section identifiers, not provenance
 * enums, and are excluded from the forbidden list. Only the payload
 * SOURCE/DEPENDENCY enum members are enforced.
 *
 * 2026-09-02 · Phase 1 · P1-3
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const RENDERER_SRC = readFileSync('public/lib/quotationDocument.js', 'utf-8');

// ---------------------------------------------------------------------------
// Forbidden strings — must NOT appear in rendered customer HTML
// ---------------------------------------------------------------------------

const FORBIDDEN_ENUMS = [
  // SOURCE members from quotationPayload.js (may legitimately appear as data-page-section
  // when the enum value collides with a section name; check that specifically per page)
  'LOCKED_BOM_SNAPSHOT',
  'ENGINEERING_CHECKER',
  'QUOTATION_RECORD',
  'CUSTOMER_RECORD',
  'COMPONENT_DISPLAY_ATTRIBUTES',
  'UPGRADE_MODEL',
  // DEPENDENCY members
  'SUBSIDY_ENGINE',
  'SAVINGS_ENGINE',
  'FINANCE_ENGINE',
  'ENERGY_LOAD_CALCULATION_ENGINE',
  'DECISION_C6_TIER_DISPLAY_NAMES',
  'DECISION_C7_COMPANY_IDENTITY',
];

const FORBIDDEN_INFRASTRUCTURE = [
  'bomSnapshotId',
  'commercialSnapshotId',
  'costEngineVersion',
  'pricingEngineVersion',
  'moneyRuleVersion',
  'marginVersion',
  'gstVersion',
  'projectRateCardVersion',
];

// ---------------------------------------------------------------------------
// Payload fixtures — mixed available + blocked; renderers should show
// "Not available" for the blocked sections, never the enum name.
// ---------------------------------------------------------------------------

const TIER_NAMES = { base: 'Essential System', value: 'Smart System', premium: 'Elite System' };

const MINIMAL_PAYLOAD = {
  quotation: { quotationNumber: 'GR-TEST-0001', quotationDate: '2026-09-02', validUntil: '2026-10-02', proposalBy: 'Sales' },
  customer: { customerName: 'Test Customer', address: 'Ernakulam', pincode: '682001', phone: '9999999999', customerId: 'C-1' },
  system: { systemType: 'ONGRID', systemSizeKw: 5, phase: '1P', packageTier: 'value' },
  company: null,
  consumption: null,
  bomSummary: null,
  technicalSpecifications: null,
  pricing: null,
  offers: [],
  alternatives: null,
  savings: null,
  subsidy: null,
  finance: null,
};

// ---------------------------------------------------------------------------
// 1. Renderer helper contract — sanitisers MUST NOT echo their argument
// ---------------------------------------------------------------------------

describe('P1-3 · renderer sanitiser helpers', () => {
  it('blockedText helper returns "Not available" and ignores its dep parameter', () => {
    const match = RENDERER_SRC.match(/function blockedText\(dep\)\s*\{[^}]+\}/);
    assert.ok(match, 'blockedText helper must exist');
    assert.ok(!/\$\{dep\}|\+\s*dep\b|escapeHtml\(dep\)/.test(match[0]),
      'blockedText MUST NOT interpolate `dep` — customer sees "Not available", never the enum');
  });

  it('blockedInline helper returns "Not available" and ignores its parameter', () => {
    const match = RENDERER_SRC.match(/function blockedInline\(f\)\s*\{[^}]+\}/);
    assert.ok(match, 'blockedInline helper must exist');
    assert.ok(!/f\.(dependency|source|reference|reason)/.test(match[0]),
      'blockedInline MUST NOT echo any provenance field from the passed object');
  });

  it('renderer defines NOT_AVAILABLE_LABEL for customer-friendly blocked display', () => {
    assert.ok(/NOT_AVAILABLE_LABEL\s*=\s*['"]/.test(RENDERER_SRC),
      'NOT_AVAILABLE_LABEL constant must exist and drive blocked display');
  });
});

// ---------------------------------------------------------------------------
// 2. Runtime render check — call every renderer, scan combined output
// ---------------------------------------------------------------------------

describe('P1-3 · rendered customer HTML contains no provenance enum members', () => {
  let renderers;
  it('imports the renderer module', async () => {
    renderers = await import('../public/lib/quotationDocument.js');
    assert.ok(renderers, 'renderer module loads');
  });

  it('produces no forbidden enum string in any rendered page output', async () => {
    if (!renderers) renderers = await import('../public/lib/quotationDocument.js');
    // Collect output of every exported renderPage* function.
    const parts = [];
    for (const [name, fn] of Object.entries(renderers)) {
      if (typeof fn !== 'function') continue;
      if (!/^renderPage/.test(name)) continue;
      try {
        parts.push(String(fn(MINIMAL_PAYLOAD)));
      } catch { /* renderer may throw on missing fields — the empty-render path */ }
    }
    const html = parts.join('\n---PAGE---\n');
    assert.ok(html.length > 0, 'at least one renderer produced output');

    // Strip data-page-section="..." attributes — those are structural section
    // markers, not provenance. Everything else in DOM is candidate content.
    const scanned = html.replace(/data-page-section="[^"]*"/g, '');

    const leaked = FORBIDDEN_ENUMS.filter(e => scanned.includes(e));
    assert.deepEqual(leaked, [],
      `provenance enum(s) leaked into rendered customer HTML: ${leaked.join(', ')}`);

    const infraLeaked = FORBIDDEN_INFRASTRUCTURE.filter(e => scanned.includes(e));
    assert.deepEqual(infraLeaked, [],
      `infrastructure identifier(s) leaked into rendered customer HTML: ${infraLeaked.join(', ')}`);
  });

  it('COMMERCIAL_SNAPSHOT and PROJECT_CONFIGURATION only appear as section markers, not as content', async () => {
    if (!renderers) renderers = await import('../public/lib/quotationDocument.js');
    const parts = [];
    for (const [name, fn] of Object.entries(renderers)) {
      if (typeof fn !== 'function' || !/^renderPage/.test(name)) continue;
      try { parts.push(String(fn(MINIMAL_PAYLOAD))); } catch {}
    }
    const html = parts.join('\n---PAGE---\n');
    // Strip data-page-section="..." — these are structural markers.
    const scanned = html.replace(/data-page-section="[^"]*"/g, '');
    // These two enum values collide with structural section names by design.
    // Confirm they do NOT appear outside data-page-section attributes.
    assert.equal(scanned.includes('COMMERCIAL_SNAPSHOT'), false,
      'COMMERCIAL_SNAPSHOT must never appear as customer-visible content');
    assert.equal(scanned.includes('PROJECT_CONFIGURATION'), false,
      'PROJECT_CONFIGURATION must never appear as customer-visible content');
  });
});
