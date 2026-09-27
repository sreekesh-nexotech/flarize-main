// PART H — CUSTOMER QUOTATION DOCUMENT, HYBRID STEP 1: PAGE 1.
//
// This suite proves the customer quotation is the SUPPLIED artwork with the
// customer-data region bound to the approved payload — and that it is not the
// internal workspace viewer, not a redesign, and not a carrier for the example
// values baked into the original artifact.
//
// The load-bearing assertions are negative: no calculation, no catalog, no
// engine import, no internal cost or margin, no RBAC, no clock, and none of the
// artwork's example customer/legal values anywhere in the shipped files.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as D from '../public/lib/quotationDocument.js';
import { ROLES } from '../src/lib/bomRoles.js';
import { createProjectBomSnapshot } from '../src/lib/bomSnapshot.js';
import { createCommercialSnapshot } from '../src/lib/commercialSnapshot.js';
import { COST_STATUS } from '../src/lib/costEngine.js';
import { PRICING_STATUS } from '../src/lib/pricingEngine.js';
import * as QP from '../src/lib/quotationPayload.js';

const require = createRequire(import.meta.url);
const RENDERER_SRC = readFileSync('public/lib/quotationDocument.js', 'utf8');
const PAGE_SRC = readFileSync('public/quotation-document.html', 'utf8');
const INTERNAL_SRC = readFileSync('public/quotation.html', 'utf8');

const AT = '2026-08-16T00:00:00Z';
const TOKEN = 'doc-test-token';
const STATE_FILE = join(tmpdir(), `flarize-quotation-doc-${process.pid}.json`);

// The example values printed inside the supplied artwork. They are artifact
// evidence only (see docs/phase3/QUOTATION_TEMPLATE_FORENSIC.md §E) and must
// never appear in shipped code.
const ARTWORK_EXAMPLE_VALUES = [
  'Sareena', 'Kurukkaankizhakke', 'Azhikkode', '123456', '9809445408',
  'QUO-GR-AS-2025', '32AAUFG1464A1ZP', 'AAP-6531', '10/02/2026', '20/02/2026',
];

// ---------------------------------------------------------------------------
// payload fixtures — a real payload from the real assembler
// ---------------------------------------------------------------------------

const CUSTOMER = {
  customerId: 'C-9', customerName: 'Test Customer Nine',
  address: '12 Test Lane, Test Town', pincode: '600001', phone: '9000000009',
  district: 'Ernakulam', state: 'Kerala',
  currentBillAmount: 4200, currentBillCycle: 'bi monthly',
};
const SYSTEM = { systemType: 'ONGRID', systemSizeKw: 7, phase: 'SINGLE', packageTier: 'VALUE', roofType: 'SHEET' };
const QUOTE = {
  quotationNumber: 'FLZ-TEST-0009', quotationVersion: 1, quotationDate: '2026-08-16',
  validUntil: '2026-08-31', proposalBy: 'Test Advisor', status: 'DRAFT',
};

function bomSnapshot() {
  return createProjectBomSnapshot({
    projectId: 'PRJ-9', lockedBy: 'ph1', lockedAt: AT, dataVersion: 'catalog.7', engineeringStatus: 'VALID',
    bomLines: [
      { componentId: 'p1', role: ROLES.PANEL, quantity: 13 },
      { componentId: 'i1', role: ROLES.INVERTER, quantity: 1 },
    ],
  });
}

function commercialSnapshot(id = 'CS-9') {
  return createCommercialSnapshot({
    snapshotId: id, issuedBy: 'ph1', issuedAt: AT,
    costResult: {
      status: COST_STATUS.COMPLETE, projectId: 'PRJ-9', bomSnapshotId: 'BOM-9',
      catalogVersion: 'catalog.7', procurementPriceVersion: 'pp.3', landedCostVersion: 'lc.2',
      projectRateCardVersion: 'rc.4', costConfigVersion: 'cc.5', costEngineVersion: 'costEngine.1',
      materialLandedCost: 240000, structureCost: 17000, installationCost: 19000, siteSurveyCost: 500,
      engineeringDesignCost: 3000, transportationCost: 2500, serviceAmcCost: 4000,
      miscellaneousCost: 2860, officeExpenseAllocation: 6000, specialProjectWorksCost: 0,
      directProjectCost: 286000, totalActualProjectCost: 294860, traces: [],
    },
    pricingResult: {
      status: PRICING_STATUS.COMPLETE, marginVersion: 'margin.2', gstVersion: 'gst.1',
      pricingEngineVersion: 'pricingEngine.1', marginType: 'GROSS_MARGIN',
      targetGrossMargin: 0.18, sellingPriceBeforeGST: 359585, grossProfit: 64725,
      gstRatePct: 8.9, gstAmount: 32003, sellingPriceIncludingGST: 391588,
      extras: [], extrasIncludingGST: 0, customerTotalIncludingGST: 391588, customerSideExpenses: [],
    },
  });
}

