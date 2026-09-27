// Browser E2E — old sales.html in PACK mode: Customer → Bill → System (size / FR /
// roof / km / subsidy) → Package → Options (approved swaps only) → Offer → Price
// (server price panel) → Generate → document title = PDF file name.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4801';
const SHOTS = 'tests/e2e/shots';
mkdirSync(SHOTS, { recursive: true });
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const out = [];
const ok = (name, cond, detail = '') => { out.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };
process.on('uncaughtException', e => { console.log(out.join('\n')); console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
page.on('dialog', d => d.accept());
const popups = []; ctx.on('page', p => popups.push(p));

const r = await page.request.post(BASE + '/api/auth/login', { data: { username: 'sales_e2e', password: 'SalesE2e2026!' } });
const { token, user } = await r.json();
await page.goto(BASE + '/login.html');
await page.evaluate(([t, role]) => { sessionStorage.setItem('gr_session_token', t); sessionStorage.setItem('gr_user_role', role); sessionStorage.setItem('gr_user_name', 'e2e'); }, [token, user?.role || '']);
await page.goto(BASE + '/sales.html'); await page.waitForTimeout(1200);
ok('sales.html loads for Sales', !(await page.$eval('#main-view', e => e.hidden)));

// Step 1 — customer
await page.click('#btn-new-cust'); await page.waitForTimeout(200);
const custName = 'Pack E2E ' + Date.now().toString().slice(-5);
await page.fill('#c-name', custName); await page.fill('#c-phone', '98' + String(Date.now()).slice(-8));
await page.fill('#c-address', 'Test Lane, Kochi'); await page.fill('#c-pincode', '682001');
await page.click('button:text("Save Customer")').catch(async () => { await page.click('#cust-new-form button.btn-primary'); }); await page.waitForTimeout(600);
ok('customer created', /Customer selected/.test(await page.textContent('#cust-selected')));
await page.click('#btn-next'); await page.waitForTimeout(300);

// Step 2 — bill
await page.fill('#bill-amount', '2500'); await page.selectOption('#bill-sys-type', 'ongrid');
await page.click('#btn-next'); await page.waitForTimeout(1800);

// Step 3 — system
let text = await page.textContent('#step-3');
ok('size cards from approved config incl. Future Ready card, no "Upgradeable to"', /Future Ready/.test(text) && !/Upgradeable to/.test(text));
ok('roof cards are the priced roof types', /Flat roof/.test(text) && /Sheet roof/.test(text) && /Elevated structure/.test(text));
ok('distance field + included-km note', (await page.$('#site-km')) != null && /km one-way is included/.test(text));
ok('subsidy cards present', /Residential \(PM Surya Ghar\)/.test(text) && /No subsidy/.test(text));
// pick 3 kW standard, sheet roof, 130 km
for (const c of await page.$$('#rec-size-grid .option-card')) { const t = await c.textContent(); if (/^\s*3 kW\s*1P/.test(t.replace(/★.*$/, '')) && !/Future/.test(t)) { await c.click(); break; } }
for (const c of await page.$$('#rec-roof-grid .option-card')) { if (/Sheet roof/.test(await c.textContent())) { await c.click(); break; } }
await page.click('#btn-next'); await page.waitForTimeout(300);
ok('step 3 blocks without distance', /distance/i.test(await page.textContent('#alert-area')));
await page.fill('#site-km', '130'); await page.dispatchEvent('#site-km', 'input');
await page.screenshot({ path: `${SHOTS}/sales-01-system.png`, fullPage: true });
await page.click('#btn-next'); await page.waitForTimeout(1500);

// Step 4 — package
text = await page.textContent('#step-4');
ok('tier cards render with key components', /Base/.test(text) && /Value/.test(text) && /×/.test(text));
for (const c of await page.$$('#tier-grid .tier-card')) { if (/Value/.test(await c.textContent())) { await c.click(); break; } }
await page.click('#btn-next'); await page.waitForTimeout(1800);

// Step 5 — options
text = await page.textContent('#step-5');
ok('configuration table marks fixed vs changeable lines', /fixed by Project Head/.test(text) && /changeable below/.test(text));
ok('structure line follows the roof', /Sheet roof pack/.test(text));
ok('panel alternatives are a dropdown with DCR / Non-DCR shown', /Solar Panel/.test(text) && (await page.$$eval('#step-5 select', els => els.length)) >= 1 && /DCR/.test(text));
ok('no battery / cost fields exposed', !/₹/.test(text) && !/battery/i.test(text));
// swap panel to a non-default alternative via the dropdown
const panelSelect = (await page.$$('#step-5 select'))[0];
const optionValues = await panelSelect.$$eval('option', os => os.map(o => ({ v: o.value, selected: o.selected })));
const other = optionValues.find(o => !o.selected);
let swapped = false;
if (other) { await panelSelect.selectOption(other.v); swapped = true; }
await page.waitForTimeout(1500);
ok('panel swap accepted (server bom-preview)', swapped && !/Selection not allowed/.test(await page.textContent('#alert-area')));
await page.screenshot({ path: `${SHOTS}/sales-02-options.png`, fullPage: true });
await page.click('#btn-next'); await page.waitForTimeout(800);

// Step 6 — offers (skip)
await page.click('#btn-next'); await page.waitForTimeout(2000);

// Step 7 — price
text = await page.textContent('#step-7');
ok('price panel from server: System Price / GST / Customer Price', /Customer Price \(incl\. GST\)/.test(text) && /System Price/.test(text) && /GST \(8\.9% composite\)/.test(text));
ok('transport extra shown separately (130 km > 100 included)', /Transport extra \(30 km beyond 100 km\)/.test(text) && /shown separately/.test(text));
ok('subsidy row + net payable', /Subsidy/.test(text) && /Net payable after subsidy/.test(text));
ok('validity from policy (or explicit not-configured notice)', /Valid for \d+ days|Validity not configured/.test(text));
ok('no internal figures in Sales price panel', !/margin|reference|cost/i.test(text));
await page.screenshot({ path: `${SHOTS}/sales-03-price.png`, fullPage: true });

// Step 8 — generate
await page.click('#btn-next'); await page.waitForTimeout(5000);
text = await page.textContent('#step-8');
ok('quotation generated', /Quotation generated successfully/.test(text), text.slice(0, 200));
const m = text.match(/PDF file name\s*([A-Za-z0-9_]+\.pdf)/);
ok('PDF file name = {Customer}_{OnGrid|Hybrid}_{kW}kW_{QNo}.pdf', !!m && new RegExp(`^${custName.replace(/[^A-Za-z0-9]+/g, '_')}_OnGrid_3kW_[A-Za-z0-9_]+\\.pdf$`).test(m[1]), m?.[1]);
ok('Download PDF button present', /Download PDF/.test(text));
// 2026-09-10 — Sales sees which of the three options made it into the document and,
// in plain words, why a missing one is missing (never a bare code, never internals).
ok('options block lists value / base / premium', /OPTIONS IN THIS QUOTATION/.test(text) && /value/i.test(text) && /base/i.test(text) && /premium/i.test(text));
ok('missing options carry a plain-language reason (no raw ALTERNATIVE_TIER_ codes)', !/ALTERNATIVE_TIER_/.test(text) && (/all 3 options/.test(text) || /not in the quotation — /.test(text)));
ok('no internal figures on the result screen', !/margin|reference cost|landed/i.test(text));
// (screenshot of the result page taken after the popup is handled — a fresh popup blocks captures of the opener)

// document popup title
await page.waitForTimeout(3000);
const doc = popups[0];
if (doc) {
  await doc.waitForLoadState('load').catch(() => {}); await doc.waitForTimeout(3000);
  const title = await doc.title();
  ok('quotation document title is the PDF file name', m && title === m[1].replace(/\.pdf$/, ''), title);
  const dtext = await doc.textContent('body').catch(() => '');
  ok('document shows transport extra and subsidy', /Transport|transport/.test(dtext) && /Subsidy|subsidy/.test(dtext));
  await doc.screenshot({ path: `${SHOTS}/sales-05-document.png`, fullPage: true, timeout: 20000 }).catch(() => {});
} else ok('quotation document opened', false, 'no popup');

await page.bringToFront(); await page.screenshot({ path: `${SHOTS}/sales-04-generated.png`, timeout: 15000 }).catch(() => {});
ok('no page errors / failed requests', errors.length === 0, errors.slice(0, 4).join(' | '));
await browser.close();
console.log(out.join('\n'));
const fails = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - fails}/${out.length} passed`);
process.exit(fails ? 1 : 0);
