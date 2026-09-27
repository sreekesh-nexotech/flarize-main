// PART H — CUSTOMER QUOTATION DOCUMENT, HYBRID STEP 4: PAGE 8.
// SAVINGS OVER TIME + PAYMENT DETAILS.
//
// This suite proves:
// - Page 8 renderer exists and exports correctly
// - All values come from the approved quotation payload / calculator output
// - Renderer performs NO calculation (no Math, no arithmetic, no formula)
// - No engine imports (catalog, pricing, cost, subsidy, EMI, solar)
// - Missing values render blocked treatment, never ₹0
// - Commercial quotation: no subsidy, no PM Surya Ghar
// - Graph requires supplied time-series data (blocked when absent)
// - Payment/bank details blocked on C7
// - No internal data leaks
// - Pages 1, 5, 7 remain green
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as D from '../public/lib/quotationDocument.js';

const RENDERER_SRC = readFileSync('public/lib/quotationDocument.js', 'utf8');
const PAGE_SRC = readFileSync('public/quotation-document.html', 'utf8');

// --- Test payloads -----------------------------------------------------------

// Payload A: commercial, subsidy NOT_QUOTED, complete pricing
function payloadA() {
  return {
    customer: { customerId: 'C-A', customerName: 'Test Corp', address: '1 Test Rd',
      pincode: '600001', phone: '9111111111', currentBillAmount: 8500, currentBillCycle: 'monthly' },
    system: { systemType: 'ONGRID', systemSizeKw: 10, phase: 'THREE', packageTier: 'VALUE',
      packageTierDisplayName: { available: false, dependency: 'DECISION_C6_TIER_DISPLAY_NAMES',
        reason: 'C6 PENDING' }, roofType: 'FLAT' },
    pricing: {
      available: true, source: 'COMMERCIAL_SNAPSHOT',
      customer: { sellingPriceBeforeGST: 520000, gstAmount: 46280, customerTotalIncludingGST: 566280 },
    },
    subsidy: { available: false, value: null, treatment: 'NOT_QUOTED',
      dependency: 'SUBSIDY_ENGINE', reason: 'NOT_QUOTED' },
    savings: { available: false, dependency: 'SAVINGS_ENGINE',
      reason: 'No Savings Engine.' },
    financing: { available: false, dependency: 'FINANCE_ENGINE',
      reason: 'No Finance Engine.' },
    company: { available: false, dependency: 'DECISION_C7_COMPANY_IDENTITY',
      reason: 'C7 PENDING.' },
  };
}

// Payload B: different customer, different prices
function payloadB() {
  return {
    customer: { customerId: 'C-B', customerName: 'Solar House', address: '99 Solar Ave',
      pincode: '682001', phone: '9222222222', currentBillAmount: 4200, currentBillCycle: 'bi-monthly' },
    system: { systemType: 'ONGRID', systemSizeKw: 5, phase: 'SINGLE', packageTier: 'BASE',
      packageTierDisplayName: { available: false, dependency: 'DECISION_C6_TIER_DISPLAY_NAMES',
        reason: 'C6 PENDING' }, roofType: 'SHEET' },
    pricing: {
      available: true, source: 'COMMERCIAL_SNAPSHOT',
      customer: { sellingPriceBeforeGST: 294024, gstAmount: 26168, customerTotalIncludingGST: 320192 },
    },
    subsidy: { available: false, value: null, treatment: 'NOT_QUOTED',
      dependency: 'SUBSIDY_ENGINE', reason: 'NOT_QUOTED' },
    savings: { available: false, dependency: 'SAVINGS_ENGINE',
      reason: 'No Savings Engine.' },
    financing: { available: false, dependency: 'FINANCE_ENGINE',
      reason: 'No Finance Engine.' },
    company: { available: false, dependency: 'DECISION_C7_COMPANY_IDENTITY',
      reason: 'C7 PENDING.' },
  };
}

