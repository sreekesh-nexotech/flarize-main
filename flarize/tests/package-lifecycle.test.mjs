/**
 * Package Lifecycle — V4 authoring flow.
 *
 * createPackage / editPackage / submitPackage transitions and their gates.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPackage,
  editPackage,
  submitPackage,
  APPROVAL_ERROR,
  PACKAGE_STATE,
} from '../src/lib/packageApproval.js';

const ACTORS = {
  admin: { userId: 'admin-01', role: 'ADMIN' },
  ph: { userId: 'ph-01', role: 'PROJECT_HEAD' },
};
const TS = '2026-09-03T12:00:00Z';

function baseTemplate(overrides = {}) {
  return {
    systemType: 'hybrid',
    size: '5',
    phase: '1P',
    tier: 'premium',
    architecture: 'DEYE',
    profileKey: 'hybrid_premium',
    components: [
      { role: 'panel', componentId: 'p1', quantity: 10 },
    ],
    ...overrides,
  };
}

test('createPackage — requires architecture DEYE|ENPHASE', () => {
  const registry = { packages: [] };
  assert.throws(
    () => createPackage(registry, { actor: ACTORS.ph, template: baseTemplate({ architecture: 'MYSTERY' }), at: TS }),
    err => err.code === APPROVAL_ERROR.ARCHITECTURE_INVALID,
  );
});

test('createPackage — produces DRAFT record with V4 fields', () => {
  const registry = { packages: [] };
  const { packageId, package: pkg } = createPackage(registry, { actor: ACTORS.ph, template: baseTemplate(), at: TS });
  assert.ok(packageId);
  assert.equal(pkg.packageState, PACKAGE_STATE.DRAFT);
  assert.equal(pkg.revisionNumber, 1);
  assert.equal(pkg.architecture, 'DEYE');
  assert.equal(pkg.createdBy, 'ph-01');
  assert.equal(pkg.createdAt, TS);
  assert.equal(pkg.lastValidation, null);
  assert.equal(pkg.legacyApproved, false);
  assert.equal(pkg.comboKey, 'hybrid|5|1P|premium');
  assert.equal(pkg.supersededBy, null);
});

test('editPackage — allowed on DRAFT', () => {
  const registry = { packages: [] };
  const { packageId } = createPackage(registry, { actor: ACTORS.ph, template: baseTemplate(), at: TS });
  const result = editPackage(registry, {
    actor: ACTORS.ph, packageId, patch: { profileKey: 'hybrid_premium_v2' }, at: TS,
  });
  assert.equal(result.package.profileKey, 'hybrid_premium_v2');
});

test('editPackage — refused on APPROVED', () => {
  const registry = { packages: [
    { packageId: 'X', packageState: PACKAGE_STATE.APPROVED, revisionNumber: 1,
      systemType: 'hybrid', size: '5', phase: '1P', tier: 'premium', architecture: 'DEYE',
      approvalStatus: 'APPROVED' },
  ] };
  assert.throws(
    () => editPackage(registry, { actor: ACTORS.ph, packageId: 'X', patch: { profileKey: 'z' }, at: TS }),
    err => err.code === APPROVAL_ERROR.NOT_DRAFT_STATE,
  );
});

test('editPackage — clears lastValidation on any edit', () => {
  const registry = { packages: [] };
  const { packageId } = createPackage(registry, { actor: ACTORS.ph, template: baseTemplate(), at: TS });
  registry.packages[0].lastValidation = { status: 'VALID', revisionNumber: 1 };
  editPackage(registry, { actor: ACTORS.ph, packageId, patch: { profileKey: 'x' }, at: TS });
  assert.equal(registry.packages[0].lastValidation, null);
});

test('submitPackage — VALIDATION_MISSING when lastValidation is null', () => {
  const registry = { packages: [] };
  const { packageId } = createPackage(registry, { actor: ACTORS.ph, template: baseTemplate(), at: TS });
  assert.throws(
    () => submitPackage(registry, { actor: ACTORS.ph, packageId, at: TS }),
    err => err.code === APPROVAL_ERROR.VALIDATION_MISSING,
  );
});

test('submitPackage — VALIDATION_STALE on revision mismatch', () => {
  const registry = { packages: [] };
  const { packageId } = createPackage(registry, { actor: ACTORS.ph, template: baseTemplate(), at: TS });
  registry.packages[0].lastValidation = { status: 'VALID', revisionNumber: 99 };
  assert.throws(
    () => submitPackage(registry, { actor: ACTORS.ph, packageId, at: TS }),
    err => err.code === APPROVAL_ERROR.VALIDATION_STALE,
  );
});

test('submitPackage — PACKAGE_NOT_VALID on WARNING', () => {
  const registry = { packages: [] };
  const { packageId } = createPackage(registry, { actor: ACTORS.ph, template: baseTemplate(), at: TS });
  registry.packages[0].lastValidation = { status: 'WARNING', revisionNumber: 1 };
  assert.throws(
    () => submitPackage(registry, { actor: ACTORS.ph, packageId, at: TS }),
    err => err.code === APPROVAL_ERROR.PACKAGE_NOT_VALID,
  );
});

test('submitPackage — PACKAGE_NOT_VALID on BLOCKED', () => {
  const registry = { packages: [] };
  const { packageId } = createPackage(registry, { actor: ACTORS.ph, template: baseTemplate(), at: TS });
  registry.packages[0].lastValidation = { status: 'BLOCKED', revisionNumber: 1 };
  assert.throws(
    () => submitPackage(registry, { actor: ACTORS.ph, packageId, at: TS }),
    err => err.code === APPROVAL_ERROR.PACKAGE_NOT_VALID,
  );
});

test('submitPackage — VALID + matching revision succeeds', () => {
  const registry = { packages: [] };
  const { packageId } = createPackage(registry, { actor: ACTORS.ph, template: baseTemplate(), at: TS });
  registry.packages[0].lastValidation = { status: 'VALID', revisionNumber: 1 };
  const result = submitPackage(registry, { actor: ACTORS.ph, packageId, at: TS });
  assert.equal(result.packageState, PACKAGE_STATE.SUBMITTED);
  assert.equal(result.submittedBy, 'ph-01');
  assert.equal(result.submittedAt, TS);
});
