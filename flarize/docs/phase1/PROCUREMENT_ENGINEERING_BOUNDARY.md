# PROCUREMENT / ENGINEERING BOUNDARY

**Phase 1D §12–13** · `src/lib/procurementBoundary.js`, `src/lib/bomSnapshot.js`

---

## Field ownership

| Procurement owns | Engineering owns |
|---|---|
| `purchasePrice`, `sellingPrice` | `brand`, `model`, `batteryType`, `chemistry` |
| `supplier`, `supplierReference` | `nominalVoltage`, `minVoltage`, `maxVoltage` |
| `purchaseDate`, `latestPurchasePrice` | `capacityKwh`, `usableCapacityKwh` |
| `availability`, `procurementStatus` | all charge/discharge/peak currents |
| `leadTimeDays`, `datasheetUrl` | `integratedProtection`, `protectionType`, `protectionRating`, `externalProtectionRequired` |
| | `communicationProtocol`, `communicationRequired` |
| | `compatibleInverters`, `compatibleSystemTypes`, `compatiblePhases` |
| | `engineeringStatus`, `tiers`, `phase`, `type` |

`canWriteField(actorRole, field)` and `validateFieldWrite(actorRole, patch)`
enforce it in both directions. Procurement writing `nominalVoltage` is rejected;
Project Head writing `purchasePrice` is rejected. Rejections name the fields and
the reason — they are not silent no-ops.

---

## What a Procurement change may and may not do

`classifyProcurementChange(patch)` returns the effect explicitly so no caller can
conflate commercial and engineering consequences:

```js
{
  changesCost:                 true,   // price fields
  changesEngineeringSelection: false,  // never, for a price-only patch
  changesFutureAvailability:   false,  // procurementStatus / availability
  rewritesLockedProjectBoms:   false,  // NEVER — by construction
}
```

- A **price change** affects the cost of **new** quotations only.
- An **availability change** (INACTIVE / DISCONTINUED) makes a component
  unselectable for **new** projects only.
- Neither may alter engineering compatibility, package selection or BOM
  architecture, and neither rewrites an existing project BOM.

---

## Project BOM snapshot (§13)

`createProjectBomSnapshot` freezes an approved project BOM. Every line stores:

```
componentId · componentDataVersion · role · quantity
unitPurchaseCost · unitSellingPrice
engineeringApprovalState
selectionMethod · selectedBy · selectionTimestamp
```

The snapshot and each line are `Object.freeze`d, so mutation throws in strict
mode rather than succeeding quietly.

```
SNAPSHOT_STATUS = DRAFT | LOCKED | SUPERSEDED
```

`applyProcurementPriceChange(snapshot, updates)` returns a **LOCKED** snapshot
**unchanged — the same object reference**. It does not rebuild it, so there is no
version of the code path in which a locked BOM silently absorbs a new price.

Pricing a new quotation is a different function entirely,
`priceForNewQuotation(lines, catalogPrices)`, which reads current prices and never
reads a snapshot.

`diffSnapshotAgainstCurrentPrices` reports what a price change *would* have done —
locked price, current price, delta — without doing it. That is how Procurement
sees drift without acquiring the power to apply it.

---

## Revision

A locked BOM is only changed by an explicit revision.
`reviseSnapshot(snapshot, changes, { revisedBy, revisedAt })` returns
`{ previous, current }`: the original marked `SUPERSEDED` and a new LOCKED
snapshot. History is added to, never overwritten.

---

## Why the snapshot exists

The project brief's requirement is that later price or configuration changes
"never silently alter historical records". Immutability here is structural — the
objects are frozen and the locked path returns early — rather than a convention
that a future contributor could forget.