// Payload C: incomplete — no pricing, no customer bill
function payloadIncomplete() {
  return {
    customer: { customerId: 'C-C', customerName: 'Missing Data' },
    system: { systemType: 'ONGRID', systemSizeKw: 3, phase: 'SINGLE' },
    subsidy: { available: false, dependency: 'SUBSIDY_ENGINE',
      reason: 'No Subsidy Engine.' },
    savings: { available: false, dependency: 'SAVINGS_ENGINE',
      reason: 'No Savings Engine.' },
    financing: { available: false, dependency: 'FINANCE_ENGINE',
      reason: 'No Finance Engine.' },
    company: { available: false, dependency: 'DECISION_C7_COMPANY_IDENTITY',
      reason: 'C7 PENDING.' },
  };
}

// =============================================================================
// 1. Page 8 renderer exists
// =============================================================================
test('Page 8 renderer exists and is exported', () => {
  assert.equal(typeof D.renderPage8, 'function');
  assert.equal(typeof D.PAGE_EIGHT_STYLES, 'string');
  assert.equal(typeof D.blockedFieldsPage8, 'function');
  assert.equal(typeof D.savingsPageFields, 'function');
  assert.equal(D.PAGE_EIGHT.sectionName, 'SAVINGS_AND_PAYMENT');
  assert.equal(D.PAGE_EIGHT.documentOrder, 8);
});

// =============================================================================
// 2. Uses quotation payload/calculator output
// =============================================================================
test('Page 8 uses approved payload fields', () => {
  const fields = D.savingsPageFields(payloadA());
  assert.ok(fields.length > 0);
  // Current bill from payload
  const bill = fields.find(f => f.label === 'Current Electricity Bill');
  assert.ok(bill);
  assert.ok(bill.available);
  assert.ok(bill.value.includes('8,500'));
});

// =============================================================================
// 3. System size from approved data
// =============================================================================
test('system size comes from approved payload', () => {
  const fields = D.savingsPageFields(payloadA());
  const sz = fields.find(f => f.label === 'System Size');
  assert.ok(sz.available);
  assert.equal(sz.value, '10 kW');
});

// =============================================================================
// 4. Setup cost / total investment from approved calculation/payload
// =============================================================================
test('total investment comes from approved commercial snapshot', () => {
  const fields = D.savingsPageFields(payloadA());
  const inv = fields.find(f => f.label === 'Total Investment');
  assert.ok(inv.available);
  assert.ok(inv.value.includes('5,66,280'));
});

// =============================================================================
// 5. Subsidy from existing subsidy calculation output
// =============================================================================
test('subsidy field reflects payload subsidy treatment', () => {
  // Commercial: NOT_QUOTED
  const fieldsA = D.savingsPageFields(payloadA());
  const subA = fieldsA.find(f => f.label === 'Subsidy');
  assert.ok(subA.available, 'NOT_QUOTED subsidy should be available (answer is N/A)');
  assert.equal(subA.value, 'Not applicable');

  // Incomplete: no treatment, blocked
  const fieldsC = D.savingsPageFields(payloadIncomplete());
  const subC = fieldsC.find(f => f.label === 'Subsidy');
  assert.ok(!subC.available);
  assert.equal(subC.dependency, 'SUBSIDY_ENGINE');
});

// =============================================================================
// 6. Final/net investment from authoritative calculation
// =============================================================================
test('total investment blocked when no commercial snapshot', () => {
  const fields = D.savingsPageFields(payloadIncomplete());
  const inv = fields.find(f => f.label === 'Total Investment');
  assert.ok(!inv.available);
  assert.ok(inv.dependency);
});

// =============================================================================
// 7. EMI from existing EMI calculator output
// =============================================================================
test('EMI is blocked with FINANCE_ENGINE dependency', () => {
  const fields = D.savingsPageFields(payloadA());
  const emi = fields.find(f => f.label === 'EMI');
  assert.ok(!emi.available);
  assert.equal(emi.dependency, 'FINANCE_ENGINE');
});

// =============================================================================
// 8. Lifetime savings from existing solar calculator
// =============================================================================
test('lifetime savings blocked with SAVINGS_ENGINE dependency', () => {
  const fields = D.savingsPageFields(payloadA());
  const ls = fields.find(f => f.label === '25-Year Net Savings');
  assert.ok(!ls.available);
  assert.equal(ls.dependency, 'SAVINGS_ENGINE');
});

