# PHASE 2A — COMMERCIAL DECISIONS

Every decision recorded with id, date, owner, decision, reason, affected modules
and version. Nothing here was invented by the engine.

---

## Approved and implemented

| id | date | owner | decision | reason | modules | version |
|---|---|---|---|---|---|---|
| **C60** | 2026-08-15 | Admin | Pricing uses GROSS MARGIN, `cost ÷ (1 − m)`. MARKUP forbidden. | Markup understates margin on every project (20% markup = 16.7% margin). | pricingEngine | pricingEngine.1 |
| **C73** | 2026-08-15 | Admin | GST regime `SOLAR_70_30_COMPOSITE`: 70% goods @5% + 30% service @18%. Effective 8.9% is an OUTPUT. | Statutory treatment of a composite solar supply; both components must be invoice-reportable. | pricingEngine, cost-config | gst@2026-08-15.2 |
| **C74** | 2026-08-15 | Procurement/Admin | Procurement owns `purchasePrice` and `landedUnitCost`. **No component-level selling price.** | One pricing methodology, at project level. Two would give two answers for one project. | procurementPriceMaster | costEngine.2 |
| **C75** | 2026-08-15 | Project Head | Installation requires an EXACT sizeKw + installationType match. The per-kW legacy fallback is REMOVED. | Pricing a 4 kW install at the 3 kW rate understates cost silently on every off-matrix project. | costEngine, cost-config | install@2026-08-15.2 |
| **C76** | 2026-08-15 | Project Head | Project transportation is `distanceKm × vehicle.ratePerKm`, ONE-WAY, warehouse→site only. No universal per-km rate; legacy 35, 40 and the 100 km free allowance are rejected. | Inbound logistics already sit inside landed cost; charging them again double-counts. A universal rate cannot represent a pickup and a lorry. | costEngine, cost-config | transport (unconfigured) |
| **C77** | 2026-08-15 | Project Head | Site survey ₹500 per project, coverage 100 km. Coverage is an ELIGIBILITY rule, not a multiplier. No transportation added to the survey. Beyond 100 km blocks. | Supplied business rule. | costEngine, cost-config | survey@2026-08-15.1 |
| **C78** | 2026-08-15 | Project Head | Engineering/design ₹500 per project, ≤20 kW, ALL-INCLUSIVE (engineer cost, engineer travel, design work, site report). Never per kW. Above 20 kW blocks. | Supplied business rule. | costEngine, cost-config | engdesign@2026-08-15.1 |
| **C79** | 2026-08-15 | Project Head | Service/AMC model = `annualCost × serviceYears`, ≤10 kW. Not by visit count. | Supplied business rule. Values not supplied — see P2-N. | costEngine, cost-config | service@2026-08-15.2 |
| **C80** | 2026-08-15 | Project Head | Special project works are explicit, per project, each its own visible line. Never automatic, never inside miscellaneous, no invented rate. | Hidden site costs are the classic source of margin leakage. | costEngine | costEngine.2 |
| **C81** | 2026-08-15 | Admin | Miscellaneous = **1%** of DIRECT_PROJECT_COST before miscellaneous. Labelled CONFIGURED MISCELLANEOUS ALLOWANCE. Admin may set 0%. | An explicit cost allowance, not hidden margin. Computed on direct cost, so no circular dependency with the selling price. | costEngine, cost-config | misc@2026-08-15.2 |
| **C82** | 2026-08-15 | Admin | Target and minimum gross margin are per tier (BASE / VALUE / PREMIUM), versioned, constrained `0 ≤ min ≤ target < 100`. | Tiers have different commercial profiles. | pricingEngine, cost-config | margin@2026-08-15.1 |
| **C83** | 2026-08-15 | Admin | **Minimum-margin protection is a hard gate.** Actual margin below minimum → `MARGIN_BELOW_MINIMUM`, quotation BLOCKED, no price issued. Sales cannot bypass. Below target but above minimum → Sales Head approval required. | The Phase 0 audit found live configurations quoted below cost. | pricingEngine | pricingEngine.2 |
| **C84** | 2026-08-15 | Admin | Discount is a layer between list price and GST. It never modifies cost, and the actual margin is always recomputed after it. | A margin reported only before discount is not a margin. | pricingEngine | pricingEngine.2 |
| **C85** | 2026-08-15 | Admin | Published figures that a customer sees side by side are composed from ROUNDED parts, so goods GST + service GST = total GST and base + GST = total, to the rupee. Exact values retained for audit. | A printed invoice that does not add up is a defect. Found during implementation. | money, pricingEngine | money.1 |
| **C86** | 2026-08-15 | Admin | Net metering stays a CUSTOMER_EXTRA, outside project cost, base selling price, base gross profit and base gross margin. Net-meter price master DEFERRED. | No TP/SP/brand logic is invented. | pricingEngine, cost-config | deferred |

