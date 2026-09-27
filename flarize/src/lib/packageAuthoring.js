/**
 * PACKAGE AUTHORING — READ-ONLY COMPARE.  (Phase 3 V4)
 *
 * The V4 authoring lifecycle (create / edit / revise / submit / archive)
 * lives in `packageApproval.js` alongside the approval gate. This module
 * exposes only the read-only compare surface, because comparing packages
 * has a distinct RBAC boundary (PACKAGE_COMPARE — ADMIN, PROJECT_HEAD,
 * ENGINEERING) and must NEVER leak cost, pricing, landed-cost or margin
 * data. The contract test asserts none of those keys appear in the
 * response even by accident.
 */

import { assertCan, CAPABILITY } from './rbac.js';

export const AUTHORING_ERROR = {
  INVALID_COMPARE_COUNT: 'INVALID_COMPARE_COUNT',
  PACKAGE_NOT_FOUND: 'PACKAGE_NOT_FOUND',
};

class AuthoringError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'AuthoringError';
    this.code = code;
    this.detail = detail;
  }
}

function findPackage(registry, packageId) {
  const packages = registry?.packages || [];
  return packages.find(p => p.packageId === packageId) || null;
}

function findComponentByRole(pkg, role) {
  const comps = pkg?.components || [];
  const hit = comps.find(c => c.role === role);
  return hit ? (hit.componentId ?? null) : null;
}

/**
 * Compare 2-5 packages side-by-side. Returns identifiers, states and
 * key-component references only — no economics.
 */
export function comparePackages(registry, { actor, packageIds }) {
  assertCan(actor, CAPABILITY.PACKAGE_COMPARE);

  if (!Array.isArray(packageIds) || packageIds.length < 2 || packageIds.length > 5) {
    throw new AuthoringError(AUTHORING_ERROR.INVALID_COMPARE_COUNT,
      'Compare requires between 2 and 5 packageIds.',
      { received: Array.isArray(packageIds) ? packageIds.length : null });
  }

  const packages = packageIds.map(id => {
    const pkg = findPackage(registry, id);
    if (!pkg) throw new AuthoringError(AUTHORING_ERROR.PACKAGE_NOT_FOUND,
      `Package "${id}" not found.`, { packageId: id });
    return projectComparePackage(pkg);
  });

  const diffMatrix = buildDiffMatrix(packages);

  return { packages, diffMatrix };
}

function projectComparePackage(pkg) {
  const components = Array.isArray(pkg.components) ? pkg.components : [];
  return {
    packageId: pkg.packageId,
    comboKey: pkg.comboKey ?? `${pkg.systemType ?? ''}|${pkg.size ?? ''}|${pkg.phase ?? ''}|${pkg.tier ?? ''}`,
    packageState: pkg.packageState ?? null,
    revisionNumber: pkg.revisionNumber ?? 1,
    supersededBy: pkg.supersededBy ?? null,
    architecture: pkg.architecture ?? null,
    keyComponents: {
      panel: findComponentByRole(pkg, 'panel'),
      inverter: findComponentByRole(pkg, 'inverter'),
      structure: findComponentByRole(pkg, 'structure_material'),
      battery: findComponentByRole(pkg, 'battery'),
    },
    componentCount: components.length,
    componentsApproved: components.filter(c => c.approvalStatus === 'APPROVED').length,
    blockersCount: Array.isArray(pkg.blockers) ? pkg.blockers.length : 0,
    lastValidationStatus: pkg.lastValidation?.status ?? null,
    lastValidationAt: pkg.lastValidation?.at ?? null,
    createdBy: pkg.createdBy ?? null,
    createdAt: pkg.createdAt ?? null,
    submittedBy: pkg.submittedBy ?? null,
    submittedAt: pkg.submittedAt ?? null,
    approvedBy: pkg.approvedBy ?? null,
    approvedAt: pkg.approvedAt ?? null,
  };
}

function buildDiffMatrix(packages) {
  const roles = ['panel', 'inverter', 'structure', 'battery'];
  const out = {};
  for (const role of roles) {
    out[role] = packages.map((p, index) => ({
      index,
      componentId: p.keyComponents[role],
    }));
  }
  return out;
}
