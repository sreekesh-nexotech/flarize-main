// PHASE 3 — PART H, STEP 4 — QUOTATION INTERNAL VIEW (public/quotation.html).
//
// The page's view layer is exercised against REAL API responses: a real
// node:http server runs the real server-quotation.js handlers, the test fetches
// the real payload, and the page's own render functions turn it into HTML.
// The page script is evaluated in a node:vm with no DOM, so only the pure view
// functions run — which is the point: rendering must not need a browser
// because it must not do anything but format what the API sent.
//
// The load-bearing assertions are negative: no formula, no total, no catalog,
// no component resolution, no clock, no second RBAC, no hardcoded C6/C7/C13/C14.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
import { readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ROLES } from '../src/lib/bomRoles.js';
import { createProjectBomSnapshot } from '../src/lib/bomSnapshot.js';
import { createCommercialSnapshot } from '../src/lib/commercialSnapshot.js';
import { COST_STATUS } from '../src/lib/costEngine.js';
import { PRICING_STATUS } from '../src/lib/pricingEngine.js';
import * as QP from '../src/lib/quotationPayload.js';

const require = createRequire(import.meta.url);
const HTML = readFileSync('public/quotation.html', 'utf8');
const SCRIPT = HTML.slice(HTML.indexOf('<script>') + 8, HTML.lastIndexOf('</script>'));

const AT = '2026-08-16T00:00:00Z';
const AT2 = '2026-09-01T00:00:00Z';
const TOKEN = 'ui-test-token';
const STATE_FILE = join(tmpdir(), `flarize-quotation-ui-${process.pid}.json`);

// ---------------------------------------------------------------------------
// evaluate the page's view layer with no DOM at all
// ---------------------------------------------------------------------------

const dummyEl = () => ({ onclick: null, innerHTML: '', textContent: '', hidden: false, style: {}, classList: { add(){}, remove(){}, toggle(){} }, setAttribute(){}, removeAttribute(){}, addEventListener(){}, appendChild(){}, querySelectorAll(){ return []; } });
const sandbox = vm.createContext({
  console,
  flarizeNav: { init() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  document: { getElementById() { return dummyEl(); }, querySelector() { return dummyEl(); }, querySelectorAll() { return []; }, createElement() { return dummyEl(); }, addEventListener() {} },
  location: { href: '' },
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  window: {},
  alert() {},
});
vm.runInContext(SCRIPT, sandbox);
const QV = sandbox.QuotationView;

// ---------------------------------------------------------------------------
// real API
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
  await seed();
});

after(async () => {
  await new Promise(r => server.close(r));
  try { rmSync(STATE_FILE, { force: true }); } catch { /* nothing to clean */ }
});

