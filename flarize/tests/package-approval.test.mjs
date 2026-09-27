/**
 * Package Approval Service — comprehensive tests.
 *
 * Covers approval lifecycle (approve / reject / reset), bulk operations,
 * role-filtered listing, summary counts, and the Sales enforcement gate.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  approvePackage,
  rejectPackage,
  resetPackage,
  bulkApprovePackages,
  listPackagesForRole,
  approvalSummary,
  assertPackageSelectableByActor,
  PACKAGE_STATUS,
  APPROVAL_ERROR,
} from '../src/lib/packageApproval.js';

// =========================================================================
// Actors
// =========================================================================
const ACTORS = {
  engineering: { userId: 'eng-01', role: 'ENGINEERING' },
  projectHead: { userId: 'ph-01', role: 'PROJECT_HEAD' },
  sales: { userId: 'sales-01', role: 'SALES' },
  salesHead: { userId: 'sh-01', role: 'SALES_HEAD' },
  salesCrs: { userId: 'crs-01', role: 'SALES_CRS' },
  fieldSales: { userId: 'fs-01', role: 'FIELD_SALES' },
  procurement: { userId: 'proc-01', role: 'PROCUREMENT' },
  admin: { userId: 'admin-01', role: 'ADMIN' },
};

const TS = '2026-08-30T10:00:00Z';

// =========================================================================
// Fixture helpers
// =========================================================================

/** Create a minimal package entry. In V4, approvePackage requires a fresh
 *  VALID validation whose revisionNumber matches the package's — so unless a
 *  test explicitly overrides it, every fixture is born VALID at revision 1
 *  so the ADMIN happy-path assertions continue to exercise the mutation logic. */
function makePkg(overrides = {}) {
  const revisionNumber = overrides.revisionNumber ?? 1;
  const approvalStatus = overrides.approvalStatus ?? PACKAGE_STATUS.PROPOSED;
  const derivedPackageState = approvalStatus === PACKAGE_STATUS.APPROVED ? 'APPROVED'
    : approvalStatus === PACKAGE_STATUS.REJECTED ? 'REJECTED'
    : 'DRAFT';
  return {
    packageId: overrides.packageId ?? 'PKG-001',
    systemType: overrides.systemType ?? 'ongrid',
    size: overrides.size ?? '5',
    phase: overrides.phase ?? '1P',
    tier: overrides.tier ?? 'base',
    profileKey: overrides.profileKey ?? 'ongrid-5-base',
    approvalStatus,
    engineeringStatus: overrides.engineeringStatus ?? 'WARNING',
    approvedBy: overrides.approvedBy ?? null,
    approvedAt: overrides.approvedAt ?? null,
    packageState: overrides.packageState ?? derivedPackageState,
    revisionNumber,
    comboKey: overrides.comboKey ?? `${overrides.systemType ?? 'ongrid'}|${overrides.size ?? '5'}|${overrides.phase ?? '1P'}|${overrides.tier ?? 'base'}`,
    supersededBy: overrides.supersededBy ?? null,
    architecture: overrides.architecture ?? 'DEYE',
    lastValidation: overrides.lastValidation !== undefined
      ? overrides.lastValidation
      : { status: 'VALID', findings: [], revisionNumber },
    components: overrides.components ?? [
      { componentId: 'C1', approvalStatus: 'PROPOSED', approvedByDecision: null },
      { componentId: 'C2', approvalStatus: 'PROPOSED', approvedByDecision: null },
    ],
  };
}

/** Build a fresh registry with the given package list. */
function makeRegistry(packages) {
  return { packages: packages.map(p => makePkg(p)) };
}

