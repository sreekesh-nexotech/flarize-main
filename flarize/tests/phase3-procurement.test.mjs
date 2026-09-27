// PHASE 3 — PART F — PROCUREMENT WORKSPACE.
//
// These tests assert the APPLICATION layer behaves as an application layer: it
// composes the frozen procurement engines and adds no rule of its own. The
// load-bearing assertions are the negative ones — purchase price is never
// substituted for landed cost, no allocation basis other than purchase value
// exists, project transportation cannot get in, a missing value never becomes
// ₹0, and there is no second history mechanism.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as P from '../src/lib/procurementWorkspace.js';
import * as RBAC from '../src/lib/rbac.js';
import { CONFIG_TYPE, CONFIG_OWNER, CONFIG_STATUS, getHistory } from '../src/lib/commercialHistory.js';
import { calculateCost, COST_HEAD, COST_ERROR, COST_STATUS } from '../src/lib/costEngine.js';
import { FORBIDDEN_ALLOCATION_METHODS, ALLOCATION_METHOD } from '../src/lib/procurementBatch.js';
import { projectUnitCost, toPriceRecord } from '../src/lib/procurementPriceMaster.js';

const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const costConfig = JSON.parse(readFileSync('data/cost-config.json', 'utf8'));
const ENV = { catalog };

const AT = '2026-08-16T00:00:00Z';
const AT2 = '2026-09-01T00:00:00Z';
const EFF = '2026-08-16';
const EFF2 = '2026-09-01';

const PC = { userId: 'pc1', role: 'PROCUREMENT' };
const PH = { userId: 'ph1', role: 'PROJECT_HEAD' };
const SALES = { userId: 's1', role: 'SALES' };
const ADMIN = { userId: 'a1', role: 'ADMIN' };

/** Two real catalog component ids, chosen by identity from the catalog itself. */
function catalogIds(n) {
  const out = [];
  for (const key of Object.keys(catalog.categories).sort())
    for (const i of catalog.categories[key].items || []) { out.push(i.id); if (out.length === n) return out; }
  return out;
}
const [C1, C2] = catalogIds(2);

/** Assert the thrown error carries a specific code — codes are contract, messages are prose. */
function throwsCode(fn, code, label = '') {
  try { fn(); } catch (e) { assert.equal(e.code, code, `${label} — got ${e.code}: ${e.message}`); return e; }
  assert.fail(`expected ${code} to be thrown ${label}`);
}

function seeded({ commit = true, delivery = 5000, lines = null } = {}) {
  const s = P.createProcurementStore();
  P.createSupplier(s, { actor: PC, supplierId: 'SUP-1', name: 'Acme Distributors', reference: 'GSTIN-X', at: AT });
  P.createBatch(s, { actor: PC, batchId: 'PB-1', supplierId: 'SUP-1', batchDate: '2026-08-14', batchReference: 'INV-4471', at: AT });
  P.setBatchLines(s, ENV, { actor: PC, batchId: 'PB-1', at: AT, lines: lines || [
    { componentId: C1, quantity: 10, purchaseUnitPrice: 1000 },
    { componentId: C2, quantity: 5, purchaseUnitPrice: 3000 },
  ] });
  P.setBatchCharges(s, { actor: PC, batchId: 'PB-1', deliveryCost: delivery, at: AT });
  if (commit)
    P.commitBatch(s, ENV, { actor: PC, batchId: 'PB-1', at: AT, effectiveFrom: EFF,
      changeReason: 'Initial supplier invoice INV-4471' });
  return s;
}

// ===================================================== purchase price ≠ landed cost
test('PART F — purchase price and landed unit cost are separate values', () => {
  const s = seeded();
  const pm = P.priceMasterView(s);
  const rec = pm[C1];
  assert.equal(rec.purchasePrice, 1000);
  assert.notEqual(rec.landedUnitCost, rec.purchasePrice);
  // landed = purchase + allocated delivery / qty. 5000 delivery, C1 share 10000/25000 = 40% -> 2000 / 10 = 200
  assert.equal(rec.landedUnitCost, 1200);
  // and the record keeps BOTH — neither overwrites the other
  assert.ok(Object.prototype.hasOwnProperty.call(rec, 'purchasePrice'));
  assert.ok(Object.prototype.hasOwnProperty.call(rec, 'landedUnitCost'));
});

