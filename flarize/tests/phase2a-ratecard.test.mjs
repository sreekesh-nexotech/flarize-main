// Phase 2A — Project Head Rate Card + commercial configuration audit trail.
// Covers §24 tests 5–12 (procurement history, rate card) and 50–58 (audit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CONFIG_TYPE, CONFIG_STATUS, CONFIG_OWNER, REQUIRED_AUDIT_FIELDS, HISTORY_ERROR,
  createHistoryStore, appendVersion, archiveVersion, getHistory, getCurrentVersion,
  getVersion, getVersionEffectiveAt, compareVersions, historyView,
} from '../src/lib/commercialHistory.js';
import {
  RATE_TYPE, RATE_UNIT, RATE_ERROR, createRateCard, setRate, resolveRate,
  installationKey, listRates, seedRateCardFromConfig,
} from '../src/lib/projectRateCard.js';
import { calculateCost, COST_ERROR, COST_STATUS } from '../src/lib/costEngine.js';
import { calculatePricing } from '../src/lib/pricingEngine.js';
import { createCommercialSnapshot, VERSION_KEYS } from '../src/lib/commercialSnapshot.js';
import { createProjectBomSnapshot } from '../src/lib/bomSnapshot.js';

const CFG = JSON.parse(readFileSync('data/cost-config.json', 'utf8'));
const AT = '2026-08-16T00:00:00Z';

const audit = (versionId, when, by, why, from) => ({
  versionId, changedBy: by, changedAt: when, changeReason: why, effectiveFrom: from,
});

/** The brief's own example: a panel landed cost moving ₹8,950 -> ₹9,200. */
function panelHistory() {
  let store = createHistoryStore();
  store = appendVersion(store, {
    configType: CONFIG_TYPE.PROCUREMENT_PRICE, recordId: 'p1',
    value: { purchasePrice: 8600, landedUnitCost: 8950, supplier: 'Waaree', currency: 'INR' },
    ...audit('LC-011', '2026-08-01T09:00:00Z', 'procurement@flarize', 'Supplier revision', '2026-08-01'),
  });
  store = appendVersion(store, {
    configType: CONFIG_TYPE.PROCUREMENT_PRICE, recordId: 'p1',
    value: { purchasePrice: 8850, landedUnitCost: 9200, supplier: 'Waaree', currency: 'INR' },
    ...audit('LC-012', '2026-08-20T09:00:00Z', 'procurement@flarize', 'New supplier price', '2026-08-20'),
  });
  return store;
}

// ------------------------------------------------- 5, 6, 7  price history
test('5 — price history is retained; nothing is overwritten', () => {
  const store = panelHistory();
  const h = getHistory(store, CONFIG_TYPE.PROCUREMENT_PRICE, 'p1');
  assert.equal(h.length, 2);
  assert.equal(h[0].versionId, 'LC-011');
  assert.equal(h[0].value.landedUnitCost, 8950, 'the old value is still readable');
  assert.equal(h[1].value.landedUnitCost, 9200);
  // old versions remain retrievable by id
  assert.equal(getVersion(store, CONFIG_TYPE.PROCUREMENT_PRICE, 'p1', 'LC-011').value.landedUnitCost, 8950);
  // the store is append-only: the previous store object is untouched
  const before = createHistoryStore();
  const after = appendVersion(before, { configType: CONFIG_TYPE.PROCUREMENT_PRICE, recordId: 'x',
    value: { landedUnitCost: 1 }, ...audit('V1', AT, 'p', 'r', '2026-08-16') });
  assert.equal(Object.keys(before.records).length, 0);
  assert.equal(Object.keys(after.records).length, 1);
  // and there is no update or delete path at all
  const src = readFileSync('src/lib/commercialHistory.js', 'utf8');
  for (const banned of ['function updateVersion', 'function deleteVersion', 'splice('])
    assert.equal(src.includes(banned), false, banned);
});

test('6 — the new version becomes ACTIVE and links to its predecessor', () => {
  const store = panelHistory();
  const current = getCurrentVersion(store, CONFIG_TYPE.PROCUREMENT_PRICE, 'p1');
  assert.equal(current.versionId, 'LC-012');
  assert.equal(current.value.landedUnitCost, 9200);
  assert.equal(current.status, CONFIG_STATUS.ACTIVE);
  assert.equal(current.previousVersionId, 'LC-011');
  assert.equal(current.owner, 'PROCUREMENT');
});