/** Standard mixed-state registry used across many test groups. */
function mixedRegistry() {
  return makeRegistry([
    { packageId: 'PKG-PROPOSED', approvalStatus: PACKAGE_STATUS.PROPOSED, systemType: 'ongrid', tier: 'base' },
    { packageId: 'PKG-APPROVED', approvalStatus: PACKAGE_STATUS.APPROVED, systemType: 'ongrid', tier: 'premium',
      approvedBy: 'eng-01', approvedAt: '2026-01-01T00:00:00Z', engineeringStatus: 'APPROVED' },
    { packageId: 'PKG-REJECTED', approvalStatus: PACKAGE_STATUS.REJECTED, systemType: 'hybrid', tier: 'base',
      engineeringStatus: 'REJECTED' },
    { packageId: 'PKG-PROPOSED-2', approvalStatus: PACKAGE_STATUS.PROPOSED, systemType: 'hybrid', tier: 'premium' },
  ]);
}

// =========================================================================
// 1. approvePackage
// =========================================================================
describe('approvePackage', () => {
  let registry;

  beforeEach(() => {
    registry = makeRegistry([
      { packageId: 'PKG-001' },
      { packageId: 'PKG-002', approvalStatus: PACKAGE_STATUS.APPROVED, engineeringStatus: 'APPROVED' },
    ]);
  });

  it('happy path — ADMIN approves a PROPOSED package (V4: PACKAGE_APPROVE)', () => {
    const result = approvePackage(registry, {
      actor: ACTORS.admin, packageId: 'PKG-001', notes: 'Looks good', at: TS,
    });

    assert.equal(result.packageId, 'PKG-001');
    assert.equal(result.approvalStatus, PACKAGE_STATUS.APPROVED);
    assert.equal(result.approvedBy, 'admin-01');
    assert.equal(result.approvedAt, TS);
    assert.equal(result.componentCount, 2);

    // Verify mutation on the registry
    const pkg = registry.packages.find(p => p.packageId === 'PKG-001');
    assert.equal(pkg.approvalStatus, PACKAGE_STATUS.APPROVED);
    assert.equal(pkg.approvedBy, 'admin-01');
    assert.equal(pkg.approvedAt, TS);
    assert.equal(pkg.approvalNotes, 'Looks good');
    assert.equal(pkg.engineeringStatus, 'APPROVED');
  });

  it('marks all components as APPROVED with decision tag', () => {
    approvePackage(registry, {
      actor: ACTORS.admin, packageId: 'PKG-001', at: TS,
    });
    const pkg = registry.packages.find(p => p.packageId === 'PKG-001');
    for (const comp of pkg.components) {
      assert.equal(comp.approvalStatus, 'APPROVED');
      assert.equal(comp.approvedByDecision, `PKG_APPROVAL_admin-01_${TS}`);
    }
  });

  it('sets approvalNotes to null when notes not provided', () => {
    approvePackage(registry, {
      actor: ACTORS.admin, packageId: 'PKG-001', at: TS,
    });
    const pkg = registry.packages.find(p => p.packageId === 'PKG-001');
    assert.equal(pkg.approvalNotes, null);
  });

  it('throws ALREADY_APPROVED for an already-approved package', () => {
    assert.throws(
      () => approvePackage(registry, {
        actor: ACTORS.admin, packageId: 'PKG-002', at: TS,
      }),
      err => err.code === APPROVAL_ERROR.ALREADY_APPROVED,
    );
  });

  it('throws PACKAGE_NOT_FOUND for unknown packageId', () => {
    assert.throws(
      () => approvePackage(registry, {
        actor: ACTORS.admin, packageId: 'MISSING', at: TS,
      }),
      err => err.code === APPROVAL_ERROR.PACKAGE_NOT_FOUND,
    );
  });

  it('throws when timestamp (at) is missing', () => {
    assert.throws(
      () => approvePackage(registry, {
        actor: ACTORS.admin, packageId: 'PKG-001',
      }),
      err => err.code === 'MISSING_TIMESTAMP',
    );
  });

  // RBAC enforcement — V4 approval requires PACKAGE_APPROVE (ADMIN-only).
  // Every non-ADMIN role — including the legacy ENGINEERING approver — is
  // denied at the capability boundary.
  for (const [label, actor] of [
    ['SALES', ACTORS.sales],
    ['SALES_HEAD', ACTORS.salesHead],
    ['SALES_CRS', ACTORS.salesCrs],
    ['FIELD_SALES', ACTORS.fieldSales],
    ['PROCUREMENT', ACTORS.procurement],
    ['ENGINEERING', ACTORS.engineering],
    ['PROJECT_HEAD', ACTORS.projectHead],
  ]) {
    it(`RBAC — ${label} cannot approve (no PACKAGE_APPROVE)`, () => {
      assert.throws(
        () => approvePackage(registry, {
          actor, packageId: 'PKG-001', at: TS,
        }),
        err => err.name === 'RbacError' && err.code === 'CAPABILITY_DENIED',
      );
    });
  }

  it('handles a package with no components gracefully', () => {
    const reg = makeRegistry([{ packageId: 'PKG-EMPTY', components: [] }]);
    const result = approvePackage(reg, {
      actor: ACTORS.admin, packageId: 'PKG-EMPTY', at: TS,
    });
    assert.equal(result.componentCount, 0);
    assert.equal(reg.packages[0].approvalStatus, PACKAGE_STATUS.APPROVED);
  });
});

