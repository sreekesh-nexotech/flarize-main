# PRICE SNAPSHOT & VERSIONING

**Phase 2A §27–§28** · `src/lib/commercialSnapshot.js`

---

## The guarantee

A quotation issued today reads the same tomorrow after Procurement changes a
purchase price, Admin changes the margin, the office expense or the GST rate, or
Project Head changes an installation rate.

A configuration change never mutates an issued snapshot. It produces a **new
calculation** with a new version chain.

---

## What is pinned

```
bomSnapshotId            which engineering configuration
catalogVersion           which catalog
procurementPriceVersion  which purchase prices
costConfigVersion        which rates
marginVersion            which margin
gstVersion               which tax configuration
costEngineVersion        which cost code
pricingEngineVersion     which pricing code
moneyRuleVersion         which rounding rule
```

Nine references. If any number could move, the thing that moved it is named.

The snapshot also stores every cost head, the full calculation traces, the
margin, the GST and the extras — so a historical quotation can be re-explained
line by line without re-running anything.

---

## Immutability

`createCommercialSnapshot` deep-freezes the whole object. Mutation throws in
strict mode. `applyConfigChange(snapshot, …)` returns
`{ snapshot, mutated: false, effect }` — **the same object reference**, plus a
description of what the change would imply. There is no code path that writes
into an issued snapshot.

A snapshot cannot be created from an incomplete cost result or a rejected
pricing result; both throw.

---

## Recalculation path (§28)

`recalculateForNewQuotation` runs both engines against the **current**
configuration and price master and returns:

```
{ previousSnapshot,        // untouched
  cost, pricing,           // the new calculation
  comparison: {
    totalActualCost:       { before, after, delta },
    sellingPriceBeforeGST: { before, after, delta },
    versionsChanged:       ['procurementPriceVersion', …]
  } }
```

The change is therefore always *visible* and always *attributable* — you can see
which version moved and by how much, without the old record changing.

---

## Supersession

`supersede(snapshot, …)` returns a COPY marked `SUPERSEDED`. The original stands.
History is added to, never overwritten — the same rule as the engineering BOM
snapshot in Phase 1D.
