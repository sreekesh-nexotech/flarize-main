// PART H — PAGE 8 MOCK CALCULATION DATA TESTS.
//
// These tests verify Page 8 with populated mock calculation data.
// The mock providers (mockCalculationProviders.js) supply deterministic
// TEST_ONLY results that the payload assembler wraps into the quotation
// payload. The renderer draws supplied values — it never calculates.
//
// DO NOT MODIFY existing tests in phase3-quotation-page8.test.mjs.
// Those test the blocked treatment. These test the populated treatment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as D from '../public/lib/quotationDocument.js';
import {
  mockSavingsResult, mockSubsidyResult, mockFinancingResult,
  MOCK_SOURCE, MOCK_STATUS,
} from '../src/lib/mockCalculationProviders.js';

const RENDERER_SRC = readFileSync('public/lib/quotationDocument.js', 'utf8');

// ---------------------------------------------------------------------------
// PAYLOAD HELPERS — build what the renderer expects, using mock providers
// ---------------------------------------------------------------------------

/** Residential payload WITH mock calculation data. */
function residentialPayload(overrides = {}) {
  const sr = mockSavingsResult({ systemSizeKw: 5, currentBillAmount: 6000 });
  const sub = mockSubsidyResult({ systemSizeKw: 5 });
  const fin = mockFinancingResult({ grossQuotationAmount: 285000, subsidyAmount: 78000 });
  return {
    customer: { customerId: 'C-R1', customerName: 'Resi Tester', address: '10 Solar Lane',
      pincode: '682001', phone: '9000000001', currentBillAmount: 6000, currentBillCycle: 'monthly' },
    system: { systemType: 'ONGRID', systemSizeKw: 5, phase: 'SINGLE', packageTier: 'VALUE', roofType: 'FLAT' },
    pricing: {
      available: true, source: 'COMMERCIAL_SNAPSHOT',
      customer: { sellingPriceBeforeGST: 269512, gstAmount: 23987, customerTotalIncludingGST: 293499 },
    },
    subsidy: {
      available: true, source: MOCK_SOURCE, status: MOCK_STATUS,
      treatment: 'ENGINE_RESULT',
      value: { subsidyAmount: sub.subsidyAmount, schemeName: sub.schemeName,
               source: sub.source, status: sub.status },
    },
    savings: {
      available: true, source: MOCK_SOURCE, status: MOCK_STATUS,
      value: { ...sr }, dependency: null, reason: null,
    },
    financing: {
      available: true, source: MOCK_SOURCE, status: MOCK_STATUS,
      value: { ...fin }, dependency: null, reason: null,
    },
    company: { available: false, dependency: 'DECISION_C7_COMPANY_IDENTITY', reason: 'C7 PENDING.' },
    ...overrides,
  };
}

/** Commercial payload — subsidy NOT_QUOTED, savings/financing blocked. */
function commercialPayload() {
  return {
    customer: { customerId: 'C-COM1', customerName: 'Biz Corp', address: '1 Industry Blvd',
      pincode: '600001', phone: '9888888888', currentBillAmount: 25000, currentBillCycle: 'monthly' },
    system: { systemType: 'ONGRID', systemSizeKw: 10, phase: 'THREE', packageTier: 'VALUE', roofType: 'FLAT' },
    pricing: {
      available: true, source: 'COMMERCIAL_SNAPSHOT',
      customer: { sellingPriceBeforeGST: 520000, gstAmount: 46280, customerTotalIncludingGST: 566280 },
    },
    subsidy: { available: false, value: null, treatment: 'NOT_QUOTED',
      dependency: 'SUBSIDY_ENGINE', reason: 'NOT_QUOTED' },
    savings: { available: false, dependency: 'SAVINGS_ENGINE', reason: 'No Savings Engine.' },
    financing: { available: false, dependency: 'FINANCE_ENGINE', reason: 'No Finance Engine.' },
    company: { available: false, dependency: 'DECISION_C7_COMPANY_IDENTITY', reason: 'C7 PENDING.' },
  };
}