---

## Open — the phase is BLOCKED on these

| id | owner | question | blocking |
|---|---|---|---|
| **P2-J** | Procurement | `landedUnitCost` per component. The catalog `price` is a legacy purchase/display price and was not promoted. | MATERIAL_LANDED, and therefore every total |
| **P2-M** | Project Head | Vehicle types and per-km rates. None supplied; legacy 35/40 rejected. | TRANSPORTATION |
| **P2-N** | Project Head | `annualCost` and `serviceYears` for the approved service model. Legacy 2000×5 recorded UNCONFIRMED, not promoted. | SERVICE_AMC |
| **P2-F** | Admin | `targetMarginPct` and `minimumMarginPct` per tier. | all pricing |
| **P2-K** | Project Head | Site-survey treatment beyond 100 km. | projects > 100 km |
| **P2-L** | Project Head | Engineering/design rate above 20 kW. | projects > 20 kW |
| **P2-H** | Project Head | Confirm the installation matrix is PER_PROJECT (evidenced in code, not yet confirmed by the business). | correctness of INSTALLATION |
| **P2-I** | Admin | Net-metering customer price and its tax treatment. | net-metering extras |

---

## Source conflicts found and NOT silently resolved

| conflict | resolution |
|---|---|
| `transportConfig.costPerKm = 35` vs `costs.transportRate = 40` | Neither applied. Rates are per vehicle type (C76). |
| `transportConfig.baseDistanceKm = 100` free allowance | Not part of the approved formula. Recorded as rejected. |
| `costs.office = 5500` legacy fallback when expected volume ≤ 0 | Not applied — `OFFICE_ALLOCATION_INVALID` instead. A silent fallback hides a misconfiguration. |
| `costs.installRate = 3000/kW` legacy per-kW fallback | Removed (C75). |
| `costs.miscellaneous = 1000` fixed | Superseded by the 1% allowance (C81). |
| `costs.serviceRateYear = 2000`, `serviceYears = 5` | Recorded UNCONFIRMED, not promoted (P2-N). |

---

## 2026-08-16 — final round

| id | date | owner | decision | reason | modules | version |
|---|---|---|---|---|---|---|
| **C88** | 2026-08-16 | Project Head | **Site survey beyond 100 km**: `500 + (km − 100) × 3`. The ₹500 is ALL-INCLUSIVE (engineer cost, travel, visit, report); no second engineer travel is ever added. The 100 km threshold is an approved rule and is never silently changed. The ₹3/km excess rate is rate-card configurable. | Closes P2-K. 130 km → 500 + 30×3 = 590. | costEngine, rate card, cost-config | survey@2026-08-16.1 |
| **C89** | 2026-08-16 | Project Head | **Service values**: costPerVisit ₹1,000 × visitsPerYear 2 × serviceYears 5 = ₹10,000, ≤10 kW. Breakdown handling INCLUDED — no separate breakdown head. ₹2,000/year retained as explanatory metadata only. | Closes P2-N and resolves the C9 ambiguity: ₹2,000 was the ANNUAL figure. | costEngine, cost-config | service@2026-08-16.1 |
| **C90** | 2026-08-16 | Admin | **Net meter is NOT a Flarize item.** The customer buys it as KSEB requires. Excluded from BOM, material/landed cost, project cost, margin and selling price. `NET_METERING` removed from `EXTRA_TYPE`; offering it returns `EXTRA_TYPE_FORBIDDEN`. May be shown as a `CUSTOMER_SIDE_EXPENSE` with `flarizeMarkup: 0`, never in any Flarize total. | Supersedes the earlier CUSTOMER_EXTRA treatment. The deferred net-meter price master is moot — Flarize does not sell it. | pricingEngine, cost-config | pricingEngine.3 |
| **C91** | 2026-08-16 | Project Head | **Project Head Rate Card**: one versioned, audited home for installation, transport, survey, engineering, service and special-work rates. **No commercial rate lives in the Cost Engine** — a test asserts the literals 15000, 500, 1000 and 3000 do not appear in it. | Rates must change without code changes, with history. | projectRateCard, costEngine | RC / costEngine.3 |
| **C92** | 2026-08-16 | All | **Commercial configuration history is append-only.** Every change records versionId, changedBy, changedAt, changeReason, effectiveFrom, previousVersionId and status (ACTIVE / SUPERSEDED / ARCHIVED). No update path, no delete path — a test asserts `updateVersion`, `deleteVersion` and `splice(` are absent from the module. `getHistory` / `getCurrentVersion` / `getVersion` / `getVersionEffectiveAt` / `compareVersions` / `historyView` supplied for a future UI. | An unexplained price change is an audit failure. | commercialHistory | history.1 |
| **C93** | 2026-08-16 | Admin | **Eleven versions pinned** on every commercial snapshot, adding `landedCostVersion` and `projectRateCardVersion`. | A locked quotation must be reproducible field by field. | commercialSnapshot | — |

