/**
 * PRICING ENGINE V1.  (Phase 2A §16–§25)
 *
 * ONE question: "what should we sell it for?"
 *
 * INPUT   a CostResult (costEngine.js)
 * OUTPUT  a deterministic PricingResult
 *
 * THE PRICING ENGINE MUST NOT (and structurally cannot):
 *   recalculate engineering · recalculate the BOM · recalculate material
 *   purchase prices · modify cost assumptions.
 * It imports no BOM module, no engineering module, and no price master. Its
 * only numeric input is `costResult.totalActualCostExact`.
 *
 * MARGIN MODEL — APPROVED DECISION
 *   GROSS MARGIN, never markup.
 *     sellingPriceBeforeGST = totalActualCost / (1 - grossMargin)
 *   The markup form cost × (1 + margin) is FORBIDDEN in V1 and is not present
 *   in this file.
 */

import { roundMoney, sumExact, isMoney } from './money.js';
import { COST_STATUS } from './costEngine.js';

export const PRICING_ENGINE_VERSION = 'pricingEngine.3';

export const MARGIN_TYPE = { GROSS_MARGIN: 'GROSS_MARGIN' };
/** MARKUP is deliberately NOT a supported margin type. */
export const FORBIDDEN_MARGIN_TYPES = ['MARKUP'];

export const MONEY_SEMANTIC = {
  PURCHASE_COST: 'PURCHASE_COST',
  INTERNAL_COST: 'INTERNAL_COST',
  SELLING_PRICE: 'SELLING_PRICE',
  CUSTOMER_EXTRA: 'CUSTOMER_EXTRA',
  GST: 'GST',
  TOTAL_CUSTOMER_PRICE: 'TOTAL_CUSTOMER_PRICE',
  REFERENCE_ONLY: 'REFERENCE_ONLY',
};

export const EXTRA_TYPE = {
  OPTIONAL_ACCESSORY: 'OPTIONAL_ACCESSORY',
  ADDITIONAL_SERVICE: 'ADDITIONAL_SERVICE',
  OTHER_APPROVED_EXTRA: 'OTHER_APPROVED_EXTRA',
};

/**
 * NET METER — NOT A FLARIZE ITEM.
 *
 * The customer buys the net meter directly, as KSEB requires. It is therefore
 * not in the Flarize BOM, not in material or landed cost, not in project cost,
 * not in the Flarize margin and not in the solar system selling price.
 *
 * `NET_METERING` is deliberately ABSENT from EXTRA_TYPE so it cannot be sold as
 * a Flarize extra. If it needs to appear on a document it goes through
 * `customerSideExpenses` — displayed for the customer's information, never
 * marked up, never included in any Flarize total.
 */
export const FORBIDDEN_EXTRA_TYPES = ['NET_METERING', 'NET_METER'];

export const CUSTOMER_SIDE_EXPENSE_TYPE = {
  NET_METER: 'NET_METER',
  GOVERNMENT_FEE: 'GOVERNMENT_FEE',
  OTHER_CUSTOMER_PROCURED: 'OTHER_CUSTOMER_PROCURED',
};

/**
 * GST regimes. Exactly ONE is applied to a given price. (§18)
 *
 * SOLAR_70_30_COMPOSITE — the approved V1 regime (decision C73). A solar plant
 * supply is split by value: 70% goods at 5% and 30% service at 18%. The
 * effective rate is DERIVED from that split, never entered as a flat number:
 *     0.70 × 5 + 0.30 × 18 = 3.5 + 5.4 = 8.9%
 * The split is computed explicitly so the goods and service components are both
 * reportable on the invoice; 8.9% is an output, not an input.
 *
 * FLAT — a single rate on the whole supply. Retained for configurations that
 * genuinely have one, and for regression against the legacy 9%.
 */
export const GST_REGIME = {
  SOLAR_70_30_COMPOSITE: 'SOLAR_70_30_COMPOSITE',
  FLAT: 'FLAT',
};