// =============================================================================
// 9. ROI/payback from existing solar calculator
// =============================================================================
test('return period blocked with SAVINGS_ENGINE dependency', () => {
  const fields = D.savingsPageFields(payloadA());
  const pb = fields.find(f => f.label === 'Return Period');
  assert.ok(!pb.available);
  assert.equal(pb.dependency, 'SAVINGS_ENGINE');
});

// =============================================================================
// 10. Graph uses authoritative supplied time-series data
// =============================================================================
test('graph data field exists and is blocked on SAVINGS_ENGINE', () => {
  const fields = D.savingsPageFields(payloadA());
  const graph = fields.find(f => f.label === 'Savings Graph Data');
  assert.ok(graph);
  assert.ok(!graph.available);
  assert.equal(graph.dependency, 'SAVINGS_ENGINE');
});

// =============================================================================
// 11. Renderer does not calculate graph points
// =============================================================================
test('rendered Page 8 does not contain calculated graph points', () => {
  const html = D.renderPage8(payloadA());
  // 2026-09-09 (approved template v1): with no savings engine result the graph
  // card is OMITTED — never a fabricated chart, never an internal note printed
  // to the customer. The dependency is still reported by blockedFieldsPage8.
  assert.ok(!html.includes('<path'));
  assert.ok(!html.includes('data-points'));
  assert.ok(!html.includes('data-graph-rendered'));
  assert.ok(D.blockedFieldsPage8(payloadA()).some(f => f.dependency === 'SAVINGS_ENGINE'));
});

// =============================================================================
// 12. Renderer does not calculate subsidy
// =============================================================================
test('renderer does not calculate subsidy — uses payload treatment', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // No subsidy formula: 30000, 18000, 78000 slab values
  assert.ok(!code.includes('30000'));
  assert.ok(!code.includes('18000'));
  assert.ok(!code.includes('78000'));
});

// =============================================================================
// 13. Renderer does not calculate EMI
// =============================================================================
test('renderer does not calculate EMI', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/loanAmount\s*[=*\/]|interestRate\s*[=*\/]|tenure\s*[=*\/]/i.test(code));
});

// =============================================================================
// 14. Renderer does not calculate ROI
// =============================================================================
test('renderer does not calculate ROI or payback', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/paybackMonths\s*=|roiPercent\s*=/i.test(code));
});

// =============================================================================
// 15. Renderer does not calculate lifetime savings
// =============================================================================
test('renderer does not calculate lifetime or annual savings', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/annualSaving\s*=|lifetimeSaving\s*=|yearlySaving\s*=/i.test(code));
  assert.ok(!/tariffEscalation\s*\*|degradation\s*\*/i.test(code));
});

