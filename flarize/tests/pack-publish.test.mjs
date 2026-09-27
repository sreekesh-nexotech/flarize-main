// PACK PUBLISH — approved pack configuration → approved registry packages.
// In-memory registry (no disk writes); the checker runs at TEMPLATE scope.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { seedFromCatalog, approvedConfig } from '../src/lib/packConfig.js';
import { comboKeyFor } from '../src/lib/packageApproval.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const bomBuilder = require('../server-bom-builder.js');
const publish = require('../server-pack-publish.js');

const read = (f) => JSON.parse(fs.readFileSync(path.join(here, '..', 'data', f), 'utf-8'));
const catalog = read('catalog.json');
const batteryMaster = read('battery-master.json');
const legacyRegistry = () => JSON.parse(JSON.stringify(read('packages.proposed.json')));

const ADMIN = { userId: 'admin-1', role: 'ADMIN' };
const AT = '2026-09-08T10:00:00.000Z';
const AT2 = '2026-09-08T10:10:00.000Z';

// Small approved config: on-grid 3 kW + 5 kW (1P), Base + Value, FR pair 3 → 5sp.
function smallConfig() {
  const cfg = approvedConfig(seedFromCatalog(catalog, { at: AT }));
  const og = cfg.bomTemplates.ongrid;
  og.sizes = { '3': '3 kW', '5sp': '5kW 1P' };
  og.tiers = ['base', 'value'];
  delete cfg.bomTemplates.hybrid;
  delete cfg.bomTemplates.upgrade;
  cfg.futureUpgrade.pairs = [{ systemType: 'ongrid', panelSize: '3', systemSize: '5sp' }];
  const panel = og.slots.find(s => s.category === 'panel');
  // Tier-specific PH defaults (`tier:size`): Base → p1, Value → p2.
  panel.defaults = { 'base:3': 'p1', 'base:5sp': 'p1', 'value:3': 'p2', 'value:5sp': 'p2' };
  panel.alternatives = ['p1', 'p2', 'p7'];
  return cfg;
}
let CFG;
before(() => { CFG = smallConfig(); bomBuilder.setPackConfigProvider(() => CFG); });
after(() => bomBuilder.setPackConfigProvider(null));

const env = () => ({ catalog: bomBuilder.loadCatalog('approved'), batteryMaster, catalogVersion: 'test' });
const approvedFor = (reg, combo) => (reg.packages || []).filter(p => p.comboKey === combo && p.packageState === 'APPROVED' && !p.supersededBy);

