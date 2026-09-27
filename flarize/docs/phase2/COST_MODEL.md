# COST MODEL — ACTUAL PROJECT COST

**Phase 2A final** · `src/lib/costEngine.js` · version `costEngine.2`

---

## The chain

```
PROCUREMENT purchase price
        ↓  (procurement-side logistics, handling, warehousing — entered, not derived)
LANDED COST
        ↓
PROJECT BOM (locked)
        ↓
ACTUAL PROJECT COST          <- this module
        ↓
GROSS MARGIN                 <- Pricing Engine
        ↓
SELLING PRICE BEFORE GST
        ↓
GST
        ↓
CUSTOMER PRICE
```

Procurement cost, project cost, selling price and GST are never mixed. Each
stage has one owner and one module.

---

## The ten heads

| head | owner | formula |
|---|---|---|
| MATERIAL_LANDED | PROCUREMENT | `SUM(quantity × landedUnitCost)` |
| STRUCTURE | PROJECT_HEAD | `roofAddOn + labour + (structureMaterial × repairPct%)` |
| INSTALLATION | PROJECT_HEAD | `rate` (PER_PROJECT) or `rate × sizeKw` (PER_KW) |
| SITE_SURVEY | PROJECT_HEAD | `costPerProject`, within `coverageKm` |
| ENGINEERING_DESIGN | PROJECT_HEAD | `costPerProject`, within `sizeLimitKw` |
| TRANSPORTATION | PROJECT_HEAD | `distanceKm × vehicle.ratePerKm` (one-way) |
| SERVICE_AMC | PROJECT_HEAD | `annualCost × serviceYears`, within `sizeLimitKw` |
| SPECIAL_PROJECT_WORKS | PROJECT_HEAD | `SUM(explicitly added works)` |
| OFFICE_EXPENSE_ALLOCATION | ADMIN | `monthlyOfficeExpense ÷ expectedProjectsPerMonth` |
| MISCELLANEOUS | ADMIN | `DIRECT_PROJECT_COST × miscellaneousPct` |

```
DIRECT_PROJECT_COST        = the nine heads above miscellaneous
TOTAL_ACTUAL_PROJECT_COST  = DIRECT_PROJECT_COST + MISCELLANEOUS
```

Miscellaneous is computed last, from the direct cost only, so there is no
circular dependency and the selling price never feeds back into cost.

---

## Input gate

The BOM must be **LOCKED**, or the engine returns
`COST_NOT_AVAILABLE_UNTIL_BOM_LOCKED` with `totalActualProjectCost: null`.

---

## No silent fallbacks

The engine never substitutes a nearest system size, a nearest rate, a first
available rate, a legacy value or ₹0.

```
LANDED_COST_NOT_CONFIGURED            no landedUnitCost for a BOM component
PRICE_KIND_INVALID                    a component-level selling price was offered
STRUCTURE_RATE_NOT_CONFIGURED         no approved rate for the installation type
INSTALLATION_COST_NOT_CONFIGURED      no EXACT sizeKw + installationType rate
SITE_SURVEY_NOT_CONFIGURED            cost or coverage missing
SITE_SURVEY_OUT_OF_COVERAGE           beyond coverageKm, no approved rate
ENGINEERING_DESIGN_NOT_CONFIGURED     cost or size limit missing
ENGINEERING_DESIGN_OUT_OF_COVERAGE    above sizeLimitKw, no approved rate
TRANSPORT_RATE_NOT_CONFIGURED         no rate for the selected vehicle type
TRANSPORT_DATA_INCOMPLETE             distanceKm not recorded
SERVICE_COST_NOT_CONFIGURED           annualCost or serviceYears missing
SERVICE_OUT_OF_COVERAGE               above sizeLimitKw
SPECIAL_WORK_INVALID                  a work was added with no amount
OFFICE_ALLOCATION_INVALID             expectedProjectsPerMonth <= 0 or missing
MISC_CONFIG_INVALID                   percentage missing or out of range
```

Any of these leaves that head `null` and blocks `TOTAL_ACTUAL_PROJECT_COST`.

---

## Boundaries

`costEngine.js` imports only `money.js`, `bomSnapshot.js` and
`procurementPriceMaster.js`. Tests assert its import list and that
`resolveBattery`, `checkProjectBom`, `setComponent`, `removeRole`,
`validateEngineering`, `marketRate`, `sellingPrice`, `grossMargin` and
`calculatePricing` appear nowhere in its source. It cannot modify a BOM, select
a component, run engineering validation, read a market rate, apply a discount or
mutate a locked snapshot.

---

## Traceability

Every head carries `owner · inputs · formula · amount · source · configVersion ·
status`. Material and special-work heads additionally carry per-line detail. A
text debug view is available via `explainCost(result)`.
