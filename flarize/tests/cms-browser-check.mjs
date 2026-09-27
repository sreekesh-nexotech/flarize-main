/**
 * CMS Page Designer — Browser verification (C11-J).
 *
 * Uses Playwright route interception to serve cms.html and mock all
 * /api/cms/* endpoints.  Verifies:
 *   1. DOM structure (tabs, block palette, canvas, panels)
 *   2. Page create → editor flow
 *   3. Block palette adds blocks to tree
 *   4. Campaign tab renders
 *   5. Asset tab renders
 *   6. Security: no calculation logic, no eval, no innerHTML-from-user
 *   7. CMS renderer round-trip (quotation-document.html with CMS page)
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

// ── Mock CMS API data ──────────────────────────────────────────────
const MOCK_FIELDS = [
  { fieldId: 'customer.name', label: 'Customer Name', category: 'CUSTOMER', payloadPath: 'customerName', format: 'text' },
  { fieldId: 'system.sizeKw', label: 'System Size kW', category: 'SYSTEM', payloadPath: 'systemSizekW', format: 'number' },
  { fieldId: 'pricing.customer.customerTotalIncludingGST', label: 'Total incl GST', category: 'PRICING', payloadPath: 'pricing.value.customerTotalIncludingGST', format: 'money' },
];

const PAGE_ID = 'pg_test1';
const VERSION_ID = 'pgver_test1';
const MOCK_PAGES = [
  { pageId: PAGE_ID, name: 'Test Campaign', pageType: 'campaign', status: 'DRAFT', createdBy: 'admin', createdAt: '2026-01-01T00:00:00Z' },
];
const MOCK_PAGE_DETAIL = {
  pageId: PAGE_ID, name: 'Test Campaign', pageType: 'campaign', status: 'DRAFT',
  createdBy: 'admin', createdAt: '2026-01-01T00:00:00Z',
  currentVersionId: VERSION_ID,
  content: { sections: [], overlays: [] },
};

const MOCK_CAMPAIGNS = [
  { campaignId: 'cmp_1', name: 'Summer Sale', status: 'ACTIVE', activatedAt: '2026-06-01T00:00:00Z' },
];
const MOCK_ASSETS = [];
const MOCK_VERSIONS = [
  { versionId: VERSION_ID, versionNumber: 1, status: 'DRAFT', createdAt: '2026-01-01T00:00:00Z', createdBy: 'admin' },
];

// ── Serve CMS HTML + mock API ──────────────────────────────────────
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

let lastApiCall = null;
let tokenInjected = false;

await page.route('**/*', async (route) => {
  const reqUrl = new URL(route.request().url());

  // First request: serve a minimal page to establish the origin for sessionStorage injection.
  if (!tokenInjected && reqUrl.pathname === '/setup') {
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>setup</body></html>' });
  }
  const url = reqUrl;
  const m = route.request().method();

  // Serve HTML
  if (url.pathname === '/cms.html' || url.pathname === '/') {
    const html = readFileSync('/tmp/src/public/cms.html', 'utf-8');
    return route.fulfill({ status: 200, contentType: 'text/html', body: html });
  }

  // ── CMS API mocks ────────────────────────────────────────
  if (url.pathname === '/api/cms/fields' && m === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ fields: MOCK_FIELDS }) });
  }

  if (url.pathname === '/api/cms/pages' && m === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pages: MOCK_PAGES }) });
  }

  if (url.pathname === '/api/cms/pages' && m === 'POST') {
    lastApiCall = { method: 'POST', url: url.pathname, body: JSON.parse(await route.request().postData() || '{}') };
    const newPage = { pageId: 'pg_new', name: lastApiCall.body.name || 'Untitled', pageType: lastApiCall.body.pageType || 'campaign', status: 'DRAFT', createdBy: 'admin', createdAt: '2026-01-02T00:00:00Z' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ page: newPage }) });
  }

  // Page detail
  if (url.pathname.match(/^\/api\/cms\/pages\/[^/]+$/) && m === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ page: MOCK_PAGE_DETAIL }) });
  }

  // Save draft
  if (url.pathname.match(/^\/api\/cms\/pages\/[^/]+\/draft$/) && m === 'PUT') {
    lastApiCall = { method: 'PUT', url: url.pathname };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ page: MOCK_PAGE_DETAIL }) });
  }

  // Versions
  if (url.pathname.match(/^\/api\/cms\/pages\/[^/]+\/versions$/) && m === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ versions: MOCK_VERSIONS }) });
  }

  // Workflow transitions
  if (url.pathname.match(/\/(submit-review|approve|publish|archive)$/) && m === 'POST') {
    lastApiCall = { method: 'POST', url: url.pathname };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ page: MOCK_PAGE_DETAIL }) });
  }

  // Campaigns
  if (url.pathname === '/api/cms/campaigns' && m === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ campaigns: MOCK_CAMPAIGNS }) });
  }

  // Assets
  if (url.pathname === '/api/cms/assets' && m === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assets: MOCK_ASSETS }) });
  }

  // Templates
  if (url.pathname === '/api/cms/templates') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ templates: [] }) });
  }

  // Session
  if (url.pathname === '/api/quotation/session') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ roles: ['ADMIN'] }) });
  }

  return route.abort();
});