test('PART F — the purchase price is never substituted when landed cost is absent', () => {
  const s = P.createProcurementStore();
  P.createSupplier(s, { actor: PC, supplierId: 'SUP-1', at: AT });
  P.createBatch(s, { actor: PC, batchId: 'PB-X', supplierId: 'SUP-1', batchReference: 'INV-1', at: AT });
  P.setBatchLines(s, ENV, { actor: PC, batchId: 'PB-X', at: AT,
    lines: [{ componentId: C1, quantity: 4, purchaseUnitPrice: 900 }] });
  // delivery never entered -> commit refused, price master stays empty
  assert.throws(() => P.commitBatch(s, ENV, { actor: PC, batchId: 'PB-X', at: AT, effectiveFrom: EFF, changeReason: 'x' }),
    /DELIVERY_COST_NOT_ENTERED|not been entered/);
  assert.deepEqual(P.priceMasterView(s), {});
  const d = P.materialDetail(s, ENV, { actor: PC, componentId: C1 });
  assert.equal(d.configured, false);
  assert.equal(d.landedUnitCost, null);            // null, NOT 0
  assert.equal(d.purchasePrice, null);
  assert.equal(d.usableAsProjectCost, false);
});

// ===================================================== purchase-value allocation
test('PART F — allocation is by purchase value, not quantity, weight, volume or equal split', () => {
  const s = seeded({ commit: false });
  const a = P.allocationPreview(s, ENV, { actor: PC, batchId: 'PB-1' });
  assert.equal(a.allocationMethod, ALLOCATION_METHOD.PURCHASE_VALUE_PROPORTION);

  const l1 = a.lines.find(l => l.componentId === C1);
  const l2 = a.lines.find(l => l.componentId === C2);
  // purchase values 10,000 and 15,000 -> 40% / 60% of 5,000 = 2,000 / 3,000
  assert.equal(l1.allocatedDeliveryCost, 2000);
  assert.equal(l2.allocatedDeliveryCost, 3000);

  // explicitly NOT the other bases
  assert.notEqual(l1.allocatedDeliveryCost, 2500);                       // equal split
  assert.notEqual(l1.allocatedDeliveryCost, 5000 * (10 / 15));           // by quantity
  assert.equal(l1.allocationPct, 40);
  assert.equal(l2.allocationPct, 60);
});

test('PART F — a forbidden allocation method is refused, never silently replaced', () => {
  const s = seeded({ commit: false });
  for (const m of FORBIDDEN_ALLOCATION_METHODS)
    assert.throws(() => P.setBatchCharges(s, { actor: PC, batchId: 'PB-1', allocationMethod: m, at: AT }),
      /ALLOCATION_METHOD_INVALID|not permitted/, m);
  assert.throws(() => P.setBatchCharges(s, { actor: PC, batchId: 'PB-1', allocationMethod: 'PRO_RATA_BY_WEIGHT', at: AT }),
    /ALLOCATION_METHOD_INVALID|Unknown allocation method/);
  // the batch still holds the approved method
  assert.equal(P.batchView(s, { actor: PC, batchId: 'PB-1' }).allocationMethod,
    ALLOCATION_METHOD.PURCHASE_VALUE_PROPORTION);
});

// ===================================================== exact reconciliation
test('PART F — allocation reconciles EXACTLY to the entered delivery charge', () => {
  // 3 lines whose proportional shares do not divide evenly
  const s = P.createProcurementStore();
  P.createSupplier(s, { actor: PC, supplierId: 'S', at: AT });
  P.createBatch(s, { actor: PC, batchId: 'B', supplierId: 'S', batchReference: 'R', at: AT });
  const ids = catalogIds(3);
  P.setBatchLines(s, ENV, { actor: PC, batchId: 'B', at: AT, lines: [
    { componentId: ids[0], quantity: 3, purchaseUnitPrice: 333 },
    { componentId: ids[1], quantity: 7, purchaseUnitPrice: 111 },
    { componentId: ids[2], quantity: 1, purchaseUnitPrice: 917 },
  ] });
  P.setBatchCharges(s, { actor: PC, batchId: 'B', deliveryCost: 4999, at: AT });
  const a = P.allocationPreview(s, ENV, { actor: PC, batchId: 'B' });
  const sum = a.lines.reduce((t, l) => t + l.allocatedDeliveryCost, 0);
  assert.equal(sum, 4999);
  assert.equal(a.allocatedTotal, 4999);
  assert.equal(a.reconciled, true);
});

