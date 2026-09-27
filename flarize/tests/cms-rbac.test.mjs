/**
 * C11-B — CMS RBAC capability tests.
 * Verifies CMS_VIEW, CMS_EDIT, CMS_PUBLISH, CMS_ASSET_MANAGE
 * are assigned ONLY to ADMIN and PROJECT_HEAD.
 * Does NOT restate or duplicate existing RBAC tests.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as RBAC from '../src/lib/rbac.js';

const CMS_CAPS = [
  RBAC.CAPABILITY.CMS_VIEW,
  RBAC.CAPABILITY.CMS_EDIT,
  RBAC.CAPABILITY.CMS_PUBLISH,
  RBAC.CAPABILITY.CMS_ASSET_MANAGE,
];

const CMS_GRANTED_ROLES = ['ADMIN', 'PROJECT_HEAD'];
const CMS_DENIED_ROLES = ['ENGINEERING', 'PROCUREMENT', 'SALES', 'SALES_HEAD'];

describe('CMS capabilities exist', () => {
  test('all four CMS capabilities are defined', () => {
    for (const cap of CMS_CAPS) {
      assert.ok(cap, `capability ${cap} must be defined`);
      assert.equal(typeof cap, 'string');
    }
  });

  test('CMS capabilities are in the CAPABILITY enum', () => {
    assert.equal(RBAC.CAPABILITY.CMS_VIEW, 'CMS_VIEW');
    assert.equal(RBAC.CAPABILITY.CMS_EDIT, 'CMS_EDIT');
    assert.equal(RBAC.CAPABILITY.CMS_PUBLISH, 'CMS_PUBLISH');
    assert.equal(RBAC.CAPABILITY.CMS_ASSET_MANAGE, 'CMS_ASSET_MANAGE');
  });
});

describe('CMS granted to ADMIN and PROJECT_HEAD', () => {
  for (const role of CMS_GRANTED_ROLES) {
    for (const cap of CMS_CAPS) {
      test(`${role} can ${cap}`, () => {
        assert.equal(RBAC.can(role, cap), true);
      });
    }
  }
});

describe('CMS denied to other roles', () => {
  for (const role of CMS_DENIED_ROLES) {
    for (const cap of CMS_CAPS) {
      test(`${role} cannot ${cap}`, () => {
        assert.equal(RBAC.can(role, cap), false);
      });
    }
  }
});

describe('assertCan enforces CMS capabilities', () => {
  const ADMIN = { userId: 'a1', role: 'ADMIN' };
  const PH = { userId: 'ph1', role: 'PROJECT_HEAD' };
  const SALES = { userId: 's1', role: 'SALES' };

  test('ADMIN passes assertCan for CMS_EDIT', () => {
    assert.doesNotThrow(() => RBAC.assertCan(ADMIN, RBAC.CAPABILITY.CMS_EDIT));
  });

  test('PROJECT_HEAD passes assertCan for CMS_PUBLISH', () => {
    assert.doesNotThrow(() => RBAC.assertCan(PH, RBAC.CAPABILITY.CMS_PUBLISH));
  });

  test('SALES fails assertCan for CMS_VIEW', () => {
    assert.throws(() => RBAC.assertCan(SALES, RBAC.CAPABILITY.CMS_VIEW),
      e => e.code === RBAC.RBAC_ERROR.CAPABILITY_DENIED);
  });

  test('SALES fails assertCan for CMS_EDIT', () => {
    assert.throws(() => RBAC.assertCan(SALES, RBAC.CAPABILITY.CMS_EDIT),
      e => e.code === RBAC.RBAC_ERROR.CAPABILITY_DENIED);
  });

  test('SALES fails assertCan for CMS_PUBLISH', () => {
    assert.throws(() => RBAC.assertCan(SALES, RBAC.CAPABILITY.CMS_PUBLISH),
      e => e.code === RBAC.RBAC_ERROR.CAPABILITY_DENIED);
  });

  test('SALES fails assertCan for CMS_ASSET_MANAGE', () => {
    assert.throws(() => RBAC.assertCan(SALES, RBAC.CAPABILITY.CMS_ASSET_MANAGE),
      e => e.code === RBAC.RBAC_ERROR.CAPABILITY_DENIED);
  });

  test('anonymous actor fails for CMS capabilities', () => {
    assert.throws(() => RBAC.assertCan(null, RBAC.CAPABILITY.CMS_VIEW),
      e => e.code === RBAC.RBAC_ERROR.NO_ACTOR);
  });
});

describe('capabilitiesOf includes CMS for granted roles', () => {
  test('ADMIN capabilities include CMS_*', () => {
    const caps = RBAC.capabilitiesOf('ADMIN');
    for (const cap of CMS_CAPS) {
      assert.ok(caps.includes(cap), `ADMIN should have ${cap}`);
    }
  });

  test('PROJECT_HEAD capabilities include CMS_*', () => {
    const caps = RBAC.capabilitiesOf('PROJECT_HEAD');
    for (const cap of CMS_CAPS) {
      assert.ok(caps.includes(cap), `PROJECT_HEAD should have ${cap}`);
    }
  });

  test('SALES capabilities exclude CMS_*', () => {
    const caps = RBAC.capabilitiesOf('SALES');
    for (const cap of CMS_CAPS) {
      assert.ok(!caps.includes(cap), `SALES should NOT have ${cap}`);
    }
  });
});

describe('no second permission system', () => {
  test('CMS capabilities use the same can() function', () => {
    // Verify the same RBAC mechanism — not a separate check
    assert.equal(typeof RBAC.can, 'function');
    assert.equal(typeof RBAC.assertCan, 'function');
    // can() is the same function for CMS as for existing caps
    assert.equal(RBAC.can('ADMIN', RBAC.CAPABILITY.CMS_VIEW), true);
    assert.equal(RBAC.can('ADMIN', RBAC.CAPABILITY.PROJECT_VIEW), true);
  });

  test('CAPABILITY_MATRIX remains frozen', () => {
    assert.ok(Object.isFrozen(RBAC.CAPABILITY_MATRIX));
    assert.ok(Object.isFrozen(RBAC.CAPABILITY_MATRIX.ADMIN));
    assert.ok(Object.isFrozen(RBAC.CAPABILITY_MATRIX.PROJECT_HEAD));
  });

  test('existing capabilities unchanged — ADMIN still lacks BOM_EDIT', () => {
    assert.equal(RBAC.can('ADMIN', RBAC.CAPABILITY.BOM_EDIT), false);
  });

  test('existing capabilities unchanged — SALES still has QUOTATION_CREATE', () => {
    assert.equal(RBAC.can('SALES', RBAC.CAPABILITY.QUOTATION_CREATE), true);
  });
});
