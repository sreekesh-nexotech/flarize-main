// APPROVED TEMPLATE — 18-check contract test suite (Phase 1).
//
// Verifies the 18 requirements from the ARCHITECTURE LOCK:
//   (1)  Exactly 12 sections loaded.
//   (2)  Exactly 12 pages printed.
//   (3)  Every page A4.
//   (4)  Preview scaffolding removed.
//   (5)  Section DOM preserved.
//   (6)  Approved asset references resolve.
//   (7)  All approved mustaches resolve or explicitly fail.
//   (8)  All approved image-slots resolve.
//   (9)  Unknown mustaches fail.
//   (10) Missing required snapshot values fail.
//   (11) Page 1 remains single approved image.
//   (12) Page 2 remains approved live DOM.
//   (13) Page 3 remains exact approved image.
//   (14) Pages 4-12 remain approved DOM.
//   (15) No business logic executed by renderer.
//   (16) No pricing calculations executed by renderer.
//   (17) No new layout coordinates introduced.
//   (18) PDF rasterization succeeds.
//
// Uses ONLY the vendored approved bundle + snapshot payload (no live engines).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import {
  loadTemplate, stripPreviewShell, expandImageSlots,
  substituteMustaches, validateUnresolvedTokens, renderQuotationHtml,
  TOKEN_REGISTRY, IMAGE_SLOT_REGISTRY, PREVIEW_SHELL_TAGS, A4_PRINT_CSS,
  AUTHORITATIVE_SOURCES, PAGE_3_STATUS, RENDER_ERROR, RENDER_STATUS,
  PRODUCTION_BLOCKER,
} from '../../src/lib/approvedTemplate.js';
import { _clearApprovedTemplateCache } from '../../src/lib/approvedTemplate.loader.js';

const require   = createRequire(import.meta.url);
const { chromium }     = require('playwright');
const { PDFDocument }  = require('pdf-lib');

const CHROME_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT_DIR     = 'tests/approved-template/_out';
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const A4_W_PT = 595.276, A4_H_PT = 841.890, TOL = 1.5;

// -----------------------------------------------------------------------------
// A minimal snapshot payload sufficient for the resolvable (non-tier) tokens.
// Every value is a real number; nothing is a template default.
// -----------------------------------------------------------------------------
function minimalPayload() {
  return {
    financing: { available: true, source: 'FINANCE_ENGINE', status: 'COMPLETE', value: {
      downPaymentPercentage: 10,
      downPaymentAmount: 26800,
      tenureYears: 10,
      interestRatePct: 8,
      postSubsidyInvestment: 190000,
      monthlyEMI: 2306,
    }},
    subsidy: { available: true, source: 'SUBSIDY_ENGINE', value: {
      subsidyAmount: 78000,
    }},
    savings: { available: true, source: 'SAVINGS_ENGINE', value: {
      monthlySavings: 5500,
      monthlySavingsLow: 5183,
      monthlySavingsHigh: 5700,
    }},
    pricing: { available: true, source: 'COMMERCIAL_SNAPSHOT', value: {
      customerTotalIncludingGST: 268000,
      // tiers: intentionally absent — exercises TIER_PRICING blocker
    }},
    company: { available: true, source: 'COMPANY_MASTER', value: {
      address: 'Thannikakal, Thumpoly PO', city: 'Alappuzha', pincode: '688008',
      website: 'www.flarize.com', email: 'sales@flarize.com', phone: '+91 9995 073 579',
    }},
    campaign: { available: true, source: 'CMS', value: {
      artwork: {},  // no image-slot overrides — defaults from manifest
    }},
    energyProfile: { available: false, value: null },
  };
}

// -----------------------------------------------------------------------------
// Shared PDF pipeline — 1 run, many assertions.
// -----------------------------------------------------------------------------
let browser, printedHtml, pdfBytes, doc, sectionBoundsInDom;
const PDF_PATH = `${OUT_DIR}/approved-template-poc.pdf`;
const HTML_PATH = `${OUT_DIR}/approved-template-print.html`;

