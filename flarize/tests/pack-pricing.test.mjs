// PACK PRICING — owner formula (D1–D6, 2026-09-08):
//   customer price = pack market rate (GST-incl.) + swap delta + roof add-on
//   transport beyond the base km = separate customer extra (not in the quote price)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PACK_PRICING_STATUS, PACK_PRICING_ERROR, PACK_PRICING_VERSION,
  structureQty, structureMaterial, tubeRateFor, kwOf, pricePack,
} from '../src/lib/packPricing.js';

const CONFIG = {
  gst: { regime: 'SOLAR_70_30_COMPOSITE', ratePct: 8.9 },
  pricing: { mode: 'PACK_MARKET_RATE', marginPct: 20 },
  marketRates: { ongrid_value: { '3': 200000 }, ongrid_value_up5sp: { '3': 245000 }, hybrid_value_1: { '5': 400000 } },
  installationMatrix: { '3': { flat: 6000, sheet: 7500, elevated: 9000 }, '5sp': { flat: 9000, sheet: 10000, elevated: 12000 }, '5': { flat: 9000, sheet: 10000, elevated: 12000 } },
  transportConfig: { baseDistanceKm: 100, vehicles: [{ vehicleType: 'ACE', vehicleName: 'Tata Ace', ratePerKm: 35 }] },
  costs: { gpRatePerKg: 85, giRatePerKg: 100, structureLabor: 3000, structureRepairPct: 10, serviceRateYear: 1000, serviceYears: 5, transportRate: 35, miscellaneous: 500, office: 1000 },
  structureTemplates: {
    flatRoof: { items: [{ name: 'Tube 1.5x1.5', type: 'tube', tubeSize: '1.5x1.5', weightKg: 2, qty: { '3': 10, '5': 15 } }] },
    sheetRoof: { items: [{ name: 'Tube 1.5x1.5', type: 'tube', tubeSize: '1.5x1.5', weightKg: 2, qty: { '3': 12, '5': 18 } }, { name: 'Clamp', type: 'fixed', price: 50, qty: { '3': 20 } }] },
    elevated: { items: [{ name: 'Tube 2.5x1.5', type: 'tube', tubeSize: '2.5x1.5', weightKg: 3, qty: { '3': 20, '5': 30 } }] },
  },
};

const PANEL_SWAP = { category: 'panel', name: 'Panel B', isVariable: true, componentId: 'p7', defaultComponentId: 'p2', defaultName: 'Panel A', qty: 6, defaultQty: 6, unitPrice: 14000, defaultUnitPrice: 13000, gst: 5, amount: 84000 };
const INVERTER = { category: 'inverter', isVariable: true, componentId: 'i1', defaultComponentId: 'i1', qty: 1, unitPrice: 30000, defaultUnitPrice: 30000, gst: 5, amount: 30000 };
const FIXED = { category: 'consumable', isVariable: false, componentId: null, qty: 1, unitPrice: 2000, gst: 18, amount: 2000 };

describe('packPricing — structure helpers (owner v1 port)', () => {
  it('structureQty: exact, interpolated (ceil), scaled above the last size, floor at the first', () => {
    const item = { qty: { '3': 10, '5': 15 } };
    assert.equal(structureQty(item, 3), 10);
    assert.equal(structureQty(item, 5), 15);
    assert.equal(structureQty(item, 4), 13);      // 12.5 → ceil
    assert.equal(structureQty(item, 6), 18);      // 15 × 6/5
    assert.equal(structureQty(item, 2), 10);
    assert.equal(structureQty({ qty: {} }, 3), 0);
  });

  it('structureMaterial: tube = weightKg × ₹/kg, fixed = price; lines carry tubeSize', () => {
    const m = structureMaterial(CONFIG.structureTemplates.sheetRoof, 3, 100);
    assert.equal(m.total, 12 * 200 + 20 * 50);
    assert.equal(m.lines[0].isTube, true);
    assert.equal(m.lines[0].tubeSize, '1.5x1.5');
    assert.equal(m.lines[0].unitPrice, 200);
    assert.equal(m.lines[1].isTube, false);
    assert.deepEqual(structureMaterial(null, 3, 100), { total: 0, lines: [] });
  });

  it('tubeRateFor: Base → GP, Value/Premium → GI; kwOf strips size suffixes', () => {
    assert.equal(tubeRateFor(CONFIG.costs, 'base'), 85);
    assert.equal(tubeRateFor(CONFIG.costs, 'value'), 100);
    assert.equal(tubeRateFor(CONFIG.costs, 'premium'), 100);
    assert.equal(tubeRateFor({}, 'base'), 85);
    assert.equal(kwOf('5sp'), 5); assert.equal(kwOf('10'), 10); assert.equal(kwOf('3'), 3); assert.equal(kwOf(null), 0);
  });
});

