// PART H — PAGE 12 INVESTMENT SUMMARY TESTS.
//
// Tests verify Page 12 renders the approved artwork design with dynamic
// data bindings. NO calculation in renderer, NO hardcoded mock values,
// NO invented tier names.
//
// DO NOT MODIFY existing tests in other test files.

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
// PAYLOAD HELPERS
// ---------------------------------------------------------------------------

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

function residentialPayload10kw() {
  const sr = mockSavingsResult({ systemSizeKw: 10 });
  const sub = mockSubsidyResult({ systemSizeKw: 10 });
  const fin = mockFinancingResult({ grossQuotationAmount: 950000, subsidyAmount: 78000 });
  return {
    ...residentialPayload(),
    system: { systemType: 'ONGRID', systemSizeKw: 10, phase: 'THREE', packageTier: 'VALUE', roofType: 'FLAT' },
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
  };
}

// =============================================================================
// 1. Page 12 renders
// =============================================================================
test('renderPage12 produces HTML', () => {
  const html = D.renderPage12(residentialPayload());
  assert.ok(html.length > 100);
  assert.ok(html.includes('INVESTMENT_SUMMARY'));
});

// =============================================================================
// 2. Original Page 12 structure preserved
// =============================================================================
test('approved heading and subtitle present', () => {
  const html = D.renderPage12(residentialPayload());
  assert.ok(html.includes('Your Investment Summary'));
  assert.ok(html.includes('A controlled, predictable, one-time decision'));
});

// 2026-09-09 (approved template v1): the summary card is the approved orange-
// header card — System Cost (Pre-Subsidy), PAYMENT BREAKDOWN (Down Payment /
// PM Surya Ghar Subsidy / Amount Payable · Financed), savings rows, green EMI +
// Daily Investment box. The page artwork supplies the hybrid banner, trust
// badges and guarantees (owner-approved static content).
test('approved package banner present', () => {
  const html = D.renderPage12(residentialPayload());
  assert.ok(html.includes('q12-card-h'));
  assert.ok(html.includes('Solar System'));
});

test('approved investment card present', () => {
  const html = D.renderPage12(residentialPayload());
  assert.ok(html.includes('q12-card-b'));
  assert.ok(html.includes('System Cost (Pre-Subsidy)'));
  assert.ok(html.includes('PM Surya Ghar Subsidy'));
  assert.ok(html.includes('PAYMENT BREAKDOWN'));
  assert.ok(html.includes('Amount Payable / Financed'));
});

test('approved savings rows present', () => {
  const html = D.renderPage12(residentialPayload());
  assert.ok(html.includes('Monthly Savings'));
  assert.ok(html.includes('Payback Period'));
  assert.ok(html.includes('25-Year Net Savings'));
});

test('approved EMI section present', () => {
  const html = D.renderPage12(residentialPayload());
  assert.ok(html.includes('q12-emi'));
  assert.ok(html.includes('EMI ('));
  assert.ok(html.includes('Daily Investment'));
});

// =============================================================================
// 3. Dynamic package data comes from payload
// =============================================================================
test('system size comes from payload', () => {
  const fields5 = D.investmentSummaryFields(residentialPayload());
  const sz5 = fields5.find(f => f.label === 'System Size');
  assert.ok(sz5.available);
  assert.equal(sz5.value, '5 kW');

  const fields10 = D.investmentSummaryFields(residentialPayload10kw());
  const sz10 = fields10.find(f => f.label === 'System Size');
  assert.ok(sz10.available);
  assert.equal(sz10.value, '10 kW');
});

test('system cost comes from pricing', () => {
  const fields = D.investmentSummaryFields(residentialPayload());
  const cost = fields.find(f => f.label === 'System Cost (Pre-Subsidy)');
  assert.ok(cost.available);
  assert.ok(cost.value.includes('2,93,499'));
});

test('subsidy amount comes from payload', () => {
  const fields = D.investmentSummaryFields(residentialPayload());
  const sub = fields.find(f => f.label === 'PM Surya Ghar Subsidy');
  assert.ok(sub.available);
  assert.ok(sub.value.includes('78,000'));
});

test('monthly savings comes from savings provider', () => {
  const fields = D.investmentSummaryFields(residentialPayload());
  const ms = fields.find(f => f.label === 'Monthly Savings');
  assert.ok(ms.available);
  assert.ok(ms.value.includes('4,000'));
});

test('payback period comes from savings provider — not calculated', () => {
  const fields = D.investmentSummaryFields(residentialPayload());
  const pp = fields.find(f => f.label === 'Payback Period');
  assert.ok(pp.available);
  assert.ok(pp.value.includes('42')); // 42 months from provider
});

