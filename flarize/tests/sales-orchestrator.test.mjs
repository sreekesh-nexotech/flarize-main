/**
 * SALES ORCHESTRATOR — UNIT TESTS.
 *
 * Covers:
 *   1. preflightCheck — all blocker codes and the canProceed flag
 *   2. orchestrateQuotation — input validation and RBAC error paths
 *   3. ORCHESTRATOR_VERSION export
 *
 * The orchestrator delegates to frozen engines and workspace services.
 * Full happy-path orchestration requires a complete env (catalog, costConfig,
 * priceMaster, rateCard, packageRegistry with APPROVED packages). These tests
 * focus on the orchestrator's own logic: input validation, preflight blockers,
 * and RBAC enforcement.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  preflightCheck,
  orchestrateQuotation,
  ORCHESTRATOR_VERSION,
  ORCHESTRATION_ERROR,
} from '../src/lib/salesOrchestrator.js';

import { createWorkspaceStore } from '../src/lib/projectWorkspace.js';
import { createQuotationStore } from '../src/lib/quotationWorkspace.js';

// ---------------------------------------------------------------------------
// Helpers — minimal mock data
// ---------------------------------------------------------------------------

const SALES_ACTOR = { userId: 'sales-1', role: 'SALES' };
const ADMIN_ACTOR = { userId: 'admin-1', role: 'ADMIN' };
const ENGINEERING_ACTOR = { userId: 'eng-1', role: 'ENGINEERING' };
const PROCUREMENT_ACTOR = { userId: 'proc-1', role: 'PROCUREMENT' };

/** Capture the thrown error — returns it for property inspection. */
function catchError(fn) {
  try { fn(); } catch (e) { return e; }
  throw new Error('Expected function to throw, but it did not');
}

/** Builds a minimal package registry with one APPROVED package. */
function approvedRegistry() {
  return {
    packages: [{
      packageId: 'PKG-ONGRID-3-1P-BASE',
      systemType: 'ongrid',
      size: '3',
      phase: '1P',
      tier: 'base',
      approvalStatus: 'APPROVED',
    }],
  };
}

/** Builds a minimal package registry where the package is still PROPOSED. */
function proposedRegistry() {
  return {
    packages: [{
      packageId: 'PKG-ONGRID-3-1P-BASE',
      systemType: 'ongrid',
      size: '3',
      phase: '1P',
      tier: 'base',
      approvalStatus: 'PROPOSED',
    }],
  };
}

/** Empty registry — no package at all. */
function emptyRegistry() {
  return { packages: [] };
}

/** Minimal env that passes all preflight checks. */
function completeEnv() {
  return {
    packageRegistry: approvedRegistry(),
    costConfig: {
      procurement: { status: 'CONFIGURED' },
      margin: { targetGrossMargin: 0.20 },
      transportation: { status: 'CONFIGURED' },
    },
  };
}

/** Minimal valid Sales input. */
function validInput() {
  return {
    customer: { name: 'Test Customer', phone: '9876543210' },
    systemType: 'ongrid',
    size: '3',
    tier: 'base',
    // Site facts are REQUIRED inputs since 2026-09-07 (§15 exact installation
    // type, §16 one-way distance × vehicle) — the orchestrator applies no defaults.
    installationType: 'FLAT',
    distanceKm: 20,
    vehicleType: 'STANDARD',
  };
}

// ===========================================================================
// 1. ORCHESTRATOR_VERSION
// ===========================================================================

describe('ORCHESTRATOR_VERSION', () => {
  test('is a non-empty string', () => {
    assert.equal(typeof ORCHESTRATOR_VERSION, 'string');
    assert.ok(ORCHESTRATOR_VERSION.length > 0, 'version must not be empty');
  });

  test('starts with "sales-orchestrator"', () => {
    assert.ok(ORCHESTRATOR_VERSION.startsWith('sales-orchestrator'),
      `expected version to start with "sales-orchestrator", got "${ORCHESTRATOR_VERSION}"`);
  });
});

// ===========================================================================
// 2. preflightCheck
// ===========================================================================

