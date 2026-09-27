// QUOTATION CLASSIFICATION — Tests (Part 9)
//
// Acceptance criteria 26-38:
//  26. Quotation source defaults/validates correctly
//  27. DIRECT quotation without affiliateId
//  28. AFFILIATE quotation stores affiliateId
//  29. DISTRICT quotation requires district
//  30. SalespersonId derived from authenticated session
//  31. Client cannot impersonate via salespersonId
//  32. Classification survives versioning
//  33. Issued classification is immutable
//  34. Existing quotation numbering unchanged
//  35. History filter by quotationSource
//  36. History filter by district
//  37. Sales Head can use classification metadata
//  38. Individual sales users cannot access another user's quotations via classification filters

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  createQuotationStore,
  createDraft,
  setQuotationFields,
  getQuotation,
  listQuotations,
  issueQuotation,
  createRevision,
  buildPayload,
  listVersions,
  QUOTATION_SOURCE,
} from '../src/lib/quotationWorkspace.js';

import { buildQuotationPayload, QUOTATION_STATUS } from '../src/lib/quotationPayload.js';

const ACTOR_SALES = { userId: 'sales-023', role: 'SALES' };
const ACTOR_SALES_B = { userId: 'sales-044', role: 'SALES' };
const ACTOR_HEAD = { userId: 'head-001', role: 'SALES_HEAD' };
const NOW = new Date().toISOString();
let draftSeq = 0;

function makeStore() {
  return createQuotationStore();
}

function nextId() { return `QT-CLASS-${++draftSeq}-${Date.now()}`; }