test('7 — the old version becomes SUPERSEDED, with an end date', () => {
  const store = panelHistory();
  const old = getVersion(store, CONFIG_TYPE.PROCUREMENT_PRICE, 'p1', 'LC-011');
  assert.equal(old.status, CONFIG_STATUS.SUPERSEDED);
  assert.equal(old.supersededBy, 'LC-012');
  assert.equal(old.effectiveTo, '2026-08-20');
  assert.equal(old.value.landedUnitCost, 8950, 'the superseded value is unchanged');
  // exactly one ACTIVE version at a time
  const actives = getHistory(store, CONFIG_TYPE.PROCUREMENT_PRICE, 'p1')
    .filter(v => v.status === CONFIG_STATUS.ACTIVE);
  assert.equal(actives.length, 1);
});

test('8 — a locked quotation retains the version it used', () => {
  const store = panelHistory();
  // priced on 10 Aug -> LC-011 applies
  const atLock = getVersionEffectiveAt(store, CONFIG_TYPE.PROCUREMENT_PRICE, 'p1', '2026-08-10');
  assert.equal(atLock.versionId, 'LC-011');
  assert.equal(atLock.value.landedUnitCost, 8950);
  // a new quotation on 25 Aug -> LC-012
  const now = getVersionEffectiveAt(store, CONFIG_TYPE.PROCUREMENT_PRICE, 'p1', '2026-08-25');
  assert.equal(now.versionId, 'LC-012');
  assert.equal(now.value.landedUnitCost, 9200);
  // and the historical lookup still returns the old figure afterwards
  assert.equal(getVersionEffectiveAt(store, CONFIG_TYPE.PROCUREMENT_PRICE, 'p1', '2026-08-10').value.landedUnitCost, 8950);
});

// ------------------------------------------------- 9, 10, 11, 12  rate card
test('9 — Project Head rates are configurable across all six areas', () => {
  let card = createRateCard({ cardVersion: 'RC-1' });
  const a = (id) => audit(id, AT, 'projecthead@flarize', 'initial rate card', '2026-08-16');
  card = setRate(card, { rateType: RATE_TYPE.INSTALLATION, recordId: installationKey(3, 'FLAT'),
    value: { systemSizeKw: 3, installationType: 'FLAT', unit: RATE_UNIT.PER_PROJECT, rate: 15000 }, ...a('I-1') });
  card = setRate(card, { rateType: RATE_TYPE.TRANSPORT_VEHICLE, recordId: 'PICKUP',
    value: { vehicleType: 'PICKUP', ratePerKm: 30, unit: RATE_UNIT.PER_KM }, ...a('V-1') });
  card = setRate(card, { rateType: RATE_TYPE.SITE_SURVEY, recordId: 'STANDARD',
    value: { costPerProject: 500, coverageKm: 100, excessRatePerKm: 3, unit: RATE_UNIT.PER_PROJECT }, ...a('S-1') });
  card = setRate(card, { rateType: RATE_TYPE.ENGINEERING_DESIGN, recordId: '<=20kW',
    value: { costPerProject: 500, sizeLimitKw: 20, unit: RATE_UNIT.PER_PROJECT }, ...a('E-1') });
  card = setRate(card, { rateType: RATE_TYPE.SERVICE, recordId: 'STANDARD',
    value: { costPerVisit: 1000, visitsPerYear: 2, serviceYears: 5, sizeLimitKw: 10 }, ...a('SV-1') });
  card = setRate(card, { rateType: RATE_TYPE.SPECIAL_WORK, recordId: 'CRANE',
    value: { workType: 'CRANE', rate: 12000, unit: RATE_UNIT.PER_PROJECT }, ...a('W-1') });

  assert.equal(listRates(card).length, 6);
  for (const [rt, id] of [[RATE_TYPE.INSTALLATION, '3kW/FLAT'], [RATE_TYPE.TRANSPORT_VEHICLE, 'PICKUP'],
                          [RATE_TYPE.SITE_SURVEY, 'STANDARD'], [RATE_TYPE.ENGINEERING_DESIGN, '<=20kW'],
                          [RATE_TYPE.SERVICE, 'STANDARD'], [RATE_TYPE.SPECIAL_WORK, 'CRANE']])
    assert.equal(resolveRate(card, { rateType: rt, recordId: id }).ok, true, `${rt}/${id}`);
  // every rate area is owned by Project Head
  for (const rt of Object.values(RATE_TYPE)) assert.equal(CONFIG_OWNER[rt], 'PROJECT_HEAD', rt);
  // an unconfigured rate is an explicit miss, never a default
  const miss = resolveRate(card, { rateType: RATE_TYPE.TRANSPORT_VEHICLE, recordId: 'LORRY' });
  assert.equal(miss.ok, false);
  assert.equal(miss.code, RATE_ERROR.RATE_NOT_CONFIGURED);
  assert.match(miss.reason, /No nearest, first-available or legacy rate is substituted/);
});

