/**
 * Page 2 — Browser visual verification.
 * Uses Playwright route interception to serve quotation-document.html
 * with mock payloads for TWO campaigns (Onam and Diwali).
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { mockCampaignResult, MOCK_SOURCE, MOCK_STATUS } from '../src/lib/mockCalculationProviders.js';

function buildPayload(campaignId) {
  const cr = mockCampaignResult({ campaignId });
  return {
    quotationId: `Q-P2-${campaignId}`,
    customerName: 'Test Customer',
    customerAddress: 'Test Address, Kerala',
    customerPhone: '9876543210',
    systemSizekW: 5,
    dcCapacityWp: 5500,
    panelCountRequired: 10,
    documentOrder: [1, 2, 3, 5, 7, 8, 12],
    components: {
      panel: { brand: 'TestPanel', model: 'TP-550', moduleWatt: 550, technology: 'N-Type TOPCon Bifacial', warranty: '25 Year' },
      inverter: { brand: 'TestInverter', model: 'TI-5K', technology: 'String Inverter', specification: 'String Inverter', phase: 'Single Phase', capacity: '5 kW', warranty: '10 Years' },
      structure: { brand: 'TestStruct', specification: 'GI Structure' },
    },
    pricing: {
      available: true,
      value: { systemCostBeforeSubsidy: 325000, customerTotalIncludingGST: 383500 },
    },
    campaign: {
      available: true, source: MOCK_SOURCE, status: MOCK_STATUS,
      value: {
        id: cr.id, name: cr.name, active: cr.active,
        template: cr.template, yearBadge: cr.yearBadge,
        theme: cr.theme ? { ...cr.theme } : null,
        headline: cr.headline, subheadline: cr.subheadline,
        heroImage: cr.heroImage,
        primaryBenefit: { ...cr.primaryBenefit },
        offers: cr.offers.map(o => ({ ...o })),
        luckyDraw: { ...cr.luckyDraw },
        referral: { ...cr.referral },
        urgency: { ...cr.urgency },
        cta: { ...cr.cta },
        artwork: { ...cr.artwork },
        disclaimer: cr.disclaimer,
      },
    },
    packageTier: null,
  };
}

let CURRENT_PAYLOAD = buildPayload('ONAM_2026');

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
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quotations: [{ quotationId: CURRENT_PAYLOAD.quotationId }] }) });
  }
  if (url.pathname.includes('/payload')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ payload: CURRENT_PAYLOAD }) });
  }
  return route.abort();
});

async function testCampaign(campaignId) {
  CURRENT_PAYLOAD = buildPayload(campaignId);
  console.log(`\n=== Testing ${campaignId} ===`);

  await page.goto('http://localhost:9999/quotation-document.html', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const p2 = await page.$('.q2-page');
  if (!p2) {
    console.error('Page 2 section NOT found');
    return false;
  }
  console.log('Page 2 section found');

  await p2.screenshot({ path: `tests/page2-${campaignId.toLowerCase()}-screenshot.png` });
  console.log(`Screenshot saved: tests/page2-${campaignId.toLowerCase()}-screenshot.png`);

  // Check key elements
  const headline = await p2.$eval('.q2-headline', el => el.textContent).catch(() => null);
  console.log('Headline:', headline);

  const subheadline = await p2.$eval('.q2-subheadline', el => el.textContent).catch(() => null);
  console.log('Subheadline:', subheadline);

  const benefitValue = await p2.$eval('.q2-benefit-value', el => el.textContent).catch(() => null);
  console.log('Benefit value:', benefitValue);

  const urgencyBadge = await p2.$('.q2-urgency-badge');
  console.log('Urgency badge present:', !!urgencyBadge);

  const luckyDraw = await p2.$('.q2-lucky-draw');
  console.log('Lucky draw present:', !!luckyDraw);

  const offerCards = await p2.$$eval('.q2-offer-card', cards => cards.length);
  console.log('Offer cards:', offerCards);

  const referral = await p2.$('.q2-referral');
  console.log('Referral present:', !!referral);

  const cta = await p2.$('.q2-cta');
  console.log('CTA present:', !!cta);

  const illustration = await p2.$('.q2-illustration');
  console.log('Illustration present:', !!illustration);

  const decoration = await p2.$('.q2-deco');
  console.log('Decoration present:', !!decoration);

  // Check no dashboard/canvas
  const dashboard = await p2.$('.dashboard');
  const canvas = await p2.$('canvas');
  console.log('Dashboard absent:', !dashboard);
  console.log('Canvas absent:', !canvas);

  // Check no horizontal overflow
  const overflows = await page.evaluate(() => {
    const el = document.querySelector('.q2-page');
    return el ? el.scrollWidth > el.clientWidth : false;
  });
  console.log('Horizontal overflow:', overflows);

  // Check A4-ish dimensions
  const box = await p2.boundingBox();
  console.log(`Page 2 dimensions: ${Math.round(box.width)}x${Math.round(box.height)}px`);

  // Check campaign ID in data attribute
  const campaignAttr = await p2.getAttribute('data-campaign-id');
  console.log('Campaign ID attr:', campaignAttr);

  return true;
}

try {
  const onamOk = await testCampaign('ONAM_2026');
  const diwaliOk = await testCampaign('DIWALI_2026');

  // Also test no-campaign
  CURRENT_PAYLOAD = { ...buildPayload('ONAM_2026'), campaign: { available: false } };
  await page.goto('http://localhost:9999/quotation-document.html', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(500);
  const noCampaign = await page.$('.q2-page');
  console.log('\n=== No campaign test ===');
  console.log('Page 2 absent when no campaign:', !noCampaign);

  console.log('\nDone. Page 2 browser verification complete.');
  console.log('Onam:', onamOk ? 'PASS' : 'FAIL');
  console.log('Diwali:', diwaliOk ? 'PASS' : 'FAIL');
  console.log('No campaign:', !noCampaign ? 'PASS' : 'FAIL');
} finally {
  await browser.close();
}