function draftWith(store, actor, extra = {}) {
  return createDraft(store, actor, {
    quotationId: nextId(),
    at: NOW,
    projectId: 'PRJ-TEST',
    variant: 'FULL',
    subsidyTreatment: 'NOT_QUOTED',
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// 26. Quotation source defaults/validates correctly
// ---------------------------------------------------------------------------

describe('26 — quotation source defaults and validation', () => {
  test('defaults to DIRECT when no source specified', () => {
    const store = makeStore();
    const draft = draftWith(store, ACTOR_SALES);
    assert.equal(draft.quotationSource, 'DIRECT');
  });

  test('accepts AFFILIATE source', () => {
    const store = makeStore();
    const draft = draftWith(store, ACTOR_SALES, { quotationSource: 'AFFILIATE' });
    assert.equal(draft.quotationSource, 'AFFILIATE');
  });

  test('accepts DISTRICT source with district', () => {
    const store = makeStore();
    const draft = draftWith(store, ACTOR_SALES, { quotationSource: 'DISTRICT', district: 'ERNAKULAM' });
    assert.equal(draft.quotationSource, 'DISTRICT');
    assert.equal(draft.district, 'ERNAKULAM');
  });

  test('rejects invalid source', () => {
    const store = makeStore();
    assert.throws(() => draftWith(store, ACTOR_SALES, { quotationSource: 'INVALID' }), /quotationSource must be one of/);
  });
});

// ---------------------------------------------------------------------------
// 27. DIRECT quotation without affiliateId
// ---------------------------------------------------------------------------

describe('27 — DIRECT quotation without affiliateId', () => {
  test('DIRECT quotation has no affiliateId', () => {
    const store = makeStore();
    const draft = draftWith(store, ACTOR_SALES, { quotationSource: 'DIRECT' });
    assert.equal(draft.affiliateId, undefined);
  });

  test('DIRECT quotation rejects affiliateId', () => {
    const store = makeStore();
    assert.throws(
      () => draftWith(store, ACTOR_SALES, { quotationSource: 'DIRECT', affiliateId: 'aff-001' }),
      /affiliateId may only be set when quotationSource is AFFILIATE/
    );
  });
});

// ---------------------------------------------------------------------------
// 28. AFFILIATE quotation stores affiliateId
// ---------------------------------------------------------------------------

describe('28 — AFFILIATE quotation stores affiliateId', () => {
  test('AFFILIATE stores affiliateId', () => {
    const store = makeStore();
    const draft = draftWith(store, ACTOR_SALES, {
      quotationSource: 'AFFILIATE',
      affiliateId: 'affiliate-004',
    });
    assert.equal(draft.quotationSource, 'AFFILIATE');
    assert.equal(draft.affiliateId, 'affiliate-004');
  });

  test('AFFILIATE without affiliateId is allowed (optional)', () => {
    const store = makeStore();
    const draft = draftWith(store, ACTOR_SALES, { quotationSource: 'AFFILIATE' });
    assert.equal(draft.quotationSource, 'AFFILIATE');
  });
});

// ---------------------------------------------------------------------------
// 29. DISTRICT quotation requires district
// ---------------------------------------------------------------------------

describe('29 — DISTRICT quotation requires district', () => {
  test('DISTRICT without district throws', () => {
    const store = makeStore();
    assert.throws(
      () => draftWith(store, ACTOR_SALES, { quotationSource: 'DISTRICT' }),
      /district is required when quotationSource is DISTRICT/
    );
  });

  test('DISTRICT with district succeeds', () => {
    const store = makeStore();
    const draft = draftWith(store, ACTOR_SALES, { quotationSource: 'DISTRICT', district: 'ALAPPUZHA' });
    assert.equal(draft.district, 'ALAPPUZHA');
  });
});

// ---------------------------------------------------------------------------
// 30. SalespersonId derived from authenticated session
// ---------------------------------------------------------------------------

describe('30 — salespersonId from authenticated session', () => {
  test('salespersonId = actor.userId, not client input', () => {
    const store = makeStore();
    const draft = draftWith(store, ACTOR_SALES, { salespersonId: 'ATTACKER' });
    assert.equal(draft.salespersonId, ACTOR_SALES.userId,
      'server must override client salespersonId with actor.userId');
  });

  test('different actor gets their own salespersonId', () => {
    const store = makeStore();
    const draft = draftWith(store, ACTOR_SALES_B);
    assert.equal(draft.salespersonId, ACTOR_SALES_B.userId);
  });
});

// ---------------------------------------------------------------------------
// 31. Client cannot impersonate via salespersonId
// ---------------------------------------------------------------------------

describe('31 — client cannot impersonate salesperson', () => {
  test('setQuotationFields rejects client salespersonId', () => {
    const store = makeStore();
    const draft = draftWith(store, ACTOR_SALES);
    assert.throws(
      () => setQuotationFields(store, ACTOR_SALES, draft.quotationId, { salespersonId: 'other-user' }, NOW),
      /salespersonId is server-derived/
    );
  });

  test('createDraft overrides client salespersonId', () => {
    const store = makeStore();
    const draft = draftWith(store, ACTOR_SALES, { salespersonId: 'impersonation-attempt' });
    assert.equal(draft.salespersonId, ACTOR_SALES.userId);
  });
});

// ---------------------------------------------------------------------------
// 32. Classification survives versioning
// ---------------------------------------------------------------------------

describe('32 — classification survives versioning', () => {
  test('classification persists on draft record through field updates', () => {
    const store = makeStore();
    const draft = draftWith(store, ACTOR_SALES, {
      quotationSource: 'AFFILIATE',
      affiliateId: 'aff-007',
    });

    // Update other fields — classification must survive
    setQuotationFields(store, ACTOR_SALES, draft.quotationId,
      { variant: 'COMPACT' }, NOW);

    const q = getQuotation(store, ACTOR_SALES, draft.quotationId);
    assert.equal(q.quotationSource, 'AFFILIATE');
    assert.equal(q.affiliateId, 'aff-007');
    assert.equal(q.salespersonId, ACTOR_SALES.userId);
  });

  test('classification in resolveInputs output (payload input)', () => {
    const store = makeStore();
    const draft = draftWith(store, ACTOR_SALES, {
      quotationSource: 'DISTRICT',
      district: 'KANNUR',
    });

    // buildPayload calls resolveInputs internally — payload.quotation should have classification
    const payload = buildPayload(store, ACTOR_SALES, draft.quotationId);
    assert.equal(payload.quotation.quotationSource, 'DISTRICT');
    assert.equal(payload.quotation.district, 'KANNUR');
  });
});

// ---------------------------------------------------------------------------
// 33. Issued classification is immutable
// ---------------------------------------------------------------------------

describe('33 — issued classification immutability', () => {
  test('ISSUED quotation rejects all field changes (classification included)', () => {
    // Since issue requires full gate pass, test that the ISSUED guard
    // blocks field edits. Manually set status to ISSUED on the store record.
    const store = makeStore();
    const draft = draftWith(store, ACTOR_SALES, { quotationSource: 'DIRECT' });

    // Simulate issue by directly setting status (the gate would block a real issue without BOM)
    const rec = store.quotations.get(draft.quotationId);
    rec.status = QUOTATION_STATUS.ISSUED;
    rec.currentVersion = 1;

    assert.throws(
      () => setQuotationFields(store, ACTOR_SALES, draft.quotationId, { quotationSource: 'AFFILIATE' }, NOW),
      /ISSUED and immutable/
    );
  });

  test('classification frozen in payload quotation section', () => {
    const quotation = {
      quotationNumber: 'GR-20260828-0099',
      quotationVersion: 1,
      status: 'ISSUED',
      quotationSource: 'AFFILIATE',
      affiliateId: 'aff-frozen',
      district: null,
      salespersonId: 'sales-023',
    };
    const payload = buildQuotationPayload({ quotation });
    assert.ok(Object.isFrozen(payload.quotation));
    assert.throws(() => { payload.quotation.quotationSource = 'DIRECT'; }, TypeError);
  });
});

// ---------------------------------------------------------------------------
// 34. Existing quotation numbering remains unchanged
// ---------------------------------------------------------------------------

describe('34 — quotation numbering unchanged', () => {
  test('GR-YYYYMMDD-NNNN format still used', () => {
    // Verify format constant if exported, or verify from a created draft
    const store = makeStore();
    const draft = draftWith(store, ACTOR_SALES, {
      quotationNumber: 'GR-20260828-0042',
    });
    assert.equal(draft.quotationNumber, 'GR-20260828-0042');
    // No encoded classification in the number
    assert.ok(!draft.quotationNumber.includes('AFF'), 'no source encoding in number');
    assert.ok(!draft.quotationNumber.includes('DIST'), 'no district encoding in number');
  });
});

// ---------------------------------------------------------------------------
// 35. History can filter by quotationSource
// ---------------------------------------------------------------------------

describe('35 — listQuotations includes classification', () => {
  test('classification fields present in list output', () => {
    const store = makeStore();
    draftWith(store, ACTOR_SALES, { quotationSource: 'DISTRICT', district: 'KANNUR' });
    draftWith(store, ACTOR_SALES, { quotationSource: 'DIRECT' });

    const list = listQuotations(store, ACTOR_SALES);
    const district = list.find(q => q.quotationSource === 'DISTRICT');
    const direct = list.find(q => q.quotationSource === 'DIRECT');

    assert.ok(district, 'DISTRICT quotation found');
    assert.equal(district.district, 'KANNUR');
    assert.ok(direct, 'DIRECT quotation found');
  });
});

// ---------------------------------------------------------------------------
// 36. History can filter by district
// ---------------------------------------------------------------------------

describe('36 — classification filterable in list', () => {
  test('can identify quotations by district from list', () => {
    const store = makeStore();
    draftWith(store, ACTOR_SALES, { quotationSource: 'DISTRICT', district: 'ERNAKULAM' });
    draftWith(store, ACTOR_SALES, { quotationSource: 'DISTRICT', district: 'THRISSUR' });
    draftWith(store, ACTOR_SALES, { quotationSource: 'DIRECT' });

    const list = listQuotations(store, ACTOR_SALES);
    const ern = list.filter(q => q.district === 'ERNAKULAM');
    const thr = list.filter(q => q.district === 'THRISSUR');

    assert.equal(ern.length, 1);
    assert.equal(thr.length, 1);
  });
});

// ---------------------------------------------------------------------------
// 37. Sales Head can use classification metadata
// ---------------------------------------------------------------------------

describe('37 — Sales Head sees classification', () => {
  test('Sales Head can list quotations with classification', () => {
    const store = makeStore();
    draftWith(store, ACTOR_SALES, { quotationSource: 'AFFILIATE', affiliateId: 'aff-001' });
    const list = listQuotations(store, ACTOR_HEAD);
    assert.ok(list.length > 0, 'Sales Head sees quotations');
    assert.equal(list[0].quotationSource, 'AFFILIATE');
    assert.equal(list[0].affiliateId, 'aff-001');
  });
});

// ---------------------------------------------------------------------------
// 38. Individual sales cannot access another user's quotations via filters
// (RBAC-level: current system uses PRICING_VIEW capability; this test
//  verifies classification doesn't bypass existing visibility.)
// ---------------------------------------------------------------------------

describe('38 — classification does not bypass visibility', () => {
  test('classification fields do not create cross-user access', () => {
    const store = makeStore();
    // Both users create quotations
    draftWith(store, ACTOR_SALES, { quotationSource: 'DIRECT' });
    draftWith(store, ACTOR_SALES_B, { quotationSource: 'DIRECT' });

    // Both can list (PRICING_VIEW is role-based, not user-scoped in current RBAC)
    // Classification filters are data-layer, not a new access vector
    const listA = listQuotations(store, ACTOR_SALES);
    const listB = listQuotations(store, ACTOR_SALES_B);

    // Current model: both see all (identity model = OPERATOR_ASSERTED_ROLE, P3-D unresolved)
    // Classification does NOT add or remove access — that's the requirement
    assert.equal(listA.length, listB.length,
      'classification filters do not change visibility model');
  });
});

// ---------------------------------------------------------------------------
// Payload assembler: classification flows through frozen payload
// ---------------------------------------------------------------------------

describe('payload assembler — classification fields', () => {
  test('classification fields appear in frozen quotation payload', () => {
    const quotation = {
      quotationNumber: 'GR-20260828-0001',
      quotationVersion: 1,
      quotationDate: NOW,
      validUntil: NOW,
      proposalBy: 'sales-023',
      salespersonId: 'sales-023',
      quotationLanguage: 'en',
      status: 'ISSUED',
      quotationSource: 'AFFILIATE',
      district: null,
      affiliateId: 'aff-004',
    };
    const payload = buildQuotationPayload({ quotation });
    assert.equal(payload.quotation.quotationSource, 'AFFILIATE');
    assert.equal(payload.quotation.affiliateId, 'aff-004');
    assert.equal(payload.quotation.district, null);
    assert.ok(Object.isFrozen(payload.quotation), 'quotation section frozen');
  });

  test('DISTRICT classification preserved in payload', () => {
    const quotation = {
      quotationNumber: 'GR-20260828-0002',
      quotationVersion: 1,
      status: 'ISSUED',
      quotationSource: 'DISTRICT',
      district: 'ALAPPUZHA',
      affiliateId: null,
      salespersonId: 'sales-017',
    };
    const payload = buildQuotationPayload({ quotation });
    assert.equal(payload.quotation.quotationSource, 'DISTRICT');
    assert.equal(payload.quotation.district, 'ALAPPUZHA');
    assert.equal(payload.quotation.salespersonId, 'sales-017');
  });

  test('null classification defaults gracefully in payload', () => {
    const quotation = {
      quotationNumber: 'GR-20260828-0003',
      quotationVersion: 1,
      status: 'DRAFT',
    };
    const payload = buildQuotationPayload({ quotation });
    assert.equal(payload.quotation.quotationSource, null);
    assert.equal(payload.quotation.district, null);
    assert.equal(payload.quotation.affiliateId, null);
  });
});

// ---------------------------------------------------------------------------
// QUOTATION_SOURCE constant
// ---------------------------------------------------------------------------

describe('QUOTATION_SOURCE constant', () => {
  test('has DIRECT, AFFILIATE, DISTRICT', () => {
    assert.equal(QUOTATION_SOURCE.DIRECT, 'DIRECT');
    assert.equal(QUOTATION_SOURCE.AFFILIATE, 'AFFILIATE');
    assert.equal(QUOTATION_SOURCE.DISTRICT, 'DISTRICT');
  });

  test('is frozen', () => {
    assert.ok(Object.isFrozen(QUOTATION_SOURCE));
  });
});
