/**
 * comparePackages — RBAC + shape + no economic leakage.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { comparePackages, AUTHORING_ERROR } from '../src/lib/packageAuthoring.js';

const ADMIN = { userId: 'admin-01', role: 'ADMIN' };
const SALES = { userId: 'sales-01', role: 'SALES' };

function pkg(id, overrides = {}) {
  return {
    packageId: id,
    systemType: overrides.systemType ?? 'ongrid',
    size: overrides.size ?? '5',
    phase: overrides.phase ?? '1P',
    tier: overrides.tier ?? 'base',
    comboKey: `${overrides.systemType ?? 'ongrid'}|${overrides.size ?? '5'}|${overrides.phase ?? '1P'}|${overrides.tier ?? 'base'}`,
    packageState: overrides.packageState ?? 'APPROVED',
    revisionNumber: overrides.revisionNumber ?? 1,
    supersededBy: null,
    architecture: 'DEYE',
    blockers: overrides.blockers ?? [],
    lastValidation: overrides.lastValidation ?? null,
    components: overrides.components ?? [
      { role: 'panel', componentId: 'p1', approvalStatus: 'APPROVED' },
      { role: 'inverter', componentId: 'i1', approvalStatus: 'APPROVED' },
    ],
    // These are internal/economic fields — must NOT be echoed by compare.
    costPanel: { total: 999 },
    pricingPanel: { total: 1500 },
    landedCost: 700,
    margin: 300,
    customerFacing: { price: 1500 },
  };
}

test('comparePackages — 2 ids succeeds with valid shape', () => {
  const registry = { packages: [pkg('A'), pkg('B'), pkg('C')] };
  const result = comparePackages(registry, { actor: ADMIN, packageIds: ['A', 'B'] });
  assert.equal(result.packages.length, 2);
  assert.equal(result.packages[0].packageId, 'A');
  assert.equal(result.packages[1].packageId, 'B');
  assert.ok(result.diffMatrix.panel);
  assert.equal(result.diffMatrix.panel[0].componentId, 'p1');
  // Shape checks
  for (const p of result.packages) {
    assert.equal(typeof p.packageState, 'string');
    assert.equal(typeof p.revisionNumber, 'number');
    assert.ok(p.keyComponents);
    assert.equal(typeof p.blockersCount, 'number');
  }
});

test('comparePackages — 1 id throws INVALID_COMPARE_COUNT', () => {
  const registry = { packages: [pkg('A')] };
  assert.throws(
    () => comparePackages(registry, { actor: ADMIN, packageIds: ['A'] }),
    err => err.code === AUTHORING_ERROR.INVALID_COMPARE_COUNT,
  );
});

test('comparePackages — 6 ids throws INVALID_COMPARE_COUNT', () => {
  const registry = { packages: ['A','B','C','D','E','F'].map(id => pkg(id)) };
  assert.throws(
    () => comparePackages(registry, { actor: ADMIN, packageIds: ['A','B','C','D','E','F'] }),
    err => err.code === AUTHORING_ERROR.INVALID_COMPARE_COUNT,
  );
});

test('comparePackages — SALES is denied at RBAC boundary', () => {
  const registry = { packages: [pkg('A'), pkg('B')] };
  assert.throws(
    () => comparePackages(registry, { actor: SALES, packageIds: ['A', 'B'] }),
    err => err.name === 'RbacError' && err.code === 'CAPABILITY_DENIED',
  );
});

test('comparePackages — response contains no economic keys', () => {
  const registry = { packages: [pkg('A'), pkg('B')] };
  const result = comparePackages(registry, { actor: ADMIN, packageIds: ['A', 'B'] });
  const serialised = JSON.stringify(result);
  for (const key of ['costPanel', 'pricingPanel', 'landedCost', 'margin', 'customerFacing']) {
    assert.equal(serialised.includes(key), false, `compare response must not include ${key}`);
  }
});
