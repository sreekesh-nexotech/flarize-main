// Phase 1 domain-model tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveBattery, isBatteryAlias, canonicalBatteryIdFor } from '../src/lib/resolveBattery.js';
import { toComponent, findByComponentId, isSelectable, findDuplicateIdentities, COMPONENT_STATUS } from '../src/lib/componentIdentity.js';
import { derivePackageComponents, isApprovedSelection, isSalesEditable, ENGINEERING_CRITICAL_ROLES } from '../src/lib/packageAuthority.js';
import { buildUpgradeIdentity, upgradeIdentityKey, checkUpgradeSectionPolicy, APPROVED_UPGRADE_PATHS } from '../src/lib/upgradeModel.js';
import { classifyCatalog, classifyCatalogItem } from '../src/lib/catalogLifecycle.js';
import { BOM_STATUS, statusFromValidation, canGenerateQuotation, canLockProjectBom, requiresApproval, canTransition, quotationGate } from '../src/lib/bomStatus.js';
import { validateEngineering, RULES } from '../src/lib/engineeringValidation.js';

const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const P = catalog.packageProfiles;

// ---------- 1A component identity ----------
test('1A component identity is by componentId, not name', () => {
  const c = findByComponentId(catalog, 'bt2');
  assert.equal(c.componentId, 'bt2');
  assert.equal(c.category, 'battery');
  assert.equal(findByComponentId(catalog, 'Enphase Flex Battery'), null, 'names must not resolve');
});

test('1A component carries the required identity fields', () => {
  const c = toComponent('inverter', catalog.categories.inverter.items[0]);
  for (const k of ['componentId','category','brand','model','specification','unit','status','active'])
    assert.ok(k in c, `missing ${k}`);
  assert.equal(c.status, COMPONENT_STATUS.ACTIVE);
});

test('1A non-active components are not selectable', () => {
  const c = toComponent('battery', { id: 'x', tiers: ['value'], status: COMPONENT_STATUS.TEST });
  assert.equal(isSelectable(c), false);
});

test('1A duplicate identity detection runs over the real catalog', () => {
  assert.ok(Array.isArray(findDuplicateIdentities(catalog)));
});

// ---------- 1B package authority ----------
test('1B alternates reference real componentIds', () => {
  const { components } = derivePackageComponents(P.ongrid_value, catalog, { tier: 'value' });
  for (const e of Object.values(components))
    for (const id of e.approvedAlternates)
      assert.ok(findByComponentId(catalog, id), `alternate ${id} is not a catalog component`);
});

test('1B engineering-critical roles are not sales editable (revised 2026-09-02)', () => {
  // Revision: Sales direct-selectable = panel + inverter + structure.
  // ACDB / DCDB moved to engineering-approval-only.
  for (const r of ENGINEERING_CRITICAL_ROLES) assert.equal(isSalesEditable(r), false);
  for (const r of ['panel','inverter','structure']) assert.equal(isSalesEditable(r), true);
  for (const r of ['acdb','dcdb']) assert.equal(isSalesEditable(r), false,
    `${r} must NOT be Sales-editable — engineering-sensitive`);
});

test('1B a component outside the approved set is rejected', () => {
  const { components } = derivePackageComponents(P.ongrid_value, catalog, { tier: 'value' });
  assert.equal(isApprovedSelection(components, 'inverter', 'NOT_A_REAL_ID'), false);
  const first = components.inverter.approvedAlternates[0];
  assert.equal(isApprovedSelection(components, 'inverter', first), true);
});

test('1B unpinned roles are reported, not silently defaulted', () => {
  const { unpinnedRoles } = derivePackageComponents(P.hybrid_value, catalog, { tier: 'value' });
  assert.ok(unpinnedRoles.length > 0, 'current profiles pin nothing — must be reported');
});

// ---------- 1C battery resolution ----------
for (const [tier, key, expected] of [['base','hybrid_base',0],['value','hybrid_value',1],['premium','hybrid_premium',1]]) {
  test(`1C hybrid ${tier}: quantity comes from the profile (${expected})`, () => {
    const r = resolveBattery(P[key], catalog, { sysType: 'hybrid', tier });
    assert.equal(r.quantity, expected);
    assert.equal(r.batQtyIndex, String(expected));
    assert.equal(r.required, expected > 0);
  });
}

test('1C battery is always the canonical battery category', () => {
  const r = resolveBattery(P.hybrid_premium, catalog, { sysType: 'hybrid', tier: 'premium' });
  assert.equal(r.category, 'battery');
  assert.equal(r.componentId, 'bt2');
  assert.equal(r.spec.unitPrice, 95000, 'must price the canonical record, not the enphase alias');
});

test('1C hybrid value resolves the value-tier battery', () => {
  const r = resolveBattery(P.hybrid_value, catalog, { sysType: 'hybrid', tier: 'value' });
  assert.equal(r.required, true);
  assert.ok(r.componentId);
  assert.equal(findByComponentId(catalog, r.componentId).category, 'battery');
});

