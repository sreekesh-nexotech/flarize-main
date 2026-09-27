# PRICING ENGINE V1

**Phase 2A** · `src/lib/pricingEngine.js` · version `pricingEngine.1`

---

## One question

> What should we sell it for?

Its only numeric input is `costResult.totalActualCostExact`.

---

## What it cannot do

It must not recalculate engineering, recalculate the BOM, recalculate material
purchase prices, or modify cost assumptions.

Structural: `pricingEngine.js` imports **only** `money.js` and a status constant
from `costEngine.js`. A test enumerates its import statements and fails on
anything else, and asserts `priceMaster`, `purchasePrice`, `calculateCost`,
`snapshot.lines`, `resolveBattery`, `checkProjectBom` and `setComponent` do not
appear in its source.

---

## Pipeline

```
costResult (must be COMPLETE)
   ↓ margin validation           0 <= m < 1, GROSS_MARGIN only
sellingPriceBeforeGST = cost ÷ (1 − m)
   ↓
gstAmount = sellingPriceBeforeGST × gstRate
   ↓
priceIncludingGST
   +  extras (each priced separately, includedInBase = false)
   =  customerTotalIncludingGST
```

An **incomplete** cost cannot be priced — `COST_INCOMPLETE`. Pricing a partial
cost would understate the true cost, so it is rejected rather than approximated.

---

## Net metering and extras (§19, §20)

Extras are customer-facing charges that sit **outside** the base system:

```
NET_METERING · OPTIONAL_ACCESSORY · ADDITIONAL_SERVICE · OTHER_APPROVED_EXTRA
```

Each carries `extraId · type · description · customerPrice · gstRatePct ·
includedInBase: false`. `includedInBase` is `false` by construction — the field
is set by the engine, not by the caller.

An extra does **not** change `sellingPriceBeforeGST`, does **not** change
`grossProfit`, and does **not** move `achievedGrossMarginPct`. A test asserts
all three against an otherwise identical pricing run. Net metering is not a cost
head and is not a BOM line.

---

## Market rate (§22)

`marketRateReference` is recorded with `semantic: REFERENCE_ONLY` and
`usedInCalculation: false`, alongside the variance against the engine's price.

It cannot replace `TOTAL_ACTUAL_COST` and cannot replace the Pricing Engine. A
test replays the Phase 0 loss-making case — market rate ₹2,00,000 against a real
cost of ₹2,24,869 — and asserts the engine still prices at cost ÷ 0.8, above the
market rate. `costEngine.js` contains no reference to `marketRate` at all.

---

## Discount (§23) — not implemented

The result shape reserves the layer so a future Sales discount slots in without
touching cost:

```
preGstListPrice → approvedDiscount → netSellingPriceBeforeGST → GST
```

`approvedDiscount` is `null` in Phase 2A. A discount can never modify the
underlying cost.

---

## Money semantics (§21)

```
PURCHASE_COST · INTERNAL_COST · SELLING_PRICE · CUSTOMER_EXTRA · GST ·
TOTAL_CUSTOMER_PRICE · REFERENCE_ONLY
```

Every published figure carries one of these. Purchase price, market rate,
selling price and customer price are never interchangeable.

---

## Rounding (§26)

One rule, in `money.js`: calculate at full double precision, round **once**,
half-away-from-zero, to whole rupees, at the moment an amount is published.
Intermediate products and sums are never rounded. `MONEY_RULE_VERSION` is pinned
on every commercial snapshot.