describe('preflightCheck', () => {
  test('canProceed: true when approved package exists and config is complete', () => {
    const env = completeEnv();
    const result = preflightCheck(env, {
      systemType: 'ongrid', size: '3', phase: '1P', tier: 'base',
    });
    assert.equal(result.canProceed, true);
    assert.deepEqual(result.blockers, []);
    assert.equal(result.packageId, 'PKG-ONGRID-3-1P-BASE');
  });

  test('canProceed: true — derives phase "1P" when not supplied', () => {
    const env = completeEnv();
    const result = preflightCheck(env, {
      systemType: 'ongrid', size: '3', tier: 'base',
      // phase omitted — default is '1P'
    });
    assert.equal(result.canProceed, true);
    assert.equal(result.packageId, 'PKG-ONGRID-3-1P-BASE');
  });

  // ---- NO_APPROVED_PACKAGE ----

  test('NO_APPROVED_PACKAGE — no package at all', () => {
    const env = { ...completeEnv(), packageRegistry: emptyRegistry() };
    const result = preflightCheck(env, {
      systemType: 'ongrid', size: '3', phase: '1P', tier: 'base',
    });
    assert.equal(result.canProceed, false);
    assert.equal(result.packageId, null);
    const blocker = result.blockers.find(b => b.code === 'NO_APPROVED_PACKAGE');
    assert.ok(blocker, 'expected NO_APPROVED_PACKAGE blocker');
    assert.ok(blocker.message.includes('No package exists'), blocker.message);
    assert.equal(blocker.owner, 'PROJECT_HEAD');
  });

  test('NO_APPROVED_PACKAGE — package exists but is PROPOSED', () => {
    const env = { ...completeEnv(), packageRegistry: proposedRegistry() };
    const result = preflightCheck(env, {
      systemType: 'ongrid', size: '3', phase: '1P', tier: 'base',
    });
    assert.equal(result.canProceed, false);
    assert.equal(result.packageId, null);
    const blocker = result.blockers.find(b => b.code === 'NO_APPROVED_PACKAGE');
    assert.ok(blocker);
    assert.ok(blocker.message.includes('PROPOSED'), blocker.message);
    assert.ok(blocker.message.includes('Engineering approval required'), blocker.message);
  });

  test('NO_APPROVED_PACKAGE — wrong systemType mismatch', () => {
    const env = completeEnv(); // has ongrid 3kW
    const result = preflightCheck(env, {
      systemType: 'hybrid', size: '3', phase: '1P', tier: 'base',
    });
    assert.equal(result.canProceed, false);
    const blocker = result.blockers.find(b => b.code === 'NO_APPROVED_PACKAGE');
    assert.ok(blocker);
  });

  // ---- PROCUREMENT_NOT_CONFIGURED ----

  test('PROCUREMENT_NOT_CONFIGURED — status NOT_CONFIGURED', () => {
    const env = completeEnv();
    env.costConfig.procurement = { status: 'NOT_CONFIGURED' };
    const result = preflightCheck(env, {
      systemType: 'ongrid', size: '3', phase: '1P', tier: 'base',
    });
    assert.equal(result.canProceed, false);
    const blocker = result.blockers.find(b => b.code === 'PROCUREMENT_NOT_CONFIGURED');
    assert.ok(blocker, 'expected PROCUREMENT_NOT_CONFIGURED blocker');
    assert.equal(blocker.owner, 'PROCUREMENT');
    assert.ok(blocker.message.includes('landed cost'), blocker.message);
  });

  test('PROCUREMENT_NOT_CONFIGURED — status DECISION_CLOSED_VALUES_NOT_CONFIGURED', () => {
    const env = completeEnv();
    env.costConfig.procurement = { status: 'DECISION_CLOSED_VALUES_NOT_CONFIGURED' };
    const result = preflightCheck(env, {
      systemType: 'ongrid', size: '3', phase: '1P', tier: 'base',
    });
    assert.equal(result.canProceed, false);
    const blocker = result.blockers.find(b => b.code === 'PROCUREMENT_NOT_CONFIGURED');
    assert.ok(blocker, 'DECISION_CLOSED_VALUES_NOT_CONFIGURED should also trigger this blocker');
  });

  // ---- TRANSPORTATION_NOT_CONFIGURED ----

  test('TRANSPORTATION_NOT_CONFIGURED', () => {
    const env = completeEnv();
    env.costConfig.transportation = { status: 'NOT_CONFIGURED' };
    const result = preflightCheck(env, {
      systemType: 'ongrid', size: '3', phase: '1P', tier: 'base',
    });
    assert.equal(result.canProceed, false);
    const blocker = result.blockers.find(b => b.code === 'TRANSPORTATION_NOT_CONFIGURED');
    assert.ok(blocker, 'expected TRANSPORTATION_NOT_CONFIGURED blocker');
    assert.equal(blocker.owner, 'PROJECT_HEAD');
  });

  test('TRANSPORTATION — no blocker when status is not NOT_CONFIGURED', () => {
    const env = completeEnv();
    env.costConfig.transportation = { status: 'CONFIGURED' };
    const result = preflightCheck(env, {
      systemType: 'ongrid', size: '3', phase: '1P', tier: 'base',
    });
    const blocker = result.blockers.find(b => b.code === 'TRANSPORTATION_NOT_CONFIGURED');
    assert.equal(blocker, undefined);
  });

  // ---- MARGIN_NOT_CONFIGURED ----

  test('MARGIN_NOT_CONFIGURED — no margin tiers and no targetGrossMargin', () => {
    const env = completeEnv();
    env.costConfig.margin = {};
    const result = preflightCheck(env, {
      systemType: 'ongrid', size: '3', phase: '1P', tier: 'base',
    });
    assert.equal(result.canProceed, false);
    const blocker = result.blockers.find(b => b.code === 'MARGIN_NOT_CONFIGURED');
    assert.ok(blocker, 'expected MARGIN_NOT_CONFIGURED blocker');
    assert.equal(blocker.owner, 'ADMIN');
  });

  test('MARGIN — no blocker when targetGrossMargin exists', () => {
    const env = completeEnv();
    env.costConfig.margin = { targetGrossMargin: 0.18 };
    const result = preflightCheck(env, {
      systemType: 'ongrid', size: '3', phase: '1P', tier: 'base',
    });
    const blocker = result.blockers.find(b => b.code === 'MARGIN_NOT_CONFIGURED');
    assert.equal(blocker, undefined);
  });

  test('MARGIN — no blocker when tiers exist', () => {
    const env = completeEnv();
    env.costConfig.margin = { tiers: { base: 0.15, value: 0.18, premium: 0.22 } };
    const result = preflightCheck(env, {
      systemType: 'ongrid', size: '3', phase: '1P', tier: 'base',
    });
    const blocker = result.blockers.find(b => b.code === 'MARGIN_NOT_CONFIGURED');
    assert.equal(blocker, undefined);
  });

  // ---- Multiple blockers at once ----

  test('multiple blockers accumulate — all four at once', () => {
    const env = {
      packageRegistry: emptyRegistry(),
      costConfig: {
        procurement: { status: 'NOT_CONFIGURED' },
        margin: {},
        transportation: { status: 'NOT_CONFIGURED' },
      },
    };
    const result = preflightCheck(env, {
      systemType: 'ongrid', size: '3', phase: '1P', tier: 'base',
    });
    assert.equal(result.canProceed, false);
    assert.equal(result.packageId, null);
    const codes = result.blockers.map(b => b.code);
    assert.ok(codes.includes('NO_APPROVED_PACKAGE'), 'missing NO_APPROVED_PACKAGE');
    assert.ok(codes.includes('PROCUREMENT_NOT_CONFIGURED'), 'missing PROCUREMENT_NOT_CONFIGURED');
    assert.ok(codes.includes('MARGIN_NOT_CONFIGURED'), 'missing MARGIN_NOT_CONFIGURED');
    assert.ok(codes.includes('TRANSPORTATION_NOT_CONFIGURED'), 'missing TRANSPORTATION_NOT_CONFIGURED');
    assert.equal(result.blockers.length, 4);
  });

  test('multiple blockers — procurement and margin but package approved', () => {
    const env = {
      packageRegistry: approvedRegistry(),
      costConfig: {
        procurement: { status: 'NOT_CONFIGURED' },
        margin: {},
        transportation: { status: 'CONFIGURED' },
      },
    };
    const result = preflightCheck(env, {
      systemType: 'ongrid', size: '3', phase: '1P', tier: 'base',
    });
    assert.equal(result.canProceed, false);
    // Package found but still blocked by procurement + margin
    assert.equal(result.packageId, 'PKG-ONGRID-3-1P-BASE');
    const codes = result.blockers.map(b => b.code);
    assert.ok(codes.includes('PROCUREMENT_NOT_CONFIGURED'));
    assert.ok(codes.includes('MARGIN_NOT_CONFIGURED'));
    assert.ok(!codes.includes('NO_APPROVED_PACKAGE'));
    assert.equal(result.blockers.length, 2);
  });

  // ---- Edge cases ----

  test('handles missing costConfig gracefully', () => {
    const env = { packageRegistry: approvedRegistry() };
    // costConfig is undefined — margin check should produce MARGIN_NOT_CONFIGURED
    const result = preflightCheck(env, {
      systemType: 'ongrid', size: '3', phase: '1P', tier: 'base',
    });
    // No costConfig means margin block fires; procurement/transportation checks
    // use optional chaining so they do not blow up.
    const codes = result.blockers.map(b => b.code);
    assert.ok(codes.includes('MARGIN_NOT_CONFIGURED'));
  });

  test('handles missing packageRegistry gracefully', () => {
    const env = { costConfig: completeEnv().costConfig };
    // packageRegistry is undefined
    const result = preflightCheck(env, {
      systemType: 'ongrid', size: '3', phase: '1P', tier: 'base',
    });
    assert.equal(result.canProceed, false);
    const codes = result.blockers.map(b => b.code);
    assert.ok(codes.includes('NO_APPROVED_PACKAGE'));
  });

  test('returns packageId when package is approved even if other blockers exist', () => {
    const env = {
      packageRegistry: approvedRegistry(),
      costConfig: { margin: {} }, // margin not configured
    };
    const result = preflightCheck(env, {
      systemType: 'ongrid', size: '3', phase: '1P', tier: 'base',
    });
    assert.equal(result.packageId, 'PKG-ONGRID-3-1P-BASE');
    assert.equal(result.canProceed, false);
  });
});

