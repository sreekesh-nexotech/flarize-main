/**
 * V4 approval gate — validation presence, freshness, status; supersession
 * of prior APPROVED revisions on the same comboKey; RBAC-swap to
 * PACKAGE_APPROVE for reject; CANNOT_RESET_ARCHIVED refusal.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  approvePackage,
  rejectPackage,
  resetPackage,
  APPROVAL_ERROR,
  PACKAGE_STATE,
  PACKAGE_STATUS,
} from '../src/lib/packageApproval.js';

const ADMIN = { userId: 'admin-01', role: 'ADMIN' };
const TS = '2026-09-03T00:00:00Z';

function makePkg(overrides = {}) {
  return {
    packageId: overrides.packageId ?? 'PKG-1',
    systemType: overrides.systemType ?? 'hybrid',
    size: overrides.size ?? '5',
    phase: overrides.phase ?? '1P',
    tier: overrides.tier ?? 'premium',
    approvalStatus: overrides.approvalStatus ?? PACKAGE_STATUS.PROPOSED,
    packageState: overrides.packageState ?? PACKAGE_STATE.DRAFT,
    revisionNumber: overrides.revisionNumber ?? 1,
    comboKey: overrides.comboKey ?? `${overrides.systemType ?? 'hybrid'}|${overrides.size ?? '5'}|${overrides.phase ?? '1P'}|${overrides.tier ?? 'premium'}`,
    supersededBy: overrides.supersededBy ?? null,
    architecture: overrides.architecture ?? 'DEYE',
    lastValidation: overrides.lastValidation !== undefined ? overrides.lastValidation : null,
    components: overrides.components ?? [],
  };
}

test('approvePackage — VALIDATION_MISSING when lastValidation is null', () => {
  const registry = { packages: [makePkg({ lastValidation: null })] };
  assert.throws(
    () => approvePackage(registry, { actor: ADMIN, packageId: 'PKG-1', at: TS }),
    err => err.code === APPROVAL_ERROR.VALIDATION_MISSING,
  );
});

test('approvePackage — VALIDATION_STALE when revision mismatch', () => {
  const registry = { packages: [makePkg({
    revisionNumber: 2,
    lastValidation: { status: 'VALID', revisionNumber: 1 },
  })] };
  assert.throws(
    () => approvePackage(registry, { actor: ADMIN, packageId: 'PKG-1', at: TS }),
    err => err.code === APPROVAL_ERROR.VALIDATION_STALE,
  );
});

test('approvePackage — PACKAGE_NOT_VALID for WARNING', () => {
  const registry = { packages: [makePkg({
    lastValidation: { status: 'WARNING', revisionNumber: 1 },
  })] };
  assert.throws(
    () => approvePackage(registry, { actor: ADMIN, packageId: 'PKG-1', at: TS }),
    err => err.code === APPROVAL_ERROR.PACKAGE_NOT_VALID,
  );
});

test('approvePackage — PACKAGE_NOT_VALID for BLOCKED', () => {
  const registry = { packages: [makePkg({
    lastValidation: { status: 'BLOCKED', revisionNumber: 1 },
  })] };
  assert.throws(
    () => approvePackage(registry, { actor: ADMIN, packageId: 'PKG-1', at: TS }),
    err => err.code === APPROVAL_ERROR.PACKAGE_NOT_VALID,
  );
});

test('approvePackage — VALID + matching revision succeeds', () => {
  const registry = { packages: [makePkg({
    lastValidation: { status: 'VALID', revisionNumber: 1 },
  })] };
  const result = approvePackage(registry, { actor: ADMIN, packageId: 'PKG-1', at: TS });
  assert.equal(result.approvalStatus, PACKAGE_STATUS.APPROVED);
  assert.equal(registry.packages[0].packageState, PACKAGE_STATE.APPROVED);
});

test('approvePackage — approving a new revision supersedes the prior APPROVED-not-superseded', () => {
  const registry = { packages: [
    makePkg({
      packageId: 'REV-1',
      packageState: PACKAGE_STATE.APPROVED,
      approvalStatus: PACKAGE_STATUS.APPROVED,
      revisionNumber: 1,
      comboKey: 'hybrid|5|1P|premium',
    }),
    makePkg({
      packageId: 'REV-2',
      packageState: PACKAGE_STATE.DRAFT,
      approvalStatus: PACKAGE_STATUS.PROPOSED,
      revisionNumber: 2,
      comboKey: 'hybrid|5|1P|premium',
      lastValidation: { status: 'VALID', revisionNumber: 2 },
    }),
  ] };
  approvePackage(registry, { actor: ADMIN, packageId: 'REV-2', at: TS });
  const rev1 = registry.packages.find(p => p.packageId === 'REV-1');
  const rev2 = registry.packages.find(p => p.packageId === 'REV-2');
  assert.equal(rev1.supersededBy, 'REV-2');
  assert.equal(rev2.supersededBy, null);
  assert.equal(rev2.packageState, PACKAGE_STATE.APPROVED);
});

test('rejectPackage — RBAC swap to PACKAGE_APPROVE', () => {
  const registry = { packages: [makePkg()] };
  assert.throws(
    () => rejectPackage(registry, { actor: { userId: 'e', role: 'ENGINEERING' }, packageId: 'PKG-1', reason: 'nope', at: TS }),
    err => err.name === 'RbacError' && err.code === 'CAPABILITY_DENIED',
  );
  // ADMIN succeeds
  const result = rejectPackage(registry, { actor: ADMIN, packageId: 'PKG-1', reason: 'nope', at: TS });
  assert.equal(result.approvalStatus, PACKAGE_STATUS.REJECTED);
  assert.equal(registry.packages[0].packageState, PACKAGE_STATE.REJECTED);
});

test('resetPackage — throws CANNOT_RESET_ARCHIVED for ARCHIVED', () => {
  const registry = { packages: [makePkg({ packageState: PACKAGE_STATE.ARCHIVED })] };
  assert.throws(
    () => resetPackage(registry, { actor: ADMIN, packageId: 'PKG-1', at: TS }),
    err => err.code === APPROVAL_ERROR.CANNOT_RESET_ARCHIVED,
  );
});

test('resetPackage — from APPROVED sets packageState=DRAFT and clears lastValidation', () => {
  const registry = { packages: [makePkg({
    packageState: PACKAGE_STATE.APPROVED,
    approvalStatus: PACKAGE_STATUS.APPROVED,
    lastValidation: { status: 'VALID', revisionNumber: 1 },
  })] };
  resetPackage(registry, { actor: ADMIN, packageId: 'PKG-1', at: TS });
  assert.equal(registry.packages[0].packageState, PACKAGE_STATE.DRAFT);
  assert.equal(registry.packages[0].lastValidation, null);
});
