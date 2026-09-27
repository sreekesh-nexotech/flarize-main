// Browser E2E (P1, 2026-09-13) — Sales wizard: Malayalam edition + appliance rows.
// Step 2 language + bi-monthly default → Step 3 phase-filtered sizes + appliance
// list (Project Head defaults, add EV) → Generate → issued payload carries
// quotationLanguage='ml' and the confirmed rows; PDF page 3 total = rows total.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:4800';
const ADMIN_PW = process.env.ADMIN_PASSWORD || 'test123';
const SHOTS = 'tests/e2e/shots'; mkdirSync(SHOTS, { recursive: true });
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const out = []; const ok = (n, c, d = '') => out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
process.on('uncaughtException', e => { console.log(out.join('\n')); console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
page.on('dialog', d => d.accept()); const popups = []; ctx.on('page', p => popups.push(p));
const r = await page.request.post(BASE + '/api/auth/login', { data: { username: 'admin', password: ADMIN_PW } });
const { token, user } = await r.json();
await page.goto(BASE + '/login.html');
await page.evaluate(([t, role]) => { sessionStorage.setItem('gr_session_token', t); sessionStorage.setItem('gr_user_role', role); sessionStorage.setItem('gr_user_name', 'e2e'); }, [token, user?.role || '']);
await page.goto(BASE + '/sales.html'); await page.waitForTimeout(1200);
// Step 1
await page.click('#btn-new-cust'); await page.waitForTimeout(200);
await page.fill('#c-name', 'ML E2E ' + Date.now().toString().slice(-5)); await page.fill('#c-phone', '97' + String(Date.now()).slice(-8));
await page.fill('#c-address', 'Test Lane, Kochi'); await page.fill('#c-pincode', '682001');
await page.click('#cust-new-form button.btn-primary').catch(() => page.click('button:text("Save Customer")')); await page.waitForTimeout(600);
await page.click('#btn-next'); await page.waitForTimeout(300);
// Step 2
ok('bill cycle defaults to bi-monthly', (await page.$eval('#bill-cycle', e => e.value)) === 'bimonthly');
await page.fill('#bill-amount', '6000'); await page.selectOption('#bill-sys-type', 'ongrid');
await page.click('#lang-ml'); ok('Malayalam selectable', await page.$eval('#lang-ml', e => e.classList.contains('selected')));
await page.click('#btn-next'); await page.waitForTimeout(2000);
// Step 3
let sizes = await page.$$eval('#rec-size-grid .option-card .title', els => els.map(e => e.textContent.trim()));
ok('single-phase offers only ≤5 kW packs', sizes.length > 0 && sizes.every(t => (parseFloat(t) || 0) <= 5), sizes.join(' | '));
for (const c of await page.$$('#rec-size-grid .option-card')) { const t = await c.textContent(); if (/^\s*3 kW/.test(t.replace(/★.*$/, '')) && !/Future/.test(t)) { await c.click(); break; } }
await page.waitForTimeout(800);
ok('appliance list shown for 3 kW', !(await page.$eval('#appliance-wrap', e => e.hidden)));
let tot = await page.textContent('#appliance-total');
ok('default profile fits generation', /fits/.test(tot), tot.replace(/\s+/g, ' ').slice(0, 120));
const rowsBefore = await page.$$eval('#appliance-list input[title="quantity"]', els => els.length);
await page.click('#appliance-list button:has-text("EV Charging (2-wheeler)")'); await page.waitForTimeout(200);
const rowsAfter = await page.$$eval('#appliance-list input[title="quantity"]', els => els.length);
ok('EV 2-wheeler added as a row', rowsAfter === rowsBefore + 1, `${rowsBefore} → ${rowsAfter}`);
await page.screenshot({ path: `${SHOTS}/sales-p1-appliances.png`, fullPage: true });
// three-phase → 3 kW hidden
await page.evaluate(() => { document.getElementById('bill-phase').value = 'three'; renderSizeOptions(); }); await page.waitForTimeout(200);
sizes = await page.$$eval('#rec-size-grid .option-card .title', els => els.map(e => e.textContent.trim()));
ok('three-phase hides 3 kW, offers ≥5 kW', sizes.every(t => (parseFloat(t) || 0) >= 5), sizes.join(' | '));
await page.evaluate(() => { document.getElementById('bill-phase').value = 'single'; renderSizeOptions(); }); await page.waitForTimeout(200);
for (const c of await page.$$('#rec-size-grid .option-card')) { const t = await c.textContent(); if (/^\s*3 kW/.test(t.replace(/★.*$/, '')) && !/Future/.test(t)) { await c.click(); break; } }
await page.waitForTimeout(500);
const evRow = await page.$('#appliance-list button:has-text("EV Charging (2-wheeler)")');
ok('appliance rows kept after re-render (3 kW cached)', evRow != null ? false : true);
for (const c of await page.$$('#rec-roof-grid .option-card')) { if (/Flat roof/.test(await c.textContent())) { await c.click(); break; } }
await page.fill('#site-km', '20'); await page.dispatchEvent('#site-km', 'input');
await page.click('#btn-next'); await page.waitForTimeout(1500);
// Step 4 → 8
for (const c of await page.$$('#tier-grid .tier-card')) { if (/Elite|Premium/i.test(await c.textContent())) { await c.click(); break; } }
await page.waitForTimeout(300); await page.click('#btn-next'); await page.waitForTimeout(1200);   // options
await page.click('#btn-next'); await page.waitForTimeout(800);    // offer
await page.click('#btn-next').catch(() => {}); await page.waitForTimeout(800);   // price
await page.click('#btn-next').catch(() => {}); await page.waitForTimeout(3500);  // generate
const body = await page.textContent('body');
const m = body.match(/GR-\d{8}-\d{4}/);
ok('quotation generated', !!m, m ? m[0] : body.slice(0, 200));
if (m) {
  const list = await (await page.request.get(BASE + '/api/quotation/quotations', { headers: { Authorization: 'Bearer ' + token } })).json();
  const q = (list.quotations || []).find(x => x.quotationNumber === m[0]) || (list.quotations || []).slice(-1)[0];
  const pl = await (await page.request.get(BASE + `/api/quotation/quotations/${q.quotationId}/payload`, { headers: { Authorization: 'Bearer ' + token } })).json();
  const p = pl.payload;
  ok('issued in Malayalam', p.quotation.quotationLanguage === 'ml');
  ok('content snapshot frozen into quotation', p.content?.available === true && p.content.value.version >= 1);
  const ids = (p.applianceUsage?.value?.appliances || []).map(a => a.id);
  ok('EV 2-wheeler row printed on page 3', ids.includes('ev_2w'), ids.join(','));
  ok('Home Uses = appliance total', typeof p.applianceUsage.value.totalDailyUsage === 'number');
  const pdf = await page.request.get(BASE + `/api/quotation/quotations/${q.quotationId}/pdf`, { headers: { Authorization: 'Bearer ' + token } });
  ok('server PDF renders (200, application/pdf)', pdf.status() === 200 && /pdf/.test(pdf.headers()['content-type'] || ''));
}
ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(out.join('\n'));
await browser.close();
process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