// =========================================================================
// 2. rejectPackage
// =========================================================================
describe('rejectPackage', () => {
  let registry;

  beforeEach(() => {
    registry = makeRegistry([
      { packageId: 'PKG-001' },
      { packageId: 'PKG-002', approvalStatus: PACKAGE_STATUS.APPROVED, engineeringStatus: 'APPROVED' },
    ]);
  });

  it('happy path — rejects with a reason', () => {
    const result = rejectPackage(registry, {
      actor: ACTORS.admin, packageId: 'PKG-001', reason: 'Incompatible inverter', at: TS,
    });

    assert.equal(result.packageId, 'PKG-001');
    assert.equal(result.approvalStatus, PACKAGE_STATUS.REJECTED);
    assert.equal(result.rejectedBy, 'admin-01');
    assert.equal(result.rejectedAt, TS);
    assert.equal(result.reason, 'Incompatible inverter');

    // Verify mutation
    const pkg = registry.packages.find(p => p.packageId === 'PKG-001');
    assert.equal(pkg.approvalStatus, PACKAGE_STATUS.REJECTED);
    assert.equal(pkg.rejectedBy, 'admin-01');
    assert.equal(pkg.rejectedAt, TS);
    assert.equal(pkg.rejectionReason, 'Incompatible inverter');
    assert.equal(pkg.engineeringStatus, 'REJECTED');
  });

  it('can reject an already-approved package', () => {
    const result = rejectPackage(registry, {
      actor: ACTORS.admin, packageId: 'PKG-002', reason: 'Recalled panel', at: TS,
    });
    assert.equal(result.approvalStatus, PACKAGE_STATUS.REJECTED);
    const pkg = registry.packages.find(p => p.packageId === 'PKG-002');
    assert.equal(pkg.approvalStatus, PACKAGE_STATUS.REJECTED);
  });

  it('trims whitespace from reason', () => {
    const result = rejectPackage(registry, {
      actor: ACTORS.admin, packageId: 'PKG-001', reason: '  spacing issue  ', at: TS,
    });
    assert.equal(result.reason, 'spacing issue');
  });

  it('throws MISSING_REASON when reason is empty', () => {
    assert.throws(
      () => rejectPackage(registry, {
        actor: ACTORS.admin, packageId: 'PKG-001', reason: '', at: TS,
      }),
      err => err.code === APPROVAL_ERROR.MISSING_REASON,
    );
  });

  it('throws MISSING_REASON when reason is only whitespace', () => {
    assert.throws(
      () => rejectPackage(registry, {
        actor: ACTORS.admin, packageId: 'PKG-001', reason: '   ', at: TS,
      }),
      err => err.code === APPROVAL_ERROR.MISSING_REASON,
    );
  });

  it('throws PACKAGE_NOT_FOUND for unknown packageId', () => {
    assert.throws(
      () => rejectPackage(registry, {
        actor: ACTORS.admin, packageId: 'GHOST', reason: 'nope', at: TS,
      }),
      err => err.code === APPROVAL_ERROR.PACKAGE_NOT_FOUND,
    );
  });

  it('throws when timestamp (at) is missing', () => {
    assert.throws(
      () => rejectPackage(registry, {
        actor: ACTORS.admin, packageId: 'PKG-001', reason: 'reason',
      }),
      err => err.code === 'MISSING_TIMESTAMP',
    );
  });

  // RBAC enforcement — V4 rejection requires PACKAGE_APPROVE (ADMIN-only).
  for (const [label, actor] of [
    ['SALES', ACTORS.sales],
    ['SALES_HEAD', ACTORS.salesHead],
    ['ENGINEERING', ACTORS.engineering],
    ['PROJECT_HEAD', ACTORS.projectHead],
  ]) {
    it(`RBAC — ${label} cannot reject`, () => {
      assert.throws(
        () => rejectPackage(registry, {
          actor, packageId: 'PKG-001', reason: 'nope', at: TS,
        }),
        err => err.name === 'RbacError' && err.code === 'CAPABILITY_DENIED',
      );
    });
  }
});