export const PRICING_ERROR = {
  COST_NOT_AVAILABLE: 'COST_NOT_AVAILABLE',
  COST_INCOMPLETE: 'COST_INCOMPLETE',
  MARGIN_NOT_CONFIGURED: 'MARGIN_NOT_CONFIGURED',
  MARGIN_OUT_OF_RANGE: 'MARGIN_OUT_OF_RANGE',
  MARGIN_TYPE_FORBIDDEN: 'MARGIN_TYPE_FORBIDDEN',
  GST_NOT_CONFIGURED: 'GST_NOT_CONFIGURED',
  GST_REGIME_INVALID: 'GST_REGIME_INVALID',
  GST_SPLIT_INVALID: 'GST_SPLIT_INVALID',
  GST_EFFECTIVE_RATE_MISMATCH: 'GST_EFFECTIVE_RATE_MISMATCH',
  EXTRA_INVALID: 'EXTRA_INVALID',
  MARGIN_CONFIG_INVALID: 'MARGIN_CONFIG_INVALID',
  MARGIN_BELOW_MINIMUM: 'MARGIN_BELOW_MINIMUM',
  DISCOUNT_INVALID: 'DISCOUNT_INVALID',
  EXTRA_TYPE_FORBIDDEN: 'EXTRA_TYPE_FORBIDDEN',
};

/** Outcome of the commercial approval gate. */
export const APPROVAL = {
  NONE_REQUIRED: 'NONE_REQUIRED',
  SALES_HEAD_APPROVAL_REQUIRED: 'SALES_HEAD_APPROVAL_REQUIRED',
  BLOCKED: 'BLOCKED',
};

export const TIERS = ['BASE', 'VALUE', 'PREMIUM'];

/**
 * Resolve the per-tier margin configuration.  (§13)
 * Nothing is hardcoded and nothing is defaulted: an unconfigured tier blocks.
 * Constraint: 0 <= minimumMarginPct <= targetMarginPct < 100.
 */
export function resolveTierMargin(marginConfig = {}, tier = null) {
  if (marginConfig.marginType && FORBIDDEN_MARGIN_TYPES.includes(marginConfig.marginType))
    return { ok: false, code: PRICING_ERROR.MARGIN_TYPE_FORBIDDEN,
      reason: `marginType "${marginConfig.marginType}" is forbidden. The approved model is GROSS_MARGIN (C60).` };
  if (marginConfig.marginType && marginConfig.marginType !== MARGIN_TYPE.GROSS_MARGIN)
    return { ok: false, code: PRICING_ERROR.MARGIN_TYPE_FORBIDDEN,
      reason: `Unknown marginType "${marginConfig.marginType}". Only GROSS_MARGIN is supported.` };

  const key = String(tier || '').toUpperCase();
  if (!TIERS.includes(key))
    return { ok: false, code: PRICING_ERROR.MARGIN_CONFIG_INVALID,
      reason: `Tier "${tier ?? 'undeclared'}" is not one of ${TIERS.join(', ')}. Margin is tier-specific.` };

  const t = (marginConfig.tiers || {})[key];
  if (!t || !isMoney(t.targetMarginPct) || !isMoney(t.minimumMarginPct))
    return { ok: false, code: PRICING_ERROR.MARGIN_CONFIG_INVALID,
      reason: `Tier ${key} has no approved targetMarginPct / minimumMarginPct. No percentage is assumed.`,
      detail: { tier: key } };

  const target = Number(t.targetMarginPct), minimum = Number(t.minimumMarginPct);
  if (target < 0 || target >= 100)
    return { ok: false, code: PRICING_ERROR.MARGIN_CONFIG_INVALID,
      reason: `Tier ${key} targetMarginPct ${target} is out of range (0 <= target < 100).` };
  if (minimum < 0)
    return { ok: false, code: PRICING_ERROR.MARGIN_CONFIG_INVALID,
      reason: `Tier ${key} minimumMarginPct ${minimum} is negative.` };
  if (minimum > target)
    return { ok: false, code: PRICING_ERROR.MARGIN_CONFIG_INVALID,
      reason: `Tier ${key} minimumMarginPct ${minimum} exceeds targetMarginPct ${target}. ` +
              'The constraint is 0 <= minimum <= target < 100.' };

  return { ok: true, tier: key, targetMarginPct: target, minimumMarginPct: minimum,
    targetGrossMargin: target / 100, minimumGrossMargin: minimum / 100,
    version: marginConfig.version ?? null };
}

export const PRICING_STATUS = { COMPLETE: 'COMPLETE', REJECTED: 'REJECTED' };

/**
 * Resolve a GST configuration into components that sum to the whole supply.
 * Returns { ok, components:[{label, valuationPct, ratePct}], effectiveRatePct }.
 * NOTHING is assumed: an unrecognised regime, a split that does not total 100%,
 * or a declared effective rate that disagrees with the split, all fail.
 */
