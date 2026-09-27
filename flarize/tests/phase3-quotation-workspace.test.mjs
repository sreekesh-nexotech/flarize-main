// PHASE 3 — PART H, STEP 2 — QUOTATION WORKSPACE (application service layer).
//
// The service is correct only if it CANNOT do certain things: it cannot issue
// through a blocked gate, cannot mutate an issued document, cannot leak
// internal cost to Sales, cannot restate a formula, and cannot let a catalog
// read reach the pure assembler. Most assertions below are negative.
//
// Fixtures are test data, not production values. No existing test is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as W from '../src/lib/quotationWorkspace.js';
import * as Q from '../src/lib/quotationPayload.js';
import { ROLE, CAPABILITY, RbacError } from '../src/lib/rbac.js';
import { ROLES } from '../src/lib/bomRoles.js';
import { createProjectBomSnapshot, SNAPSHOT_STATUS } from '../src/lib/bomSnapshot.js';
import { createCommercialSnapshot, supersede } from '../src/lib/commercialSnapshot.js';
import { COST_STATUS } from '../src/lib/costEngine.js';
import { PRICING_STATUS } from '../src/lib/pricingEngine.js';

const WS_SRC = readFileSync('src/lib/quotationWorkspace.js', 'utf8');
const PAYLOAD_SRC = readFileSync('src/lib/quotationPayload.js', 'utf8');
const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));

const AT = '2026-08-16T00:00:00Z';
const AT2 = '2026-09-01T00:00:00Z';

const PH = { userId: 'ph1', role: ROLE.PROJECT_HEAD };
const SALES = { userId: 's1', role: ROLE.SALES };
const SALES_HEAD = { userId: 'sh1', role: ROLE.SALES_HEAD };
const PROC = { userId: 'pr1', role: ROLE.PROCUREMENT };
const ENGR = { userId: 'e1', role: ROLE.ENGINEERING };

// ---------------------------------------------------------------------------
// fixtures — real catalog ids so componentAttributesFor has something to find
// ---------------------------------------------------------------------------

const BOM_LINES = [
  { componentId: 'p1', role: ROLES.PANEL, quantity: 9 },
  { componentId: 'i1', role: ROLES.INVERTER, quantity: 1 },
  { componentId: 'acdb1', role: ROLES.ACDB, quantity: 1 },
  { componentId: 'GHOST-99', role: ROLES.MONITORING, quantity: 1 },   // absent from the catalog
  { componentId: 'bc1', role: ROLES.BATTERY_CABLE, quantity: 4 },     // internal only
];

function bom(status = SNAPSHOT_STATUS.LOCKED, lines = BOM_LINES) {
  const s = createProjectBomSnapshot({
    projectId: 'PRJ-1', bomLines: lines, lockedBy: 'ph1', lockedAt: AT,
    dataVersion: 'catalog.7', engineeringStatus: 'VALID',
  });
  return status === SNAPSHOT_STATUS.LOCKED ? s : { ...s, status };
}

function costResult(over = {}) {
  return Object.freeze({
    status: COST_STATUS.COMPLETE, projectId: 'PRJ-1', bomSnapshotId: 'BOM-1',
    catalogVersion: 'catalog.7', procurementPriceVersion: 'pp.3', landedCostVersion: 'lc.2',
    projectRateCardVersion: 'rc.4', costConfigVersion: 'cc.5', costEngineVersion: 'costEngine.1',
    materialLandedCost: 200000, structureCost: 15000, installationCost: 18000,
    siteSurveyCost: 500, engineeringDesignCost: 3000, transportationCost: 2500,
    serviceAmcCost: 4000, miscellaneousCost: 2430, officeExpenseAllocation: 6000,
    specialProjectWorksCost: 0, directProjectCost: 243000, totalActualProjectCost: 251430,
    traces: Object.freeze([]), ...over,
  });
}

