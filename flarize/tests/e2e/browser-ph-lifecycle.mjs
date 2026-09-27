import { chromium } from 'playwright';
/**
 * BROWSER VERIFICATION — PH package lifecycle in the BOM Configuration Workspace:
 * load Premium (Enphase) package → Create Revision → Run Engineering Validation
 * (expects BLOCKED on the missing approved MICRO_INVERTER / IQ controller lines —
 * a DATA blocker, with architecture resolved as ENPHASE) → Submit disabled →
 * "+ Template" / "+ Add-on" search actions → archive the draft.
 *
 *   E2E_BASE=http://127.0.0.1:4801 SHOT_DIR=/tmp/shots node tests/e2e/browser-ph-lifecycle.mjs
 */
import { mkdirSync } from 'node:fs';
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4801';
const SHOTS = process.env.SHOT_DIR || new URL('./_shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const out = []; const ok = (n, c, d = '') => out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
process.on('uncaughtException', e => { console.log(out.join('\n')); console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
const r = await page.request.post(BASE + '/api/auth/login', { data: { username: 'ph_e2e', password: 'PhE2e2026!' } });
const { token, user } = await r.json();
await page.goto(BASE + '/login.html');
await page.evaluate(([t, role]) => { sessionStorage.setItem('gr_session_token', t); sessionStorage.setItem('gr_user_role', role); sessionStorage.setItem('gr_user_name', 'ph_e2e'); }, [token, user.role]);
await page.goto(BASE + '/ph-bom-config.html'); await page.waitForTimeout(1500);
await page.click('[id="segType"] button:has-text("On-Grid")'); await page.waitForTimeout(800);
for (const b of await page.$$('#chipsSize button')) { const t = (await b.textContent()) || ''; if (/^5\s*kW/i.test(t.trim()) && /1P/.test(t)) { await b.click(); break; } }
await page.waitForTimeout(800);
await page.click('#segTier button:has-text("Premium")'); await page.waitForTimeout(3000);
let body = await page.textContent('body');
ok('PH: Premium (Enphase) 5 kW package loads with full BOM and quantities', /PKG-ONGRID-5sp-1P-PREMIUM/.test(body) && (await page.$$eval('#bomBody input', i => i.map(x => x.value).filter(v => v !== '').length)) > 5, `${(await page.$$eval('#bomBody input', i => i.map(x => x.value).filter(v => v !== '').length))} qty inputs filled`);
ok('PH: engineering status shows legacy approval / not-run honestly (no implied Passed)', /Legacy approval|NOT RUN|BLOCKED|WARNING/i.test(body) && !/Engineering Check: Passed/.test(body));
await page.screenshot({ path: `${SHOTS}/ph-03-premium.png`, fullPage: false });
// Create revision → run validation → expect BLOCKED with MICRO_INVERTER finding (data blocker) — no fabricated component
await page.click('#btnRevise'); await page.waitForTimeout(2500);
body = await page.textContent('body');
ok('PH: Create Revision (v+1) produces a DRAFT v2', /DRAFT/.test(body) && /v2/.test(body), body.match(/DRAFT[^\n]{0,30}/)?.[0]);
await page.click('#btnCheck'); await page.waitForTimeout(3000);
body = await page.textContent('body');
ok('PH: Run Engineering Validation on Premium DRAFT → BLOCKED naming missing MICRO_INVERTER / IQ controller (ENPHASE architecture, no PBC-A-002)', /BLOCKED/.test(body) && /MICRO_INVERTER/.test(body) && /ENPHASE/.test(body) && !/PBC-A-002/.test(body), (body.match(/PBC-[A-Z]-\d{3}/g) || []).join(','));
ok('PH: Submit disabled while BLOCKED', await page.$eval('#btnSubmit', b => b.disabled));
await page.screenshot({ path: `${SHOTS}/ph-04-validation.png`, fullPage: true });
// Add-to-template search UI exists
await page.fill('#addQ', 'IQ8P'); await page.waitForTimeout(1200);
const hasTemplateBtn = (await page.$$('#addRes button:has-text("Template")')).length > 0;
ok('PH: catalog search offers "+ Template" (engineering line) and "+ Add-on" for approved items', hasTemplateBtn && (await page.$$('#addRes button:has-text("Add-on")')).length > 0);
await page.screenshot({ path: `${SHOTS}/ph-05-add-template.png`, fullPage: false });
// cleanup: archive the draft via API
const cfg = await page.textContent('#cfgKey').catch(() => '');
const pkgId = (await page.textContent('body')).match(/CFGPKG-[A-Za-z0-9-]+/)?.[0];
if (pkgId) { const a = await page.request.post(`${BASE}/api/packages/${pkgId}/archive`, { headers: { Authorization: 'Bearer ' + token }, data: { at: new Date().toISOString(), reason: 'browser verification cleanup' } }); ok('cleanup: draft archived', a.status() === 200, `${pkgId} ${a.status()}`); }
ok('PH page: no JS errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(out.join('\n')); const passed = out.filter(l => l.startsWith('PASS')).length; console.log(`${passed}/${out.length} PH browser checks passed`); process.exit(passed === out.length ? 0 : 1);
