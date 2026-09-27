# COST HEADS — EVERY FORMULA

**Phase 2A** · nine heads, always separately visible, never collapsed.

| | head | owner | formula |
|---|---|---|---|
| A | MATERIAL | PROCUREMENT | `SUM(quantity × purchasePrice)` |
| B | STRUCTURE | PROJECT_HEAD | `roofAddOn + labour + (structureMaterial × repairPct%)` |
| C | INSTALLATION | PROJECT_HEAD | `rate` (PER_PROJECT) or `rate × sizeKw` (PER_KW) |
| D | SITE_SURVEY | PROJECT_HEAD | approved internal rate, or `0` if `siteSurveyIncluded === false` |
| E | ENGINEERING_DESIGN | PROJECT_HEAD | approved internal rate |
| F | TRANSPORTATION | ADMIN | `max(0, distanceKm − freeDistanceKm) × ratePerKm` |
| G | SERVICE_AMC | PROJECT_HEAD | `costPerYear × serviceYears` (PER_YEAR) or `servicesPerYear × serviceYears × costPerService` (PER_SERVICE) |
| H | MISCELLANEOUS | ADMIN | `amount` (FIXED) or `base × percentage%` (PERCENTAGE, both explicit) |
| I | OFFICE_EXPENSE_ALLOCATION | ADMIN | `monthlyOfficeExpense ÷ expectedProjectsPerMonth` |

```
TOTAL_ACTUAL_COST = A + B + C + D + E + F + G + H + I
```

Every head is present in the result even when it cannot be computed — as `null`
with a status code. Nothing is hidden and nothing is folded into another head.

---

## A. MATERIAL

Quantities are authoritative from the **locked BOM**. Prices are authoritative
from the **Procurement price master**. Only `PURCHASE_PRICE` is admissible.

## B. STRUCTURE

Kept separate from INSTALLATION by instruction. Flat-roof structure *material*
is already emitted as BOM lines, so it is counted under MATERIAL; this head
carries the roof-condition add-on, fabrication labour and the repair allowance.

```
FLAT      add-on 0      (material is in the BOM)
SHEET     add-on 3000   catalog.costs.sheetStructureRate
ELEVATED  add-on 5000   catalog.costs.elevatedStructureRate
labour    3000          catalog.costs.structureLabor
repair    10%           catalog.costs.structureRepairPct, on structure material
```

## C. INSTALLATION

Matrix by `sizeKey × roofType`. **The unit is never assumed** — each rate record
must declare `PER_KW` or `PER_PROJECT` explicitly, or the head fails.

The source establishes `PER_PROJECT`: `src/App.jsx:2113` uses the matrix value
directly without multiplying by kW, and 3 kW flat = 15000 while 10 kW flat =
42000, which is not a common per-kW rate.

`catalog.costs.installRate = 3000/kW` exists as a legacy per-kW fallback. The
Cost Engine does **not** apply it silently — a matrix miss is
`INSTALLATION_RATE_NOT_CONFIGURED` unless the caller opts in explicitly.

## D. SITE_SURVEY

Not configured anywhere in the source, so it is `null`, not `0`.
`siteSurveyIncluded === false` gives an explicit `0`. The internal survey cost
and any customer-facing survey charge are separate concepts and never merged.

## E. ENGINEERING_DESIGN

Not configured in the source. `null`, never silently zero, never folded into
INSTALLATION. An explicit approved rate of `0` is accepted and recorded as such.

## F. TRANSPORTATION

`distanceKm` is a **project input**. It is never derived automatically in V1.
Missing distance → `TRANSPORT_DATA_INCOMPLETE`, unless transportation is
explicitly configured as not applicable.

The source contains **two** transport rates: `transportConfig.costPerKm = 35`
(used by the engine) and `costs.transportRate = 40` (never read). The engine
uses 35 and reports the conflict. Which is authoritative is open item **P2-C**.

## G. SERVICE_AMC

The source records `serviceRateYear × serviceYears` only, so the configured mode
is `PER_YEAR`. The brief's `servicesPerYear × serviceYears × costPerService`
form is supported as `PER_SERVICE` but is **not configured**, because
`servicesPerYear` does not exist in the source and is not inferred (open item
**P2-D**). Internal service cost is never merged with a customer-facing AMC price.

## H. MISCELLANEOUS

`FIXED 1000` from the source. `PERCENTAGE` requires an explicit percentage **and**
an explicit approved base (`MATERIAL` or `TOTAL_DIRECT_COST`). There is no
assumed percentage rule and no hidden percentage.

## I. OFFICE_EXPENSE_ALLOCATION

```
150000 ÷ 10 = 15000 per project
```

Allocated on the **ADMIN-defined expected volume**, never on actual completed
projects. `expectedProjectsPerMonth <= 0` → `OFFICE_ALLOCATION_INVALID`. The
legacy fallback to `costs.office = 5500` is **not** applied — a silent fallback
would hide a misconfiguration (open item **P2-E**).