function pricingResult(over = {}) {
  return Object.freeze({
    status: PRICING_STATUS.COMPLETE, marginVersion: 'margin.2', gstVersion: 'gst.1',
    pricingEngineVersion: 'pricingEngine.1', marginType: 'GROSS_MARGIN',
    targetGrossMargin: 0.18, sellingPriceBeforeGST: 306622, grossProfit: 55192,
    gstRatePct: 8.9, gstAmount: 27289.36, sellingPriceIncludingGST: 333911.36,
    extras: Object.freeze([]), extrasIncludingGST: 0,
    customerTotalIncludingGST: 333911.36, customerSideExpenses: Object.freeze([]), ...over,
  });
}

function commercial(id = 'CS-1', over = {}) {
  return createCommercialSnapshot({
    snapshotId: id, costResult: costResult(), pricingResult: pricingResult(over),
    issuedBy: 'ph1', issuedAt: AT,
  });
}

const CUSTOMER = { customerId: 'C-1', customerName: 'Test Customer', district: 'Ernakulam' };
const SYSTEM = { systemType: 'ONGRID', systemSizeKw: 5, phase: 'SINGLE', packageTier: 'BASE' };
const ENG_VALID = { status: 'VALID', blocked: [], warnings: [] };

/** A store with a locked BOM, an issued commercial snapshot and a full draft. */
function ready(over = {}) {
  const store = W.createQuotationStore();
  W.registerBomSnapshot(store, PH, { bomSnapshotId: 'BOM-1', snapshot: bom() });
  W.registerCommercialSnapshot(store, PH, { snapshot: commercial() });
  W.createDraft(store, SALES, {
    quotationId: 'Q-1', projectId: 'PRJ-1', at: AT,
    quotationNumber: 'FLZ-0001', quotationDate: AT, proposalBy: 's1',
    customer: CUSTOMER, system: SYSTEM, engineering: ENG_VALID,
    bomSnapshotId: 'BOM-1', commercialSnapshotId: 'CS-1',
    subsidyTreatment: Q.SUBSIDY_TREATMENT.NOT_QUOTED,
    ...over,
  });
  return store;
}

// ---------------------------------------------------------------------------
// 1. layer purity
// ---------------------------------------------------------------------------

test('the workspace imports only the assembler, RBAC, two snapshot modules, CMS store, energy engine, savings engine, subsidy engine and finance engine', () => {
  const imports = [...WS_SRC.matchAll(/^import[^;]*?from\s+'([^']+)'/gm)].map(m => m[1]).sort();
  // C11-H: cmsStore.js added for campaign resolution and page-version snapshot at issuance
  // Energy Engine: energyEngine.js added for live energy profile calculation (P3 Energy Engine)
  // Savings Engine: savingsEngine.js added for live savings calculation (P3 Savings Engine)
  // Subsidy Engine: subsidyEngine.js added for live subsidy calculation (P3 Subsidy Engine)
  // Finance Engine: financeEngine.js added for live EMI calculation (P4 Finance Engine)
  // Phase G G0 (2026-09-05): commercialFreeze.js added for optional Phase F snapshot on issued document.
  assert.deepEqual(imports, ['./bomSnapshot.js', './cmsStore.js', './commercialFreeze.js', './commercialSnapshot.js', './energyEngine.js', './financeEngine.js', './quotationPayload.js', './rbac.js', './savingsEngine.js', './subsidyEngine.js']);
});

test('no formula is duplicated — no cost or pricing engine, no money module, no arithmetic', () => {
  for (const f of ['costEngine', 'pricingEngine', 'engineeringChecker', 'projectBom', 'money.js', 'commercialHistory']) {
    assert.equal(WS_SRC.includes(`from './${f}`), false, `must not import ${f}`);
  }
  assert.equal(/calculateCost|calculatePricing|roundMoney|sumExact/.test(WS_SRC), false);
  const moneyMath = /(sellingPrice|gstAmount|customerTotal|grossProfit|Cost)\w*\s*[+\-*/]\s*\w/;
  assert.equal(moneyMath.test(WS_SRC), false);
});

