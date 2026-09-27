/**
 * COMMERCIAL (PRICE) SNAPSHOT.  (Phase 2A §27, §28)
 *
 * A quotation issued today must still read the same tomorrow after Procurement
 * changes a purchase price, Admin changes the margin or the office expense, or
 * Project Head changes an installation rate.
 *
 * A commercial snapshot freezes the cost result, the pricing result and EVERY
 * version reference behind them. A configuration change never mutates it — it
 * produces a NEW calculation with a new version chain.
 *
 * BOUNDARY: freezing, comparison and the recalculation path. It calculates
 * nothing itself.
 */

import { calculateCost, COST_STATUS } from './costEngine.js';
import { calculatePricing, PRICING_STATUS } from './pricingEngine.js';

export const COMMERCIAL_SNAPSHOT_STATUS = { ISSUED: 'ISSUED', SUPERSEDED: 'SUPERSEDED' };

/** Every version that can move a number. All are pinned on the snapshot. */
export const VERSION_KEYS = [
  'bomSnapshotId', 'catalogVersion', 'procurementPriceVersion', 'landedCostVersion',
  'projectRateCardVersion', 'costConfigVersion', 'marginVersion', 'gstVersion',
  'costEngineVersion', 'pricingEngineVersion', 'moneyRuleVersion',
  'offerVersion', 'marketRateVersion',
];

/**
 * Freeze a costed + priced project.
 * `issuedAt` and `snapshotId` are supplied by the caller — nothing is generated
 * from a clock or a random source.
 */
export function createCommercialSnapshot({
  snapshotId, costResult, pricingResult, issuedBy = null, issuedAt = null,
  moneyRuleVersion = 'money.1', offer = null,
}) {
  if (!costResult || costResult.status !== COST_STATUS.COMPLETE)
    throw new Error('cannot issue a commercial snapshot from an incomplete cost result');
  if (!pricingResult || pricingResult.status !== PRICING_STATUS.COMPLETE)
    throw new Error('cannot issue a commercial snapshot from a rejected pricing result');

  return deepFreeze({
    snapshotId,
    status: COMMERCIAL_SNAPSHOT_STATUS.ISSUED,
    projectId: costResult.projectId,
    issuedBy, issuedAt,

    versions: {
      bomSnapshotId: costResult.bomSnapshotId,
      catalogVersion: costResult.catalogVersion,
      procurementPriceVersion: costResult.procurementPriceVersion,
      landedCostVersion: costResult.landedCostVersion ?? null,
      projectRateCardVersion: costResult.projectRateCardVersion ?? null,
      costConfigVersion: costResult.costConfigVersion,
      marginVersion: pricingResult.marginVersion,
      gstVersion: pricingResult.gstVersion,
      costEngineVersion: costResult.costEngineVersion,
      pricingEngineVersion: pricingResult.pricingEngineVersion,
      moneyRuleVersion,
      offerVersion: offer?.offerVersion ?? offer?.version ?? null,
      marketRateVersion: pricingResult.marketRateReference?.value ?? null,
    },

    cost: {
      materialLandedCost: costResult.materialLandedCost ?? costResult.materialCost,
      materialCost: costResult.materialLandedCost ?? costResult.materialCost,
      structureCost: costResult.structureCost,
      installationCost: costResult.installationCost,
      siteSurveyCost: costResult.siteSurveyCost,
      engineeringDesignCost: costResult.engineeringDesignCost,
      transportationCost: costResult.transportationCost,
      serviceAmcCost: costResult.serviceAmcCost,
      miscellaneousCost: costResult.miscellaneousCost,
      officeExpenseAllocation: costResult.officeExpenseAllocation,
      specialProjectWorksCost: costResult.specialProjectWorksCost ?? null,
      directProjectCost: costResult.directProjectCost ?? null,
      totalActualProjectCost: costResult.totalActualProjectCost ?? costResult.totalActualCost,
      totalActualCost: costResult.totalActualProjectCost ?? costResult.totalActualCost,
      traces: costResult.traces,
    },

    pricing: {
      marginType: pricingResult.marginType,
      targetGrossMargin: pricingResult.targetGrossMargin,
      sellingPriceBeforeGST: pricingResult.sellingPriceBeforeGST,
      grossProfit: pricingResult.grossProfit,
      gstRatePct: pricingResult.gstRatePct,
      gstAmount: pricingResult.gstAmount,
      sellingPriceIncludingGST: pricingResult.sellingPriceIncludingGST,
      extras: pricingResult.extras,
      extrasIncludingGST: pricingResult.extrasIncludingGST,
      customerTotalIncludingGST: pricingResult.customerTotalIncludingGST,
      customerSideExpenses: pricingResult.customerSideExpenses ?? [],
    },

    offer: offer ? {
      offerId: offer.offerId ?? offer.id ?? null,
      offerName: offer.offerName ?? offer.name ?? null,
      offerType: offer.offerType ?? offer.type ?? null,
      offerValue: offer.offerValue != null ? offer.offerValue : (offer.value != null ? Number(offer.value) : null),
      offerAmount: offer.offerAmount ?? null,
      offerVersion: offer.offerVersion ?? offer.version ?? null,
      offerStatus: offer.offerStatus ?? (offer.active ? 'ACTIVE' : null),
    } : null,
  });
}

