# PROCUREMENT PRICE MODEL

**Phase 2A final** · `src/lib/procurementPriceMaster.js`

---

## Two values, never merged

```
purchasePrice     what the supplier charges          Procurement + audit
landedUnitCost    what the component costs us once   THE PROJECT COST INPUT
                  it is in our warehouse
```

Neither overwrites the other. Neither is ever overwritten by a customer selling
price. Both are carried on every material cost line, so an auditor can see the
supplier price and the landed cost side by side, with each one's version.

```
purchasePrice · purchasePriceVersion · purchasePriceEffectiveFrom
landedUnitCost · landedCostVersion · landedCostEffectiveFrom
supplier · supplierReference · currency
```

---

## Only landed cost enters project cost

```
VALID_FOR_PROJECT_COST = [LANDED_UNIT_COST]
MATERIAL_LANDED = SUM(quantity × landedUnitCost)
```

If `landedUnitCost` is missing, the purchase price is **not** substituted, even
when it is present. The engine returns `LANDED_COST_NOT_CONFIGURED` and names
the component. A test asserts exactly this: a record with a purchase price and
no landed cost produces `materialLandedCost: null`.

The reason is not pedantry. Supplier price and landed cost differ by inbound
logistics, loading, handling and warehousing. Substituting one for the other
understates every project cost by that difference.

---

## No component-level selling price (§18)

V1 has **one** pricing methodology, at project level. A component-level selling
price is not part of the model; offering one sets a `violation` on the record and
the component becomes unusable for costing. This prevents two competing pricing
systems from producing two different answers for the same project.

---

## Current data state

`data/cost-config.json → procurement.status = NOT_CONFIGURED`.

No landed cost exists for any component yet. The catalog `price` field is a
legacy purchase/display price and is **not** promoted to a landed cost. Until
Procurement records `landedUnitCost` per component, material cost blocks.
Open item **P2-J**.