test('1C accessories are required only alongside a battery', () => {
  const none = resolveBattery(P.hybrid_base, catalog, { sysType: 'hybrid', tier: 'base' });
  assert.deepEqual([none.requiresMccb, none.requiresCable, none.requiresChangeOver], [false,false,false]);
  const one = resolveBattery(P.hybrid_value, catalog, { sysType: 'hybrid', tier: 'value' });
  assert.deepEqual([one.requiresMccb, one.requiresCable, one.requiresChangeOver], [true,true,true]);
});

test('1C on-grid never carries a battery', () => {
  for (const t of ['base','value','premium']) {
    const key = t === 'premium' ? 'premium' : `ongrid_${t}`;
    assert.equal(resolveBattery(P[key], catalog, { sysType: 'ongrid', tier: t }).quantity, 0);
  }
});

// ---------- 1D identity alias ----------
test('1D the enphase Flex Battery row is a registered alias of bt2', () => {
  assert.equal(isBatteryAlias('enphase', 'Enphase Flex Battery 5kWh'), true);
  assert.equal(canonicalBatteryIdFor('enphase', 'Enphase Flex Battery 5kWh'), 'bt2');
  assert.equal(isBatteryAlias('enphase', 'Enphase Envoy S Metered'), false);
});

test('1D the alias record still exists — not deleted', () => {
  const en = catalog.categories.enphase.items.find(i => /Flex Battery/i.test(i.name));
  assert.ok(en, 'alias must be retained for traceability until reviewed');
});

// ---------- 1E engineering validation ----------
test('1E every rule documents id, severity, description, inputs and source', () => {
  for (const r of RULES)
    for (const k of ['id','severity','description','inputs','source'])
      assert.ok(r[k], `rule ${r.id} missing ${k}`);
  assert.ok(RULES.length >= 18);
});

test('1E battery declared but absent -> BLOCKED', () => {
  const v = validateEngineering({ bom: { bomLines: [] }, profile: P.hybrid_value, catalog, sysType: 'hybrid' });
  assert.equal(v.status, 'BLOCKED');
  assert.ok(v.findings.some(f => f.ruleId === 'ENG-BAT-001'));
});

test('1E N/A line -> BLOCKED as a missing mandatory component', () => {
  const v = validateEngineering({ bom: { bomLines: [{ category:'isolator', name:'N/A', qty:'1', isNA:true }] },
    profile: P.ongrid_value, catalog, sysType: 'ongrid' });
  assert.ok(v.findings.some(f => f.ruleId === 'ENG-SYS-003'));
});

test('1E inactive component -> BLOCKED', () => {
  const cat2 = JSON.parse(JSON.stringify(catalog));
  cat2.categories.battery.items.find(i => i.id === 'bt1').status = 'TEST';
  const v = validateEngineering({ bom: { bomLines: [{ category:'battery', itemId:'bt1', name:'SEG.5 PRO 100AH LV Battery', qty:'1' }] },
    profile: P.hybrid_value, catalog: cat2, sysType: 'hybrid' });
  assert.ok(v.findings.some(f => f.ruleId === 'ENG-CMP-001'));
});

test('1E fallback selection -> WARNING, never BLOCKED on its own', () => {
  const v = validateEngineering({ bom: { bomLines: [{ category:'panel', itemId:'p1', name:'x', qty:'6', autoSelected:true, resolution:'fallback:firstAvailable' }] },
    profile: P.ongrid_value, catalog, sysType: 'ongrid' });
  const f = v.findings.find(x => x.ruleId === 'ENG-CMP-005');
  assert.ok(f); assert.equal(f.severity, 'WARNING');
});

test('1E unsupported size -> BLOCKED (hybrid has no 6kW)', () => {
  const v = validateEngineering({ bom:{bomLines:[]}, profile: P.hybrid_base, catalog, sysType:'hybrid', size:'6' });
  assert.ok(v.findings.some(f => f.ruleId === 'ENG-SYS-001'));
});

test('1E subsidy + non-DCR panel -> BLOCKED', () => {
  const v = validateEngineering({ bom:{bomLines:[{category:'panel',itemId:'p1',name:'X',qty:'6',panelType:'NON_DCR'}]},
    profile: P.ongrid_value, catalog, sysType:'ongrid', subsidyType:'residential' });
  assert.ok(v.findings.some(f => f.ruleId === 'ENG-PNL-001'));
});

test('1E unapproved upgrade path -> BLOCKED', () => {
  const v = validateEngineering({ bom:{bomLines:[]}, catalog, sysType:'upgrade', upgrade:{fromKw:3,toKw:25,sections:{panels:1,structure:1,inverter:1,wiring:1}} });
  assert.ok(v.findings.some(f => f.ruleId === 'ENG-UPG-001'));
});

test('1E approved-but-auto-scaled path -> WARNING', () => {
  const v = validateEngineering({ bom:{bomLines:[]}, catalog, sysType:'upgrade', upgrade:{fromKw:3,toKw:6,sections:{panels:1,structure:1,inverter:1,wiring:1}} });
  const f = v.findings.find(x => x.ruleId === 'ENG-UPG-002');
  assert.ok(f); assert.equal(f.severity, 'WARNING');
});

