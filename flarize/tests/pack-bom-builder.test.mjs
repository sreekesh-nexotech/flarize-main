// BOM BUILDER in PACK-CONFIG mode (2026-09-08 fast-quotation build):
//   • the approved pack config (not catalog.json) drives templates + slots
//   • Future Ready: panels at panel size, everything else at system size
//   • salesSwap / alternatives / defaults are Project-Head authored per slot
//   • Sales enforcement is server-side (SELECTION_NOT_PERMITTED / SELECTION_NOT_APPROVED)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { seedFromCatalog, approvedConfig } from '../src/lib/packConfig.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const bomBuilder = require('../server-bom-builder.js');
const catalog = JSON.parse(fs.readFileSync(path.join(here, '..', 'data', 'catalog.json'), 'utf-8'));

// Approved config = seeded from the owner catalog + PH authoring on the on-grid panel / dcdb slots.
function testConfig() {
  const cfg = approvedConfig(seedFromCatalog(catalog, { at: '2026-09-08T00:00:00.000Z' }));
  const panel = cfg.bomTemplates.ongrid.slots.find(s => s.category === 'panel');
  panel.defaults = { '3': 'p2', '5sp': 'p2' };          // PH default panel for value 3 kW / 5 kW
  panel.alternatives = ['p2', 'p7', 'p9'];              // PH approved swap list
  const dcdb = cfg.bomTemplates.ongrid.slots.find(s => s.category === 'dcdb');
  dcdb.salesSwap = false;                               // PH fixes DCDB for this pack
  return cfg;
}
let CFG;
const DRAFT = { marker: 'draft' };

before(() => {
  CFG = testConfig();
  bomBuilder.setPackConfigProvider((source) => (source === 'draft' ? { ...CFG, costs: { ...CFG.costs, office: 777 } } : CFG));
});
after(() => bomBuilder.setPackConfigProvider(null));

const line = (bom, cat) => bom.lines.find(l => l.category === cat);

describe('pack-mode BOM builder — config source', () => {
  it('loadCatalog merges the approved pack config over catalog.json and tags the source', () => {
    const c = bomBuilder.loadCatalog('approved');
    assert.equal(c._packConfigSource, 'approved');
    assert.deepEqual(c.bomTemplates.ongrid.slots.find(s => s.category === 'panel').alternatives, ['p2', 'p7', 'p9']);
    assert.ok(c.categories.panel.items.length > 0, 'component master still from catalog');
    const d = bomBuilder.loadCatalog('draft');
    assert.equal(d._packConfigSource, 'draft');
    assert.equal(d.costs.office, 777);
  });

  it('buildBom reports configSource and uses the PH default (PACK_CONFIG_DEFAULT)', () => {
    const bom = bomBuilder.buildBom({ systemType: 'ongrid', size: '3', tier: 'value', actorRole: 'PROJECT_HEAD' });
    assert.equal(bom.systemConfig.configSource, 'approved');
    const p = line(bom, 'panel');
    assert.equal(p.componentId, 'p2');
    assert.equal(p.selectionMethod, 'PACK_CONFIG_DEFAULT');
    assert.equal(p.defaultComponentId, 'p2');
    assert.equal(p.salesSwap, true);
    assert.deepEqual(p.alternatives, ['p2', 'p7', 'p9']);
    assert.equal(p.qty, Math.ceil(3000 / 550));
    assert.equal(line(bom, 'dcdb').salesSwap, false);
  });

  it('draft preview (PH) can differ from approved (Sales)', () => {
    const d = bomBuilder.buildBom({ systemType: 'ongrid', size: '3', tier: 'value', actorRole: 'PROJECT_HEAD', configSource: 'draft' });
    assert.equal(d.systemConfig.configSource, 'draft');
  });
});

