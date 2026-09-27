/**
 * PACK PRICING — the owner's v1 quotation formula, server-side (2026-09-08).
 *
 *   customerPriceInclGst = marketRate(pack, size)                 ← PH-set, GST-inclusive
 *                        + Σ swapDelta (selected − PH default, incl. item GST)
 *                        + roofAddOn (installation matrix diff + structure material diff
 *                                     + structure labour + repair %)      ← only for non-flat roofs
 *   transportExtra       = max(0, distanceKm − baseDistanceKm) × vehicle ₹/km
 *                          → a SEPARATE customer extra, never inside the quote price
 *   preGst / gst         = split of customerPriceInclGst at the composite rate (8.9 %)
 *
 * Internal check (PH / Admin only):
 *   referenceCost = material (catalog reference prices) + flat-roof structure material
 *                 + installation(kW, roof) + service + transport(base km) + misc + office
 *   grand         = (referenceCost + margin %) × (1 + gst)         ← what the pack "should" sell for
 *   marginVsMarket = customerPriceInclGst − grand
 *
 * Pure. Every input is data the Project Head owns (pack config) plus the
 * materialised BOM lines. No file access, no defaults invented: a missing market
 * rate or installation cell is a hard MARKET_RATE_NOT_SET / INSTALLATION_NOT_SET
 * result, never a fallback number.
 */
import { marketRateKey, ROOF_TO_STRUCTURE_KEY } from './packConfig.js';

export const PACK_PRICING_VERSION = 'pack-pricing.1';
export const PACK_PRICING_STATUS = Object.freeze({ COMPLETE: 'COMPLETE', BLOCKED: 'BLOCKED' });
export const PACK_PRICING_ERROR = Object.freeze({
  MARKET_RATE_NOT_SET: 'MARKET_RATE_NOT_SET',
  INSTALLATION_NOT_SET: 'INSTALLATION_NOT_SET',
  VEHICLE_NOT_SET: 'VEHICLE_NOT_SET',
  DISTANCE_INVALID: 'DISTANCE_INVALID',
  ROOF_INVALID: 'ROOF_INVALID',
});

const r0 = (n) => Math.round(n);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------
// Structure (ported 1:1 from the owner's BOM tool)
// ---------------------------------------------------------------------------

/** qty for a kW from a {size: qty} map — exact, interpolated, or scaled above the last size. */
export function structureQty(item, kw) {
  const qtyMap = item.qty || {};
  const sizes = Object.keys(qtyMap).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sizes.length) return 0;
  if (kw <= sizes[0]) return qtyMap[String(sizes[0])];
  if (kw >= sizes[sizes.length - 1]) { const last = sizes[sizes.length - 1]; return Math.ceil(qtyMap[String(last)] * kw / last); }
  for (let i = 0; i < sizes.length - 1; i++) {
    if (kw >= sizes[i] && kw <= sizes[i + 1]) {
      const lo = sizes[i], hi = sizes[i + 1];
      const ratio = (kw - lo) / (hi - lo);
      return Math.ceil(qtyMap[String(lo)] + ratio * (qtyMap[String(hi)] - qtyMap[String(lo)]));
    }
  }
  return qtyMap[String(sizes[sizes.length - 1])];
}

/** Material list + total for one roof template at a kW and tube rate (₹/kg). */
export function structureMaterial(template, kw, ratePerKg) {
  if (!template || !Array.isArray(template.items)) return { total: 0, lines: [] };
  let total = 0; const lines = [];
  for (const item of template.items) {
    const qty = structureQty(item, kw);
    if (!qty) continue;
    const unitPrice = item.type === 'tube' ? r0((item.weightKg || 0) * ratePerKg) : r0(item.price || 0);
    const amount = r0(unitPrice * qty);
    total += amount;
    lines.push({ name: item.name, type: item.type, tubeSize: item.tubeSize ?? null, weightKg: item.weightKg ?? null, qty, unitPrice, amount, isTube: item.type === 'tube' });
  }
  return { total, lines };
}

/** Tube ₹/kg for a tier — Base = GP, Value/Premium = GI (owner rule). */
export function tubeRateFor(costs, tier) {
  const gp = costs?.gpRatePerKg ?? 85, gi = costs?.giRatePerKg ?? 98.3;
  return tier === 'base' ? gp : gi;
}

/** kW number from a size key ('5sp' → 5). */
export const kwOf = (size) => Number(String(size).replace(/[^0-9.]/g, '')) || 0;

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * @param {object} p
 * @param {object} p.config           approved pack config (packConfig.approvedConfig)
 * @param {string} p.systemType       'ongrid' | 'hybrid'
 * @param {string} p.size             panel size key (the kW the customer buys panels for)
 * @param {string} p.tier             'base' | 'value' | 'premium'
 * @param {string} p.roofType         'FLAT' | 'SHEET' | 'ELEVATED'
 * @param {number} p.distanceKm       one-way warehouse → site
 * @param {string} [p.vehicleType]    from config.transportConfig.vehicles; defaults to the first vehicle when only one exists
 * @param {number} [p.batteryConfig]  hybrid 0/1/2
 * @param {string} [p.futureSystemSize] FR: everything but panels sized here
 * @param {Array}  p.lines            materialised BOM lines (bom-builder): { category, componentId, qty, unitPrice, gst, isVariable, defaultComponentId?, defaultUnitPrice? }
 * @param {string} [p.pricedAt]
 */
