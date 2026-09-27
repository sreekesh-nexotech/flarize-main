// Phase 1C — approved engineering decisions D11, D12, C32.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolveBattery, BATTERY_PROTECTION_MODE, BATTERY_PROTECTION_BY_COMPONENT } from '../src/lib/resolveBattery.js';
import { ROLES, NOT_MODELLED_IN_V1, CATEGORY_TO_ROLE, ENPHASE_COMPONENT_ROLES,
         PREMIUM_HYBRID_PROHIBITED, PENDING_CONFIGURATION_CONFIRMATION, roleForLine } from '../src/lib/bomRoles.js';
import { validateEngineering } from '../src/lib/engineeringValidation.js';

const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const P = catalog.packageProfiles;
const iso = (id) => catalog.categories.isolator.items.find(i => i.id === id);
const B = existsSync('docs/baselines/golden-baseline-v3.json')
  ? JSON.parse(readFileSync('docs/baselines/golden-baseline-v3.json', 'utf8')).cells : [];
const cell = (id) => B.find(c => c.id === id);
const q = (v) => { const m = /-?\d+(\.\d+)?/.exec(String(v ?? '')); return m ? Number(m[0]) : 0; };
const find = (c, rx) => (c?.bomLines || []).filter(l => rx.test(l.name || ''));

// ---------- D11 ----------
test('D11-A — is1 eligible for base, value, premium', () => {
  assert.deepEqual([...iso('is1').tiers].sort(), ['base', 'premium', 'value']);
});
test('D11-B — is2 eligible for base, value, premium', () => {
  assert.deepEqual([...iso('is2').tiers].sort(), ['base', 'premium', 'value']);
});
test('D11-D — placeholder is TEST and retained, not deleted', () => {
  const p = iso('is_9b53be37fab1');
  assert.ok(p, 'record must be retained for historical reference');
  assert.equal(p.status, 'TEST');
});
test('D11-C — DC_ISOLATOR is not a V1 role', () => {
  assert.equal('DC_ISOLATOR' in ROLES, false);
  assert.ok(NOT_MODELLED_IN_V1.includes('DC_ISOLATOR'));
  assert.equal(CATEGORY_TO_ROLE.isolator, ROLES.AC_ISOLATOR);
});
test('D11 — no new isolator was created', () => {
  assert.equal(catalog.categories.isolator.items.length, 3, 'still exactly the 3 original records');
});

// ---------- D12 battery protection ----------
test('D12 — Enphase battery protection is INTEGRATED', () => {
  assert.equal(BATTERY_PROTECTION_BY_COMPONENT.bt2.mode, BATTERY_PROTECTION_MODE.INTEGRATED);
  assert.equal(BATTERY_PROTECTION_BY_COMPONENT.bt2.providedBy, 'ENERGY_SYSTEM_CONTROLLER');
});
test('D12 — Deye/SEG batteries remain UNKNOWN, not guessed', () => {
  for (const id of ['bt1', 'bt3', 'bt4'])
    assert.equal(BATTERY_PROTECTION_BY_COMPONENT[id].mode, BATTERY_PROTECTION_MODE.UNKNOWN);
});
test('D12 — premium resolves INTEGRATED: no MCCB, no generic DC cable', () => {
  const r = resolveBattery(P.hybrid_premium, catalog, { sysType: 'hybrid', tier: 'premium' });
  assert.equal(r.protection.mode, 'INTEGRATED');
  assert.equal(r.requiresMccb, false);
  assert.equal(r.requiresCable, false);
  assert.equal(r.componentId, 'bt2');
});
test('D12 — value keeps external protection while mode is UNKNOWN', () => {
  const r = resolveBattery(P.hybrid_value, catalog, { sysType: 'hybrid', tier: 'value' });
  assert.equal(r.requiresMccb, true, 'existing template behaviour preserved');
  assert.ok(r.issues.some(i => i.code === 'BATTERY_PROTECTION_MODE_UNKNOWN'));
});

