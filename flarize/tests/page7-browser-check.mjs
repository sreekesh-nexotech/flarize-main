/**
 * Chromium visual verification for Page 7 — Technical Specifications.
 * Boots the real quotation HTTP server, opens the customer document page,
 * and takes a screenshot of Page 7.
 */
import http from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { ROLES } from '../src/lib/bomRoles.js';
import { createProjectBomSnapshot } from '../src/lib/bomSnapshot.js';
import { createCommercialSnapshot } from '../src/lib/commercialSnapshot.js';
import { COST_STATUS } from '../src/lib/costEngine.js';
import { PRICING_STATUS } from '../src/lib/pricingEngine.js';
import * as QP from '../src/lib/quotationPayload.js';

const require = createRequire(import.meta.url);
const AT = '2026-08-26T00:00:00Z';
const TOKEN = 'browser-test';
const STATE_FILE = join(tmpdir(), `flarize-browser-p7-${process.pid}.json`);

const COMPONENT_ATTRS = {
  'pan-v1': { brand: 'VisualTest Panel', model: 'VTP-550', technology: 'N-Type TOPCon Bifacial', moduleWatt: 550, warranty: '12-Year Product & 25 Year Linear Performance Warranty' },
  'inv-v1': { brand: 'VisualTest Inverter', model: 'VTI-5K', technology: 'String Inverter', specification: 'String Inverter', phase: 'Single Phase', capacity: '5 kW', warranty: '10 Years' },
  'str-v1': { brand: 'VisualTest Structure', specification: 'GI Structure for Flat Roof' },
  'acdb-v1': { brand: 'VT-ACDB', specification: 'MCB with SPD (Single Phase)' },
  'dcdb-v1': { brand: 'VT-DCDB', specification: 'MCB Single Phase' },
  'dc-v1': { brand: 'VT-DC Cable', crossSection: '4' },
  'ac-v1': { brand: 'VT-AC Cable', crossSection: '4' },
  'earth-v1': { specification: '8 SWG (15m)', brand: 'VT-Earth' },
  'earth-v2': { specification: '10 SWG (20m)', brand: 'VT-Earth2' },
};

function bomSnapshot() {
  return createProjectBomSnapshot({
    projectId: 'PRJ-V1', lockedBy: 'ph1', lockedAt: AT, dataVersion: 'catalog.7', engineeringStatus: 'VALID',
    bomLines: [
      { componentId: 'pan-v1', role: ROLES.PANEL, quantity: 9 },
      { componentId: 'inv-v1', role: ROLES.INVERTER, quantity: 1 },
      { componentId: 'str-v1', role: ROLES.STRUCTURE, quantity: 1 },
      { componentId: 'acdb-v1', role: ROLES.ACDB, quantity: 1 },
      { componentId: 'dcdb-v1', role: ROLES.DCDB, quantity: 1 },
      { componentId: 'dc-v1', role: ROLES.DC_CABLE, quantity: 30 },
      { componentId: 'ac-v1', role: ROLES.AC_CABLE, quantity: 20 },
      { componentId: 'earth-v1', role: ROLES.EARTHING, quantity: 1 },
      { componentId: 'earth-v2', role: ROLES.EARTHING, quantity: 1 },
    ],
  });
}