/** Residential with 10 kW system — different mock values. */
function residentialPayload10kw() {
  const sr = mockSavingsResult({ systemSizeKw: 10 });
  const sub = mockSubsidyResult({ systemSizeKw: 10 });
  const fin = mockFinancingResult({ grossQuotationAmount: 950000, subsidyAmount: 78000 });
  return {
    customer: { customerId: 'C-R2', customerName: 'Big Roof Owner', address: '99 Mega Rd',
      pincode: '682002', phone: '9000000002', currentBillAmount: 12000, currentBillCycle: 'monthly' },
    system: { systemType: 'ONGRID', systemSizeKw: 10, phase: 'THREE', packageTier: 'PREMIUM', roofType: 'FLAT' },
    pricing: {
      available: true, source: 'COMMERCIAL_SNAPSHOT',
      customer: { sellingPriceBeforeGST: 520000, gstAmount: 46280, customerTotalIncludingGST: 566280 },
    },
    subsidy: {
      available: true, source: MOCK_SOURCE, status: MOCK_STATUS,
      treatment: 'ENGINE_RESULT',
      value: { subsidyAmount: sub.subsidyAmount, schemeName: sub.schemeName,
               source: sub.source, status: sub.status },
    },
    savings: {
      available: true, source: MOCK_SOURCE, status: MOCK_STATUS,
      value: { ...sr }, dependency: null, reason: null,
    },
    financing: {
      available: true, source: MOCK_SOURCE, status: MOCK_STATUS,
      value: { ...fin }, dependency: null, reason: null,
    },
    company: { available: false, dependency: 'DECISION_C7_COMPANY_IDENTITY', reason: 'C7 PENDING.' },
  };
}

// =============================================================================
// 1. Page 8 renders with mock calculation data
// =============================================================================
test('1 — Page 8 renders with mock calculation data', () => {
  const html = D.renderPage8(residentialPayload());
  assert.ok(html.includes('SAVINGS_AND_PAYMENT'));
  assert.ok(html.includes('Savings Over Time'));
  // Has actual data, not just blocked treatment — the mock monthly savings figure
  // is drawn straight from the supplied payload, not recalculated.
  assert.ok(html.includes('4,000'), 'mock monthly savings figure renders');
});

// =============================================================================
// 2. Mock metadata says TEST_ONLY
// =============================================================================
test('2 — mock metadata says TEST_ONLY', () => {
  const sr = mockSavingsResult();
  assert.equal(sr.source, MOCK_SOURCE);
  assert.equal(sr.status, MOCK_STATUS);
  const sub = mockSubsidyResult();
  assert.equal(sub.source, MOCK_SOURCE);
  assert.equal(sub.status, MOCK_STATUS);
  const fin = mockFinancingResult();
  assert.equal(fin.source, MOCK_SOURCE);
  assert.equal(fin.status, MOCK_STATUS);
});

// =============================================================================
// 3. System size is payload-driven
// =============================================================================
test('3 — system size is payload-driven', () => {
  const fields5 = D.savingsPageFields(residentialPayload());
  const sz5 = fields5.find(f => f.label === 'System Size');
  assert.ok(sz5.available);
  assert.equal(sz5.value, '5 kW');

  const fields10 = D.savingsPageFields(residentialPayload10kw());
  const sz10 = fields10.find(f => f.label === 'System Size');
  assert.ok(sz10.available);
  assert.equal(sz10.value, '10 kW');
});

// =============================================================================
// 4. Setup cost is payload-driven
// =============================================================================
test('4 — total investment is payload-driven', () => {
  const fields = D.savingsPageFields(residentialPayload());
  const inv = fields.find(f => f.label === 'Total Investment');
  assert.ok(inv.available);
  assert.ok(inv.value.includes('2,93,499'));
});

// =============================================================================
// 5. Subsidy is payload-driven
// =============================================================================
test('5 — subsidy is payload-driven', () => {
  const fields = D.savingsPageFields(residentialPayload());
  const sub = fields.find(f => f.label === 'Subsidy');
  assert.ok(sub.available);
  assert.ok(sub.value.includes('78,000'));
});

// =============================================================================
// 6. Net investment is payload-driven (total investment field present)
// =============================================================================
test('6 — total investment available in fields', () => {
  // Total Investment is available in savingsPageFields but not rendered
  // in the approved Page 8 design (which focuses on savings, not investment).
  const fields = D.savingsPageFields(residentialPayload());
  const inv = fields.find(f => f.label === 'Total Investment');
  assert.ok(inv.available);
  assert.ok(inv.value.includes('2,93,499'));
});