describe('packPricing — pricePack (customer figures)', () => {
  const base = { config: CONFIG, systemType: 'ongrid', size: '3', tier: 'value', distanceKm: 130, pricedAt: '2026-09-08T09:00:00.000Z' };

  it('flat roof, no swap, within base km: price = market rate exactly; no extra', () => {
    const r = pricePack({ ...base, roofType: 'FLAT', distanceKm: 40, lines: [{ ...PANEL_SWAP, componentId: 'p2', unitPrice: 13000, amount: 78000 }, INVERTER, FIXED] });
    assert.equal(r.status, PACK_PRICING_STATUS.COMPLETE);
    assert.equal(r.marketRateKey, 'ongrid_value');
    assert.equal(r.customer.marketRate, 200000);
    assert.equal(r.customer.swapDeltaTotal, 0);
    assert.equal(r.customer.roofAddOn, 0);
    assert.equal(r.customer.sellingPriceIncludingGST, 200000);
    assert.equal(r.customer.sellingPriceBeforeGST + r.customer.gstAmount, 200000);
    assert.equal(r.customer.sellingPriceBeforeGST, Math.round(200000 / 1.089));
    assert.equal(r.customer.transportExtra, 0);
    assert.equal(r.customer.transportExtraDetail.extraKm, 0);
    assert.equal(r.customer.customerTotalIncludingGST, 200000);
    assert.equal(r.gst.ratePct, 8.9);
    assert.equal(r.packPricingVersion, PACK_PRICING_VERSION);
    assert.ok(Object.isFrozen(r) && Object.isFrozen(r.customer));
  });

  it('sheet roof + panel swap + 130 km: D6 swap delta, roof add-on, D3 transport extra kept outside the price', () => {
    const r = pricePack({ ...base, roofType: 'SHEET', lines: [PANEL_SWAP, INVERTER, FIXED] });
    assert.equal(r.status, PACK_PRICING_STATUS.COMPLETE);
    // swap: (14000−13000)×6 = 6000 + 5% GST = 6300
    assert.equal(r.customer.swapDeltaTotal, 6300);
    assert.equal(r.swapDeltas.length, 1);
    assert.deepEqual({ ...r.swapDeltas[0] }, { category: 'panel', selected: 'p7', selectedName: 'Panel B', default: 'p2', defaultName: 'Panel A', qty: 6, diffPreGst: 6000, diffGst: 300, diff: 6300, gstPct: 5 });
    // roof: structure 3400−2000 = 1400, labour 3000, repair 10% = 440, install 7500−6000 = 1500 → 6340 + 8.9% (564) = 6904
    assert.equal(r.roofAddOnDetail.structureExtra, 1400);
    assert.equal(r.roofAddOnDetail.structureLabour, 3000);
    assert.equal(r.roofAddOnDetail.structureRepair, 440);
    assert.equal(r.roofAddOnDetail.installationDiff, 1500);
    assert.equal(r.customer.roofAddOnPreGst, 6340);
    assert.equal(r.customer.roofAddOnGst, 564);
    assert.equal(r.customer.roofAddOn, 6904);
    assert.equal(r.customer.sellingPriceIncludingGST, 200000 + 6300 + 6904);
    // transport: 30 extra km × 35 = 1050, outside the quote price
    assert.equal(r.customer.transportExtra, 1050);
    assert.deepEqual({ ...r.customer.transportExtraDetail }, { distanceKm: 130, includedKm: 100, extraKm: 30, ratePerKm: 35, vehicleType: 'ACE' });
    assert.equal(r.customer.customerTotalIncludingGST, 213204 + 1050);
    assert.equal(r.inputs.vehicleType, 'ACE', 'single configured vehicle is the default');
    assert.equal(r.structureMaterial.roofType, 'SHEET');
    assert.equal(r.structureMaterial.total, 3400);
  });

  it('a cheaper swap lowers the price (negative delta); a swap back to the default is not a delta', () => {
    const cheaper = { ...PANEL_SWAP, unitPrice: 12000, amount: 72000 };
    const r = pricePack({ ...base, roofType: 'FLAT', distanceKm: 10, lines: [cheaper] });
    assert.equal(r.customer.swapDeltaTotal, -6300);
    assert.equal(r.customer.sellingPriceIncludingGST, 193700);
    const same = pricePack({ ...base, roofType: 'FLAT', distanceKm: 10, lines: [{ ...PANEL_SWAP, componentId: 'p2', unitPrice: 13000 }] });
    assert.equal(same.swapDeltas.length, 0);
  });

  it('future-ready: market key carries _up<systemSize>; installation + structure sized at the system size', () => {
    const r = pricePack({ ...base, roofType: 'ELEVATED', distanceKm: 100, futureSystemSize: '5sp', lines: [] });
    assert.equal(r.status, PACK_PRICING_STATUS.COMPLETE);
    assert.equal(r.marketRateKey, 'ongrid_value_up5sp');
    assert.equal(r.customer.marketRate, 245000);
    assert.equal(r.inputs.systemSize, '5sp');
    assert.equal(r.structureMaterial.kw, 5);
    assert.equal(r.roofAddOnDetail.installationFlat, 9000);
    assert.equal(r.roofAddOnDetail.installationRoof, 12000);
    // elevated @5 kW: 30 × (3×100) = 9000 vs flat 15 × 200 = 3000 → extra 6000
    assert.equal(r.roofAddOnDetail.structureExtra, 6000);
  });

  it('hybrid key includes the battery configuration', () => {
    const r = pricePack({ ...base, systemType: 'hybrid', size: '5', batteryConfig: 1, roofType: 'FLAT', distanceKm: 0, lines: [] });
    assert.equal(r.marketRateKey, 'hybrid_value_1');
    assert.equal(r.customer.marketRate, 400000);
    const r0 = pricePack({ ...base, systemType: 'hybrid', size: '5', batteryConfig: 0, roofType: 'FLAT', distanceKm: 0, lines: [] });
    assert.equal(r0.status, PACK_PRICING_STATUS.BLOCKED);
    assert.equal(r0.errors[0].code, PACK_PRICING_ERROR.MARKET_RATE_NOT_SET);
  });

  it('internal figures: reference cost + margin check exist but never leak into customer', () => {
    const r = pricePack({ ...base, roofType: 'FLAT', distanceKm: 100, lines: [PANEL_SWAP, INVERTER, FIXED] });
    assert.equal(r.internal.referenceCost.material, 84000 + 30000 + 2000);
    assert.equal(r.internal.referenceCost.structureMaterial, 2000);
    assert.equal(r.internal.referenceCost.installation, 6000);
    assert.equal(r.internal.referenceCost.service, 5000);
    assert.equal(r.internal.referenceCost.transportationBase, 3500);
    assert.equal(r.internal.marginPct, 20);
    assert.equal(typeof r.internal.marginVsMarket, 'number');
    for (const k of Object.keys(r.customer)) assert.ok(!/cost|margin|reference/i.test(k), `customer.${k} is a customer figure`);
  });
});