describe('pack publish — first publish from an approved configuration', () => {
  it('publishes every (size × tier × variant) combo as an APPROVED registry package with a comboKey', async () => {
    const registry = legacyRegistry();
    const before = registry.packages.length;
    const legacyBefore = registry.packages.filter(p => p.approvalStatus === 'APPROVED' && p.createdBy == null && p.createdAt == null).length;
    const report = await publish.publishApprovedPacks({ actor: ADMIN, at: AT, env: env(), config: CFG, configVersion: 7, registry });
    const reg = report.registry;
    assert.equal(report.configVersion, 7);
    assert.equal(report.publishedBy, 'admin-1');
    const expected = [
      comboKeyFor({ systemType: 'ongrid', size: '3', phase: '1P', tier: 'base', variant: 'STANDARD', systemSize: '3' }),
      comboKeyFor({ systemType: 'ongrid', size: '3', phase: '1P', tier: 'value', variant: 'STANDARD', systemSize: '3' }),
      comboKeyFor({ systemType: 'ongrid', size: '3', phase: '1P', tier: 'base', variant: 'FUTURE_READY', systemSize: '5sp' }),
      comboKeyFor({ systemType: 'ongrid', size: '3', phase: '1P', tier: 'value', variant: 'FUTURE_READY', systemSize: '5sp' }),
      comboKeyFor({ systemType: 'ongrid', size: '5sp', phase: '1P', tier: 'base', variant: 'STANDARD', systemSize: '5sp' }),
      comboKeyFor({ systemType: 'ongrid', size: '5sp', phase: '1P', tier: 'value', variant: 'STANDARD', systemSize: '5sp' }),
    ];
    const touched = [...report.published, ...report.blocked, ...report.errors].map(r => r.combo).sort();
    assert.deepEqual(touched, [...expected].sort(), 'every combo is either published, blocked or errored — never skipped');
    assert.deepEqual(report.errors, [], `no publish errors: ${JSON.stringify(report.errors)}`);
    assert.ok(report.published.length >= 1, 'at least one combo publishable with the owner data');
    for (const pub of report.published) {
      const live = approvedFor(reg, pub.combo);
      assert.equal(live.length, 1, `exactly one live APPROVED package for ${pub.combo}`);
      const pkg = live[0];
      assert.equal(pkg.packageId, pub.packageId);
      assert.equal(pkg.publishedFromConfigVersion, 7);
      assert.equal(pkg.publishSource, 'PACK_CONFIG');
      assert.ok(['STANDARD', 'FUTURE_READY'].includes(pkg.variant));
      assert.ok(pkg.approvedAt || pkg.approvedBy, 'approval recorded');
      const panel = pkg.components.find(c => c.role === 'panel');
      assert.equal(panel.componentId, pkg.tier === 'base' ? 'p1' : 'p2', 'PH default panel (per tier) is the registry pin');
      assert.deepEqual(panel.approvedAlternates, ['p1', 'p2', 'p7']);
      assert.equal(panel.salesSwap, true);
      assert.equal(panel.derivedBy, 'explicit');
    }
    // FR packages record the system size; STANDARD packages record their own size.
    const fr = report.published.filter(p => p.combo.includes('|FR5sp'));
    for (const p of fr) { const pkg = reg.packages.find(x => x.packageId === p.packageId); assert.equal(pkg.systemSize, '5sp'); assert.equal(pkg.size, '3'); }
    // Blocked combos are archived, never approved.
    for (const b of report.blocked) {
      const pkg = reg.packages.find(x => x.packageId === b.packageId);
      assert.equal(pkg.packageState, 'ARCHIVED');
      assert.ok(b.findings.length > 0, 'blocked combos carry the BLOCKED findings');
    }
    // Legacy records are untouched (only superseded pointers may be added).
    assert.equal(reg.packages.filter(p => p.legacyApproved).length, legacyBefore, 'legacy records preserved');
    // Nothing written to disk.
    assert.equal(read('packages.proposed.json').packages.length, before);
  });

  it('a second publish of the same version is a no-op (all unchanged)', async () => {
    const first = await publish.publishApprovedPacks({ actor: ADMIN, at: AT, env: env(), config: CFG, configVersion: 7, registry: legacyRegistry() });
    const again = await publish.publishApprovedPacks({ actor: ADMIN, at: AT2, env: env(), config: CFG, configVersion: 7, registry: first.registry });
    assert.deepEqual(again.published, []);
    assert.equal(again.unchanged.length, first.published.length);
    assert.equal(again.registry.packages.length, first.registry.packages.length, 'no new records');
  });

  it('changing the PH default creates a revision that supersedes the prior package; history is kept', async () => {
    const first = await publish.publishApprovedPacks({ actor: ADMIN, at: AT, env: env(), config: CFG, configVersion: 7, registry: legacyRegistry() });
    const cfg2 = JSON.parse(JSON.stringify(CFG));
    cfg2.bomTemplates.ongrid.slots.find(s => s.category === 'panel').defaults = { '3': 'p7', '5sp': 'p7' }; // p7 is base+value
    bomBuilder.setPackConfigProvider(() => cfg2);
    try {
      const second = await publish.publishApprovedPacks({ actor: ADMIN, at: AT2, env: env(), config: cfg2, configVersion: 8, registry: first.registry });
      assert.equal(second.published.length, first.published.length, 'every previously published combo got a revision');
      for (const pub of second.published) {
        const prev = first.published.find(p => p.combo === pub.combo);
        assert.equal(pub.supersedes, prev.packageId);
        const reg = second.registry;
        const old = reg.packages.find(p => p.packageId === prev.packageId);
        assert.equal(old.supersededBy, pub.packageId, 'old revision points at the new one');
        assert.equal(approvedFor(reg, pub.combo).length, 1, 'still exactly one live package');
        assert.equal(approvedFor(reg, pub.combo)[0].components.find(c => c.role === 'panel').componentId, 'p7');
        assert.equal(approvedFor(reg, pub.combo)[0].publishedFromConfigVersion, 8);
      }
    } finally { bomBuilder.setPackConfigProvider(() => CFG); }
  });

  it('refuses to run without a timestamp; never invents one', async () => {
    await assert.rejects(() => publish.publishApprovedPacks({ actor: ADMIN, at: null, env: env(), config: CFG, configVersion: 7, registry: legacyRegistry() }), e => e.code === 'MISSING_TIMESTAMP');
  });

  it('componentsFromBom keeps only variable slots and carries the PH authoring fields', () => {
    const bom = bomBuilder.buildBom({ systemType: 'ongrid', size: '3', tier: 'value', actorRole: 'PROJECT_HEAD', configSource: 'approved' });
    const comps = publish.componentsFromBom(bom);
    assert.ok(comps.every(c => c.componentId && c.role));
    assert.ok(!comps.some(c => c.role === 'fixed'));
    const panel = comps.find(c => c.role === 'panel');
    assert.equal(panel.quantityRule, 'ceil(sizeKw*1000 / panel.watt)');
    assert.equal(panel.derivedBy, 'explicit');
    const inv = comps.find(c => c.role === 'inverter');
    assert.match(inv.quantityRule, /^template:/);
  });
});
