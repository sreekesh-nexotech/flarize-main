// SERVER-BOM-BUILDER EQUIVALENCE TEST
// Validates server-bom-builder.js produces correct BOM output for all 12
// configurations (4 system configs × 3 tiers), checking:
//   - Line counts
//   - Material totals
//   - Fixed item quantities (premiumQty/batQty/qty resolution)
//   - Enphase accessory presence
//   - UG Cable for premium hybrid
//   - Profile key mapping
//   - Phase detection
//   - Battery inclusion
//
// These expected values are derived from catalog.json and match the App.jsx
// allTierBoms computation on the default resolution path.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildBom, buildAllTierBoms, getProfileKey } = require('../server-bom-builder.js');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function bomSummary(bom) {
  const fixedLines = bom.lines.filter(l => l.selectionMethod === 'FIXED_TEMPLATE');
  const enphaseLines = bom.lines.filter(l => l.category === 'enphase');
  const ugLines = bom.lines.filter(l => l.category === 'ug_cable');
  return {
    lineCount: bom.lines.length,
    matTotal: bom.totals.matTotal,
    grand: bom.totals.grand,
    fixedCount: fixedLines.length,
    fixedTotal: fixedLines.reduce((s, l) => s + l.amount, 0),
    enphaseCount: enphaseLines.length,
    ugCount: ugLines.length,
    ugTotal: ugLines.reduce((s, l) => s + l.amount, 0),
    phase: bom.systemConfig.phase,
    batIncluded: bom.systemConfig.batteryIncluded,
    profileKey: bom.systemConfig.profileKey,
    fixedNames: fixedLines.map(l => `${l.name}:${l.qty}`),
  };
}

function findFixedByName(bom, nameFragment) {
  return bom.lines.find(l =>
    l.selectionMethod === 'FIXED_TEMPLATE' && l.name.includes(nameFragment)
  );
}

function findLineByCategory(bom, cat) {
  return bom.lines.filter(l => l.category === cat);
}

// ---------------------------------------------------------------------------
// A. Profile key generation
// ---------------------------------------------------------------------------

describe('getProfileKey', () => {
  it('ongrid base → ongrid_base', () => {
    assert.equal(getProfileKey('ongrid', 'base'), 'ongrid_base');
  });
  it('ongrid value → ongrid_value', () => {
    assert.equal(getProfileKey('ongrid', 'value'), 'ongrid_value');
  });
  it('ongrid premium → ongrid_premium (B.8 locked 2.2, 2026-09-05)', () => {
    // On-grid Premium routes to explicit ongrid_premium profile, not the
    // global 'premium' fallback (which historically served both on-grid and
    // hybrid Premium and hid classification intent).
    assert.equal(getProfileKey('ongrid', 'premium'), 'ongrid_premium');
  });
  it('hybrid base → hybrid_base', () => {
    assert.equal(getProfileKey('hybrid', 'base'), 'hybrid_base');
  });
  it('hybrid value → hybrid_value', () => {
    assert.equal(getProfileKey('hybrid', 'value'), 'hybrid_value');
  });
  it('hybrid premium → hybrid_premium', () => {
    assert.equal(getProfileKey('hybrid', 'premium'), 'hybrid_premium');
  });
});

// ---------------------------------------------------------------------------
// B. buildAllTierBoms returns all 3 tiers
// ---------------------------------------------------------------------------

describe('buildAllTierBoms', () => {
  it('returns base, value, premium keys', () => {
    const result = buildAllTierBoms({ systemType: 'ongrid', size: '3' });
    assert.deepEqual(Object.keys(result).sort(), ['base', 'premium', 'value']);
  });
  it('each tier has lines and totals', () => {
    const result = buildAllTierBoms({ systemType: 'hybrid', size: '5' });
    for (const tier of ['base', 'value', 'premium']) {
      assert.ok(Array.isArray(result[tier].lines), `${tier} missing lines`);
      assert.ok(result[tier].totals.matTotal > 0, `${tier} matTotal should be > 0`);
      assert.ok(result[tier].totals.grand > 0, `${tier} grand should be > 0`);
    }
  });
});

// ---------------------------------------------------------------------------
// C. Ongrid configurations — line counts and structure
// ---------------------------------------------------------------------------