test('PART F — multiple materials each carry their own landed unit cost', () => {
  const s = seeded();
  const pm = P.priceMasterView(s);
  assert.equal(Object.keys(pm).length, 2);
  assert.equal(pm[C1].landedUnitCost, 1200);      // 1000 + 2000/10
  assert.equal(pm[C2].landedUnitCost, 3600);      // 3000 + 3000/5
  assert.notEqual(pm[C1].landedUnitCost, pm[C2].landedUnitCost);
  assert.equal(pm[C1].landedCostVersion, 'PB-1::' + C1);
  assert.equal(pm[C2].landedCostVersion, 'PB-1::' + C2);
});

test('PART F — line-level other procurement charges enter the build-up explicitly', () => {
  const s = P.createProcurementStore();
  P.createSupplier(s, { actor: PC, supplierId: 'S', at: AT });
  P.createBatch(s, { actor: PC, batchId: 'B', supplierId: 'S', batchReference: 'R', at: AT });
  P.setBatchLines(s, ENV, { actor: PC, batchId: 'B', at: AT, lines: [
    { componentId: C1, quantity: 10, purchaseUnitPrice: 1000,
      otherProcurementCharges: [{ label: 'unloading', amount: 500 }] },
  ] });
  P.setBatchCharges(s, { actor: PC, batchId: 'B', deliveryCost: 1000, otherChargesDeclared: 500, at: AT });
  const a = P.allocationPreview(s, ENV, { actor: PC, batchId: 'B' });
  assert.equal(a.otherChargesReconciled, true);
  assert.equal(a.lines[0].landedUnitCost, 1150);              // 1000 + (1000 + 500)/10
  // a control total that does not reconcile blocks the commit
  P.setBatchCharges(s, { actor: PC, batchId: 'B', otherChargesDeclared: 900, at: AT });
  const b = P.allocationPreview(s, ENV, { actor: PC, batchId: 'B' });
  assert.equal(b.canCommit, false);
  assert.ok(b.blockers.some(x => x.code === 'OTHER_CHARGES_NOT_RECONCILED'));
});

// ===================================================== missing landed cost
test('PART F — a component with no committed version is ABSENT, never ₹0', () => {
  const s = seeded();
  const pm = P.priceMasterView(s);
  const missing = catalogIds(40).find(id => !pm[id]);
  assert.ok(missing, 'catalog has an un-priced component to test with');
  assert.equal(pm[missing], undefined);
  const d = P.materialDetail(s, ENV, { actor: PC, componentId: missing });
  assert.equal(d.configured, false);
  assert.equal(d.landedUnitCost, null);
  assert.notEqual(d.landedUnitCost, 0);
  assert.match(d.projectCostReason, /No procurement price record|not recorded/);
});

// ===================================================== project transport barrier
test('PART F — project transportation can never enter a procurement batch', () => {
  const s = P.createProcurementStore();
  P.createSupplier(s, { actor: PC, supplierId: 'S', at: AT });
  for (const field of P.PROJECT_TRANSPORT_FIELDS) {
    const e = throwsCode(() => P.createBatch(s, { actor: PC, batchId: 'BT-' + field, supplierId: 'S',
      batchReference: 'R', at: AT, [field]: 1200 }), 'PROJECT_TRANSPORT_NOT_ALLOWED', field);
    assert.match(e.message, /warehouse -> customer site/);
  }
  P.createBatch(s, { actor: PC, batchId: 'B', supplierId: 'S', batchReference: 'R', at: AT });
  throwsCode(() => P.setBatchCharges(s, { actor: PC, batchId: 'B', deliveryCost: 100,
    projectTransportCost: 900, at: AT }), 'PROJECT_TRANSPORT_NOT_ALLOWED', 'charges');
  throwsCode(() => P.setBatchLines(s, ENV, { actor: PC, batchId: 'B', at: AT,
    lines: [{ componentId: C1, quantity: 1, purchaseUnitPrice: 10, transportationCost: 50 }] }),
    'PROJECT_TRANSPORT_NOT_ALLOWED', 'lines');
  // and the batch scope is stated, not implied
  assert.equal(P.allocationPreview(s, ENV, { actor: PC, batchId: 'B' }).scope, 'SUPPLIER_TO_WAREHOUSE');
  assert.equal(P.session({ actor: PC }).scope, 'SUPPLIER_TO_WAREHOUSE');
});

test('PART F — the procurement module never references a project transport cost head', () => {
  const src = readFileSync('src/lib/procurementWorkspace.js', 'utf8');
  // it may NAME the forbidden fields in order to refuse them, but must not
  // import or use the project transportation cost head
  assert.equal(/COST_HEAD\.PROJECT_TRANSPORT|TRANSPORTATION_TO_SITE|from '\.\/costEngine\.js'/.test(src), false);
});

