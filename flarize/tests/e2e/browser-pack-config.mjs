// Browser E2E — kW Packs (Project Head pack configuration) page.
// Server on BASE (default 4801) with the e2e users (ph_e2e / admin). Screenshots → tests/e2e/shots.
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
async function loginCtx(username, password) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e.message))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url()) && !/price-preview|bom-preview/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
  page.on('dialog', d => d.accept());
  const r = await page.request.post(BASE + '/api/auth/login', { data: { username, password } });
  const { token, user } = await r.json();
  await page.goto(BASE + '/login.html');
  await page.evaluate(([t, role]) => { sessionStorage.setItem('gr_session_token', t); sessionStorage.setItem('gr_user_role', role); sessionStorage.setItem('gr_user_name', 'e2e'); }, [token, user?.role || '']);
  return { page, errors, token, role: user?.role };
}
const tab = async (page, label) => { for (const b of await page.$$('#tabs button')) { if ((await b.textContent()).startsWith(label)) { await b.click(); await page.waitForTimeout(400); return; } } throw new Error('tab not found ' + label); };

// ── Project Head ────────────────────────────────────────────────────────────
{
  const { page, errors } = await loginCtx('ph_e2e', 'PhE2e2026!');
  await page.goto(BASE + '/pack-config.html'); await page.waitForTimeout(1500);
  ok('PH lands on kW Packs (not redirected)', page.url().includes('pack-config'), page.url());
  ok('nav shows kW Packs link', (await page.textContent('nav')).includes('kW Packs'));
  let text = await page.textContent('body');
  ok('packs tab shows sizes + slots', /kW sizes/.test(text) && /Slots \(variable items\)/.test(text));
  ok('approved / draft pills rendered', /approved v\d+/.test(text) && /draft v\d+/.test(text));
  await page.screenshot({ path: `${SHOTS}/pack-01-packs.png`, fullPage: true });

  // open a slot config (defaults × alternatives)
  const cfgBtn = (await page.$$('button:text("Configure ▸")'))[0];
  if (cfgBtn) { await cfgBtn.click(); await page.waitForTimeout(300); }
  text = await page.textContent('body');
  ok('slot configure row shows default matrix + alternatives', /Default component/.test(text) && /Approved alternatives/.test(text));
  await page.screenshot({ path: `${SHOTS}/pack-02-slot-config.png`, fullPage: true });

  await tab(page, 'Consumables'); text = await page.textContent('body');
  ok('consumables tab lists fixed items', /Consumables — /.test(text) && /Add consumable/.test(text));
  await page.screenshot({ path: `${SHOTS}/pack-03-consumables.png`, fullPage: true });

  await tab(page, 'Structure'); text = await page.textContent('body');
  ok('structure tab shows the three roof tables', /Flat roof/.test(text) && /Sheet roof/.test(text) && /Elevated/.test(text));
  await page.screenshot({ path: `${SHOTS}/pack-04-structure.png`, fullPage: true });

  await tab(page, 'Costs'); text = await page.textContent('body');
  ok('costs tab: reference costs, installation matrix, transport, GST, pricing mode', /Installation amount/.test(text) && /Transport \(D3\)/.test(text) && /GST \(D2\)/.test(text) && /Pricing mode/.test(text));
  ok('pricing mode select disabled for PH (Admin decision)', await page.$eval('select', () => true) && (await page.$$eval('select', els => els.filter(e => e.disabled && [...e.options].some(o => o.value === 'PACK_MARKET_RATE')).length)) === 1);
  await page.screenshot({ path: `${SHOTS}/pack-05-costs.png`, fullPage: true });

  await tab(page, 'Market rates'); text = await page.textContent('body');
  ok('market rates tab: per-pack rows incl. future-ready keys', /Market rates — the customer price/.test(text) && /_up/.test(text) && /NOT SET|all set/.test(text));
  await page.screenshot({ path: `${SHOTS}/pack-06-rates.png`, fullPage: true });

  await tab(page, 'Future ready'); text = await page.textContent('body');
  ok('future-ready tab lists pairs with phase check', /Future-ready packs/.test(text) && /1P → 1P|3P → 3P/.test(text));
  await page.screenshot({ path: `${SHOTS}/pack-07-future.png`, fullPage: true });

  await tab(page, 'Review'); text = await page.textContent('body');
  ok('review tab: lifecycle + change log + draft preview', /Lifecycle/.test(text) && /Draft change log/.test(text) && /Preview the DRAFT/.test(text));
  // run a preview
  await page.click('button:text("Preview")'); await page.waitForTimeout(2500);
  text = await page.textContent('body');
  ok('draft preview materialises lines + shows customer price or a named blocker', /engineering (VALID|BLOCKED)/.test(text) && (/Customer price incl\. GST/.test(text) || /MARKET_RATE_NOT_SET|INSTALLATION_NOT_SET/.test(text)));
  await page.screenshot({ path: `${SHOTS}/pack-08-review-preview.png`, fullPage: true });

  // edit → save round trip (costs.office)
  await tab(page, 'Costs');
  const officeInput = await page.$('input[type=number]:below(:text("Office overhead"))').catch(() => null) || (await page.$$('.fields input'))[6];
  const before = await officeInput.inputValue();
  await officeInput.fill(String((Number(before) || 0) + 1)); await officeInput.dispatchEvent('change'); await page.waitForTimeout(200);
  text = await page.textContent('body');
  ok('edit marks the section dirty + enables Save', /Unsaved: costs/.test(text) && !(await page.$eval('#btnSave', b => b.disabled)));
  await page.click('#btnSave'); await page.waitForTimeout(1200);
  text = await page.textContent('body');
  ok('save writes the draft (toast) and clears dirty state', /Saved to draft v\d+: costs/.test(text) && /No unsaved changes/.test(text));
  // restore the value
  await tab(page, 'Costs');
  const officeInput2 = (await page.$$('.fields input'))[6];
  await officeInput2.fill(String(before)); await officeInput2.dispatchEvent('change'); await page.click('#btnSave'); await page.waitForTimeout(800);
  ok('no page errors on PH flow', errors.length === 0, errors.slice(0, 3).join(' | '));
}

// ── Sales is redirected ─────────────────────────────────────────────────────
{
  const { page } = await loginCtx('sales_e2e', 'SalesE2e2026!');
  await page.goto(BASE + '/pack-config.html'); await page.waitForTimeout(1200);
  ok('Sales cannot open kW Packs (redirected to sales)', /sales\.html/.test(page.url()), page.url());
  const r = await page.request.get(BASE + '/api/pack-config/draft', { headers: { Authorization: 'Bearer ' + (await page.evaluate(() => sessionStorage.getItem('gr_session_token'))) } });
  ok('API refuses Sales on /api/pack-config/draft (403)', r.status() === 403, String(r.status()));
}

await browser.close();
console.log(out.join('\n'));
const fails = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - fails}/${out.length} passed`);
process.exit(fails ? 1 : 0);
