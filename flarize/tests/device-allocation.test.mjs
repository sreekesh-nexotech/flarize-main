// tests/device-allocation.test.mjs
//
// Phase C.1 (locked 2.10, 2026-09-05) — deviceType + panelsPerDevice allocator.
// Verifies complete-allocation-or-BLOCKED semantics + boundary cases.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { allocateDevices, ALLOCATION_CODE } = require('../src/lib/deviceAllocation.js');

const IQ8P  = { componentId: 'en1',  deviceType: 'microinverter', panelsPerDevice: 1, name: 'Enphase IQ8P' };
const HMS2K = { componentId: 'hm1',  deviceType: 'microinverter', panelsPerDevice: 4, name: 'HMS 2000' };
const HMS1K = { componentId: 'hm2',  deviceType: 'microinverter', panelsPerDevice: 2, name: 'HMS 1000' };
const OPT_1 = { componentId: 'opt1', deviceType: 'optimizer',     panelsPerDevice: 1, name: 'Optimizer 1P' };
const OPT_2 = { componentId: 'opt2', deviceType: 'optimizer',     panelsPerDevice: 2, name: 'Optimizer 2P' };
const STR   = { componentId: 'str',  deviceType: 'string_inverter', panelsPerDevice: 12, name: 'String inverter (per-string, not per-panel)' };

// ---------- 1-panel-per-device (Enphase IQ8P) ----------

describe('1-panel-per-device (Enphase IQ8P)', () => {
  it('6 panels → 6 units, VALID', () => {
    const r = allocateDevices({ panels: 6, candidates: [IQ8P] });
    assert.equal(r.status, 'VALID');
    assert.equal(r.unallocatedPanels, 0);
    assert.equal(r.allocations.length, 1);
    assert.equal(r.allocations[0].componentId, 'en1');
    assert.equal(r.allocations[0].quantity, 6);
    assert.equal(r.allocations[0].coveredPanels, 6);
  });
  it('1 panel → 1 unit, VALID', () => {
    const r = allocateDevices({ panels: 1, candidates: [IQ8P] });
    assert.equal(r.status, 'VALID');
    assert.equal(r.allocations[0].quantity, 1);
  });
  it('18 panels → 18 units, VALID', () => {
    const r = allocateDevices({ panels: 18, candidates: [IQ8P] });
    assert.equal(r.status, 'VALID');
    assert.equal(r.allocations[0].quantity, 18);
  });
});

// ---------- 2-panels-per-device (HMS 1000 alone) ----------

describe('2-panels-per-device (HMS 1000 only)', () => {
  it('4 panels → 2 units, VALID (exact divisibility)', () => {
    const r = allocateDevices({ panels: 4, candidates: [HMS1K] });
    assert.equal(r.status, 'VALID');
    assert.equal(r.allocations[0].quantity, 2);
    assert.equal(r.allocations[0].coveredPanels, 4);
  });
  it('5 panels → BLOCKED (no way to reach 5 with only 2-panel devices)', () => {
    const r = allocateDevices({ panels: 5, candidates: [HMS1K] });
    assert.equal(r.status, 'BLOCKED');
    assert.equal(r.code, ALLOCATION_CODE.BLOCKED_INCOMPLETE_ALLOCATION);
    assert.equal(r.unallocatedPanels, 1);
    assert.equal(r.allocations.length, 0, 'no partial allocation emitted (rule 6)');
    assert.match(r.reason, /1 panel/);
  });
});

// ---------- 4-panels-per-device (HMS 2000 alone) ----------

describe('4-panels-per-device (HMS 2000 only)', () => {
  it('8 panels → 2 units, VALID', () => {
    const r = allocateDevices({ panels: 8, candidates: [HMS2K] });
    assert.equal(r.status, 'VALID');
    assert.equal(r.allocations[0].quantity, 2);
  });
  it('10 panels → BLOCKED (H4 bug scenario — 2 devices cover 8, 2 left)', () => {
    const r = allocateDevices({ panels: 10, candidates: [HMS2K] });
    assert.equal(r.status, 'BLOCKED');
    assert.equal(r.unallocatedPanels, 2);
    assert.equal(r.allocations.length, 0);
  });
  it('12 panels → 3 units, VALID', () => {
    const r = allocateDevices({ panels: 12, candidates: [HMS2K] });
    assert.equal(r.status, 'VALID');
    assert.equal(r.allocations[0].quantity, 3);
  });
  it('7 panels → BLOCKED (odd count against 4-cap)', () => {
    const r = allocateDevices({ panels: 7, candidates: [HMS2K] });
    assert.equal(r.status, 'BLOCKED');
  });
});

// ---------- Mixed 4 + 2 (HMS 2000 + HMS 1000 together) ----------