test('10 — rate history is retained when a rate changes', () => {
  let card = createRateCard({ cardVersion: 'RC-1' });
  card = setRate(card, { rateType: RATE_TYPE.TRANSPORT_VEHICLE, recordId: 'PICKUP',
    value: { vehicleType: 'PICKUP', ratePerKm: 30, unit: RATE_UNIT.PER_KM },
    ...audit('V-1', '2026-08-01T00:00:00Z', 'projecthead@flarize', 'initial', '2026-08-01') });
  card = setRate(card, { rateType: RATE_TYPE.TRANSPORT_VEHICLE, recordId: 'PICKUP',
    value: { vehicleType: 'PICKUP', ratePerKm: 34, unit: RATE_UNIT.PER_KM },
    ...audit('V-2', '2026-09-01T00:00:00Z', 'projecthead@flarize', 'fuel price increase', '2026-09-01'),
    cardVersion: 'RC-2' });

  const h = getHistory(card.store, RATE_TYPE.TRANSPORT_VEHICLE, 'PICKUP');
  assert.equal(h.length, 2);
  assert.equal(h[0].value.ratePerKm, 30);
  assert.equal(h[0].status, CONFIG_STATUS.SUPERSEDED);
  assert.equal(h[1].value.ratePerKm, 34);
  assert.equal(card.cardVersion, 'RC-2');
});

test('11 — effective dates select exactly one applicable rate', () => {
  let card = createRateCard({ cardVersion: 'RC-1' });
  card = setRate(card, { rateType: RATE_TYPE.TRANSPORT_VEHICLE, recordId: 'PICKUP',
    value: { ratePerKm: 30 }, ...audit('V-1', '2026-08-01T00:00:00Z', 'ph', 'initial', '2026-08-01') });
  card = setRate(card, { rateType: RATE_TYPE.TRANSPORT_VEHICLE, recordId: 'PICKUP',
    value: { ratePerKm: 34 }, ...audit('V-2', '2026-09-01T00:00:00Z', 'ph', 'fuel', '2026-09-01') });

  assert.equal(resolveRate(card, { rateType: RATE_TYPE.TRANSPORT_VEHICLE, recordId: 'PICKUP', at: '2026-08-15' }).value.ratePerKm, 30);
  assert.equal(resolveRate(card, { rateType: RATE_TYPE.TRANSPORT_VEHICLE, recordId: 'PICKUP', at: '2026-09-15' }).value.ratePerKm, 34);
  // before any rate existed there is no rate at all
  assert.equal(resolveRate(card, { rateType: RATE_TYPE.TRANSPORT_VEHICLE, recordId: 'PICKUP', at: '2026-07-01' }).ok, false);
});

test('12 — a previous version stays readable, and archiving does not delete', () => {
  let card = createRateCard({ cardVersion: 'RC-1' });
  card = setRate(card, { rateType: RATE_TYPE.SITE_SURVEY, recordId: 'STANDARD',
    value: { costPerProject: 500, coverageKm: 100, excessRatePerKm: 3 },
    ...audit('S-1', '2026-08-01T00:00:00Z', 'ph', 'approved rule', '2026-08-01') });
  const archived = { ...card, store: archiveVersion(card.store, { configType: RATE_TYPE.SITE_SURVEY,
    recordId: 'STANDARD', versionId: 'S-1', changedBy: 'ph', changedAt: AT, changeReason: 'retired' }) };
  const v = getVersion(archived.store, RATE_TYPE.SITE_SURVEY, 'STANDARD', 'S-1');
  assert.equal(v.status, CONFIG_STATUS.ARCHIVED);
  assert.equal(v.value.costPerProject, 500, 'the value survives archiving');
  assert.equal(v.archiveReason, 'retired');
  // an archived rate no longer resolves
  assert.equal(resolveRate(archived, { rateType: RATE_TYPE.SITE_SURVEY, recordId: 'STANDARD' }).ok, false);
});