describe('Ongrid 3kW', () => {
  const base = buildBom({ systemType: 'ongrid', size: '3', tier: 'base' });
  const value = buildBom({ systemType: 'ongrid', size: '3', tier: 'value' });
  const premium = buildBom({ systemType: 'ongrid', size: '3', tier: 'premium' });

  it('phase is 1P', () => {
    assert.equal(base.systemConfig.phase, '1P');
  });
  it('no battery', () => {
    assert.equal(base.systemConfig.batteryIncluded, false);
    assert.equal(value.systemConfig.batteryIncluded, false);
    assert.equal(premium.systemConfig.batteryIncluded, false);
  });
  it('base/value have 46 lines, premium has 49 (+ enphase)', () => {
    assert.equal(base.lines.length, 46);
    assert.equal(value.lines.length, 46);
    assert.equal(premium.lines.length, 49);
  });
  it('premium has 5 enphase lines (1P: no CT)', () => {
    const en = findLineByCategory(premium, 'enphase');
    assert.equal(en.length, 5);
  });
  it('no UG cable for ongrid', () => {
    assert.equal(findLineByCategory(base, 'ug_cable').length, 0);
    assert.equal(findLineByCategory(premium, 'ug_cable').length, 0);
  });
  it('value > base > 0 in matTotal', () => {
    assert.ok(value.totals.matTotal > base.totals.matTotal);
    assert.ok(base.totals.matTotal > 0);
  });
  it('premium > value in matTotal', () => {
    assert.ok(premium.totals.matTotal > value.totals.matTotal);
  });
});

describe('Ongrid 5kW 1P (5sp)', () => {
  const base = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base' });
  const premium = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'premium' });

  it('phase is 1P', () => {
    assert.equal(base.systemConfig.phase, '1P');
  });
  it('base has 46 lines', () => {
    assert.equal(base.lines.length, 46);
  });
  it('premium has 49 lines', () => {
    assert.equal(premium.lines.length, 49);
  });
  it('premium has 5 enphase lines', () => {
    assert.equal(findLineByCategory(premium, 'enphase').length, 5);
  });
});

describe('Ongrid 10kW', () => {
  const base = buildBom({ systemType: 'ongrid', size: '10', tier: 'base' });
  const premium = buildBom({ systemType: 'ongrid', size: '10', tier: 'premium' });

  it('phase is 3P', () => {
    assert.equal(base.systemConfig.phase, '3P');
  });
  it('base has 46 lines', () => {
    assert.equal(base.lines.length, 46);
  });
  it('premium has 50 lines (6 enphase: +CT for 3P)', () => {
    assert.equal(premium.lines.length, 50);
    assert.equal(findLineByCategory(premium, 'enphase').length, 6);
  });
});

// ---------------------------------------------------------------------------
// D. Hybrid configurations — the critical battery-dependent tests
// ---------------------------------------------------------------------------

describe('Hybrid 5kW Base', () => {
  const bom = buildBom({ systemType: 'hybrid', size: '5', tier: 'base' });

  it('profile key is hybrid_base', () => {
    assert.equal(bom.systemConfig.profileKey, 'hybrid_base');
  });
  it('phase is 1P', () => {
    assert.equal(bom.systemConfig.phase, '1P');
  });
  it('no battery (hybrid_base has batteryIncluded=false)', () => {
    assert.equal(bom.systemConfig.batteryIncluded, false);
  });
  it('has 45 lines', () => {
    assert.equal(bom.lines.length, 45);
  });
  it('no battery-dependent fixed items (batQty=0)', () => {
    assert.equal(findFixedByName(bom, 'Change Over Switch'), undefined);
    assert.equal(findFixedByName(bom, 'Battery Cable'), undefined);
    assert.equal(findFixedByName(bom, '25mm Copper Lug'), undefined);
  });
  it('no enphase, no UG cable', () => {
    assert.equal(findLineByCategory(bom, 'enphase').length, 0);
    assert.equal(findLineByCategory(bom, 'ug_cable').length, 0);
  });
});