// ===================================================== version history
test('PART F — versions are append-only and the old version stays readable', () => {
  const s = seeded();
  // second batch for the same component, a different price
  P.createBatch(s, { actor: PC, batchId: 'PB-2', supplierId: 'SUP-1', batchDate: '2026-08-30', batchReference: 'INV-5512', at: AT2 });
  P.setBatchLines(s, ENV, { actor: PC, batchId: 'PB-2', at: AT2,
    lines: [{ componentId: C1, quantity: 10, purchaseUnitPrice: 1100 }] });
  P.setBatchCharges(s, { actor: PC, batchId: 'PB-2', deliveryCost: 2000, at: AT2 });
  P.commitBatch(s, ENV, { actor: PC, batchId: 'PB-2', at: AT2, effectiveFrom: EFF2, changeReason: 'Supplier price revision' });

  const h = P.priceHistoryPanel(s, { actor: PC, componentId: C1 });
  assert.equal(h.versionCount, 2);
  assert.equal(h.appendOnly, true);
  const versions = getHistory(s.historyStore, CONFIG_TYPE.PROCUREMENT_PRICE, C1);
  assert.equal(versions[0].status, CONFIG_STATUS.SUPERSEDED);
  assert.equal(versions[1].status, CONFIG_STATUS.ACTIVE);
  // the OLD value is still readable, unmodified
  assert.equal(versions[0].value.landedUnitCost, 1200);
  assert.equal(versions[0].value.purchasePrice, 1000);
  assert.equal(versions[0].supersededBy, versions[1].versionId);
  assert.equal(versions[1].previousVersionId, versions[0].versionId);
  // current = newest: 1100 + 2000/10 = 1300, and it differs from the old 1200
  assert.equal(P.priceMasterView(s)[C1].landedUnitCost, 1300);
  assert.equal(versions[1].value.landedUnitCost, 1300);
});

test('PART F — an old version remains readable by id and by effective date', () => {
  const s = seeded();
  P.createBatch(s, { actor: PC, batchId: 'PB-2', supplierId: 'SUP-1', batchReference: 'INV-5512', at: AT2 });
  P.setBatchLines(s, ENV, { actor: PC, batchId: 'PB-2', at: AT2,
    lines: [{ componentId: C1, quantity: 10, purchaseUnitPrice: 1100 }] });
  P.setBatchCharges(s, { actor: PC, batchId: 'PB-2', deliveryCost: 1000, at: AT2 });
  P.commitBatch(s, ENV, { actor: PC, batchId: 'PB-2', at: AT2, effectiveFrom: EFF2, changeReason: 'revision' });

  // as-of the first effective date the ORIGINAL landed cost is returned
  const asOld = P.priceMasterView(s, { asOf: '2026-08-20' });
  assert.equal(asOld[C1].landedUnitCost, 1200);
  assert.equal(asOld[C1].landedCostVersion, 'PB-1::' + C1);
  // as-of today the new one is
  const asNew = P.priceMasterView(s, { asOf: '2026-09-10' });
  assert.equal(asNew[C1].landedCostVersion, 'PB-2::' + C1);
  // detail screen honours the same as-of
  const d = P.materialDetail(s, ENV, { actor: PC, componentId: C1, asOf: '2026-08-20' });
  assert.equal(d.version, 'PB-1::' + C1);
  assert.equal(d.landedUnitCost, 1200);
});

test('PART F — a committed batch is immutable and cannot be committed twice', () => {
  const s = seeded();
  throwsCode(() => P.setBatchLines(s, ENV, { actor: PC, batchId: 'PB-1', at: AT, lines: [] }),
    'BATCH_ALREADY_COMMITTED', 'lines');
  throwsCode(() => P.setBatchCharges(s, { actor: PC, batchId: 'PB-1', deliveryCost: 1, at: AT }),
    'BATCH_ALREADY_COMMITTED', 'charges');
  throwsCode(() => P.commitBatch(s, ENV, { actor: PC, batchId: 'PB-1', at: AT, effectiveFrom: EFF, changeReason: 'again' }),
    'BATCH_ALREADY_COMMITTED', 'recommit');
});

