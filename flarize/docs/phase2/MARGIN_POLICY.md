# MARGIN POLICY — GROSS MARGIN, NOT MARKUP

**Phase 2A §16–§17** · approved decision C60

---

## The formula

```
sellingPriceBeforeGST = totalActualCost ÷ (1 − grossMargin)
```

```
Total actual cost      ₹2,00,000
Target gross margin    20%  (0.20)
Selling price          ₹2,00,000 ÷ 0.80  =  ₹2,50,000
Gross profit           ₹50,000
Achieved gross margin  50,000 ÷ 250,000  =  20%   ✓
```

## The formula that is forbidden

```
cost × (1 + margin)        <-- MARKUP. NOT USED IN V1.
₹2,00,000 × 1.20 = ₹2,40,000
Gross profit 40,000 ÷ 240,000 = 16.7%  — NOT the 20% that was asked for.
```

Markup understates margin on every project. `MARKUP` is in
`FORBIDDEN_MARGIN_TYPES` and passing it returns `MARGIN_TYPE_FORBIDDEN`. A test
asserts the selling price is 250000 and **not** 240000, and a source assertion
checks the `(1 + margin)` form does not appear in `pricingEngine.js`.

---

## Validation (§17)

```
0 <= grossMargin < 1
```

| input | result |
|---|---|
| `0.15`, `0.20`, `0.25` | accepted |
| `0` | accepted — sell at cost |
| `1` (100%) | **rejected** — `1 − 1 = 0`, price undefined. No division by zero. |
| `1.5` (150%) | rejected |
| `-0.1` | rejected |
| `null` / missing | rejected — `MARGIN_NOT_CONFIGURED`. No default is invented. |

The legacy UI carried a user-entered percentage applied as a **markup**
(`src/App.jsx`: `preGstSub × marginPct / 100`). That is exactly the behaviour
being replaced, so no legacy default margin was carried into the new config.
`targetGrossMargin` is `null` until Admin records an approved figure — open item
**P2-F**.

---

## Where margin may NOT be applied

- not to a customer extra (net metering and other extras are priced separately)
- not to GST
- not to any individual cost head
- never by any module other than the Pricing Engine
