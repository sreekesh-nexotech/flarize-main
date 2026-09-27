// Browser E2E (P1, 2026-09-13) — Project Head edits document text on quotation-content.html:
// fit-guard blocks an over-long clause, a valid edit saves, publish bumps the version.
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:4800';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const out = []; const ok = (n, c, d = '') => out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
process.on('uncaughtException', e => { console.log(out.join('\n')); console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
page.on('dialog', d => d.accept());
const r = await page.request.post(BASE + '/api/auth/login', { data: { username: 'projhead1', password: 'projhead123' } });
const { token, user } = await r.json();
ok('project head can log in', !!token && user?.role === 'PROJECT_HEAD');
await page.goto(BASE + '/login.html');
await page.evaluate(([t, role]) => { sessionStorage.setItem('gr_session_token', t); sessionStorage.setItem('gr_user_role', role); sessionStorage.setItem('gr_user_name', 'PH'); }, [token, user?.role || '']);
await page.goto(BASE + '/quotation-content.html'); await page.waitForTimeout(1500);
ok('nav shows Quotation content for PH', /Quotation content/.test(await page.textContent('nav, .fnav, body')));
ok('editor loaded with tabs', (await page.$$('#docTabs .doc-tab')).length === 7);
const before = await page.textContent('#docState');
// over-long clause → server 422 → error list
await page.fill('textarea[data-path="terms.0.body.en"]', 'x'.repeat(1200));
ok('counter turns red when over limit', await page.$eval('[data-count="terms.0.body.en"]', e => e.classList.contains('over')));
await page.click('#docSave'); await page.waitForTimeout(800);
ok('save refused with fit error', /Does not fit/.test(await page.textContent('#docErrors')));
// fix + save + publish
await page.fill('textarea[data-path="terms.0.body.en"]', 'Golden Ray Renewable Energy provides a five (5) year warranty for the complete solar power system. E2E edit.');
await page.click('#docSave'); await page.waitForFunction(() => /unpublished changes/.test(document.getElementById('docState').textContent), null, { timeout: 8000 }).catch(() => {});
ok('draft saved', /unpublished changes/.test(await page.textContent('#docState')));
await page.click('#docPublish'); await page.waitForTimeout(1500);
const after = await page.textContent('#docState');
const vb = Number((before.match(/v(\d+)/) || [])[1]); const va = Number((after.match(/published v(\d+)/) || [])[1]);
ok('published (version bumped)', va === vb + 1, `${before.trim()} → ${after.trim()}`);
// appliances tab renders profiles
await page.click('button[data-tab="appliances"]'); await page.waitForTimeout(300);
ok('appliance profiles listed', /3 kW default house/.test(await page.textContent('#docBody')) && /10 kW default house/.test(await page.textContent('#docBody')));
// testimonials PUT allowed for PH
const put = await page.request.put(BASE + '/api/quotation-content/testimonials', { headers: { Authorization: 'Bearer ' + token }, data: { intro: 'e2e', entries: [{ name: 'A', quote: 'B' }] } });
ok('PH may save testimonials', put.status() === 200, String(put.status()));
ok('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
console.log(out.join('\n')); await browser.close();
process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