describe('pack-mode BOM builder — Sales enforcement', () => {
  it('Sales may swap an opened slot to an approved alternative; delta fields carry the PH default', () => {
    const bom = bomBuilder.buildBom({ systemType: 'ongrid', size: '3', tier: 'value', actorRole: 'SALES', selections: { panel: 'p7' } });
    const p = line(bom, 'panel');
    assert.equal(p.componentId, 'p7');
    assert.equal(p.selectionMethod, 'SALES_SELECTION');
    assert.equal(p.defaultComponentId, 'p2');
    assert.equal(p.defaultUnitPrice, 13585);
    assert.equal(p.defaultQty, Math.ceil(3000 / 550));
    assert.equal(p.qty, Math.ceil(3000 / 545));
  });

  it('Sales may NOT pick outside the approved list (SELECTION_NOT_APPROVED) — PH may', () => {
    assert.throws(() => bomBuilder.buildBom({ systemType: 'ongrid', size: '3', tier: 'value', actorRole: 'SALES', selections: { panel: 'p12' } }),
      e => e.code === 'SELECTION_NOT_APPROVED' && e.detail.category === 'panel');
    const ph = bomBuilder.buildBom({ systemType: 'ongrid', size: '3', tier: 'value', actorRole: 'PROJECT_HEAD', selections: { panel: 'p12' } });
    assert.equal(line(ph, 'panel').componentId, 'p12');
  });

  it('Sales may NOT change a slot the PH fixed (SELECTION_NOT_PERMITTED); re-selecting the default is fine', () => {
    const def = line(bomBuilder.buildBom({ systemType: 'ongrid', size: '3', tier: 'value', actorRole: 'PROJECT_HEAD' }), 'dcdb');
    const other = catalog.categories.dcdb.items.find(i => i.id !== def.componentId && i.tiers?.includes('value') && (i.status || 'ACTIVE') === 'ACTIVE');
    if (other) {
      assert.throws(() => bomBuilder.buildBom({ systemType: 'ongrid', size: '3', tier: 'value', actorRole: 'SALES', selections: { dcdb: other.id } }),
        e => e.code === 'SELECTION_NOT_PERMITTED');
    }
    const same = bomBuilder.buildBom({ systemType: 'ongrid', size: '3', tier: 'value', actorRole: 'SALES', selections: { dcdb: def.componentId } });
    assert.equal(line(same, 'dcdb').componentId, def.componentId);
  });

  it('getAlternatives for Sales: only opened slots, approved list only, no price / no panelType; PH sees price', () => {
    const s = bomBuilder.getAlternatives({ systemType: 'ongrid', size: '3', tier: 'value', actorRole: 'SALES' });
    assert.ok(s.alternatives.panel, 'panel opened');
    assert.ok(s.alternatives.inverter, 'inverter opened');
    assert.equal(s.alternatives.dcdb, undefined, 'dcdb fixed by PH');
    assert.deepEqual(s.alternatives.panel.map(a => a.id).sort(), ['p2', 'p7', 'p9']);
    assert.equal(s.alternatives.panel.find(a => a.isDefault).id, 'p2');
    for (const a of s.alternatives.panel) { assert.equal(a.price, undefined); assert.equal(a.panelType, undefined); }
    assert.equal(s.defaultSelections.panel, 'p2');
    assert.ok(s.slots.every(sl => sl.salesSwap === true));
    const ph = bomBuilder.getAlternatives({ systemType: 'ongrid', size: '3', tier: 'value', actorRole: 'PROJECT_HEAD' });
    assert.ok(ph.alternatives.dcdb, 'PH sees fixed slots too');
    assert.equal(typeof ph.alternatives.panel[0].price, 'number');
    const anon = bomBuilder.getAlternatives({ systemType: 'ongrid', size: '3', tier: 'value' });
    assert.equal(anon.alternatives.panel[0].price, undefined, 'missing actor role = least privilege');
  });
});