/**
 * A configuration change NEVER mutates an issued snapshot.
 * This returns the snapshot untouched, plus what the change would imply.
 */
export function applyConfigChange(snapshot, changeDescription) {
  return Object.freeze({
    snapshot,                                  // same object reference, unchanged
    mutated: false,
    effect: 'A configuration change produces a NEW calculation. Issued snapshots and the ' +
            'quotations built on them never change silently.',
    change: changeDescription ?? null,
  });
}

/**
 * The deterministic recalculation path for a NEW quotation (§28).
 * Runs the same two engines against the CURRENT configuration and price master,
 * and returns the new results plus a comparison against the old snapshot.
 * The old snapshot is not touched.
 */
export function recalculateForNewQuotation({
  previousSnapshot, bomSnapshot, config, priceMaster, project,
  margin, gst, extras = [], calculatedAt = null, pricedAt = null,
  catalogVersion = null, procurementPriceVersion = null,
}) {
  const cost = calculateCost({ snapshot: bomSnapshot, config, priceMaster, project,
    rateCard: arguments[0].rateCard ?? null,
    calculatedAt, catalogVersion, procurementPriceVersion,
    landedCostVersion: arguments[0].landedCostVersion ?? null,
    projectRateCardVersion: arguments[0].projectRateCardVersion ?? null });
  const pricing = calculatePricing({ costResult: cost, margin, gst, extras, pricedAt });

  const delta = (a, b) => (a == null || b == null ? null : b - a);
  return Object.freeze({
    previousSnapshot,                          // untouched
    cost, pricing,
    comparison: previousSnapshot ? Object.freeze({
      totalActualCost: { before: previousSnapshot.cost.totalActualCost, after: cost.totalActualCost,
        delta: delta(previousSnapshot.cost.totalActualCost, cost.totalActualCost) },
      sellingPriceBeforeGST: { before: previousSnapshot.pricing.sellingPriceBeforeGST,
        after: pricing.sellingPriceBeforeGST,
        delta: delta(previousSnapshot.pricing.sellingPriceBeforeGST, pricing.sellingPriceBeforeGST) },
      versionsChanged: VERSION_KEYS.filter(k => {
        const before = previousSnapshot.versions[k];
        const after = k === 'pricingEngineVersion' ? pricing.pricingEngineVersion
          : k === 'moneyRuleVersion' ? previousSnapshot.versions.moneyRuleVersion
            : (cost[k] ?? pricing[k] ?? null);
        return before !== after;
      }),
    }) : null,
  });
}

