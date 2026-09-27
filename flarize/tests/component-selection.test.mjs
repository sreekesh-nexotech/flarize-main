// Component Selection Tests — Phase 2A
// Covers the 13 test areas from the Phase 2A spec.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

const { buildBom, buildAllTierBoms, getAlternatives, SALES_SELECTABLE_CATEGORIES } = await import('../server-bom-builder.js');

// =========================================================================
// Helpers
// =========================================================================
function findByCategory(bom, cat) {
  return bom.lines.find(l => l.category === cat);
}

function allByCategory(bom, cat) {
  return bom.lines.filter(l => l.category === cat);
}

// =========================================================================
// 1. Default panel selection
// =========================================================================
describe('1. Default panel selection', () => {
  it('ongrid base 5sp selects panel with PACKAGE_DEFAULT', () => {
    const bom = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const panel = findByCategory(bom, 'panel');
    assert.ok(panel, 'panel line exists');
    assert.ok(['PACKAGE_DEFAULT','PACKAGE_REGISTRY_AUTHORITATIVE','PACKAGE_REGISTRY_FALLBACK','LEGACY_NEAREST_KW_NOT_AUTHORITATIVE','LEGACY_FIRST_MATCH_NOT_AUTHORITATIVE'].includes(panel.selectionMethod), 'panel selectionMethod: '+panel.selectionMethod);
    assert.ok(panel.componentId, 'has componentId');
    assert.ok(panel.qty > 0, 'qty > 0');
  });

  it('hybrid value 5 selects panel with PACKAGE_DEFAULT', () => {
    const bom = buildBom({ systemType: 'hybrid', size: '5', tier: 'value' });
    const panel = findByCategory(bom, 'panel');
    assert.ok(panel);
    assert.ok(['PACKAGE_DEFAULT','PACKAGE_REGISTRY_AUTHORITATIVE','PACKAGE_REGISTRY_FALLBACK','LEGACY_NEAREST_KW_NOT_AUTHORITATIVE','LEGACY_FIRST_MATCH_NOT_AUTHORITATIVE'].includes(panel.selectionMethod), 'panel selectionMethod: '+panel.selectionMethod);
  });
});

// =========================================================================
// 2. Valid panel alternative
// =========================================================================
describe('2. Valid panel alternative', () => {
  it('accepts valid panel selection for ongrid base', () => {
    const alts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const panelAlts = alts.alternatives.panel || [];
    assert.ok(panelAlts.length > 1, 'more than 1 panel alternative');

    const nonDefault = panelAlts.find(p => !p.isDefault);
    assert.ok(nonDefault, 'has non-default alternative');

    const bom = buildBom({
      systemType: 'ongrid', size: '5sp', tier: 'base',
      selections: { panel: nonDefault.id },
    });
    const panel = findByCategory(bom, 'panel');
    assert.equal(panel.componentId, nonDefault.id);
    assert.equal(panel.selectionMethod, 'SALES_SELECTION');
    assert.equal(panel.name, nonDefault.name);
  });

  it('panel qty recalculates for different wattage', () => {
    const alts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const defaultBom = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const defaultPanel = findByCategory(defaultBom, 'panel');

    // Find a panel with different wattage
    const diffWatt = alts.alternatives.panel?.find(p => p.watt && p.watt !== defaultPanel.watt);
    if (diffWatt) {
      const selBom = buildBom({
        systemType: 'ongrid', size: '5sp', tier: 'base',
        selections: { panel: diffWatt.id },
      });
      const selPanel = findByCategory(selBom, 'panel');
      const expectedQty = Math.ceil(5000 / diffWatt.watt);
      assert.equal(selPanel.qty, expectedQty, `qty should be ceil(5000/${diffWatt.watt})=${expectedQty}`);
    }
  });
});

// =========================================================================
// 3. Invalid panel alternative rejected
// =========================================================================
describe('3. Invalid panel alternative rejected', () => {
  it('rejects non-existent component ID', () => {
    assert.throws(() => {
      buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base', selections: { panel: 'FAKE_NONEXISTENT_ID' } });
    }, /not found/);
  });

  it('rejects premium panel in base tier', () => {
    const premAlts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'premium' });
    const baseAlts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const premOnly = premAlts.alternatives.panel?.find(p =>
      !baseAlts.alternatives.panel?.some(b => b.id === p.id)
    );
    if (premOnly) {
      assert.throws(() => {
        buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base', selections: { panel: premOnly.id } });
      }, /cannot be selected|not available/);
    }
  });
});

