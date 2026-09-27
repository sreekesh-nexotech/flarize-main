// tests/phase-c-boundary.test.mjs
//
// Phase C boundary/integration tests (locked 2.10, §6, H9, R3, R4, 2026-09-05).
// Verifies deviceAllocation-driven BOM emission, 3kW-3P explicit block,
// Enphase structured routing (no name.includes), and pending-battery
// approval-gate surfacing.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildBom } = require('../server-bom-builder.js');
const { resolveBattery } = require('../src/lib/resolveBattery.js');
const catalog = require('../data/catalog.json');
const batteryMaster = require('../data/battery-master.json').batteries;

// ---------- 3 kW 3P explicit BLOCK ----------

describe('C.5 explicit 3 kW 3P block', () => {
  it('ongrid 3 kW 3P throws UNSUPPORTED_CONFIGURATION', () => {
    let err = null;
    try { buildBom({ systemType: 'ongrid', size: '3', tier: 'base', phase: '3P' }); }
    catch (e) { err = e; }
    assert.ok(err, 'should throw');
    assert.equal(err.code, 'UNSUPPORTED_CONFIGURATION');
    assert.match(err.message, /3 kW 3-phase/);
  });
  it('hybrid 3 kW 3P throws UNSUPPORTED_CONFIGURATION', () => {
    let err = null;
    try { buildBom({ systemType: 'hybrid', size: '3', tier: 'base', phase: '3P' }); }
    catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, 'UNSUPPORTED_CONFIGURATION');
  });
  it('ongrid 3 kW 1P still builds normally (46 lines)', () => {
    const b = buildBom({ systemType: 'ongrid', size: '3', tier: 'base' });
    assert.ok(b.lines.length > 0);
    assert.equal(b.engineering.status, 'VALID');
  });
  it('ongrid 5tp 3P still builds normally', () => {
    const b = buildBom({ systemType: 'ongrid', size: '5tp', tier: 'base' });
    assert.ok(b.lines.length > 0);
  });
});

// ---------- Enphase structured routing (no name.includes) ----------

describe('C.2 Enphase structured allocation', () => {
  it('ongrid 3 kW premium emits IQ8P via DEVICE_ALLOCATION_STRUCTURED', () => {
    const b = buildBom({ systemType: 'ongrid', size: '3', tier: 'premium' });
    const iq8p = b.lines.find(l => l.componentId === 'en1');
    assert.ok(iq8p, 'IQ8P present');
    assert.equal(iq8p.selectionMethod, 'DEVICE_ALLOCATION_STRUCTURED');
    // 3 kW / 620 W panel ≈ 5 panels
    assert.equal(iq8p.qty, 5);
    assert.equal(b.engineering.status, 'VALID');
  });
  it('ongrid 10 kW premium allocates one IQ8P per panel', () => {
    const b = buildBom({ systemType: 'ongrid', size: '10', tier: 'premium' });
    const iq8p = b.lines.find(l => l.componentId === 'en1');
    const panel = b.lines.find(l => l.category === 'panel');
    assert.ok(iq8p);
    assert.equal(iq8p.qty, panel.qty, 'IQ8P qty equals panel qty');
    assert.equal(b.engineering.status, 'VALID');
  });
  it('Enphase accessories route via microAccessoryRole, not name.includes', () => {
    const b = buildBom({ systemType: 'ongrid', size: '3', tier: 'premium' });
    const envoy    = b.lines.find(l => l.componentId === 'en3');
    const qRelay   = b.lines.find(l => l.componentId === 'en4');
    const qTerm    = b.lines.find(l => l.componentId === 'en5');
    const qCable   = b.lines.find(l => l.componentId === 'en2');
    assert.ok(envoy, 'Envoy resolved via gateway role');
    assert.equal(envoy.selectionMethod, 'ACCESSORY_ROLE_LOOKUP');
    assert.ok(qRelay);
    assert.equal(qRelay.selectionMethod, 'ACCESSORY_ROLE_LOOKUP');
    assert.ok(qTerm);
    assert.equal(qTerm.qty, 1, '1-phase → 1 terminal');
    assert.ok(qCable);
    assert.equal(qCable.selectionMethod, 'ACCESSORY_ROLE_LOOKUP');
    assert.equal(qCable.qty, 5, 'one Q Cable per panel');
  });
  it('3-phase premium adds CT200 (qty 4) via role lookup', () => {
    const b = buildBom({ systemType: 'ongrid', size: '10', tier: 'premium' });
    const ct = b.lines.find(l => l.componentId === 'en6');
    const qTerm = b.lines.find(l => l.componentId === 'en5');
    assert.ok(ct);
    assert.equal(ct.qty, 4);
    assert.ok(qTerm);
    assert.equal(qTerm.qty, 3, '3-phase → 3 terminals');
  });
  it('hybrid premium adds System Controller (qty 1) via role lookup', () => {
    const b = buildBom({ systemType: 'hybrid', size: '5', tier: 'premium' });
    const sysCtrl = b.lines.find(l => l.componentId === 'en7');
    assert.ok(sysCtrl);
    assert.equal(sysCtrl.qty, 1);
    assert.equal(sysCtrl.selectionMethod, 'ACCESSORY_ROLE_LOOKUP');
  });
});

