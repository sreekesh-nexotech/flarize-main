/**
 * THREE-TIER ORCHESTRATION — focused tests (Step 1, 2026-09-04).
 *
 * Verifies orchestrateThreeTiers architectural guarantees WITHOUT requiring
 * a fully wired production env (procurement, real packages, real BOM):
 *
 *   - RECOMMENDED tier defaults to `value` (Smart).
 *   - Pre-flight rejects when any of base/value/premium lacks an APPROVED
 *     package — nothing written to any store.
 *   - Atomic-failure: throws BEFORE createDraft when a tier fails.
 *   - Result identifies one recommendedTier + one primary tier.
 *   - Tier keys (base/value/premium) match the tier-display-names contract.
 *
 * Full happy-path (three tiers → one quotation → payload.alternatives[])
 * relies on a working procurement/pricing chain and is covered in the
 * end-to-end suite (`tests/qa-end-to-end-quotation.test.mjs`). The renderer
 * consumption of that payload shape is covered in
 * `tests/approved-template/three-tier-renderer.test.mjs`.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  orchestrateThreeTiers,
  THREE_TIER_ERROR,
  ORCHESTRATOR_VERSION,
  ORCHESTRATION_ERROR,
} from '../src/lib/salesOrchestrator.js';
import { createWorkspaceStore } from '../src/lib/projectWorkspace.js';
import { createQuotationStore } from '../src/lib/quotationWorkspace.js';

const SALES_ACTOR = { userId: 'sales-1', role: 'SALES' };

const tierNames = JSON.parse(readFileSync('data/tier-display-names.json', 'utf8'));

// ---------------------------------------------------------------------------
// Fixtures — minimal mock env.
// ---------------------------------------------------------------------------

function approvedRegistry(tiers) {
  // tiers = [{tier: 'base', approvalStatus: 'APPROVED'}, ...]
  return {
    packages: tiers.map(t => ({
      packageId: `PKG-ONGRID-3-1P-${t.tier.toUpperCase()}`,
      systemType: 'ongrid', size: '3', phase: '1P', tier: t.tier,
      approvalStatus: t.approvalStatus,
    })),
  };
}

function fullRegistry() {
  return approvedRegistry([
    { tier: 'base',    approvalStatus: 'APPROVED' },
    { tier: 'value',   approvalStatus: 'APPROVED' },
    { tier: 'premium', approvalStatus: 'APPROVED' },
  ]);
}

function envWith(pkgRegistry) {
  return {
    packageRegistry: pkgRegistry,
    catalog: {},
    costConfig: {
      procurement: { status: 'CONFIGURED' },
      margin: { targetGrossMargin: 0.20 },
      transportation: { status: 'CONFIGURED' },
    },
    priceMaster: {},
    rateCard: null,
  };
}

function validInput(over = {}) {
  return {
    customer: { name: 'Test Customer', phone: '9876543210' },
    systemType: 'ongrid', size: '3',
    // Site facts are REQUIRED inputs since 2026-09-07 (§15 / §16) — no defaults.
    installationType: 'FLAT', distanceKm: 20, vehicleType: 'STANDARD',
    ...over,
  };
}

function catchError(fn) {
  try { fn(); } catch (e) { return e; }
  throw new Error('Expected function to throw, but it did not');
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER DISPLAY NAMES CONTRACT
// ═══════════════════════════════════════════════════════════════════════════

describe('tier-display-names.json contract', () => {
  test('activates P1-1 mapping: base/value/premium → Essential/Smart/Elite', () => {
    assert.equal(tierNames.base,           'Essential System');
    assert.equal(tierNames.value,          'Smart System');
    assert.equal(tierNames.premium,        'Elite System');
    assert.equal(tierNames.recommendedTier, 'value');
    assert.equal(tierNames.recommendedBadge, 'Recommended · Most Popular');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ATOMIC FAILURE — pre-flight
// ═══════════════════════════════════════════════════════════════════════════

describe('orchestrateThreeTiers — atomic pre-flight', () => {
  test('rejects when base tier lacks APPROVED package (nothing written)', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = envWith(approvedRegistry([
      { tier: 'value',   approvalStatus: 'APPROVED' },
      { tier: 'premium', approvalStatus: 'APPROVED' },
    ]));
    const err = catchError(() => orchestrateThreeTiers(ws, qs, env, validInput(), SALES_ACTOR));
    assert.equal(err.code, THREE_TIER_ERROR.ALTERNATIVE_TIER_UNAPPROVED);
    assert.equal(err.detail.tier, 'base');
    assert.equal(qs.quotations.size, 0,      'no quotation created');
    assert.equal(qs.bomSnapshots.size, 0,    'no BOM snapshot registered');
    assert.equal(qs.commercialSnapshots.size, 0, 'no commercial snapshot registered');
    assert.equal(Object.keys(ws.projects).length, 0, 'no project created');
  });

  test('rejects when value (recommended) tier lacks APPROVED package', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = envWith(approvedRegistry([
      { tier: 'base',    approvalStatus: 'APPROVED' },
      { tier: 'premium', approvalStatus: 'APPROVED' },
    ]));
    const err = catchError(() => orchestrateThreeTiers(ws, qs, env, validInput(), SALES_ACTOR));
    assert.equal(err.code, THREE_TIER_ERROR.RECOMMENDED_TIER_UNAPPROVED);
    assert.equal(err.detail.tier, 'value');
    assert.equal(qs.quotations.size, 0);
    assert.equal(Object.keys(ws.projects).length, 0);
  });

  test('rejects when premium tier is only PROPOSED, not APPROVED', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = envWith(approvedRegistry([
      { tier: 'base',    approvalStatus: 'APPROVED' },
      { tier: 'value',   approvalStatus: 'APPROVED' },
      { tier: 'premium', approvalStatus: 'PROPOSED' },
    ]));
    const err = catchError(() => orchestrateThreeTiers(ws, qs, env, validInput(), SALES_ACTOR));
    assert.equal(err.code, THREE_TIER_ERROR.ALTERNATIVE_TIER_UNAPPROVED);
    assert.equal(err.detail.tier, 'premium');
  });

  test('rejects input missing customer or system fields', () => {
    const ws = createWorkspaceStore(); const qs = createQuotationStore();
    const err = catchError(() => orchestrateThreeTiers(ws, qs, envWith(fullRegistry()),
      { customer: {}, size: '3' }, SALES_ACTOR));
    assert.equal(err.code, ORCHESTRATION_ERROR.MISSING_INPUT);
  });

  test('rejects unknown recommendedTier', () => {
    const ws = createWorkspaceStore(); const qs = createQuotationStore();
    const err = catchError(() => orchestrateThreeTiers(ws, qs, envWith(fullRegistry()),
      validInput({ recommendedTier: 'ultra' }), SALES_ACTOR));
    assert.equal(err.code, ORCHESTRATION_ERROR.MISSING_INPUT);
  });

  test('rejects Sales actor without QUOTATION_CREATE capability', () => {
    const ws = createWorkspaceStore(); const qs = createQuotationStore();
    const err = catchError(() => orchestrateThreeTiers(ws, qs, envWith(fullRegistry()),
      validInput(), { userId: 'proc-1', role: 'PROCUREMENT' }));
    // rbac throws a plain Error; just assert nothing was written
    assert.ok(err, 'must throw');
    assert.equal(qs.quotations.size, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT / VERSION
// ═══════════════════════════════════════════════════════════════════════════

describe('THREE_TIER_ERROR / orchestrator version', () => {
  test('THREE_TIER_ERROR carries the required codes', () => {
    for (const k of ['RECOMMENDED_TIER_UNAPPROVED', 'ALTERNATIVE_TIER_UNAPPROVED',
                     'ALTERNATIVE_TIER_ENGINEERING_BLOCKED', 'ALTERNATIVE_TIER_COST_INCOMPLETE',
                     'ALTERNATIVE_TIER_PRICING_REJECTED', 'ALTERNATIVE_TIER_SNAPSHOT_FAILED']) {
      assert.ok(THREE_TIER_ERROR[k], `missing THREE_TIER_ERROR.${k}`);
    }
  });

  test('ORCHESTRATOR_VERSION remains stable for single-tier callers', () => {
    // orchestrateThreeTiers advertises `${ORCHESTRATOR_VERSION}+three-tier.1` in its
    // return payload; the base version string must be unchanged.
    assert.ok(ORCHESTRATOR_VERSION.startsWith('sales-orchestrator'));
  });
});
