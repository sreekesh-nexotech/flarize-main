/**
 * Chromium visual verification for Page 8 — Mock Calculation Data.
 *
 * Tests BOTH:
 *   1. Residential TEST_ONLY scenario — savings, subsidy, EMI, graph populated
 *   2. Commercial scenario — subsidy NOT_QUOTED, savings/EMI blocked
 *
 * Uses Playwright route interception to inject mock calculation data into the
 * payload API response, since the server-side workspace doesn't know about
 * mock providers. This mirrors what will happen when real engines are wired.
 */
import http from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { chromium } from 'playwright';
import { ROLES } from '../src/lib/bomRoles.js';
import { createProjectBomSnapshot } from '../src/lib/bomSnapshot.js';
import { createCommercialSnapshot } from '../src/lib/commercialSnapshot.js';
import { COST_STATUS } from '../src/lib/costEngine.js';
import { PRICING_STATUS } from '../src/lib/pricingEngine.js';
import * as QP from '../src/lib/quotationPayload.js';
import { mockSavingsResult, mockSubsidyResult, mockFinancingResult, MOCK_SOURCE, MOCK_STATUS } from '../src/lib/mockCalculationProviders.js';

const require = createRequire(import.meta.url);
const AT = '2026-08-26T00:00:00Z';
const TOKEN = 'browser-test-p8';
const STATE_FILE = join(tmpdir(), `flarize-browser-p8-${process.pid}.json`);

const COMPONENT_ATTRS = {
  'pan-m1': { brand: 'MockPanel', model: 'MP-550', technology: 'N-Type TOPCon Bifacial', moduleWatt: 550, warranty: '25 Year' },
  'inv-m1': { brand: 'MockInverter', model: 'MI-5K', technology: 'String Inverter', specification: 'String Inverter', phase: 'Single Phase', capacity: '5 kW', warranty: '10 Years' },
  'str-m1': { brand: 'MockStructure', specification: 'GI Structure for Flat Roof' },
  'acdb-m1': { brand: 'M-ACDB', specification: 'MCB with SPD' },
  'dcdb-m1': { brand: 'M-DCDB', specification: 'MCB Single Phase' },
  'dc-m1': { brand: 'M-DC Cable', crossSection: '4' },
  'ac-m1': { brand: 'M-AC Cable', crossSection: '4' },
  'earth-m1': { specification: '8 SWG (15m)', brand: 'M-Earth' },
};

function bomSnapshot() {
  return createProjectBomSnapshot({
    projectId: 'PRJ-M1', lockedBy: 'ph1', lockedAt: AT, dataVersion: 'catalog.7', engineeringStatus: 'VALID',
    bomLines: [
      { componentId: 'pan-m1', role: ROLES.PANEL, quantity: 9 },
      { componentId: 'inv-m1', role: ROLES.INVERTER, quantity: 1 },
      { componentId: 'str-m1', role: ROLES.STRUCTURE, quantity: 1 },
      { componentId: 'acdb-m1', role: ROLES.ACDB, quantity: 1 },
      { componentId: 'dcdb-m1', role: ROLES.DCDB, quantity: 1 },
      { componentId: 'dc-m1', role: ROLES.DC_CABLE, quantity: 30 },
      { componentId: 'ac-m1', role: ROLES.AC_CABLE, quantity: 20 },
      { componentId: 'earth-m1', role: ROLES.EARTHING, quantity: 1 },
    ],
  });
}

function commercialSnapshot() {
  return createCommercialSnapshot({
    snapshotId: 'CS-M1', issuedBy: 'ph1', issuedAt: AT,
    costResult: {
      status: COST_STATUS.COMPLETE, projectId: 'PRJ-M1', bomSnapshotId: 'BOM-M1',
      catalogVersion: 'catalog.7', procurementPriceVersion: 'pp.3', landedCostVersion: 'lc.2',
      projectRateCardVersion: 'rc.4', costConfigVersion: 'cc.5', costEngineVersion: 'costEngine.1',
      materialLandedCost: 180000, structureCost: 12000, installationCost: 15000, siteSurveyCost: 500,
      engineeringDesignCost: 2000, transportationCost: 2000, serviceAmcCost: 3000,
      miscellaneousCost: 2000, officeExpenseAllocation: 4500, specialProjectWorksCost: 0,
      directProjectCost: 210000, totalActualProjectCost: 221000, traces: [],
    },
    pricingResult: {
      status: PRICING_STATUS.COMPLETE, marginVersion: 'margin.2', gstVersion: 'gst.1',
      pricingEngineVersion: 'pricingEngine.1', marginType: 'GROSS_MARGIN',
      targetGrossMargin: 0.18, sellingPriceBeforeGST: 269512, grossProfit: 48512,
      gstRatePct: 8.9, gstAmount: 23987, sellingPriceIncludingGST: 293499,
      extras: [], extrasIncludingGST: 0, customerTotalIncludingGST: 293499, customerSideExpenses: [],
    },
  });
}

