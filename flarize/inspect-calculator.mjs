import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();

// Capture all network requests
const requests = [];
page.on('request', req => {
  const url = req.url();
  if (!url.includes('googletagmanager') && !url.includes('google-analytics') && !url.includes('gtag') && !url.includes('favicon') && !url.includes('.woff') && !url.includes('.png') && !url.includes('.jpg') && !url.includes('.svg') && !url.includes('.ico') && !url.includes('b-cdn.net')) {
    requests.push({
      url: url,
      method: req.method(),
      resourceType: req.resourceType(),
      postData: req.postData() || null,
    });
  }
});

// Capture all network responses for API-like calls
const apiResponses = [];
page.on('response', async res => {
  const url = res.url();
  const ct = res.headers()['content-type'] || '';
  if (ct.includes('json') || url.includes('/api/') || url.includes('endpoint') || url.includes('calculate')) {
    try {
      const body = await res.text();
      apiResponses.push({ url, status: res.status(), body: body.substring(0, 2000) });
    } catch {}
  }
});

console.log('=== LOADING ADVANCED CALCULATOR ===');
await page.goto('https://flarize.com/advanced-calculator', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

console.log('\n=== NETWORK REQUESTS ===');
for (const r of requests) {
  console.log(`${r.method} ${r.resourceType} ${r.url}`);
  if (r.postData) console.log(`  POST DATA: ${r.postData.substring(0, 500)}`);
}

console.log('\n=== API/JSON RESPONSES ===');
for (const r of apiResponses) {
  console.log(`${r.status} ${r.url}`);
  console.log(`  BODY: ${r.body}`);
}

// Extract all script sources from the page
const scripts = await page.evaluate(() => {
  const tags = [...document.querySelectorAll('script')];
  return tags.map(s => ({
    src: s.src || '(inline)',
    type: s.type || '',
    textLength: s.textContent?.length || 0,
    textPreview: s.src ? '' : s.textContent?.substring(0, 500) || '',
  }));
});
console.log('\n=== SCRIPT TAGS ===');
for (const s of scripts) {
  console.log(`src=${s.src} type=${s.type} len=${s.textLength}`);
  if (s.textPreview) console.log(`  PREVIEW: ${s.textPreview}`);
}

// Check for __NEXT_DATA__
const nextData = await page.evaluate(() => {
  const el = document.getElementById('__NEXT_DATA__');
  return el ? el.textContent?.substring(0, 3000) : null;
});
if (nextData) {
  console.log('\n=== __NEXT_DATA__ ===');
  console.log(nextData);
}

// Extract input fields
const inputs = await page.evaluate(() => {
  const els = document.querySelectorAll('input, select, button, [role="slider"], [role="radio"], [role="button"]');
  return [...els].map(e => ({
    tag: e.tagName,
    type: e.type || '',
    name: e.name || '',
    id: e.id || '',
    text: e.textContent?.trim()?.substring(0, 80) || '',
    value: e.value || '',
    ariaLabel: e.getAttribute('aria-label') || '',
    placeholder: e.placeholder || '',
  }));
});
console.log('\n=== INPUT ELEMENTS ===');
for (const i of inputs) {
  console.log(`${i.tag} type=${i.type} name=${i.name} id=${i.id} value=${i.value} text="${i.text}" aria="${i.ariaLabel}" placeholder="${i.placeholder}"`);
}

await browser.close();