describe('pack-mode BOM builder — Future Ready (owner Q7)', () => {
  it('3 kW panels on a 5 kW (1P) system: panels at 3, inverter/DB/cables/consumables at 5sp', () => {
    const std5 = bomBuilder.buildBom({ systemType: 'ongrid', size: '5sp', tier: 'value', actorRole: 'PROJECT_HEAD' });
    const fr = bomBuilder.buildBom({ systemType: 'ongrid', size: '3', tier: 'value', actorRole: 'PROJECT_HEAD', futureSystemSize: '5sp' });
    assert.equal(fr.systemConfig.futureReady, true);
    assert.equal(fr.systemConfig.size, '3');
    assert.equal(fr.systemConfig.systemSize, '5sp');
    assert.equal(fr.systemConfig.phase, '1P');
    assert.equal(line(fr, 'panel').qty, Math.ceil(3000 / 550), 'panels sized for 3 kW');
    assert.equal(line(fr, 'inverter').componentId, line(std5, 'inverter').componentId, 'inverter is the 5 kW pack inverter');
    assert.equal(line(fr, 'dc_cable').qty, line(std5, 'dc_cable').qty);
    const fixedFr = fr.lines.filter(l => l.category === 'fixed').map(l => `${l.name}:${l.qty}`);
    const fixed5 = std5.lines.filter(l => l.category === 'fixed').map(l => `${l.name}:${l.qty}`);
    assert.deepEqual(fixedFr, fixed5, 'consumables follow the system size');
  });

  it('a future-ready pair that changes the phase is refused; unknown system size is refused', () => {
    assert.throws(() => bomBuilder.buildBom({ systemType: 'ongrid', size: '3', tier: 'value', actorRole: 'PROJECT_HEAD', futureSystemSize: '5tp' }), e => e.code === 'UNSUPPORTED_CONFIGURATION');
    assert.throws(() => bomBuilder.buildBom({ systemType: 'ongrid', size: '3', tier: 'value', actorRole: 'PROJECT_HEAD', futureSystemSize: '15' }), e => e.code === 'UNSUPPORTED_CONFIGURATION');
  });

  it('getAlternatives honours the future system size for inverter defaults', () => {
    const fr = bomBuilder.getAlternatives({ systemType: 'ongrid', size: '3', tier: 'value', actorRole: 'PROJECT_HEAD', futureSystemSize: '5sp' });
    const std = bomBuilder.getAlternatives({ systemType: 'ongrid', size: '5sp', tier: 'value', actorRole: 'PROJECT_HEAD' });
    assert.equal(fr.defaultSelections.inverter, std.defaultSelections.inverter);
    assert.equal(fr.systemConfig.systemSize, '5sp');
  });
});

describe('pack-mode BOM builder — hybrid battery quantity (owner Q8)', () => {
  it('batteryQuantity 0 removes battery + MCCB lines; 1 adds them', () => {
    const b0 = bomBuilder.buildBom({ systemType: 'hybrid', size: '5', tier: 'value', actorRole: 'PROJECT_HEAD', batteryQuantity: 0 });
    assert.equal(line(b0, 'battery'), undefined);
    assert.equal(line(b0, 'mccb_box'), undefined);
    assert.equal(b0.systemConfig.batteryQuantity, 0);
    const b1 = bomBuilder.buildBom({ systemType: 'hybrid', size: '5', tier: 'value', actorRole: 'PROJECT_HEAD', batteryQuantity: 1 });
    assert.equal(line(b1, 'battery')?.qty, 1);
    assert.ok(line(b1, 'mccb_box'), 'MCCB present with a battery');
    const b2 = bomBuilder.buildBom({ systemType: 'hybrid', size: '5', tier: 'value', actorRole: 'PROJECT_HEAD', batteryQuantity: 2 });
    assert.equal(line(b2, 'battery')?.qty, 2);
  });

  it('getAlternatives hides battery / MCCB slots at batteryQuantity 0 and never opens battery to Sales', () => {
    const a0 = bomBuilder.getAlternatives({ systemType: 'hybrid', size: '5', tier: 'value', actorRole: 'PROJECT_HEAD', batteryQuantity: 0 });
    assert.equal(a0.alternatives.battery, undefined);
    assert.equal(a0.alternatives.mccb_box, undefined);
    const a1 = bomBuilder.getAlternatives({ systemType: 'hybrid', size: '5', tier: 'value', actorRole: 'PROJECT_HEAD', batteryQuantity: 1 });
    assert.ok(a1.alternatives.battery, 'PH sees the battery slot');
    const s1 = bomBuilder.getAlternatives({ systemType: 'hybrid', size: '5', tier: 'value', actorRole: 'SALES', batteryQuantity: 1 });
    assert.equal(s1.alternatives.battery, undefined, 'battery is PH-set, not a Sales swap');
  });
});