// -------------------------------------------- the rate card drives the engine
test('the Cost Engine reads rates from the rate card, not from itself', () => {
  const card = seedRateCardFromConfig(
    { ...CFG, transportation: { ...CFG.transportation,
      vehicles: [{ vehicleType: 'PICKUP', ratePerKm: 30 }] } },
    { changedBy: 'projecthead@flarize', changedAt: AT, changeReason: 'seed',
      effectiveFrom: '2026-08-16', cardVersion: 'RC-SEED-1' });

  const snap = createProjectBomSnapshot({ projectId: 'PRJ-R', lockedBy: 'ph', lockedAt: AT,
    bomLines: [{ componentId: 'p1', role: 'PANEL', qty: 6 }] });
  const r = calculateCost({ snapshot: snap, config: CFG, rateCard: card,
    priceMaster: { p1: { landedUnitCost: 13600, landedCostVersion: 'lc@1' } },
    project: { sizeKw: 3, installationType: 'FLAT', tier: 'VALUE', distanceKm: 130,
               vehicleType: 'PICKUP', structureMaterialCost: 10000 },
    calculatedAt: AT, projectRateCardVersion: 'RC-SEED-1' });

  assert.equal(r.installationCost, 15000);
  assert.equal(r.heads.INSTALLATION.source, 'PROJECT_HEAD_RATE_CARD');
  assert.equal(r.siteSurveyCost, 590, '500 + 30 × 3');
  assert.equal(r.heads.SITE_SURVEY.source, 'PROJECT_HEAD_RATE_CARD');
  assert.equal(r.engineeringDesignCost, 500);
  assert.equal(r.serviceAmcCost, 10000);
  assert.equal(r.transportationCost, 130 * 30);
  assert.equal(r.projectRateCardVersion, 'RC-SEED-1');
  // every rate carries the version it came from
  for (const h of ['INSTALLATION', 'SITE_SURVEY', 'ENGINEERING_DESIGN'])
    assert.ok(r.heads[h].configVersion, h);
  // no commercial rate literal lives in the engine
  const src = readFileSync('src/lib/costEngine.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const literal of ['15000', '500', '1000', '3000'])
    assert.equal(new RegExp(`[^\\w]${literal}[^\\w]`).test(src), false, `literal ${literal} in engine`);
});

// -------------------------------------------------- 50–58  audit trail
test('50–57 — every version records who, when, old, new, why, effective, version, previous', () => {
  const store = panelHistory();
  const v = getCurrentVersion(store, CONFIG_TYPE.PROCUREMENT_PRICE, 'p1');
  assert.equal(v.changedBy, 'procurement@flarize');            // 50 who
  assert.equal(v.changedAt, '2026-08-20T09:00:00Z');           // 51 when
  assert.equal(v.changeReason, 'New supplier price');          // 54 why
  assert.equal(v.effectiveFrom, '2026-08-20');                 // 55 effective from
  assert.equal(v.versionId, 'LC-012');                         // 56 version
  assert.equal(v.previousVersionId, 'LC-011');                 // 57 previous version
  const old = getVersion(store, CONFIG_TYPE.PROCUREMENT_PRICE, 'p1', 'LC-011');
  assert.equal(old.value.landedUnitCost, 8950);                // 52 old value
  assert.equal(v.value.landedUnitCost, 9200);                  // 53 new value
  assert.equal(v.status, CONFIG_STATUS.ACTIVE);                // current status
});

test('58 — versions can be compared field by field', () => {
  const store = panelHistory();
  const cmp = compareVersions(
    getVersion(store, CONFIG_TYPE.PROCUREMENT_PRICE, 'p1', 'LC-011'),
    getVersion(store, CONFIG_TYPE.PROCUREMENT_PRICE, 'p1', 'LC-012'));
  assert.equal(cmp.from.versionId, 'LC-011');
  assert.equal(cmp.to.versionId, 'LC-012');
  assert.equal(cmp.changedBy, 'procurement@flarize');
  assert.equal(cmp.changeReason, 'New supplier price');
  const landed = cmp.changes.find(c => c.field === 'landedUnitCost');
  assert.deepEqual([landed.oldValue, landed.newValue], [8950, 9200]);
  const purchase = cmp.changes.find(c => c.field === 'purchasePrice');
  assert.deepEqual([purchase.oldValue, purchase.newValue], [8600, 8850]);
  assert.equal(cmp.changes.some(c => c.field === 'supplier'), false, 'unchanged fields are not listed');
});

test('the audit fields are mandatory — a change cannot be anonymous', () => {
  assert.deepEqual(REQUIRED_AUDIT_FIELDS,
    ['versionId', 'changedBy', 'changedAt', 'changeReason', 'effectiveFrom']);
  for (const omit of REQUIRED_AUDIT_FIELDS) {
    const entry = { configType: CONFIG_TYPE.MARGIN, recordId: 'VALUE', value: { targetMarginPct: 20 },
      ...audit('M-1', AT, 'admin', 'set', '2026-08-16') };
    delete entry[omit];
    assert.throws(() => appendVersion(createHistoryStore(), entry),
      new RegExp(HISTORY_ERROR.MISSING_AUDIT_FIELDS), omit);
  }
  assert.throws(() => appendVersion(createHistoryStore(), {
    configType: 'NOT_A_TYPE', recordId: 'x', value: {}, ...audit('V', AT, 'a', 'b', 'c') }),
    new RegExp(HISTORY_ERROR.UNKNOWN_CONFIG_TYPE));
});

test('the history view is UI-shaped: CURRENT plus full HISTORY', () => {
  const view = historyView(panelHistory(), CONFIG_TYPE.PROCUREMENT_PRICE, 'p1');
  assert.equal(view.owner, 'PROCUREMENT');
  assert.equal(view.current.versionId, 'LC-012');
  assert.equal(view.current.value.landedUnitCost, 9200);
  assert.equal(view.current.changedBy, 'procurement@flarize');
  assert.equal(view.history.length, 2);
  assert.equal(view.history[0].versionId, 'LC-011');
  assert.equal(view.history[0].status, CONFIG_STATUS.SUPERSEDED);
  assert.equal(view.history[0].changeReason, 'Supplier revision');
});

test('every audited configuration type has exactly one owner', () => {
  for (const t of Object.keys(CONFIG_TYPE)) assert.ok(CONFIG_OWNER[t], t);
  assert.equal(CONFIG_OWNER.PROCUREMENT_PRICE, 'PROCUREMENT');
  assert.equal(CONFIG_OWNER.INSTALLATION_RATE, 'PROJECT_HEAD');
  assert.equal(CONFIG_OWNER.MARGIN, 'ADMIN');
  assert.equal(CONFIG_OWNER.GST_CONFIG, 'ADMIN');
  assert.equal(Object.values(CONFIG_OWNER).includes('SALES'), false, 'Sales owns no commercial configuration');
});

// ------------------------------------------------------ 20  locked versioning
test('a locked commercial snapshot pins the rate card and landed cost versions', () => {
  const card = seedRateCardFromConfig(
    { ...CFG, transportation: { ...CFG.transportation, vehicles: [{ vehicleType: 'PICKUP', ratePerKm: 30 }] } },
    { changedBy: 'ph', changedAt: AT, changeReason: 'seed', effectiveFrom: '2026-08-16', cardVersion: 'RC-1' });
  const snap = createProjectBomSnapshot({ projectId: 'PRJ-V', lockedBy: 'ph', lockedAt: AT,
    bomLines: [{ componentId: 'p1', role: 'PANEL', qty: 6 }] });
  const c = calculateCost({ snapshot: snap, config: CFG, rateCard: card,
    priceMaster: { p1: { landedUnitCost: 13600, landedCostVersion: 'lc@1' } },
    project: { sizeKw: 3, installationType: 'FLAT', tier: 'VALUE', distanceKm: 40,
               vehicleType: 'PICKUP', structureMaterialCost: 10000 },
    calculatedAt: AT, catalogVersion: 'catalog@t', procurementPriceVersion: 'pp@1',
    landedCostVersion: 'lc@1', projectRateCardVersion: 'RC-1' });
  assert.equal(c.status, COST_STATUS.COMPLETE, JSON.stringify(c.errors));

  const p = calculatePricing({ costResult: c, tier: 'VALUE', gst: CFG.gst, pricedAt: AT,
    margin: { marginType: 'GROSS_MARGIN', version: 'margin@t1',
      tiers: { VALUE: { targetMarginPct: 20, minimumMarginPct: 15 } } } });
  const snapshot = createCommercialSnapshot({ snapshotId: 'CS-V', costResult: c, pricingResult: p, issuedAt: AT });

  for (const k of VERSION_KEYS) assert.ok(snapshot.versions[k] !== undefined, k);
  assert.equal(snapshot.versions.projectRateCardVersion, 'RC-1');
  assert.equal(snapshot.versions.landedCostVersion, 'lc@1');
  assert.equal(VERSION_KEYS.length, 13);
  assert.throws(() => { snapshot.versions.projectRateCardVersion = 'RC-2'; }, TypeError);
});