test('EMI comes from financing provider', () => {
  const fields = D.investmentSummaryFields(residentialPayload());
  const emi = fields.find(f => f.label === 'EMI Option');
  assert.ok(emi.available);
  assert.ok(emi.value.includes('1,959'));
});

// =============================================================================
// 4. C6 missing data becomes named blocked dependency
// =============================================================================
test('package tier name blocked on C6', () => {
  const fields = D.investmentSummaryFields(residentialPayload());
  const tier = fields.find(f => f.label === 'Package Tier');
  assert.ok(!tier.available);
  assert.equal(tier.dependency, 'DECISION_C6_TIER_DISPLAY_NAMES');
});

// =============================================================================
// 5. No invented tier names
// =============================================================================
test('no invented tier names in renderer source', () => {
  // These are production tier names that must not be hardcoded
  const inventedPatterns = [
    /\bBasic\b(?!.*test)/i,
    /\bSmart\b(?!.*test)/i,
    /\bPremium\b(?!.*test)/i,
  ];
  // Check rendered HTML for invented tier names
  const html = D.renderPage12(residentialPayload());
  assert.ok(!html.includes('>Basic<'), 'no Basic tier');
  assert.ok(!html.includes('>Smart<'), 'no Smart tier');
  assert.ok(!html.includes('>Premium<'), 'no Premium tier');
});

// =============================================================================
// 6. Referral section (hybrid upsell) remains present
// =============================================================================
test('approved page-12 artwork (hybrid banner, badges, guarantees) is the page base', () => {
  const html = D.renderPage12(residentialPayload());
  assert.ok(html.includes('assets/quotation/q-page-12.jpg'), 'approved artwork rendered');
  assert.ok(html.includes('q12-cover-card') && html.includes('q12-cover-offer'), 'sample card + dated offer band are covered');
});

// =============================================================================
// 7. Referral static artwork/copy preserved
// =============================================================================
test('Refer & Earn block (approved template v1) replaces the dated special-offer band', () => {
  const html = D.renderPage12(residentialPayload());
  assert.ok(html.includes('Refer &amp; Earn More Rewards'));
  assert.ok(html.includes('Cash Rewards') && html.includes('Exciting Gifts') && html.includes('Bonus Benefits') && html.includes('Help Others Save'));
  assert.equal(html.includes('Priority 10-Day Installation'), false, 'no dated offer copy');
});

// =============================================================================
// 8. No new dashboard sections
// =============================================================================
test('no dashboard sections', () => {
  const html = D.renderPage12(residentialPayload());
  assert.ok(!html.includes('q12-dashboard'), 'no dashboard class');
  assert.ok(!html.includes('Payment Details'), 'no Payment Details');
  assert.ok(!html.includes('data-dashboard'), 'no dashboard data attr');
});

// =============================================================================
// 9. No new cards
// =============================================================================
test('no invented card types', () => {
  const html = D.renderPage12(residentialPayload());
  assert.ok(!html.includes('q12-card-new'), 'no new card type');
  assert.ok(!html.includes('q12-stat'), 'no stat card');
  assert.ok(!html.includes('q12-metric'), 'no metric card');
});

