// PACK CONFIG — versioned Project-Head configuration (draft → submit → Admin approve).
// 2026-09-08 fast-quotation build. Pure lib tests: no server, no clock.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PACK_CONFIG_SCHEMA, DRAFT_STATUS, PRICING_MODE, ROOF_TYPES, ROOF_TO_STRUCTURE_KEY, CONFIG_SECTIONS,
  PACK_CONFIG_ERROR, DEFAULT_SALES_SWAP,
  seedFromCatalog, approvedConfig, draftConfig, updateDraftSection, updateDraftTemplate,
  submitDraft, approveDraft, approveDraftDirect, rejectDraft, resetDraft, describeStore,
  marketRateKey, approvedSizes, futurePairsFor,
} from '../src/lib/packConfig.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.join(here, '..', 'data', 'catalog.json'), 'utf-8'));

const PH = { userId: 'ph-1', role: 'PROJECT_HEAD' };
const ADMIN = { userId: 'admin-1', role: 'ADMIN' };
const SALES = { userId: 'sales-1', role: 'SALES' };
const AT = '2026-09-08T09:00:00.000Z';
const AT2 = '2026-09-08T09:05:00.000Z';

const seed = () => seedFromCatalog(catalog, { at: AT });

describe('packConfig — seed from the owner catalog', () => {
  it('schema + version 1 approved + version 2 draft, identical configs', () => {
    const s = seed();
    assert.equal(s.schema, PACK_CONFIG_SCHEMA);
    assert.equal(s.approved.version, 1);
    assert.equal(s.approved.approvedBy, 'SEED_FROM_CATALOG');
    assert.equal(s.draft.version, 2);
    assert.equal(s.draft.status, DRAFT_STATUS.DRAFT);
    assert.deepEqual(approvedConfig(s), draftConfig(s));
    assert.equal(s.history.length, 1);
  });

  it('every CONFIG_SECTION exists on the seeded config', () => {
    const c = approvedConfig(seed());
    for (const k of CONFIG_SECTIONS) assert.ok(c[k] != null, `section ${k} present`);
  });

  it('templates carry salesSwap / alternatives / defaults on every slot; defaults follow DEFAULT_SALES_SWAP', () => {
    const c = approvedConfig(seed());
    for (const [sys, t] of Object.entries(c.bomTemplates)) {
      for (const slot of t.slots) {
        assert.equal(typeof slot.salesSwap, 'boolean', `${sys}.${slot.category}.salesSwap boolean`);
        assert.ok(Array.isArray(slot.alternatives), `${sys}.${slot.category}.alternatives array`);
        assert.equal(typeof slot.defaults, 'object');
        assert.equal(slot.salesSwap, DEFAULT_SALES_SWAP.includes(slot.category), `${sys}.${slot.category} salesSwap default`);
      }
    }
    // Battery is never a Sales swap by default (owner: PH sets battery + MCCB rating).
    const hyb = c.bomTemplates.hybrid?.slots.find(s => s.category === 'battery');
    if (hyb) assert.equal(hyb.salesSwap, false);
  });

  it('transport: 100 km base, one vehicle ACE @ ₹35/km (owner D3) unless the catalog already lists vehicles', () => {
    const tc = approvedConfig(seed()).transportConfig;
    assert.equal(tc.baseDistanceKm, catalog.transportConfig?.baseDistanceKm ?? 100);
    assert.ok(tc.vehicles.length >= 1);
    assert.equal(tc.vehicles[0].vehicleType, 'ACE');
    assert.equal(tc.vehicles[0].ratePerKm, 35);
  });

  it('GST composite 8.9 (D2) and PACK_MARKET_RATE pricing mode (D4)', () => {
    const c = approvedConfig(seed());
    assert.equal(c.gst.ratePct, 8.9);
    assert.equal(c.gst.regime, 'SOLAR_70_30_COMPOSITE');
    assert.equal(c.pricing.mode, PRICING_MODE.PACK_MARKET_RATE);
  });

  it('seeded future-ready pairs keep the same phase on both sides', () => {
    const c = approvedConfig(seed());
    for (const p of c.futureUpgrade.pairs) {
      const t = c.bomTemplates[p.systemType];
      const ph = (k) => ((t.threePhase || []).includes(String(k)) ? '3P' : '1P');
      assert.equal(ph(p.panelSize), ph(p.systemSize), `${p.systemType} ${p.panelSize}→${p.systemSize} same phase`);
    }
  });

  it('requires a caller-supplied timestamp (no clock in the lib)', () => {
    assert.throws(() => seedFromCatalog(catalog, { at: null }), e => e.code === PACK_CONFIG_ERROR.MISSING_TIMESTAMP);
  });

  it('the seed does not mutate the catalog object', () => {
    const before = JSON.stringify(catalog.bomTemplates);
    seed();
    assert.equal(JSON.stringify(catalog.bomTemplates), before);
  });
});

