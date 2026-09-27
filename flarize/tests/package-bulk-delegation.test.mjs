/**
 * bulkApprovePackages delegates the V4 gate to approvePackage — it does
 * NOT re-implement validation.
 *
 * Given three DRAFT packages: one VALID, one WARNING, one no lastValidation,
 * an ADMIN bulk-approve should approve the VALID one and error the other two
 * with the correct codes.
 *
 * Structural check: the bulkApprovePackages source must not contain the
 * literal 'VALIDATION_MISSING' — proof that the gate logic lives only in
 * approvePackage.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  bulkApprovePackages,
  APPROVAL_ERROR,
  PACKAGE_STATE,
  PACKAGE_STATUS,
} from '../src/lib/packageApproval.js';

const ADMIN = { userId: 'admin-01', role: 'ADMIN' };
const TS = '2026-09-03T00:00:00Z';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_APPROVAL_SOURCE = path.join(__dirname, '..', 'src', 'lib', 'packageApproval.js');

function makePkg(overrides = {}) {
  return {
    packageId: overrides.packageId,
    systemType: overrides.systemType ?? 'ongrid',
    size: overrides.size ?? '5',
    phase: overrides.phase ?? '1P',
    tier: overrides.tier ?? 'base',
    approvalStatus: PACKAGE_STATUS.PROPOSED,
    packageState: PACKAGE_STATE.DRAFT,
    revisionNumber: 1,
    comboKey: `${overrides.systemType ?? 'ongrid'}|${overrides.size ?? '5'}|${overrides.phase ?? '1P'}|${overrides.packageId ?? 'x'}`,
    supersededBy: null,
    architecture: 'DEYE',
    lastValidation: overrides.lastValidation !== undefined ? overrides.lastValidation : null,
    components: [],
  };
}

test('bulkApprovePackages — VALID succeeds, WARNING/MISSING error with correct codes', () => {
  const registry = {
    packages: [
      makePkg({ packageId: 'A', lastValidation: { status: 'VALID', revisionNumber: 1 } }),
      makePkg({ packageId: 'B', lastValidation: { status: 'WARNING', revisionNumber: 1 } }),
      makePkg({ packageId: 'C', lastValidation: null }),
    ],
  };

  const result = bulkApprovePackages(registry, { actor: ADMIN, filter: {}, at: TS });
  assert.equal(result.total, 3);
  assert.equal(result.approved.length, 1);
  assert.equal(result.approved[0].packageId, 'A');

  assert.equal(result.errors.length, 2);
  const codeFor = id => result.errors.find(e => e.packageId === id)?.code;
  assert.equal(codeFor('B'), APPROVAL_ERROR.PACKAGE_NOT_VALID);
  assert.equal(codeFor('C'), APPROVAL_ERROR.VALIDATION_MISSING);
});

test('bulkApprovePackages source does not contain the literal VALIDATION_MISSING', () => {
  // Structural proof that the V4 gate lives only in approvePackage. If a
  // future refactor duplicated the gate inside bulkApprovePackages, this
  // test would flag it.
  const source = fs.readFileSync(PACKAGE_APPROVAL_SOURCE, 'utf-8');
  const bulkStart = source.indexOf('export function bulkApprovePackages');
  assert.ok(bulkStart > 0);
  const rest = source.slice(bulkStart);
  const nextExport = rest.indexOf('\nexport function', 1);
  const bulkBody = nextExport > 0 ? rest.slice(0, nextExport) : rest;
  assert.equal(bulkBody.includes('VALIDATION_MISSING'), false,
    'bulkApprovePackages must not restate VALIDATION_MISSING — the gate lives in approvePackage');
});