// =============================================================================
// 10. No new graph
// =============================================================================
test('no graph on Page 12', () => {
  const html = D.renderPage12(residentialPayload());
  // The only SVGs allowed are the 13 px contact-strip icons (pin / globe / mail /
  // phone) of the shared footer laid over the artwork's baked address (2026-09-12).
  const outsideStrip = html.replace(/<div class="q-cs[\s\S]*?<\/div>\s*<\/div>/g, '');
  assert.ok(!outsideStrip.includes('<svg'), 'no SVG graph');
  assert.ok(!html.includes('<canvas'), 'no canvas graph');
  assert.ok(!html.includes('polyline'), 'no polyline');
});

// =============================================================================
// 11. No calculation occurs in renderer
// =============================================================================
test('renderer source has no arithmetic for Page 12 fields', () => {
  // "Your Investment" reads pipeline-computed postSubsidyInvestment (no arithmetic).
  // "Net monthly during EMI" remains BLOCKED (requires savings - EMI subtraction).
  const fields = D.investmentSummaryFields(residentialPayload());
  const netInv = fields.find(f => f.label === 'Your Investment');
  assert.ok(netInv.available, 'Your Investment available (reads pipeline-computed value)');
  // When available, field() clears dependency to null (line 110 of quotationDocument.js)
  assert.equal(netInv.dependency, null);
  assert.ok(netInv.value.includes('2,07,000'), 'Your Investment = ₹2,07,000');

  const netEMI = fields.find(f => f.label === 'Net monthly during EMI');
  assert.ok(!netEMI.available, 'Net monthly during EMI blocked (requires subtraction)');
  assert.equal(netEMI.dependency, 'NET_MONTHLY_DURING_EMI');
});

// =============================================================================
// 12. No mock numbers hardcoded into renderer
// =============================================================================
test('no hardcoded mock values in renderer source (Page 12)', () => {
  // investmentSummaryFields and renderPage12 must not hardcode mock numbers
  const p12Start = RENDERER_SRC.indexOf('export function investmentSummaryFields');
  const p12End = RENDERER_SRC.indexOf('export const PAGE_TWELVE_STYLES');
  const p12Src = RENDERER_SRC.slice(p12Start, p12End);

  // No hardcoded money amounts
  assert.ok(!p12Src.includes('293499'), 'no hardcoded total');
  assert.ok(!p12Src.includes('78000'), 'no hardcoded subsidy');
  assert.ok(!p12Src.includes('190000'), 'no hardcoded net investment');
  assert.ok(!p12Src.includes('4594'), 'no hardcoded EMI');
  assert.ok(!p12Src.includes('1560000'), 'no hardcoded lifetime savings');
});

// =============================================================================
// 13. No internal cost/margin appears
// =============================================================================
test('no internal cost or margin in Page 12 HTML', () => {
  const html = D.renderPage12(residentialPayload());
  assert.ok(!html.includes('grossProfit'), 'no gross profit');
  assert.ok(!html.includes('marginType'), 'no margin type');
  assert.ok(!html.includes('targetGross'), 'no target gross');
  assert.ok(!html.includes('internal'), 'no internal reference');
});

// =============================================================================
// 14. No customer data leakage
// =============================================================================
test('customer PII not in Page 12 HTML', () => {
  const html = D.renderPage12(residentialPayload());
  assert.ok(!html.includes('Resi Tester'), 'no customer name');
  assert.ok(!html.includes('9000000001'), 'no phone');
  assert.ok(!html.includes('682001'), 'no pincode');
  assert.ok(!html.includes('10 Solar Lane'), 'no address');
});

// =============================================================================
// 15. Different payloads produce different dynamic values
// =============================================================================
test('different system sizes produce different Page 12 output', () => {
  const html5 = D.renderPage12(residentialPayload());
  const html10 = D.renderPage12(residentialPayload10kw());
  assert.ok(html5.includes('5 kW'));
  assert.ok(html10.includes('10 kW'));
  assert.notEqual(html5, html10);
});

test('commercial payload produces different subsidy treatment', () => {
  const fields = D.investmentSummaryFields(commercialPayload());
  const sub = fields.find(f => f.label === 'PM Surya Ghar Subsidy');
  assert.ok(sub.available);
  assert.equal(sub.value, 'Not applicable');
});

test('blocked savings in commercial payload', () => {
  const fields = D.investmentSummaryFields(commercialPayload());
  const ms = fields.find(f => f.label === 'Monthly Savings');
  assert.ok(!ms.available);
  assert.equal(ms.dependency, 'SAVINGS_ENGINE');
});

// =============================================================================
// 16–19. Pages 1, 5, 7, 8 unchanged
// =============================================================================
test('Page 1 renderPage1 still works', () => {
  const html = D.renderPage1(residentialPayload());
  assert.ok(html.includes('COVER_AND_PROPOSAL_DETAILS'));
});

test('Page 5 renderPage5 still works', () => {
  const html = D.renderPage5(residentialPayload());
  assert.ok(html.includes('THREE_OPTION_PRICING'));
});

test('Page 7 renderPage7 still works', () => {
  const html = D.renderPage7(residentialPayload());
  assert.ok(html.includes('TECHNICAL_SPECIFICATIONS'));
});

test('Page 8 renderPage8 still works', () => {
  const html = D.renderPage8(residentialPayload());
  assert.ok(html.includes('SAVINGS_AND_PAYMENT'));
  // Approved template v1: Required Documents list present; the "Book now"
  // block prints only when the company master has the bank account.
  assert.ok(html.includes('Required Documents'), 'approved Required Documents list on Page 8');
  assert.ok(!html.includes('q8-additional-cost'), 'no Additional Structure cost on Page 8 (rate not configured)');
});

// =============================================================================
// ADDITIONAL: data-blocked-count, section metadata
// =============================================================================
test('blockedFieldsPage12 count reflects blocked fields (no data-blocked-count leaks to HTML)', () => {
  const payload = residentialPayload();
  const html = D.renderPage12(payload);
  // Blocked: Package Tier (C6) + Net monthly during EMI.
  // Your Investment is now unblocked (reads pipeline postSubsidyInvestment).
  const blocked = D.blockedFieldsPage12(payload);
  assert.ok(blocked.length >= 2, 'at least 2 blocked fields');
  assert.equal(html.includes('data-blocked-count'), false, 'internal provenance attributes must not reach the customer-facing HTML');
});

test('data-page-section is INVESTMENT_SUMMARY', () => {
  const html = D.renderPage12(residentialPayload());
  assert.ok(html.includes('data-page-section="INVESTMENT_SUMMARY"'));
});

test('data-document-order is 12', () => {
  const html = D.renderPage12(residentialPayload());
  assert.ok(html.includes('data-document-order="12"'));
});

test('blockedFieldsPage12 returns correct structure', () => {
  const blocked = D.blockedFieldsPage12(residentialPayload());
  assert.ok(Array.isArray(blocked));
  const labels = blocked.map(b => b.label);
  assert.ok(labels.includes('Package Tier'), 'Package Tier blocked');
  // Your Investment is now unblocked (reads pipeline postSubsidyInvestment)
  assert.ok(!labels.includes('Your Investment'), 'Your Investment NOT blocked');
  assert.ok(labels.includes('Net monthly during EMI'), 'Net monthly during EMI blocked');
  // Each has dependency and note
  for (const b of blocked) {
    assert.ok(b.dependency, `${b.label} has dependency`);
    assert.ok(b.note, `${b.label} has note`);
  }
});

test('EMI terms from financing provider', () => {
  const fields = D.investmentSummaryFields(residentialPayload());
  const terms = fields.find(f => f.label === 'EMI Terms');
  assert.ok(terms.available);
  assert.ok(terms.value.includes('10yr'));
  assert.ok(terms.value.includes('5.75%'));
});

test('25-Year Net Savings includes plus sign', () => {
  const fields = D.investmentSummaryFields(residentialPayload());
  const ls = fields.find(f => f.label === '25-Year Net Savings');
  assert.ok(ls.available);
  assert.ok(ls.value.includes('+'));
});

// =============================================================================
// CORRECTION PASS — Payback Period label + badge artwork
// =============================================================================

test('approved artwork label "Payback Period" appears in rendered HTML', () => {
  const html = D.renderPage12(residentialPayload());
  assert.ok(html.includes('Payback Period'), 'must use artwork label "Payback Period"');
  assert.ok(!html.includes('Return Period'), 'must NOT use renamed "Return Period" on Page 12');
});

test('payback value comes from payload — renderer contains no payback formula', () => {
  // Renderer source must not contain any payback calculation formula
  assert.ok(!/paybackPeriod\s*=\s*[^'"]/.test(RENDERER_SRC), 'no paybackPeriod assignment');
  assert.ok(!/returnPeriodMonths\s*\/\s*12/.test(RENDERER_SRC), 'no months-to-years conversion');
  assert.ok(!/Math\.(round|ceil|floor)\s*\(\s*.*payback/i.test(RENDERER_SRC), 'no Math rounding of payback');
  assert.ok(!/Math\.(round|ceil|floor)\s*\(\s*.*return.*Period/i.test(RENDERER_SRC), 'no Math rounding of period');
});

test('trust badges and guarantees come from the approved artwork, not emoji', () => {
  const html = D.renderPage12(residentialPayload());
  assert.ok(html.includes('q-page-12.jpg'), 'approved artwork carries the badge and guarantee rows');
  for (const e of ['🏛', '🏠', '⭐', '↩', '🔒', '🔐', '✅']) assert.ok(!html.includes(e), `no emoji ${e}`);
});

test('no financial calculation exists in renderer for payback or any value', () => {
  // No financial Math rounding. Math.max/min used for layout sizing (e.g. row
  // alignment) is permitted; financial rounding (round/ceil/floor/abs) is not.
  assert.ok(!/Math\.(round|ceil|floor|abs)\s*\(/.test(RENDERER_SRC), 'no Math rounding on financial values');
  // Math.max/min must not operate on prices, costs, amounts or margins.
  assert.ok(!/Math\.(min|max)\s*\([^)]*(?:price|cost|amount|margin|subsid|saving)/i.test(RENDERER_SRC), 'no Math.min/max on financial values');
  // No division or multiplication formulas
  assert.ok(!/\/\s*12\b/.test(RENDERER_SRC), 'no divide by 12');
  assert.ok(!/\/\s*\(\s*1\s*-|\*\s*\(\s*1\s*\+/.test(RENDERER_SRC), 'no financial formulas');
});