### Status of every commercial rule

| rule | status |
|---|---|
| Landed cost drives material cost | APPROVED · **UNCONFIGURED** (no landed costs entered) |
| Installation exact-match, unit from record | APPROVED · CONFIGURABLE |
| Transport one-way × vehicle rate | APPROVED · **UNCONFIGURED** (no vehicle rates) |
| Site survey ₹500 / 100 km / ₹3 excess | **APPROVED · CONFIGURED** |
| Engineering ₹500 ≤20 kW | **APPROVED · CONFIGURED** |
| Engineering >20 kW | APPROVED mechanism · **UNCONFIGURED** |
| Service ₹1,000 × 2 × 5 | **APPROVED · CONFIGURED** |
| Special works explicit | APPROVED · no predefined rates |
| Office allocation | **APPROVED · CONFIGURED** |
| Miscellaneous 1% | **APPROVED · CONFIGURED** |
| Tier margins | APPROVED mechanism · **UNCONFIGURED** |
| Minimum-margin hard gate | **APPROVED · IMPLEMENTED** |
| GST 70/30 composite | **APPROVED · CONFIGURED** |
| Net meter excluded | **APPROVED · IMPLEMENTED** |
| Net-meter price master | **SUPERSEDED** (not a Flarize item) |

---

## 2026-08-16 — blockers closed

| id | date | owner | decision | reason | modules | version |
|---|---|---|---|---|---|---|
| **C95** | 2026-08-16 | Procurement | **P2-J CLOSED.** Landed cost = purchase price + allocated procurement delivery + explicitly entered procurement charges. Delivery is allocated across a batch by **PURCHASE-VALUE PROPORTION**, supplier→warehouse only. Weight, volume, quantity and equal-split are forbidden. Allocations reconcile exactly and are fully auditable. | A batch charge must land on the materials it moved, in proportion to what they cost. Any other basis is a guess with a systematic bias. | procurementBatch, cost-config | procurement@2026-08-16.1 |
| **C96** | 2026-08-16 | Project Head | **P2-M CLOSED STRUCTURALLY.** Warehouse→site, ONE WAY, `distanceKm × vehicle.ratePerKm`, vehicles and rates on the versioned rate card. Legacy ₹35, ₹40 and the 100 km free allowance are rejected. **Rates NOT configured** — the head blocks. | Rates change; a hardcoded rate does not. | projectRateCard, costEngine | — |
| **C97** | 2026-08-16 | Admin | **P2-F CLOSED STRUCTURALLY.** Per-tier target and minimum margin, versioned, constraint `0 ≤ min ≤ target < 100`, gross margin only, gate enforced after discount. **Percentages NOT configured** — pricing blocks. | The mechanism is a policy decision; the numbers are a commercial one. | pricingEngine, cost-config | margin@2026-08-15.1 |
| **C98** | 2026-08-16 | Project Head | **P2-L CLOSED STRUCTURALLY.** ≤20 kW = ₹500 all-inclusive. >20 kW resolves the rate-card band `>20kW` with its own unit; ₹500 is never extrapolated and never per-kW unless a band declares PER_KW. **>20 kW rate NOT configured** — costing blocks. | A large-system engineering cost is not a straight-line extension of a small one. | costEngine, projectRateCard | engdesign@2026-08-16.1 |

### DECISION CLOSED vs VALUE NOT YET CONFIGURED

| item | decision | value |
|---|---|---|
| Landed-cost allocation method | **CLOSED** | no batch entered |
| Vehicle rates | **CLOSED** | none supplied |
| Tier margins | **CLOSED** | none supplied |
| Engineering >20 kW | **CLOSED** | none supplied |
| Site survey ≤/>100 km | **CLOSED** | **CONFIGURED** (₹500 / ₹3) |
| Service | **CLOSED** | **CONFIGURED** (₹1,000 × 2 × 5) |
| Net meter | **CLOSED** | excluded — not a Flarize item |

An unconfigured value is never rendered as ₹0. Every one returns a named status
and blocks the total.