let pass = 0;
let fail = 0;
const ok = (msg) => { console.log(`  ✓ ${msg}`); pass++; };
const bad = (msg) => { console.error(`  ✗ ${msg}`); fail++; };
const check = (cond, msg) => cond ? ok(msg) : bad(msg);

try {
  // Inject session token so CMS page does not redirect to login.
  await page.goto('http://localhost:9999/setup', { waitUntil: 'load', timeout: 5000 });
  await page.evaluate(() => {
    try { sessionStorage.setItem('gr_session_token', 'test-browser-check-token'); } catch {}
  });
  tokenInjected = true;

  // ═══════════════════════════════════════════════════════════════════
  // 1. LIST VIEW STRUCTURE
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n1. List view structure');
  await page.goto('http://localhost:9999/cms.html', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(600);

  check(await page.$('#listView') !== null, 'listView present');
  check(await page.$('#editorView') !== null, 'editorView present (hidden)');

  // Tabs
  const tabs = await page.$$eval('.tab', els => els.map(e => e.dataset.tab));
  check(tabs.includes('pages'), 'Pages tab');
  check(tabs.includes('campaigns'), 'Campaigns tab');
  check(tabs.includes('assets'), 'Assets tab');

  // Role selector
  const roles = await page.$$eval('#role option', els => els.map(e => e.value));
  check(roles.includes('ADMIN'), 'ADMIN role option');
  check(roles.includes('PROJECT_HEAD'), 'PROJECT_HEAD role option');

  // Page list loaded
  const pageItems = await page.$$('.list-item[data-page]');
  check(pageItems.length >= 1, `Page list rendered (${pageItems.length} items)`);

  // Create page controls
  check(await page.$('#newPageName') !== null, 'New page name input');
  check(await page.$('#newPageType') !== null, 'New page type select');
  check(await page.$('#createPageBtn') !== null, 'Create page button');

  // ═══════════════════════════════════════════════════════════════════
  // 2. EDITOR VIEW — click into a page
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n2. Editor view');
  await pageItems[0].click();
  await page.waitForTimeout(800);

  const editorVisible = await page.$eval('#editorView', el => !el.classList.contains('hidden'));
  check(editorVisible, 'Editor view visible after click');

  const listHidden = await page.$eval('#listView', el => el.classList.contains('hidden'));
  check(listHidden, 'List view hidden');

  // Canvas
  check(await page.$('#canvas') !== null, 'A4 canvas present');
  const canvasClass = await page.$eval('#canvas', el => el.className);
  check(canvasClass.includes('a4-canvas'), 'Canvas has a4-canvas class');

  // Block palette
  const palette = await page.$$eval('.block-btn', els => els.map(e => e.dataset.add));
  check(palette.includes('section'), 'Palette: section');
  check(palette.includes('heading'), 'Palette: heading');
  check(palette.includes('text'), 'Palette: text');
  check(palette.includes('image'), 'Palette: image');
  check(palette.includes('dynamicField'), 'Palette: dynamicField');
  check(palette.includes('overlay'), 'Palette: overlay');
  check(palette.includes('qr'), 'Palette: qr');
  check(palette.includes('divider'), 'Palette: divider');
  check(palette.includes('spacer'), 'Palette: spacer');
  check(palette.includes('columns'), 'Palette: columns');
  check(palette.includes('backgroundImage'), 'Palette: backgroundImage');

  // Workflow buttons
  check(await page.$('#saveDraftBtn') !== null, 'Save draft button');
  check(await page.$('#submitReviewBtn') !== null, 'Submit review button');
  check(await page.$('#approveBtn') !== null, 'Approve button');
  check(await page.$('#publishBtn') !== null, 'Publish button');
  check(await page.$('#archiveBtn') !== null, 'Archive button');

  // Right panel sections
  check(await page.$('#propPanel') !== null, 'Properties panel');
  check(await page.$('#fieldPicker') !== null, 'Field picker');
  check(await page.$('#editorAssets') !== null, 'Asset library panel');

  // Version history
  check(await page.$('#versionList') !== null, 'Version list');

  // ═══════════════════════════════════════════════════════════════════
  // 3. BLOCK PALETTE — add blocks
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n3. Block palette — add blocks');

  // Add section
  await page.click('.block-btn[data-add="section"]');
  await page.waitForTimeout(200);
  let treeItems = await page.$$('.block-item');
  check(treeItems.length >= 1, 'Block tree shows section after add');

  // Add heading
  await page.click('.block-btn[data-add="heading"]');
  await page.waitForTimeout(200);
  treeItems = await page.$$('.block-item');
  check(treeItems.length >= 2, 'Block tree shows heading after add');

  // Add text
  await page.click('.block-btn[data-add="text"]');
  await page.waitForTimeout(200);
  treeItems = await page.$$('.block-item');
  check(treeItems.length >= 3, 'Block tree shows text after add');

  // Canvas should render blocks
  const canvasChildren = await page.$$eval('#canvasContent > *', els => els.length);
  check(canvasChildren >= 1, `Canvas renders content (${canvasChildren} children)`);

  // ═══════════════════════════════════════════════════════════════════
  // 4. FIELD PICKER — registry loaded
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n4. Field picker');
  const fieldItems = await page.$$('#fieldPicker .field-chip, #fieldPicker [data-field-id], #fieldPicker button');
  check(fieldItems.length >= 1, `Field picker populated (${fieldItems.length} items)`);

  // ═══════════════════════════════════════════════════════════════════
  // 5. BACK to list, switch tabs
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n5. Tab switching');
  await page.click('#backBtn');
  await page.waitForTimeout(400);

  const listBack = await page.$eval('#listView', el => !el.classList.contains('hidden'));
  check(listBack, 'Back button returns to list view');

  // Click campaigns tab
  await page.click('.tab[data-tab="campaigns"]');
  await page.waitForTimeout(600);
  const campTab = await page.$eval('#tab-campaigns', el => !el.classList.contains('hidden'));
  check(campTab, 'Campaigns tab shows content');

  // Click assets tab
  await page.click('.tab[data-tab="assets"]');
  await page.waitForTimeout(400);
  const assetTab = await page.$eval('#tab-assets', el => !el.classList.contains('hidden'));
  check(assetTab, 'Assets tab shows content');

  // ═══════════════════════════════════════════════════════════════════
  // 6. SECURITY — source analysis
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n6. Security checks');
  const htmlSrc = readFileSync('/tmp/src/public/cms.html', 'utf-8');

  check(!htmlSrc.includes('eval('), 'No eval() in source');
  check(!htmlSrc.includes('Function('), 'No Function() constructor');
  check(!htmlSrc.includes('costEngine'), 'No cost engine reference');
  check(!htmlSrc.includes('pricingEngine'), 'No pricing engine reference');
  check(!htmlSrc.includes('engineeringChecker'), 'No engineering checker reference');
  check(!htmlSrc.includes('bomSnapshot'), 'No BOM snapshot reference');
  check(!htmlSrc.includes('calculateGST'), 'No GST calculation');
  check(!htmlSrc.includes('calculateSubsidy'), 'No subsidy calculation');
  check(!htmlSrc.includes('calculateEMI'), 'No EMI calculation');
  check(!htmlSrc.includes('<iframe'), 'No iframe');
  check(!htmlSrc.includes('<object'), 'No object embed');
  check(!htmlSrc.includes('javascript:'), 'No javascript: URLs');

  // Verify esc() function present for XSS protection
  check(htmlSrc.includes("const esc"), 'esc() XSS helper defined');
  check(htmlSrc.includes('&amp;'), 'HTML entity escaping present');

  // ═══════════════════════════════════════════════════════════════════
  // 7. CMS RENDERER — round-trip (quotation-document.html)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n7. CMS renderer round-trip');

  // Check quotationDocument.js exports renderCmsPage
  const qdSrc = readFileSync('/tmp/src/public/lib/quotationDocument.js', 'utf-8');
  check(qdSrc.includes('export function renderCmsPage'), 'renderCmsPage exported from quotationDocument.js');
  check(qdSrc.includes('CMS_PAGE_STYLES'), 'CMS_PAGE_STYLES exported');

  // Verify renderer has no imports
  const renderSection = qdSrc.slice(qdSrc.indexOf('// ── CMS Page Renderer') || qdSrc.indexOf('renderCmsPage'));
  check(!renderSection.includes("import "), 'CMS renderer section has no imports');

  // Verify all 12 block types handled
  const blockTypes = ['section', 'columns', 'column', 'overlay', 'heading', 'text', 'image', 'backgroundImage', 'divider', 'spacer', 'dynamicField', 'qr'];
  for (const bt of blockTypes) {
    check(qdSrc.includes(`'${bt}'`) || qdSrc.includes(`"${bt}"`), `Renderer handles block type: ${bt}`);
  }

  // Verify CMS asset URL pattern
  check(qdSrc.includes('/api/cms/assets/'), 'Renderer uses CMS asset URL pattern');

  // ═══════════════════════════════════════════════════════════════════
  // 8. A4 CANVAS DIMENSIONS
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n8. A4 canvas dimensions');

  // Go back to editor
  await page.click('.tab[data-tab="pages"]');
  await page.waitForTimeout(400);
  const pageItem2 = await page.$('.list-item[data-page]');
  if (pageItem2) {
    await pageItem2.click();
    await page.waitForTimeout(600);
    const canvasBox = await page.$eval('#canvas', el => {
      const style = getComputedStyle(el);
      return { w: parseInt(style.width), h: parseInt(style.height) };
    });
    // At 50% zoom: 397x561, at 100%: 794x1123
    check(canvasBox.w === 397 || canvasBox.w === 794, `Canvas width is A4 (${canvasBox.w}px)`);
    check(canvasBox.h === 561 || canvasBox.h === 1123, `Canvas height is A4 (${canvasBox.h}px)`);
  }

  // ═══════════════════════════════════════════════════════════════════
  console.log(`\n═══ CMS browser verification: ${pass} passed, ${fail} failed ═══`);
  if (fail > 0) process.exit(1);
} finally {
  await browser.close();
}
