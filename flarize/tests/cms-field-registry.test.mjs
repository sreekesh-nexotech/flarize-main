/**
 * C11-C — Dynamic Field Registry tests.
 * Covers: field whitelist, path safety, resolution, fallback modes, security.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_CATEGORY, FIELD_FORMAT, FALLBACK_MODE,
  FieldRegistry, isForbiddenPath, isValidFieldId,
  resolveFieldValue, getDefaultRegistry, _resetDefaultRegistry,
} from '../src/lib/cmsFieldRegistry.js';

// ── Constants ────────────────────────────────────────────────────────

describe('constants are frozen', () => {
  test('FIELD_CATEGORY frozen', () => { assert.ok(Object.isFrozen(FIELD_CATEGORY)); });
  test('FIELD_FORMAT frozen', () => { assert.ok(Object.isFrozen(FIELD_FORMAT)); });
  test('FALLBACK_MODE frozen', () => { assert.ok(Object.isFrozen(FALLBACK_MODE)); });
});

// ── Registry basics ──────────────────────────────────────────────────

describe('FieldRegistry', () => {
  test('contains all 33 built-in fields', () => {
    const r = new FieldRegistry();
    assert.equal(r.count(), 33);
  });

  test('get returns field by fieldId', () => {
    const r = new FieldRegistry();
    const f = r.get('customer.name');
    assert.ok(f);
    assert.equal(f.fieldId, 'customer.name');
    assert.equal(f.payloadPath, 'customerName');
    assert.equal(f.category, FIELD_CATEGORY.CUSTOMER);
  });

  test('get returns null for unknown fieldId', () => {
    const r = new FieldRegistry();
    assert.equal(r.get('nonexistent.field'), null);
  });

  test('has checks existence', () => {
    const r = new FieldRegistry();
    assert.equal(r.has('customer.name'), true);
    assert.equal(r.has('bogus'), false);
  });

  test('all returns array of all fields', () => {
    const r = new FieldRegistry();
    const all = r.all();
    assert.ok(Array.isArray(all));
    assert.equal(all.length, 33);
  });

  test('byCategory filters correctly', () => {
    const r = new FieldRegistry();
    const customer = r.byCategory(FIELD_CATEGORY.CUSTOMER);
    assert.equal(customer.length, 4);
    for (const f of customer) assert.equal(f.category, FIELD_CATEGORY.CUSTOMER);
  });

  test('every category is represented', () => {
    const r = new FieldRegistry();
    for (const cat of Object.values(FIELD_CATEGORY)) {
      assert.ok(r.byCategory(cat).length > 0, `${cat} should have fields`);
    }
  });

  test('CUSTOMER fields: name, address, phone, pincode', () => {
    const r = new FieldRegistry();
    const ids = r.byCategory(FIELD_CATEGORY.CUSTOMER).map(f => f.fieldId).sort();
    assert.deepEqual(ids, ['customer.address', 'customer.name', 'customer.phone', 'customer.pincode']);
  });

  test('SYSTEM fields: type, sizeKw, phase, panelCount', () => {
    const r = new FieldRegistry();
    const ids = r.byCategory(FIELD_CATEGORY.SYSTEM).map(f => f.fieldId).sort();
    assert.deepEqual(ids, ['system.panelCount', 'system.phase', 'system.sizeKw', 'system.type']);
  });

  test('PRICING fields: 3 customer-facing only', () => {
    const r = new FieldRegistry();
    const ids = r.byCategory(FIELD_CATEGORY.PRICING).map(f => f.fieldId).sort();
    assert.equal(ids.length, 3);
    for (const id of ids) assert.ok(id.startsWith('pricing.customer.'));
  });

  test('CAMPAIGN fields: 11 fields', () => {
    const r = new FieldRegistry();
    assert.equal(r.byCategory(FIELD_CATEGORY.CAMPAIGN).length, 11);
  });

  test('SAVINGS fields: 3 fields', () => {
    const r = new FieldRegistry();
    assert.equal(r.byCategory(FIELD_CATEGORY.SAVINGS).length, 3);
  });

  test('every field has required properties', () => {
    const r = new FieldRegistry();
    for (const f of r.all()) {
      assert.ok(f.fieldId, 'fieldId');
      assert.ok(f.payloadPath, 'payloadPath');
      assert.ok(f.label, 'label');
      assert.ok(f.category, 'category');
      assert.ok(f.format, 'format');
      assert.ok(f.fallbackDefault, 'fallbackDefault');
    }
  });
});

// ── Path safety ──────────────────────────────────────────────────────

describe('isForbiddenPath', () => {
  test('null/undefined/empty → forbidden', () => {
    assert.equal(isForbiddenPath(null), true);
    assert.equal(isForbiddenPath(undefined), true);
    assert.equal(isForbiddenPath(''), true);
  });

  test('pricing.internal → forbidden', () => {
    assert.equal(isForbiddenPath('pricing.internal'), true);
    assert.equal(isForbiddenPath('pricing.internal.marginPercent'), true);
  });

  test('engineering → forbidden', () => {
    assert.equal(isForbiddenPath('engineering'), true);
    assert.equal(isForbiddenPath('engineering.validationResult'), true);
  });

  test('margin → forbidden', () => {
    assert.equal(isForbiddenPath('margin'), true);
    assert.equal(isForbiddenPath('margin.whatever'), true);
  });

  test('cost → forbidden', () => {
    assert.equal(isForbiddenPath('cost'), true);
    assert.equal(isForbiddenPath('cost.breakdown'), true);
  });

  test('rate → forbidden', () => {
    assert.equal(isForbiddenPath('rate'), true);
  });

  test('supplier → forbidden', () => {
    assert.equal(isForbiddenPath('supplier'), true);
    assert.equal(isForbiddenPath('supplier.purchasePrice'), true);
  });

  test('purchase → forbidden', () => {
    assert.equal(isForbiddenPath('purchase'), true);
  });

  test('actor/session/token → forbidden', () => {
    assert.equal(isForbiddenPath('actor'), true);
    assert.equal(isForbiddenPath('session'), true);
    assert.equal(isForbiddenPath('token'), true);
  });

  test('version/snapshot/internal → forbidden', () => {
    assert.equal(isForbiddenPath('version'), true);
    assert.equal(isForbiddenPath('snapshot'), true);
    assert.equal(isForbiddenPath('internal'), true);
  });

  test('bomSnapshot/commercialSnapshot → forbidden', () => {
    assert.equal(isForbiddenPath('bomSnapshot'), true);
    assert.equal(isForbiddenPath('commercialSnapshot'), true);
  });

  test('discount → forbidden', () => {
    assert.equal(isForbiddenPath('discount'), true);
    assert.equal(isForbiddenPath('discount.amount'), true);
  });

  test('pricing.value.procurementCost → forbidden', () => {
    assert.equal(isForbiddenPath('pricing.value.procurementCost'), true);
  });

  test('pricing.value.marginAmount → forbidden', () => {
    assert.equal(isForbiddenPath('pricing.value.marginAmount'), true);
  });

  test('pricing.value.costBreakdown → forbidden', () => {
    assert.equal(isForbiddenPath('pricing.value.costBreakdown'), true);
  });

  test('safe paths → allowed', () => {
    assert.equal(isForbiddenPath('customerName'), false);
    assert.equal(isForbiddenPath('systemSizekW'), false);
    assert.equal(isForbiddenPath('pricing.value.customerTotalIncludingGST'), false);
    assert.equal(isForbiddenPath('components.panel.brand'), false);
    assert.equal(isForbiddenPath('campaign.value.headline'), false);
  });

  test('no built-in field uses a forbidden path', () => {
    const r = new FieldRegistry();
    for (const f of r.all()) {
      assert.equal(isForbiddenPath(f.payloadPath), false,
        `built-in field ${f.fieldId} has forbidden path ${f.payloadPath}`);
    }
  });
});

// ── Field ID validation ──────────────────────────────────────────────

describe('isValidFieldId', () => {
  test('valid IDs', () => {
    assert.equal(isValidFieldId('customer.name'), true);
    assert.equal(isValidFieldId('system.sizeKw'), true);
    assert.equal(isValidFieldId('pricing.customer.gstAmount'), true);
    assert.equal(isValidFieldId('my-custom-field'), true);
    assert.equal(isValidFieldId('field_v2'), true);
  });

  test('invalid IDs', () => {
    assert.equal(isValidFieldId(''), false);
    assert.equal(isValidFieldId(null), false);
    assert.equal(isValidFieldId(undefined), false);
    assert.equal(isValidFieldId(42), false);
    assert.equal(isValidFieldId('.starts.with.dot'), false);
    assert.equal(isValidFieldId('has spaces'), false);
    assert.equal(isValidFieldId('has<html>'), false);
    assert.equal(isValidFieldId('has;semicolon'), false);
    assert.equal(isValidFieldId('eval()'), false);
    assert.equal(isValidFieldId('a'.repeat(101)), false);
  });
});

// ── Value resolution ─────────────────────────────────────────────────

describe('resolveFieldValue', () => {
  const PAYLOAD = {
    customerName: 'Rajesh Kumar',
    customerAddress: '123 MG Road, Kerala',
    customerPhone: '9876543210',
    systemSizekW: 5,
    panelCountRequired: 10,
    quotationId: 'Q-2026-001',
    components: {
      panel: { brand: 'TestPanel', model: 'TP-550', moduleWatt: 550 },
      inverter: { brand: 'TestInverter', model: 'TI-5K', phase: 'Single Phase' },
    },
    pricing: {
      available: true,
      value: {
        systemCostBeforeSubsidy: 325000,
        customerTotalIncludingGST: 383500,
        gstAmount: 58500,
      },
    },
    campaign: {
      available: true,
      value: {
        headline: 'Onam Special',
        subheadline: 'Limited Time',
        offers: [{ title: '10% off' }],
        primaryBenefit: { headline: 'Save Big', displayValue: '₹50,000' },
      },
    },
  };

  test('resolves simple top-level field', () => {
    const r = new FieldRegistry();
    const result = resolveFieldValue(PAYLOAD, r.get('customer.name'));
    assert.equal(result.resolved, true);
    assert.equal(result.value, 'Rajesh Kumar');
  });

  test('resolves nested dotted path', () => {
    const r = new FieldRegistry();
    const result = resolveFieldValue(PAYLOAD, r.get('component.panel.brand'));
    assert.equal(result.resolved, true);
    assert.equal(result.value, 'TestPanel');
  });

  test('resolves deeply nested path', () => {
    const r = new FieldRegistry();
    const result = resolveFieldValue(PAYLOAD, r.get('pricing.customer.customerTotalIncludingGST'));
    assert.equal(result.resolved, true);
    assert.equal(result.value, 383500);
  });

  test('resolves campaign nested path', () => {
    const r = new FieldRegistry();
    const result = resolveFieldValue(PAYLOAD, r.get('campaign.headline'));
    assert.equal(result.resolved, true);
    assert.equal(result.value, 'Onam Special');
  });

  test('resolves list field', () => {
    const r = new FieldRegistry();
    const result = resolveFieldValue(PAYLOAD, r.get('campaign.offers'));
    assert.equal(result.resolved, true);
    assert.ok(Array.isArray(result.value));
  });

  test('resolves object field', () => {
    const r = new FieldRegistry();
    const result = resolveFieldValue(PAYLOAD, r.get('campaign.primaryBenefit.headline'));
    assert.equal(result.resolved, true);
    assert.equal(result.value, 'Save Big');
  });

  test('missing value uses BLOCKED fallback', () => {
    const r = new FieldRegistry();
    const result = resolveFieldValue({}, r.get('customer.name'));
    assert.equal(result.resolved, false);
    assert.equal(result.display, '[Data unavailable]');
  });

  test('missing value uses HIDE fallback', () => {
    const r = new FieldRegistry();
    const result = resolveFieldValue({}, r.get('customer.pincode'));
    assert.equal(result.resolved, false);
    assert.equal(result.display, '');
  });

  test('explicit fallbackText mode', () => {
    const r = new FieldRegistry();
    const result = resolveFieldValue({}, r.get('customer.name'), {
      fallback: FALLBACK_MODE.FALLBACK_TEXT,
      fallbackText: 'N/A',
    });
    assert.equal(result.resolved, false);
    assert.equal(result.display, 'N/A');
  });

  test('null payload → fallback', () => {
    const r = new FieldRegistry();
    const result = resolveFieldValue(null, r.get('customer.name'));
    assert.equal(result.resolved, false);
  });

  test('null fieldDef → fallback', () => {
    const result = resolveFieldValue(PAYLOAD, null);
    assert.equal(result.resolved, false);
  });

  test('partially missing nested path → fallback', () => {
    const r = new FieldRegistry();
    const partialPayload = { pricing: {} }; // no .value
    const result = resolveFieldValue(partialPayload, r.get('pricing.customer.customerTotalIncludingGST'));
    assert.equal(result.resolved, false);
  });
});

// ── SECURITY: Negative tests ─────────────────────────────────────────

describe('SECURITY — negative tests', () => {
  test('no field exposes pricing.internal', () => {
    const r = new FieldRegistry();
    for (const f of r.all()) {
      assert.ok(!f.payloadPath.startsWith('pricing.internal'),
        `${f.fieldId} must not expose pricing.internal`);
    }
  });

  test('no field exposes engineering data', () => {
    const r = new FieldRegistry();
    for (const f of r.all()) {
      assert.ok(!f.payloadPath.startsWith('engineering'),
        `${f.fieldId} must not expose engineering`);
    }
  });

  test('no field exposes margin/cost/rate', () => {
    const r = new FieldRegistry();
    for (const f of r.all()) {
      const p = f.payloadPath.toLowerCase();
      assert.ok(!p.includes('margin') || p.includes('customerTotalIncludingGST'),
        `${f.fieldId} must not expose margin`);
      assert.ok(!p.startsWith('cost'), `${f.fieldId} must not expose cost`);
      assert.ok(!p.startsWith('rate'), `${f.fieldId} must not expose rate`);
    }
  });

  test('no field exposes supplier/purchase data', () => {
    const r = new FieldRegistry();
    for (const f of r.all()) {
      assert.ok(!f.payloadPath.startsWith('supplier'), f.fieldId);
      assert.ok(!f.payloadPath.startsWith('purchase'), f.fieldId);
    }
  });

  test('no field exposes actor/session/token', () => {
    const r = new FieldRegistry();
    for (const f of r.all()) {
      assert.ok(!f.payloadPath.startsWith('actor'), f.fieldId);
      assert.ok(!f.payloadPath.startsWith('session'), f.fieldId);
      assert.ok(!f.payloadPath.startsWith('token'), f.fieldId);
    }
  });

  test('resolver uses no eval/Function', () => {
    // Verify resolveFieldValue does NOT execute strings as code
    const malicious = {
      fieldId: 'test',
      payloadPath: 'constructor.constructor("return process")().exit()',
      label: 'Evil',
      category: 'CUSTOM',
      format: 'text',
      fallbackDefault: 'blocked',
    };
    // Should return fallback, not execute
    const result = resolveFieldValue({ constructor: {} }, malicious);
    assert.equal(result.resolved, false);
  });

  test('prototype pollution path does not resolve', () => {
    const malicious = {
      fieldId: 'test',
      payloadPath: '__proto__.polluted',
      label: 'Evil',
      category: 'CUSTOM',
      format: 'text',
      fallbackDefault: 'blocked',
    };
    const result = resolveFieldValue({}, malicious);
    assert.equal(result.resolved, false);
  });

  test('resolver handles array index paths safely', () => {
    const fieldDef = {
      fieldId: 'test',
      payloadPath: 'items.0.name',
      label: 'Test',
      category: 'CUSTOM',
      format: 'text',
      fallbackDefault: 'blocked',
    };
    // Arrays accessed by numeric string key — returns value if present
    const result = resolveFieldValue({ items: [{ name: 'first' }] }, fieldDef);
    assert.equal(result.value, 'first');
  });
});

// ── Default registry singleton ───────────────────────────────────────

describe('default registry', () => {
  test('getDefaultRegistry returns same instance', () => {
    _resetDefaultRegistry();
    const a = getDefaultRegistry();
    const b = getDefaultRegistry();
    assert.equal(a, b);
  });

  test('reset creates new instance', () => {
    const a = getDefaultRegistry();
    _resetDefaultRegistry();
    const b = getDefaultRegistry();
    assert.notEqual(a, b);
  });
});