// =========================================================================
// 3. resetPackage
// =========================================================================
describe('resetPackage', () => {
  let registry;

  beforeEach(() => {
    registry = makeRegistry([
      {
        packageId: 'PKG-APPROVED',
        approvalStatus: PACKAGE_STATUS.APPROVED,
        engineeringStatus: 'APPROVED',
        approvedBy: 'eng-01',
        approvedAt: '2026-01-01T00:00:00Z',
        components: [
          { componentId: 'C1', approvalStatus: 'APPROVED', approvedByDecision: 'PKG_APPROVAL_eng-01_2026-01-01T00:00:00Z' },
          { componentId: 'C2', approvalStatus: 'APPROVED', approvedByDecision: 'MANUAL_APPROVE' },
        ],
      },
      {
        packageId: 'PKG-REJECTED',
        approvalStatus: PACKAGE_STATUS.REJECTED,
        engineeringStatus: 'REJECTED',
      },
    ]);
  });

  it('resets an APPROVED package to PROPOSED', () => {
    const result = resetPackage(registry, {
      actor: ACTORS.admin, packageId: 'PKG-APPROVED', at: TS,
    });

    assert.equal(result.packageId, 'PKG-APPROVED');
    assert.equal(result.approvalStatus, PACKAGE_STATUS.PROPOSED);

    const pkg = registry.packages.find(p => p.packageId === 'PKG-APPROVED');
    assert.equal(pkg.approvalStatus, PACKAGE_STATUS.PROPOSED);
    assert.equal(pkg.approvedBy, null);
    assert.equal(pkg.approvedAt, null);
    assert.equal(pkg.rejectedBy, null);
    assert.equal(pkg.rejectedAt, null);
    assert.equal(pkg.rejectionReason, null);
    assert.equal(pkg.approvalNotes, null);
    assert.equal(pkg.engineeringStatus, 'WARNING');
  });

  it('resets component approval only for PKG_APPROVAL_ decisions', () => {
    resetPackage(registry, {
      actor: ACTORS.admin, packageId: 'PKG-APPROVED', at: TS,
    });

    const pkg = registry.packages.find(p => p.packageId === 'PKG-APPROVED');
    // C1 was approved by package approval -> should be reset
    assert.equal(pkg.components[0].approvalStatus, 'PROPOSED');
    assert.equal(pkg.components[0].approvedByDecision, null);
    // C2 was approved by manual decision -> should remain
    assert.equal(pkg.components[1].approvalStatus, 'APPROVED');
    assert.equal(pkg.components[1].approvedByDecision, 'MANUAL_APPROVE');
  });

  it('resets a REJECTED package to PROPOSED', () => {
    const result = resetPackage(registry, {
      actor: ACTORS.admin, packageId: 'PKG-REJECTED', at: TS,
    });
    assert.equal(result.approvalStatus, PACKAGE_STATUS.PROPOSED);
    const pkg = registry.packages.find(p => p.packageId === 'PKG-REJECTED');
    assert.equal(pkg.approvalStatus, PACKAGE_STATUS.PROPOSED);
  });

  it('throws PACKAGE_NOT_FOUND for unknown packageId', () => {
    assert.throws(
      () => resetPackage(registry, {
        actor: ACTORS.admin, packageId: 'MISSING', at: TS,
      }),
      err => err.code === APPROVAL_ERROR.PACKAGE_NOT_FOUND,
    );
  });

  it('throws when timestamp (at) is missing', () => {
    assert.throws(
      () => resetPackage(registry, {
        actor: ACTORS.admin, packageId: 'PKG-APPROVED',
      }),
      err => err.code === 'MISSING_TIMESTAMP',
    );
  });

  // RBAC enforcement — V4 reset requires PACKAGE_APPROVE (ADMIN-only).
  for (const [label, actor] of [
    ['SALES', ACTORS.sales],
    ['ENGINEERING', ACTORS.engineering],
    ['PROJECT_HEAD', ACTORS.projectHead],
  ]) {
    it(`RBAC — ${label} cannot reset`, () => {
      assert.throws(
        () => resetPackage(registry, {
          actor, packageId: 'PKG-APPROVED', at: TS,
        }),
        err => err.name === 'RbacError' && err.code === 'CAPABILITY_DENIED',
      );
    });
  }
});