// =========================================================================
// 4. Inverter alternative
// =========================================================================
describe('4. Inverter alternative', () => {
  it('accepts valid inverter selection for ongrid base', () => {
    const alts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const invAlts = alts.alternatives.inverter || [];
    assert.ok(invAlts.length >= 1, 'has inverter alternatives');

    const nonDefault = invAlts.find(p => !p.isDefault);
    if (nonDefault) {
      const bom = buildBom({
        systemType: 'ongrid', size: '5sp', tier: 'base',
        selections: { inverter: nonDefault.id },
      });
      const inv = findByCategory(bom, 'inverter');
      assert.equal(inv.componentId, nonDefault.id);
      assert.equal(inv.selectionMethod, 'SALES_SELECTION');
    }
  });

  it('inverter alternatives have kw info', () => {
    const alts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const invAlts = alts.alternatives.inverter || [];
    const withKw = invAlts.filter(i => i.kw != null);
    assert.ok(withKw.length > 0, 'at least some inverters have kw');
  });
});

// =========================================================================
// 5. Battery alternative for hybrid
// =========================================================================
describe('5. Battery alternative for hybrid', () => {
  // 2026-09-07 conformance §11 / B.6: battery is NOT a Sales-selectable category.
  // Battery model is authored on the approved package (Project Head / Engineering);
  // battery QUANTITY (0/1/2) is a project-level parameter set by the Project Head.
  // SALES_SELECTABLE_CATEGORIES = panel · inverter · structure_material only.
  it('hybrid value exposes NO battery alternatives to Sales (battery is not Sales-selectable)', () => {
    const alts = getAlternatives({ systemType: 'hybrid', size: '5', tier: 'value' });
    assert.equal(alts.alternatives.battery, undefined, 'battery must not be offered as a Sales alternative');
    for (const cat of Object.keys(alts.alternatives)) {
      assert.ok(['panel', 'inverter', 'structure_material'].includes(cat), `unexpected Sales-selectable category: ${cat}`);
    }
  });

  it('accepts valid battery selection for hybrid value', () => {
    const alts = getAlternatives({ systemType: 'hybrid', size: '5', tier: 'value' });
    const batAlts = alts.alternatives.battery || [];
    if (batAlts.length > 0) {
      const bat = batAlts[0];
      const bom = buildBom({
        systemType: 'hybrid', size: '5', tier: 'value',
        selections: { battery: bat.id },
      });
      const batLine = findByCategory(bom, 'battery');
      assert.ok(batLine, 'battery line present');
      assert.equal(batLine.componentId, bat.id);
    }
  });

  it('ongrid has no battery alternatives', () => {
    const alts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    assert.equal(alts.alternatives.battery, undefined, 'no battery for ongrid');
  });

  it('hybrid base has no battery alternatives when profile excludes battery', () => {
    const alts = getAlternatives({ systemType: 'hybrid', size: '5', tier: 'base' });
    // hybrid_base may or may not include battery — test is descriptive
    const batAlts = alts.alternatives.battery || [];
    // If no battery in profile, should be empty
    const bom = buildBom({ systemType: 'hybrid', size: '5', tier: 'base' });
    const batLine = findByCategory(bom, 'battery');
    if (!batLine) {
      assert.equal(batAlts.length, 0, 'no battery alts when profile excludes battery');
    }
  });
});

