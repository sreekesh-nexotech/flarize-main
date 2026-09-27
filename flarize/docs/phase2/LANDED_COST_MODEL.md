# LANDED COST MODEL

**Phase 2A · decision P2-J CLOSED** · `src/lib/procurementBatch.js`

---

## Build-up

```
landedUnitCost = purchaseUnitPrice
               + allocatedProcurementDelivery / quantity
               + otherProcurementCharges / quantity
```

Procurement-side costs that may go in: inbound material delivery, loading,
unloading, handling, warehouse-related procurement cost, and any other charge
Procurement explicitly enters.

---

## The approved allocation: PURCHASE-VALUE PROPORTION

A delivery charge usually covers several materials. It is split by each
material's share of the batch **purchase value**:

```
share_i           = purchaseValue_i / totalPurchaseValue
allocatedDelivery = deliveryCost × share_i
```

Worked, from the approved example:

| material | purchase value | share | allocated |
|---|---|---|---|
| A | ₹70,000 | 70% | ₹3,500 |
| B | ₹20,000 | 20% | ₹1,000 |
| C | ₹10,000 | 10% | ₹500 |
| **total** | **₹1,00,000** | **100%** | **₹5,000** |

**Not by weight. Not by volume. Not by quantity. Not an equal split.** All four
are in `FORBIDDEN_ALLOCATION_METHODS` and are rejected with
`ALLOCATION_METHOD_INVALID`; so is any unrecognised method. No other formula is
invented.

### Reconciliation

Allocated amounts are distributed by largest remainder so they sum **exactly**
to the delivery charge. A batch that allocates ₹4,999 of a ₹5,000 charge is a
bug, and `allocation.reconciled` asserts it did not happen.

---

## Never project transportation

| | scope | lives in |
|---|---|---|
| procurement delivery | supplier → warehouse | **allocated into `landedUnitCost`** |
| project transportation | warehouse → customer site | **TRANSPORTATION cost head** |

Passing a `projectTransportCost` into a batch returns
`PROJECT_TRANSPORT_NOT_ALLOWED`. The module contains no reference to
`ratePerKm`, `vehicleType` or `distanceKm` — asserted by test.

---

## Auditability

Every allocation records:

```
procurementBatchId · deliveryCost · allocationMethod · scope
totalPurchaseValue · allocatedTotal · reconciled
sourceMaterials[] : componentId · purchaseValue · allocationPct · allocatedAmount
recordedBy · recordedAt · effectiveFrom · versionId
```

Each resulting line carries its own formula — `7000 + (3500 + 0) / 10` — and
`landedCostSource: 'PROCUREMENT_BATCH_ALLOCATION'`. `toPriceMasterEntries()`
carries the build-up through to the Cost Engine, where purchase price and landed
cost remain separately visible on every material line.

---

## Status

**DECISION CLOSED · VALUES NOT YET CONFIGURED.** No procurement batch has been
entered, so no component has a landed cost and material cost blocks with
`LANDED_COST_NOT_CONFIGURED`. That is a *missing value*, not a zero.
