/**
 * Anti-restart invariant — ENGINEERING_APPROVE is preserved.
 *
 * The Phase 3 V4 refactor moves lifecycle approval to PACKAGE_APPROVE (ADMIN),
 * but the legacy ENGINEERING_APPROVE capability must remain byte-for-byte
 * where it was — as the capability enum entry AND on the ENGINEERING row.
 * Deleting it would silently invalidate saved audit rows and force a restart
 * of the RBAC migration.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CAPABILITY, CAPABILITY_MATRIX, ROLE, can } from '../src/lib/rbac.js';

test('ENGINEERING_APPROVE capability still exported', () => {
  assert.equal(CAPABILITY.ENGINEERING_APPROVE, 'ENGINEERING_APPROVE');
});

test('ENGINEERING role still holds ENGINEERING_APPROVE', () => {
  const eng = CAPABILITY_MATRIX[ROLE.ENGINEERING];
  assert.ok(eng.includes(CAPABILITY.ENGINEERING_APPROVE),
    'ENGINEERING must still carry ENGINEERING_APPROVE (anti-restart invariant)');
});

test('can("ENGINEERING", ENGINEERING_APPROVE) returns true', () => {
  assert.equal(can('ENGINEERING', CAPABILITY.ENGINEERING_APPROVE), true);
});

test('ENGINEERING_APPROVE is NOT held by any non-ENGINEERING role', () => {
  for (const role of ['ADMIN', 'PROJECT_HEAD', 'PROCUREMENT', 'SALES', 'SALES_HEAD', 'SALES_CRS', 'FIELD_SALES']) {
    assert.equal(can(role, CAPABILITY.ENGINEERING_APPROVE), false, `${role} must not hold ENGINEERING_APPROVE`);
  }
});