// ---------- C32 roles ----------
test('C32 — approved role set present', () => {
  for (const r of ['PANEL','INVERTER','MICRO_INVERTER','BATTERY','BATTERY_PROTECTION','BATTERY_CABLE',
    'AC_ISOLATOR','ACDB','DCDB','STRUCTURE','CHANGEOVER','MONITORING','PROTECTION','EARTHING',
    'AC_CABLE','DC_CABLE','ENERGY_SYSTEM_CONTROLLER','ENPHASE_COMMUNICATION','METER','OTHER'])
    assert.ok(r in ROLES, `missing role ${r}`);
});
test('C32 — System Controller is its own role, not inverter/battery/accessory', () => {
  assert.equal(ENPHASE_COMPONENT_ROLES.en7, ROLES.ENERGY_SYSTEM_CONTROLLER);
  assert.equal(ENPHASE_COMPONENT_ROLES.en_sysctrl, ROLES.ENERGY_SYSTEM_CONTROLLER);
  assert.notEqual(ENPHASE_COMPONENT_ROLES.en7, ROLES.INVERTER);
  assert.notEqual(ENPHASE_COMPONENT_ROLES.en7, ROLES.BATTERY);
});
test('C32 — IQ8P is MICRO_INVERTER, resolved by componentId not name', () => {
  assert.equal(ENPHASE_COMPONENT_ROLES.en1, ROLES.MICRO_INVERTER);
  assert.equal(roleForLine({ itemId: 'en1', name: 'anything at all' }), ROLES.MICRO_INVERTER);
});
test('C32 — unambiguous fixedItems map, ambiguous ones stay OTHER', () => {
  assert.equal(roleForLine({ name: '25mm Battery Cable' }), ROLES.BATTERY_CABLE);
  assert.equal(roleForLine({ name: '40A Change Over Switch' }), ROLES.CHANGEOVER);
  assert.equal(roleForLine({ name: 'Insulation Tape' }), ROLES.OTHER);
});
test('C32 — premium prohibitions are declared', () => {
  assert.ok(PREMIUM_HYBRID_PROHIBITED.mb1);
  assert.ok(PREMIUM_HYBRID_PROHIBITED['25mm Battery Cable']);
});
test('D12 — Envoy / IQ Relay / CTS are PENDING, not removed', () => {
  for (const id of ['en3', 'en4', 'en6']) {
    assert.ok(PENDING_CONFIGURATION_CONFIRMATION[id], `${id} must be marked pending`);
    assert.ok(catalog.categories.enphase.items.find(i => i.id === id), `${id} must be retained`);
  }
});