async function call(method, path, { role = 'SALES', user = 's1', body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${TOKEN}`,
      'x-actor-role': role, 'x-actor-user': user },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const PH = { role: 'PROJECT_HEAD', user: 'ph1' };

function bomSnapshot() {
  return createProjectBomSnapshot({
    projectId: 'PRJ-1', lockedBy: 'ph1', lockedAt: AT, dataVersion: 'catalog.7', engineeringStatus: 'VALID',
    bomLines: [
      { componentId: 'p1', role: ROLES.PANEL, quantity: 9 },
      { componentId: 'i1', role: ROLES.INVERTER, quantity: 1 },
      { componentId: 'GHOST-99', role: ROLES.MONITORING, quantity: 1 },
      { componentId: 'bc1', role: ROLES.BATTERY_CABLE, quantity: 4 },
    ],
  });
}

function commercialSnapshot(id) {
  return createCommercialSnapshot({
    snapshotId: id, issuedBy: 'ph1', issuedAt: AT,
    costResult: {
      status: COST_STATUS.COMPLETE, projectId: 'PRJ-1', bomSnapshotId: 'BOM-1',
      catalogVersion: 'catalog.7', procurementPriceVersion: 'pp.3', landedCostVersion: 'lc.2',
      projectRateCardVersion: 'rc.4', costConfigVersion: 'cc.5', costEngineVersion: 'costEngine.1',
      materialLandedCost: 200000, structureCost: 15000, installationCost: 18000, siteSurveyCost: 500,
      engineeringDesignCost: 3000, transportationCost: 2500, serviceAmcCost: 4000,
      miscellaneousCost: 2430, officeExpenseAllocation: 6000, specialProjectWorksCost: 0,
      directProjectCost: 243000, totalActualProjectCost: 251430, traces: [],
    },
    pricingResult: {
      status: PRICING_STATUS.COMPLETE, marginVersion: 'margin.2', gstVersion: 'gst.1',
      pricingEngineVersion: 'pricingEngine.1', marginType: 'GROSS_MARGIN',
      targetGrossMargin: 0.18, sellingPriceBeforeGST: 306622, grossProfit: 55192,
      gstRatePct: 8.9, gstAmount: 27289.36, sellingPriceIncludingGST: 333911.36,
      extras: [{ extraId: 'EX-CIVIL', description: 'Civil work', includedInBase: false,
        customerPriceExcludingGST: 10000, gstRatePct: 18, customerPriceIncludingGST: 11800 }],
      extrasIncludingGST: 11800, customerTotalIncludingGST: 345711.36,
      customerSideExpenses: [{ id: 'NET-METER', label: 'Net metering (KSEB)', amount: 12000 }],
    },
  });
}

const DRAFT = (id, over = {}) => ({
  quotationId: id, projectId: 'PRJ-1', at: AT,
  quotationNumber: `FLZ-${id}`, quotationDate: AT, proposalBy: 's1',
  customer: { customerId: 'C-1', customerName: 'Test Customer', district: 'Ernakulam', state: 'Kerala' },
  system: { systemType: 'ONGRID', systemSizeKw: 5, phase: 'SINGLE', packageTier: 'VALUE', roofType: 'SHEET' },
  engineering: { status: 'VALID', blocked: [], warnings: [] },
  bomSnapshotId: 'BOM-1', commercialSnapshotId: 'CS-1',
  subsidyTreatment: QP.SUBSIDY_TREATMENT.NOT_QUOTED, ...over,
});

async function seed() {
  await call('POST', '/api/quotation/bom-snapshots', { ...PH, body: { bomSnapshotId: 'BOM-1', snapshot: bomSnapshot() } });
  await call('POST', '/api/quotation/commercial-snapshots', { ...PH, body: { snapshot: commercialSnapshot('CS-1') } });
  await call('POST', '/api/quotation/quotations', { body: DRAFT('Q-UI') });
  await call('POST', '/api/quotation/quotations', { body: DRAFT('Q-UI-BLOCKED', { subsidyTreatment: null, customer: null }) });
}

const payloadFor = async (id, who = {}) =>
  (await call('GET', `/api/quotation/quotations/${id}/payload`, who)).body.payload;

// ---------------------------------------------------------------------------
// 1. source purity
// ---------------------------------------------------------------------------

test('the page has no clock and no randomness (except the operation-timestamp fallback)', () => {
  // 2026-09-09: the hidden operation-timestamp field still wins; when it is
  // blank the browser clock supplies the `at` for Issue / Create revision (the
  // same thing sales.html does). No other clock use, no randomness, and the
  // renderer itself remains clock-free (asserted elsewhere).
  const withoutAtFallback = HTML.replace(/const atValue = \(\) => \(\$\('at'\)\.value \|\| new Date\(\)\.toISOString\(\)\);/, '');
  assert.ok(withoutAtFallback.length < HTML.length, 'atValue fallback present');
  assert.equal(/Date\.now|new Date|Math\.random/.test(withoutAtFallback), false);
});

test('the page contains no commercial formula and computes no total', () => {
  // no arithmetic is ever applied to a number the API sent
  assert.equal(/\bNumber\([^)]*\)\s*[+\-*/]/.test(SCRIPT), false);
  assert.equal(/\.reduce\(|parseFloat|parseInt|Math\./.test(SCRIPT), false);
  assert.equal(/\/\s*\(\s*1\s*-|\*\s*\(\s*1\s*\+/.test(SCRIPT), false);
  // the only accumulation in the file is string building
  for (const m of SCRIPT.match(/\w+\s*\+=/g) || []) assert.equal(m.replace(/\s*\+=/, ''), 'html');
});

test('the page has no subsidy, savings, EMI or load-estimation logic', () => {
  assert.equal(/payback|emiAmount|loanAmount|interestRate|tenure|dailyUnits|generationKwh|dcAcRatio/i.test(SCRIPT), false);
});

test('the page imports no catalog and resolves no component', () => {
  assert.equal(/catalog|findComponent|resolveComponent|componentAttributesFor|byName/i.test(SCRIPT), false);
});

test('the page implements no second RBAC system', () => {
  assert.equal(/CAPABILITY_MATRIX|capabilitiesOf|hasCapability|ROLE_PERMISSIONS|COST_VIEW/.test(SCRIPT), false);
});

test('no company identity, tier display name or page number is hardcoded (C6/C7/C13/C14)', () => {
  for (const s of ['GSTIN', 'Golden Ray Renewable', 'Pvt Ltd', 'Private Limited', 'CIN']) {
    assert.equal(HTML.includes(s), false, `${s} must not be hardcoded`);
  }
  for (const s of ['Basic', 'Smart', 'Premium']) {
    assert.equal(SCRIPT.includes(`'${s}'`), false, `tier display name ${s} must not be hardcoded`);
  }
  assert.equal(/pageNumber|Page \d|@media print|@page/.test(HTML), false);
});

test('the page declares itself an internal view, not the customer document', () => {
  assert.ok(HTML.includes('Internal view — not the customer document'));
  assert.ok(/NOT THE CUSTOMER QUOTATION DOCUMENT/.test(HTML));
});

// ---------------------------------------------------------------------------
// 2. rendering real API data
// ---------------------------------------------------------------------------

test('quotation status renders from the real API', async () => {
  const q = (await call('GET', '/api/quotation/quotations/Q-UI')).body;
  const payload = await payloadFor('Q-UI');
  const html = QV.viewStatus(q, payload);
  assert.ok(html.includes('Q-UI'));
  assert.ok(html.includes('FLZ-Q-UI'));
  assert.ok(html.includes('pill DRAFT'));
  assert.ok(html.includes('OPERATOR_ASSERTED_ROLE'));
});

test('customer information renders from the payload', async () => {
  const html = QV.viewCustomer((await payloadFor('Q-UI')).customer);
  assert.ok(html.includes('Test Customer'));
  assert.ok(html.includes('Ernakulam'));
  assert.ok(html.includes('CUSTOMER_RECORD'));
});

test('system configuration renders, with the C6 tier display name resolved (revised 2026-09-02)', async () => {
  const p = await payloadFor('Q-UI');
  const html = QV.viewSystem(p.system, p.upgrade);
  assert.ok(html.includes('ONGRID'));
  assert.ok(html.includes('VALUE'), 'the internal tier code is shown unchanged');
  // C6 revised 2026-09-02: value tier customer-facing name = "Smart System"
  assert.ok(p.system.packageTierDisplayName.available, 'tier display name is available');
  assert.equal(p.system.packageTierDisplayName.value, 'Smart System', 'tier display name matches revised C6');
  assert.equal(p.system.packageTierDisplayName.source, 'BUSINESS_DECISION_C6');
});

test('BOM rows render from the payload, internal-only lines excluded', async () => {
  const html = QV.viewBom((await payloadFor('Q-UI')).bomSummary);
  assert.ok(html.includes('p1'));
  assert.ok(html.includes('i1'));
  assert.ok(html.includes('GHOST-99'), 'an unresolved component stays visible and named');
  assert.equal(html.includes('bc1'), false, 'internal-only lines must not reach the customer view');
  assert.ok(html.includes('LOCKED_BOM_SNAPSHOT'));
  assert.ok(html.includes('>9<'), 'quantity comes from the BOM, unmodified');
});

test('technical attributes render from the payload only', async () => {
  const html = QV.viewTech((await payloadFor('Q-UI')).technicalSpecifications);
  assert.ok(html.includes('Waaree'), 'attribute supplied by the API');
  assert.ok(html.includes('540'));
  assert.ok(/GHOST-99[\s\S]*not substituted/.test(html), 'an id with no attributes is not substituted');
  assert.ok(html.includes('COMPONENT_DISPLAY_ATTRIBUTES'), 'missing warranty names its dependency');
});

test('pricing renders from the payload and matches the API figures exactly', async () => {
  const p = await payloadFor('Q-UI', PH);
  const html = QV.viewCommercial(p.pricing);
  assert.ok(html.includes('3,06,622'));
  assert.ok(html.includes('3,45,711.36'));
  assert.ok(html.includes('CS-1'));
  assert.ok(html.includes('COMMERCIAL_SNAPSHOT'));
  // the discount the snapshot does not pin is shown blocked, not zero
  assert.ok(html.includes('BLOCKED'));
});

test('GST renders from the payload', async () => {
  const html = QV.viewGst((await payloadFor('Q-UI')).pricing);
  assert.ok(html.includes('8.9%'));
  assert.ok(html.includes('27,289.36'));
  assert.ok(html.includes('SOLAR_70_30_COMPOSITE'));
});

test('extras and customer-side expenses render with their treatments', async () => {
  const html = QV.viewExtras((await payloadFor('Q-UI')).extras);
  assert.ok(html.includes('EX-CIVIL'));
  assert.ok(html.includes('pill EXTRA'));
  assert.ok(html.includes('NET-METER'));
  assert.ok(html.includes('pill EXCLUDED'));
});

test('the engineering verdict renders and is marked not customer-visible', async () => {
  const html = QV.viewEngineering((await payloadFor('Q-UI')).engineering);
  assert.ok(html.includes('pill VALID'));
  assert.ok(html.includes('Customer visible'));
  assert.ok(html.includes('false'));
});

// ---------------------------------------------------------------------------
// 3. blocked states are never money and never blank
// ---------------------------------------------------------------------------

test('every §20–§25 blocked section renders BLOCKED with its named dependency', async () => {
  const html = QV.viewBlocked(await payloadFor('Q-UI'));
  for (const dep of ['SAVINGS_ENGINE', 'FINANCE_ENGINE', 'ENERGY_LOAD_CALCULATION_ENGINE',
    'CMS', 'COMPANY_MASTER', 'SUBSIDY_ENGINE']) {
    assert.ok(html.includes(dep), `${dep} must be named`);
  }
  assert.ok(html.includes('NOT_QUOTED'), 'the explicit subsidy treatment is shown');
});

test('a blocked section never renders ₹0, a blank or "coming soon"', async () => {
  const html = QV.viewBlocked(await payloadFor('Q-UI'));
  assert.equal(html.includes('₹0'), false);
  assert.equal(/coming soon|TBD|to be decided/i.test(html), false);
  assert.equal(/<b>BLOCKED<\/b>[\s\S]{0,40}<\/div>\s*<\/div>/.test(html), false, 'a blocked block always carries text');
  assert.ok((html.match(/Dependency:/g) || []).length >= 6);
});

test('pricing blocked by a missing snapshot renders BLOCKED, never ₹0', () => {
  const html = QV.viewCommercial({ available: false, customer: null, internal: null,
    blocked: { available: false, value: null, dependency: 'COMMERCIAL_SNAPSHOT', reference: '§17', reason: 'No ISSUED commercial snapshot supplied.' } });
  assert.ok(html.includes('BLOCKED'));
  assert.ok(html.includes('COMMERCIAL_SNAPSHOT'));
  assert.equal(html.includes('₹0'), false);
});

// ---------------------------------------------------------------------------
// 4. gate, errors, versions
// ---------------------------------------------------------------------------

test('generation-gate failures render every failed check and reason', async () => {
  const gate = (await call('GET', '/api/quotation/quotations/Q-UI-BLOCKED/gate')).body;
  const html = QV.viewGate(gate);
  assert.ok(html.includes('pill BLOCKED'));
  assert.ok(html.includes('SUBSIDY_RESOLVED'));
  assert.ok(html.includes('CUSTOMER_DATA'));
  assert.ok(html.includes('Subsidy treatment unresolved'));
  assert.equal((html.match(/<tr>/g) || []).length, 9);   // 1 header row + 8 gate checks
});

test('a GENERATION_BLOCKED API error renders its code, checks and reasons', async () => {
  // With subsidy engine, null subsidyTreatment auto-derives NOT_QUOTED. CUSTOMER_DATA still fails.
  const r = await call('POST', '/api/quotation/quotations/Q-UI-BLOCKED/issue', { body: { at: AT } });
  assert.equal(r.body.code, 'GENERATION_BLOCKED');
  const html = QV.viewApiError(r.body);
  assert.ok(html.includes('GENERATION_BLOCKED'));
  assert.ok(html.includes('CUSTOMER_DATA'));
  assert.ok(html.includes('Quotation generation disabled'));
});

test('the UI cannot bypass the server gate — the button state is presentation only', async () => {
  // the page disables the button, and the server refuses even when it is not disabled
  assert.ok(SCRIPT.includes("$('issue').disabled = !gateOpen || issued;"));
  assert.ok(/disabled button prevents nothing|refuses regardless/.test(SCRIPT));
  const r = await call('POST', '/api/quotation/quotations/Q-UI-BLOCKED/issue', { body: { at: AT } });
  assert.equal(r.status, 409);
});

test('version history and revision state render', async () => {
  assert.equal(QV.viewVersions([], { status: 'DRAFT' }).includes('No version has been issued.'), true);

  await call('POST', '/api/quotation/quotations/Q-UI/issue', { body: { at: AT } });
  await call('POST', '/api/quotation/commercial-snapshots', { ...PH, body: { snapshot: commercialSnapshot('CS-UI-2') } });
  await call('POST', '/api/quotation/quotations/Q-UI/revise', { body: { at: AT2, changes: { commercialSnapshotId: 'CS-UI-2' } } });

  const versions = (await call('GET', '/api/quotation/quotations/Q-UI/versions')).body.versions;
  const q = (await call('GET', '/api/quotation/quotations/Q-UI')).body;
  const html = QV.viewVersions(versions, q);
  assert.ok(html.includes('pill SUPERSEDED'));
  assert.ok(html.includes('CS-1'));
  assert.ok(html.includes('Revision in progress'));
  assert.ok(html.includes('still readable'));
});

// ---------------------------------------------------------------------------
// 5. visibility follows the API, not the page
// ---------------------------------------------------------------------------

test('a Sales payload renders no internal cost or margin', async () => {
  const p = await payloadFor('Q-UI');
  assert.equal(p.pricing.internal, null);
  const html = QV.viewCommercial(p.pricing);
  assert.equal(html.includes('Total actual project cost'), false);
  assert.equal(html.includes('Target gross margin'), false);
  assert.equal(html.includes('2,51,430'), false);
  assert.ok(html.includes('Internal cost and margin are not present in this'));
  assert.ok(html.includes('COST_VIEW'), 'the API\'s own reason is shown, not reconstructed');
});

test('a Project Head payload renders the internal block from the API', async () => {
  const html = QV.viewCommercial((await payloadFor('Q-UI', PH)).pricing);
  assert.ok(html.includes('2,51,430'));
  assert.ok(html.includes('Target gross margin'));
  assert.ok(html.includes('0.18'), 'the margin is displayed exactly as the API sent it');
});

test('the page reconstructs nothing when a field is withheld', async () => {
  const p = await payloadFor('Q-UI');
  const html = QV.viewCommercial(p.pricing);
  // customer figures still render — only the internal block is absent
  assert.ok(html.includes('3,06,622'));
  assert.equal(/margin.*0\.18/.test(html), false);
});