// ===========================================================================
// 3. orchestrateQuotation — validation and error paths
// ===========================================================================

describe('orchestrateQuotation — input validation', () => {
  test('throws MISSING_INPUT when customer name is missing', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = completeEnv();
    const input = { ...validInput(), customer: { phone: '9876543210' } };

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, SALES_ACTOR));
    assert.equal(err.name, 'OrchestrationError');
    assert.equal(err.code, ORCHESTRATION_ERROR.MISSING_INPUT);
    assert.ok(err.message.includes('Customer name'), err.message);
  });

  test('throws MISSING_INPUT when customer phone is missing', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = completeEnv();
    const input = { ...validInput(), customer: { name: 'Test' } };

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, SALES_ACTOR));
    assert.equal(err.code, ORCHESTRATION_ERROR.MISSING_INPUT);
    assert.ok(err.message.includes('phone'), err.message);
  });

  test('throws MISSING_INPUT when systemType is missing', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = completeEnv();
    const input = { ...validInput(), systemType: undefined };

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, SALES_ACTOR));
    assert.equal(err.code, ORCHESTRATION_ERROR.MISSING_INPUT);
    assert.ok(err.message.includes('System type'), err.message);
  });

  test('throws MISSING_INPUT when size is missing', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = completeEnv();
    const input = { ...validInput(), size: undefined };

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, SALES_ACTOR));
    assert.equal(err.code, ORCHESTRATION_ERROR.MISSING_INPUT);
    assert.ok(err.message.includes('size'), err.message);
  });

  test('throws MISSING_INPUT when tier is missing', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = completeEnv();
    const input = { ...validInput(), tier: undefined };

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, SALES_ACTOR));
    assert.equal(err.code, ORCHESTRATION_ERROR.MISSING_INPUT);
    assert.ok(err.message.includes('tier'), err.message);
  });

  test('throws MISSING_INPUT with multiple errors joined', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = completeEnv();
    const input = { customer: {}, systemType: undefined };

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, SALES_ACTOR));
    assert.equal(err.code, ORCHESTRATION_ERROR.MISSING_INPUT);
    assert.ok(err.detail.errors.length >= 3, 'expected multiple validation errors');
    assert.ok(err.detail.errors.some(e => e.includes('name')));
    assert.ok(err.detail.errors.some(e => e.includes('phone')));
    assert.ok(err.detail.errors.some(e => e.includes('System type')));
  });

  test('MISSING_INPUT error detail contains the errors array', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = completeEnv();
    const input = { customer: { name: 'X' }, systemType: 'ongrid', size: '3' };
    // phone and tier missing

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, SALES_ACTOR));
    assert.equal(err.code, ORCHESTRATION_ERROR.MISSING_INPUT);
    assert.ok(Array.isArray(err.detail.errors));
    assert.ok(err.detail.errors.length >= 2);
  });
});

