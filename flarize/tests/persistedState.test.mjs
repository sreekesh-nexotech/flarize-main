// H2 unit tests — canonical persisted state / dirty detection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalState, isDirty, diffKeys, PERSISTED_KEYS, stableStringify }
  from '../src/lib/persistedState.js';

const base = () => ({
  selections: { ongrid_value_3_1: 'i87' }, qtyOverrides: {}, priceOverrides: {},
  customItems: [], upgradeSelections: {}, upgradeQtyOverrides: {},
  upgradePriceOverrides: {}, upgradeCustomItems: [],
  sysType: 'ongrid', size: '3', tier: 'value', mode: 'quotation',
  distKm: 100, costOvr: {}, marginType: 'percent', marginVal: 20,
  subsidyType: 'residential', ghsHouses: 1, structGrade: 'default',
  structGradeMode: 'manual', roofType: 'flat', housePhase: '1P',
});

test('savedAt is excluded — the H2 root cause', () => {
  const snap = base();
  const fromServer = { ...base(), savedAt: '2026-08-15T04:40:16.678Z' };
  assert.equal(isDirty(snap, canonicalState(fromServer)), false,
    'a freshly loaded state must be clean even though the server adds savedAt');
});

test('every excluded metadata field is ignored', () => {
  const snap = base();
  const noisy = { ...base(), savedAt: 'x', updatedAt: 'y', createdAt: 'z',
                  token: 'secret', sessionToken: 'secret', _meta: { a: 1 } };
  assert.equal(isDirty(snap, canonicalState(noisy)), false);
});

test('token values never enter the canonical shape', () => {
  const c = canonicalState({ ...base(), token: 'SECRET', sessionToken: 'SECRET' });
  assert.equal(stableStringify(c).includes('SECRET'), false);
  assert.equal('token' in c, false);
  assert.equal('sessionToken' in c, false);
});

test('a real persisted change is detected', () => {
  const saved = canonicalState(base());
  const changed = { ...base(), selections: { ongrid_value_3_1: 'i79' } };
  assert.equal(isDirty(changed, saved), true);
  assert.deepEqual(diffKeys(changed, saved), ['selections']);
});

test('transient/unknown UI fields do not mark dirty', () => {
  const saved = canonicalState(base());
  const withUi = { ...base(), adminTab: 'costs', showPwd: true, bomSaveMsg: 'hi' };
  assert.equal(isDirty(withUi, saved), false);
});

test('numeric string vs number does not mark dirty', () => {
  const saved = canonicalState(base());          // marginVal: 20 (number)
  const typed = { ...base(), marginVal: '20' };  // number input hands back a string
  assert.equal(isDirty(typed, saved), false);
});

test('a genuine numeric change is still detected', () => {
  const saved = canonicalState(base());
  assert.equal(isDirty({ ...base(), marginVal: 25 }, saved), true);
});

test('key insertion order is irrelevant', () => {
  const a = { sysType: 'ongrid', size: '3', tier: 'value' };
  const b = { tier: 'value', size: '3', sysType: 'ongrid' };
  assert.equal(stableStringify(canonicalState(a)), stableStringify(canonicalState(b)));
});

test('null baseline (not yet loaded) is never dirty', () => {
  assert.equal(isDirty(base(), null), false);
  assert.equal(isDirty(base(), undefined), false);
});

test('canonical shape covers exactly PERSISTED_KEYS', () => {
  assert.deepEqual(Object.keys(canonicalState({})).sort(), [...PERSISTED_KEYS].sort());
});

test('save round-trip is clean', () => {
  const snap = base();
  const serverEcho = { ...snap, savedAt: new Date(0).toISOString() };
  assert.equal(isDirty(snap, canonicalState(serverEcho)), false);
});
