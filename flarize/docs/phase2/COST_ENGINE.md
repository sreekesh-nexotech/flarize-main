# COST ENGINE V1

**Phase 2A** · `src/lib/costEngine.js` · version `costEngine.1`

---

## One question

> What does this project actually cost us?

There is exactly **one** authoritative Cost Engine. Nothing else in the platform
may produce a project cost.

```
LOCKED PROJECT BOM SNAPSHOT ─┐
COMMERCIAL CONFIGURATION ────┼─> COST ENGINE ─> CostResult (9 heads + traces)
PROCUREMENT PRICE MASTER ────┘
```

---

## What it cannot do

The engine must not modify the BOM, choose components, substitute materials,
perform engineering selection, change quantities, or add/remove components.

This is structural, not a convention. `costEngine.js` imports only `money.js`
and `bomSnapshot.js` (for the status constant). A test asserts the strings
`setComponent`, `removeRole`, `setQuantity`, `resolveBattery` and
`checkProjectBom` do not appear in its source, and that running it twice over a
snapshot leaves the snapshot byte-identical.

---

## Input gate (§2)

The BOM must be **LOCKED**.

```
snapshot.status !== LOCKED  ->  COST_NOT_AVAILABLE_UNTIL_BOM_LOCKED
```

A final commercial cost is never computed from an unlocked engineering
configuration. The result carries `totalActualCost: null` — not zero.

---

## Price semantics (§3, §21)

```
PURCHASE_PRICE · SELLING_PRICE · REFERENCE_PRICE · UNKNOWN
VALID_FOR_COST = [PURCHASE_PRICE]
```

Only a purchase price may enter an actual project cost. A selling price, a
reference price, a display price, an old market rate or a nearest catalog price
is **never** substituted.

```
price missing        -> COST_DATA_INCOMPLETE   (line stays null, NOT zero)
wrong price type     -> PRICE_TYPE_INVALID
```

If any material line is unpriced, `materialCost` is `null` and
`totalActualCost` is `null`. A partial cost never silently reads as a whole one.

---

## Material traceability (§4)

Every material line preserves:

```
componentId · componentName · role · quantity
unitPurchasePrice · extendedPurchaseCost
priceSource · priceType · priceVersion · supplier
componentDataVersion · formula   e.g. "13 × 8000"
```

---

## Failure codes

```
COST_NOT_AVAILABLE_UNTIL_BOM_LOCKED   BOM not locked
COST_DATA_INCOMPLETE                  a purchase price is missing
PRICE_TYPE_INVALID                    a non-purchase price was offered
INSTALLATION_RATE_NOT_CONFIGURED      no approved rate for size/roof
STRUCTURE_RATE_NOT_CONFIGURED         no approved add-on for the roof type
SITE_SURVEY_NOT_CONFIGURED            no approved internal survey rate
ENGINEERING_DESIGN_NOT_CONFIGURED     no approved design rate
TRANSPORT_DATA_INCOMPLETE             no distanceKm, or no admin rate
SERVICE_CONFIG_INCOMPLETE             service mode or inputs missing
MISC_CONFIG_INCOMPLETE                type not explicitly FIXED or PERCENTAGE
OFFICE_ALLOCATION_INVALID             expectedProjectsPerMonth <= 0 or missing
```

**No code path converts a missing value into zero.**

---

## Determinism (§26, §31)

- `calculatedAt` is a parameter. A test asserts `Date.now(`, `new Date(` and
  `Math.random(` do not appear in `costEngine.js`, `pricingEngine.js` or `money.js`.
- Material lines are sorted by componentId, so BOM line order cannot change the
  total. A test reverses the lines and asserts an identical total.
- Rounding happens once per published amount; the total is the **rounded sum of
  exact heads**, never a sum of rounded heads.

---

## Debug view (§30)

`explainCost(result)` returns a plain-text table — Cost Head · Amount · Owner ·
Formula · Version · Status. No UI was built in this phase.

```
MATERIAL                       165449  PROCUREMENT   SUM(quantity × purchasePrice)
STRUCTURE                        4000  PROJECT_HEAD  0 + 3000 + (10000 × 10%)
INSTALLATION                    15000  PROJECT_HEAD  15000 (per project)
...
TOTAL_ACTUAL_COST              202849
```