describe('orchestrateQuotation — RBAC enforcement', () => {
  test('throws RbacError when role lacks QUOTATION_CREATE (ENGINEERING)', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = completeEnv();
    const input = validInput();

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, ENGINEERING_ACTOR));
    assert.equal(err.name, 'RbacError');
    assert.equal(err.code, 'CAPABILITY_DENIED');
    assert.ok(err.message.includes('QUOTATION_CREATE'), err.message);
  });

  test('throws RbacError when role lacks QUOTATION_CREATE (PROCUREMENT)', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = completeEnv();
    const input = validInput();

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, PROCUREMENT_ACTOR));
    assert.equal(err.name, 'RbacError');
    assert.equal(err.code, 'CAPABILITY_DENIED');
  });

  test('throws RbacError when actor is null', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = completeEnv();
    const input = validInput();

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, null));
    assert.equal(err.name, 'RbacError');
    assert.equal(err.code, 'NO_ACTOR');
  });

  test('throws RbacError when actor has no userId', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = completeEnv();
    const input = validInput();

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, { role: 'SALES' }));
    assert.equal(err.name, 'RbacError');
    assert.equal(err.code, 'NO_ACTOR');
  });

  test('throws RbacError for unknown role', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = completeEnv();
    const input = validInput();

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, { userId: 'u1', role: 'HACKER' }));
    assert.equal(err.name, 'RbacError');
    assert.equal(err.code, 'UNKNOWN_ROLE');
  });

  test('RBAC check runs before input validation', () => {
    // Even with invalid input, RBAC should reject first
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = completeEnv();
    const input = {}; // completely invalid input

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, ENGINEERING_ACTOR));
    assert.equal(err.name, 'RbacError', 'RBAC error should fire before input validation');
  });
});

