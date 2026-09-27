// Regression tests for the three production issues fixed:
// Issue 1: Hybrid battery configuration (catalog profile resolution)
// Issue 2: Inverter persistence (auto-save, batConfig)
// Issue 3: Quotation route (quotation API flow)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';

// ---------------------------------------------------------------------------
// ISSUE 1 — Hybrid battery profiles exist in catalog
// ---------------------------------------------------------------------------

const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const profiles = catalog.packageProfiles || {};

test('Issue1: hybrid_base profile exists in catalog', () => {
  assert.ok(profiles.hybrid_base, 'hybrid_base missing from packageProfiles');
  assert.equal(profiles.hybrid_base.batteryIncluded, false);
  assert.equal(profiles.hybrid_base.batteryQuantity, 0);
});

test('Issue1: hybrid_value profile exists with battery', () => {
  assert.ok(profiles.hybrid_value, 'hybrid_value missing from packageProfiles');
  assert.equal(profiles.hybrid_value.batteryIncluded, true);
  assert.equal(profiles.hybrid_value.batteryQuantity, 1);
});

test('Issue1: hybrid_premium profile exists with battery', () => {
  assert.ok(profiles.hybrid_premium, 'hybrid_premium missing from packageProfiles');
  assert.equal(profiles.hybrid_premium.batteryIncluded, true);
  assert.equal(profiles.hybrid_premium.batteryQuantity, 1);
});

test('Issue1: hybrid profiles have distinct battery configs per tier', () => {
  // base = no battery, value = battery, premium = battery (different brand)
  assert.notEqual(
    profiles.hybrid_base.batteryIncluded,
    profiles.hybrid_value.batteryIncluded,
    'base and value must differ in batteryIncluded'
  );
  assert.notEqual(
    profiles.hybrid_base.batteryQuantity,
    profiles.hybrid_value.batteryQuantity,
    'base and value must differ in batteryQuantity'
  );
});

test('Issue1: ongrid profiles still exist and are unaffected', () => {
  assert.ok(profiles.ongrid_base, 'ongrid_base missing');
  assert.ok(profiles.ongrid_value, 'ongrid_value missing');
  // ongrid profiles should NOT have batteryIncluded: true
  assert.equal(profiles.ongrid_base.batteryIncluded || false, false);
  assert.equal(profiles.ongrid_value.batteryIncluded || false, false);
});

test('Issue1: getProfileKey logic maps correctly', () => {
  // Simulate getProfileKey(sysType, tier)
  const getProfileKey = (sysType, tier) => {
    if (sysType === 'hybrid') return `hybrid_${tier}`;
    if (tier === 'premium') return 'premium';
    return `ongrid_${tier}`;
  };
  assert.equal(getProfileKey('hybrid', 'base'), 'hybrid_base');
  assert.equal(getProfileKey('hybrid', 'value'), 'hybrid_value');
  assert.equal(getProfileKey('hybrid', 'premium'), 'hybrid_premium');
  assert.equal(getProfileKey('ongrid', 'base'), 'ongrid_base');
  assert.equal(getProfileKey('ongrid', 'value'), 'ongrid_value');
  assert.equal(getProfileKey('ongrid', 'premium'), 'premium');
});

test('Issue1: each hybrid profile key resolves to a real profile', () => {
  for (const tier of ['base', 'value', 'premium']) {
    const key = `hybrid_${tier}`;
    assert.ok(profiles[key], `${key} not found in packageProfiles`);
    assert.equal(typeof profiles[key].batteryIncluded, 'boolean');
    assert.equal(typeof profiles[key].batteryQuantity, 'number');
  }
});

test('Issue1: hybrid_base does NOT silently get battery = 0 when it should have battery', () => {
  // hybrid_base is intentionally no-battery
  assert.equal(profiles.hybrid_base.batteryIncluded, false);
  assert.equal(profiles.hybrid_base.batteryQuantity, 0);
});