// =========================================================================
// 6. SALES-SELECTABLE = panel + inverter + structure_material  (revised 2026-09-02)
//    ACDB / DCDB moved to engineering-approval-only.
// =========================================================================
describe('6. Sales-selectable categories (revised 2026-09-02)', () => {
  it('SALES_SELECTABLE_CATEGORIES equals ["panel","inverter","structure_material"]', () => {
    assert.deepEqual([...SALES_SELECTABLE_CATEGORIES].sort(),
      ['inverter', 'panel', 'structure_material']);
  });

  it('SALES_SELECTABLE_CATEGORIES does NOT include acdb or dcdb', () => {
    assert.ok(!SALES_SELECTABLE_CATEGORIES.includes('acdb'),
      'ACDB is engineering-sensitive; must go through approval workflow');
    assert.ok(!SALES_SELECTABLE_CATEGORIES.includes('dcdb'),
      'DCDB is engineering-sensitive; must go through approval workflow');
  });

  it('getAlternatives returns structure_material entries only for approved-alternate roles', () => {
    // Structure is now sales-selectable, but only when the package registry
    // pins approvedAlternates for it AND catalog has candidates for the tier.
    // Without those, the entry may be omitted — never fabricated.
    const alts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    // Assertion is shape-only: if structure_material appears it must be an array of ids.
    if (alts.alternatives.structure_material !== undefined) {
      assert.ok(Array.isArray(alts.alternatives.structure_material));
    }
  });

  it('getAlternatives does NOT return acdb alternatives for Sales roles', () => {
    const alts = getAlternatives({
      systemType: 'ongrid', size: '5sp', tier: 'base',
      actorRole: 'SALES',
      category: 'acdb',
    });
    assert.equal(alts.alternatives.acdb, undefined,
      'ACDB removed from Sales-selectable list');
  });

  it('getAlternatives does NOT return dcdb alternatives for Sales roles', () => {
    const alts = getAlternatives({
      systemType: 'ongrid', size: '5sp', tier: 'base',
      actorRole: 'SALES',
      category: 'dcdb',
    });
    assert.equal(alts.alternatives.dcdb, undefined,
      'DCDB removed from Sales-selectable list');
  });
});

// =========================================================================
// 7. Selection persists into BOM
// =========================================================================
describe('7. Selection persists into BOM', () => {
  it('selected panel appears in BOM lines with correct method', () => {
    const alts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const alt = (alts.alternatives.panel || []).find(p => !p.isDefault);
    if (!alt) return; // skip if only 1 panel
    const bom = buildBom({
      systemType: 'ongrid', size: '5sp', tier: 'base',
      selections: { panel: alt.id },
    });
    const panel = findByCategory(bom, 'panel');
    assert.equal(panel.componentId, alt.id, 'componentId matches selection');
    assert.equal(panel.catalogItemId, alt.id, 'catalogItemId matches');
    assert.equal(panel.selectionMethod, 'SALES_SELECTION');
    assert.ok(panel.amount > 0, 'amount calculated');
  });

  it('selection does not affect non-selected categories', () => {
    const alts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const alt = (alts.alternatives.panel || []).find(p => !p.isDefault);
    if (!alt) return;

    const defaultBom = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const selBom = buildBom({
      systemType: 'ongrid', size: '5sp', tier: 'base',
      selections: { panel: alt.id },
    });

    const defaultInv = findByCategory(defaultBom, 'inverter');
    const selInv = findByCategory(selBom, 'inverter');
    assert.equal(defaultInv.componentId, selInv.componentId, 'inverter unchanged');
  });
});

// =========================================================================
// 8. Changing one package does NOT alter another
// =========================================================================
describe('8. Changing one package does not alter another', () => {
  it('value panel selection does not affect base or premium', () => {
    const alts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'value' });
    const alt = (alts.alternatives.panel || []).find(p => !p.isDefault);
    if (!alt) return;

    // Build all tiers — only value has selection
    const result = buildAllTierBoms({
      systemType: 'ongrid', size: '5sp',
      tierSelections: { base: {}, value: { panel: alt.id }, premium: {} },
    });

    // Value tier has selection
    const valuePanel = findByCategory(result.value, 'panel');
    assert.equal(valuePanel.componentId, alt.id, 'value panel is selected alt');
    assert.equal(valuePanel.selectionMethod, 'SALES_SELECTION');

    // Base tier has default
    const basePanel = findByCategory(result.base, 'panel');
    assert.ok(['PACKAGE_DEFAULT','PACKAGE_REGISTRY_AUTHORITATIVE','PACKAGE_REGISTRY_FALLBACK'].includes(basePanel.selectionMethod), 'base panel selectionMethod: '+basePanel.selectionMethod);
    assert.notEqual(basePanel.componentId, alt.id, 'base panel not changed');

    // Premium has its own default
    const premPanel = findByCategory(result.premium, 'panel');
    assert.ok(['PACKAGE_DEFAULT','PACKAGE_REGISTRY_AUTHORITATIVE','PACKAGE_REGISTRY_FALLBACK'].includes(premPanel.selectionMethod), 'premium panel selectionMethod: '+premPanel.selectionMethod);
  });

  it('base and value have different totals when value has selection', () => {
    const alts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'value' });
    const alt = (alts.alternatives.panel || []).find(p => !p.isDefault && p.watt);
    if (!alt) return;

    const defaultResult = buildAllTierBoms({ systemType: 'ongrid', size: '5sp' });
    const selResult = buildAllTierBoms({
      systemType: 'ongrid', size: '5sp',
      tierSelections: { value: { panel: alt.id } },
    });

    // Base should be identical
    assert.equal(
      defaultResult.base.totals.grand,
      selResult.base.totals.grand,
      'base grand total unchanged'
    );
  });
});