// =============================================================================
// 7. EMI is payload-driven
// =============================================================================
test('7 — EMI is payload-driven', () => {
  const fields = D.savingsPageFields(residentialPayload());
  const emi = fields.find(f => f.label === 'EMI');
  assert.ok(emi.available);
  assert.ok(emi.value.includes('1,959'));
  assert.ok(emi.value.includes('/mo'));
});

// =============================================================================
// 8. Annual generation is payload-driven
// =============================================================================
test('8 — annual generation is payload-driven', () => {
  const fields = D.savingsPageFields(residentialPayload());
  const gen = fields.find(f => f.label === 'Annual Generation');
  assert.ok(gen.available);
  assert.ok(gen.value.includes('7,300'));
  assert.ok(gen.value.includes('kWh'));
});

// =============================================================================
// 9. Annual savings (monthly range) is payload-driven
// =============================================================================
test('9 — monthly savings range is payload-driven', () => {
  const fields = D.savingsPageFields(residentialPayload());
  const ms = fields.find(f => f.label === 'Monthly Savings');
  assert.ok(ms.available);
  assert.ok(ms.value.includes('4,000'));
  assert.ok(ms.value.includes('4,500'));
});

// =============================================================================
// 10. Lifetime savings is payload-driven
// =============================================================================
test('10 — lifetime savings is payload-driven', () => {
  const fields = D.savingsPageFields(residentialPayload());
  const ls = fields.find(f => f.label === '25-Year Net Savings');
  assert.ok(ls.available);
  assert.ok(ls.value.includes('15,60,000'));
});

// =============================================================================
// 11. ROI/payback (return period) is payload-driven
// =============================================================================
test('11 — return period is payload-driven', () => {
  const fields = D.savingsPageFields(residentialPayload());
  const rp = fields.find(f => f.label === 'Return Period');
  assert.ok(rp.available);
  assert.equal(rp.value, '42 months');
});

// =============================================================================
// 12. Graph uses supplied points
// =============================================================================
test('12 — graph uses supplied points', () => {
  const html = D.renderPage8(residentialPayload());
  assert.ok(html.includes('data-graph-rendered="true"'));
  assert.ok(html.includes('Cumulative Electricity Costs Over 25 Years'));
  // SVG has line chart (polyline)
  assert.ok(html.includes('<polyline'));
  assert.ok(html.includes('KSEB Costs'));
  assert.ok(html.includes('Solar + Bills'));
});

// =============================================================================
// 13. Renderer performs no financial calculations
// =============================================================================
test('13 — renderer performs no financial calculations', () => {
  // No EMI formula P*r*(1+r)^n / ((1+r)^n-1)
  assert.ok(!RENDERER_SRC.includes('Math.pow'));
  assert.ok(!/\(1\s*\+\s*r\)\s*\*\*/.test(RENDERER_SRC));
  // No compound interest — the renderer may READ the engine's interestRatePct
  // for the approved "EMI (N yrs @ R%)" label, never compute with a rate.
  assert.ok(!/annualRate|monthlyRate|interestRate(?!Pct)/i.test(RENDERER_SRC));
  assert.ok(!/interestRatePct\s*[*/+\-]/.test(RENDERER_SRC), 'no arithmetic on the rate');
});

// =============================================================================
// 14. Renderer contains no EMI formula
// =============================================================================
test('14 — renderer contains no EMI formula', () => {
  // No EMI = P*r*(1+r)^n pattern or equivalent
  assert.ok(!/P\s*\*\s*r\s*\*/.test(RENDERER_SRC));
  assert.ok(!/principal\s*\*/i.test(RENDERER_SRC));
  assert.ok(!RENDERER_SRC.includes('Math.pow'));
});

// =============================================================================
// 15. Renderer contains no subsidy formula
// =============================================================================
test('15 — renderer contains no subsidy formula', () => {
  // Catches subsidy formula variables. Standalone 'MNRE' (marketing badge) is
  // not a formula — require it adjacent to rate/slab/subsidy/calculation context.
  assert.ok(!/subsidySlab|subsidyRate|mnreRate|mnreSlab|mnreSubsidy|mnre.*(?:slab|rate|calc)/i.test(RENDERER_SRC));
  assert.ok(!/systemSizeKw\s*[<>=]/i.test(RENDERER_SRC));
});

