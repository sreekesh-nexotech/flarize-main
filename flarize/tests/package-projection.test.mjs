/**
 * Package Projection — hydrateRegistry + visibleForRuntime.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { hydrateRegistry, visibleForRuntime } from '../src/lib/packageProjection.js';

test('hydrateRegistry — legacy APPROVED record without createdBy is legacyApproved', () => {
  const raw = {
    schema: 'flarize.package-registry/1',
    packages: [
      {
        packageId: 'LEGACY-1',
        systemType: 'ongrid', size: '5', phase: '1P', tier: 'base',
        approvalStatus: 'APPROVED',
        approvedBy: 'legacy-user',
        components: [],
      },
    ],
  };
  const out = hydrateRegistry(raw);
  const pkg = out.packages[0];
  assert.equal(pkg.legacyApproved, true);
  assert.equal(pkg.packageState, 'APPROVED');
  assert.equal(pkg.revisionNumber, 1);
  assert.equal(pkg.lastValidation, null);
  assert.equal(pkg.comboKey, 'ongrid|5|1P|base');
  assert.equal(pkg.supersededBy, null);
  assert.equal(pkg.architecture, null);
  assert.equal(pkg.createdBy, null);
});

test('hydrateRegistry — V4-authored record preserves its own fields', () => {
  const raw = {
    packages: [
      {
        packageId: 'V4-1',
        systemType: 'hybrid', size: '5', phase: '1P', tier: 'premium',
        packageState: 'DRAFT',
        approvalStatus: 'PROPOSED',
        revisionNumber: 3,
        createdBy: 'ph-01',
        createdAt: '2026-09-03T00:00:00Z',
        architecture: 'ENPHASE',
        lastValidation: { status: 'VALID', revisionNumber: 3 },
      },
    ],
  };
  const out = hydrateRegistry(raw);
  const pkg = out.packages[0];
  assert.equal(pkg.legacyApproved, false);
  assert.equal(pkg.packageState, 'DRAFT');
  assert.equal(pkg.revisionNumber, 3);
  assert.equal(pkg.architecture, 'ENPHASE');
  assert.deepEqual(pkg.lastValidation, { status: 'VALID', revisionNumber: 3 });
  assert.equal(pkg.createdBy, 'ph-01');
});

test('hydrateRegistry — comboKey is always computed from identity fields', () => {
  const raw = {
    packages: [
      { packageId: 'X', systemType: 'ongrid', size: '3', phase: '3P', tier: 'value' },
    ],
  };
  const out = hydrateRegistry(raw);
  assert.equal(out.packages[0].comboKey, 'ongrid|3|3P|value');
});

test('hydrateRegistry — is idempotent', () => {
  const raw = {
    packages: [
      { packageId: 'X', systemType: 'ongrid', size: '5', phase: '1P', tier: 'base',
        approvalStatus: 'PROPOSED' },
    ],
  };
  const once = hydrateRegistry(raw);
  const twice = hydrateRegistry(once);
  assert.deepEqual(twice.packages[0], once.packages[0]);
});

test('visibleForRuntime — filters DRAFT / SUBMITTED / REJECTED / ARCHIVED / superseded', () => {
  const hydrated = {
    packages: [
      { packageId: 'A', packageState: 'DRAFT', supersededBy: null },
      { packageId: 'B', packageState: 'SUBMITTED', supersededBy: null },
      { packageId: 'C', packageState: 'REJECTED', supersededBy: null },
      { packageId: 'D', packageState: 'ARCHIVED', supersededBy: null },
      { packageId: 'E', packageState: 'APPROVED', supersededBy: 'F' },
      { packageId: 'F', packageState: 'APPROVED', supersededBy: null },
    ],
  };
  const visible = visibleForRuntime(hydrated);
  assert.equal(visible.packages.length, 1);
  assert.equal(visible.packages[0].packageId, 'F');
});

test('visibleForRuntime — keeps legacyApproved records', () => {
  const raw = {
    packages: [
      { packageId: 'LEG', systemType: 'ongrid', size: '5', phase: '1P', tier: 'base',
        approvalStatus: 'APPROVED' },
    ],
  };
  const hydrated = hydrateRegistry(raw);
  const visible = visibleForRuntime(hydrated);
  assert.equal(visible.packages.length, 1);
  assert.equal(visible.packages[0].packageId, 'LEG');
  assert.equal(visible.packages[0].legacyApproved, true);
});

test('hydrateRegistry — a FUTURE_READY record carries |FR<systemSize> in its comboKey (2026-09-08 pack build)', () => {
  const raw = {
    packages: [
      { packageId: 'FR', systemType: 'ongrid', size: '3', phase: '1P', tier: 'value', variant: 'FUTURE_READY', systemSize: '5sp', comboKey: 'stale|value' },
      { packageId: 'STD', systemType: 'ongrid', size: '3', phase: '1P', tier: 'value', variant: 'STANDARD', systemSize: '3' },
    ],
  };
  const out = hydrateRegistry(raw);
  assert.equal(out.packages[0].comboKey, 'ongrid|3|1P|value|FR5sp', 'stored comboKey is never trusted over identity fields');
  assert.equal(out.packages[1].comboKey, 'ongrid|3|1P|value');
});