function payloadFor(customer = CUSTOMER, system = SYSTEM, quotation = QUOTE) {
  return QP.buildQuotationPayload({
    quotation, customer, system, engineering: { status: 'VALID', blocked: [], warnings: [] },
    bomSnapshot: bomSnapshot(), commercialSnapshot: commercialSnapshot(),
    componentAttributes: {}, subsidyTreatment: QP.SUBSIDY_TREATMENT.NOT_QUOTED,
    capabilities: [], variant: 'FULL',
  });
}

// ---------------------------------------------------------------------------
// 1. it is the supplied artwork, not a redesign
// ---------------------------------------------------------------------------

test('V4 Phase 2B — Page 1 vendors the approved static artwork assets (F1 architecture)', () => {
  // The approved q-page-01.jpg is a populated MOCKUP — never rendered directly.
  // Genuine static artwork (hero photo, brand logo, signature/seal) is vendored
  // and composed via live HTML that binds every dynamic region to the payload.
  for (const asset of ['q-page-01-hero.jpg', 'q-flarize-logo-592e2a11.png', 'signature-seal.png']) {
    const p = `public/assets/quotation/${asset}`;
    assert.ok(existsSync(p), `${asset} must ship`);
    assert.ok(statSync(p).size > 1000, `${asset} must be real artwork`);
  }
  assert.equal(D.PAGE_ONE_ASSETS.hero, 'assets/quotation/q-page-01-hero.jpg');
  assert.equal(D.PAGE_ONE_ASSETS.brandLogo, 'assets/quotation/q-flarize-logo-592e2a11.png');
  assert.equal(D.PAGE_ONE.artworkSource, 'SUPPLIED_QUOTATION_ARTIFACT');
});

test('page 1 renders as a single A4 page section carrying the approved artwork and bound regions', () => {
  const html = D.renderPage1(payloadFor());
  assert.equal((html.match(/<section class="page"/g) || []).length, 1);
  assert.ok(html.includes('data-page-section="COVER_AND_PROPOSAL_DETAILS"'));
  assert.ok(html.includes('data-document-order="1"'));
  assert.ok(html.includes('assets/quotation/q-page-01-hero.jpg'));
  assert.ok(html.includes('assets/quotation/q-flarize-logo-592e2a11.png'));
  assert.ok(html.includes('assets/quotation/signature-seal.png'));
  assert.ok(html.includes('YOUR PROPOSAL DETAILS'));
  // V4 Phase 2B — approved static copy (headline + sub-tagline) must appear verbatim
  assert.ok(html.includes('Stop Worrying About Electricity Bills Forever'));
  assert.ok(html.includes('Empowering Kerala homes with clean energy, smart savings, and the joy of sustainability.'));
  assert.ok(D.PAGE_ONE_STYLES.includes('210mm') && D.PAGE_ONE_STYLES.includes('297mm'));
});

test('the artwork letter copy is reproduced verbatim, not rewritten', () => {
  const html = D.renderPage1(payloadFor());
  for (const line of [
    'Thank you for considering Flarize for your home.',
    'Choosing solar is one of the smartest decisions you can make for your home.',
    "We've carefully designed this solution specifically for your home's energy needs",
    'Warm Regards', 'Team Flarize',
  ]) assert.ok(html.includes(line), line);
});

test('the twelve artwork field labels appear in the artwork order and wording', () => {
  const { left, right } = D.proposalDetailFields(payloadFor());
  assert.deepEqual(left.map(f => f.label), ['Name', 'Address', 'Pincode', 'Phone Number', 'Current Bill', 'System Size']);
  assert.deepEqual(right.map(f => f.label), ['Quotation No.', 'Proposal By', 'Date', 'Valid Until', 'GST No', 'Company Registration']);
});

