/**
 * Page 12 — Browser visual verification.
 * Uses Playwright route interception to serve quotation-document.html
 * with a mock payload containing Page 12 data.
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { mockSavingsResult, mockSubsidyResult, mockFinancingResult, MOCK_SOURCE, MOCK_STATUS } from '../src/lib/mockCalculationProviders.js';

const MOCK_PAYLOAD = {
  quotationId: 'Q-P12-TEST',
  customerName: 'Test Customer',
  customerAddress: 'Test Address, City',
  customerPhone: '9876543210',
  systemSizekW: 5,
  dcCapacityWp: 5500,
  panelCountRequired: 10,
  documentOrder: [1, 5, 7, 8, 12],
  components: {
    panel: { brand: 'TestPanel', model: 'TP-550', moduleWatt: 550, technology: 'N-Type TOPCon Bifacial', warranty: '25 Year' },
    inverter: { brand: 'TestInverter', model: 'TI-5K', technology: 'String Inverter', specification: 'String Inverter', phase: 'Single Phase', capacity: '5 kW', warranty: '10 Years' },
    structure: { brand: 'TestStruct', specification: 'GI Structure' },
  },
  pricing: {
    available: true,
    value: {
      systemCostBeforeSubsidy: 325000,
      customerTotalIncludingGST: 383500,
    },
  },
  savings: {
    available: true,
    source: MOCK_SOURCE,
    status: MOCK_STATUS,
    value: mockSavingsResult(5),
  },
  subsidy: {
    available: true,
    source: MOCK_SOURCE,
    status: MOCK_STATUS,
    value: mockSubsidyResult(5),
  },
  financing: {
    available: true,
    source: MOCK_SOURCE,
    status: MOCK_STATUS,
    value: mockFinancingResult(325000),
  },
  packageTier: null,  // C6 blocked
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1200, height: 900 });

// Intercept all requests — serve local files
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
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quotations: [{ quotationId: 'Q-P12-TEST' }] }) });
  }
  if (url.pathname.includes('/payload')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ payload: MOCK_PAYLOAD }) });
  }
  // Fonts / other — abort
  return route.abort();
});

try {
  await page.goto('http://localhost:9999/quotation-document.html', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  // Check Page 12 section exists
  const p12 = await page.$('.q12-page');
  if (!p12) {
    console.error('Page 12 section NOT found');
    process.exit(1);
  }
  console.log('Page 12 section found');

  // Page 12 section screenshot
  await p12.screenshot({ path: 'tests/page12-section-screenshot.png' });
  console.log('Screenshot saved: tests/page12-section-screenshot.png');

  // Check key elements
  const heading = await p12.$eval('.q12-heading', el => el.textContent).catch(() => null);
  console.log('Heading:', heading);

  const banner = await p12.$('.q12-package-banner');
  console.log('Package banner present:', !!banner);

  const investmentTable = await p12.$('.q12-investment-table');
  console.log('Investment table present:', !!investmentTable);

  const savingsSection = await p12.$('.q12-savings-section');
  console.log('Savings section present:', !!savingsSection);

  const emiSection = await p12.$('.q12-emi-section');
  console.log('EMI section present:', !!emiSection);

  const trustBadges = await p12.$('.q12-trust-badges');
  console.log('Trust badges present:', !!trustBadges);

  const guarantees = await p12.$('.q12-guarantees');
  console.log('Guarantees present:', !!guarantees);

  const referral = await p12.$('.q12-hybrid-upsell');
  console.log('Hybrid upsell section present:', !!referral);

  const specialOffer = await p12.$('.q12-special-offer');
  console.log('Special offer present:', !!specialOffer);

  // Check no horizontal overflow
  const overflows = await page.evaluate(() => {
    const el = document.querySelector('.q12-page');
    return el ? el.scrollWidth > el.clientWidth : false;
  });
  console.log('Horizontal overflow:', overflows);

  // Check no dashboard/cards/graphs
  const dashboard = await p12.$('.dashboard');
  const graph = await p12.$('canvas, svg.chart, .graph');
  console.log('Dashboard absent:', !dashboard);
  console.log('Graph absent:', !graph);

  // Check A4-ish dimensions
  const box = await p12.boundingBox();
  console.log(`Page 12 dimensions: ${Math.round(box.width)}x${Math.round(box.height)}px`);

  console.log('\nDone. Page 12 browser verification complete.');
} finally {
  await browser.close();
}
