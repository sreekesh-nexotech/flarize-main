/**
 * QA PDF Visual Inspection — Playwright screenshot of all quotation pages.
 * Uses qa-render-harness.html which imports quotationDocument.js directly.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const PAYLOAD = JSON.parse(readFileSync('/tmp/qa-payload.json', 'utf8'));
const HARNESS = resolve('tests/qa-render-harness.html');

async function run() {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'],
  });

  const page = await browser.newPage({ viewport: { width: 1200, height: 1700 } });

  // Inject payload before navigation
  await page.addInitScript((payload) => {
    window.__QA_PAYLOAD__ = payload;
  }, PAYLOAD);

  await page.goto(`file://${HARNESS}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Check render status
  const status = await page.evaluate(() => ({
    rendered: window.__QA_RENDERED__ || false,
    blocked: window.__QA_BLOCKED__ || [],
    bodyText: document.body?.innerText?.substring(0, 200),
    docHTML: document.getElementById('q-document')?.innerHTML?.length || 0,
  }));
  console.log('Render status:', JSON.stringify(status, null, 2));

  if (!status.rendered) {
    console.log('Render failed. Checking console errors...');
    // Capture any errors
    const errors = await page.evaluate(() => {
      return window.__errors || [];
    });
    console.log('Page errors:', errors);
    await browser.close();
    process.exit(1);
  }

  // Count data-page elements
  const pageInfo = await page.evaluate(() => {
    const pages = document.querySelectorAll('[data-page]');
    const text = document.body?.innerText || '';

    return {
      pageCount: pages.length,
      pageNumbers: Array.from(pages).map(p => p.dataset.page),
      textLength: text.length,
      blocked: (text.match(/BLOCKED/gi) || []).length,
      nans: (text.match(/\bNaN\b/g) || []).length,
      undefs: (text.match(/\bundefined\b/g) || []).length,
      nulls: (text.match(/\bnull\b/g) || []).length,
    };
  });
  console.log('\nPage structure:', JSON.stringify(pageInfo, null, 2));

  // Screenshots
  mkdirSync('/tmp/qa-screenshots', { recursive: true });
  await page.screenshot({ path: '/tmp/qa-screenshots/full-quotation.png', fullPage: true });
  console.log('Full page screenshot saved.');

  // Per-page screenshots and content checks
  const dataPages = await page.$$('[data-page]');
  for (let i = 0; i < dataPages.length; i++) {
    const pageNum = await dataPages[i].getAttribute('data-page');
    await dataPages[i].screenshot({ path: `/tmp/qa-screenshots/page-${pageNum}.png` });

    const check = await dataPages[i].evaluate(el => {
      const text = el.innerText || '';
      return {
        page: el.dataset.page,
        blocked: (text.match(/BLOCKED/gi) || []).length,
        nans: (text.match(/\bNaN\b/g) || []).length,
        undefs: (text.match(/\bundefined\b/g) || []).length,
        nulls: (text.match(/\bnull\b/g) || []).length,
        blockedFields: (text.match(/BLOCKED[^.\n]{0,60}/gi) || []),
        textPreview: text.substring(0, 200),
      };
    });

    const issues = [];
    if (check.blocked) issues.push(`BLOCKED×${check.blocked}`);
    if (check.nans) issues.push(`NaN×${check.nans}`);
    if (check.undefs) issues.push(`undefined×${check.undefs}`);
    if (check.nulls) issues.push(`null×${check.nulls}`);
    console.log(`Page ${pageNum}: ${issues.length ? issues.join(', ') : 'CLEAN'}`);
    if (check.blockedFields.length) {
      console.log(`  Blocked: ${check.blockedFields.join(' | ')}`);
    }
  }

  // Specific field checks
  const fieldChecks = await page.evaluate(() => {
    const text = document.body?.innerText || '';
    return {
      hasCustomerName: /Rajesh Kumar/i.test(text),
      hasSystemSize: /3\s*kW/i.test(text),
      hasSubsidy: /78,000|₹78/i.test(text),
      hasGross: /2,42,404|242404/i.test(text),
      hasYourInvestment: /1,64,404|164404/i.test(text),
      hasEMI: /EMI/i.test(text),
      hasQuotationNumber: /GR9700/i.test(text),
      hasCompanyName: /Flarize|Golden.?Ray/i.test(text),
      hasGST: /GST|8\.9/i.test(text),
    };
  });
  console.log('\nField presence check:', JSON.stringify(fieldChecks, null, 2));

  await browser.close();
  console.log('\nDone.');
}

run().catch(e => { console.error(e); process.exit(1); });
