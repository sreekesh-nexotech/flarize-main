import { chromium } from 'playwright';
/**
 * BROWSER VERIFICATION — PH BOM Configuration Workspace + Sales wizard, driven
 * through real pages against a live server (Playwright, bundled Chromium).
 *
 *   PORT=4801 ADMIN_PASSWORD=<pw> node server.js          (dist/ must be built: npx vite build)
 *   E2E_BASE=http://127.0.0.1:4801 SHOT_DIR=/tmp/shots node tests/e2e/browser-ph-sales.mjs
 *
 * Users ph_e2e / sales_e2e must exist (see conformance-http-e2e.mjs header).
 * Screenshots are written to SHOT_DIR (default ./tests/e2e/_shots).
 */
import { mkdirSync } from 'node:fs';
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4801';
const SHOTS = process.env.SHOT_DIR || new URL('./_shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const out = [];
const ok = (name, cond, detail = '') => { out.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };
process.on('uncaughtException', e => { console.log(out.join('\n')); console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
async function loginCtx(username, password) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e.message))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const r = await page.request.post(BASE + '/api/auth/login', { data: { username, password } });
  const { token, user } = await r.json();
  await page.goto(BASE + '/login.html');
  await page.evaluate(([t, role]) => { sessionStorage.setItem('gr_session_token', t); sessionStorage.setItem('gr_user_role', role); sessionStorage.setItem('gr_user_name', 'e2e'); }, [token, user?.role || '']);
  return { page, errors, token, role: user?.role };
}

// ── PH BOM Configuration Workspace ──────────────────────────────────────────
{
  const { page, errors } = await loginCtx('ph_e2e', 'PhE2e2026!');
  await page.goto(BASE + '/ph-bom-config.html'); await page.waitForTimeout(1500);
  ok('PH workspace loads for PROJECT_HEAD (not redirected)', page.url().includes('ph-bom-config'), page.url());
  const text = await page.textContent('body');
  ok('PH workspace shows engineering controls (Save Draft / Submit / validation)', /Save Draft|Submit/i.test(text) && /valid|engineering/i.test(text));
  await page.screenshot({ path: `${SHOTS}/ph-01-landing.png`, fullPage: true });
  // pick ongrid 5sp base if selectors exist
  const sel = await page.$$('select');
  ok('PH workspace has configuration selectors', sel.length >= 1, `${sel.length} selects`);
  try {
    // segments/chips: system type → size 5kW 1P → tier Base
    for (const b of await page.$$('#segType button')) { if (/On-?Grid/i.test(await b.textContent())) { await b.click(); break; } }
    await page.waitForTimeout(800);
    for (const b of await page.$$('#chipsSize button')) { const t = (await b.textContent()) || ''; if (/^5\s*kW/i.test(t.trim()) && /1P/.test(t)) { await b.click(); break; } }
    await page.waitForTimeout(800);
    for (const b of await page.$$('#segTier button')) { if (/^Base$/i.test((await b.textContent() || '').trim())) { await b.click(); break; } }
    await page.waitForTimeout(2500);
    const stText = await page.textContent('body');
    const ids = await page.$$eval('#bomBody td.item small', els => els.map(e => e.textContent.trim()));
    const roles = await page.$$eval('#bomBody td.item b', els => els.map(e => e.textContent.trim()));
    const qtys = await page.$$eval('#bomBody input', i => i.map(x => x.value).filter(v => v !== ''));
    ok('PH workspace renders the authoritative package BOM (PANEL + INVERTER rows with component ids, catalog names, quantities)', roles.includes('PANEL') && roles.includes('INVERTER') && ids.some(i => /^p\d+$/.test(i)) && ids.some(i => /^i\d+$/.test(i)) && qtys.length >= 5, `${ids.length} lines: ${ids.slice(0, 6).join(',')} qty=${qtys.slice(0, 4).join(',')}`);
    const btnCheck = await page.$('#btnCheck');
    ok('PH workspace exposes Run engineering validation / Save Draft / Submit / Approve / Revise controls', !!btnCheck && !!(await page.$('#btnSave')) && !!(await page.$('#btnSubmit')) && !!(await page.$('#btnApprove')) && !!(await page.$('#btnRevise')));
  } catch (e) { ok('PH workspace interaction', false, e.message); }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/ph-02-config.png`, fullPage: true });
  ok('PH workspace: no JS page errors', errors.filter(e => !/favicon|404/.test(e)).length === 0, errors.slice(0, 3).join(' | '));
  await page.context().close();
}

// ── Sales must be redirected away from the engineering workspace ─────────────
{
  const { page } = await loginCtx('sales_e2e', 'SalesE2e2026!');
  await page.goto(BASE + '/ph-bom-config.html'); await page.waitForTimeout(1200);
  ok('Sales opening PH workspace is redirected to the Sales wizard', /sales-wizard|sales\.html|login/.test(page.url()), page.url());
  await page.context().close();
}

// ── Sales flow ───────────────────────────────────────────────────────────────
// 2026-09-09: the separate sales-wizard page was retired (it now redirects to
// /sales.html). The end-to-end Sales flow — customer, bill, system, pack,
// dropdown swaps, price, generate, document — is covered by
// tests/e2e/browser-sales-pack.mjs; here we only prove the redirect.
{
  const { page } = await loginCtx('sales_e2e', 'SalesE2e2026!');
  await page.goto(BASE + '/sales-wizard.html'); await page.waitForTimeout(1200);
  ok('Retired sales-wizard redirects to the single Sales page', /\/sales\.html/.test(page.url()), page.url());
  await page.context().close();
}
await browser.close();
console.log(out.join('\n'));
const passed = out.filter(l => l.startsWith('PASS')).length; console.log(`${passed}/${out.length} browser checks passed`); process.exit(passed === out.length ? 0 : 1);