export function resolveGstRegime(gst = {}) {
  const regime = gst.regime || (isMoney(gst.ratePct) ? GST_REGIME.FLAT : null);

  if (regime === GST_REGIME.SOLAR_70_30_COMPOSITE) {
    const gv = Number(gst.goodsValuationPct), gr = Number(gst.goodsRatePct);
    const sv = Number(gst.serviceValuationPct), sr = Number(gst.serviceRatePct);
    if (![gv, gr, sv, sr].every(Number.isFinite))
      return { ok: false, code: PRICING_ERROR.GST_SPLIT_INVALID,
        reason: 'SOLAR_70_30_COMPOSITE requires goodsValuationPct, goodsRatePct, serviceValuationPct and serviceRatePct.' };
    if (Math.abs(gv + sv - 100) > 1e-9)
      return { ok: false, code: PRICING_ERROR.GST_SPLIT_INVALID,
        reason: `Valuation split must total 100% of the supply (got ${gv} + ${sv} = ${gv + sv}).` };

    // The effective rate is DERIVED. A declared value is a cross-check, not an input.
    // Rounded to 6 dp for REPORTING only — binary float would render 8.9 as
    // 8.899999999999999. The tax itself is computed from the components, never
    // from this number, so the rounding cannot move a rupee.
    const effective = Math.round(((gv / 100) * gr + (sv / 100) * sr) * 1e6) / 1e6;
    if (isMoney(gst.effectiveRatePct) && Math.abs(Number(gst.effectiveRatePct) - effective) > 0.0001)
      return { ok: false, code: PRICING_ERROR.GST_EFFECTIVE_RATE_MISMATCH,
        reason: `Declared effective rate ${gst.effectiveRatePct}% does not match the split ` +
                `(${gv}% × ${gr}% + ${sv}% × ${sr}% = ${effective}%). The split is authoritative.` };

    return { ok: true, regime, effectiveRatePct: effective,
      components: [
        { label: 'GOODS', valuationPct: gv, ratePct: gr },
        { label: 'SERVICE', valuationPct: sv, ratePct: sr },
      ] };
  }

  if (regime === GST_REGIME.FLAT) {
    if (!isMoney(gst.ratePct))
      return { ok: false, code: PRICING_ERROR.GST_NOT_CONFIGURED, reason: 'FLAT regime requires ratePct.' };
    return { ok: true, regime, effectiveRatePct: Number(gst.ratePct),
      components: [{ label: 'WHOLE_SUPPLY', valuationPct: 100, ratePct: Number(gst.ratePct) }] };
  }

  if (!regime)
    return { ok: false, code: PRICING_ERROR.GST_NOT_CONFIGURED,
      reason: 'No GST configuration. No rate and no regime is assumed.' };
  return { ok: false, code: PRICING_ERROR.GST_REGIME_INVALID, reason: `Unknown GST regime "${regime}".` };
}

/** Apply a resolved regime to one pre-GST amount. Full precision; caller rounds. */
function applyGst(resolved, baseExact) {
  const components = resolved.components.map(c => {
    const taxableExact = baseExact * (c.valuationPct / 100);
    const taxExact = taxableExact * (c.ratePct / 100);
    return { ...c, taxableExact, taxExact,
      taxableValue: roundMoney(taxableExact), taxAmount: roundMoney(taxExact) };
  });
  // The PUBLISHED tax total is the sum of the PUBLISHED component amounts, so an
  // invoice showing the goods line, the service line and the total reconciles to
  // the rupee. The exact total is retained alongside it for audit.
  return { components,
    totalPublished: sumExact(components.map(c => c.taxAmount)),
    totalExact: sumExact(components.map(c => c.taxExact)) };
}

/** §17 — 0 <= margin < 1. 100% and above is rejected; so is a negative margin. */
export function validateGrossMargin(m) {
  if (!isMoney(m)) return { valid: false, code: PRICING_ERROR.MARGIN_NOT_CONFIGURED,
    reason: 'No approved target gross margin is configured. None is assumed.' };
  const v = Number(m);
  if (v < 0) return { valid: false, code: PRICING_ERROR.MARGIN_OUT_OF_RANGE, reason: `Gross margin ${v} is negative.` };
  if (v >= 1) return { valid: false, code: PRICING_ERROR.MARGIN_OUT_OF_RANGE,
    reason: `Gross margin ${v} is 100% or more. 1 - margin would be zero or negative, so the price is undefined. Rejected.` };
  return { valid: true, value: v };
}

