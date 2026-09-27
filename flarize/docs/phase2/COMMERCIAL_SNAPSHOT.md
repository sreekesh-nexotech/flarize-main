# COMMERCIAL SNAPSHOT & VERSIONING

**Phase 2A final** · §19 · `src/lib/commercialSnapshot.js`

---

## Nine pinned versions

```
bomSnapshotId            which engineering configuration
catalogVersion           which catalog
procurementPriceVersion  which purchase prices
landedCostVersion        which landed costs        (carried on the cost result)
costConfigVersion        which rates
marginVersion            which tier margins
gstVersion               which tax configuration
costEngineVersion        which cost code
pricingEngineVersion     which pricing code
moneyRuleVersion         which rounding rule
```

If a number could move, the thing that could move it is named and pinned.

---

## A locked snapshot never changes

Not when Procurement changes a purchase price or a landed cost. Not when Admin
changes the margin, the transport rate, the office expense, the miscellaneous
percentage or the GST configuration. Not when Project Head changes an
installation or service rate.

`createCommercialSnapshot` deep-freezes the whole object; mutation throws.
`applyConfigChange` returns `{ snapshot, mutated: false, effect }` — **the same
object reference**. There is no code path that writes into an issued snapshot.

A snapshot cannot be created from an incomplete cost result or a rejected
pricing result; both throw.

---

## Recalculation for a new quotation

`recalculateForNewQuotation` runs both engines against the **current**
configuration and price master and returns:

```
{ previousSnapshot,          // untouched
  cost, pricing,             // the new calculation
  comparison: {
    totalActualCost:       { before, after, delta },
    sellingPriceBeforeGST: { before, after, delta },
    versionsChanged:       [ … ]
  } }
```

Change is always visible and always attributable, without the historical record
moving.

---

## Supersession

`supersede()` returns a COPY marked `SUPERSEDED`; the original stands. History is
added to, never overwritten — the same rule as the engineering BOM snapshot.