describe('packPricing — BLOCKED (missing PH data is a data blocker, never a default)', () => {
  const base = { config: CONFIG, systemType: 'ongrid', size: '3', tier: 'value', roofType: 'FLAT', distanceKm: 50, lines: [] };
  const codes = (r) => r.errors.map(e => e.code);

  it('market rate not set', () => {
    const r = pricePack({ ...base, tier: 'base' });
    assert.equal(r.status, PACK_PRICING_STATUS.BLOCKED);
    assert.ok(codes(r).includes(PACK_PRICING_ERROR.MARKET_RATE_NOT_SET));
    assert.equal(r.errors[0].detail.key, 'ongrid_base');
    assert.equal(r.customer, undefined);
  });
  it('installation matrix missing for the kW / roof', () => {
    const cfg = { ...CONFIG, installationMatrix: { '3': { flat: 6000 } } };
    const r = pricePack({ ...base, config: cfg, roofType: 'SHEET' });
    assert.ok(codes(r).includes(PACK_PRICING_ERROR.INSTALLATION_NOT_SET));
  });
  it('invalid roof and distance', () => {
    assert.ok(codes(pricePack({ ...base, roofType: 'TILE' })).includes(PACK_PRICING_ERROR.ROOF_INVALID));
    assert.ok(codes(pricePack({ ...base, distanceKm: -1 })).includes(PACK_PRICING_ERROR.DISTANCE_INVALID));
    assert.ok(codes(pricePack({ ...base, distanceKm: 'far' })).includes(PACK_PRICING_ERROR.DISTANCE_INVALID));
  });
  it('vehicle required when more than one is configured; unknown vehicle rejected', () => {
    const cfg = { ...CONFIG, transportConfig: { baseDistanceKm: 100, vehicles: [{ vehicleType: 'ACE', ratePerKm: 35 }, { vehicleType: 'PICKUP', ratePerKm: 50 }] } };
    assert.ok(codes(pricePack({ ...base, config: cfg })).includes(PACK_PRICING_ERROR.VEHICLE_NOT_SET));
    assert.ok(codes(pricePack({ ...base, config: cfg, vehicleType: 'TRUCK' })).includes(PACK_PRICING_ERROR.VEHICLE_NOT_SET));
    const ok = pricePack({ ...base, config: cfg, vehicleType: 'PICKUP', distanceKm: 120 });
    assert.equal(ok.status, PACK_PRICING_STATUS.COMPLETE);
    assert.equal(ok.customer.transportExtra, 20 * 50);
  });
  it('several blockers are reported together', () => {
    const r = pricePack({ ...base, tier: 'base', roofType: 'TILE', distanceKm: -5 });
    assert.ok(r.errors.length >= 3);
  });
});