// ---------------------------------------------------------------------------
// 2. dynamic data comes from the payload
// ---------------------------------------------------------------------------

test('customer identity and quotation metadata are bound from the payload', () => {
  const html = D.renderPage1(payloadFor());
  for (const v of ['Test Customer Nine', '12 Test Lane, Test Town', '600001', '9000000009',
    'FLZ-TEST-0009', 'Test Advisor', '16 August 2026', '31 August 2026']) {
    assert.ok(html.includes(v), `${v} must be bound`);
  }
  assert.ok(html.includes('Dear Test Customer Nine,'));
});

test('system size comes from the payload', () => {
  assert.ok(D.renderPage1(payloadFor()).includes('7 kW'));
  const other = { ...SYSTEM, systemSizeKw: 3 };
  assert.ok(D.renderPage1(payloadFor(CUSTOMER, other)).includes('3 kW'));
});

test('the current bill is copied with its cycle, and formatted only', () => {
  assert.ok(D.renderPage1(payloadFor()).includes('₹4,200/bi monthly'));
  assert.equal(D.formatMoney(4200), '₹4,200');
  assert.equal(D.formatMoney(null), null, 'a missing amount is never a number');
});

test('dates are formatted for the customer, not shown as ISO strings', () => {
  assert.equal(D.formatDate('2026-08-16'), '16 August 2026');
  assert.equal(D.formatDate('2026-08-27T00:00:00.000Z'), '27 August 2026');
  assert.equal(D.formatDate('2026-01-05'), '5 January 2026');
  assert.equal(D.formatDate(null), null, 'a missing date is never invented');
  assert.equal(D.formatDate(''), null, 'an empty date is never invented');
});

test("a different customer's quotation never leaks the previous customer's values", () => {
  const first = D.renderPage1(payloadFor());
  const second = D.renderPage1(payloadFor(
    { customerId: 'C-2', customerName: 'Second Customer', address: '9 Other Road', pincode: '682001', phone: '9111111111' },
    { ...SYSTEM, systemSizeKw: 5 },
    { ...QUOTE, quotationNumber: 'FLZ-TEST-0002', proposalBy: 'Other Advisor' },
  ));
  for (const v of ['Test Customer Nine', '12 Test Lane', '600001', '9000000009', 'FLZ-TEST-0009', 'Test Advisor', '7 kW']) {
    assert.equal(second.includes(v), false, `${v} leaked into another customer's quotation`);
  }
  assert.ok(second.includes('Second Customer') && second.includes('FLZ-TEST-0002') && second.includes('5 kW'));
  assert.notEqual(first, second);
});

test('the renderer is deterministic — same payload, same HTML', () => {
  assert.equal(D.renderPage1(payloadFor()), D.renderPage1(payloadFor()));
});

// ---------------------------------------------------------------------------
// 3. nothing is invented, nothing is calculated
// ---------------------------------------------------------------------------

test('the renderer imports nothing at all — no engine, no payload module, no catalog', () => {
  const imports = [...RENDERER_SRC.matchAll(/^import[^;]*?from\s+'([^']+)'/gm)].map(m => m[1]);
  assert.deepEqual(imports, [], 'the renderer must be a pure module with no imports');
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const f of ['costEngine', 'pricingEngine', 'engineeringChecker', 'projectBom', 'money.js',
    'quotationPayload', 'quotationWorkspace', 'rbac']) {
    assert.equal(code.includes(f), false, `must not reference ${f}`);
  }
  // "catalog" survives only in the prose that forbids reading one.
  // .items is permitted for non-catalog use (e.g. inclusion matrix items).
  assert.equal(/catalog\s*[.?[]|categories|catalog\.items\b|componentAttributesFor/i.test(code), false);
});