// =========================================================================
// 4. bulkApprovePackages
// =========================================================================
describe('bulkApprovePackages', () => {
  let registry;

  beforeEach(() => {
    registry = makeRegistry([
      { packageId: 'OG-BASE-1', systemType: 'ongrid', tier: 'base', approvalStatus: PACKAGE_STATUS.PROPOSED },
      { packageId: 'OG-BASE-2', systemType: 'ongrid', tier: 'base', approvalStatus: PACKAGE_STATUS.PROPOSED },
      { packageId: 'OG-PREM-1', systemType: 'ongrid', tier: 'premium', approvalStatus: PACKAGE_STATUS.PROPOSED },
      { packageId: 'HY-BASE-1', systemType: 'hybrid', tier: 'base', approvalStatus: PACKAGE_STATUS.PROPOSED },
      { packageId: 'ALREADY-OK', systemType: 'ongrid', tier: 'base', approvalStatus: PACKAGE_STATUS.APPROVED, engineeringStatus: 'APPROVED' },
      { packageId: 'REJECTED-1', systemType: 'ongrid', tier: 'base', approvalStatus: PACKAGE_STATUS.REJECTED, engineeringStatus: 'REJECTED' },
    ]);
  });

  it('approves all non-approved packages when no filter', () => {
    const result = bulkApprovePackages(registry, {
      actor: ACTORS.admin, filter: {}, notes: 'Batch OK', at: TS,
    });

    // ALREADY-OK is already approved so excluded from targets.
    // REJECTED-1 is not APPROVED, so it IS a target (and gets approved).
    assert.equal(result.total, 5);
    assert.equal(result.approved.length, 5);
    assert.equal(result.errors.length, 0);
  });

  it('filters by systemType', () => {
    const result = bulkApprovePackages(registry, {
      actor: ACTORS.admin, filter: { systemType: 'hybrid' }, at: TS,
    });
    assert.equal(result.total, 1);
    assert.equal(result.approved.length, 1);
    assert.equal(result.approved[0].packageId, 'HY-BASE-1');
  });

  it('filters by tier', () => {
    const result = bulkApprovePackages(registry, {
      actor: ACTORS.admin, filter: { tier: 'premium' }, at: TS,
    });
    assert.equal(result.total, 1);
    assert.equal(result.approved.length, 1);
    assert.equal(result.approved[0].packageId, 'OG-PREM-1');
  });

  it('combines systemType + tier filter', () => {
    const result = bulkApprovePackages(registry, {
      actor: ACTORS.admin, filter: { systemType: 'ongrid', tier: 'base' }, at: TS,
    });

    // OG-BASE-1, OG-BASE-2 are PROPOSED ongrid/base => targets
    // REJECTED-1 is REJECTED ongrid/base => also a target
    // ALREADY-OK is already APPROVED => excluded
    assert.equal(result.total, 3);
    assert.equal(result.approved.length, 3);
  });

  it('returns empty results when filter matches nothing', () => {
    const result = bulkApprovePackages(registry, {
      actor: ACTORS.admin, filter: { systemType: 'offgrid' }, at: TS,
    });
    assert.equal(result.total, 0);
    assert.equal(result.approved.length, 0);
    assert.equal(result.errors.length, 0);
  });

  it('RBAC — SALES cannot bulk approve', () => {
    assert.throws(
      () => bulkApprovePackages(registry, {
        actor: ACTORS.sales, filter: {}, at: TS,
      }),
      err => err.name === 'RbacError' && err.code === 'CAPABILITY_DENIED',
    );
  });

  it('handles null/undefined filter gracefully', () => {
    const result = bulkApprovePackages(registry, {
      actor: ACTORS.admin, filter: null, at: TS,
    });
    // All non-APPROVED => 5 targets
    assert.equal(result.total, 5);
  });
});