// =============================================================================
// 16. No Math-based financial calculation
// =============================================================================
test('no Math-based calculation in renderer for Page 8', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Math.pow, Math.round on financial values, etc.
  assert.ok(!/Math\.pow\(|Math\.floor\(.*price|Math\.ceil\(.*price/i.test(code));
  // No .reduce() for summing financial values
  assert.ok(!/\.reduce\(\s*\([^)]*\)\s*=>/i.test(code));
});

// =============================================================================
// 17. No arithmetic on commercial values
// =============================================================================
test('no arithmetic on commercial values in Page 8 renderer', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // No multiplying or dividing price/GST values
  assert.ok(!/sellingPrice\s*[\*\/\-\+]/i.test(code));
  assert.ok(!/gstAmount\s*[\*\/\-\+]/i.test(code));
  assert.ok(!/customerTotal\s*[\*\/\-\+]/i.test(code));
});

// =============================================================================
// 18. Commercial quotation contains no subsidy display
// =============================================================================
test('commercial quotation Page 8 output contains no subsidy display', () => {
  const html = D.renderPage8(payloadA());
  // Subsidy field should show "Not applicable" (NOT_QUOTED), not a value
  // and definitely NOT "PM Surya Ghar" or "After Subsidy"
  assert.ok(!html.includes('PM Surya Ghar'));
  assert.ok(!html.includes('After Subsidy'));
  assert.ok(!html.includes('₹78,000'));
  assert.ok(!html.includes('₹30,000'));
});

// =============================================================================
// 19. Commercial quotation contains no PM Surya Ghar language
// =============================================================================
test('no PM Surya Ghar language in commercial Page 8', () => {
  const html = D.renderPage8(payloadA());
  assert.ok(!html.includes('PM Surya Ghar'));
  assert.ok(!html.includes('Surya Ghar'));
  assert.ok(!html.includes('PMSGBY'));
});

// =============================================================================
// 20. Missing subsidy = named dependency, never ₹0
// =============================================================================
test('missing subsidy renders blocked dependency, not ₹0', () => {
  const fields = D.savingsPageFields(payloadIncomplete());
  const sub = fields.find(f => f.label === 'Subsidy');
  assert.ok(!sub.available);
  assert.notEqual(sub.value, '₹0');
  assert.notEqual(sub.value, '0');
  assert.equal(sub.dependency, 'SUBSIDY_ENGINE');
});

// =============================================================================
// 21. Missing EMI = named dependency, never ₹0
// =============================================================================
test('missing EMI renders blocked dependency, not ₹0', () => {
  const fields = D.savingsPageFields(payloadA());
  const emi = fields.find(f => f.label === 'EMI');
  assert.ok(!emi.available);
  assert.notEqual(emi.value, '₹0');
  assert.equal(emi.dependency, 'FINANCE_ENGINE');
});

// =============================================================================
// 22. Missing savings = named dependency, never ₹0
// =============================================================================
test('missing savings renders blocked dependency, not ₹0', () => {
  const fields = D.savingsPageFields(payloadA());
  const ls = fields.find(f => f.label === '25-Year Net Savings');
  assert.ok(!ls.available);
  assert.notEqual(ls.value, '₹0');
  assert.equal(ls.dependency, 'SAVINGS_ENGINE');
});

// =============================================================================
// 23. Missing graph data = named dependency, not fabricated data
// =============================================================================
test('missing graph data omits the graph — never a fabricated chart', () => {
  const html = D.renderPage8(payloadA());
  assert.equal(html.includes('data-graph-source'), false);
  assert.equal(html.includes('data-graph-rendered'), false);
  // No fabricated SVG chart (the contact-strip icons are the only inline SVGs)
  assert.ok(!html.includes('q8-graph-svg'));
  assert.ok(!html.includes('<canvas'));

  const fields = D.savingsPageFields(payloadA());
  const graph = fields.find(f => f.label === 'Savings Graph Data');
  assert.equal(graph.dependency, 'SAVINGS_ENGINE', 'dependency still named at the JS level');
});

// =============================================================================
// 24. Example values from artwork do not leak
// =============================================================================
test('artwork example values do not appear in Page 8 output', () => {
  const html = D.renderPage8(payloadA());
  // Artwork examples from forensic report
  assert.ok(!html.includes('₹3,500'));   // artwork bill amount
  assert.ok(!html.includes('Sareena'));  // artwork customer name
  assert.ok(!html.includes('QUO-GR'));   // artwork quotation number
});

// =============================================================================
// 25. Internal cost/margin does not appear
// =============================================================================
test('no internal cost or margin in Page 8', () => {
  const html = D.renderPage8(payloadA());
  const lower = html.toLowerCase();
  assert.ok(!lower.includes('gross margin'));
  assert.ok(!lower.includes('target margin'));
  assert.ok(!lower.includes('cost price'));
  assert.ok(!lower.includes('direct project cost'));
  assert.ok(!lower.includes('landed cost'));
  assert.ok(!lower.includes('snapshoti'));
  assert.ok(!lower.includes('bom-v'));
});

// =============================================================================
// 26. C6/C7/C13/C14 are not invented
// =============================================================================
test('C6/C7/C13/C14 are not invented in Page 8', () => {
  const html = D.renderPage8(payloadA());
  // No company name / GSTIN / bank account invented
  assert.ok(!html.includes('Golden Ray Renewable'));
  assert.ok(!html.includes('GSTIN'));
  assert.ok(!html.includes('IFSC'));
  assert.ok(!html.includes('Account Number'));
  assert.ok(!html.includes('UPI'));
  // Bank details are not entered → the "Book now" block is omitted (never a
  // customer-facing "Not available" note); the dependency is reported internally.
  assert.equal(html.includes('Book now'), false);
  assert.ok(D.blockedFieldsPage8(payloadA()).some(f => f.label === 'Bank Details' && f.dependency === 'DECISION_C7_COMPANY_IDENTITY'));
});

// =============================================================================
// 27. Two different calculator outputs produce different Page 8 results
// =============================================================================
test('two different payloads produce different Page 8 outputs', () => {
  const htmlA = D.renderPage8(payloadA());
  const htmlB = D.renderPage8(payloadB());
  assert.notEqual(htmlA, htmlB);
  // A has 8500 bill, B has 4200 bill — both rendered in approved design
  assert.ok(htmlA.includes('8,500'));
  assert.ok(htmlB.includes('4,200'));
});

// =============================================================================
// 28. No cross-customer leakage
// =============================================================================
test('no cross-customer leakage between Page 8 renders', () => {
  const htmlA = D.renderPage8(payloadA());
  const htmlB = D.renderPage8(payloadB());
  // A should not contain B's values
  assert.ok(!htmlA.includes('4,200'));
  assert.ok(!htmlA.includes('5 kW'));
  // B should not contain A's values
  assert.ok(!htmlB.includes('8,500'));
  assert.ok(!htmlB.includes('10 kW'));
});

// =============================================================================
// 29. Page 1 tests remain green
// =============================================================================
test('Page 1 still renders and exports are intact', () => {
  assert.equal(typeof D.renderPage1, 'function');
  assert.equal(typeof D.PAGE_ONE_STYLES, 'string');
  assert.equal(typeof D.blockedFields, 'function');
});

// =============================================================================
// 30. Page 5 tests remain green
// =============================================================================
test('Page 5 still renders and exports are intact', () => {
  assert.equal(typeof D.renderPage5, 'function');
  assert.equal(typeof D.PAGE_FIVE_STYLES, 'string');
  assert.equal(typeof D.blockedFieldsPage5, 'function');
});

// =============================================================================
// 31. Page 7 tests remain green
// =============================================================================
test('Page 7 still renders and exports are intact', () => {
  assert.equal(typeof D.renderPage7, 'function');
  assert.equal(typeof D.PAGE_SEVEN_STYLES, 'string');
  assert.equal(typeof D.blockedFieldsPage7, 'function');
});

// =============================================================================
// 32. Internal quotation UI does not appear
// =============================================================================
test('no internal workspace UI in Page 8', () => {
  const html = D.renderPage8(payloadA());
  assert.ok(!html.includes('quotation-workspace'));
  assert.ok(!html.includes('Engineering verdict'));
  assert.ok(!html.includes('Generation gate'));
  assert.ok(!html.includes('RBAC'));
  assert.ok(!html.includes('capability'));
});

// =============================================================================
// Additional: renderer imports nothing
// =============================================================================
test('renderer imports nothing — no catalog, no engine', () => {
  const imports = [...RENDERER_SRC.matchAll(/^import[^;]*?from\s+'([^']+)'/gm)].map(m => m[1]);
  assert.equal(imports.length, 0, 'renderer must have zero imports');
});

// =============================================================================
// Additional: no pricing engine import
// =============================================================================
test('no pricing engine reference in renderer', () => {
  assert.ok(!RENDERER_SRC.includes("pricingEngine"));
});

// =============================================================================
// Additional: no cost engine reference
// =============================================================================
test('no cost engine reference in renderer', () => {
  assert.ok(!RENDERER_SRC.includes("costEngine"));
});

// =============================================================================
// Additional: no engineering engine reference
// =============================================================================
test('no engineering engine import in renderer', () => {
  assert.ok(!RENDERER_SRC.includes("engineeringChecker"));
  assert.ok(!RENDERER_SRC.includes("engineeringValidation"));
});

// =============================================================================
// Additional: well-formed HTML
// =============================================================================
test('Page 8 HTML is well formed', () => {
  const html = D.renderPage8(payloadA());
  assert.ok(html.includes('<section'));
  assert.ok(html.includes('</section>'));
  assert.ok(html.includes('data-page-section="SAVINGS_AND_PAYMENT"'));
  assert.ok(html.includes('data-document-order="8"'));
});

// =============================================================================
// Additional: deterministic
// =============================================================================
test('Page 8 is deterministic', () => {
  const p = payloadA();
  assert.equal(D.renderPage8(p), D.renderPage8(p));
});

// =============================================================================
// Additional: no clock or randomness
// =============================================================================
test('no clock or randomness in renderer', () => {
  assert.ok(!/Date\.now|new Date|Math\.random/.test(RENDERER_SRC));
});

// =============================================================================
// Additional: document shell imports Page 8
// =============================================================================
test('document shell imports Page 8', () => {
  assert.ok(PAGE_SRC.includes('renderPage8'));
  assert.ok(PAGE_SRC.includes('PAGE_EIGHT_STYLES'));
  assert.ok(PAGE_SRC.includes('blockedFieldsPage8'));
});

// =============================================================================
// Additional: payment section blocked on C7
// =============================================================================
test('payment section is omitted while the company master has no bank account; rendered when it does', () => {
  const html = D.renderPage8(payloadA());
  assert.equal(html.includes('q8-payment-section'), false, 'no payment section without bank details');
  assert.equal(html.includes('DECISION_C7_COMPANY_IDENTITY'), false, 'internal dependency name must not reach the customer-facing HTML');
  const withBank = { ...payloadA(), company: { available: true, value: { companyName: 'X', bankName: 'Test Bank', bankAccountName: 'Test A/c', bankAccountNumber: '000111222', bankIfsc: 'TEST0000001' } } };
  const html2 = D.renderPage8(withBank);
  assert.ok(html2.includes('q8-payment-section'), 'payment section present with bank details');
  assert.ok(html2.includes('q8-bank-details'), 'bank details container');
  assert.ok(html2.includes('Test Bank') && html2.includes('TEST0000001'));
  assert.ok(html2.includes('q8-payment-noqr'), 'QR column omitted when no QR image is set');
});

// =============================================================================
// Additional: billing cycle from payload
// =============================================================================
test('billing cycle comes from payload', () => {
  const fields = D.savingsPageFields(payloadA());
  const bc = fields.find(f => f.label === 'Billing Cycle');
  assert.ok(bc.available);
  assert.equal(bc.value, 'monthly');

  const fieldsB = D.savingsPageFields(payloadB());
  const bcB = fieldsB.find(f => f.label === 'Billing Cycle');
  assert.ok(bcB.available);
  assert.equal(bcB.value, 'bi-monthly');
});

// =============================================================================
// Additional: blocked fields count includes all unavailable fields
// =============================================================================
test('blockedFieldsPage8 returns all unavailable fields', () => {
  const blocked = D.blockedFieldsPage8(payloadA());
  // With commercial NOT_QUOTED payload: savings (7 fields), EMI, bank, QR, docs = many blocked
  assert.ok(blocked.length >= 10, `expected >=10 blocked, got ${blocked.length}`);
  // Each has label + dependency + note
  for (const b of blocked) {
    assert.ok(b.label);
    assert.ok(b.dependency);
  }
});

// =============================================================================
// Additional: complete payload renders available fields correctly
// =============================================================================
test('complete payload available fields render in HTML', () => {
  const html = D.renderPage8(payloadA());
  assert.ok(html.includes('8,500'));     // bill amount
  assert.ok(html.includes('monthly'));   // billing cycle
  // System size and total investment are in savingsPageFields but
  // NOT rendered in approved Page 8 design — check them in fields instead
  const fields = D.savingsPageFields(payloadA());
  const sys = fields.find(f => f.label === 'System Size');
  assert.ok(sys.available);
  assert.ok(sys.value.includes('10 kW'));
});

// =============================================================================
// Additional: subsidy not shown in commercial output
// =============================================================================
test('subsidy row omitted from commercial output economics section', () => {
  const html = D.renderPage8(payloadA());
  // The Subsidy row should not render in the economics block for NOT_QUOTED
  // because isSubsidyOff = true and the template skips it
  // Approved design has no separate subsidy row — verify no subsidy amount in output
  assert.ok(!html.includes('78,000'));
  assert.ok(!html.includes('PM Surya Ghar'));
});