test('PART F — an un-audited version cannot be written', () => {
  const s = seeded({ commit: false });
  assert.throws(() => P.commitBatch(s, ENV, { actor: PC, batchId: 'PB-1', at: AT, effectiveFrom: null, changeReason: 'x' }),
    /MISSING_EFFECTIVE_FROM|effective date/);
  assert.throws(() => P.commitBatch(s, ENV, { actor: PC, batchId: 'PB-1', at: AT, effectiveFrom: EFF, changeReason: null }),
    /MISSING_CHANGE_REASON|record why/);
  assert.throws(() => P.commitBatch(s, ENV, { actor: PC, batchId: 'PB-1', at: null, effectiveFrom: EFF, changeReason: 'x' }),
    /MISSING_TIMESTAMP|timestamp/);
  // every written version carries all five audit fields
  P.commitBatch(s, ENV, { actor: PC, batchId: 'PB-1', at: AT, effectiveFrom: EFF, changeReason: 'audited' });
  for (const v of getHistory(s.historyStore, CONFIG_TYPE.PROCUREMENT_PRICE, C1))
    for (const f of ['versionId', 'changedBy', 'changedAt', 'changeReason', 'effectiveFrom'])
      assert.ok(v[f], `${f} present`);
});

test('PART F — there is no second history mechanism', () => {
  const s = seeded();
  // the store holds exactly one history container, and it is commercialHistory's
  assert.deepEqual(Object.keys(s).sort(),
    ['audit', 'batches', 'historyStore', 'procurementWorkspaceVersion', 'suppliers']);
  assert.ok(s.historyStore.records);
  // and the price master is a projection, not a stored table
  assert.equal(s.priceMaster, undefined);
  assert.equal(Object.keys(P.priceMasterView(s)).length,
    Object.keys(s.historyStore.records).length);
});

// ===================================================== compare versions
test('PART F — two versions can be compared, field by field', () => {
  const s = seeded();
  P.createBatch(s, { actor: PC, batchId: 'PB-2', supplierId: 'SUP-1', batchReference: 'INV-5512', at: AT2 });
  P.setBatchLines(s, ENV, { actor: PC, batchId: 'PB-2', at: AT2,
    lines: [{ componentId: C1, quantity: 10, purchaseUnitPrice: 1100 }] });
  P.setBatchCharges(s, { actor: PC, batchId: 'PB-2', deliveryCost: 2000, at: AT2 });
  P.commitBatch(s, ENV, { actor: PC, batchId: 'PB-2', at: AT2, effectiveFrom: EFF2, changeReason: 'revision' });

  const c = P.compareVersionsPanel(s, { actor: PC, componentId: C1,
    fromVersionId: 'PB-1::' + C1, toVersionId: 'PB-2::' + C1 });
  assert.equal(c.readable.from, true);
  assert.equal(c.readable.to, true);
  const fields = c.comparison.changes.map(x => x.field);
  assert.ok(fields.includes('purchasePrice'));
  assert.ok(fields.includes('landedUnitCost'));
  const pp = c.comparison.changes.find(x => x.field === 'purchasePrice');
  assert.equal(pp.oldValue, 1000);
  assert.equal(pp.newValue, 1100);
  // defaulting `to` picks the ACTIVE version and `from` its predecessor
  const auto = P.compareVersionsPanel(s, { actor: PC, componentId: C1 });
  assert.equal(auto.from.versionId, 'PB-1::' + C1);
  assert.equal(auto.to.versionId, 'PB-2::' + C1);
});

// ===================================================== RBAC
test('PART F — procurement writes require the PROCUREMENT capability and ownership', () => {
  assert.equal(RBAC.can('PROCUREMENT', RBAC.CAPABILITY.PROCUREMENT_PRICE_EDIT), true);
  for (const r of ['ADMIN', 'PROJECT_HEAD', 'ENGINEERING', 'SALES', 'SALES_HEAD'])
    assert.equal(RBAC.can(r, RBAC.CAPABILITY.PROCUREMENT_PRICE_EDIT), false, r);
  assert.equal(CONFIG_OWNER[CONFIG_TYPE.PROCUREMENT_PRICE], 'PROCUREMENT');

  const s = seeded({ commit: false });
  for (const actor of [PH, SALES, ADMIN])
    assert.throws(() => P.commitBatch(s, ENV, { actor, batchId: 'PB-1', at: AT, effectiveFrom: EFF, changeReason: 'x' }),
      /RbacError|may not perform|owned by/, actor.role);
  for (const actor of [PH, SALES, ADMIN])
    assert.throws(() => P.createSupplier(s, { actor, supplierId: 'X', at: AT }), /RbacError|may not perform|owned by/);
  assert.throws(() => P.commitBatch(s, ENV, { actor: null, batchId: 'PB-1', at: AT, effectiveFrom: EFF, changeReason: 'x' }),
    /NO_ACTOR|actor/);
  throwsCode(() => P.commitBatch(s, ENV, { actor: { userId: 'u', role: 'NOT_A_ROLE' }, batchId: 'PB-1', at: AT,
    effectiveFrom: EFF, changeReason: 'x' }), RBAC.RBAC_ERROR.UNKNOWN_ROLE, 'unknown role');
});