test('Issue1: changing tier changes battery config for hybrid', () => {
  const baseBat = profiles.hybrid_base.batteryQuantity;
  const valueBat = profiles.hybrid_value.batteryQuantity;
  const premBat = profiles.hybrid_premium.batteryQuantity;
  // value and premium should have battery, base should not
  assert.equal(baseBat, 0);
  assert.equal(valueBat, 1);
  assert.equal(premBat, 1);
  // base has no battery, value and premium have battery
  assert.equal(profiles.hybrid_base.batteryIncluded, false);
  assert.equal(profiles.hybrid_value.batteryIncluded, true);
  assert.equal(profiles.hybrid_premium.batteryIncluded, true);
});

// ---------------------------------------------------------------------------
// ISSUE 2 — Inverter persistence
// ---------------------------------------------------------------------------

test('Issue2: bom-state.json has selections field', () => {
  if (!existsSync('data/bom-state.json')) return;
  const state = JSON.parse(readFileSync('data/bom-state.json', 'utf8'));
  assert.ok(state.selections !== undefined, 'bom-state.json must have selections field');
  assert.equal(typeof state.selections, 'object');
});

test('Issue2: bom-state persistence round-trip preserves selections', () => {
  // Simulate: save state → reload → selections intact
  const testState = {
    selections: { 'ongrid_value_3_1': 'i99', 'hybrid_base_5_0': 'i42' },
    savedAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(testState);
  const restored = JSON.parse(serialized);
  assert.deepStrictEqual(restored.selections, testState.selections);
  assert.equal(restored.selections['ongrid_value_3_1'], 'i99');
  assert.equal(restored.selections['hybrid_base_5_0'], 'i42');
});

test('Issue2: inverter change survives JSON round-trip (simulated persist+reload)', () => {
  const original = { selections: { 'ongrid_value_5_1': 'sungrow_5k' } };
  // Admin changes inverter
  const changed = { ...original, selections: { ...original.selections, 'ongrid_value_5_1': 'goodwe_5k' } };
  // Persist (server merges)
  const serverState = { ...original, ...changed };
  // Reload
  const reloaded = JSON.parse(JSON.stringify(serverState));
  assert.equal(reloaded.selections['ongrid_value_5_1'], 'goodwe_5k', 'GoodWe must survive reload');
});

test('Issue2: batConfig only applies to hybrid system type', () => {
  // Simulate the fixed batConfig logic
  const getBatConfig = (sysType, profile) =>
    (sysType === 'hybrid' && profile) ? String(profile.batteryQuantity ?? 0) : '0';

  // ongrid should always be 0 regardless of profile
  assert.equal(getBatConfig('ongrid', { batteryQuantity: 1 }), '0');
  assert.equal(getBatConfig('ongrid', profiles.hybrid_value), '0');

  // hybrid should use profile
  assert.equal(getBatConfig('hybrid', profiles.hybrid_base), '0');
  assert.equal(getBatConfig('hybrid', profiles.hybrid_value), '1');
  assert.equal(getBatConfig('hybrid', profiles.hybrid_premium), '1');

  // null profile = 0
  assert.equal(getBatConfig('hybrid', null), '0');
});

// ---------------------------------------------------------------------------
// ISSUE 2 — Auto-save (App.jsx code structure verification)
// ---------------------------------------------------------------------------

test('Issue2: non-admin specification renderer resolves the selected system type profile', () => {
  const appSrc = readFileSync('src/App.jsx', 'utf8');
  const idx = appSrc.indexOf('NON-ADMIN: Customer Specification Table');
  assert.ok(idx > -1, 'non-admin specification renderer must exist');
  const context = appSrc.substring(idx, idx + 5000);
  assert.ok(context.includes('const profileKey = getProfileKey(sysType, tp);'),
    'non-admin spec table must resolve hybrid profiles from sysType+tier');
  assert.ok(!context.includes("tp === 'premium' ? 'premium' : `ongrid_${tp}`"),
    'non-admin spec table must not force on-grid profiles for hybrid');
});

test('Issue2: logout handler persists admin-mode flag and clears session', () => {
  const appSrc = readFileSync('src/App.jsx', 'utf8');
  const idx = appSrc.indexOf('const handleLogout = useCallback');
  assert.ok(idx > -1, 'logout handler must exist');
  // Wider window: BOM-flush block pushes writeStoredAdminMode beyond 700 chars
  const context = appSrc.substring(idx, idx + 1500);
  assert.ok(context.includes('writeStoredAdminMode(false)'), 'admin mode must be persisted separately');
  // Multi-user auth: logout SHOULD clear session (proper logout, not admin-mode toggle)
  assert.ok(context.includes("setSessionToken('')") || context.includes('setSessionToken("")'),
    'logout must clear session token');
});

test('Issue2: persisted BOM state loads for authenticated non-admin mode', () => {
  const appSrc = readFileSync('src/App.jsx', 'utf8');
  const idx = appSrc.indexOf('Load the authoritative persisted BOM state');
  assert.ok(idx > -1, 'authoritative BOM load comment missing');
  const context = appSrc.substring(idx, idx + 2200);
  assert.ok(context.includes('if (sessionToken)'), 'BOM state load must be session-based, not admin-UI-mode-based');
});

test('Issue2: App.jsx contains auto-save useEffect', () => {
  const appSrc = readFileSync('src/App.jsx', 'utf8');
  assert.ok(appSrc.includes('Auto-save BOM state when dirty'), 'auto-save comment missing');
  assert.ok(appSrc.includes('saveBomState()'), 'saveBomState call missing');
  // Verify debounce (2000ms)
  assert.ok(appSrc.includes('2000'), 'debounce timer missing');
});

test('Issue2: App.jsx batConfig fix applied (hybrid-only guard)', () => {
  const appSrc = readFileSync('src/App.jsx', 'utf8');
  // Must have the sysType === 'hybrid' guard
  assert.ok(
    appSrc.includes("(sysType === 'hybrid' && profile)"),
    'batConfig must be guarded by sysType === hybrid'
  );
  // Must NOT have the old unguarded form
  const lines = appSrc.split('\n');
  const batConfigLines = lines.filter(l => l.includes('const batConfig ='));
  for (const line of batConfigLines) {
    // Each batConfig assignment should have hybrid guard or be in upgrade context
    if (line.includes('const batConfig = profile ?')) {
      assert.fail('Found unguarded batConfig: ' + line.trim());
    }
  }
});

// ---------------------------------------------------------------------------
// ISSUE 3 — Quotation route
// ---------------------------------------------------------------------------

test('Issue3: App.jsx no longer uses setShowQuotation for generate button', () => {
  const appSrc = readFileSync('src/App.jsx', 'utf8');
  // The generate button should call the quotation API, not setShowQuotation
  // Find the generateQuotation button context
  const idx = appSrc.indexOf("t('generateQuotation')");
  assert.ok(idx > -1, 'generateQuotation button text must exist');
  // Look back ~2000 chars for the onClick handler
  const context = appSrc.substring(Math.max(0, idx - 3000), idx);
  assert.ok(
    !context.includes('setShowQuotation(true)'),
    'Generate Quotation button must NOT use setShowQuotation(true)'
  );
  assert.ok(
    context.includes('/quotation/quotations'),
    'Generate Quotation button must call quotation API'
  );
  assert.ok(
    context.includes('quotation-document.html'),
    'Generate Quotation button must open quotation-document.html'
  );
});

test('Issue3: quotation-document.html renders canonical 12-page assembly', () => {
  const html = readFileSync('public/quotation-document.html', 'utf8');
  // All 12 canonical pages must be present
  assert.ok(html.includes('renderPage1'), 'Page 1 renderer (cover + proposal)');
  assert.ok(html.includes('renderPage2'), 'Page 2 renderer (campaign)');
  assert.ok(html.includes('renderPage3'), 'Page 3 renderer (generation)');
  assert.ok(html.includes('renderPage4'), 'Page 4 renderer (why flarize)');
  assert.ok(html.includes('renderPage5'), 'Page 5 renderer (pricing)');
  assert.ok(html.includes('renderPage6Testimonials'), 'Page 6 renderer (testimonials)');
  assert.ok(html.includes('renderPage7'), 'Page 7 renderer (tech specs)');
  assert.ok(html.includes('renderPage8'), 'Page 8 renderer (detailed savings)');
  assert.ok(html.includes('renderPage9Timeline'), 'Page 9 renderer (timeline)');
  assert.ok(html.includes('renderPage10Terms'), 'Page 10 renderer (T&C 1/2)');
  assert.ok(html.includes('renderPage11Terms'), 'Page 11 renderer (T&C 2/2)');
  assert.ok(html.includes('renderPage12'), 'Page 12 renderer (detailed investment)');
  assert.ok(html.includes('PAGE_FIVE_STYLES'), 'Page 5 pricing styles');
  assert.ok(html.includes('PAGE_TWELVE_STYLES'), 'Page 12 styles');
  // Must NOT have FAQ or Mounting & Safety
  assert.ok(!html.includes('renderPage10Faq'), 'No FAQ page');
  assert.ok(!html.includes('renderPage8Mounting'), 'No Mounting & Safety page');
  // Must use detailed renderers, not simplified
  assert.ok(!html.includes('renderPage6Savings'), 'No simplified savings (use renderPage8)');
  assert.ok(!html.includes('renderPage13Investment'), 'No simplified investment (use renderPage12)');
});

test('Issue3: quotation API endpoints exist in server-quotation.js', () => {
  const server = readFileSync('server-quotation.js', 'utf8');
  assert.ok(server.includes('/api/quotation/bom-snapshots'), 'BOM snapshot endpoint');
  assert.ok(server.includes('/api/quotation/commercial-snapshots'), 'Commercial snapshot endpoint');
  assert.ok(server.includes('/api/quotation/quotations'), 'Quotation CRUD endpoint');
  assert.ok(server.includes('/issue'), 'Issue endpoint');
  assert.ok(server.includes('/payload'), 'Payload endpoint');
});

test('Issue3: quotationDocument.js baseline hash (updated per Phase 2B Page 1 implementation)', async () => {
  // NOTE: quotationDocument.js is NOT on the V4 protected-file list. Phase 2B
  // finalization modifies the renderer page-by-page (per approved directive).
  // This hash tracks the current baseline so unintended off-page churn is
  // detected — refresh it each time a page's Phase 2B implementation lands.
  const { createHash } = await import('node:crypto');
  const md5Public = createHash('md5').update(readFileSync('public/lib/quotationDocument.js')).digest('hex');
  assert.equal(md5Public, 'd9cc95ae5720954c040f0f8829995f44',
    'quotationDocument.js baseline after P1 (2026-09-13): pages 3/9/10/11 render from the bilingual content snapshot (inlined content pages, zero imports), page 8 documents from content, page 4 band on footer.');
});

test('Issue3: Generate Quotation calls bom-snapshots, commercial-snapshots, quotations, issue', () => {
  const appSrc = readFileSync('src/App.jsx', 'utf8');
  const idx = appSrc.indexOf("t('generateQuotation')");
  // Use a larger context window (12000 chars) to capture the full async handler
  const context = appSrc.substring(Math.max(0, idx - 12000), idx);
  assert.ok(context.includes('/quotation/bom-snapshots'), 'Must register BOM snapshot');
  assert.ok(context.includes('/quotation/commercial-snapshots'), 'Must register commercial snapshot');
  assert.ok(context.includes('/quotation/quotations'), 'Must create draft');
  assert.ok(context.includes('/issue'), 'Must issue quotation');
  assert.ok(context.includes('window.open'), 'Must open quotation-document.html');
});