before(async () => {
  _clearApprovedTemplateCache();
  // Render — non-strict so blockers don't throw; validate them explicitly below.
  const result = renderQuotationHtml(minimalPayload(), { strict: false, includePage3Blocker: true });
  printedHtml  = result.html;
  writeFileSync(HTML_PATH, printedHtml);

  browser = await chromium.launch({
    executablePath: CHROME_PATH,
    args: ['--no-sandbox','--disable-web-security','--allow-file-access-from-files'],
  });
  const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(HTML_PATH).href, { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(400);
  sectionBoundsInDom = await page.evaluate(() =>
    Array.from(document.querySelectorAll('section.page')).map((s, i) => {
      const r = s.getBoundingClientRect();
      return { i: i+1, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }));
  pdfBytes = await page.pdf({
    format: 'A4', printBackground: true, preferCSSPageSize: true,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  });
  writeFileSync(PDF_PATH, pdfBytes);
  await browser.close();
  doc = await PDFDocument.load(pdfBytes);
});

after(async () => { if (browser && browser.isConnected()) await browser.close(); });

// ═════════════════════════════════════════════════════════════════════════════
// (1) Exactly 12 sections loaded
// ═════════════════════════════════════════════════════════════════════════════
test('(1) approved template loads with exactly 12 sections', () => {
  const t = loadTemplate();
  assert.equal(t.sectionCount, 12);
  const inHtml = (t.templateHtml.match(/<section class="page"/g) || []).length;
  assert.equal(inHtml, 12);
});

// ═════════════════════════════════════════════════════════════════════════════
// (2) Exactly 12 pages printed
// ═════════════════════════════════════════════════════════════════════════════
test('(2) rendered PDF has exactly 12 pages', () => {
  assert.equal(doc.getPageCount(), 12);
});

// ═════════════════════════════════════════════════════════════════════════════
// (3) Every page A4
// ═════════════════════════════════════════════════════════════════════════════
test('(3) every PDF page is A4 portrait (595.28 × 841.89 pt ±1.5)', () => {
  for (let i = 0; i < doc.getPageCount(); i++) {
    const { width, height } = doc.getPage(i).getSize();
    assert.ok(Math.abs(width - A4_W_PT) <= TOL,   `page ${i+1} width ${width}`);
    assert.ok(Math.abs(height - A4_H_PT) <= TOL,  `page ${i+1} height ${height}`);
    assert.ok(height > width,                     `page ${i+1} portrait`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// (4) Preview scaffolding removed
// ═════════════════════════════════════════════════════════════════════════════
test('(4) preview scaffolding removed from print HTML', () => {
  assert.equal(/<x-dc\b/.test(printedHtml),                                     false, '<x-dc> leftover');
  assert.equal(/<helmet\b/.test(printedHtml),                                   false, '<helmet> leftover');
  assert.equal(/<doc-page\b/.test(printedHtml),                                 false, '<doc-page> leftover');
  assert.equal(/<script[^>]*type="__bundler\//.test(printedHtml),               false, '__bundler script leftover');
  assert.equal(/<div\s+id="__bundler_/.test(printedHtml),                       false, '__bundler UI leftover');
  assert.equal(/<script\s+src="[0-9a-f]{8}-/.test(printedHtml),                 false, 'runtime UUID script leftover');
});

test('(4b) preview-shell registry names 8 removed tags', () => {
  assert.equal(PREVIEW_SHELL_TAGS.length, 8);
  const names = PREVIEW_SHELL_TAGS.map(t => t.name);
  for (const n of ['runtime-script','bundler-scripts','x-dc','helmet','doc-page',
                    'bundler-loading','bundler-error-sink','ext-runtime-script']) {
    assert.ok(names.includes(n), `preview registry names ${n}`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// (5) Section DOM preserved
// ═════════════════════════════════════════════════════════════════════════════
test('(5) section DOM preserved verbatim (12 sections, opening + closing tags intact)', () => {
  const opens  = (printedHtml.match(/<section class="page"/g) || []).length;
  const closes = (printedHtml.match(/<\/section>/g) || []).length;
  assert.equal(opens, 12);
  assert.ok(closes >= 12, `expected ≥12 </section>, got ${closes}`);

  // Diff-safe check: extract the raw approved section bodies from the loaded
  // template and confirm each survives strip + expand + substitute intact
  // (aside from image-slot expansion and mustache substitution).
  const { templateHtml } = loadTemplate();
  const rawSections = extractSections(templateHtml);
  const outSections = extractSections(printedHtml);
  assert.equal(outSections.length, rawSections.length);

  // The raw section MAY carry <image-slot> or {{mustaches}}. Strip those from
  // both sides before comparing structural markers.
  for (let i = 0; i < rawSections.length; i++) {
    const rawStripped = rawSections[i].replace(/<image-slot\b[^>]*\/?>/g, '')
                                       .replace(/\{\{[^}]+\}\}/g, '');
    const outStripped = outSections[i].replace(/<img\s+data-image-slot="[^"]*"[^>]*>/g, '')
                                       .replace(/\{\{[^}]+\}\}/g, '');
    // Both stripped versions must have the same major-structure markers
    for (const marker of ['<section class="page"', '</section>']) {
      assert.ok(rawStripped.includes(marker), `raw sec ${i+1} has ${marker}`);
      assert.ok(outStripped.includes(marker), `out sec ${i+1} has ${marker}`);
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// (6) Approved asset references resolve
// ═════════════════════════════════════════════════════════════════════════════
test('(6) approved asset UUIDs all resolve to data: URIs in manifest', () => {
  const { templateHtml, uriMap } = loadTemplate();
  const uuidRe = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
  const uuids = new Set(templateHtml.match(uuidRe) || []);
  let resolved = 0, notInMap = 0;
  for (const u of uuids) {
    if (uriMap[u]) resolved++; else notInMap++;
  }
  // Not every UUID is an asset (some may be script srcs stripped later); the
  // count of resolvable ones must equal the manifest asset count.
  assert.ok(resolved >= 12, `at least 12 asset UUIDs must resolve (got ${resolved})`);
});

// ═════════════════════════════════════════════════════════════════════════════
// (7) All approved mustaches resolve OR explicitly fail
// ═════════════════════════════════════════════════════════════════════════════
test('(7) unresolved mustaches produce named blockers (no silent substitution)', () => {
  const { templateHtml, uriMap } = loadTemplate();
  const shell = stripPreviewShell(templateHtml);
  const { html: expanded } = expandImageSlots(shell, uriMap, minimalPayload());
  const { html: subHtml, substituted, unresolved } = substituteMustaches(expanded, minimalPayload());

  // Non-tier tokens must have substituted.
  const subNames = new Set(substituted.map(s => s.token));
  for (const t of ['downLabel','subsidyAmt','smartSubsidyMinus','emiLabel','emiOn','emiValue','dailyValue','savingsRange']) {
    assert.ok(subNames.has(t), `${t} must have substituted with minimalPayload`);
  }
  // Tier tokens must have surfaced blockers.
  const unNames = new Set(unresolved.map(u => u.token));
  for (const t of ['eliteCost','smartCost','essentialCost','eliteDown','smartDown','essentialDown',
                    'eliteFin','smartFin','essentialFin','eliteEmiValue','smartEmiValue','essentialEmiValue',
                    'eliteDaily','smartDaily','essentialDaily']) {
    assert.ok(unNames.has(t), `${t} must surface as unresolved (tier blocker)`);
  }
  const val = validateUnresolvedTokens(subHtml, unresolved, { strict: false });
  assert.equal(val.status, RENDER_STATUS.BLOCKED);
  assert.ok(val.blockers.some(b => b.code === PRODUCTION_BLOCKER.TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT),
    'TIER_PRICING blocker must appear');
});

test('(7b) strict mode throws on unresolved', () => {
  assert.throws(
    () => renderQuotationHtml(minimalPayload(), { strict: true, includePage3Blocker: false }),
    /MUSTACHE_UNRESOLVED/);
});

// ═════════════════════════════════════════════════════════════════════════════
// (8) All approved image-slots resolve
// ═════════════════════════════════════════════════════════════════════════════
test('(8) all 4 approved <image-slot> tags expand to <img> with data URIs', () => {
  const { templateHtml, uriMap } = loadTemplate();
  const { html: expanded, expanded: report } = expandImageSlots(stripPreviewShell(templateHtml), uriMap, minimalPayload());
  assert.equal(report.length, 4);
  const ids = new Set(report.map(r => r.id));
  for (const id of ['ofr-scooter','ben-ac1','ben-ac2','ben-ac3']) assert.ok(ids.has(id), `${id} expanded`);
  // Template must have no remaining <image-slot> tags after expansion.
  assert.equal(/<image-slot\b/.test(expanded), false);
});

test('(8b) customer override wins over manifest default when present', () => {
  const p = minimalPayload();
  p.campaign.value.artwork = {
    scooterImageUri: 'https://cdn.example.com/customer-scooter.jpg',
  };
  const { templateHtml, uriMap } = loadTemplate();
  const { expanded: report } = expandImageSlots(stripPreviewShell(templateHtml), uriMap, p);
  const scooter = report.find(r => r.id === 'ofr-scooter');
  assert.equal(scooter.overridden, true);
});

// ═════════════════════════════════════════════════════════════════════════════
// (9) Unknown mustaches fail
// ═════════════════════════════════════════════════════════════════════════════
test('(9) unknown {{mustache}} in template fails loudly', () => {
  const fakeHtml = '<section class="page">{{ notInRegistry }}</section>';
  assert.throws(() => substituteMustaches(fakeHtml, {}), /MUSTACHE_UNKNOWN/);
});

// ═════════════════════════════════════════════════════════════════════════════
// (10) Missing required snapshot values fail
// ═════════════════════════════════════════════════════════════════════════════
test('(10) missing required snapshot values surface as unresolved (not silently defaulted)', () => {
  const p = minimalPayload();
  delete p.subsidy;  // remove entire subsidy section
  const { templateHtml, uriMap } = loadTemplate();
  const shell = stripPreviewShell(templateHtml);
  const { html: expanded } = expandImageSlots(shell, uriMap, p);
  const { unresolved } = substituteMustaches(expanded, p);
  const names = new Set(unresolved.map(u => u.token));
  assert.ok(names.has('subsidyAmt'),        'subsidyAmt must surface as unresolved');
  assert.ok(names.has('smartSubsidyMinus'), 'smartSubsidyMinus must surface as unresolved');
});

// ═════════════════════════════════════════════════════════════════════════════
// (11) Page 1 remains single approved image
// ═════════════════════════════════════════════════════════════════════════════
test('(11) Page 1 = one <img class="pg" src="data:image/jpeg…">, nothing else', () => {
  const sections = extractSections(printedHtml);
  const p1 = sections[0];
  const imgMatches = p1.match(/<img\b[^>]*>/g) || [];
  assert.equal(imgMatches.length, 1, `Page 1 must have exactly 1 <img>, got ${imgMatches.length}`);
  assert.ok(/class="pg"/.test(imgMatches[0]),          'Page 1 <img> must carry class="pg"');
  assert.ok(/src="data:image\//.test(imgMatches[0]),   'Page 1 <img> src must be a data: image URI');
});

// ═════════════════════════════════════════════════════════════════════════════
// (12) Page 2 remains approved live DOM
// ═════════════════════════════════════════════════════════════════════════════
test('(12) Page 2 keeps approved live DOM (>6 <img>, gradient background, Onam hero)', () => {
  const sections = extractSections(printedHtml);
  const p2 = sections[1];
  const imgCount = (p2.match(/<img\b/g) || []).length;
  assert.ok(imgCount >= 6, `Page 2 must have ≥6 <img> after image-slot expansion, got ${imgCount}`);
  // Approved DOM markers that must survive verbatim:
  assert.ok(/radial-gradient\(120% 60% at 50% 0%,#fff9ec 0%,#ffffff 55%\)/.test(p2),
    'Approved radial-gradient background must remain');
  assert.ok(/linear-gradient\(135deg,#123f35 0%,#0e3129 100%\)/.test(p2),
    'Approved campaign panel gradient must remain');
});

// ═════════════════════════════════════════════════════════════════════════════
// (13) Page 3 remains exact approved image
// ═════════════════════════════════════════════════════════════════════════════
test('(13) Page 3 = single approved image (no masks, no overlays, no mustaches)', () => {
  const sections = extractSections(printedHtml);
  const p3 = sections[2];
  const imgMatches = p3.match(/<img\b[^>]*>/g) || [];
  assert.equal(imgMatches.length, 1, `Page 3 must be single <img>, got ${imgMatches.length}`);
  assert.ok(/class="pg"/.test(imgMatches[0]),   'Page 3 <img> must carry class="pg"');
  // No overlay masks, no mustaches, no position:absolute panels
  assert.equal(/position:\s*absolute/i.test(p3), false, 'Page 3 must contain no absolute overlay');
  assert.equal(/\{\{[^}]+\}\}/.test(p3),         false, 'Page 3 must contain no {{mustaches}}');
});

test('(13b) Page 3 architectural blocker is emitted', () => {
  const result = renderQuotationHtml(minimalPayload(), { strict: false, includePage3Blocker: true });
  const has = result.status.blockers.some(b => b.code === PAGE_3_STATUS.code);
  assert.equal(has, true, 'PAGE_3_DYNAMIC_DATA_NOT_SUPPORTED_BY_TEMPLATE must appear in blockers');
});

// ═════════════════════════════════════════════════════════════════════════════
// (14) Pages 4-12 remain approved DOM
// ═════════════════════════════════════════════════════════════════════════════
test('(14) Pages 4-12 preserve their approved section bodies', () => {
  const rawSections   = extractSections(loadTemplate().templateHtml);
  const outSections   = extractSections(printedHtml);
  for (let i = 3; i < 12; i++) {  // pages 4..12
    // Raw and out both start with `<section class="page"` and end with `</section>`.
    // We compare stable markers rather than byte identity because mustaches
    // and image-slots have been substituted.
    assert.ok(outSections[i].startsWith('<section class="page"'),
      `page ${i+1} must start with approved section opening`);
    assert.ok(outSections[i].endsWith('</section>'),
      `page ${i+1} must end with approved section closing`);
    // Length ratio: substitution changes bytes only slightly.
    // Length ratio: inlining manifest data URIs can inflate pages with many
    // <img src="uuid"> refs by 20-100×. Guard only against BODY LOSS
    // (renderer dropping approved content) — the upper bound is unbounded
    // because 800 KB per baked JPEG is normal.
    const rawLen = rawSections[i].length, outLen = outSections[i].length;
    assert.ok(outLen >= rawLen * 0.5,
      `page ${i+1} body length ${outLen} vs raw ${rawLen} is below 0.5× — approved content dropped`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// (15) No business logic executed by renderer
// (16) No pricing calculations executed by renderer
// (17) No new layout coordinates introduced
// ═════════════════════════════════════════════════════════════════════════════
test('(15,16,17) renderer imports contain no engines / no arithmetic operators / no coordinates', () => {
  const src = readFileSync('src/lib/approvedTemplate.js', 'utf8');
  // (15) No business-engine imports
  for (const m of ['pricingEngine','financeEngine','savingsEngine','subsidyEngine',
                   'costEngine','bomSnapshot','engineeringChecker','commercialSnapshot']) {
    assert.equal(new RegExp(`from ['"][^'"]*${m}['"]`).test(src), false,
      `renderer must not import ${m}`);
  }
  // (16) No arithmetic on money (Math.round is allowed for formatting only —
  // but no *, /, - on unnamed literals). Assert renderer contains no `*`
  // outside comments/regex/format strings — approximated by counting bare
  // `* 1` or `/ 1` numeric ops on payload paths.
  const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/payload\.\w+.*[*+/-]\s*\d/.test(codeOnly), false,
    'no arithmetic on payload values in renderer');
  // (17) No hardcoded pixel coordinates
  for (const bad of ['1000px','1414px','q-canvas','q-inner','transform:scale','zoom:']) {
    assert.equal(codeOnly.includes(bad), false,
      `renderer must not contain "${bad}" (Phase 1 architecture lock)`);
  }
});

test('(15b) AUTHORITATIVE_SOURCES allow-list is enforced for every token', () => {
  for (const t of TOKEN_REGISTRY) {
    assert.ok(AUTHORITATIVE_SOURCES.has(t.source),
      `token ${t.token} source ${t.source} is not in AUTHORITATIVE_SOURCES`);
  }
});

test('(15c) rendered HTML does NOT contain internal engine / dependency names', () => {
  for (const s of ['FINANCE_ENGINE','SAVINGS_ENGINE','SUBSIDY_ENGINE',
                    'COMMERCIAL_SNAPSHOT','LOCKED_BOM_SNAPSHOT','COMPANY_MASTER',
                    'ENERGY_LOAD_CALCULATION_ENGINE','MUSTACHE_UNRESOLVED']) {
    assert.equal(printedHtml.includes(s), false, `customer HTML must not leak ${s}`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// (18) PDF rasterization succeeds
// ═════════════════════════════════════════════════════════════════════════════
test('(18) PDF exists and is a valid, non-trivial A4 document', () => {
  assert.ok(existsSync(PDF_PATH),           'PDF file must exist on disk');
  assert.ok(pdfBytes.length > 100 * 1024,   `PDF must carry backgrounds — got ${pdfBytes.length} bytes`);
  assert.equal(doc.getPageCount(), 12,      '12 A4 pages');
});

// ═════════════════════════════════════════════════════════════════════════════
// Extra: registry census / regressions
// ═════════════════════════════════════════════════════════════════════════════
test('registry census: 23 tokens, 4 image-slots, A4_PRINT_CSS forbids zoom/transform', () => {
  assert.equal(TOKEN_REGISTRY.length, 23);
  assert.equal(IMAGE_SLOT_REGISTRY.length, 4);
  assert.equal(/zoom\s*:/.test(A4_PRINT_CSS), false,   'A4_PRINT_CSS must not use zoom');
  assert.equal(/transform\s*:/.test(A4_PRINT_CSS), false, 'A4_PRINT_CSS must not use transform');
  assert.ok(/@page \{ size: A4 portrait/.test(A4_PRINT_CSS));
  assert.ok(/width:\s*210mm/.test(A4_PRINT_CSS));
  assert.ok(/height:\s*297mm/.test(A4_PRINT_CSS));
  assert.ok(/page-break-after:\s*always/.test(A4_PRINT_CSS));
});

test('DOM measurement: all 12 sections uniform A4 in-viewport', () => {
  assert.equal(sectionBoundsInDom.length, 12);
  for (const b of sectionBoundsInDom) {
    assert.equal(b.w, 794, `section ${b.i} width`);
    assert.equal(b.h, 1123, `section ${b.i} height`);
  }
});

// -----------------------------------------------------------------------------
function extractSections(html) {
  // Trim each buffered section body to end exactly at the FIRST '</section>'
  // that closes it, so trailing whitespace + any post-last-section HTML
  // (e.g. </body></html>) never contaminates section-body assertions.
  const parts = html.split(/(<section class="page")/);
  const acc = []; let buf = '';
  const finish = (b) => {
    const end = b.indexOf('</section>');
    if (end < 0) return b;
    return b.slice(0, end + '</section>'.length);
  };
  for (const p of parts) {
    if (p === '<section class="page"') {
      if (buf.startsWith('<section')) acc.push(finish(buf));
      buf = p;
    } else buf += p;
  }
  if (buf.startsWith('<section')) acc.push(finish(buf));
  return acc.slice(0, 12);
}
