# BOM LOCK POLICY

**Phase 1E §10–§11** · `src/lib/bomLock.js`

---

## Lock runs a complete validation pass, every time

`attemptLock` never trusts a cached verdict. It calls `checkProjectBom` at the
moment of locking, with the catalog as it stands.

```
BLOCKED  -> REJECTED_BLOCKED          BOM unchanged, still editable
WARNING  -> LOCKED only if every acknowledgement-requiring rule is acknowledged
            otherwise REJECTED_UNACKNOWLEDGED
VALID    -> LOCKED, immutable snapshot created
already locked -> ALREADY_LOCKED      create a revision instead
```

On rejection the returned `bom` is the **same object that went in**. Lock is a
gate, not a repair: it never edits, removes or substitutes anything to make
itself succeed.

---

## Warnings that require acknowledgement

A warning that merely records an unpopulated commercial field does not gate the
lock. A warning that hides an **unverified electrical limit** does:

```
PBC-D-001   inverter DC input window not recorded
PBC-D-003   string length not declared
PBC-F-002   battery voltage unverifiable
PBC-G-002   battery current unverifiable
PBC-N-001   branch / circuit constraints unverifiable
PBC-R-002   approved upgrade path with no explicit BOM (auto-scaled)
```

Each acknowledgement is `{ ruleId, by, at, note }` and is stored **on the
snapshot**. Who accepted an unverified limit, and when, is part of the permanent
record.

---

## What the snapshot preserves

```
componentId · role · quantity
componentDataVersion          (catalog version at lock time)
unitPurchaseCost · unitSellingPrice
engineeringApprovalState      (the verdict at lock time)
selectionMethod · selectedBy · selectionTimestamp
lockedBy · lockedAt · rulesVersion · architecture · packageId
acknowledgements[]
```

The snapshot and every line are `Object.freeze`d. Mutation throws in strict
mode — the immutability is structural, not a convention.

---

## Procurement cannot touch a locked BOM

`applyProcurementPriceChange` on a LOCKED snapshot returns **the same object
reference**, unchanged (Phase 1D, C47). New quotations price through
`priceForNewQuotation`, which reads current catalog prices and never reads a
snapshot. `diffSnapshotAgainstCurrentPrices` reports the drift without applying it.

---

## Revision

A locked BOM changes only by explicit revision: `reviseSnapshot` returns
`{ previous: SUPERSEDED, current: LOCKED }`. History is added to, never
overwritten.
