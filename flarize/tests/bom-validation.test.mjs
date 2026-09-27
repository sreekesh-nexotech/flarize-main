// Battery-consistency validation over the FROZEN golden baseline.
// Phase 0: DETECTION ONLY. These tests assert the defect EXISTS.
// When Phase 1 fixes Hybrid Value, the two `documented defect` tests flip and
// must be updated deliberately — that is the point.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBatteryConsistency, profileKeyFor, SEVERITY } from '../scripts/validate-bom.mjs';

const BASELINE = process.env.BASELINE || 'docs/baselines/golden-baseline-v2.json';
const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const profiles = catalog.packageProfiles;
let cells = [];
try { cells = JSON.parse(readFileSync(BASELINE, 'utf8')).cells; } catch { /* optional */ }

const hybrid = (tier, size) =>
  cells.find(c => c.id === `hybrid__${size}__${tier}`);

test('validator: battery declared but absent -> BLOCKED', () => {
  const r = validateBatteryConsistency({ bomLines: [] }, { batteryIncluded: true, batteryQuantity: 1 });
  assert.equal(r.status, SEVERITY.BLOCKED);
  assert.ok(r.findings.some(f => f.code === 'BATTERY_MISSING'));
});

test('validator: quantity mismatch -> BLOCKED', () => {
  const r = validateBatteryConsistency(
    { bomLines: [{ name: 'SEG.5 PRO 100AH LV Battery', qty: '1' }, { name: 'Battery MCCB Box', qty: '1' }] },
    { batteryIncluded: true, batteryQuantity: 2 });
  assert.ok(r.findings.some(f => f.code === 'BATTERY_QTY_MISMATCH'));
});

test('validator: accessories without a battery -> BLOCKED', () => {
  const r = validateBatteryConsistency(
    { bomLines: [{ name: '25mm Battery Cable', qty: '5' }, { name: '40A Change Over Switch', qty: '1' }] },
    { batteryIncluded: true, batteryQuantity: 1 });
  assert.equal(r.status, SEVERITY.BLOCKED);
  assert.ok(r.findings.some(f => f.code === 'BATTERY_ACCESSORIES_WITHOUT_BATTERY'));
});

test('validator: no battery declared and none present -> VALID', () => {
  const r = validateBatteryConsistency(
    { bomLines: [{ name: 'Deye Hybrid 1P 3-48v', qty: '1' }] },
    { batteryIncluded: false, batteryQuantity: 0 });
  assert.equal(r.status, SEVERITY.VALID);
});

test('validator: correct battery configuration -> VALID', () => {
  const r = validateBatteryConsistency(
    { bomLines: [
      { name: 'SEG.5 PRO 100AH LV Battery', qty: '1' },
      { name: 'Battery MCCB Box', qty: '1' },
      { name: '25mm Battery Cable', qty: '5' }] },
    { batteryIncluded: true, batteryQuantity: 1 });
  assert.equal(r.status, SEVERITY.VALID, JSON.stringify(r.findings));
});

test('profileKeyFor matches the active engine', () => {
  assert.equal(profileKeyFor('hybrid', 'value'), 'hybrid_value');
  assert.equal(profileKeyFor('ongrid', 'base'), 'ongrid_base');
  assert.equal(profileKeyFor('ongrid', 'premium'), 'premium');
});

test('profile hybrid_value declares one battery', () => {
  assert.equal(profiles.hybrid_value.batteryIncluded, true);
  assert.equal(profiles.hybrid_value.batteryQuantity, 1);
});

// --- Phase 1C/1D: these defects are now FIXED. Tests flipped deliberately. ---
// Until Phase 1 these asserted the defect EXISTED. They now assert the fix and
// act as the regression guard against it returning.
for (const size of ['3', '5', '8', '10']) {
  test(`D1 FIXED — hybrid ${size}kW value is battery-consistent`, (t) => {
    const cell = hybrid('value', size);
    if (!cell) return t.skip('baseline not present');
    const r = validateBatteryConsistency(cell, profiles.hybrid_value);
    assert.ok(!r.findings.some(f => f.code === 'BATTERY_MISSING'),
      `battery must be present at ${size}kW: ${JSON.stringify(r.findings)}`);
    assert.ok(!r.findings.some(f => f.code === 'BATTERY_ACCESSORIES_WITHOUT_BATTERY'),
      'accessories must never ship without a battery');
    assert.ok(!r.findings.some(f => f.code === 'BATTERY_MCCB_MISSING'),
      'battery MCCB must be present');
    assert.equal(r.status, SEVERITY.VALID, JSON.stringify(r.findings));
  });
}

test('D2 FIXED — hybrid premium battery is in the battery category at the canonical price', (t) => {
  const cell = hybrid('premium', '3');
  if (!cell) return t.skip('baseline not present');
  const bat = cell.bomLines.find(l => /Flex Battery/i.test(l.name || ''));
  assert.ok(bat, 'premium must still carry a battery');
  assert.equal(bat.itemId, 'bt2', 'must be the canonical catalog battery record');
  assert.equal(Number(bat.unitPrice), 95000, 'must price the canonical record, not the enphase alias');
});

test('control — hybrid base remains consistent with its profile', (t) => {
  const cell = hybrid('base', '3');
  if (!cell) return t.skip('baseline not present');
  const r = validateBatteryConsistency(cell, profiles.hybrid_base);
  assert.notEqual(r.status, SEVERITY.BLOCKED, JSON.stringify(r.findings));
});

test('on-grid tiers declare no battery and have none', (t) => {
  if (!cells.length) return t.skip('baseline not present');
  for (const c of cells.filter(c => c.group === 'ongrid')) {
    const r = validateBatteryConsistency(c, profiles[profileKeyFor('ongrid', c.tier)]);
    assert.ok(!r.findings.some(f => f.code === 'BATTERY_UNEXPECTED'), `${c.id}: ${JSON.stringify(r.findings)}`);
  }
});