describe('orchestrateQuotation — NO_APPROVED_PACKAGE', () => {
  test('throws NO_APPROVED_PACKAGE when no approved package in registry', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = { ...completeEnv(), packageRegistry: emptyRegistry() };
    const input = validInput();

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, SALES_ACTOR, { at: '2026-08-30T00:00:00Z' }));
    assert.equal(err.name, 'OrchestrationError');
    assert.equal(err.code, ORCHESTRATION_ERROR.NO_APPROVED_PACKAGE);
    assert.ok(err.message.includes('No APPROVED package'), err.message);
  });

  test('throws NO_APPROVED_PACKAGE when package exists but is PROPOSED', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = { ...completeEnv(), packageRegistry: proposedRegistry() };
    const input = validInput();

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, SALES_ACTOR, { at: '2026-08-30T00:00:00Z' }));
    assert.equal(err.code, ORCHESTRATION_ERROR.NO_APPROVED_PACKAGE);
    assert.ok(err.message.includes('PROPOSED'), err.message);
    assert.ok(err.message.includes('Engineering approval required'), err.message);
    assert.equal(err.detail.proposedPackageId, 'PKG-ONGRID-3-1P-BASE');
  });

  test('NO_APPROVED_PACKAGE detail includes system parameters', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = { ...completeEnv(), packageRegistry: emptyRegistry() };
    const input = validInput();

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, SALES_ACTOR, { at: '2026-08-30T00:00:00Z' }));
    assert.equal(err.detail.systemType, 'ongrid');
    assert.equal(err.detail.size, '3');
    assert.equal(err.detail.tier, 'base');
    assert.equal(err.detail.proposedPackageId, null);
  });

  test('NO_APPROVED_PACKAGE error includes step log', () => {
    const ws = createWorkspaceStore();
    const qs = createQuotationStore();
    const env = { ...completeEnv(), packageRegistry: emptyRegistry() };
    const input = validInput();

    const err = catchError(() =>
      orchestrateQuotation(ws, qs, env, input, SALES_ACTOR, { at: '2026-08-30T00:00:00Z' }));
    assert.ok(Array.isArray(err.detail.steps), 'error detail should include steps array');
  });
});