export function pricePack(p) {
  const errors = [];
  const cfg = p.config || {};
  const costs = cfg.costs || {};
  const gstPct = isNum(cfg.gst?.ratePct) ? cfg.gst.ratePct : 8.9;
  const roof = String(p.roofType || '').toUpperCase();
  if (!ROOF_TO_STRUCTURE_KEY[roof]) errors.push({ code: PACK_PRICING_ERROR.ROOF_INVALID, message: `roofType "${p.roofType}" must be FLAT | SHEET | ELEVATED.` });
  const dist = Number(p.distanceKm);
  if (!isNum(dist) || dist < 0) errors.push({ code: PACK_PRICING_ERROR.DISTANCE_INVALID, message: 'distanceKm must be a number ≥ 0.' });

  // --- market rate (GST-inclusive customer price for the PH default pack, flat roof) ---
  const key = marketRateKey({ systemType: p.systemType, tier: p.tier, batteryConfig: p.batteryConfig ?? 0, futureSystemSize: p.futureSystemSize || null });
  const marketRate = cfg.marketRates?.[key]?.[String(p.size)];
  if (!isNum(marketRate) || marketRate <= 0) errors.push({ code: PACK_PRICING_ERROR.MARKET_RATE_NOT_SET, message: `Market rate not set for ${key} / ${p.size}. Project Head must publish it.`, detail: { key, size: String(p.size) } });

  // --- installation (exact kW × roof from the matrix; no nearest-size) ---
  const sysSize = String(p.futureSystemSize || p.size);
  const inst = cfg.installationMatrix?.[sysSize];
  const roofKeyLc = roof.toLowerCase();
  const installFlat = inst ? inst.flat : undefined;
  const installRoof = inst ? inst[roofKeyLc] : undefined;
  if (!isNum(installFlat) || !isNum(installRoof)) errors.push({ code: PACK_PRICING_ERROR.INSTALLATION_NOT_SET, message: `Installation amount not set for ${sysSize} kW / ${roof}.`, detail: { size: sysSize, roof } });

  // --- transport (base km included; extra km is a customer extra) ---
  const tc = cfg.transportConfig || {};
  const baseKm = isNum(tc.baseDistanceKm) ? tc.baseDistanceKm : 100;
  const vehicles = Array.isArray(tc.vehicles) ? tc.vehicles : [];
  const vehicle = p.vehicleType ? vehicles.find(v => v.vehicleType === p.vehicleType) : (vehicles.length === 1 ? vehicles[0] : null);
  if (!vehicle) errors.push({ code: PACK_PRICING_ERROR.VEHICLE_NOT_SET, message: p.vehicleType ? `Vehicle "${p.vehicleType}" is not in the Project Head transport table.` : 'Vehicle type required (more than one vehicle configured).', detail: { configured: vehicles.map(v => v.vehicleType) } });

  if (errors.length) {
    return Object.freeze({ status: PACK_PRICING_STATUS.BLOCKED, errors: Object.freeze(errors), packPricingVersion: PACK_PRICING_VERSION, marketRateKey: key, pricedAt: p.pricedAt ?? null });
  }

  // --- swap deltas: selected vs PH default, GST at the line's own rate (v1 rule) ---
  const swapDeltas = [];
  let swapDeltaTotal = 0;
  for (const l of p.lines || []) {
    if (!l.isVariable || !l.defaultComponentId || l.defaultComponentId === l.componentId) continue;
    const selectedTotal = (l.unitPrice || 0) * (l.qty || 0);
    const defaultTotal = (l.defaultUnitPrice || 0) * (l.defaultQty ?? l.qty ?? 0);
    const diffPreGst = r0(selectedTotal - defaultTotal);
    const diffGst = r0(diffPreGst * (l.gst || 0) / 100);
    const diff = diffPreGst + diffGst;
    if (diff !== 0) {
      swapDeltaTotal += diff;
      swapDeltas.push({ category: l.category, selected: l.componentId, selectedName: l.name ?? null, default: l.defaultComponentId, defaultName: l.defaultName ?? null, qty: l.qty, diffPreGst, diffGst, diff, gstPct: l.gst ?? null });
    }
  }

  // --- roof add-on (non-flat): installation difference + structure material difference + labour + repair ---
  const kw = kwOf(sysSize);
  const tubeRate = tubeRateFor(costs, p.tier);
  const st = cfg.structureTemplates || {};
  const flat = structureMaterial(st[ROOF_TO_STRUCTURE_KEY.FLAT], kw, tubeRate);
  const chosen = roof === 'FLAT' ? flat : structureMaterial(st[ROOF_TO_STRUCTURE_KEY[roof]], kw, tubeRate);
  const structureExtra = roof === 'FLAT' ? 0 : Math.max(0, chosen.total - flat.total);
  const structureLabour = roof === 'FLAT' ? 0 : r0(costs.structureLabor || 0);
  const structureRepair = roof === 'FLAT' ? 0 : r0((structureExtra + structureLabour) * (costs.structureRepairPct || 0) / 100);
  const installationDiff = roof === 'FLAT' ? 0 : r0(installRoof - installFlat);
  const roofAddOnPreGst = structureExtra + structureLabour + structureRepair + installationDiff;
  const roofAddOnGst = r0(roofAddOnPreGst * gstPct / 100);
  const roofAddOn = roofAddOnPreGst + roofAddOnGst;

  // --- customer price ---
  const customerPriceInclGst = r0(marketRate + swapDeltaTotal + roofAddOn);
  const preGst = r0(customerPriceInclGst / (1 + gstPct / 100));
  const gstAmount = customerPriceInclGst - preGst;

  // --- transport extra (customer extra, outside the quote price) ---
  const extraKm = Math.max(0, dist - baseKm);
  const transportExtra = r0(extraKm * vehicle.ratePerKm);

  // --- internal reference cost + margin check (PH / Admin only) ---
  const material = (p.lines || []).reduce((s, l) => s + (l.amount ?? (l.unitPrice || 0) * (l.qty || 0)), 0);
  const referenceCost = {
    material: r0(material),
    structureMaterial: r0(chosen.total),
    installation: r0(installRoof),
    service: r0((costs.serviceRateYear || 0) * (costs.serviceYears || 0)),
    transportationBase: r0(baseKm * (isNum(costs.transportRate) ? costs.transportRate : vehicle.ratePerKm)),
    miscellaneous: r0(costs.miscellaneous || 0),
    office: r0(costs.office || 0),
    structureLabour, structureRepair,
  };
  const referenceTotal = Object.values(referenceCost).reduce((s, v) => s + v, 0);
  const marginPct = isNum(cfg.pricing?.marginPct) ? cfg.pricing.marginPct : 0;
  const marginAmt = r0(referenceTotal * marginPct / 100);
  const grandPreGst = referenceTotal + marginAmt;
  const grand = grandPreGst + r0(grandPreGst * gstPct / 100);

  return Object.freeze({
    status: PACK_PRICING_STATUS.COMPLETE,
    packPricingVersion: PACK_PRICING_VERSION,
    pricedAt: p.pricedAt ?? null,
    marketRateKey: key,
    inputs: Object.freeze({ systemType: p.systemType, size: String(p.size), systemSize: sysSize, tier: p.tier, roofType: roof, distanceKm: dist, vehicleType: vehicle.vehicleType, batteryConfig: p.batteryConfig ?? 0, futureSystemSize: p.futureSystemSize || null }),
    gst: Object.freeze({ regime: cfg.gst?.regime || 'SOLAR_70_30_COMPOSITE', ratePct: gstPct }),
    customer: Object.freeze({
      marketRate: r0(marketRate),
      swapDeltaTotal: r0(swapDeltaTotal),
      roofAddOn, roofAddOnPreGst, roofAddOnGst,
      sellingPriceBeforeGST: preGst,
      gstAmount,
      sellingPriceIncludingGST: customerPriceInclGst,
      transportExtra,
      transportExtraDetail: Object.freeze({ distanceKm: dist, includedKm: baseKm, extraKm, ratePerKm: vehicle.ratePerKm, vehicleType: vehicle.vehicleType }),
      customerTotalIncludingGST: customerPriceInclGst + transportExtra,
    }),
    swapDeltas: Object.freeze(swapDeltas),
    roofAddOnDetail: Object.freeze({ roofType: roof, installationFlat: r0(installFlat), installationRoof: r0(installRoof), installationDiff, structureFlatTotal: r0(flat.total), structureRoofTotal: r0(chosen.total), structureExtra, structureLabour, structureRepair, tubeRatePerKg: tubeRate }),
    structureMaterial: Object.freeze({ roofType: roof, kw, tubeRatePerKg: tubeRate, lines: Object.freeze(chosen.lines), total: r0(chosen.total) }),
    internal: Object.freeze({
      referenceCost: Object.freeze(referenceCost),
      referenceTotal: r0(referenceTotal),
      marginPct, marginAmt, grandPreGst: r0(grandPreGst), grand: r0(grand),
      marginVsMarket: r0(customerPriceInclGst - grand),
      marginVsMarketPct: grand > 0 ? Number(((customerPriceInclGst - grand) / grand * 100).toFixed(1)) : null,
      note: 'Reference cost uses catalog prices, not procurement landed cost. Compare with the Cost Engine (landed) when it is complete.',
    }),
  });
}