describe('packConfig — draft editing (RBAC + validation)', () => {
  it('PH may edit a section; Sales may not', () => {
    const s = seed();
    const rates = { ...draftConfig(s).marketRates, ongrid_base: { ...(draftConfig(s).marketRates.ongrid_base || {}), '3': 180000 } };
    const s2 = updateDraftSection(s, { actor: PH, section: 'marketRates', value: rates, at: AT2, note: 'test' });
    assert.equal(draftConfig(s2).marketRates.ongrid_base['3'], 180000);
    assert.equal(approvedConfig(s2).marketRates.ongrid_base?.['3'], approvedConfig(s).marketRates.ongrid_base?.['3'], 'approved untouched');
    assert.equal(s2.draft.updatedBy, 'ph-1');
    assert.equal(s2.draft.changeLog.at(-1).section, 'marketRates');
    assert.throws(() => updateDraftSection(s, { actor: SALES, section: 'marketRates', value: rates, at: AT2 }), e => e.name === 'RbacError');
  });

  it('Admin may edit (COMMERCIAL_CONFIG_EDIT fallback)', () => {
    const s = seed();
    const s2 = updateDraftSection(s, { actor: ADMIN, section: 'gst', value: { regime: 'SOLAR_70_30_COMPOSITE', ratePct: 8.9 }, at: AT2 });
    assert.equal(s2.draft.changeLog.at(-1).by, 'admin-1');
  });

  it('does not mutate the input store (pure)', () => {
    const s = seed();
    const snap = JSON.stringify(s);
    updateDraftSection(s, { actor: PH, section: 'costs', value: { ...draftConfig(s).costs, office: 1 }, at: AT2 });
    assert.equal(JSON.stringify(s), snap);
  });

  it('rejects unknown sections and bad values', () => {
    const s = seed();
    assert.throws(() => updateDraftSection(s, { actor: PH, section: 'nope', value: {}, at: AT2 }), e => e.code === PACK_CONFIG_ERROR.INVALID_SECTION);
    assert.throws(() => updateDraftSection(s, { actor: PH, section: 'marketRates', value: { ongrid_base: { '3': -1 } }, at: AT2 }), e => e.code === PACK_CONFIG_ERROR.INVALID_VALUE);
    assert.throws(() => updateDraftSection(s, { actor: PH, section: 'marketRates', value: { ongrid_base: { '3': 'abc' } }, at: AT2 }), e => e.code === PACK_CONFIG_ERROR.INVALID_VALUE);
    assert.throws(() => updateDraftSection(s, { actor: PH, section: 'installationMatrix', value: { '3': { flat: -5 } }, at: AT2 }), e => e.code === PACK_CONFIG_ERROR.INVALID_VALUE);
    assert.throws(() => updateDraftSection(s, { actor: PH, section: 'transportConfig', value: { baseDistanceKm: 100, vehicles: [] }, at: AT2 }), e => e.code === PACK_CONFIG_ERROR.INVALID_VALUE);
    assert.throws(() => updateDraftSection(s, { actor: PH, section: 'gst', value: { ratePct: 120 }, at: AT2 }), e => e.code === PACK_CONFIG_ERROR.INVALID_VALUE);
    assert.throws(() => updateDraftSection(s, { actor: PH, section: 'pricing', value: { mode: 'WHATEVER' }, at: AT2 }), e => e.code === PACK_CONFIG_ERROR.INVALID_VALUE);
    assert.throws(() => updateDraftSection(s, { actor: PH, section: 'bomTemplates', value: { ongrid: { sizes: {}, slots: [{}] } }, at: AT2 }), e => e.code === PACK_CONFIG_ERROR.INVALID_VALUE);
    assert.throws(() => updateDraftSection(s, { actor: PH, section: 'structureTemplates', value: { flatRoof: { items: [{ name: 'x', type: 'tube' }] } }, at: AT2 }), e => e.code === PACK_CONFIG_ERROR.INVALID_VALUE);
    assert.throws(() => updateDraftSection(s, { actor: PH, section: 'costs', value: draftConfig(s).costs, at: null }), e => e.code === PACK_CONFIG_ERROR.MISSING_TIMESTAMP);
  });

  it('updateDraftTemplate patches one system type and adds a new kW size', () => {
    const s = seed();
    const t = draftConfig(s).bomTemplates.ongrid;
    const s2 = updateDraftTemplate(s, { actor: PH, systemType: 'ongrid', template: { sizes: { ...t.sizes, '15': '15 kW' }, threePhase: [...(t.threePhase || []), '15'] }, at: AT2 });
    assert.equal(draftConfig(s2).bomTemplates.ongrid.sizes['15'], '15 kW');
    assert.deepEqual(draftConfig(s2).bomTemplates.ongrid.slots, t.slots, 'slots preserved');
    assert.equal(approvedConfig(s2).bomTemplates.ongrid.sizes['15'], undefined, 'not approved yet — Sales cannot see 15 kW');
    assert.deepEqual(approvedSizes(approvedConfig(s2), 'ongrid').map(x => x.key), Object.keys(t.sizes));
    assert.ok(approvedSizes(draftConfig(s2), 'ongrid').some(x => x.key === '15' && x.phase === '3P'));
  });
});