// =============================================================================
// 16. Renderer contains no savings formula
// =============================================================================
test('16 — renderer contains no savings formula', () => {
  assert.ok(!/unitRate\s*\*/i.test(RENDERER_SRC));
  assert.ok(!/tariffRate\s*\*/i.test(RENDERER_SRC));
  // No multiplication using generation as a variable (skip JSDoc comments)
  const codeLines = RENDERER_SRC.split('\n').filter(l => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'));
  const codeOnly = codeLines.join('\n');
  assert.ok(!/generation\s*\*\s*\w/i.test(codeOnly), 'no generation * operand in code');
  assert.ok(!/degradation\s*[=*(]/i.test(codeOnly), 'no degradation variable in code');
});

// =============================================================================
// 17. Renderer contains no Math.random()
// =============================================================================
test('17 — renderer contains no Math.random()', () => {
  assert.ok(!RENDERER_SRC.includes('Math.random'));
});

// =============================================================================
// 18. Renderer contains no Date.now()
// =============================================================================
test('18 — renderer contains no Date.now()', () => {
  assert.ok(!RENDERER_SRC.includes('Date.now'));
  assert.ok(!RENDERER_SRC.includes('new Date'));
});

// =============================================================================
// 19. Commercial quotation contains no subsidy
// =============================================================================
test('19 — commercial quotation contains no subsidy', () => {
  const html = D.renderPage8(commercialPayload());
  assert.ok(!html.includes('78,000'));
  assert.ok(!html.includes('PM Surya Ghar'));
});

// =============================================================================
// 20. Commercial quotation contains no residential subsidy language
// =============================================================================
test('20 — commercial has no residential subsidy language', () => {
  const html = D.renderPage8(commercialPayload());
  assert.ok(!html.includes('PM Surya Ghar'));
  assert.ok(!html.includes('Surya Ghar'));
  // Subsidy row itself should not appear (isSubsidyOff removes it)
  // The word "Subsidy" should not appear as a visible data label with a value
});

// =============================================================================
// 21. Missing mock subsidy becomes BLOCKED
// =============================================================================
test('21 — missing subsidy becomes BLOCKED', () => {
  const p = residentialPayload({
    subsidy: { available: false, dependency: 'SUBSIDY_ENGINE', reason: 'No Subsidy Engine.' },
  });
  const fields = D.savingsPageFields(p);
  const sub = fields.find(f => f.label === 'Subsidy');
  assert.ok(!sub.available);
  assert.equal(sub.dependency, 'SUBSIDY_ENGINE');
  // Subsidy field exists in savingsPageFields but approved Page 8 design
  // does not render subsidy as a visible section — no data-blocked in HTML needed.
  const html = D.renderPage8(p);
  assert.ok(!html.includes('78,000'), 'blocked subsidy should not show amount');
});

// =============================================================================
// 22. Missing mock EMI becomes BLOCKED
// =============================================================================
test('22 — missing EMI becomes BLOCKED', () => {
  const p = residentialPayload({
    financing: { available: false, dependency: 'FINANCE_ENGINE', reason: 'No Finance Engine.' },
  });
  const fields = D.savingsPageFields(p);
  const emi = fields.find(f => f.label === 'EMI');
  assert.ok(!emi.available);
  assert.equal(emi.dependency, 'FINANCE_ENGINE');
});

// =============================================================================
// 23. Missing mock savings becomes BLOCKED
// =============================================================================
test('23 — missing savings becomes BLOCKED', () => {
  const p = residentialPayload({
    savings: { available: false, dependency: 'SAVINGS_ENGINE', reason: 'No Savings Engine.' },
  });
  const fields = D.savingsPageFields(p);
  const ms = fields.find(f => f.label === 'Monthly Savings');
  assert.ok(!ms.available);
  assert.equal(ms.dependency, 'SAVINGS_ENGINE');
  const gen = fields.find(f => f.label === 'Annual Generation');
  assert.ok(!gen.available);
});

// =============================================================================
// 24. Missing graph data becomes BLOCKED
// =============================================================================
test('24 — missing graph data becomes BLOCKED', () => {
  const sr = mockSavingsResult();
  // Remove graphPoints
  const noGraph = { ...sr, graphPoints: [] };
  const p = residentialPayload({
    savings: { available: true, source: MOCK_SOURCE, status: MOCK_STATUS,
      value: noGraph, dependency: null },
  });
  const fields = D.savingsPageFields(p);
  const graph = fields.find(f => f.label === 'Savings Graph Data');
  assert.ok(!graph.available);
  assert.equal(graph.dependency, 'SAVINGS_ENGINE');
});

// =============================================================================
// 25. No ₹0 fallback
// =============================================================================
test('25 — no ₹0 fallback anywhere', () => {
  // With missing savings
  const p = residentialPayload({
    savings: { available: false, dependency: 'SAVINGS_ENGINE', reason: 'No Savings Engine.' },
    financing: { available: false, dependency: 'FINANCE_ENGINE', reason: 'No Finance Engine.' },
    subsidy: { available: false, dependency: 'SUBSIDY_ENGINE', reason: 'No Subsidy Engine.' },
  });
  const html = D.renderPage8(p);
  // ₹0 should never appear as a standalone value
  assert.ok(!html.match(/₹0[^,.\d]/), 'should not contain bare ₹0 as value');
});

// =============================================================================
// 26. No artwork example values leak
// =============================================================================
test('26 — no artwork example values leak', () => {
  const html = D.renderPage8(residentialPayload());
  // These are the artwork example values — must not appear
  assert.ok(!html.includes('Sareena'));
  assert.ok(!html.includes('QUO-GR-AS-2025'));
  assert.ok(!html.includes('GSTIN'));
});

// =============================================================================
// 27. Internal cost/margin absent
// =============================================================================
test('27 — internal cost/margin absent', () => {
  const html = D.renderPage8(residentialPayload());
  assert.ok(!html.toLowerCase().includes('gross margin'));
  assert.ok(!html.toLowerCase().includes('cost price'));
  assert.ok(!html.toLowerCase().includes('landed cost'));
  assert.ok(!html.toLowerCase().includes('rate card'));
  assert.ok(!html.toLowerCase().includes('markup'));
});

// =============================================================================
// 28. Two different mock payloads produce different Page 8 output
// =============================================================================
test('28 — two different mock payloads produce different output', () => {
  const html5 = D.renderPage8(residentialPayload());
  const html10 = D.renderPage8(residentialPayload10kw());
  assert.notEqual(html5, html10);
  // 5kW shows monthly savings 4,000-4,500, 10kW shows 8,000-9,000
  assert.ok(html5.includes('4,000'));
  assert.ok(html10.includes('8,000'));
  // Different lifetime savings
  assert.ok(html5.includes('15,60,000'));
  assert.ok(html10.includes('31,20,000'));
});

// =============================================================================
// 29. No cross-customer leakage
// =============================================================================
test('29 — no cross-customer leakage', () => {
  const htmlR = D.renderPage8(residentialPayload());
  const htmlC = D.renderPage8(commercialPayload());
  // Residential customer name should not appear in commercial output
  assert.ok(!htmlC.includes('Resi Tester'));
  // Commercial customer name should not appear in residential output
  assert.ok(!htmlR.includes('Biz Corp'));
});

// =============================================================================
// 30. Page 1 tests pass (structural check)
// =============================================================================
test('30 — Page 1 still renders', () => {
  assert.equal(typeof D.renderPage1, 'function');
  assert.equal(D.PAGE_ONE.sectionName, 'COVER_AND_PROPOSAL_DETAILS');
  const p1 = {
    customer: { customerId: 'C-X', customerName: 'X Tester', address: '1 X', pincode: '111111', phone: '9111111111' },
    system: { systemType: 'ONGRID', systemSizeKw: 5 },
    pricing: { available: true, source: 'COMMERCIAL_SNAPSHOT', customer: { sellingPriceBeforeGST: 100000, gstAmount: 8000, customerTotalIncludingGST: 108000 } },
    subsidy: { available: false, treatment: 'NOT_QUOTED' },
    company: { available: false, dependency: 'DECISION_C7_COMPANY_IDENTITY', reason: 'C7' },
  };
  const html = D.renderPage1(p1);
  assert.ok(html.includes('COVER_AND_PROPOSAL_DETAILS'));
});

// =============================================================================
// 31. Page 5 tests pass (structural check)
// =============================================================================
test('31 — Page 5 still renders', () => {
  assert.equal(typeof D.renderPage5, 'function');
  assert.equal(D.PAGE_FIVE.sectionName, 'THREE_OPTION_PRICING');
});

// =============================================================================
// 32. Page 7 tests pass (structural check)
// =============================================================================
test('32 — Page 7 still renders', () => {
  assert.equal(typeof D.renderPage7, 'function');
  assert.equal(D.PAGE_SEVEN.sectionName, 'TECHNICAL_SPECIFICATIONS');
});

// =============================================================================
// ADDITIONAL: TEST_ONLY banner renders for mock data
// =============================================================================
test('NO TEST_ONLY banner on customer-facing Page 8', () => {
  // Approved design: no TEST_ONLY banner on customer-facing quotation
  const html = D.renderPage8(residentialPayload());
  assert.ok(!html.includes('q8-test-banner'), 'no test banner class');
  assert.ok(!html.includes('TEST ONLY'), 'no TEST ONLY text visible to customer');
  // internal provenance attributes must not reach the customer-facing HTML either
  assert.equal(html.includes('data-calculation-status'), false);
  assert.equal(html.includes('data-calculation-source'), false);
});

test('no banner on commercial either', () => {
  const html = D.renderPage8(commercialPayload());
  assert.ok(!html.includes('q8-test-banner'));
  assert.ok(!html.includes('TEST ONLY'));
});

// =============================================================================
// ADDITIONAL: Post-solar bill, tariff escalation, KSEB spend from payload
// =============================================================================
test('post-solar bill from payload', () => {
  const fields = D.savingsPageFields(residentialPayload());
  const ps = fields.find(f => f.label === 'Post-Solar Monthly Bill');
  assert.ok(ps.available);
  assert.ok(ps.value.includes('100'));
  assert.ok(ps.value.includes('500'));
});

test('tariff escalation from payload', () => {
  const fields = D.savingsPageFields(residentialPayload());
  const te = fields.find(f => f.label === 'Tariff Escalation');
  assert.ok(te.available);
  assert.equal(te.value, '3–5%', 'approved "Bill increases 3–5% yearly" form');
});

test('KSEB spend from payload', () => {
  const fields = D.savingsPageFields(residentialPayload());
  const ks = fields.find(f => f.label === '25-Year KSEB Spend');
  assert.ok(ks.available);
  assert.ok(ks.value.includes('24,00,000'));
});

// =============================================================================
// ADDITIONAL: Graph absent when savings blocked
// =============================================================================
test('graph omitted (not fabricated) when savings section not available', () => {
  const html = D.renderPage8(commercialPayload());
  assert.ok(!html.includes('data-graph-rendered="true"'));
  assert.ok(!html.includes('<svg'), 'no fabricated chart');
  assert.ok(html.includes('q8-no-graph'), 'layout switches to the no-graph variant');
  assert.ok(D.blockedFieldsPage8(commercialPayload()).some(f => f.label === 'Savings Graph Data'), 'still reported internally');
});

// =============================================================================
// ADDITIONAL: Mock providers are deterministic and frozen
// =============================================================================
test('mock providers return frozen objects', () => {
  const sr = mockSavingsResult();
  assert.ok(Object.isFrozen(sr));
  assert.throws(() => { sr.systemSizeKw = 999; });
  const sub = mockSubsidyResult();
  assert.ok(Object.isFrozen(sub));
  const fin = mockFinancingResult();
  assert.ok(Object.isFrozen(fin));
});

test('mock providers produce same output on repeated calls', () => {
  const a = mockSavingsResult({ systemSizeKw: 5 });
  const b = mockSavingsResult({ systemSizeKw: 5 });
  assert.deepStrictEqual(a, b);
});

// =============================================================================
// APPROVED DESIGN STRUCTURE TESTS
// =============================================================================

test('approved heading "Your Savings Over Time" present', () => {
  const html = D.renderPage8(residentialPayload());
  assert.ok(html.includes('Your Savings Over Time'));
});

test('approved graph title "Cumulative Electricity Costs Over 25 Years" present', () => {
  const html = D.renderPage8(residentialPayload());
  assert.ok(html.includes('Cumulative Electricity Costs Over 25 Years'));
});

test('approved Monthly Bill Reduction section present', () => {
  const html = D.renderPage8(residentialPayload());
  assert.ok(html.includes('Monthly Bill Reduction'));
  assert.ok(html.includes('Current KSEB Bill'));
  assert.ok(html.includes('With Solar'));
});

test('approved Monthly Savings pill present', () => {
  const html = D.renderPage8(residentialPayload());
  assert.ok(html.includes('q8-pill-monthly'));
  assert.ok(html.includes('Monthly Savings'));
});

test('approved 25-Year Net Savings pill present', () => {
  const html = D.renderPage8(residentialPayload());
  assert.ok(html.includes('q8-pill-lifetime'));
  assert.ok(html.includes('25-Year Net Savings'));
});

test('approved Key Takeaway section present', () => {
  const html = D.renderPage8(residentialPayload());
  assert.ok(html.includes('Key Takeaway'));
  assert.ok(html.includes('pays for itself'));
});

test('approved Without Solar comparison card present', () => {
  const html = D.renderPage8(residentialPayload());
  assert.ok(html.includes('q8-card-without'));
  assert.ok(html.includes('Without Solar'));
  assert.ok(html.includes('paid to KSEB in 25 years'));
  assert.ok(html.includes('No ownership, no control'));
});

test('approved With Solar comparison card present', () => {
  const html = D.renderPage8(residentialPayload());
  assert.ok(html.includes('q8-card-with'));
  assert.ok(html.includes('With Solar'));
  assert.ok(html.includes('saved over 25 years'));
  assert.ok(html.includes('tariff hikes'));
  assert.ok(html.includes('25+ year warranty'));
});

test('approved arrow between comparison cards present', () => {
  const html = D.renderPage8(residentialPayload());
  assert.ok(html.includes('q8-arrow'));
});

test('approved Book now section present once the company master carries the bank account', () => {
  const p = residentialPayload();
  assert.equal(D.renderPage8(p).includes('Book now'), false, 'omitted while bank details are blank (no customer-facing "Not available")');
  const withBank = { ...p, company: { available: true, value: { bankName: 'Test Bank', bankAccountName: 'Test A/c', bankAccountNumber: '000111222', bankIfsc: 'TEST0000001' } } };
  assert.ok(D.renderPage8(withBank).includes('Book now'));
});

// 2026-09-09 (approved template v1): the "Book now" payment block prints only
// when the company master carries the bank account (never "Not available" to a
// customer); with a QR image the approved two-column layout is used.
test('approved payment/bank section renders two-column layout when bank + QR exist', () => {
  const p = residentialPayload();
  const withBank = { ...p, company: { available: true, value: { ...(p.company?.value || {}), bankName: 'Test Bank', bankAccountName: 'Test A/c', bankAccountNumber: '000111222', bankIfsc: 'TEST0000001', upiId: 'test@upi', upiQrImageUri: 'data:image/png;base64,iVBORw0KGgo=' } } };
  const html = D.renderPage8(withBank);
  assert.ok(html.includes('q8-payment-section'), 'payment section present');
  assert.ok(html.includes('q8-payment-box'), 'payment box grid present');
  assert.ok(html.includes('q8-qr-area'), 'QR area container present');
  assert.ok(html.includes('q8-bank-details'), 'Bank Transfer container present');
  assert.ok(html.includes('Bank Transfer'), 'Bank Transfer heading present');
  assert.ok(html.includes('test@upi'));
});

test('Required Documents list (approved template v1 copy) is printed and CMS content can replace it', () => {
  const html = D.renderPage8(residentialPayload());
  assert.ok(html.includes('Required Documents'), 'approved section present');
  for (const d of D.REQUIRED_DOCUMENTS_APPROVED) assert.ok(html.includes(d.replace('&', '&amp;')), `approved item: ${d}`);
  const cms = { ...residentialPayload(), requiredDocuments: { available: true, value: ['Only this one'] } };
  const html2 = D.renderPage8(cms);
  assert.ok(html2.includes('Only this one'));
  assert.ok(!html2.includes('KSEB Feasibility Report'), 'CMS list replaces the approved default verbatim');
});

test('no unapproved sections introduced', () => {
  const html = D.renderPage8(residentialPayload());
  assert.ok(!html.includes('q8-economics'), 'no economics section');
  assert.ok(!html.includes('q8-subtitle'), 'no subtitle');
  assert.ok(!html.includes('Payment Details'), 'no Payment Details heading');
  assert.ok(!html.includes('q8-additional-cost'), 'no Additional Structure cost section');
  assert.ok(!html.includes('4500/kw'), 'no hardcoded ₹4500/kw');
  assert.ok(!html.includes('q8-economics-table'), 'no economics table section');
});

test('graph uses line chart (polyline), not bar chart', () => {
  const html = D.renderPage8(residentialPayload());
  assert.ok(html.includes('<polyline'), 'graph has polyline elements');
  assert.ok(html.includes('KSEB Costs'), 'legend shows KSEB Costs');
  assert.ok(html.includes('Solar + Bills'), 'legend shows Solar + Bills');
});
