# MARGIN AND DISCOUNT MODEL

**Phase 2A final** · §12–§15 · `src/lib/pricingEngine.js` · version `pricingEngine.2`

---

## Gross margin, never markup

```
listSellingPriceBeforeGST = TOTAL_ACTUAL_PROJECT_COST ÷ (1 − targetGrossMargin)
```

`cost × (1 + margin)` is **forbidden**. `MARKUP` is in `FORBIDDEN_MARGIN_TYPES`
and a source assertion checks the markup form does not appear in the engine.

---

## Margin is per tier

```
BASE    { targetMarginPct, minimumMarginPct }
VALUE   { targetMarginPct, minimumMarginPct }
PREMIUM { targetMarginPct, minimumMarginPct }
```

Constraint, enforced: `0 ≤ minimumMarginPct ≤ targetMarginPct < 100`.

Nothing is hardcoded. An unconfigured tier returns `MARGIN_CONFIG_INVALID`. The
shipped config carries `null` for every tier — the business has not supplied the
percentages (open item **P2-F**), so pricing blocks rather than guessing.

Every change is versioned. A locked quotation keeps the `marginVersion` it was
priced with; new quotations use the current approved configuration.

---

## The pricing pipeline

```
TOTAL_ACTUAL_PROJECT_COST
        ↓ ÷ (1 − targetGrossMargin)
LIST_SELLING_PRICE (pre-GST)
        ↓ − discount
FINAL_SELLING_PRICE (pre-GST)
        ↓
ACTUAL_GROSS_MARGIN = (final − cost) ÷ final
        ↓
MINIMUM_MARGIN_CHECK
        ↓
GST
```

The actual margin is **always** computed after the discount. It is never
reported only as the pre-discount target.

---

## Minimum margin protection — hard gate

```
actualGrossMarginPct <  minimumMarginPct   ->  MARGIN_BELOW_MINIMUM, REJECTED
minimumMarginPct <= actual < targetMarginPct  ->  SALES_HEAD_APPROVAL_REQUIRED
actual >= targetMarginPct                  ->  NONE_REQUIRED
```

A blocked result returns no price at all: `sellingPriceBeforeGST` is `null`.
**Sales cannot bypass this.** No override mechanism exists in V1; if one is ever
required it must be an explicit, authorised, audited workflow — not a flag.

---

## Discount

```
{ amount } or { percentage }, plus requestedBy and reason
```

Validated: not negative, not greater than the list price. A discount **never
modifies the underlying cost** — a test asserts `totalActualProjectCost` is
identical with and without one.

The full Sales discount UI and approval workflow are a later phase. What exists
now is the calculation, the recomputed margin, and the gate.

---

## Result fields

```
listSellingPriceBeforeGST · discount · discountAmount
finalSellingPriceBeforeGST · grossProfit
targetMarginPct · minimumMarginPct · actualGrossMarginPct
approval · approvalReason
```