describe('packConfig — submit / approve / reject / reset lifecycle', () => {
  const edited = () => {
    const s = seed();
    return updateDraftSection(s, { actor: PH, section: 'costs', value: { ...draftConfig(s).costs, office: 1234 }, at: AT2 });
  };

  it('submit requires changes and PACKAGE_SUBMIT', () => {
    const s = seed();
    assert.throws(() => submitDraft(s, { actor: PH, at: AT2 }), e => e.code === PACK_CONFIG_ERROR.NO_CHANGES);
    const e = edited();
    assert.throws(() => submitDraft(e, { actor: SALES, at: AT2 }), err => err.name === 'RbacError');
    assert.throws(() => submitDraft(e, { actor: ADMIN, at: AT2 }), err => err.name === 'RbacError', 'Admin approves, PH submits');
    const sub = submitDraft(e, { actor: PH, at: AT2 });
    assert.equal(sub.draft.status, DRAFT_STATUS.SUBMITTED);
    assert.equal(sub.draft.submittedBy, 'ph-1');
    assert.throws(() => submitDraft(sub, { actor: PH, at: AT2 }), err => err.code === PACK_CONFIG_ERROR.ALREADY_SUBMITTED);
  });

  it('approve: Admin only, SUBMITTED only; new approved version, fresh draft, history grows', () => {
    const sub = submitDraft(edited(), { actor: PH, at: AT2 });
    assert.throws(() => approveDraft(edited(), { actor: ADMIN, at: AT2 }), e => e.code === PACK_CONFIG_ERROR.NOT_SUBMITTED);
    assert.throws(() => approveDraft(sub, { actor: PH, at: AT2 }), e => e.name === 'RbacError');
    const ap = approveDraft(sub, { actor: ADMIN, at: AT2, note: 'ok' });
    assert.equal(ap.approved.version, 2);
    assert.equal(ap.approved.approvedBy, 'admin-1');
    assert.equal(approvedConfig(ap).costs.office, 1234);
    assert.equal(ap.draft.version, 3);
    assert.equal(ap.draft.status, DRAFT_STATUS.DRAFT);
    assert.deepEqual(draftConfig(ap), approvedConfig(ap));
    assert.equal(ap.history.length, 2);
    assert.equal(ap.history.at(-1).version, 2);
    // Prior approved snapshot is not mutated by the promotion.
    assert.equal(approvedConfig(sub).costs.office, approvedConfig(seed()).costs.office);
  });

  it('approveDraftDirect: Admin publishes its own DRAFT edits in one step, audit-visible; PH / no-changes / Sales refused', () => {
    const e = edited();
    assert.throws(() => approveDraftDirect(seed(), { actor: ADMIN, at: AT2 }), x => x.code === PACK_CONFIG_ERROR.NO_CHANGES);
    assert.throws(() => approveDraftDirect(e, { actor: PH, at: AT2 }), x => x.name === 'RbacError', 'PH still submits, never approves');
    assert.throws(() => approveDraftDirect(e, { actor: SALES, at: AT2 }), x => x.name === 'RbacError');
    const ap = approveDraftDirect(e, { actor: ADMIN, at: AT2 });
    assert.equal(ap.approved.version, 2);
    assert.equal(ap.approved.approvedBy, 'admin-1');
    assert.equal(ap.approved.submittedBy, 'admin-1', 'direct approve records the Admin as submitter too');
    assert.equal(ap.approved.note, 'direct approve by Admin');
    assert.equal(approvedConfig(ap).costs.office, 1234);
    assert.equal(ap.draft.status, DRAFT_STATUS.DRAFT);
    assert.equal(ap.draft.version, 3);
    // A PH-submitted draft goes through the normal approve path (submitter stays PH).
    const sub = submitDraft(edited(), { actor: PH, at: AT2 });
    const ap2 = approveDraftDirect(sub, { actor: ADMIN, at: AT2, note: 'ok' });
    assert.equal(ap2.approved.submittedBy, 'ph-1');
    assert.equal(ap2.approved.note, 'ok');
  });

  it('editing a SUBMITTED draft withdraws it back to DRAFT', () => {
    const sub = submitDraft(edited(), { actor: PH, at: AT2 });
    const w = updateDraftSection(sub, { actor: PH, section: 'costs', value: { ...draftConfig(sub).costs, office: 99 }, at: AT2 });
    assert.equal(w.draft.status, DRAFT_STATUS.DRAFT);
  });

  it('reject: Admin only; back to DRAFT with the reason logged', () => {
    const sub = submitDraft(edited(), { actor: PH, at: AT2 });
    assert.throws(() => rejectDraft(sub, { actor: PH, at: AT2, reason: 'x' }), e => e.name === 'RbacError');
    const rj = rejectDraft(sub, { actor: ADMIN, at: AT2, reason: 'rate too low' });
    assert.equal(rj.draft.status, DRAFT_STATUS.DRAFT);
    assert.equal(rj.draft.rejectionReason, 'rate too low');
    assert.equal(rj.approved.version, 1);
    assert.equal(draftConfig(rj).costs.office, 1234, 'PH edits preserved for correction');
  });

  it('reset discards draft edits back to approved', () => {
    const r = resetDraft(edited(), { actor: PH, at: AT2 });
    assert.deepEqual(draftConfig(r), approvedConfig(r));
    assert.equal(r.draft.version, 2);
    assert.throws(() => resetDraft(edited(), { actor: SALES, at: AT2 }), e => e.name === 'RbacError');
  });

  it('describeStore reports changed sections without leaking whole configs', () => {
    const d = describeStore(edited());
    assert.deepEqual(d.draft.changedSections, ['costs']);
    assert.equal(d.approved.version, 1);
    assert.equal(d.draft.config, undefined);
    assert.equal(d.approved.config, undefined);
  });
});