// ---------- validation ----------
test('validation — premium hybrid without a System Controller is BLOCKED', () => {
  const v = validateEngineering({ bom: { bomLines: [
    { category: 'panel', itemId: 'p1', name: 'X 540W', qty: '5' },
    { itemId: 'en1', name: 'Enphase IQ8P Micro Inverter', qty: '5' },
    { category: 'battery', itemId: 'bt2', name: 'Enphase Flex Battery', qty: '1' }] },
    profile: P.hybrid_premium, catalog, sysType: 'hybrid', tier: 'premium',
    batteryProtectionMode: 'INTEGRATED' });
  assert.ok(v.findings.some(f => f.ruleId === 'ENG-ENP-001'));
});
test('validation — IQ8P quantity must equal panel quantity', () => {
  const v = validateEngineering({ bom: { bomLines: [
    { category: 'panel', itemId: 'p1', name: 'X 540W', qty: '9' },
    { itemId: 'en1', name: 'Enphase IQ8P Micro Inverter', qty: '13' },
    { itemId: 'en7', name: 'Enphase System Controller', qty: '1' },
    { category: 'battery', itemId: 'bt2', name: 'Enphase Flex Battery', qty: '1' }] },
    profile: P.hybrid_premium, catalog, sysType: 'hybrid', tier: 'premium',
    batteryProtectionMode: 'INTEGRATED' });
  const f = v.findings.find(x => x.ruleId === 'ENG-ENP-002');
  assert.ok(f, 'hardcoded 13 IQ8P against 9 panels must be BLOCKED');
  assert.equal(f.severity, 'BLOCKED');
});
test('validation — generic mb1 on premium is BLOCKED', () => {
  const v = validateEngineering({ bom: { bomLines: [
    { category: 'panel', itemId: 'p1', name: 'X 540W', qty: '5' },
    { itemId: 'en1', name: 'Enphase IQ8P Micro Inverter', qty: '5' },
    { itemId: 'en7', name: 'Enphase System Controller', qty: '1' },
    { category: 'battery', itemId: 'bt2', name: 'Enphase Flex Battery', qty: '1' },
    { category: 'mccb_box', itemId: 'mb1', name: 'Battery MCCB Box 160A', qty: '1' }] },
    profile: P.hybrid_premium, catalog, sysType: 'hybrid', tier: 'premium',
    batteryProtectionMode: 'INTEGRATED' });
  assert.ok(v.findings.some(f => f.ruleId === 'ENG-BAT-008'));
  assert.equal(v.status, 'BLOCKED');
});
test('validation — pending Enphase components raise WARNING, not silent VALID', () => {
  const v = validateEngineering({ bom: { bomLines: [
    { category: 'panel', itemId: 'p1', name: 'X 540W', qty: '5' },
    { itemId: 'en1', name: 'Enphase IQ8P Micro Inverter', qty: '5' },
    { itemId: 'en3', name: 'Enphase Envoy S Metered', qty: '1' },
    { itemId: 'en7', name: 'Enphase System Controller', qty: '1' },
    { category: 'battery', itemId: 'bt2', name: 'Enphase Flex Battery', qty: '1' }] },
    profile: P.hybrid_premium, catalog, sysType: 'hybrid', tier: 'premium',
    batteryProtectionMode: 'INTEGRATED' });
  const f = v.findings.find(x => x.ruleId === 'ENG-ENP-003');
  assert.ok(f); assert.equal(f.severity, 'WARNING');
  assert.notEqual(v.status, 'VALID', 'pending configuration must never present as fully VALID');
});
test('validation — inactive component can never appear in a production BOM', () => {
  const v = validateEngineering({ bom: { bomLines: [
    { category: 'isolator', itemId: 'is_9b53be37fab1', name: 'New Isolator', qty: '1' }] },
    profile: P.ongrid_value, catalog, sysType: 'ongrid', tier: 'value' });
  assert.ok(v.findings.some(f => f.ruleId === 'ENG-CMP-001'));
});

// ---------- captured baseline: premium matrix ----------
for (const s of ['3', '5', '8', '10']) {
  test(`premium hybrid ${s}kW — IQ8P == panel qty, 1 battery, 1 controller, no mb1, no DC cable`, (t) => {
    const c = cell(`hybrid__${s}__premium`);
    if (!c) return t.skip('baseline v3 not present');
    const panel = find(c, /\d{3}W/)[0];
    const iq = find(c, /IQ8P/)[0];
    assert.ok(panel && iq, 'panel and IQ8P lines must exist');
    assert.equal(q(iq.qty), q(panel.qty), 'IQ8P quantity must equal panel quantity');
    const flex = find(c, /Flex Battery/);
    assert.equal(flex.length, 1); assert.equal(q(flex[0].qty), 1);
    assert.equal(flex[0].itemId, 'bt2', 'canonical battery record');
    assert.equal(find(c, /System Controller/).length, 1);
    assert.equal(find(c, /Battery MCCB/).length, 0, 'generic mb1 prohibited');
    assert.equal(find(c, /25mm Battery Cable/).length, 0, 'generic DC cable prohibited');
  });
}
test('no captured cell contains the placeholder isolator', (t) => {
  if (!B.length) return t.skip('baseline v3 not present');
  for (const c of B)
    for (const l of c.bomLines || [])
      assert.notEqual(l.itemId, 'is_9b53be37fab1', c.id);
});
test('no captured cell contains an unresolved N/A line', (t) => {
  if (!B.length) return t.skip('baseline v3 not present');
  for (const c of B)
    for (const l of c.bomLines || [])
      assert.ok(!(l.isNA || (!l.name && q(l.qty) > 0)), `${c.id}: unresolved line`);
});