// --- server ---
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
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { reject(new Error('bad JSON')); } });
    req.on('error', reject);
  });
}
function isAdmin() { return true; }

/** Inject mock calculation data into a payload (route interception layer). */
function injectMockData(payload) {
  const sr = mockSavingsResult({ systemSizeKw: 5, currentBillAmount: 6000 });
  const sub = mockSubsidyResult({ systemSizeKw: 5 });
  const fin = mockFinancingResult({ loanAmount: 232000 });

  return {
    ...payload,
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

async function main() {
  const transport = require('../server-quotation.js');
  await transport.init({ stateFile: STATE_FILE });
  transport.register(addRoute, { send, parseBody, isAdmin });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const hit = routes.find(r => r.method === req.method && r.regex.test(url.pathname));
    if (hit) {
      const m = hit.regex.exec(url.pathname); const params = {};
      hit.keys.forEach((k, i) => { params[k] = m[i + 1]; });
      return hit.handler(req, res, params, url.searchParams);
    }
    const path = join('public', url.pathname === '/' ? 'quotation-document.html' : url.pathname);
    try {
      const content = (await import('node:fs')).readFileSync(path);
      const ext = path.split('.').pop();
      const types = { html: 'text/html', js: 'application/javascript', css: 'text/css', jpg: 'image/jpeg', png: 'image/png' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(content);
    } catch { res.writeHead(404); res.end('Not found'); }
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  // Seed data
  const headers = { 'Content-Type': 'application/json', authorization: `Bearer ${TOKEN}`, 'x-actor-role': 'PROJECT_HEAD', 'x-actor-user': 'm1' };
  await fetch(`${base}/api/quotation/bom-snapshots`, { method: 'POST', headers, body: JSON.stringify({ bomSnapshotId: 'BOM-M1', snapshot: bomSnapshot() }) });
  await fetch(`${base}/api/quotation/commercial-snapshots`, { method: 'POST', headers, body: JSON.stringify({ snapshot: commercialSnapshot() }) });

  const salesH = { ...headers, 'x-actor-role': 'SALES' };
  await fetch(`${base}/api/quotation/quotations`, {
    method: 'POST', headers: salesH,
    body: JSON.stringify({
      quotationId: 'Q-MOCK-RESI', projectId: 'PRJ-M1', at: AT,
      quotationNumber: 'FLZ-MOCK-001', quotationVersion: 1, quotationDate: '2026-08-26',
      validUntil: '2026-09-10', proposalBy: 'Mock Advisor', status: 'DRAFT',
      customer: { customerId: 'C-M1', customerName: 'Mock Resident', address: '10 Solar Lane', pincode: '682001', phone: '9000000001', currentBillAmount: 6000, currentBillCycle: 'monthly' },
      system: { systemType: 'ONGRID', systemSizeKw: 5, phase: 'SINGLE', packageTier: 'VALUE', roofType: 'FLAT' },
      engineering: { status: 'VALID', blocked: [], warnings: [] },
      bomSnapshotId: 'BOM-M1', commercialSnapshotId: 'CS-M1',
      componentAttributes: COMPONENT_ATTRS,
      subsidyTreatment: QP.SUBSIDY_TREATMENT.ENGINE_RESULT,
    }),
  });

  // Browser
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // ===== SCENARIO 1: Residential with mock data (route interception) =====
  console.log('\n=== SCENARIO 1: Residential TEST_ONLY ===');
  const resiPage = await browser.newPage({ viewport: { width: 1200, height: 1600 } });

  // Intercept payload API to inject mock calculation data
  await resiPage.route('**/api/quotation/quotations/*/payload', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.payload = injectMockData(body.payload);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await resiPage.goto(`${base}/quotation-document.html`);
  await resiPage.waitForTimeout(2500);

  const sections = await resiPage.$$('section.page');
  console.log(`Rendered ${sections.length} page section(s)`);

  const p8 = await resiPage.$('[data-page-section="SAVINGS_AND_PAYMENT"]');
  if (p8) {
    console.log('Page 8 SAVINGS_AND_PAYMENT section found');
    await p8.screenshot({ path: '/tmp/src/tests/page8-residential-mock-screenshot.png' });
    console.log('Screenshot saved: tests/page8-residential-mock-screenshot.png');

    const p8overflow = await resiPage.evaluate(() => {
      const el = document.querySelector('[data-page-section="SAVINGS_AND_PAYMENT"]');
      return el ? el.scrollWidth > el.clientWidth : false;
    });
    console.log(`Horizontal overflow: ${p8overflow}`);

    const p8text = await p8.evaluate(el => el.innerText);

    // Approved design sections
    console.log(`"Your Savings Over Time" visible: ${p8text.includes('Your Savings Over Time')}`);
    console.log(`"Without Solar" visible: ${p8text.includes('Without Solar')}`);
    console.log(`"With Solar" visible: ${p8text.includes('With Solar')}`);
    console.log(`"Monthly Bill Reduction" visible: ${p8text.includes('Monthly Bill Reduction')}`);
    console.log(`"Monthly Savings" visible: ${p8text.includes('Monthly Savings')}`);
    console.log(`"25-Year Net Savings" visible: ${p8text.includes('25-Year Net Savings')}`);
    console.log(`"Key Takeaway" visible: ${p8text.includes('Key Takeaway')}`);
    console.log(`"Book now" visible: ${p8text.includes('Book now')}`);
    console.log(`"Required Documents" ABSENT (correct): ${!p8text.includes('Required Documents')}`);
    console.log(`"Additional Structure cost" ABSENT (correct): ${!p8text.includes('Additional Structure cost')}`);
    console.log(`"Bank Transfer" visible: ${p8text.includes('Bank Transfer')}`);

    // Mock metadata (data attributes, NOT visible banner)
    const calcSource = await p8.getAttribute('data-calculation-source');
    const calcStatus = await p8.getAttribute('data-calculation-status');
    console.log(`Calculation source: ${calcSource}`);
    console.log(`Calculation status: ${calcStatus}`);

    // NO TEST_ONLY banner on customer-facing page
    console.log(`NO TEST_ONLY banner (correct): ${!p8text.includes('TEST ONLY')}`);
    if (p8text.includes('TEST ONLY')) console.error('ERROR: TEST_ONLY banner found on customer-facing page');

    // Mock values visible in approved positions
    console.log(`Lifetime savings ₹15,60,000 present: ${p8text.includes('15,60,000')}`);
    console.log(`Return period 42 months present: ${p8text.includes('42 months')}`);
    console.log(`Current bill ₹6,000 present: ${p8text.includes('6,000')}`);
    console.log(`Monthly savings range present: ${p8text.includes('4,000')}`);

    // Graph rendered — line chart (polyline, not bars)
    const hasGraph = await p8.evaluate(el => !!el.querySelector('[data-graph-rendered="true"]'));
    console.log(`Graph rendered: ${hasGraph}`);
    const hasPolyline = await p8.evaluate(el => !!el.querySelector('svg polyline'));
    console.log(`Graph uses polyline (line chart): ${hasPolyline}`);
    console.log(`Graph title: ${p8text.includes('Cumulative Electricity Costs Over 25 Years')}`);

    // No internal data
    const p8internal = ['gross margin', 'cost price', 'RBAC'];
    for (const t of p8internal) {
      if (p8text.toLowerCase().includes(t.toLowerCase())) console.error(`ERROR: internal term "${t}" found in Page 8`);
    }

    // No broken images
    const brokenImages = await resiPage.evaluate(() => {
      const imgs = document.querySelectorAll('[data-page-section="SAVINGS_AND_PAYMENT"] img');
      return [...imgs].filter(i => !i.complete || i.naturalHeight === 0).map(i => i.src);
    });
    console.log(`Broken images: ${brokenImages.length}${brokenImages.length ? ' — ' + brokenImages.join(', ') : ''}`);
  } else {
    console.error('ERROR: Page 8 section NOT found');
  }

  // Full page screenshot — residential
  await resiPage.screenshot({ path: '/tmp/src/tests/page8-full-document-residential-screenshot.png', fullPage: true });
  console.log('Full document screenshot (residential) saved');

  // Page 1 still renders
  const p1 = await resiPage.$('[data-page-section="COVER_AND_PROPOSAL_DETAILS"]');
  console.log(`Page 1 still renders: ${!!p1}`);

  // No internal dashboard
  const dashText = await resiPage.evaluate(() => document.body.innerText);
  const internalTerms = ['Generation gate', 'Engineering verdict', 'RBAC', 'Acting role'];
  for (const t of internalTerms) {
    if (dashText.includes(t)) console.error(`ERROR: internal term "${t}" found on customer document`);
  }

  await resiPage.close();

  // ===== SCENARIO 2: Commercial (no mock data, standard blocked) =====
  console.log('\n=== SCENARIO 2: Commercial (no mock, blocked) ===');

  // Create commercial quotation
  await fetch(`${base}/api/quotation/quotations`, {
    method: 'POST', headers: salesH,
    body: JSON.stringify({
      quotationId: 'Q-MOCK-COM', projectId: 'PRJ-M1', at: AT,
      quotationNumber: 'FLZ-MOCK-002', quotationVersion: 1, quotationDate: '2026-08-26',
      validUntil: '2026-09-10', proposalBy: 'Mock Advisor', status: 'DRAFT',
      customer: { customerId: 'C-COM', customerName: 'CommercialCorp', address: '1 Biz Rd', pincode: '600001', phone: '9888888888', currentBillAmount: 25000, currentBillCycle: 'monthly' },
      system: { systemType: 'ONGRID', systemSizeKw: 10, phase: 'THREE', packageTier: 'VALUE', roofType: 'FLAT' },
      engineering: { status: 'VALID', blocked: [], warnings: [] },
      bomSnapshotId: 'BOM-M1', commercialSnapshotId: 'CS-M1',
      componentAttributes: COMPONENT_ATTRS,
      subsidyTreatment: QP.SUBSIDY_TREATMENT.NOT_QUOTED,
    }),
  });

  // No route interception — use server payload as-is (blocked)
  const comPage = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
  await comPage.goto(`${base}/quotation-document.html`);
  await comPage.waitForTimeout(2000);

  // Select the commercial quotation (second dropdown option)
  const opts = await comPage.evaluate(() => {
    const sel = document.getElementById('qid');
    return sel ? [...sel.options].map(o => o.value) : [];
  });
  console.log(`Available quotations: ${opts.join(', ')}`);
  if (opts.includes('Q-MOCK-COM')) {
    await comPage.evaluate(() => {
      const sel = document.getElementById('qid');
      sel.value = 'Q-MOCK-COM';
      sel.dispatchEvent(new Event('change'));
    });
    await comPage.waitForTimeout(2000);
  }

  const p8com = await comPage.$('[data-page-section="SAVINGS_AND_PAYMENT"]');
  if (p8com) {
    console.log('Page 8 commercial section found');
    await p8com.screenshot({ path: '/tmp/src/tests/page8-commercial-screenshot.png' });
    console.log('Screenshot saved: tests/page8-commercial-screenshot.png');

    const p8comText = await p8com.evaluate(el => el.innerText);
    console.log(`No subsidy in commercial: ${!p8comText.includes('PM Surya Ghar')}`);
    console.log(`No TEST_ONLY banner: ${!p8comText.includes('TEST ONLY')}`);
    console.log(`Savings blocked: ${p8comText.includes('Not available')}`);

    const p8comOverflow = await comPage.evaluate(() => {
      const el = document.querySelector('[data-page-section="SAVINGS_AND_PAYMENT"]');
      return el ? el.scrollWidth > el.clientWidth : false;
    });
    console.log(`Commercial horizontal overflow: ${p8comOverflow}`);

    // No graph
    const hasComGraph = await p8com.evaluate(el => !!el.querySelector('[data-graph-rendered="true"]'));
    console.log(`Commercial graph absent: ${!hasComGraph}`);
  } else {
    console.error('ERROR: Commercial Page 8 section NOT found');
  }

  await comPage.close();
  await browser.close();
  await new Promise(r => server.close(r));
  try { rmSync(STATE_FILE, { force: true }); } catch {}
  console.log('\nDone. Page 8 mock visual verification complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