function commercialSnapshot() {
  return createCommercialSnapshot({
    snapshotId: 'CS-V1', issuedBy: 'ph1', issuedAt: AT,
    costResult: {
      status: COST_STATUS.COMPLETE, projectId: 'PRJ-V1', bomSnapshotId: 'BOM-V1',
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

async function main() {
  const transport = require('../server-quotation.js');
  await transport.init({ stateFile: STATE_FILE });
  transport.register(addRoute, { send, parseBody, isAdmin });

  // Static file server for /quotation-document.html and assets
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    // API routes
    const hit = routes.find(r => r.method === req.method && r.regex.test(url.pathname));
    if (hit) {
      const m = hit.regex.exec(url.pathname); const params = {};
      hit.keys.forEach((k, i) => { params[k] = m[i + 1]; });
      return hit.handler(req, res, params, url.searchParams);
    }

    // Static files
    const { statSync, readFileSync: rf } = await import('node:fs');
    const path = join('public', url.pathname === '/' ? 'quotation-document.html' : url.pathname);
    try {
      const content = rf(path);
      const ext = path.split('.').pop();
      const types = { html: 'text/html', js: 'application/javascript', css: 'text/css', jpg: 'image/jpeg', png: 'image/png' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(content);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  // Seed data
  const headers = { 'Content-Type': 'application/json', authorization: `Bearer ${TOKEN}`, 'x-actor-role': 'PROJECT_HEAD', 'x-actor-user': 'v1' };
  await fetch(`${base}/api/quotation/bom-snapshots`, { method: 'POST', headers, body: JSON.stringify({ bomSnapshotId: 'BOM-V1', snapshot: bomSnapshot() }) });
  await fetch(`${base}/api/quotation/commercial-snapshots`, { method: 'POST', headers, body: JSON.stringify({ snapshot: commercialSnapshot() }) });
  const salesH = { ...headers, 'x-actor-role': 'SALES' };
  await fetch(`${base}/api/quotation/quotations`, {
    method: 'POST', headers: salesH,
    body: JSON.stringify({
      quotationId: 'Q-VISUAL', projectId: 'PRJ-V1', at: AT,
      quotationNumber: 'FLZ-VISUAL-001', quotationVersion: 1, quotationDate: '2026-08-26',
      validUntil: '2026-09-10', proposalBy: 'Visual Advisor', status: 'DRAFT',
      customer: { customerId: 'C-V1', customerName: 'Visual Tester', address: '1 Visual St', pincode: '500001', phone: '9000000001', currentBillAmount: 3500, currentBillCycle: 'monthly' },
      system: { systemType: 'ONGRID', systemSizeKw: 5, phase: 'SINGLE', packageTier: 'VALUE', roofType: 'FLAT' },
      engineering: { status: 'VALID', blocked: [], warnings: [] },
      bomSnapshotId: 'BOM-V1', commercialSnapshotId: 'CS-V1',
      componentAttributes: COMPONENT_ATTRS,
      subsidyTreatment: QP.SUBSIDY_TREATMENT.NOT_QUOTED,
    }),
  });

  // Browser
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
  await page.goto(`${base}/quotation-document.html`);
  await page.waitForTimeout(2000);

  // Check page rendered
  const sections = await page.$$('section.page');
  console.log(`Rendered ${sections.length} page section(s)`);

  // Page 7 section
  const p7 = await page.$('[data-page-section="TECHNICAL_SPECIFICATIONS"]');
  if (p7) {
    console.log('Page 7 TECHNICAL_SPECIFICATIONS section found');
    await p7.screenshot({ path: '/tmp/src/tests/page7-screenshot.png' });
    console.log('Screenshot saved: tests/page7-screenshot.png');

    // Check no horizontal overflow
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('[data-page-section="TECHNICAL_SPECIFICATIONS"]');
      return el ? el.scrollWidth > el.clientWidth : false;
    });
    console.log(`Horizontal overflow: ${overflow}`);

    // Check no broken images
    const brokenImages = await page.evaluate(() => {
      const imgs = document.querySelectorAll('[data-page-section="TECHNICAL_SPECIFICATIONS"] img');
      return [...imgs].filter(i => !i.complete || i.naturalHeight === 0).map(i => i.src);
    });
    console.log(`Broken images: ${brokenImages.length}${brokenImages.length ? ' — ' + brokenImages.join(', ') : ''}`);

    // Check data-blocked-count
    const blockedCount = await p7.getAttribute('data-blocked-count');
    console.log(`Blocked fields: ${blockedCount}`);
  } else {
    console.error('ERROR: Page 7 section NOT found');
  }

  // Page 5 section
  const p5 = await page.$('[data-page-section="THREE_OPTION_PRICING"]');
  if (p5) {
    console.log('Page 5 THREE_OPTION_PRICING section found');
    await p5.screenshot({ path: '/tmp/src/tests/page5-screenshot.png' });
    console.log('Screenshot saved: tests/page5-screenshot.png');

    const p5overflow = await page.evaluate(() => {
      const el = document.querySelector('[data-page-section="THREE_OPTION_PRICING"]');
      return el ? el.scrollWidth > el.clientWidth : false;
    });
    console.log(`Page 5 horizontal overflow: ${p5overflow}`);

    const p5blocked = await p5.getAttribute('data-blocked-count');
    console.log(`Page 5 blocked fields: ${p5blocked}`);

    // Three option columns present
    const optionCards = await p5.$$('.p5-option-card');
    console.log(`Page 5 option cards: ${optionCards.length}`);

    // Price values visible
    const p5text = await p5.evaluate(el => el.innerText);
    console.log(`Page 5 "Price Before GST" visible: ${p5text.includes('Price Before GST')}`);
    console.log(`Page 5 "GST" visible: ${/\bGST\b/.test(p5text)}`);
    console.log(`Page 5 "TOTAL AMOUNT" visible: ${p5text.includes('TOTAL AMOUNT')}`);
    console.log(`Page 5 subsidy absent: ${!p5text.includes('Subsidy') && !p5text.includes('PM Surya Ghar')}`);

    // No internal terms
    const p5internal = ['margin', 'cost price', 'snapshot', 'RBAC'];
    for (const t of p5internal) {
      if (p5text.toLowerCase().includes(t.toLowerCase())) console.error(`ERROR: internal term "${t}" found in Page 5`);
    }
  } else {
    console.error('ERROR: Page 5 section NOT found');
  }

  // Page 8 section
  const p8 = await page.$('[data-page-section="SAVINGS_AND_PAYMENT"]');
  if (p8) {
    console.log('Page 8 SAVINGS_AND_PAYMENT section found');
    await p8.screenshot({ path: '/tmp/src/tests/page8-screenshot.png' });
    console.log('Screenshot saved: tests/page8-screenshot.png');

    const p8overflow = await page.evaluate(() => {
      const el = document.querySelector('[data-page-section="SAVINGS_AND_PAYMENT"]');
      return el ? el.scrollWidth > el.clientWidth : false;
    });
    console.log(`Page 8 horizontal overflow: ${p8overflow}`);

    const p8blocked = await p8.getAttribute('data-blocked-count');
    console.log(`Page 8 blocked fields: ${p8blocked}`);

    const p8text = await p8.evaluate(el => el.innerText);
    console.log(`Page 8 "Savings Over Time" visible: ${p8text.includes('Savings Over Time')}`);
    console.log(`Page 8 "Without Solar" visible: ${p8text.includes('Without Solar')}`);
    console.log(`Page 8 "With Solar" visible: ${p8text.includes('With Solar')}`);
    console.log(`Page 8 "Total Investment" visible: ${p8text.includes('Total Investment')}`);
    console.log(`Page 8 "Payment Details" visible: ${p8text.includes('Payment Details')}`);
    console.log(`Page 8 subsidy absent: ${!p8text.includes('PM Surya Ghar')}`);
    console.log(`Page 8 no internal data: ${!p8text.toLowerCase().includes('gross margin') && !p8text.toLowerCase().includes('cost price')}`);
  } else {
    console.error('ERROR: Page 8 section NOT found');
  }

  // Page 1 still renders
  const p1 = await page.$('[data-page-section="COVER_AND_PROPOSAL_DETAILS"]');
  console.log(`Page 1 still renders: ${!!p1}`);

  // Full page screenshot
  await page.screenshot({ path: '/tmp/src/tests/full-document-screenshot.png', fullPage: true });
  console.log('Full document screenshot saved: tests/full-document-screenshot.png');

  // Check no internal dashboard
  const dashboardText = await page.evaluate(() => document.body.innerText);
  const internalTerms = ['Generation gate', 'Engineering verdict', 'RBAC', 'Acting role'];
  for (const t of internalTerms) {
    if (dashboardText.includes(t)) console.error(`ERROR: internal term "${t}" found on customer document`);
  }

  await browser.close();
  await new Promise(r => server.close(r));
  try { rmSync(STATE_FILE, { force: true }); } catch {}
  console.log('Done. Visual verification complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