// =========================================================================
// 5. listPackagesForRole
// =========================================================================
describe('listPackagesForRole', () => {
  let registry;

  beforeEach(() => {
    registry = mixedRegistry();
  });

  // Sales roles see only APPROVED
  for (const [label, actor] of [
    ['SALES', ACTORS.sales],
    ['SALES_HEAD', ACTORS.salesHead],
    ['SALES_CRS', ACTORS.salesCrs],
    ['FIELD_SALES', ACTORS.fieldSales],
  ]) {
    it(`${label} sees only APPROVED packages`, () => {
      const list = listPackagesForRole(registry, { actor, filter: {} });
      assert.equal(list.length, 1);
      assert.equal(list[0].packageId, 'PKG-APPROVED');
      assert.equal(list[0].approvalStatus, PACKAGE_STATUS.APPROVED);
    });
  }

  // Non-sales roles see all
  for (const [label, actor] of [
    ['ENGINEERING', ACTORS.engineering],
    ['PROJECT_HEAD', ACTORS.projectHead],
    ['ADMIN', ACTORS.admin],
    ['PROCUREMENT', ACTORS.procurement],
  ]) {
    it(`${label} sees all packages`, () => {
      const list = listPackagesForRole(registry, { actor, filter: {} });
      assert.equal(list.length, 4);
    });
  }

  it('returns the correct shape for each package', () => {
    const list = listPackagesForRole(registry, { actor: ACTORS.admin, filter: {} });
    const approved = list.find(p => p.packageId === 'PKG-APPROVED');
    assert.ok(approved);
    assert.equal(approved.systemType, 'ongrid');
    assert.equal(approved.tier, 'premium');
    assert.equal(approved.approvedBy, 'eng-01');
    assert.equal(approved.engineeringStatus, 'APPROVED');
    assert.equal(typeof approved.componentCount, 'number');
    assert.equal(typeof approved.approvedComponentCount, 'number');
  });

  it('applies systemType filter on top of role filter', () => {
    const list = listPackagesForRole(registry, {
      actor: ACTORS.admin, filter: { systemType: 'hybrid' },
    });
    assert.equal(list.length, 2);
    for (const p of list) assert.equal(p.systemType, 'hybrid');
  });

  it('applies approvalStatus filter', () => {
    const list = listPackagesForRole(registry, {
      actor: ACTORS.admin, filter: { approvalStatus: PACKAGE_STATUS.REJECTED },
    });
    assert.equal(list.length, 1);
    assert.equal(list[0].packageId, 'PKG-REJECTED');
  });

  it('Sales sees nothing when no packages are APPROVED', () => {
    const reg = makeRegistry([
      { packageId: 'A', approvalStatus: PACKAGE_STATUS.PROPOSED },
      { packageId: 'B', approvalStatus: PACKAGE_STATUS.REJECTED },
    ]);
    const list = listPackagesForRole(reg, { actor: ACTORS.sales, filter: {} });
    assert.equal(list.length, 0);
  });

  it('handles empty registry', () => {
    const list = listPackagesForRole({ packages: [] }, { actor: ACTORS.sales, filter: {} });
    assert.equal(list.length, 0);
  });
});