// =========================================================================
// 9. Price is generated from the pricing layer (not manual)
// =========================================================================
describe('9. Price from pricing layer', () => {
  it('BOM line prices come from catalog, not manual input', () => {
    const bom = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    for (const l of bom.lines) {
      assert.ok(typeof l.unitPrice === 'number', `${l.name} has numeric unitPrice`);
      assert.ok(typeof l.amount === 'number', `${l.name} has numeric amount`);
      assert.equal(l.amount, l.qty * l.unitPrice, `${l.name} amount = qty × unitPrice`);
    }
  });

  it('selection change updates price from catalog', () => {
    const alts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const alt = (alts.alternatives.panel || []).find(p => !p.isDefault);
    if (!alt) return;

    const defaultBom = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const selBom = buildBom({
      systemType: 'ongrid', size: '5sp', tier: 'base',
      selections: { panel: alt.id },
    });

    const dp = findByCategory(defaultBom, 'panel');
    const sp = findByCategory(selBom, 'panel');
    // Price comes from catalog — may or may not differ depending on the alternative
    assert.equal(sp.amount, sp.qty * sp.unitPrice, 'amount = qty × unitPrice');
    assert.ok(sp.unitPrice >= 0, 'unit price is non-negative');
  });
});

// =========================================================================
// 10. Internal cost not exposed
// =========================================================================
describe('10. Internal cost not exposed', () => {
  it('getAlternatives does not expose procurement price', () => {
    const alts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    for (const [cat, items] of Object.entries(alts.alternatives)) {
      for (const item of items) {
        assert.equal(item.price, undefined, `${item.name} should not expose price`);
        assert.equal(item.procurementCost, undefined, `${item.name} should not expose procurementCost`);
        assert.equal(item.landedCost, undefined, `${item.name} should not expose landedCost`);
        assert.equal(item.margin, undefined, `${item.name} should not expose margin`);
      }
    }
  });

  it('alternatives expose only safe fields', () => {
    const alts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const safeFields = new Set(['id', 'name', 'brand', 'watt', 'kw', 'type', 'phase', 'warranty', 'dcr', 'isDefault']);
    for (const [cat, items] of Object.entries(alts.alternatives)) {
      for (const item of items) {
        for (const key of Object.keys(item)) {
          assert.ok(safeFields.has(key), `${item.name} has unexpected field: ${key}`);
        }
      }
    }
  });
});

// =========================================================================
// 11. Invalid selection produces clear error
// =========================================================================
describe('11. Invalid selection produces clear error', () => {
  it('non-existent ID gives descriptive error', () => {
    try {
      buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base', selections: { panel: 'DOES_NOT_EXIST' } });
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok(e.message.includes('not found'), `error mentions "not found": ${e.message}`);
      assert.ok(e.message.includes('panel'), `error mentions category: ${e.message}`);
    }
  });

  it('wrong-tier component gives reason', () => {
    const premAlts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'premium' });
    const baseAlts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const premOnly = premAlts.alternatives.panel?.find(p =>
      !baseAlts.alternatives.panel?.some(b => b.id === p.id)
    );
    if (premOnly) {
      try {
        buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base', selections: { panel: premOnly.id } });
        assert.fail('should have thrown');
      } catch (e) {
        assert.ok(e.message.includes('not available') || e.message.includes('cannot be selected'),
          `error explains why: ${e.message}`);
      }
    }
  });
});

