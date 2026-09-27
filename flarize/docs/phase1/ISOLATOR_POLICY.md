# ISOLATOR POLICY — V1

**Status:** ✅ **APPROVED and IMPLEMENTED** · **Phase:** 1C · **Date:** 2026-08-15
**Decisions:** D11-A, D11-B, D11-C, D11-D

## Approved V1 architecture (D11-C)

```
PV → DCDB → inverter → ACDB → AC isolator → solar meter / grid
```

DCDB and ACDB are **independent BOM assemblies**. The AC isolator is **not** a substitute for either.

**V1 does NOT model a separate DC isolator as an independent BOM line.** `DC_ISOLATOR` is deliberately excluded from the role taxonomy. It was proposed by the software analysis, not by engineering — and was rejected.

## Approved components

| Phase | Component | Tiers | Price | Decision |
|---|---|---|---|---|
| 1P | `is1` Honey Well Isolator 2P 40A | **base, value, premium** | ₹212 | D11-A |
| 3P | `is2` L&T Isolator 40A 4P | **base, value, premium** | ₹623 | D11-B |

**No new isolator was created.** The catalog still holds exactly three isolator records. The change was tier eligibility only.

## Placeholder retirement (D11-D)

`is_9b53be37fab1` "New Isolator" — `status: TEST`, `engineeringStatus: TEST_PLACEHOLDER_DO_NOT_USE`.

- **Retained**, not deleted — historical references must stay intact.
- **Excluded from resolution** by a new engine status filter: a component whose `status` is not `ACTIVE` can never enter `available` or `allAvailable`.
- Any BOM that somehow contained it would be `BLOCKED` by rule `ENG-CMP-001`.

Verified across all 54 captured cells: **zero occurrences**.

## Coverage — before and after

| Phase | Tier | Before | After |
|---|---|---|---|
| 1P | base | `is1` ₹212 | `is1` ₹212 (unchanged) |
| 1P | value | ⚠️ placeholder ₹0 | ✅ `is1` ₹212 |
| 1P | premium | 🔴 `N/A ₹0` | ✅ `is1` ₹212 |
| 3P | base | 🔴 `N/A ₹0` | ✅ `is2` ₹623 |
| 3P | value | `is2` ₹623 | unchanged |
| 3P | premium | `is2` ₹623 | unchanged |

**14 packages unblocked. 15 baseline cells changed** (+₹212 or +₹623 material each).

Six of those cells previously shipped **with no isolation device listed at all** — `ONGRID-{5tp,6,8,10}-3P-BASE` and `HYBRID-{8,10}-3P-BASE`. That was the more serious half of D11.

## Still open

| Item | Status |
|---|---|
| Catalog schema: `poles`, `currentRating`, `voltageRating`, `acDc` | **not added** — no values supplied; would require inventing ratings. Model prepared, fields left `null`/absent. |
| Purchase vs selling price split | **not added** — one `price` field still serves both |
| DC isolation adequacy inside the DCDB | not assessed; D11-C says V1 does not model it separately |