/**
 * @param {object} arg
 *   costResult      from calculateCost()
 *   margin          { marginType, targetGrossMargin, version }
 *   gst             { ratePct, version, appliesTo }
 *   extras          [{ extraId, type, description, customerPrice, gstRatePct, includedInBase:false }]
 *   marketRate      reference only — NEVER used in any calculation
 *   pricedAt        ISO timestamp supplied by the caller (determinism)
 */
export function calculatePricing({
  costResult, margin = {}, gst = {}, extras = [], marketRate = null, pricedAt = null,
  tier = null, discount = null, customerSideExpenses = [],
}) {
  const errors = [];
  const reject = (code, message, detail) => {
    errors.push({ code, message, detail: detail ?? null });
    return Object.freeze({
      status: PRICING_STATUS.REJECTED, error: code, errors: Object.freeze(errors),
      pricingEngineVersion: PRICING_ENGINE_VERSION, pricedAt,
      costResultId: costResult?.bomSnapshotId ?? null,
      sellingPriceBeforeGST: null, gstAmount: null, sellingPriceIncludingGST: null,
    });
  };

  if (!costResult || costResult.status === COST_STATUS.UNAVAILABLE)
    return reject(PRICING_ERROR.COST_NOT_AVAILABLE,
      'No cost result. The BOM must be locked and costed before it can be priced.');
  const costExact = costResult.totalActualProjectCostExact ?? costResult.totalActualCostExact;
  if (costResult.status !== COST_STATUS.COMPLETE || costExact == null)
    return reject(PRICING_ERROR.COST_INCOMPLETE,
      'Cost is incomplete. A price computed from a partial cost would understate the true cost.',
      costResult.errors?.map(e => e.code));

  // ---- §13 margin configuration: per tier, never hardcoded ---------------
  // Tier-based configuration is authoritative when `margin.tiers` is present.
  // A single explicit targetGrossMargin is still accepted for a non-tiered call.
  let mv, tierMargin = null;
  if (margin.tiers) {
    tierMargin = resolveTierMargin(margin, tier ?? costResult.tier);
    if (!tierMargin.ok) return reject(tierMargin.code, tierMargin.reason, tierMargin.detail ?? null);
    mv = { valid: true, value: tierMargin.targetGrossMargin };
  } else {
    if (margin.marginType && FORBIDDEN_MARGIN_TYPES.includes(margin.marginType))
      return reject(PRICING_ERROR.MARGIN_TYPE_FORBIDDEN,
        `marginType "${margin.marginType}" is forbidden in V1. The approved model is GROSS_MARGIN (C60).`);
    if (margin.marginType && margin.marginType !== MARGIN_TYPE.GROSS_MARGIN)
      return reject(PRICING_ERROR.MARGIN_TYPE_FORBIDDEN,
        `Unknown marginType "${margin.marginType}". Only GROSS_MARGIN is supported.`);
    mv = validateGrossMargin(margin.targetGrossMargin);
    if (!mv.valid) return reject(mv.code, mv.reason, { targetGrossMargin: margin.targetGrossMargin ?? null });
  }

  const gstResolved = resolveGstRegime(gst);
  if (!gstResolved.ok) return reject(gstResolved.code, gstResolved.reason, { regime: gst.regime ?? null });

  // ---- §16 GROSS MARGIN ---------------------------------------------------
  const cost = costExact;
  // LIST price, before any discount.
  const listBeforeGstExact = cost / (1 - mv.value);          // NOT cost × (1 + m)

  // ---- §15 DISCOUNT LAYER -----------------------------------------------
  // LIST_SELLING_PRICE -> DISCOUNT -> FINAL_SELLING_PRICE -> ACTUAL MARGIN
  // A discount never touches the cost. The margin is ALWAYS recomputed after it.
  let discountAmountExact = 0, discountDetail = null;
  if (discount) {
    if (isMoney(discount.amount)) discountAmountExact = Number(discount.amount);
    else if (isMoney(discount.percentage)) discountAmountExact = listBeforeGstExact * (Number(discount.percentage) / 100);
    else return reject(PRICING_ERROR.DISCOUNT_INVALID,
      'A discount must declare either an amount or a percentage.', discount);
    if (discountAmountExact < 0)
      return reject(PRICING_ERROR.DISCOUNT_INVALID, 'A discount cannot be negative.', discount);
    if (discountAmountExact > listBeforeGstExact)
      return reject(PRICING_ERROR.DISCOUNT_INVALID,
        'A discount cannot exceed the list selling price.', discount);
    discountDetail = { amount: roundMoney(discountAmountExact),
      percentage: discount.percentage ?? null, requestedBy: discount.requestedBy ?? null,
      reason: discount.reason ?? null };
  }

  const sellingBeforeGstExact = listBeforeGstExact - discountAmountExact;
  const grossProfitExact = sellingBeforeGstExact - cost;
  // Margin AFTER discount. Never computed only before the discount.
  const actualGrossMarginPct = sellingBeforeGstExact === 0 ? null
    : (grossProfitExact / sellingBeforeGstExact) * 100;

  // ---- §14 MINIMUM MARGIN PROTECTION — hard commercial gate --------------
  let approval = APPROVAL.NONE_REQUIRED, approvalReason = null;
  if (tierMargin) {
    if (actualGrossMarginPct == null || actualGrossMarginPct < tierMargin.minimumMarginPct - 1e-9) {
      return reject(PRICING_ERROR.MARGIN_BELOW_MINIMUM,
        `Actual gross margin ${actualGrossMarginPct == null ? 'undefined' : actualGrossMarginPct.toFixed(4)}% is below the ` +
        `${tierMargin.minimumMarginPct}% minimum for tier ${tierMargin.tier}. The quotation is BLOCKED. ` +
        'Sales cannot bypass this gate; no override workflow exists in V1.',
        { tier: tierMargin.tier, actualGrossMarginPct, minimumMarginPct: tierMargin.minimumMarginPct,
          targetMarginPct: tierMargin.targetMarginPct });
    }
    if (actualGrossMarginPct < tierMargin.targetMarginPct - 1e-9) {
      approval = APPROVAL.SALES_HEAD_APPROVAL_REQUIRED;
      approvalReason = `Actual gross margin ${actualGrossMarginPct.toFixed(4)}% is below the ` +
        `${tierMargin.targetMarginPct}% target but at or above the ${tierMargin.minimumMarginPct}% minimum for tier ` +
        `${tierMargin.tier}. Sales Head approval is required.`;
    }
  }

  // ---- §18 GST — one regime, applied once, on the pre-GST selling price ---
  const gstRate = gstResolved.effectiveRatePct;
  const applied = applyGst(gstResolved, sellingBeforeGstExact);
  const gstAmountExact = applied.totalExact;
  // Published figures must add up: base + tax = total, exactly, as printed.
  const sellingPublished = roundMoney(sellingBeforeGstExact);
  const gstPublished = applied.totalPublished;
  const sellingIncludingGstExact = sellingBeforeGstExact + gstAmountExact;

  // ---- §19/§20 EXTRAS — outside the base system, outside the margin -------
  const pricedExtras = [];
  for (const e of [...(extras || [])].sort((a, b) => (a.extraId || '') < (b.extraId || '') ? -1 : 1)) {
    if (FORBIDDEN_EXTRA_TYPES.includes(e.type)) {
      errors.push({ code: PRICING_ERROR.EXTRA_TYPE_FORBIDDEN,
        message: `"${e.type}" cannot be a Flarize extra. The net meter is purchased by the customer ` +
                 'as KSEB requires; it is not a Flarize item and is never marked up. ' +
                 'Record it under customerSideExpenses instead.', detail: e });
      continue;
    }
    if (!e.extraId || !isMoney(e.customerPrice)) {
      errors.push({ code: PRICING_ERROR.EXTRA_INVALID,
        message: `Extra "${e.extraId ?? '(no id)'}" is missing an id or a customer price. Not priced.`, detail: e });
      continue;
    }
    // An extra may carry its own FLAT rate; otherwise it follows the system regime.
    const ownRate = isMoney(e.gstRatePct) ? Number(e.gstRatePct) : null;
    const exGst = Number(e.customerPrice);
    const extraResolved = ownRate == null ? gstResolved
      : { ok: true, regime: GST_REGIME.FLAT, effectiveRatePct: ownRate,
          components: [{ label: 'WHOLE_SUPPLY', valuationPct: 100, ratePct: ownRate }] };
    const extraApplied = applyGst(extraResolved, exGst);
    const rate = extraResolved.effectiveRatePct;
    const g = extraApplied.totalPublished;
    pricedExtras.push(Object.freeze({
      extraId: e.extraId,
      type: e.type || EXTRA_TYPE.OTHER_APPROVED_EXTRA,
      description: e.description ?? null,
      includedInBase: false,                       // always — by construction
      semantic: MONEY_SEMANTIC.CUSTOMER_EXTRA,
      customerPriceExcludingGST: roundMoney(exGst),
      gstRegime: extraResolved.regime,
      gstRatePct: rate,
      gstComponents: Object.freeze(extraApplied.components.map(c => Object.freeze({
        label: c.label, valuationPct: c.valuationPct, ratePct: c.ratePct,
        taxableValue: c.taxableValue, taxAmount: c.taxAmount }))),
      gstAmount: roundMoney(g),
      customerPriceIncludingGST: roundMoney(exGst) + g,
      exactExGst: exGst, exactGst: extraApplied.totalExact, publishedGst: g,
    }));
  }
  const extrasExGstExact = sumExact(pricedExtras.map(e => e.exactExGst));
  const extrasExGstPublished = sumExact(pricedExtras.map(e => e.customerPriceExcludingGST));
  const extrasGstPublished = sumExact(pricedExtras.map(e => e.publishedGst));

  // ---- CUSTOMER-SIDE EXPENSES — reference only, zero Flarize involvement --
  const customerSide = [...(customerSideExpenses || [])]
    .sort((a, b) => (a.expenseId || '') < (b.expenseId || '') ? -1 : 1)
    .filter(x => x.expenseId && isMoney(x.amount))
    .map(x => Object.freeze({
      expenseId: x.expenseId,
      type: x.type || CUSTOMER_SIDE_EXPENSE_TYPE.OTHER_CUSTOMER_PROCURED,
      description: x.description ?? null,
      amount: roundMoney(Number(x.amount)),
      paidBy: 'CUSTOMER',
      flarizeMarkup: 0,
      includedInFlarizePrice: false,
      semantic: MONEY_SEMANTIC.REFERENCE_ONLY,
      note: 'Customer-procured. Not in the Flarize BOM, cost, margin or price. Never marked up.',
    }));

  return Object.freeze({
    status: PRICING_STATUS.COMPLETE,
    error: null,
    errors: Object.freeze(errors),

    costResultId: costResult.bomSnapshotId,
    projectId: costResult.projectId,
    pricingEngineVersion: PRICING_ENGINE_VERSION,
    costEngineVersion: costResult.costEngineVersion,
    marginVersion: tierMargin?.version ?? margin.version ?? null,
    gstVersion: gst.version ?? null,
    pricedAt,

    // ---- base system, pre-GST ---------------------------------------------
    totalActualProjectCost: costResult.totalActualProjectCost ?? costResult.totalActualCost,
    totalActualCost: costResult.totalActualProjectCost ?? costResult.totalActualCost,
    tier: tierMargin?.tier ?? (tier ?? costResult.tier ?? null),
    marginType: MARGIN_TYPE.GROSS_MARGIN,
    targetGrossMargin: mv.value,
    targetMarginPct: tierMargin?.targetMarginPct ?? roundMoney(mv.value * 10000) / 100,
    minimumMarginPct: tierMargin?.minimumMarginPct ?? null,
    marginFormula: 'listSellingPriceBeforeGST = totalActualProjectCost ÷ (1 − targetGrossMargin)',
    listSellingPriceBeforeGST: roundMoney(listBeforeGstExact),
    discount: discountDetail,
    discountAmount: roundMoney(discountAmountExact),
    sellingPriceBeforeGST: roundMoney(sellingBeforeGstExact),
    finalSellingPriceBeforeGST: roundMoney(sellingBeforeGstExact),
    grossProfit: roundMoney(grossProfitExact),
    actualGrossMarginPct: actualGrossMarginPct == null ? null : roundMoney(actualGrossMarginPct * 10000) / 10000,
    achievedGrossMarginPct: actualGrossMarginPct == null ? null : roundMoney(actualGrossMarginPct * 100) / 100,
    approval, approvalReason,

    // ---- GST ---------------------------------------------------------------
    gstRegime: gstResolved.regime,
    gstRatePct: gstRate,
    gstEffectiveRatePct: gstRate,
    gstComponents: Object.freeze(applied.components.map(c => Object.freeze({
      label: c.label, valuationPct: c.valuationPct, ratePct: c.ratePct,
      taxableValue: c.taxableValue, taxAmount: c.taxAmount,
      formula: `${roundMoney(c.taxableExact)} × ${c.ratePct}%`,
    }))),
    gstAppliesTo: gst.appliesTo || 'SELLING_PRICE_BEFORE_GST',
    priceExcludingGST: sellingPublished,
    gstAmount: gstPublished,
    priceIncludingGST: sellingPublished + gstPublished,
    sellingPriceIncludingGST: sellingPublished + gstPublished,

    // ---- extras, separate from the base system ----------------------------
    extras: Object.freeze(pricedExtras),
    extrasExcludingGST: extrasExGstPublished,
    extrasGstAmount: extrasGstPublished,
    extrasIncludingGST: extrasExGstPublished + extrasGstPublished,

    customerTotalIncludingGST:
      sellingPublished + gstPublished + extrasExGstPublished + extrasGstPublished,

    // Displayed alongside, never added into any Flarize total.
    customerSideExpenses: Object.freeze(customerSide),
    customerSideExpensesTotal: sumExact(customerSide.map(x => x.amount)),

    // ---- §15 discount layer ------------------------------------------------
    discountLayer: Object.freeze({
      listSellingPriceBeforeGST: roundMoney(listBeforeGstExact),
      approvedDiscount: discountDetail,
      netSellingPriceBeforeGST: roundMoney(sellingBeforeGstExact),
      actualGrossMarginPct: actualGrossMarginPct == null ? null : roundMoney(actualGrossMarginPct * 10000) / 10000,
      minimumMarginPct: tierMargin?.minimumMarginPct ?? null,
      approval,
      note: 'A discount is applied between the list price and GST. It NEVER modifies the underlying cost, ' +
            'and the actual gross margin is always recomputed after it. The Sales discount UI is a later phase.',
    }),

    // ---- §22 market rate: reference only ----------------------------------
    marketRateReference: marketRate == null ? null : Object.freeze({
      value: marketRate, semantic: MONEY_SEMANTIC.REFERENCE_ONLY,
      usedInCalculation: false,
      varianceVsSellingPrice: roundMoney(Number(marketRate) - sellingBeforeGstExact),
      note: 'Benchmark only. It does not replace TOTAL_ACTUAL_COST and does not replace the Pricing Engine.',
    }),

    exact: Object.freeze({ sellingBeforeGstExact, gstAmountExact, sellingIncludingGstExact }),
  });
}