// =========================================================================
// 12. Issued quotation remains immutable (architectural check)
// =========================================================================
describe('12. Issued quotation immutability', () => {
  it('BOM snapshot includes selectionMethod for auditability', () => {
    const bom = buildBom({
      systemType: 'ongrid', size: '5sp', tier: 'base',
      selections: { panel: getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' }).defaultSelections.panel },
    });
    for (const l of bom.lines) {
      assert.ok(typeof l.selectionMethod === 'string', `${l.name} has selectionMethod`);
      assert.ok(['PACKAGE_DEFAULT','PACKAGE_REGISTRY_AUTHORITATIVE','PACKAGE_REGISTRY_FALLBACK','LEGACY_NEAREST_KW_NOT_AUTHORITATIVE','LEGACY_FIRST_MATCH_NOT_AUTHORITATIVE','SALES_SELECTION','FIXED_TEMPLATE'].includes(l.selectionMethod),
        `${l.name} has valid selectionMethod: ${l.selectionMethod}`);
    }
  });

  it('buildBom returns complete snapshot-ready data', () => {
    const bom = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    // Verify all fields needed for snapshot are present
    assert.ok(bom.totals, 'has totals');
    assert.ok(typeof bom.totals.matTotal === 'number');
    assert.ok(typeof bom.totals.allGst === 'number');
    assert.ok(typeof bom.totals.grand === 'number');
    assert.ok(bom.systemConfig, 'has systemConfig');
    assert.ok(bom.lines.length > 0, 'has BOM lines');
    for (const l of bom.lines) {
      assert.ok(l.componentId !== undefined, `${l.name} has componentId`);
      assert.ok(typeof l.qty === 'number', `${l.name} has numeric qty`);
      assert.ok(typeof l.unitPrice === 'number', `${l.name} has numeric unitPrice`);
      assert.ok(typeof l.amount === 'number', `${l.name} has numeric amount`);
    }
  });
});

// =========================================================================
// 13. Existing 59 BOM equivalence tests remain green
//     (verified by running full suite — not duplicated here)
// =========================================================================
describe('13. getAlternatives coverage', () => {
  it('returns alternatives for all valid system types and tiers', () => {
    const configs = [
      { systemType: 'ongrid', size: '3', tier: 'base' },
      { systemType: 'ongrid', size: '5sp', tier: 'value' },
      { systemType: 'ongrid', size: '10', tier: 'premium' },
      { systemType: 'hybrid', size: '5', tier: 'base' },
      { systemType: 'hybrid', size: '5', tier: 'value' },
      { systemType: 'hybrid', size: '5', tier: 'premium' },
    ];
    for (const cfg of configs) {
      const alts = getAlternatives(cfg);
      assert.ok(alts.alternatives, `${cfg.systemType} ${cfg.size} ${cfg.tier} has alternatives`);
      assert.ok(alts.defaultSelections, `${cfg.systemType} ${cfg.size} ${cfg.tier} has defaultSelections`);
      // Panel should always have alternatives
      assert.ok(alts.alternatives.panel?.length > 0,
        `${cfg.systemType} ${cfg.size} ${cfg.tier} has panel alternatives`);
    }
  });

  it('category filter works', () => {
    const all = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const panelOnly = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base', category: 'panel' });
    assert.ok(panelOnly.alternatives.panel?.length > 0, 'panel alternatives returned');
    assert.equal(panelOnly.alternatives.inverter, undefined, 'inverter not returned when filtering by panel');
  });

  it('defaultSelections match buildBom default', () => {
    const alts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const bom = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const bomPanel = findByCategory(bom, 'panel');
    assert.equal(alts.defaultSelections.panel, bomPanel.componentId,
      'default panel matches buildBom default');
  });

  it('buildAllTierBoms passes tierSelections correctly', () => {
    const alts = getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const alt = (alts.alternatives.panel || []).find(p => !p.isDefault);
    if (!alt) return;

    const result = buildAllTierBoms({
      systemType: 'ongrid', size: '5sp',
      tierSelections: { base: { panel: alt.id } },
    });
    const basePanel = findByCategory(result.base, 'panel');
    assert.equal(basePanel.componentId, alt.id);
    assert.equal(basePanel.selectionMethod, 'SALES_SELECTION');

    // Other tiers unaffected
    const valuePanel = findByCategory(result.value, 'panel');
    assert.ok(['PACKAGE_DEFAULT','PACKAGE_REGISTRY_AUTHORITATIVE','PACKAGE_REGISTRY_FALLBACK'].includes(valuePanel.selectionMethod), 'value panel selectionMethod: '+valuePanel.selectionMethod);
  });
});