describe('Hybrid 5kW Value — battery-dependent fixed items', () => {
  const bom = buildBom({ systemType: 'hybrid', size: '5', tier: 'value' });

  it('profile key is hybrid_value', () => {
    assert.equal(bom.systemConfig.profileKey, 'hybrid_value');
  });
  it('battery included', () => {
    assert.equal(bom.systemConfig.batteryIncluded, true);
  });
  it('has 51 lines', () => {
    assert.equal(bom.lines.length, 51);
  });

  // These are the items that were MISSING before the premiumQty/batQty fix
  it('40A Change Over Switch qty=1 (from batQty)', () => {
    const item = findFixedByName(bom, 'Change Over Switch');
    assert.ok(item, 'Change Over Switch must be present');
    assert.equal(item.qty, 1);
  });
  it('25mm Battery Cable qty=5 (from batQty)', () => {
    const item = findFixedByName(bom, 'Battery Cable');
    assert.ok(item, 'Battery Cable must be present');
    assert.equal(item.qty, 5);
  });
  it('25mm Copper Lug qty=4 (from batQty)', () => {
    const item = findFixedByName(bom, '25mm Copper Lug');
    assert.ok(item, '25mm Copper Lug must be present');
    assert.equal(item.qty, 4);
  });
  it('1 Phase Meter Box qty=2 (from batQty)', () => {
    const item = findFixedByName(bom, '1 Phase Meter Box');
    assert.ok(item, '1 Phase Meter Box must be present');
    assert.equal(item.qty, 2);
  });
  it('no enphase (not premium)', () => {
    assert.equal(findLineByCategory(bom, 'enphase').length, 0);
  });
  it('no UG cable (not premium)', () => {
    assert.equal(findLineByCategory(bom, 'ug_cable').length, 0);
  });
});

describe('Hybrid 5kW Premium — premiumQty + UG Cable', () => {
  const bom = buildBom({ systemType: 'hybrid', size: '5', tier: 'premium' });

  it('profile key is hybrid_premium', () => {
    assert.equal(bom.systemConfig.profileKey, 'hybrid_premium');
  });
  it('battery included', () => {
    assert.equal(bom.systemConfig.batteryIncluded, true);
  });
  it('has 53 lines', () => {
    assert.equal(bom.lines.length, 53);
  });

  // premiumQty overrides — these had WRONG quantities before fix
  it('10 SWG Earthing Copper qty=15 (premiumQty, not 23)', () => {
    const item = findFixedByName(bom, '10 SWG Earthing Copper');
    assert.ok(item, 'Earthing Copper must be present');
    assert.equal(item.qty, 15, 'Should use premiumQty=15, not qty=23');
  });
  it('Earthing Chamber qty=2 (premiumQty, not 3)', () => {
    const item = findFixedByName(bom, 'Earthing Chamber');
    assert.ok(item, 'Earthing Chamber must be present');
    assert.equal(item.qty, 2, 'Should use premiumQty=2, not qty=3');
  });

  // premiumQty items that were MISSING
  it('40A Change Over Switch qty=1 (premiumQty)', () => {
    const item = findFixedByName(bom, 'Change Over Switch');
    assert.ok(item, 'Change Over Switch must be present for premium hybrid');
    assert.equal(item.qty, 1);
  });
  it('1 Phase Meter Box qty=2 (premiumQty)', () => {
    const item = findFixedByName(bom, '1 Phase Meter Box');
    assert.ok(item, '1 Phase Meter Box must be present');
    assert.equal(item.qty, 2);
  });

  // Battery Cable premiumQty=0 for premium (Enphase does not need it)
  it('25mm Battery Cable NOT present (premiumQty=0 for size 5)', () => {
    const item = findFixedByName(bom, 'Battery Cable');
    assert.equal(item, undefined, 'Battery Cable premiumQty=0 for premium');
  });

  // Enphase accessories for premium hybrid
  it('has 6 enphase lines (IQ8P, Q Cable, Envoy, Q Relay, Q Terminal, System Controller)', () => {
    const en = findLineByCategory(bom, 'enphase');
    assert.equal(en.length, 6);
  });
  it('has System Controller (hybrid premium only)', () => {
    const sc = bom.lines.find(l => l.category === 'enphase' && l.name?.includes('System Controller'));
    assert.ok(sc, 'System Controller must be present for hybrid premium');
  });

  // UG Cable — was MISSING before fix (searched wrong category)
  it('UG Cable present from ug_cable category', () => {
    const ug = findLineByCategory(bom, 'ug_cable');
    assert.equal(ug.length, 1, 'Should have exactly 1 UG Cable line');
  });
  it('UG Cable qty=40', () => {
    const ug = findLineByCategory(bom, 'ug_cable')[0];
    assert.equal(ug.qty, 40);
  });
  it('UG Cable is 2-core (1P system)', () => {
    const ug = findLineByCategory(bom, 'ug_cable')[0];
    assert.ok(ug.name.includes('2 Core'), `Expected 2 Core for 1P, got: ${ug.name}`);
  });
  it('UG Cable total = 40 × 150 = 6000', () => {
    const ug = findLineByCategory(bom, 'ug_cable')[0];
    assert.equal(ug.amount, 6000);
  });
});

