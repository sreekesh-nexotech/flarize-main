/**
 * Page 3 — Browser visual verification.
 * Uses Playwright route interception to serve quotation-document.html
 * with a mock payload containing Page 3 data.
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { mockEnergyProfileResult, mockSavingsResult, mockSubsidyResult, mockFinancingResult, MOCK_SOURCE, MOCK_STATUS } from '../src/lib/mockCalculationProviders.js';

const ep = mockEnergyProfileResult({ systemSizeKw: 5 });

const MOCK_PAYLOAD = {
  quotationId: 'Q-P3-TEST',
  customerName: 'Test Customer',
  customerAddress: 'Test Address, Alappuzha',
  customerPhone: '9876543210',
  systemSizekW: 5,
  dcCapacityWp: 5500,
  panelCountRequired: 10,
  documentOrder: [1, 3, 5, 7, 8, 12],
  components: {
    panel: { brand: 'TestPanel', model: 'TP-550', moduleWatt: 550, technology: 'N-Type TOPCon Bifacial', warranty: '25 Year' },
    inverter: { brand: 'TestInverter', model: 'TI-5K', technology: 'String Inverter', specification: 'String Inverter', phase: 'Single Phase', capacity: '5 kW', warranty: '10 Years' },
    structure: { brand: 'TestStruct', specification: 'GI Structure' },
  },
  pricing: {
    available: true,
    value: { systemCostBeforeSubsidy: 325000, customerTotalIncludingGST: 383500 },
  },
  energyProfile: {
    available: true, source: MOCK_SOURCE, status: MOCK_STATUS,
    value: {
      dailyGenerationLow: ep.dailyGenerationLow,
      dailyGenerationHigh: ep.dailyGenerationHigh,
      monthlyKsebValueLow: ep.monthlyKsebValueLow,
      monthlyKsebValueHigh: ep.monthlyKsebValueHigh,
      homeUsesUnitsPerDay: ep.homeUsesUnitsPerDay,
      surplusExportedLow: ep.surplusExportedLow,
      surplusExportedHigh: ep.surplusExportedHigh,
    },
  },
  applianceUsage: {
    available: true, source: MOCK_SOURCE, status: MOCK_STATUS,
    value: {
      appliances: [...ep.appliances],
      totalDailyUsage: ep.totalDailyUsage,
    },
  },
  packageTier: null,
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1200, height: 900 });

await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === '/quotation-document.html') {
    const html = readFileSync('/tmp/src/public/quotation-document.html', 'utf-8');
    return route.fulfill({ status: 200, contentType: 'text/html', body: html });
  }
  if (url.pathname === '/lib/quotationDocument.js') {
    const js = readFileSync('/tmp/src/public/lib/quotationDocument.js', 'utf-8');
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: js });
  }
  if (url.pathname.startsWith('/assets/quotation/')) {
    try {
      const buf = readFileSync('/tmp/src/public' + url.pathname);
      const ext = url.pathname.split('.').pop();
      const ct = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: ct, body: buf });
    } catch { return route.abort(); }
  }
  if (url.pathname === '/api/quotation/session') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ roles: ['SALES'] }) });
  }
  if (url.pathname === '/api/quotation/quotations' && !url.pathname.includes('/payload')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quotations: [{ quotationId: 'Q-P3-TEST' }] }) });
  }
  if (url.pathname.includes('/payload')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ payload: MOCK_PAYLOAD }) });
  }
  return route.abort();
});

try {
  await page.goto('http://localhost:9999/quotation-document.html', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const p3 = await page.$('.q3-page');
  if (!p3) {
    console.error('Page 3 section NOT found');
    process.exit(1);
  }
  console.log('Page 3 section found');

  await p3.screenshot({ path: 'tests/page3-section-screenshot.png' });
  console.log('Screenshot saved: tests/page3-section-screenshot.png');

  // Check key elements
  const title = await p3.$eval('.q3-title', el => el.textContent).catch(() => null);
  console.log('Title:', title);

  const genBanner = await p3.$('.q3-gen-banner');
  console.log('Generation banner present:', !!genBanner);

  const appTable = await p3.$('.q3-app-table');
  console.log('Appliance table present:', !!appTable);

  const flowSection = await p3.$('.q3-flow-section');
  console.log('Energy flow section present:', !!flowSection);

  const lifestyle = await p3.$('.q3-lifestyle');
  console.log('Lifestyle comparison present:', !!lifestyle);

  // Check appliance rows
  const appRows = await p3.$$eval('.q3-app-table tbody tr', rows => rows.length);
  console.log('Appliance rows:', appRows);

  // Check flow cards
  const flowCards = await p3.$$eval('.q3-flow-card', cards => cards.length);
  console.log('Flow cards:', flowCards);

  // Check no horizontal overflow
  const overflows = await page.evaluate(() => {
    const el = document.querySelector('.q3-page');
    return el ? el.scrollWidth > el.clientWidth : false;
  });
  console.log('Horizontal overflow:', overflows);

  // Check no dashboard/canvas
  const dashboard = await p3.$('.dashboard');
  const canvas = await p3.$('canvas');
  console.log('Dashboard absent:', !dashboard);
  console.log('Canvas absent:', !canvas);

  // Check A4-ish dimensions
  const box = await p3.boundingBox();
  console.log(`Page 3 dimensions: ${Math.round(box.width)}x${Math.round(box.height)}px`);

  // Check dynamic values present
  const genText = await genBanner?.evaluate(el => el.textContent) ?? '';
  console.log('Generation banner contains 18–22:', genText.includes('18'));
  console.log('Generation banner contains KSEB value:', genText.includes('5,500'));

  console.log('\nDone. Page 3 browser verification complete.');
} finally {
  await browser.close();
}
