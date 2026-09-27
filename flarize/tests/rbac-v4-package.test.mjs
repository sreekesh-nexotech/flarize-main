/**
 * RBAC V4 — Package authoring & approval capabilities.
 *
 * Asserts the 7 new capabilities exist, land on the correct rows, and
 * that PACKAGE_APPROVE is held ONLY by ADMIN.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CAPABILITY, CAPABILITY_MATRIX, ROLE, can } from '../src/lib/rbac.js';

const V4_CAPS = [
  'PACKAGE_CREATE',
  'PACKAGE_DUPLICATE',
  'PACKAGE_EDIT',
  'PACKAGE_SUBMIT',
  'PACKAGE_ARCHIVE',
  'PACKAGE_COMPARE',
  'PACKAGE_APPROVE',
];

test('RBAC V4 — all 7 package capabilities exist', () => {
  for (const cap of V4_CAPS) {
    assert.equal(CAPABILITY[cap], cap, `Expected CAPABILITY.${cap} to be defined`);
  }
});

test('RBAC V4 — ADMIN row includes PACKAGE_APPROVE, PACKAGE_ARCHIVE, PACKAGE_COMPARE', () => {
  const admin = CAPABILITY_MATRIX[ROLE.ADMIN];
  assert.ok(admin.includes(CAPABILITY.PACKAGE_APPROVE), 'ADMIN must hold PACKAGE_APPROVE');
  assert.ok(admin.includes(CAPABILITY.PACKAGE_ARCHIVE), 'ADMIN must hold PACKAGE_ARCHIVE');
  assert.ok(admin.includes(CAPABILITY.PACKAGE_COMPARE), 'ADMIN must hold PACKAGE_COMPARE');
});

test('RBAC V4 — PROJECT_HEAD row includes 6 authoring caps but NOT PACKAGE_APPROVE', () => {
  const ph = CAPABILITY_MATRIX[ROLE.PROJECT_HEAD];
  for (const cap of ['PACKAGE_CREATE', 'PACKAGE_DUPLICATE', 'PACKAGE_EDIT', 'PACKAGE_SUBMIT', 'PACKAGE_ARCHIVE', 'PACKAGE_COMPARE']) {
    assert.ok(ph.includes(CAPABILITY[cap]), `PROJECT_HEAD must hold ${cap}`);
  }
  assert.equal(ph.includes(CAPABILITY.PACKAGE_APPROVE), false, 'PROJECT_HEAD must NOT hold PACKAGE_APPROVE');
});

test('RBAC V4 — ENGINEERING row includes PACKAGE_COMPARE but NOT PACKAGE_APPROVE', () => {
  const eng = CAPABILITY_MATRIX[ROLE.ENGINEERING];
  assert.ok(eng.includes(CAPABILITY.PACKAGE_COMPARE), 'ENGINEERING must hold PACKAGE_COMPARE');
  assert.equal(eng.includes(CAPABILITY.PACKAGE_APPROVE), false, 'ENGINEERING must NOT hold PACKAGE_APPROVE');
});

test('RBAC V4 — no non-ADMIN role holds PACKAGE_APPROVE', () => {
  for (const role of ['PROCUREMENT', 'SALES', 'SALES_HEAD', 'SALES_CRS', 'FIELD_SALES', 'PROJECT_HEAD', 'ENGINEERING']) {
    assert.equal(can(role, CAPABILITY.PACKAGE_APPROVE), false, `${role} must NOT hold PACKAGE_APPROVE`);
  }
  assert.equal(can('ADMIN', CAPABILITY.PACKAGE_APPROVE), true, 'ADMIN must hold PACKAGE_APPROVE');
});