test('no clock, no randomness, no generated identifier', () => {
  assert.equal(/Date\.now|new Date|Math\.random/.test(WS_SRC), false);
});

test('the assembler stays catalog-free — catalog is read only in the workspace', () => {
  // the assembler performs no catalog lookup of any kind
  assert.equal(/catalog\s*[.?[]|catalog\.json|readFileSync|\.items\b/.test(PAYLOAD_SRC), false);
  assert.equal(PAYLOAD_SRC.includes('componentAttributesFor'), false);
  // in the workspace, `catalog.categories` appears in exactly one function
  const reads = [...WS_SRC.matchAll(/catalog\?\.categories|catalog\.categories/g)];
  assert.equal(reads.length, 1);
  assert.ok(WS_SRC.indexOf('export function componentAttributesFor') < reads[0].index);
});

// ---------------------------------------------------------------------------
// 2. RBAC — service side, never UI state
// ---------------------------------------------------------------------------

test('Sales may create a quotation; Procurement and Engineering may not', () => {
  const store = W.createQuotationStore();
  assert.doesNotThrow(() => W.createDraft(store, SALES, { quotationId: 'Q-A', at: AT }));
  assert.throws(() => W.createDraft(store, PROC, { quotationId: 'Q-B', at: AT }), RbacError);
  assert.throws(() => W.createDraft(store, ENGR, { quotationId: 'Q-C', at: AT }), RbacError);
});

test('an anonymous or unknown actor is refused', () => {
  const store = W.createQuotationStore();
  assert.throws(() => W.createDraft(store, null, { quotationId: 'Q-X', at: AT }), RbacError);
  assert.throws(() => W.createDraft(store, { userId: 'u', role: 'CEO' }, { quotationId: 'Q-X', at: AT }), RbacError);
});

test('registering a commercial snapshot needs COST_VIEW and PRICING_VIEW — Sales cannot', () => {
  const store = W.createQuotationStore();
  assert.throws(() => W.registerCommercialSnapshot(store, SALES, { snapshot: commercial() }), RbacError);
  assert.doesNotThrow(() => W.registerCommercialSnapshot(store, PH, { snapshot: commercial() }));
});

test('session reports capabilities and the unresolved identity model (P3-D)', () => {
  const s = W.session(SALES);
  assert.equal(s.identityModel, 'OPERATOR_ASSERTED_ROLE');
  assert.ok(s.capabilities.includes(CAPABILITY.QUOTATION_CREATE));
  assert.equal(s.capabilities.includes(CAPABILITY.COST_VIEW), false);
  assert.equal(Object.isFrozen(s), true);
});

// ---------------------------------------------------------------------------
// 3. snapshot access
// ---------------------------------------------------------------------------

test('an unlocked BOM snapshot is refused by name', () => {
  const store = W.createQuotationStore();
  assert.throws(
    () => W.registerBomSnapshot(store, PH, { bomSnapshotId: 'BOM-D', snapshot: bom('DRAFT') }),
    e => e.code === W.QUOTATION_ERROR.BOM_NOT_LOCKED);
});

test('a superseded commercial snapshot is refused by name', () => {
  const store = W.createQuotationStore();
  const old = supersede(commercial('CS-OLD'), { supersededBy: 'CS-2', at: AT2 });
  assert.throws(
    () => W.registerCommercialSnapshot(store, PH, { snapshot: old }),
    e => e.code === W.QUOTATION_ERROR.COMMERCIAL_SNAPSHOT_NOT_ISSUED);
});

test('a missing snapshot reference blocks the gate — it is never substituted', () => {
  const store = ready({ commercialSnapshotId: 'CS-DOES-NOT-EXIST' });
  const gate = W.checkGenerationGate(store, SALES, 'Q-1');
  assert.equal(gate.status, Q.GATE_STATUS.BLOCKED);
  assert.ok(gate.blockedChecks.includes(Q.GATE_CHECK.COMMERCIAL_SNAPSHOT));
  const p = W.buildPayload(store, SALES, 'Q-1');
  assert.equal(p.pricing.available, false);
  assert.equal(p.pricing.customer, null);
});

// ---------------------------------------------------------------------------
// 4. drafts and retrieval
// ---------------------------------------------------------------------------

test('draft creation records state, actor and caller-supplied time', () => {
  const store = ready();
  const q = W.getQuotation(store, SALES, 'Q-1');
  assert.equal(q.status, Q.QUOTATION_STATUS.DRAFT);
  assert.equal(q.createdBy, 's1');
  assert.equal(q.createdAt, AT);
  assert.equal(q.currentVersion, null);
});

test('a duplicate quotation id is refused and an unknown id is not found', () => {
  const store = ready();
  assert.throws(() => W.createDraft(store, SALES, { quotationId: 'Q-1', at: AT }),
    e => e.code === W.QUOTATION_ERROR.QUOTATION_EXISTS);
  assert.throws(() => W.getQuotation(store, SALES, 'Q-NOPE'),
    e => e.code === W.QUOTATION_ERROR.QUOTATION_NOT_FOUND);
});

test('every operation demands a caller-supplied `at`', () => {
  const store = W.createQuotationStore();
  assert.throws(() => W.createDraft(store, SALES, { quotationId: 'Q-T' }),
    e => e.code === W.QUOTATION_ERROR.MISSING_TIMESTAMP);
});

test('listQuotations is a summary and needs PRICING_VIEW', () => {
  const store = ready();
  assert.equal(W.listQuotations(store, SALES).length, 1);
  assert.throws(() => W.listQuotations(store, ENGR), RbacError);
});

// ---------------------------------------------------------------------------
// 5. catalog boundary
// ---------------------------------------------------------------------------

test('componentAttributesFor decorates only the ids the locked BOM chose', () => {
  const attrs = W.componentAttributesFor(catalog, ['p1', 'i1']);
  assert.deepEqual(Object.keys(attrs).sort(), ['i1', 'p1']);
  assert.equal(attrs.p1.brand, 'Waaree');
  assert.equal(attrs.p1.moduleWatt, 540);
  assert.equal(attrs.i1.brand, 'Growatt');
});

test('componentAttributesFor never emits a commercial field', () => {
  const attrs = W.componentAttributesFor(catalog, ['p1', 'i1', 'acdb1']);
  for (const a of Object.values(attrs)) {
    for (const k of Object.keys(a)) {
      assert.equal(/price|perWatt|cost|marketRate|rate/i.test(k), false, `${k} must not be copied`);
    }
  }
  assert.equal(JSON.stringify(attrs).includes('13122'), false);   // p1 catalog price
});

test('an id absent from the catalog is preserved, never substituted', () => {
  const attrs = W.componentAttributesFor(catalog, ['GHOST-99']);
  assert.deepEqual(attrs, {});
  const store = ready();
  const p = W.buildPayload(store, SALES, 'Q-1', { catalog });
  const ghost = p.bomSummary.rows.find(r => r.componentId === 'GHOST-99');
  assert.ok(ghost, 'the unresolved component stays visible and named');
  assert.equal(ghost.attributesFound, false);
  assert.equal(p.bomSummary.rows.some(r => r.componentId !== 'GHOST-99' && r.role === ROLES.MONITORING), false);
});

test('payload identity still comes from the BOM even with a catalog supplied', () => {
  const store = ready();
  const p = W.buildPayload(store, SALES, 'Q-1', { catalog });
  assert.deepEqual([...p.bomSummary.componentIds], ['p1', 'i1', 'acdb1', 'GHOST-99']);
  assert.equal(p.bomSummary.rows.find(r => r.componentId === 'i1').quantity, 1);
  assert.equal(p.bomSummary.rows.some(r => r.componentId === 'bc1'), false);  // internal only
});

// ---------------------------------------------------------------------------
// 6. generation gate enforcement (§28)
// ---------------------------------------------------------------------------

test('a blocked gate throws GENERATION_BLOCKED and names the failed checks', () => {
  // With subsidy engine wired, null subsidyTreatment auto-derives NOT_QUOTED (passes gate).
  // Use customer: null to trigger CUSTOMER_DATA failure.
  const store = ready({ subsidyTreatment: null, customer: null });
  assert.throws(
    () => W.issueQuotation(store, SALES, 'Q-1', { at: AT }),
    e => e.code === W.QUOTATION_ERROR.GENERATION_BLOCKED
      && e.detail.failedChecks.includes(Q.GATE_CHECK.CUSTOMER_DATA)
      && e.detail.reasons.length === e.detail.failedChecks.length);
});

test('a blocked issue writes nothing — no document, no version, no status change', () => {
  // With subsidy engine, null subsidyTreatment auto-derives NOT_QUOTED. Block via customer: null.
  const store = ready({ subsidyTreatment: null, customer: null });
  assert.throws(() => W.issueQuotation(store, SALES, 'Q-1', { at: AT }), Error);
  assert.equal(W.listVersions(store, SALES, 'Q-1').length, 0);
  const q = W.getQuotation(store, SALES, 'Q-1');
  assert.equal(q.status, Q.QUOTATION_STATUS.DRAFT);
  assert.equal(q.currentVersion, null);
});

test('a BLOCKED engineering verdict cannot be issued', () => {
  const store = ready({ engineering: { status: 'BLOCKED', blocked: ['PBC-A-001'], warnings: [] } });
  assert.throws(
    () => W.issueQuotation(store, SALES, 'Q-1', { at: AT }),
    e => e.code === W.QUOTATION_ERROR.GENERATION_BLOCKED
      && e.detail.failedChecks.includes(Q.GATE_CHECK.ENGINEERING_VALIDATION));
});

test('an unlocked BOM cannot reach issuance at all', () => {
  const store = ready({ bomSnapshotId: 'BOM-MISSING' });
  assert.throws(
    () => W.issueQuotation(store, SALES, 'Q-1', { at: AT }),
    e => e.detail.failedChecks.includes(Q.GATE_CHECK.BOM_LOCKED)
      && e.detail.failedChecks.includes(Q.GATE_CHECK.BOM_EXISTS));
});

test('the gate is not relaxed because a commercial value is missing', () => {
  const store = ready({ commercialSnapshotId: null });
  assert.throws(
    () => W.issueQuotation(store, SALES, 'Q-1', { at: AT }),
    e => e.detail.failedChecks.includes(Q.GATE_CHECK.COMMERCIAL_SNAPSHOT));
});

// ---------------------------------------------------------------------------
// 7. issuance and versioning (§26)
// ---------------------------------------------------------------------------

test('a satisfied gate issues v1', () => {
  const store = ready();
  const doc = W.issueQuotation(store, SALES, 'Q-1', { at: AT, catalog });
  assert.equal(doc.version, 1);
  assert.equal(doc.status, W.VERSION_STATUS.ISSUED);
  assert.equal(doc.issuedAt, AT);
  assert.equal(doc.commercialSnapshotId, 'CS-1');
  assert.equal(W.getQuotation(store, SALES, 'Q-1').status, Q.QUOTATION_STATUS.ISSUED);
});

test('an issued quotation is frozen, cannot be edited and cannot be re-issued', () => {
  const store = ready();
  const doc = W.issueQuotation(store, SALES, 'Q-1', { at: AT, catalog });
  assert.equal(Object.isFrozen(doc), true);
  assert.throws(() => { doc.payload.pricing.customer.sellingPriceBeforeGST = 1; }, TypeError);
  assert.throws(() => W.setQuotationFields(store, SALES, 'Q-1', { validUntil: AT2 }, AT2),
    e => e.code === W.QUOTATION_ERROR.QUOTATION_ALREADY_ISSUED);
  assert.throws(() => W.issueQuotation(store, SALES, 'Q-1', { at: AT2, catalog }),
    e => e.code === W.QUOTATION_ERROR.QUOTATION_ALREADY_ISSUED);
});

test('a revision creates v2, leaves v1 byte-identical and keeps it readable', () => {
  const store = ready();
  const v1 = W.issueQuotation(store, SALES, 'Q-1', { at: AT, catalog });
  const v1Json = JSON.stringify(v1);

  W.registerCommercialSnapshot(store, PH, {
    snapshot: commercial('CS-2', { sellingPriceBeforeGST: 999999, sellingPriceIncludingGST: 1088900, customerTotalIncludingGST: 1088900 }),
  });
  W.createRevision(store, SALES, 'Q-1', { at: AT2, changes: { commercialSnapshotId: 'CS-2' } });
  const v2 = W.issueQuotation(store, SALES, 'Q-1', { at: AT2, catalog });

  assert.equal(v2.version, 2);
  assert.equal(v2.commercialSnapshotId, 'CS-2');
  assert.notEqual(v2.payload.pricing.customer.sellingPriceBeforeGST,
    v1.payload.pricing.customer.sellingPriceBeforeGST);

  // v1 untouched — same object, same bytes
  const readV1 = W.getVersion(store, PH, 'Q-1', 1);
  assert.equal(readV1.document, v1);
  assert.equal(JSON.stringify(v1), v1Json);
  assert.equal(readV1.payload.pricing.customer.sellingPriceBeforeGST, 306622);
  assert.equal(readV1.status, W.VERSION_STATUS.SUPERSEDED);
  assert.equal(W.getVersion(store, PH, 'Q-1', 2).status, W.VERSION_STATUS.ISSUED);
});

test('version history lists both versions and never overwrites', () => {
  const store = ready();
  W.issueQuotation(store, SALES, 'Q-1', { at: AT, catalog });
  W.registerCommercialSnapshot(store, PH, { snapshot: commercial('CS-2') });
  W.createRevision(store, SALES, 'Q-1', { at: AT2, changes: { commercialSnapshotId: 'CS-2' } });
  W.issueQuotation(store, SALES, 'Q-1', { at: AT2, catalog });
  const versions = W.listVersions(store, SALES, 'Q-1');
  assert.deepEqual(versions.map(v => v.version), [1, 2]);
  assert.deepEqual(versions.map(v => v.status), [W.VERSION_STATUS.SUPERSEDED, W.VERSION_STATUS.ISSUED]);
  assert.throws(() => W.getVersion(store, SALES, 'Q-1', 3),
    e => e.code === W.QUOTATION_ERROR.VERSION_NOT_FOUND);
});

test('a DRAFT cannot be revised, only edited', () => {
  const store = ready();
  assert.throws(() => W.createRevision(store, SALES, 'Q-1', { at: AT }),
    e => e.code === W.QUOTATION_ERROR.QUOTATION_NOT_ISSUED);
  assert.doesNotThrow(() => W.setQuotationFields(store, SALES, 'Q-1', { validUntil: AT2 }, AT));
});

test('verifyImmutability proves the stored document still matches its snapshot (§29)', () => {
  const store = ready();
  W.issueQuotation(store, SALES, 'Q-1', { at: AT, catalog });
  const v = W.verifyImmutability(store, PH, 'Q-1', 1);
  assert.equal(v.frozen, true);
  assert.equal(v.snapshotPresent, true);
  assert.equal(v.matchesSnapshot, true);
});

// ---------------------------------------------------------------------------
// 8. internal cost / margin visibility follows capability
// ---------------------------------------------------------------------------

test('a Sales payload carries no internal cost and no internal margin', () => {
  const store = ready();
  const p = W.buildPayload(store, SALES, 'Q-1', { catalog });
  assert.equal(p.pricing.internal, null);
  const json = JSON.stringify(p);
  for (const k of ['"materialLandedCost"', '"totalActualProjectCost"', '"targetGrossMargin"', '"grossProfit"']) {
    assert.equal(json.includes(k), false, `${k} must not reach Sales`);
  }
  assert.equal(W.canSeeInternalCost(SALES), false);
  assert.equal(W.canSeeInternalCost(SALES_HEAD), false);
  assert.equal(W.canSeeInternalCost(PH), true);
});

test('a Project Head payload carries the internal block', () => {
  const store = ready();
  const p = W.buildPayload(store, PH, 'Q-1', { catalog });
  assert.equal(p.pricing.internal.targetGrossMargin, 0.18);
  assert.equal(p.pricing.internal.cost.totalActualProjectCost, 251430);
});

test('reading a stored version as Sales withholds internal figures without altering the document', () => {
  const store = ready();
  const doc = W.issueQuotation(store, SALES, 'Q-1', { at: AT, catalog });
  const asSales = W.getVersion(store, SALES, 'Q-1', 1);
  assert.equal(asSales.internalWithheld, true);
  assert.equal(asSales.payload.pricing.internal, null);
  assert.equal(JSON.stringify(asSales.payload).includes('"targetGrossMargin"'), false);
  // customer figures are unchanged — nothing was recomputed
  assert.equal(asSales.payload.pricing.customer.sellingPriceIncludingGST,
    doc.payload.pricing.customer.sellingPriceIncludingGST);
  // the stored document is untouched
  assert.equal(doc.payload.pricing.internal.targetGrossMargin, 0.18);
  assert.equal(W.getVersion(store, PH, 'Q-1', 1).document, doc);
});

// ---------------------------------------------------------------------------
// 9. blocked sections survive the service layer
// ---------------------------------------------------------------------------

test('§20–§25 dependencies stay blocked and named through issuance', () => {
  const store = ready();
  const doc = W.issueQuotation(store, SALES, 'Q-1', { at: AT, catalog });
  const p = doc.payload;
  const expect = {
    savings: Q.DEPENDENCY.SAVINGS_ENGINE,
    financing: Q.DEPENDENCY.FINANCE_ENGINE,
    consumption: Q.DEPENDENCY.ENERGY_LOAD_CALCULATION_ENGINE,
    applianceUsage: Q.DEPENDENCY.ENERGY_LOAD_CALCULATION_ENGINE,
    testimonials: Q.DEPENDENCY.CMS,
    campaign: Q.DEPENDENCY.CMS,
    terms: Q.DEPENDENCY.CMS,
    company: Q.DEPENDENCY.COMPANY_MASTER,
  };
  for (const [section, dependency] of Object.entries(expect)) {
    assert.equal(p[section].available, false, section);
    assert.equal(p[section].value, null, section);
    assert.equal(p[section].dependency, dependency, section);
  }
  assert.equal(p.subsidy.treatment, Q.SUBSIDY_TREATMENT.NOT_QUOTED);
  assert.equal(p.system.packageTierDisplayName.dependency, Q.DEPENDENCY.DECISION_C6_TIER_DISPLAY_NAMES);
});

test('the service does not reshape the payload — assembly stays in quotationPayload.js', () => {
  const store = ready();
  const direct = Q.buildQuotationPayload({
    quotation: { quotationNumber: 'FLZ-0001', quotationVersion: 1, quotationDate: AT, proposalBy: 's1', salespersonId: 's1', status: Q.QUOTATION_STATUS.DRAFT, quotationSource: 'DIRECT', district: null, affiliateId: null },
    customer: CUSTOMER, system: SYSTEM, engineering: ENG_VALID,
    bomSnapshot: store.bomSnapshots.get('BOM-1'),
    commercialSnapshot: store.commercialSnapshots.get('CS-1'),
    componentAttributes: W.componentAttributesFor(catalog, ['p1', 'i1', 'acdb1', 'GHOST-99', 'bc1']),
    subsidyTreatment: Q.SUBSIDY_TREATMENT.NOT_QUOTED,
    capabilities: [], variant: 'FULL',
  });
  const viaService = W.buildPayload(store, SALES, 'Q-1', { catalog });
  assert.deepEqual(JSON.parse(JSON.stringify(viaService)), JSON.parse(JSON.stringify(direct)));
});