/** Developer/debug view. */
export function explainPricing(p) {
  if (!p) return '';
  if (p.status === PRICING_STATUS.REJECTED) return `REJECTED ${p.error}: ${p.errors.map(e => e.message).join(' | ')}`;
  return [
    `Total actual project cost  ${p.totalActualProjectCost}`,
    `Tier / target / minimum    ${p.tier ?? '—'} / ${p.targetMarginPct}% / ${p.minimumMarginPct ?? '—'}%`,
    `List price (pre-GST)       ${p.listSellingPriceBeforeGST}   = ${p.totalActualProjectCost} ÷ (1 − ${p.targetGrossMargin})`,
    ...(p.discountAmount ? [`Discount                   −${p.discountAmount}`] : []),
    `Selling price (pre-GST)    ${p.sellingPriceBeforeGST}`,
    `Gross profit               ${p.grossProfit}   (actual margin ${p.actualGrossMarginPct}%)`,
    `Approval                   ${p.approval}${p.approvalReason ? ' — ' + p.approvalReason : ''}`,
    `GST (${p.gstRegime}) @ ${p.gstRatePct}%   ${p.gstAmount}`,
    ...p.gstComponents.map(c =>
      `  ${c.label.padEnd(8)} ${String(c.valuationPct).padStart(3)}% of base @ ${c.ratePct}%   ${c.taxableValue} → ${c.taxAmount}`),
    `Price incl. GST            ${p.priceIncludingGST}`,
    ...(p.extras.length ? ['', ...p.extras.map(e => `Extra ${e.extraId.padEnd(16)} ${e.customerPriceIncludingGST} incl GST  (includedInBase=false)`)] : []),
    `Customer total             ${p.customerTotalIncludingGST}`,
  ].join('\n');
}