// =========================================================================
// 6. approvalSummary
// =========================================================================
describe('approvalSummary', () => {
  it('returns correct counts for a mixed registry', () => {
    const registry = mixedRegistry();
    const summary = approvalSummary(registry);

    assert.equal(summary.total, 4);
    assert.equal(summary.proposed, 2);
    assert.equal(summary.approved, 1);
    assert.equal(summary.rejected, 1);
  });

  it('returns all zeros for an empty registry', () => {
    const summary = approvalSummary({ packages: [] });
    assert.equal(summary.total, 0);
    assert.equal(summary.proposed, 0);
    assert.equal(summary.approved, 0);
    assert.equal(summary.rejected, 0);
  });

  it('handles registry with no packages key', () => {
    const summary = approvalSummary({});
    assert.equal(summary.total, 0);
  });

  it('counts correctly after mutations', () => {
    const registry = makeRegistry([
      { packageId: 'A', approvalStatus: PACKAGE_STATUS.PROPOSED },
      { packageId: 'B', approvalStatus: PACKAGE_STATUS.PROPOSED },
    ]);

    let s = approvalSummary(registry);
    assert.equal(s.proposed, 2);
    assert.equal(s.approved, 0);

    approvePackage(registry, {
      actor: ACTORS.admin, packageId: 'A', at: TS,
    });

    s = approvalSummary(registry);
    assert.equal(s.proposed, 1);
    assert.equal(s.approved, 1);
  });
});

// =========================================================================
// 7. assertPackageSelectableByActor
// =========================================================================
describe('assertPackageSelectableByActor', () => {
  let registry;

  beforeEach(() => {
    registry = mixedRegistry();
  });

  // Sales roles cannot select non-APPROVED packages
  for (const [label, actor] of [
    ['SALES', ACTORS.sales],
    ['SALES_HEAD', ACTORS.salesHead],
    ['SALES_CRS', ACTORS.salesCrs],
    ['FIELD_SALES', ACTORS.fieldSales],
  ]) {
    it(`${label} cannot select a PROPOSED package`, () => {
      assert.throws(
        () => assertPackageSelectableByActor(registry, { actor, packageId: 'PKG-PROPOSED' }),
        err => err.code === APPROVAL_ERROR.NOT_APPROVED_FOR_SALES,
      );
    });

    it(`${label} cannot select a REJECTED package`, () => {
      assert.throws(
        () => assertPackageSelectableByActor(registry, { actor, packageId: 'PKG-REJECTED' }),
        err => err.code === APPROVAL_ERROR.NOT_APPROVED_FOR_SALES,
      );
    });

    it(`${label} CAN select an APPROVED package`, () => {
      const result = assertPackageSelectableByActor(registry, { actor, packageId: 'PKG-APPROVED' });
      assert.equal(result, true);
    });
  }

  // Non-sales roles can select any package regardless of status
  for (const [label, actor] of [
    ['ENGINEERING', ACTORS.engineering],
    ['PROJECT_HEAD', ACTORS.projectHead],
    ['ADMIN', ACTORS.admin],
    ['PROCUREMENT', ACTORS.procurement],
  ]) {
    it(`${label} can select a PROPOSED package`, () => {
      const result = assertPackageSelectableByActor(registry, { actor, packageId: 'PKG-PROPOSED' });
      assert.equal(result, true);
    });

    it(`${label} can select a REJECTED package`, () => {
      const result = assertPackageSelectableByActor(registry, { actor, packageId: 'PKG-REJECTED' });
      assert.equal(result, true);
    });
  }

  it('throws PACKAGE_NOT_FOUND for Sales when package missing', () => {
    assert.throws(
      () => assertPackageSelectableByActor(registry, {
        actor: ACTORS.sales, packageId: 'GHOST',
      }),
      err => err.code === APPROVAL_ERROR.PACKAGE_NOT_FOUND,
    );
  });

  it('error detail includes packageId and current approvalStatus', () => {
    try {
      assertPackageSelectableByActor(registry, {
        actor: ACTORS.sales, packageId: 'PKG-PROPOSED',
      });
      assert.fail('expected to throw');
    } catch (err) {
      assert.equal(err.detail.packageId, 'PKG-PROPOSED');
      assert.equal(err.detail.approvalStatus, PACKAGE_STATUS.PROPOSED);
    }
  });
});