describe('packConfig — shared vocabulary', () => {
  it('marketRateKey matches the owner tool keys', () => {
    assert.equal(marketRateKey({ systemType: 'ongrid', tier: 'base' }), 'ongrid_base');
    assert.equal(marketRateKey({ systemType: 'hybrid', tier: 'value', batteryConfig: 1 }), 'hybrid_value_1');
    assert.equal(marketRateKey({ systemType: 'hybrid', tier: 'value' }), 'hybrid_value_0');
    assert.equal(marketRateKey({ systemType: 'ongrid', tier: 'premium', futureSystemSize: '5sp' }), 'ongrid_premium_up5sp');
    assert.equal(marketRateKey({ systemType: 'hybrid', tier: 'base', batteryConfig: 2, futureSystemSize: '5' }), 'hybrid_base_2_up5');
  });

  it('roof vocabulary maps to the v1 structure template keys', () => {
    assert.deepEqual([...ROOF_TYPES], ['FLAT', 'SHEET', 'ELEVATED']);
    assert.deepEqual(ROOF_TO_STRUCTURE_KEY, { FLAT: 'flatRoof', SHEET: 'sheetRoof', ELEVATED: 'elevated' });
    const st = approvedConfig(seed()).structureTemplates;
    for (const k of Object.values(ROOF_TO_STRUCTURE_KEY)) assert.ok(st[k], `structureTemplates.${k} present in owner data`);
  });

  it('futurePairsFor filters to approved sizes of the same phase', () => {
    const c = approvedConfig(seed());
    const p3 = futurePairsFor(c, 'ongrid', '3');
    assert.ok(p3.some(p => p.systemSize === '5sp'));
    assert.ok(!p3.some(p => p.systemSize === '5tp'), '3 kW (1P) never pairs with a 3P system size');
    assert.deepEqual(futurePairsFor(c, 'ongrid', '10'), []);
    assert.deepEqual(futurePairsFor(c, 'upgrade', '3'), []);
  });
});
