# DATA FLOW — APPROVED V1 TARGET ARCHITECTURE

**Owner:** Engineering Lead
**Status:** APPROVED (Phase 0). Implementation begins Phase 1.
**Phase:** 0 (recorded) → 1-6 (implemented)
**Last updated:** 2026-08-15

## The pipeline

```
CATALOG
   ↓
PACKAGE RESOLVER
   ↓
BOM
   ↓
COMPATIBILITY
   ↓
ENGINEERING VALIDATION ──→ BLOCKED  (stop — no quotation, no BOM approval)
   ↓                   ──→ WARNING  (proceed only with recorded exception + approver)
   ↓                   ──→ VALID
COST
   ↓
PRICING
   ↓
SUBSIDY
   ↓
QUOTATION PAYLOAD
   ↓
QUOTATION RENDERER
   ↓
PROJECT BOM
   ↓
PROCUREMENT
```

## The core rule

**Each engine consumes the previous engine's output plus its own configuration. No engine reaches backwards.**

An engine may not query the catalog, re-derive an upstream value, or reach around its input to fetch something it "needs". If it needs a value, that value belongs in its input.

## Binding constraints

| Constraint | Why | Legacy violation being retired |
|---|---|---|
| **No renderer recalculation.** The renderer prints its payload and nothing else. | The quotation must never invent engineering or commercial data. | 18 sites: warranties, meter fallback, quote number via `Math.random()`, subsidy slabs duplicated, "Services Included" hardcoded — `App.jsx:52, 54, 74, 5484, 5631, 2834-2843` |
| **No pricing inside BOM.** | Quantities and components must be decidable without money. | BOM engine currently computes `matTotal`, GST, margin, `grand`, `customerPrice` — all inside `computeForTier` |
| **No margin or GST inside BOM.** | Tax and margin are commercial layers, not engineering. | `App.jsx:1779, 1870, 1875` inside the BOM memo |
| **No `marketRate` override.** Cost + pricing engine is the sole source of price. Market rate is a stored reference figure with a variance flag. | Decision **C3** | `App.jsx:1953` — `marketRate` wins whenever set, discarding the whole cost engine |
| **No procurement price mutation of approved snapshots.** A price change today cannot alter a quotation approved yesterday or a locked project BOM. | Decision **C15**, Build Spec §18-19 | No snapshots exist at all; everything recomputes live from the current catalog |
| **Package component IDs are the authoritative component source.** | Decisions **C4**, **C12** | Seven independent inverter resolution paths; `packageProfiles` read for one field only |

## The single-component-identity rule

**One resolved component ID. Used everywhere. Never re-resolved.**

```
package_components.item_id
        │
        ├──→ BOM line
        ├──→ Technical specification / spec table
        ├──→ Quotation payload  →  Quotation renderer
        ├──→ Project BOM
        └──→ Procurement
```

No consumer may perform its own component lookup. No consumer may fall back to "first suitable item", nearest-kW search, or substring name matching.

**If a package has no approved component for a required role, the result is BLOCKED — never a substitution, never an `N/A ₹0` line.**

This rule exists specifically to eliminate the defect where Admin showed one inverter brand and the material/specification side showed another (Build Spec §2.2, Data Contract §8).

## Engine contracts

| Engine | Consumes | Produces | May NOT touch |
|---|---|---|---|
| **Package Resolver** | systemType, sizeKey, phase, tier | `PackageConfiguration` — components + approved alternates | prices, costs |
| **BOM** | `PackageConfiguration`, `CatalogSnapshot`, site, options | `Bom` — lines with quantity, `treatment`, `customer_visible`, `unit_purchase_price` | margin, GST, selling price |
| **Compatibility** | `Bom`, compatibility rules | `Finding[]` | costs, prices |
| **Engineering Validation** | `Bom`, findings, site, engineering rules | `ValidationResult` — VALID / WARNING / BLOCKED | costs, prices |
| **Cost** | `Bom`, cost settings, site, project works | `CostBreakdown` | margin, GST, discount, subsidy |
| **Pricing** | `CostBreakdown`, commercial settings, discount, extras | `PricingSnapshot` | **the BOM** — it may not change quantities or components |
| **Subsidy** | system configuration, subsidy rules | `SubsidySnapshot` | margin, cost |
| **Savings** | bill/consumption, system size, tariff config | `SavingsSnapshot` | pricing internals |
| **Finance** | `PricingSnapshot`, finance config | `FinanceSnapshot` | cost, BOM |
| **Quotation Payload** | all of the above + CMS content | `QuotationPayload` | **calculates nothing** |
| **Quotation Renderer** | `QuotationPayload` | HTML / PDF | **calculates nothing, imports no engine** |
| **Project BOM** | approved `QuotationVersion` | locked, versioned project BOM | pricing |
| **Procurement** | locked project BOM | purchase orders, price history | engineering identity, approved snapshots |

## Mechanical enforcement

Convention is not enough. These are enforced by the build:

1. **ESLint `no-restricted-imports`** — the renderer package cannot import any engine package. Violation fails the build.
2. **Engines are pure functions with no I/O** — they physically cannot query the catalog or the database.
3. **Golden-file payload tests** — a fixed input set must produce a byte-identical `QuotationPayload`. Any accidental recalculation appears as a diff.
4. **Determinism** — no `Date.now()`, no `Math.random()` inside any engine. Timestamps and identifiers are inputs.
5. **Snapshot immutability test** — change a purchase price, assert an approved quotation renders byte-identically.

## Snapshot boundary

```
DRAFT quotation      → recalculates freely on any change
APPROVED quotation   → IMMUTABLE. Frozen JSONB snapshot.
                       A change creates v2 → recalculate → revalidate → re-approve.
```

`quotation_versions.snapshot` stores the full frozen payload as JSONB, **not** foreign keys to live rows. A quotation approved in August must render identically in December even if the catalog item has since been deleted or repriced. Foreign keys cannot provide that; a frozen payload can.

The same rule applies to `BOM_LOCKED` in the project workflow.

## Related decisions

C1 margin type · C2 GST (⛔ pending CA) · C3 market rate · C4 battery quantity · C5 premium architecture · C8 net metering · C9 service cost · C10 upgrade paths · C12 sales package control · C15 database. See [`DECISION_LOG.md`](./DECISION_LOG.md).