test('the renderer performs no arithmetic on any figure', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/\bNumber\([^)]*\)\s*[+\-*/]/.test(code), false);
  // .reduce(), parseFloat, parseInt = aggregation/conversion forbidden in renderer.
  // Math.round/ceil/floor/abs = financial rounding forbidden.
  // Math.max/min on array lengths for layout sizing is permitted.
  assert.equal(/\.reduce\(|parseFloat|parseInt|Math\.(round|ceil|floor|abs)\s*\(/.test(code), false);
  assert.equal(/Math\.(min|max)\s*\([^)]*(?:price|cost|amount|margin|subsid|saving)/i.test(code), false);
  assert.equal(/\/\s*\(\s*1\s*-|\*\s*\(\s*1\s*\+|\*\s*0\.\d/.test(code), false);
});

test('no subsidy, savings, EMI or DC/AC calculation exists in the renderer or the page', () => {
  // 2026-09-09: the approved template prints the finance engine's own fields
  // (loanAmount, interestRatePct, tenureYears) as labels/values. Reading them
  // is display; computing with them is forbidden — so the guard forbids any
  // arithmetic or assignment involving those names, not the names themselves.
  for (const src of [RENDERER_SRC, PAGE_SRC]) {
    assert.equal(/emiAmount|dcAcRatio|generationKwh|unitsPerDay/i.test(src), false);
    assert.equal(/(loanAmount|interestRatePct|tenureYears|monthlyEMI|dailyPayment)\s*[-+*/%]|[-+*/%]\s*(?:\w+\.)?(loanAmount|interestRatePct|tenureYears|monthlyEMI|dailyPayment)\b/.test(src), false, 'no arithmetic on finance fields');
    assert.equal(/(loanAmount|interestRate\w*|tenure\w*)\s*=[^=]/.test(src), false, 'no assignment of finance fields');
    assert.equal(/subsidyAmount\s*=|savings\s*=|monthlySavings\s*=/i.test(src), false);
  }
});

test('no clock and no randomness', () => {
  assert.equal(/Date\.now|new Date|Math\.random/.test(RENDERER_SRC), false);
  assert.equal(/Date\.now|new Date|Math\.random/.test(PAGE_SRC), false);
});

test("none of the artwork's example customer or legal values exist in the shipped files", () => {
  for (const v of ARTWORK_EXAMPLE_VALUES) {
    assert.equal(RENDERER_SRC.includes(v), false, `${v} must not be in the renderer`);
    assert.equal(PAGE_SRC.includes(v), false, `${v} must not be in the page`);
  }
});

test('C6, C7, C13 and C14 are not silently invented', () => {
  for (const src of [RENDERER_SRC, PAGE_SRC]) {
    for (const s of ['GSTIN', 'Golden Ray Renewable', 'Pvt Ltd', 'Private Limited']) {
      assert.equal(src.includes(s), false, `${s} must not be hardcoded`);
    }
    assert.equal(/\bCIN\b/.test(src), false, 'no company identification number is hardcoded');
    for (const s of ["'Basic'", "'Smart'", "'Premium'"]) {
      assert.equal(src.includes(s), false, `tier display name ${s} must not be hardcoded`);
    }
    // no page NUMBER is ever emitted; naming the pending decision is allowed.
    // V4 Phase 2B: @page { size: A4 portrait; margin: 0 } is the physical A4
    // sizing rule required by the PDF contract — not page numbering. It is
    // explicitly permitted; only page-numbering constructs remain forbidden.
    assert.equal(/Page \s?\d+\s?(of|\/)|"pageNumber"|pageNumber:/.test(src), false);
  }
  assert.equal(D.PAGE_ONE.pageNumberDecision, 'C13_PENDING');
});

// ---------------------------------------------------------------------------
// 4. blocked dependencies stay blocked
// ---------------------------------------------------------------------------

test('the company fields render blocked, never the artwork values, and the C7 dependency is named at the JS level', () => {
  const html = D.renderPage1(payloadFor());
  assert.equal(html.includes('COMPANY_MASTER'), false, 'internal dependency names must not reach the customer-facing HTML');
  assert.ok(html.includes('Not available'));
  assert.equal(html.includes('32AAUFG1464A1ZP'), false);
  assert.equal(html.includes('AAP-6531'), false);

  const blocked = D.blockedFields(payloadFor());
  const labels = blocked.map(b => b.label);
  assert.ok(labels.includes('GST No'));
  assert.ok(labels.includes('Company Registration'));
  for (const b of blocked) assert.ok(b.dependency, `${b.label} must name its dependency`);
});

test('a missing value is never ₹0, never blank and never "TBD"', () => {
  const bare = QP.buildQuotationPayload({
    quotation: { quotationNumber: null, quotationVersion: 1, quotationDate: null },
    customer: null, system: null, engineering: null,
    bomSnapshot: null, commercialSnapshot: null,
    subsidyTreatment: null, capabilities: [],
  });
  const html = D.renderPage1(bare);
  assert.equal(html.includes('₹0'), false);
  assert.equal(/TBD|coming soon|N\/A/i.test(html), false);
  // 12 proposal-detail fields + salutation = 13 "Not available" slots.
  // V4 Phase 2B: the 3 trust badges use q-badge-blocked (visibility:hidden),
  // NOT q-blocked, so the 13 field-level slots remain the only q-blocked marks.
  assert.equal((html.match(/\bq-blocked\b/g) || []).length, 13, 'every unsupplied field is named "Not available", not blank');
  const blocked = D.blockedFields(bare);
  // V4 Phase 2B: 13 field-level + 3 trust badges + 1 footer contact = 17 blocked entries.
  assert.equal(blocked.length, 17, 'salutation + 12 fields + 3 badges + 1 footer contact all blocked when payload is bare');
  for (const dep of ['CUSTOMER_RECORD', 'QUOTATION_RECORD', 'PROJECT_CONFIGURATION']) {
    assert.ok(blocked.some(b => b.dependency === dep), `${dep} must be named at the JS level`);
    assert.equal(html.includes(dep), false, `${dep} must not leak into the customer-facing HTML`);
  }
  // V4 Phase 2B — new dependencies must also be named at the JS level
  assert.ok(blocked.some(b => b.label === 'Subsidy Badge'), 'Subsidy trust badge must be reported when suppressed');
  assert.ok(blocked.some(b => b.label === 'Homes Installed Badge'), 'Homes Installed trust badge must be reported when suppressed');
  assert.ok(blocked.some(b => b.label === 'MNRE Empanelment Badge'), 'MNRE Empanelment trust badge must be reported when suppressed');
  assert.ok(blocked.some(b => b.label === 'Footer Contact Strip'), 'Footer contact strip must be reported when suppressed');
});

test('a blocked salutation does not print an empty "Dear ,"', () => {
  const noName = D.renderPage1(payloadFor({ customerId: 'C-3', customerName: null }));
  assert.equal(noName.includes('Dear ,'), false);
  assert.ok(noName.includes('Not available'));
  assert.equal(noName.includes('CUSTOMER_RECORD'), false);
  const s = D.blockedFields(payloadFor({ customerId: 'C-3', customerName: null }))
    .find(b => b.label === 'Salutation');
  assert.equal(s.dependency, 'CUSTOMER_RECORD');
});

// ---------------------------------------------------------------------------
// 5. it is the CUSTOMER document, not the internal viewer
// ---------------------------------------------------------------------------

test('no internal cost, margin or engineering figure reaches the customer page', () => {
  const html = D.renderPage1(payloadFor());
  for (const k of ['materialLandedCost', 'totalActualProjectCost', 'targetGrossMargin', 'grossProfit',
    '294860', '2,94,860', '64,725']) {
    assert.equal(html.includes(k), false, `${k} must not reach the customer`);
  }
});

test('no gate, engineering, versions, blocked-dependency panel or RBAC UI appears', () => {
  const html = D.renderPage1(payloadFor());
  for (const s of ['Generation gate', 'Engineering verdict', 'Versions', 'Blocked dependencies',
    'Acting role', 'capabilities', 'RBAC', 'internalWithheld']) {
    assert.equal(html.includes(s), false, `${s} must not appear on the customer document`);
  }
  assert.equal(/CAPABILITY|capabilitiesOf|COST_VIEW/.test(RENDERER_SRC), false);
});

test('the customer document and the internal workspace stay separate files', () => {
  assert.ok(existsSync('public/quotation.html'), 'the internal viewer still exists');
  assert.ok(existsSync('public/quotation-document.html'), 'the customer document is its own file');
  assert.ok(INTERNAL_SRC.includes('Internal view — not the customer document'));
  assert.ok(PAGE_SRC.includes('CUSTOMER-FACING QUOTATION DOCUMENT'));
  assert.equal(PAGE_SRC.includes('Generation gate'), false);
  assert.equal(INTERNAL_SRC.includes('quotation-document.html'), false);
});

test('the customer page consumes the existing quotation API only', () => {
  assert.ok(PAGE_SRC.includes('/api/quotation/quotations/'));
  assert.ok(PAGE_SRC.includes('/payload'));
  assert.equal(/\/api\/(?!quotation)/.test(PAGE_SRC), false, 'no new API is introduced');
  assert.equal(PAGE_SRC.includes('/api/quotation/quotations/${encodeURIComponent(id)}/gate'), false);
});

// ---------------------------------------------------------------------------
// 6. real HTTP integration — payload reaches the renderer
// ---------------------------------------------------------------------------

const routes = [];
function addRoute(method, pattern, handler) {
  const keys = [];
  const rx = pattern.replace(/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  routes.push({ method, regex: new RegExp('^' + rx + '$'), keys, handler });
}
function send(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let b = ''; req.on('data', c => { b += c; });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function isAdmin(req) { return (req.headers.authorization || '') === `Bearer ${TOKEN}`; }

let server, base;

before(async () => {
  const transport = require('../server-quotation.js');
  await transport.init({ stateFile: STATE_FILE });
  transport.register(addRoute, { send, parseBody, isAdmin });
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const hit = routes.find(r => r.method === req.method && r.regex.test(url.pathname));
    if (!hit) return send(res, 404, { error: 'API route not found' });
    const m = hit.regex.exec(url.pathname); const params = {};
    hit.keys.forEach((k, i) => { params[k] = m[i + 1]; });
    await hit.handler(req, res, params, url.searchParams);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(r => server.close(r));
  try { rmSync(STATE_FILE, { force: true }); } catch { /* nothing to clean */ }
});

async function call(method, path, { role = 'SALES', body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${TOKEN}`,
      'x-actor-role': role, 'x-actor-user': 'u1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test('a payload fetched over the real API renders the customer page 1', async () => {
  await call('POST', '/api/quotation/bom-snapshots', { role: 'PROJECT_HEAD', body: { bomSnapshotId: 'BOM-9', snapshot: bomSnapshot() } });
  await call('POST', '/api/quotation/commercial-snapshots', { role: 'PROJECT_HEAD', body: { snapshot: commercialSnapshot() } });
  await call('POST', '/api/quotation/quotations', {
    body: {
      quotationId: 'Q-DOC', projectId: 'PRJ-9', at: AT,
      ...QUOTE, customer: CUSTOMER, system: SYSTEM,
      engineering: { status: 'VALID', blocked: [], warnings: [] },
      bomSnapshotId: 'BOM-9', commercialSnapshotId: 'CS-9',
      subsidyTreatment: QP.SUBSIDY_TREATMENT.NOT_QUOTED,
    },
  });

  const r = await call('GET', '/api/quotation/quotations/Q-DOC/payload');
  assert.equal(r.status, 200);

  const html = D.renderPage1(r.body.payload);
  assert.ok(html.includes('Test Customer Nine'));
  assert.ok(html.includes('FLZ-TEST-0009'));
  assert.ok(html.includes('7 kW'));
  assert.ok(html.includes('₹4,200/bi monthly'));
  assert.ok(html.includes('Not available'), 'the blocked company fields still print, without naming their dependency');
  assert.equal(html.includes('COMPANY_MASTER'), false, 'internal dependency names must not reach the customer-facing HTML');
  // the internal figures the API withheld from Sales never appear
  assert.equal(html.includes('294860'), false);
  assert.equal(html.includes('2,94,860'), false);
});

test('the rendered customer HTML is well formed and self-contained', () => {
  const html = D.renderPage1(payloadFor());
  assert.equal((html.match(/<section/g) || []).length, (html.match(/<\/section>/g) || []).length);
  assert.equal((html.match(/<div/g) || []).length, (html.match(/<\/div>/g) || []).length);
  assert.equal(/<script|onerror=|onload=/i.test(html), false, 'no script is emitted into the document');
  assert.equal(html.includes('undefined'), false);
  assert.equal(html.includes('null'), false);
});

test('payload values are HTML-escaped', () => {
  const html = D.renderPage1(payloadFor({ customerId: 'C-X', customerName: '<img src=x onerror=alert(1)>' }));
  assert.equal(html.includes('<img src=x'), false);
  assert.ok(html.includes('&lt;img src=x'));
});