// ---------------------------------------------------------------------------
// E. Cross-tier pricing invariants
// ---------------------------------------------------------------------------

describe('Pricing invariants', () => {
  it('ongrid: premium > value > base for all sizes', () => {
    for (const size of ['3', '5sp', '10']) {
      const all = buildAllTierBoms({ systemType: 'ongrid', size });
      assert.ok(all.premium.totals.grand > all.value.totals.grand,
        `ongrid ${size}: premium should > value`);
      assert.ok(all.value.totals.grand > all.base.totals.grand,
        `ongrid ${size}: value should > base`);
    }
  });
  it('hybrid: premium > value > base for size 5', () => {
    const all = buildAllTierBoms({ systemType: 'hybrid', size: '5' });
    assert.ok(all.premium.totals.grand > all.value.totals.grand,
      'hybrid 5: premium should > value');
    assert.ok(all.value.totals.grand > all.base.totals.grand,
      'hybrid 5: value should > base');
  });
  it('grand = matTotal + allGst for all configs', () => {
    const configs = [
      { systemType: 'ongrid', size: '3' },
      { systemType: 'ongrid', size: '5sp' },
      { systemType: 'ongrid', size: '10' },
      { systemType: 'hybrid', size: '5' },
    ];
    for (const cfg of configs) {
      const all = buildAllTierBoms(cfg);
      for (const tier of ['base', 'value', 'premium']) {
        const t = all[tier].totals;
        assert.equal(t.grand, t.matTotal + t.allGst,
          `${cfg.systemType} ${cfg.size} ${tier}: grand must equal matTotal + allGst`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// F. Error handling
// ---------------------------------------------------------------------------

describe('Error handling', () => {
  it('throws on invalid system type', () => {
    assert.throws(() => buildBom({ systemType: 'solar', size: '3', tier: 'base' }),
      /No BOM template/);
  });
  it('throws on invalid size', () => {
    assert.throws(() => buildBom({ systemType: 'ongrid', size: '99', tier: 'base' }),
      /Invalid size/);
  });
  it('throws on invalid tier', () => {
    assert.throws(() => buildBom({ systemType: 'ongrid', size: '3', tier: 'gold' }),
      /Invalid tier/);
  });
});

// ---------------------------------------------------------------------------
// G. BOM line data integrity
// ---------------------------------------------------------------------------

describe('BOM line integrity', () => {
  it('every line has category, name, qty > 0, unitPrice >= 0, amount >= 0', () => {
    const configs = [
      { systemType: 'ongrid', size: '3', tier: 'base' },
      { systemType: 'ongrid', size: '5sp', tier: 'premium' },
      { systemType: 'ongrid', size: '10', tier: 'value' },
      { systemType: 'hybrid', size: '5', tier: 'base' },
      { systemType: 'hybrid', size: '5', tier: 'value' },
      { systemType: 'hybrid', size: '5', tier: 'premium' },
    ];
    for (const cfg of configs) {
      const bom = buildBom(cfg);
      for (const line of bom.lines) {
        assert.ok(line.category, `Missing category in ${cfg.systemType} ${cfg.size} ${cfg.tier}`);
        assert.ok(line.name, `Missing name in ${cfg.systemType} ${cfg.size} ${cfg.tier}`);
        assert.ok(line.qty > 0, `qty must be > 0: ${line.name}`);
        assert.ok(line.unitPrice >= 0, `unitPrice must be >= 0: ${line.name}`);
        assert.ok(line.amount >= 0, `amount must be >= 0: ${line.name}`);
      }
    }
  });
  it('matTotal equals sum of line amounts for all configs', () => {
    const configs = [
      { systemType: 'ongrid', size: '3', tier: 'base' },
      { systemType: 'ongrid', size: '10', tier: 'premium' },
      { systemType: 'hybrid', size: '5', tier: 'value' },
      { systemType: 'hybrid', size: '5', tier: 'premium' },
    ];
    for (const cfg of configs) {
      const bom = buildBom(cfg);
      const lineSum = bom.lines.reduce((s, l) => s + l.amount, 0);
      assert.ok(Math.abs(lineSum - bom.totals.matTotal) < 0.01,
        `${cfg.systemType} ${cfg.size} ${cfg.tier}: lineSum ${lineSum} != matTotal ${bom.totals.matTotal}`);
    }
  });
});