test('PART F — reads require COMMERCIAL_HISTORY_VIEW; Sales is refused', () => {
  const s = seeded();
  assert.doesNotThrow(() => P.dashboard(s, ENV, { actor: PC }));
  assert.doesNotThrow(() => P.dashboard(s, ENV, { actor: ADMIN }));      // may read, may not write
  assert.doesNotThrow(() => P.dashboard(s, ENV, { actor: PH }));
  for (const fn of [
    () => P.dashboard(s, ENV, { actor: SALES }),
    () => P.priceHistoryPanel(s, { actor: SALES, componentId: C1 }),
    () => P.materialDetail(s, ENV, { actor: SALES, componentId: C1 }),
    () => P.allocationPreview(s, ENV, { actor: SALES, batchId: 'PB-1' }),
  ]) assert.throws(fn, /RbacError|may not perform/);
});

// ===================================================== Cost Engine integration
test('PART F — the Cost Engine receives the landed cost, not the purchase price', () => {
  const s = seeded();
  const priceMaster = P.priceMasterView(s);

  const snapshot = { projectId: 'P1', status: 'LOCKED',
    lines: [{ role: 'PANEL', componentId: C1, quantity: 10, category: 'panel' }] };
  const cost = calculateCost({
    snapshot, config: costConfig, priceMaster,
    project: { sizeKw: 3 }, calculatedAt: AT,
    landedCostVersion: priceMaster[C1].landedCostVersion,
  });
  const head = cost.heads[COST_HEAD.MATERIAL_LANDED];
  assert.equal(head.owner, 'PROCUREMENT');
  assert.equal(head.amount, 12000);                      // 10 x 1200 landed
  assert.notEqual(head.amount, 10000);                   // NOT 10 x 1000 purchase
  const line = head.lines.find(l => l.componentId === C1);
  assert.equal(line.landedCostVersion, 'PB-1::' + C1);
  assert.equal(projectUnitCost(toPriceRecord(priceMaster[C1])).kind, 'LANDED_UNIT_COST');
});

test('PART F — without a committed landed cost the Cost Engine blocks, it does not zero', () => {
  const empty = P.createProcurementStore();
  const snapshot = { projectId: 'P1', status: 'LOCKED',
    lines: [{ role: 'PANEL', componentId: C1, quantity: 10, category: 'panel' }] };
  const cost = calculateCost({ snapshot, config: costConfig, priceMaster: P.priceMasterView(empty),
    project: { sizeKw: 3 }, calculatedAt: AT });
  const head = cost.heads[COST_HEAD.MATERIAL_LANDED];
  assert.equal(head.amount, null);
  assert.notEqual(head.amount, 0);
  assert.notEqual(cost.status, COST_STATUS.COMPLETE);
  assert.ok(cost.errors.some(e => e.code === COST_ERROR.LANDED_COST_NOT_CONFIGURED));
});

// ===================================================== determinism / no invention
test('PART F — the service layer reads no clock and invents no value', () => {
  const src = readFileSync('src/lib/procurementWorkspace.js', 'utf8');
  assert.equal(/Date\.now\(|new Date\(|Math\.random\(/.test(src), false);
  // identical inputs produce identical version ids and identical output
  const a = seeded(), b = seeded();
  assert.deepEqual(P.priceMasterView(a), P.priceMasterView(b));
  assert.equal(P.versionIdFor('PB-1', C1), 'PB-1::' + C1);
});

test('PART F — the UI carries no commercial formula', () => {
  const html = readFileSync('public/procurement.html', 'utf8');
  // no allocation arithmetic, no landed-cost arithmetic in the page
  assert.equal(/purchaseValue\s*\/\s*total|deliveryCost\s*\*|landedUnitCost\s*=\s*[^'"]*\+/.test(html), false);
  // and it renders the engine's formula string instead
  assert.ok(html.includes('d.formula'));
  assert.ok(html.includes('NOT CONFIGURED'));
});