// ---------- ENG-DEV-001 blocker surfacing ----------

describe('C.3 ENG-DEV-001 unallocated panels', () => {
  // Contrived catalog copy would be needed to force a BLOCKED case in production.
  // Since the current Enphase IQ8P has panelsPerDevice=1, every panel count
  // trivially allocates. The core algorithm test already covers BLOCKED via
  // tests/device-allocation.test.mjs. Here we assert the SURFACE: `engineering`
  // status is exposed on bom result AND is 'VALID' when the allocation succeeds.
  it('bom.engineering.status = VALID for valid Enphase allocation', () => {
    const b = buildBom({ systemType: 'ongrid', size: '10', tier: 'premium' });
    assert.equal(b.engineering.status, 'VALID');
    assert.equal(b.engineering.blockers.length, 0);
  });
  it('bom.engineering.status = VALID for non-premium tier (no device allocation needed)', () => {
    const b = buildBom({ systemType: 'ongrid', size: '3', tier: 'base' });
    assert.equal(b.engineering.status, 'VALID');
  });
});

// ---------- Pending-battery approval-gate surfacing ----------

describe('C.6 pending battery approval', () => {
  it('bt1 (SEG) is PENDING and surfaces BATTERY_NOT_ENGINEERING_APPROVED', () => {
    const profile = catalog.packageProfiles.hybrid_value;
    const r = resolveBattery(profile, catalog, {
      sysType: 'hybrid', tier: 'value', batteryMaster,
    });
    assert.equal(r.componentId, 'bt1');
    assert.equal(r.approvalStatus, 'PENDING_ENGINEERING_APPROVAL');
    assert.equal(r.engineeringApproved, false);
    const blockedIssue = r.issues.find(i => i.code === 'BATTERY_NOT_ENGINEERING_APPROVED');
    assert.ok(blockedIssue, 'must emit BATTERY_NOT_ENGINEERING_APPROVED');
  });
  it('bt2 (Enphase Flex) is APPROVED, no engineering block', () => {
    // Simulate a profile that resolves specifically to bt2.
    const profile = { ...catalog.packageProfiles.hybrid_premium, batteryComponentId: 'bt2' };
    const r = resolveBattery(profile, catalog, {
      sysType: 'hybrid', tier: 'premium', batteryMaster,
    });
    assert.equal(r.componentId, 'bt2');
    assert.equal(r.approvalStatus, 'APPROVED');
    assert.equal(r.engineeringApproved, true);
    const blockedIssue = r.issues.find(i => i.code === 'BATTERY_NOT_ENGINEERING_APPROVED');
    assert.equal(blockedIssue, undefined, 'no approval issue when APPROVED');
  });
});

// ---------- B.6 project batteryQuantity flow through Phase C BOM ----------

describe('B.6 project batteryQuantity end-to-end through Phase C BOM', () => {
  it('override 0 removes battery line', () => {
    const b = buildBom({ systemType: 'hybrid', size: '5', tier: 'value', batteryQuantity: 0 });
    const bat = b.lines.find(l => l.category === 'battery');
    assert.equal(bat, undefined);
    assert.equal(b.systemConfig.batteryQuantity, 0);
    assert.equal(b.systemConfig.batterySource, 'PROJECT_HEAD_OVERRIDE');
  });
  it('override 1 emits battery line qty=1', () => {
    const b = buildBom({ systemType: 'hybrid', size: '5', tier: 'value', batteryQuantity: 1 });
    const bat = b.lines.find(l => l.category === 'battery');
    assert.equal(bat.qty, 1);
    assert.equal(b.systemConfig.batteryQuantity, 1);
  });
  it('override 2 emits battery line qty=2', () => {
    const b = buildBom({ systemType: 'hybrid', size: '5', tier: 'value', batteryQuantity: 2 });
    const bat = b.lines.find(l => l.category === 'battery');
    assert.equal(bat.qty, 2);
  });
  it('non-hybrid rejects override (batteryQuantity stays 0)', () => {
    const b = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base', batteryQuantity: 2 });
    assert.equal(b.systemConfig.batteryQuantity, 0);
    const bat = b.lines.find(l => l.category === 'battery');
    assert.equal(bat, undefined);
  });
});