// ===========================================================================
// 4. ORCHESTRATION_ERROR constants
// ===========================================================================

describe('ORCHESTRATION_ERROR constants', () => {
  test('all expected error codes exist', () => {
    assert.equal(ORCHESTRATION_ERROR.NO_APPROVED_PACKAGE, 'NO_APPROVED_PACKAGE');
    assert.equal(ORCHESTRATION_ERROR.ENGINEERING_BLOCKED, 'ENGINEERING_BLOCKED');
    assert.equal(ORCHESTRATION_ERROR.COST_INCOMPLETE, 'COST_INCOMPLETE');
    assert.equal(ORCHESTRATION_ERROR.PRICING_REJECTED, 'PRICING_REJECTED');
    assert.equal(ORCHESTRATION_ERROR.MISSING_INPUT, 'MISSING_INPUT');
    assert.equal(ORCHESTRATION_ERROR.ORCHESTRATION_FAILED, 'ORCHESTRATION_FAILED');
  });

  test('error codes are strings matching their key names', () => {
    for (const [key, value] of Object.entries(ORCHESTRATION_ERROR)) {
      assert.equal(key, value, `ORCHESTRATION_ERROR.${key} should equal "${key}"`);
    }
  });
});

// 2026-09-13 — pack mode: the readiness matrix must not say READY for a pack
// whose published market rate is missing, because that pack prints
// "Not available" in the three-option customer document.
test('preflightCheck (pack mode) blocks a tier with no market rate for that size', () => {
  const env = {
    packageRegistry: { packages: [
      { packageId: 'P-PREM', systemType: 'ongrid', size: '3', phase: '1P', tier: 'premium', approvalStatus: 'APPROVED' },
      { packageId: 'P-VAL', systemType: 'ongrid', size: '3', phase: '1P', tier: 'value', approvalStatus: 'APPROVED' },
    ] },
    costConfig: { margin: { tiers: {} } },
  };
  const packMode = { config: { marketRates: { ongrid_premium: { '3': 0 }, ongrid_value: { '3': 229000 } } } };
  const prem = preflightCheck(env, { systemType: 'ongrid', size: '3', phase: '1P', tier: 'premium' }, { packMode });
  assert.equal(prem.canProceed, false);
  assert.ok(prem.blockers.some(b => b.code === 'MARKET_RATE_NOT_SET' && b.owner === 'PROJECT_HEAD'));
  const val = preflightCheck(env, { systemType: 'ongrid', size: '3', phase: '1P', tier: 'value' }, { packMode });
  assert.equal(val.canProceed, true);
  // Without pack mode the check is unchanged (gross-margin path has no market rate).
  const legacy = preflightCheck(env, { systemType: 'ongrid', size: '3', phase: '1P', tier: 'premium' });
  assert.equal(legacy.canProceed, true);
});