test('1E clean configuration -> VALID', () => {
  const v = validateEngineering({ bom:{bomLines:[{category:'panel',itemId:'p1',name:'Waaree',qty:'6',panelType:'DCR'}]},
    profile: P.ongrid_value, catalog, sysType:'ongrid', size:'3', subsidyType:'residential' });
  assert.equal(v.status, 'VALID', JSON.stringify(v.findings));
});

// ---------- 1F upgrade model ----------
test('1F upgrade identity survives an identical BOM (defect D6)', () => {
  const a = buildUpgradeIdentity({ fromKw:3, toKw:8, tier:'premium' });
  const b = buildUpgradeIdentity({ fromKw:5, toKw:10, tier:'premium' });
  assert.equal(a.deltaKw, b.deltaKw, 'same delta — BOMs legitimately match');
  assert.notEqual(a.upgradePathId, b.upgradePathId);
  assert.notEqual(upgradeIdentityKey(a), upgradeIdentityKey(b), 'identity must still differ');
});

test('1F identity carries from, to, delta, tier and pathId', () => {
  const i = buildUpgradeIdentity({ fromKw:5, toKw:10, tier:'value' });
  assert.deepEqual([i.fromSize,i.toSize,i.deltaKw,i.tier,i.upgradePathId], [5,10,5,'value','UPG-5-10']);
});

test('1F all six approved paths are modelled', () => {
  assert.equal(APPROVED_UPGRADE_PATHS.length, 6);
  for (const [f,t] of [[3,5],[3,6],[3,8],[5,8],[5,10],[8,10]])
    assert.ok(buildUpgradeIdentity({fromKw:f,toKw:t,tier:'value'}).approved);
});

test('1F unapproved path is marked', () => {
  assert.equal(buildUpgradeIdentity({fromKw:3,toKw:30,tier:'value'}).approved, false);
});

test('1F wiring-only default is not sellable (defect D10)', () => {
  const r = checkUpgradeSectionPolicy({ panels:false, structure:false, inverter:false, hybridInv:false, battery:false, wiring:true });
  assert.equal(r.sellable, false);
  assert.deepEqual(r.missingMandatory, ['panels','structure','inverter']);
});

test('1F full mandatory selection is sellable', () => {
  assert.equal(checkUpgradeSectionPolicy({ panels:true, structure:true, inverter:true, wiring:true }).sellable, true);
});

// ---------- 1G catalog lifecycle ----------
test('1G placeholder records are classified, not deleted', () => {
  const r = classifyCatalog(catalog);
  const ids = r.items.map(i => i.componentId);
  assert.ok(ids.includes('ba_3b51aef23f0b'), 'New Battery');
  assert.ok(ids.includes('is_9b53be37fab1'), 'New Isolator');
  assert.ok(ids.includes('pa_a2ea75b89b4d'), 'New Solar Panel');
  assert.ok(ids.includes('pa_0006870e2e7d'), 'hari 550');
  assert.equal(r.total, 257, 'nothing removed');
});

test('1G consumables without a brand are NOT flagged', () => {
  const c = classifyCatalogItem('mc4_connector', catalog.categories.mc4_connector.items[0]);
  assert.equal(c.status, COMPONENT_STATUS.ACTIVE);
});

test('1G an explicit status on the record wins', () => {
  const c = classifyCatalogItem('panel', { id:'x', name:'New Solar Panel', price:0, status:'ACTIVE' });
  assert.equal(c.status, 'ACTIVE');
});

// ---------- 1H BOM status ----------
test('1H BLOCKED cannot generate a quotation', () => {
  assert.equal(canGenerateQuotation(BOM_STATUS.BLOCKED), false);
  assert.equal(quotationGate(BOM_STATUS.BLOCKED).allowed, false);
});

test('1H WARNING may quote but requires approval', () => {
  assert.equal(canGenerateQuotation(BOM_STATUS.WARNING), true);
  assert.equal(requiresApproval(BOM_STATUS.WARNING), true);
});

test('1H VALID may quote; only APPROVED may lock a project BOM', () => {
  assert.equal(canGenerateQuotation(BOM_STATUS.VALID), true);
  assert.equal(canLockProjectBom(BOM_STATUS.VALID), false);
  assert.equal(canLockProjectBom(BOM_STATUS.APPROVED), true);
});

test('1H DRAFT cannot quote', () => {
  assert.equal(canGenerateQuotation(BOM_STATUS.DRAFT), false);
});

test('1H status maps from validation result', () => {
  assert.equal(statusFromValidation({status:'BLOCKED'}), BOM_STATUS.BLOCKED);
  assert.equal(statusFromValidation({status:'WARNING'}), BOM_STATUS.WARNING);
  assert.equal(statusFromValidation({status:'VALID'}), BOM_STATUS.VALID);
  assert.equal(statusFromValidation(null), BOM_STATUS.DRAFT);
});

test('1H BLOCKED cannot jump straight to APPROVED', () => {
  assert.equal(canTransition(BOM_STATUS.BLOCKED, BOM_STATUS.APPROVED), false);
  assert.equal(canTransition(BOM_STATUS.VALID, BOM_STATUS.APPROVED), true);
});