// =========================================================================
// 8. Full lifecycle: approve -> reset -> reject -> approve
// =========================================================================
describe('Full lifecycle transitions', () => {
  it('PROPOSED -> APPROVED -> reset -> PROPOSED -> REJECTED -> reset -> PROPOSED -> APPROVED', () => {
    const registry = makeRegistry([{ packageId: 'PKG-LIFE' }]);
    const actor = ACTORS.admin;

    // Helper: after each reset the V4 gate clears lastValidation, so the
    // Engineering re-run is a mandatory step before re-approval. We simulate
    // that step inline here — the checker itself is tested elsewhere.
    const revalidate = () => {
      const pkg = registry.packages.find(p => p.packageId === 'PKG-LIFE');
      pkg.lastValidation = { status: 'VALID', findings: [], revisionNumber: pkg.revisionNumber ?? 1 };
    };

    // 1. Approve
    let r = approvePackage(registry, { actor, packageId: 'PKG-LIFE', at: '2026-01-01T00:00:00Z' });
    assert.equal(r.approvalStatus, PACKAGE_STATUS.APPROVED);

    // 2. Reset — clears lastValidation as part of V4 gate hygiene
    r = resetPackage(registry, { actor, packageId: 'PKG-LIFE', at: '2026-01-02T00:00:00Z' });
    assert.equal(r.approvalStatus, PACKAGE_STATUS.PROPOSED);
    assert.equal(registry.packages[0].lastValidation, null);

    // 3. Reject
    r = rejectPackage(registry, { actor, packageId: 'PKG-LIFE', reason: 'Needs redesign', at: '2026-01-03T00:00:00Z' });
    assert.equal(r.approvalStatus, PACKAGE_STATUS.REJECTED);

    // 4. Reset again
    r = resetPackage(registry, { actor, packageId: 'PKG-LIFE', at: '2026-01-04T00:00:00Z' });
    assert.equal(r.approvalStatus, PACKAGE_STATUS.PROPOSED);

    // 5. Re-validate, then approve again
    revalidate();
    r = approvePackage(registry, { actor, packageId: 'PKG-LIFE', notes: 'Fixed', at: '2026-01-05T00:00:00Z' });
    assert.equal(r.approvalStatus, PACKAGE_STATUS.APPROVED);
    assert.equal(r.approvedAt, '2026-01-05T00:00:00Z');

    // Sales can now select it
    const ok = assertPackageSelectableByActor(registry, { actor: ACTORS.sales, packageId: 'PKG-LIFE' });
    assert.equal(ok, true);
  });
});
