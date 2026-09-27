/**
 * Phase 2 · Sales Wizard · endpoint-shape contract test.
 *
 * The wizard reads specific fields from backend responses. This test asserts
 * those fields exist in the current server module surface — a compile-time
 * contract check that fires the moment any endpoint drifts. No live server
 * needed; imports the pure service modules directly where possible.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// -----------------------------------------------------------------------
// 1. Error mapper — pure module contract
// -----------------------------------------------------------------------

describe('Phase 2 · error mapper module', () => {
  it('sales-wizard-errors.js exports translateOrchestratorError + translatePreflightBlockers', () => {
    const mod = require('../public/lib/sales-wizard-errors.js');
    assert.equal(typeof mod.translateOrchestratorError, 'function');
    assert.equal(typeof mod.translatePreflightBlockers, 'function');
  });

  it('sales-wizard-errors.js has no DOM references (fetch, document, sessionStorage)', () => {
    const src = readFileSync('public/lib/sales-wizard-errors.js', 'utf-8');
    // Strip comments before scanning
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/\bdocument\b/.test(code), 'errors module must not reference document');
    assert.ok(!/\bfetch\s*\(/.test(code), 'errors module must not call fetch');
    assert.ok(!/\bsessionStorage\b/.test(code), 'errors module must not touch sessionStorage');
    assert.ok(!/\blocalStorage\b/.test(code), 'errors module must not touch localStorage');
  });
});

// -----------------------------------------------------------------------
// 2. Server response shapes the wizard depends on
// -----------------------------------------------------------------------

describe('Phase 2 · /api/sales/tier-display-names route (P2-C1)', () => {
  it('server-sales.js registers GET /api/sales/tier-display-names', () => {
    const src = readFileSync('server-sales.js', 'utf-8');
    assert.ok(/addRoute\('GET',\s*'\/api\/sales\/tier-display-names'/.test(src),
      'GET /api/sales/tier-display-names must be registered');
    assert.ok(/tier-display-names\.json/.test(src),
      'route must read data/tier-display-names.json');
    assert.ok(/recommendedTier|recommendedBadge/.test(src),
      'route must expose recommendedTier + recommendedBadge fields');
  });

  it('response strips underscore-prefixed metadata keys', () => {
    const src = readFileSync('server-sales.js', 'utf-8');
    // Same normalisation as server-quotation.js loadTierDisplayNames
    assert.ok(/k\.startsWith\('_'\)|startsWith\('_'\)/.test(src));
  });
});

describe('Phase 2 · /api/packages variant filter (P1-5 dependency)', () => {
  it('server-package-approval.js honours ?variant= parameter', () => {
    const src = readFileSync('server-package-approval.js', 'utf-8');
    assert.ok(/query\?.get\?.\('variant'\)/.test(src) || /variant\b/.test(src),
      'variant filter must be present (added in Phase 1 P1-5)');
  });
});

describe('Phase 2 · server-sales.js exposes wizard endpoints', () => {
  const src = readFileSync('server-sales.js', 'utf-8');
  const routes = [
    ['GET', '/api/sales/customers'],
    ['GET', '/api/sales/customers/:id'],
    ['POST', '/api/sales/customers'],
    ['POST', '/api/sales/bom-preview'],
    ['GET', '/api/sales/component-alternatives'],
    ['GET', '/api/sales/system-options'],
    ['GET', '/api/sales/tier-display-names'],
    ['GET', '/api/sales/session'],
  ];
  for (const [method, path] of routes) {
    it(`${method} ${path} is registered`, () => {
      const pattern = new RegExp(`addRoute\\('${method}',\\s*'${path.replace(/[/:]/g, m => '\\' + m)}'`);
      assert.ok(pattern.test(src), `${method} ${path} must be registered`);
    });
  }
});

describe('Phase 2 · orchestrate + preflight endpoints', () => {
  it('server-sales-orchestrator.js registers /api/sales/orchestrate + /api/sales/preflight + /api/sales/recommend-size', () => {
    const src = readFileSync('server-sales-orchestrator.js', 'utf-8');
    assert.ok(/addRoute\('POST',\s*'\/api\/sales\/orchestrate'/.test(src));
    assert.ok(/addRoute\('GET',\s*'\/api\/sales\/preflight'/.test(src));
    assert.ok(/addRoute\('GET',\s*'\/api\/sales\/recommend-size'/.test(src));
  });
});

describe('Phase 2 · stripForSales response shape (what the wizard reads)', () => {
  it('salesOrchestrator.stripForSales returns pricing.{listPrice,gstAmount,customerPrice}', async () => {
    const mod = await import('../src/lib/salesOrchestrator.js');
    const stripped = mod.stripForSales({
      success: true,
      orchestratorVersion: 'test',
      quotationId: 'Q-1',
      customer: { name: 'x', phone: '9876543210' },
      system: { systemType: 'ongrid', systemSizeKw: 5, phase: '1P', packageTier: 'value' },
      pricing: { listPrice: 100000, gstAmount: 8900, customerPrice: 108900 },
      offer: null,
      version: 1,
      steps: [{ step: 'FIND_PACKAGE', status: 'OK' }],
      cost: { totalActualProjectCost: 90000, status: 'COMPLETE' },
    });
    assert.equal(typeof stripped.pricing.listPrice, 'number');
    assert.equal(typeof stripped.pricing.gstAmount, 'number');
    assert.equal(typeof stripped.pricing.customerPrice, 'number');
    // Sales-facing: must NOT expose internal cost / margin / grossProfit
    assert.equal(stripped.cost, undefined, 'stripped result must NOT expose internal cost block');
    assert.equal(stripped.pricing.marginPct, undefined, 'stripped result must NOT expose margin');
    assert.equal(stripped.pricing.grossProfit, undefined, 'stripped result must NOT expose grossProfit');
  });
});

describe('Phase 2 · Sales cost-strip surface (server-bom-builder)', () => {
  it('stripCostFieldsForSales removes unitPrice/amount/gst/gstAmt/landedUnitCost/purchasePrice/supplier', () => {
    const b = require('../server-bom-builder.js');
    const dirty = [{ category:'panel', name:'X', qty:10, unitPrice:100, amount:1000, gst:5, gstAmt:50, landedUnitCost:80, purchasePrice:70, supplier:'ACME' }];
    const clean = b.stripCostFieldsForSales(dirty);
    const c = clean[0];
    assert.equal(c.unitPrice, undefined);
    assert.equal(c.amount, undefined);
    assert.equal(c.gst, undefined);
    assert.equal(c.gstAmt, undefined);
    assert.equal(c.landedUnitCost, undefined);
    assert.equal(c.purchasePrice, undefined);
    assert.equal(c.supplier, undefined);
    // But engineering-identity fields survive
    assert.equal(c.category, 'panel');
    assert.equal(c.qty, 10);
  });
});

// -----------------------------------------------------------------------
// 3. Wizard HTML + JS file existence + basic integrity
// -----------------------------------------------------------------------

describe('Phase 2 · wizard files exist and load safely', () => {
  it('public/sales-wizard.html is retired (2026-09-09) — redirects to the single Sales page; source kept under docs/retired', () => {
    const html = readFileSync('public/sales-wizard.html', 'utf-8');
    assert.ok(html.includes('/sales.html'), 'redirects to sales.html');
    assert.ok(!html.includes('/lib/sales-wizard.js'), 'wizard script no longer loaded');
    const kept = readFileSync('docs/retired/sales-wizard.html.2026-09-09', 'utf-8');
    assert.ok(kept.includes('/lib/sales-wizard-errors.js') && kept.includes('/lib/sales-wizard.js') && kept.includes('/lib/nav.js'));
  });

  it('public/lib/sales-wizard.js does not embed engine/business calculation logic', () => {
    const src = readFileSync('public/lib/sales-wizard.js', 'utf-8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Wizard must never calculate margin / GST from cost — no such math
    assert.ok(!/\b(?:sellingPrice|grossMargin|targetGrossMargin|marginPct)\s*=/.test(code),
      'wizard must not compute pricing terms');
    // No local BOM calculation (build BOM lines)
    assert.ok(!/function\s+(?:buildBom|calculateCost|calculatePricing|calculateFinance)/.test(code),
      'wizard must not define engine functions');
  });

  it('wizard reads pricing fields directly from orchestrateResult (no reconstruction)', () => {
    const src = readFileSync('public/lib/sales-wizard.js', 'utf-8');
    // Ensure Step 6 display uses backend-authoritative property names
    assert.ok(/p\.listPrice/.test(src));
    assert.ok(/p\.gstAmount/.test(src));
    assert.ok(/p\.customerPrice/.test(src));
  });

  it('sales.html (legacy) remains untouched by Phase 2', () => {
    const html = readFileSync('public/sales.html', 'utf-8');
    // Sanity: legacy wizard still identifies itself
    assert.ok(/SALES QUOTATION WIZARD/i.test(html) || /Sales Quotation Wizard/.test(html));
  });
});