/** Supersede an issued snapshot. Produces a COPY marked SUPERSEDED; the original stands. */
export function supersede(snapshot, { supersededBy = null, at = null } = {}) {
  return Object.freeze({
    ...snapshot,
    status: COMMERCIAL_SNAPSHOT_STATUS.SUPERSEDED,
    supersededBy, supersededAt: at,
  });
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

// ---------------------------------------------------------------------------
// PACK MARKET-RATE snapshot (2026-09-08 fast-quotation build)
// ---------------------------------------------------------------------------

/**
 * Build an ISSUED commercial snapshot from the owner's pack formula
 * (packPricing.pricePack) instead of the landed-cost + gross-margin engines.
 * Same output shape as createCommercialSnapshot so every downstream consumer
 * (quotation payload, commercial freeze, verify, renderer) is unchanged.
 *
 *   pricing.sellingPriceBeforeGST / gstAmount / sellingPriceIncludingGST
 *       = market rate + swap deltas + roof add-on, split at the composite rate
 *   pricing.extras[0]  = transport beyond the included km (customer extra,
 *                        outside the quote price) — only when > 0
 *   cost               = PH reference cost (catalog prices + matrix + charges),
 *                        NOT procurement landed cost; `landedCostCheck` carries
 *                        the real Cost Engine result when it was complete
 *   pack               = the frozen pack facts (config version, market-rate key,
 *                        deltas, roof add-on, transport, full material list)
 */
export function createPackCommercialSnapshot({
  snapshotId, projectId, bomSnapshotId, packPricing, configVersion, materialList = [],
  costResult = null, issuedBy = null, issuedAt = null, moneyRuleVersion = 'money.1', offer = null,
  catalogVersion = null,
}) {
  if (!packPricing || packPricing.status !== 'COMPLETE')
    throw new Error('cannot issue a pack commercial snapshot from a blocked pack pricing result');
  const c = packPricing.customer;
  const inp = packPricing.inputs;
  const landedOk = costResult && costResult.status === COST_STATUS.COMPLETE;
  const cfgVersion = `pack-config@v${configVersion}`;

  const extras = c.transportExtra > 0 ? [Object.freeze({
    extraId: 'TRANSPORT_EXTRA_KM',
    type: 'TRANSPORT',
    description: `Transport beyond ${c.transportExtraDetail.includedKm} km included: ${c.transportExtraDetail.extraKm} km × ₹${c.transportExtraDetail.ratePerKm}/km (${c.transportExtraDetail.vehicleType})`,
    includedInBase: false,
    semantic: 'CUSTOMER_EXTRA',
    customerPriceExcludingGST: c.transportExtra,
    gstRegime: 'NOT_APPLIED',
    gstRatePct: 0,
    gstAmount: 0,
    customerPriceIncludingGST: c.transportExtra,
    detail: Object.freeze({ ...c.transportExtraDetail }),
  })] : [];

  const transportTrace = Object.freeze({
    head: 'TRANSPORTATION',
    amount: c.transportExtra,
    inputs: Object.freeze({
      vehicleType: c.transportExtraDetail.vehicleType,
      distanceKm: c.transportExtraDetail.distanceKm,
      includedKm: c.transportExtraDetail.includedKm,
      extraKm: c.transportExtraDetail.extraKm,
      ratePerKm: c.transportExtraDetail.ratePerKm,
      distanceBasis: 'ONE_WAY',
    }),
    formula: 'max(0, distanceKm − includedKm) × ratePerKm — included km are inside the pack market rate',
    version: cfgVersion,
    source: 'PACK_CONFIG_TRANSPORT',
  });

  const ref = packPricing.internal.referenceCost;
  return deepFreeze({
    snapshotId,
    status: COMMERCIAL_SNAPSHOT_STATUS.ISSUED,
    projectId,
    issuedBy, issuedAt,
    pricingMode: 'PACK_MARKET_RATE',
    gstRegime: packPricing.gst.regime,

    versions: {
      bomSnapshotId,
      catalogVersion: catalogVersion ?? costResult?.catalogVersion ?? null,
      procurementPriceVersion: landedOk ? costResult.procurementPriceVersion : null,
      landedCostVersion: landedOk ? (costResult.landedCostVersion ?? null) : null,
      projectRateCardVersion: null,
      costConfigVersion: cfgVersion,
      marginVersion: `pack-market-rate@v${configVersion}`,
      gstVersion: `${packPricing.gst.regime}@${packPricing.gst.ratePct}`,
      costEngineVersion: landedOk ? costResult.costEngineVersion : null,
      pricingEngineVersion: packPricing.packPricingVersion,
      moneyRuleVersion,
      offerVersion: offer?.offerVersion ?? offer?.version ?? null,
      marketRateVersion: `${cfgVersion}:${packPricing.marketRateKey}/${inp.size}`,
    },

    cost: {
      basis: 'PH_REFERENCE_COST',
      note: 'Catalog reference prices + PH installation matrix + charges. Not procurement landed cost. See landedCostCheck.',
      materialLandedCost: landedOk ? costResult.materialLandedCost ?? costResult.materialCost : null,
      materialCost: ref.material,
      structureCost: ref.structureMaterial + ref.structureLabour + ref.structureRepair,
      installationCost: ref.installation,
      siteSurveyCost: null,
      engineeringDesignCost: null,
      transportationCost: ref.transportationBase,
      serviceAmcCost: ref.service,
      miscellaneousCost: ref.miscellaneous,
      officeExpenseAllocation: ref.office,
      specialProjectWorksCost: null,
      directProjectCost: packPricing.internal.referenceTotal,
      totalActualProjectCost: packPricing.internal.referenceTotal,
      totalActualCost: packPricing.internal.referenceTotal,
      referenceMarginPct: packPricing.internal.marginPct,
      referenceGrand: packPricing.internal.grand,
      marginVsMarket: packPricing.internal.marginVsMarket,
      marginVsMarketPct: packPricing.internal.marginVsMarketPct,
      landedCostCheck: landedOk ? {
        status: costResult.status,
        totalActualProjectCost: costResult.totalActualProjectCost ?? costResult.totalActualCost ?? null,
        landedCostVersion: costResult.landedCostVersion ?? null,
      } : { status: costResult?.status ?? 'NOT_RUN', errors: (costResult?.errors || []).map(e => e.code) },
      traces: [transportTrace],
    },

    pricing: {
      marginType: 'PACK_MARKET_RATE',
      targetGrossMargin: null,
      sellingPriceBeforeGST: c.sellingPriceBeforeGST,
      grossProfit: null,
      gstRegime: packPricing.gst.regime,
      gstRatePct: packPricing.gst.ratePct,
      gstAmount: c.gstAmount,
      sellingPriceIncludingGST: c.sellingPriceIncludingGST,
      extras,
      extrasIncludingGST: c.transportExtra,
      customerTotalIncludingGST: c.customerTotalIncludingGST,
      customerSideExpenses: [],
      marketRate: c.marketRate,
      swapDeltaTotal: c.swapDeltaTotal,
      roofAddOn: c.roofAddOn,
    },

    pack: {
      configVersion,
      marketRateKey: packPricing.marketRateKey,
      marketRate: c.marketRate,
      inputs: inp,
      swapDeltas: packPricing.swapDeltas,
      roofAddOnDetail: packPricing.roofAddOnDetail,
      structureMaterial: packPricing.structureMaterial,
      transport: c.transportExtraDetail,
      materialList,
    },

    offer: offer ? {
      offerId: offer.offerId ?? offer.id ?? null,
      offerName: offer.offerName ?? offer.name ?? null,
      offerType: offer.offerType ?? offer.type ?? null,
      offerValue: offer.offerValue != null ? offer.offerValue : (offer.value != null ? Number(offer.value) : null),
      offerAmount: offer.offerAmount ?? null,
      offerVersion: offer.offerVersion ?? offer.version ?? null,
      offerStatus: offer.offerStatus ?? (offer.active ? 'ACTIVE' : null),
    } : null,
  });
}