describe('Mixed 4+2 (H4-fix: mixed device coverage)', () => {
  it('10 panels → 2×HMS2000 + 1×HMS1000, VALID', () => {
    const r = allocateDevices({ panels: 10, candidates: [HMS2K, HMS1K] });
    assert.equal(r.status, 'VALID');
    assert.equal(r.unallocatedPanels, 0);
    // fewest units preference: 2×4 + 1×2 = 3 units (vs 5×2 = 5 units)
    const totalUnits = r.allocations.reduce((s, a) => s + a.quantity, 0);
    assert.equal(totalUnits, 3);
    const hm2k = r.allocations.find(a => a.componentId === 'hm1');
    const hm1k = r.allocations.find(a => a.componentId === 'hm2');
    assert.equal(hm2k.quantity, 2);
    assert.equal(hm1k.quantity, 1);
  });
  it('11 panels → BLOCKED (odd, no 1-panel device available)', () => {
    const r = allocateDevices({ panels: 11, candidates: [HMS2K, HMS1K] });
    assert.equal(r.status, 'BLOCKED');
    assert.equal(r.unallocatedPanels, 1);
  });
  it('11 panels + IQ8P → VALID (adds 1×IQ8P for the remainder)', () => {
    const r = allocateDevices({ panels: 11, candidates: [HMS2K, HMS1K, IQ8P] });
    assert.equal(r.status, 'VALID');
    assert.equal(r.unallocatedPanels, 0);
    const total = r.allocations.reduce((s, a) => s + a.coveredPanels, 0);
    assert.equal(total, 11);
  });
});

// ---------- Optimizer allocation ----------

describe('Optimizer allocation', () => {
  it('16 panels + 1-panel optimizer → 16 units, VALID', () => {
    const r = allocateDevices({ panels: 16, candidates: [OPT_1] });
    assert.equal(r.status, 'VALID');
    assert.equal(r.allocations[0].quantity, 16);
    assert.equal(r.allocations[0].deviceType, 'optimizer');
  });
  it('9 panels + 2-panel optimizer → BLOCKED (odd)', () => {
    const r = allocateDevices({ panels: 9, candidates: [OPT_2] });
    assert.equal(r.status, 'BLOCKED');
  });
  it('9 panels + mixed 2-panel + 1-panel optimizer → VALID', () => {
    const r = allocateDevices({ panels: 9, candidates: [OPT_2, OPT_1] });
    assert.equal(r.status, 'VALID');
    // fewest units preference: 4×OPT_2 + 1×OPT_1 = 5 units (vs 9×OPT_1 = 9)
    const total = r.allocations.reduce((s, a) => s + a.quantity, 0);
    assert.equal(total, 5);
  });
});

// ---------- Edge cases ----------

describe('Edge cases', () => {
  it('0 panels → NOT_APPLICABLE (no allocation error)', () => {
    const r = allocateDevices({ panels: 0, candidates: [IQ8P] });
    assert.equal(r.status, 'NOT_APPLICABLE');
    assert.equal(r.allocations.length, 0);
    assert.equal(r.unallocatedPanels, 0);
  });
  it('empty candidates → BLOCKED_NO_CANDIDATES', () => {
    const r = allocateDevices({ panels: 6, candidates: [] });
    assert.equal(r.status, 'BLOCKED');
    assert.equal(r.code, ALLOCATION_CODE.BLOCKED_NO_CANDIDATES);
  });
  it('string_inverter candidate is skipped (not per-panel)', () => {
    const r = allocateDevices({ panels: 6, candidates: [STR] });
    assert.equal(r.status, 'BLOCKED');
    assert.equal(r.code, ALLOCATION_CODE.BLOCKED_NO_USABLE_CANDIDATES);
    assert.equal(r.skipped.length, 1);
    assert.match(r.skipped[0].reason, /string_inverter/);
  });
  it('candidate with panelsPerDevice=null is skipped', () => {
    const bad = { componentId: 'bad', deviceType: 'microinverter', panelsPerDevice: null };
    const r = allocateDevices({ panels: 6, candidates: [bad, IQ8P] });
    assert.equal(r.status, 'VALID');
    assert.equal(r.skipped.length, 1);
    assert.equal(r.allocations[0].componentId, 'en1');
  });
  it('negative panels → BLOCKED_PANELS_INVALID', () => {
    const r = allocateDevices({ panels: -1, candidates: [IQ8P] });
    assert.equal(r.status, 'BLOCKED');
    assert.equal(r.code, ALLOCATION_CODE.BLOCKED_PANELS_INVALID);
  });
  it('non-integer panels → BLOCKED_PANELS_INVALID', () => {
    const r = allocateDevices({ panels: 6.5, candidates: [IQ8P] });
    assert.equal(r.status, 'BLOCKED');
    assert.equal(r.code, ALLOCATION_CODE.BLOCKED_PANELS_INVALID);
  });
});

// ---------- Determinism ----------

describe('Determinism', () => {
  it('same inputs → same allocation (byte-equal JSON)', () => {
    const in1 = { panels: 10, candidates: [HMS2K, HMS1K, IQ8P] };
    const in2 = { panels: 10, candidates: [IQ8P, HMS1K, HMS2K] }; // reordered
    const r1 = allocateDevices(in1);
    const r2 = allocateDevices(in2);
    // Same total coverage + same qtys per componentId regardless of input order
    const sig = (r) => r.allocations.slice().sort((a,b)=>a.componentId.localeCompare(b.componentId))
                        .map(a => `${a.componentId}=${a.quantity}`).join('|');
    assert.equal(sig(r1), sig(r2));
    assert.equal(r1.status, r2.status);
  });
});
