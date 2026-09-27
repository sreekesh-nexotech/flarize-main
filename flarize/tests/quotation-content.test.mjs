// P1 (2026-09-13) — quotation content store: fit guard, lifecycle, appliance
// profiles, and the payload snapshot that pages 3/8/9/10/11 print from.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../src/lib/quotationContent.js';
import { buildQuotationPayload } from '../src/lib/quotationPayload.js';
import { renderPage3, renderPage9Timeline, renderPage10Terms, renderPage11Terms, hasDocumentContent } from '../public/lib/quotationDocument.js';

const seed = JSON.parse(readFileSync('data/quotation-content.json', 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

describe('fit guard', () => {
  test('shipped seed fits every limit', () => {
    assert.deepEqual(C.validateContent(seed.published.content, { dailyGenPerKw: 4 }), []);
  });
  test('over-long clause, too many clauses, over-generation profile are all rejected with paths', () => {
    const c = clone(seed.published.content);
    c.terms[0].body.en = 'x'.repeat(C.LIMITS.terms.body.en + 1);
    while (c.terms.length < C.LIMITS.terms.max + 1) c.terms.push(clone(c.terms[1]));
    c.appliances.profiles['3'][5].qty = 4;   // 4 ACs on 3 kW
    const errs = C.validateContent(c, { dailyGenPerKw: 4 });
    const codes = errs.map(e => e.code);
    assert.ok(codes.includes('TOO_LONG')); assert.ok(codes.includes('TOO_MANY')); assert.ok(codes.includes('OVER_GENERATION'));
    assert.ok(errs.some(e => e.path === 'terms[1].body.en'));
  });
  test('Malayalam has its own (larger) budgets and both languages are required', () => {
    assert.ok(C.LIMITS.terms.body.ml > C.LIMITS.terms.body.en);
    const c = clone(seed.published.content); c.timeline[0].title.ml = '';
    assert.ok(C.validateContent(c).some(e => e.path === 'timeline[1].title.ml' && e.code === 'REQUIRED'));
  });
  test('unknown appliance in a profile and duplicate ids are rejected', () => {
    const c = clone(seed.published.content);
    c.appliances.profiles['5'].push({ id: 'nope', qty: 1, hours: 1 });
    c.appliances.master.push(clone(c.appliances.master[0]));
    const codes = C.validateContent(c).map(e => e.code);
    assert.ok(codes.includes('UNKNOWN_APPLIANCE')); assert.ok(codes.includes('DUPLICATE'));
  });
});

describe('lifecycle', () => {
  test('saveDraft refuses invalid content; publish bumps version and resets draft', () => {
    const store = C.createEmptyStore(clone(seed.published.content));
    const bad = clone(store.draft.content); bad.terms = [];
    assert.throws(() => C.saveDraft(store, bad, { userId: 'u' }), (e) => e.code === 'CONTENT_INVALID' && e.errors.length > 0);
    const good = clone(store.draft.content); good.terms[0].title.en = 'Warranty (edited)';
    C.saveDraft(store, good, { userId: 'ph' });
    assert.equal(C.describeStore(store).draft.unpublishedChanges, true);
    C.publishDraft(store, { userId: 'ph' });
    assert.equal(store.published.version, 2);
    assert.equal(store.published.content.terms[0].title.en, 'Warranty (edited)');
    assert.equal(C.describeStore(store).draft.unpublishedChanges, false);
    assert.equal(store.draft.version, 3);
  });
});

describe('appliance profiles', () => {
  const c = seed.published.content;
  test('profile picked = largest band <= kW; units = qty×W×h/1000 rounded to 0.1', () => {
    assert.equal(C.profileKeyForKw(c.appliances.profiles, 3), '3');
    assert.equal(C.profileKeyForKw(c.appliances.profiles, 6), '5');
    assert.equal(C.profileKeyForKw(c.appliances.profiles, 12), '10');
    assert.equal(C.profileKeyForKw(c.appliances.profiles, 2), '3');
    const rows = C.materialiseRows(c, [{ id: 'ac', qty: 2, hours: 5 }]);
    assert.equal(rows[0].units, 12);
    assert.equal(C.totalUnits(rows), 12);
  });
  test('every shipped profile stays under 95% of generation (owner: 3 kW house < 12 units)', () => {
    for (const [kw, rows] of Object.entries(c.appliances.profiles)) {
      const t = C.totalUnits(C.materialiseRows(c, rows));
      assert.ok(t <= Math.round(Number(kw) * 4 * 0.95 * 10) / 10, `${kw} kW → ${t}`);
    }
    assert.ok(C.totalUnits(C.materialiseRows(c, c.appliances.profiles['3'])) < 12);
  });
});

describe('payload snapshot + display-only renderer', () => {
  const base = {
    quotation: { quotationNumber: 'GR-TEST-0001', quotationVersion: 1, quotationDate: '2026-09-13', quotationLanguage: 'ml', status: 'ISSUED' },
    customer: { name: 'Test', phone: '9' }, system: { systemType: 'ongrid', systemSizeKw: 3, phase: '1P', packageTier: 'premium' },
    energyProfileResult: { available: true, dailyGenerationLow: 10.8, dailyGenerationHigh: 13.2, monthlyKsebValueLow: 3065, monthlyKsebValueHigh: 3746 },
    documentContent: { version: seed.published.version, content: seed.published.content },
  };
  test('Sales rows are frozen into applianceUsage; Home Uses = total; surplus derived in the payload', () => {
    const p = buildQuotationPayload({ ...base, applianceRows: [{ id: 'ac', qty: 1, hours: 5 }, { id: 'ev_2w', qty: 1, hours: 1 }] });
    assert.equal(p.content.available, true);
    assert.equal(p.content.value.version, seed.published.version);
    assert.equal(p.applianceUsage.source, 'SALES_APPLIANCE_ROWS');
    assert.equal(p.applianceUsage.value.totalDailyUsage, 7);
    assert.equal(p.applianceUsage.value.surplusExportedLow, 3.8);
    assert.equal(p.applianceUsage.value.surplusExportedHigh, 6.2);
    assert.ok(Object.isFrozen(p.content.value.content));
    assert.equal(p.content.value.derived.ksebRefundAmount, 2400);
    assert.ok(p.content.value.derived.termsPage10Count.en >= 8 && p.content.value.derived.termsPage10Count.en <= 12);
  });
  test('no Sales rows → Project Head profile for the kW', () => {
    const p = buildQuotationPayload({ ...base, applianceRows: null });
    assert.equal(p.applianceUsage.value.profileKey, '3');
    assert.ok(p.applianceUsage.value.totalDailyUsage < 12);
  });
  test('pages 3/9/10/11 render Malayalam from the snapshot; every clause printed once across 10+11', () => {
    const p = buildQuotationPayload({ ...base, applianceRows: null });
    assert.equal(hasDocumentContent(p), true);
    const p3 = renderPage3(p), p9 = renderPage9Timeline(p), p10 = renderPage10Terms(p), p11 = renderPage11Terms(p);
    assert.ok(p3.includes('qc-ml') && p3.includes('lang="ml"'));
    assert.ok(p3.includes('നിങ്ങളുടെ വീടിന്റെ പ്രതിദിന വൈദ്യുതി ഉപയോഗം'), 'page 3 ML table heading');
    assert.ok(p9.includes('₹2,400'), 'KSEB refund from payload');
    assert.ok(p9.includes('ഞങ്ങൾ കൈകാര്യം ചെയ്യുന്നത്'));
    const all = p10 + p11;
    for (let i = 1; i <= 19; i++) assert.ok(all.includes(`<b>${i}. `), `clause ${i} printed`);
    assert.ok(!p10.includes('<b>19. ') || !p11.includes('<b>19. '), 'clause 19 printed once');
    assert.ok(p10.includes('data-document-order="10"') && p11.includes('data-document-order="11"'));
  });
  test('English edition and legacy (no content) edition both still render', () => {
    const en = buildQuotationPayload({ ...base, quotation: { ...base.quotation, quotationLanguage: 'en' }, applianceRows: null });
    assert.ok(renderPage3(en).includes('Your Daily Appliance Usage'));
    const legacy = buildQuotationPayload({ ...base, documentContent: null, applianceRows: null });
    assert.equal(hasDocumentContent(legacy), false);
    assert.ok(renderPage3(legacy).includes('q-page-03.jpg'), 'legacy artwork path kept for old quotations');
    assert.ok(renderPage10Terms(legacy).includes('q-page-10.jpg'));
  });
});
