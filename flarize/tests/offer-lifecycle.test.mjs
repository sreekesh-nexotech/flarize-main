// Offer Lifecycle Tests
// Covers: validateOffer, marginSafetyCheck, findApplicableOffer,
//         calculateOfferAmount, offerPayloadShape

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  validateOffer,
  marginSafetyCheck,
  findApplicableOffer,
  calculateOfferAmount,
  offerPayloadShape,
  OFFER_TYPE,
  OFFER_STATUS,
  OFFER_ERROR,
} = await import('../src/lib/offerLifecycle.js');

// =========================================================================
// 1. validateOffer
// =========================================================================
describe('validateOffer', () => {
  it('accepts a valid flat offer', () => {
    const result = validateOffer({ name: 'Summer Sale', type: 'flat', value: 5000 });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('accepts a valid percentage offer', () => {
    const result = validateOffer({ name: 'Monsoon 10%', type: 'percentage', value: 10 });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('accepts percentage offer at boundary value 100', () => {
    const result = validateOffer({ name: 'Full Off', type: 'percentage', value: 100 });
    assert.equal(result.valid, true);
  });

  it('accepts flat offer with value 0', () => {
    const result = validateOffer({ name: 'Zero Offer', type: 'flat', value: 0 });
    assert.equal(result.valid, true);
  });

  it('rejects missing name', () => {
    const result = validateOffer({ type: 'flat', value: 1000 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /name/i.test(e)));
  });

  it('rejects empty string name', () => {
    const result = validateOffer({ name: '', type: 'flat', value: 1000 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /name/i.test(e)));
  });

  it('rejects whitespace-only name', () => {
    const result = validateOffer({ name: '   ', type: 'flat', value: 1000 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /name/i.test(e)));
  });

  it('rejects invalid offer type', () => {
    const result = validateOffer({ name: 'Bad Type', type: 'bogus', value: 10 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /type/i.test(e)));
  });

  it('rejects missing offer type', () => {
    const result = validateOffer({ name: 'No Type', value: 10 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /type/i.test(e)));
  });

  it('rejects negative value', () => {
    const result = validateOffer({ name: 'Negative', type: 'flat', value: -500 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /value/i.test(e)));
  });

  it('rejects null value', () => {
    const result = validateOffer({ name: 'Null Val', type: 'flat', value: null });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /value/i.test(e)));
  });

  it('rejects undefined value', () => {
    const result = validateOffer({ name: 'No Val', type: 'flat' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /value/i.test(e)));
  });

  it('rejects percentage offer exceeding 100', () => {
    const result = validateOffer({ name: 'Over 100', type: 'percentage', value: 101 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /100/i.test(e)));
  });

  it('allows flat offer with value > 100 (not a percentage)', () => {
    const result = validateOffer({ name: 'Big Flat', type: 'flat', value: 50000 });
    assert.equal(result.valid, true);
  });

  it('collects multiple errors at once', () => {
    const result = validateOffer({ type: 'bogus', value: -1 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 3, `expected >= 3 errors, got ${result.errors.length}`);
  });
});

// =========================================================================
// 2. marginSafetyCheck
// =========================================================================
describe('marginSafetyCheck', () => {
  it('returns safe when margin is above minimum', () => {
    // listPrice 100000, cost 70000, flat offer 5000 => net 95000
    // margin = (95000-70000)/95000 = 0.2631...
    const result = marginSafetyCheck(100000, 70000, { type: 'flat', value: 5000 }, 0.15);
    assert.equal(result.safe, true);
    assert.ok(result.effectiveMargin > 0.15);
    assert.equal(result.breach, null);
    assert.equal(result.offerAmount, 5000);
    assert.equal(result.netPrice, 95000);
  });

  it('returns breach when margin falls below minimum', () => {
    // listPrice 100000, cost 90000, flat offer 5000 => net 95000
    // margin = (95000-90000)/95000 = 0.0526... < 0.15
    const result = marginSafetyCheck(100000, 90000, { type: 'flat', value: 5000 }, 0.15);
    assert.equal(result.safe, false);
    assert.ok(result.effectiveMargin < 0.15);
    assert.ok(typeof result.breach === 'number');
    assert.ok(result.breach > 0);
  });

  it('handles flat offer correctly', () => {
    const result = marginSafetyCheck(200000, 100000, { type: 'flat', value: 20000 }, 0.10);
    assert.equal(result.offerAmount, 20000);
    assert.equal(result.netPrice, 180000);
    // margin = (180000-100000)/180000 = 0.4444
    assert.ok(result.safe);
  });

  it('handles percentage offer correctly', () => {
    // 10% of 200000 = 20000
    const result = marginSafetyCheck(200000, 100000, { type: 'percentage', value: 10 }, 0.10);
    assert.equal(result.offerAmount, 20000);
    assert.equal(result.netPrice, 180000);
    assert.ok(result.safe);
  });

  it('returns unsafe when offer exceeds list price (flat)', () => {
    const result = marginSafetyCheck(50000, 40000, { type: 'flat', value: 60000 }, 0.15);
    assert.equal(result.safe, false);
    assert.equal(result.effectiveMargin, -1);
    assert.ok(/exceeds/i.test(result.reason));
  });

  it('returns unsafe when percentage offer is 100%', () => {
    const result = marginSafetyCheck(100000, 50000, { type: 'percentage', value: 100 }, 0.15);
    assert.equal(result.safe, false);
    assert.equal(result.effectiveMargin, -1);
  });

  it('returns unsafe with reason for missing listPrice', () => {
    const result = marginSafetyCheck(0, 50000, { type: 'flat', value: 1000 }, 0.15);
    assert.equal(result.safe, false);
    assert.ok(/missing/i.test(result.reason));
  });

  it('returns unsafe with reason for missing cost', () => {
    const result = marginSafetyCheck(100000, 0, { type: 'flat', value: 1000 }, 0.15);
    assert.equal(result.safe, false);
    assert.ok(/missing/i.test(result.reason));
  });

  it('returns unsafe with reason for null listPrice', () => {
    const result = marginSafetyCheck(null, 50000, { type: 'flat', value: 1000 }, 0.15);
    assert.equal(result.safe, false);
    assert.ok(/missing/i.test(result.reason));
  });

  it('returns unsafe with reason for negative listPrice', () => {
    const result = marginSafetyCheck(-100000, 50000, { type: 'flat', value: 1000 }, 0.15);
    assert.equal(result.safe, false);
    assert.ok(/missing/i.test(result.reason));
  });

  it('margin exactly equals minMargin is safe', () => {
    // Need: (netPrice - cost) / netPrice = minMargin
    // Let minMargin = 0.20, cost = 80000
    // 0.20 = (net - 80000) / net => net = 100000
    // So listPrice - offerAmount = 100000
    const result = marginSafetyCheck(110000, 80000, { type: 'flat', value: 10000 }, 0.20);
    // net = 100000, margin = 20000/100000 = 0.20
    assert.equal(result.safe, true);
    assert.equal(result.breach, null);
  });
});

// =========================================================================
// 3. findApplicableOffer
// =========================================================================
describe('findApplicableOffer', () => {
  const baseOffer = {
    id: 'off-1',
    name: 'Base Offer',
    type: 'flat',
    value: 5000,
    active: true,
    status: 'ACTIVE',
    appliesTo: 'ongrid',
    appliesToTier: 'base',
    appliesToSize: '5sp',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('matches offer by systemType, tier, and size', () => {
    const result = findApplicableOffer([baseOffer], {
      systemType: 'ongrid', tier: 'base', size: '5sp', date: '2026-06-15',
    });
    assert.ok(result);
    assert.equal(result.id, 'off-1');
  });

  it('returns null when systemType does not match', () => {
    const result = findApplicableOffer([baseOffer], {
      systemType: 'hybrid', tier: 'base', size: '5sp', date: '2026-06-15',
    });
    assert.equal(result, null);
  });

  it('returns null when tier does not match', () => {
    const result = findApplicableOffer([baseOffer], {
      systemType: 'ongrid', tier: 'premium', size: '5sp', date: '2026-06-15',
    });
    assert.equal(result, null);
  });

  it('returns null when size does not match', () => {
    const result = findApplicableOffer([baseOffer], {
      systemType: 'ongrid', tier: 'base', size: '10', date: '2026-06-15',
    });
    assert.equal(result, null);
  });

  it('filters out offers before startDate', () => {
    const result = findApplicableOffer([baseOffer], {
      systemType: 'ongrid', tier: 'base', size: '5sp', date: '2025-12-31',
    });
    assert.equal(result, null);
  });

  it('filters out offers after endDate', () => {
    const result = findApplicableOffer([baseOffer], {
      systemType: 'ongrid', tier: 'base', size: '5sp', date: '2027-01-01',
    });
    assert.equal(result, null);
  });

  it('includes offers on the exact startDate', () => {
    const result = findApplicableOffer([baseOffer], {
      systemType: 'ongrid', tier: 'base', size: '5sp', date: '2026-01-01',
    });
    assert.ok(result);
  });

  it('includes offers on the exact endDate', () => {
    const result = findApplicableOffer([baseOffer], {
      systemType: 'ongrid', tier: 'base', size: '5sp', date: '2026-12-31',
    });
    assert.ok(result);
  });

  it('returns the most recently created offer when multiple match', () => {
    const olderOffer = { ...baseOffer, id: 'off-old', createdAt: '2025-12-01T00:00:00Z' };
    const newerOffer = { ...baseOffer, id: 'off-new', createdAt: '2026-06-01T00:00:00Z' };
    const result = findApplicableOffer([olderOffer, newerOffer], {
      systemType: 'ongrid', tier: 'base', size: '5sp', date: '2026-06-15',
    });
    assert.equal(result.id, 'off-new');
  });

  it('returns null when no offers match', () => {
    const result = findApplicableOffer([], {
      systemType: 'ongrid', tier: 'base', size: '5sp', date: '2026-06-15',
    });
    assert.equal(result, null);
  });

  it('filters out inactive offers', () => {
    const inactive = { ...baseOffer, active: false, status: 'DRAFT' };
    const result = findApplicableOffer([inactive], {
      systemType: 'ongrid', tier: 'base', size: '5sp', date: '2026-06-15',
    });
    assert.equal(result, null);
  });

  it('returns null for null offers array', () => {
    const result = findApplicableOffer(null, {
      systemType: 'ongrid', tier: 'base', size: '5sp', date: '2026-06-15',
    });
    assert.equal(result, null);
  });

  it('returns null for non-array offers', () => {
    const result = findApplicableOffer('not-an-array', {
      systemType: 'ongrid', tier: 'base', size: '5sp', date: '2026-06-15',
    });
    assert.equal(result, null);
  });

  it('matches offer with appliesTo "all"', () => {
    const allOffer = { ...baseOffer, appliesTo: 'all' };
    const result = findApplicableOffer([allOffer], {
      systemType: 'hybrid', tier: 'base', size: '5sp', date: '2026-06-15',
    });
    assert.ok(result);
  });

  it('matches offer with appliesToTier "all"', () => {
    const allTier = { ...baseOffer, appliesToTier: 'all' };
    const result = findApplicableOffer([allTier], {
      systemType: 'ongrid', tier: 'premium', size: '5sp', date: '2026-06-15',
    });
    assert.ok(result);
  });

  it('matches offer with appliesToSize "all"', () => {
    const allSize = { ...baseOffer, appliesToSize: 'all' };
    const result = findApplicableOffer([allSize], {
      systemType: 'ongrid', tier: 'base', size: '10', date: '2026-06-15',
    });
    assert.ok(result);
  });

  it('matches offer with no date restrictions', () => {
    const noDate = { ...baseOffer, startDate: undefined, endDate: undefined };
    const result = findApplicableOffer([noDate], {
      systemType: 'ongrid', tier: 'base', size: '5sp', date: '2099-01-01',
    });
    assert.ok(result);
  });
});

// =========================================================================
// 4. calculateOfferAmount
// =========================================================================
describe('calculateOfferAmount', () => {
  it('returns flat amount directly', () => {
    const amount = calculateOfferAmount({ type: 'flat', value: 5000 }, 100000);
    assert.equal(amount, 5000);
  });

  it('returns percentage amount correctly', () => {
    const amount = calculateOfferAmount({ type: 'percentage', value: 10 }, 200000);
    assert.equal(amount, 20000);
  });

  it('caps flat amount at list price', () => {
    const amount = calculateOfferAmount({ type: 'flat', value: 150000 }, 100000);
    assert.equal(amount, 100000);
  });

  it('returns 0 for null offer', () => {
    const amount = calculateOfferAmount(null, 100000);
    assert.equal(amount, 0);
  });

  it('returns 0 for undefined offer', () => {
    const amount = calculateOfferAmount(undefined, 100000);
    assert.equal(amount, 0);
  });

  it('returns 0 for zero listPrice', () => {
    const amount = calculateOfferAmount({ type: 'flat', value: 5000 }, 0);
    assert.equal(amount, 0);
  });

  it('returns 0 for negative listPrice', () => {
    const amount = calculateOfferAmount({ type: 'flat', value: 5000 }, -100);
    assert.equal(amount, 0);
  });

  it('returns 0 for unknown offer type', () => {
    const amount = calculateOfferAmount({ type: 'bogus', value: 5000 }, 100000);
    assert.equal(amount, 0);
  });

  it('handles string value via Number coercion', () => {
    const amount = calculateOfferAmount({ type: 'flat', value: '3000' }, 100000);
    assert.equal(amount, 3000);
  });

  it('percentage of 0% returns 0', () => {
    const amount = calculateOfferAmount({ type: 'percentage', value: 0 }, 100000);
    assert.equal(amount, 0);
  });

  it('percentage of 100% returns full list price', () => {
    const amount = calculateOfferAmount({ type: 'percentage', value: 100 }, 100000);
    assert.equal(amount, 100000);
  });
});

// =========================================================================
// 5. offerPayloadShape
// =========================================================================
describe('offerPayloadShape', () => {
  it('builds payload with active offer', () => {
    const offer = {
      id: 'off-123',
      name: 'Diwali Sale',
      type: 'flat',
      value: 10000,
      appliesTo: 'ongrid',
      appliesToTier: 'base',
      startDate: '2026-10-01',
      endDate: '2026-11-30',
    };
    const shape = offerPayloadShape(offer, 200000);
    assert.equal(shape.available, true);
    assert.equal(shape.source, 'OFFER_MASTER');
    assert.ok(shape.value);
    assert.equal(shape.value.offerId, 'off-123');
    assert.equal(shape.value.offerName, 'Diwali Sale');
    assert.equal(shape.value.offerType, 'flat');
    assert.equal(shape.value.offerValue, 10000);
    assert.equal(shape.value.offerAmount, 10000);
    assert.equal(shape.value.appliesTo, 'ongrid');
    assert.equal(shape.value.appliesToTier, 'base');
    assert.equal(shape.value.startDate, '2026-10-01');
    assert.equal(shape.value.endDate, '2026-11-30');
  });

  it('builds payload with percentage offer', () => {
    const offer = {
      id: 'off-456',
      name: 'Summer %',
      type: 'percentage',
      value: 5,
      appliesTo: 'hybrid',
      appliesToTier: 'premium',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    };
    const shape = offerPayloadShape(offer, 300000);
    assert.equal(shape.available, true);
    assert.equal(shape.value.offerAmount, 15000); // 5% of 300000
    assert.equal(shape.value.offerType, 'percentage');
    assert.equal(shape.value.offerValue, 5);
  });

  it('returns NO_ACTIVE_OFFER shape when offer is null', () => {
    const shape = offerPayloadShape(null, 200000);
    assert.equal(shape.available, false);
    assert.equal(shape.source, 'NO_ACTIVE_OFFER');
    assert.equal(shape.value, null);
  });

  it('returns NO_ACTIVE_OFFER shape when offer is undefined', () => {
    const shape = offerPayloadShape(undefined, 200000);
    assert.equal(shape.available, false);
    assert.equal(shape.source, 'NO_ACTIVE_OFFER');
    assert.equal(shape.value, null);
  });

  it('defaults missing fields to null or "all"', () => {
    const offer = { type: 'flat', value: 1000 };
    const shape = offerPayloadShape(offer, 50000);
    assert.equal(shape.value.offerId, null);
    assert.equal(shape.value.offerName, null);
    assert.equal(shape.value.appliesTo, 'all');
    assert.equal(shape.value.appliesToTier, 'all');
    assert.equal(shape.value.startDate, null);
    assert.equal(shape.value.endDate, null);
  });

  it('offerAmount in payload matches calculateOfferAmount', () => {
    const offer = { id: 'x', name: 'X', type: 'percentage', value: 12 };
    const listPrice = 250000;
    const shape = offerPayloadShape(offer, listPrice);
    const expected = calculateOfferAmount(offer, listPrice);
    assert.equal(shape.value.offerAmount, expected);
  });
});

// =========================================================================
// 6. Exported constants sanity checks
// =========================================================================
describe('exported constants', () => {
  it('OFFER_TYPE has flat and percentage', () => {
    assert.equal(OFFER_TYPE.FLAT, 'flat');
    assert.equal(OFFER_TYPE.PERCENTAGE, 'percentage');
  });

  it('OFFER_STATUS has expected statuses', () => {
    assert.equal(OFFER_STATUS.ACTIVE, 'ACTIVE');
    assert.equal(OFFER_STATUS.DRAFT, 'DRAFT');
    assert.equal(OFFER_STATUS.EXPIRED, 'EXPIRED');
    assert.equal(OFFER_STATUS.ARCHIVED, 'ARCHIVED');
  });

  it('OFFER_ERROR has expected error codes', () => {
    assert.equal(OFFER_ERROR.INVALID_TYPE, 'INVALID_TYPE');
    assert.equal(OFFER_ERROR.INVALID_VALUE, 'INVALID_VALUE');
    assert.equal(OFFER_ERROR.MARGIN_BREACH, 'MARGIN_BREACH');
    assert.equal(OFFER_ERROR.OFFER_NOT_FOUND, 'OFFER_NOT_FOUND');
    assert.equal(OFFER_ERROR.MISSING_FIELD, 'MISSING_FIELD');
  });
});
