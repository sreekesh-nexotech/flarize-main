# Next-Gate Trace — Three-Tier Snapshot + Template Slot Contract + Language Architecture (Read-Only)

**Date:** 2026-09-04
**Scope:** READ-ONLY. No code changed. No production file modified. No approved HTML modified. No template edits. No Page 4.
**Tracks:** (A) three-tier orchestration architecture · (B) approved template slot contract Pages 1–12 · (C) language architecture (English active, Malayalam prepared, not implemented).

**Headline discovery:** the three-tier snapshot already has a **native surface** in the existing quotation workspace — `q.alternativeOptions` + `buildAlternativePayloads` + `payload.alternatives[]`. Nothing in `quotationPayload.js` or `quotationWorkspace.js` needs to change. `quotationLanguage` also already flows through `payload.quotation.value.quotationLanguage`. **Language architecture is already in place — only the renderer needs to consume it.**

---

## Track A · Three-tier orchestration trace

### 1. Three-tier orchestration trace (existing pipeline, unchanged)

Full existing chain per `src/lib/salesOrchestrator.js` (595 lines) — 14 numbered steps, all currently produce ONE tier per quotation:

| Step | Function | File:line | Reads | Writes | Per-tier? |
|--:|---|---|---|---|:-:|
|  1 | validate input + assert QUOTATION_CREATE cap | salesOrchestrator.js:73, 153 | input + actor + rbac | — | shared |
|  2 | `findApprovedPackage({systemType,size,phase,tier})` | salesOrchestrator.js:86 | `env.packageRegistry.packages[]` — 48 packages, keyed by (systemType,size,phase,tier ∈ base/value/premium) | — | **per-tier** |
|  3 | `assertPackageSelectableByActor` (via `packageApproval`) | salesOrchestrator.js:43 (import) | approvalStatus | — | per-tier |
|  4 | `W.createProject` | salesOrchestrator.js:211 | actor | `workspaceStore.projects[projectId]` | shared |
|  5 | `W.setProjectConfiguration` | salesOrchestrator.js:218 | — | project.{sysType,sizeKw,phase,tier,architecture} | per-tier (tier written here) |
|  6 | `W.selectPackage` → materialise BOM | salesOrchestrator.js:229 | package + env.catalog | project.bom | **per-tier BOM** |
|  7 | `W.editBomComponent` — inject default structure | salesOrchestrator.js:245 | catalog.categories.structure_material | project.bom | per-tier |
|  8 | `W.setCostInputs` | salesOrchestrator.js:287 | input.roofType/distanceKm/vehicleType | project.costInputs | shared |
|  9 | `W.runChecker` — engineering validation (33 rules) | salesOrchestrator.js:294 | project.bom + env | checkerResult (findings) | per-tier |
| 10 | `W.lockBom` → `bomSnapshot` | salesOrchestrator.js:312 | bom + engineering acks | project.lock (deep-frozen snapshot) | **per-tier bomSnapshot** |
| 11 | `calculateCost` (Cost Engine, 10 heads) | salesOrchestrator.js:325 | project.lock, env.costConfig, env.priceMaster, env.rateCard | costResult | **per-tier costResult** |
| 12 | `calculatePricing` (Pricing Engine, gross margin only) | salesOrchestrator.js:358 | costResult, margin, gst, tier, discount | pricingResult | **per-tier pricingResult** |
| 13 | `findApplicableOffer` — READ-only offer selection | salesOrchestrator.js:388 | `options.offers[]` filter by tier | — | per-tier (filter tests tier equality) |
| 14 | `createCommercialSnapshot({snapshotId, costResult, pricingResult, offer})` | commercialSnapshot.js:93 | costResult + pricingResult + offer | commercialSnapshot (deep-frozen, 13 pinned versions) | **per-tier commercialSnapshot** |
| 15 | `Q.registerBomSnapshot` | quotationWorkspace.js:135 | — | `quotationStore.bomSnapshots.set(snapshotId, snapshot)` | idempotent Map insert per tier |
| 16 | `Q.registerCommercialSnapshot` | quotationWorkspace.js:152 | — | `quotationStore.commercialSnapshots.set(...)` | idempotent Map insert per tier |
| 17 | `Q.createDraft({quotationId, projectId, customer, system, engineering, quotationNumber, ..., bomSnapshotId, commercialSnapshotId, subsidyTreatment, alternativeOptions?})` | quotationWorkspace.js:261 | — | `quotationStore.quotations.set(quotationId, record)` | **ONE quotation for all tiers** |
| 18 | `Q.issueQuotation` — deep-frozen document + gate | quotationWorkspace.js:829 | store + engines + configs | `documents[].push(document)`, `versionStatus.set`, `q.status = ISSUED` | **ONE issued document per quotation** |
| 18a | inside issue: `buildAlternativePayloads(store, q, version, ...)` | quotationWorkspace.js:677 | `q.alternativeOptions[].{bomSnapshotId, commercialSnapshotId, tier, system}` + engines | `document.payload.alternatives[]` (one entry per option) | **per-alternative full payload** |
| 19 | server writes quotation counter | server-sales.js:277 | data/quotation-counter.json | counter++ | **ONE increment** |

**Everything already exists.** The only two facts that matter for three-tier:

- **Steps 2, 6, 10, 11, 12, 14 vary per tier.** Steps 1, 4, 5, 8, 17, 18, 19 are shared.
- **`quotationStore.bomSnapshots`, `commercialSnapshots`** are keyed-by-id Maps: adding 2 extra tier snapshots is 2 additional idempotent inserts, not 2 additional quotations.

### 2. Side-effect analysis — no state duplication

| Concern | Answer | Evidence |
|---|---|---|
| Three quotation numbers? | **No — one.** `Q.createDraft` sets `q.quotationNumber` once; `server-sales.js:277` increments the counter once per `POST /api/sales/quotation-number`. | quotationWorkspace.js:261, server-sales.js:277 |
| Three customer records? | **No — one.** `data/customers.json` keyed by phone; `Q.createDraft` sets `q.customer` once. | quotationWorkspace.js:280 (`for (const f of DRAFT_FIELDS) if (input[f] !== undefined) record[f] = input[f]`) |
| Three quotation histories? | **No — one.** `listVersions(store, actor, quotationId)` reads `store.documents.get(quotationId)` — a single array per quotationId. | quotationWorkspace.js:941 |
| Three audit records? | **No — one issuance, one audit.** `q.issuedBy`, `q.issuedAt` set once at issueQuotation; document written once; `commercialHistory` appends per commercialSnapshot (that IS 3 entries, correctly — three real cost/price snapshots existed). | quotationWorkspace.js:900-903 |
| Duplicated offer state? | **No.** `findApplicableOffer` is a pure filter over `options.offers[]`. No mutation. Each tier's `commercialSnapshot` pins its own offer + calculated `offerAmount`. Offer master unchanged. | offerLifecycle.js:332 |
| Inconsistent snapshot identities? | **No.** Each tier gets a unique `bomSnapshotId = SNAP-{sysType}_{size}_{tier}_{ts}` and `commercialSnapshotId = CS-{same}`. Deterministic. Deep-frozen. Registered by id in Maps. No collision. | salesOrchestrator.js:101-109 |
| Engineering validation duplicated? | **Correctly per-tier.** Different BOM ⇒ different check result ⇒ different acks. Each tier gets its own VALID/WARNING outcome and independent lock. This is a feature, not duplication. | salesOrchestrator.js:294-321 |
| Engines duplicated? | **No.** Same `calculateCost`, `calculatePricing`, `createCommercialSnapshot` called 3× with different inputs. Reused verbatim. | salesOrchestrator.js:325, 358, 402 |
| CMS pinning duplicated? | **No.** `snapshotCmsPageVersions(cmsStore)` called once per issueQuotation. All 3 tier alternatives share the same CMS versions. Correct — the quotation is the unit of CMS pinning. | quotationWorkspace.js:882 |
| Subsidy/savings/finance duplicated? | **Correctly per-alternative.** `buildAlternativePayloads` re-runs `resolveSubsidyResult` / `resolveSavingsResult` / `resolveFinanceResult` for each option, each using that option's `commercialSnapshot`. Same subsidy amount (size is constant) but different `postSubsidyInvestment` and `monthlyEMI` per tier. | quotationWorkspace.js:711-716 |

**Conclusion: zero duplication.** The alternatives mechanism was designed exactly for this.

### 3. Proposed snapshot structure

**Nothing new in the payload.** The alternatives mechanism already emits:

```
document.payload = {
  quotation:      { value: { quotationNumber, quotationLanguage, ...} },
  customer:       {...},
  system:         { value: { systemType, systemSizeKw, packageTier (= recommended), phase, ... } },
  pricing:        { value: {...single primary-tier snapshot...} },        // Smart / value
  financing:      { value: {...} },
  savings:        { value: {...} },
  subsidy:        { value: {...} },
  campaign:       { value: {...} },
  company:        { value: {...} },
  energyProfile:  { value: {...} },
  ...
  alternatives: [
    { optionIndex: 0, tier: 'base',    bomSnapshotId: 'SNAP-...-base-...',    commercialSnapshotId: 'CS-...-base-...',    payload: { ...full alternative payload... } },
    { optionIndex: 1, tier: 'premium', bomSnapshotId: 'SNAP-...-premium-...', commercialSnapshotId: 'CS-...-premium-...', payload: { ...full alternative payload... } },
  ]
}
```

**Convention (recommended, not required):** the primary (top-level) payload is always the **recommended tier** (`value` / Smart, per `data/tier-display-names.json` `recommendedTier: 'value'`). `alternatives[]` carries the OTHER two tiers. This keeps single-tier consumers unchanged: `payload.pricing.value.customerTotalIncludingGST` continues to be the Smart price; renderer's `smartCost` mustache reads it verbatim.

**Renderer contract for tier mustaches** (approved template already uses these token names — no template change needed for this step):

| Mustache | Reads |
|---|---|
| `smartCost`      | `payload.pricing.value.customerTotalIncludingGST` |
| `eliteCost`      | `payload.alternatives.find(a => a.tier === 'premium').payload.pricing.value.customerTotalIncludingGST` |
| `essentialCost`  | `payload.alternatives.find(a => a.tier === 'base').payload.pricing.value.customerTotalIncludingGST` |
| `smartDown`      | `payload.financing.value.downPaymentAmount` |
| `eliteDown`      | `payload.alternatives.find(a => a.tier === 'premium').payload.financing.value.downPaymentAmount` |
| `essentialDown`  | `payload.alternatives.find(a => a.tier === 'base').payload.financing.value.downPaymentAmount` |
| `smartFin`       | `payload.financing.value.postSubsidyInvestment` |
| `eliteFin`       | `payload.alternatives.find(a => a.tier === 'premium').payload.financing.value.postSubsidyInvestment` |
| `essentialFin`   | `payload.alternatives.find(a => a.tier === 'base').payload.financing.value.postSubsidyInvestment` |
| `smartEmiValue`  | `payload.financing.value.monthlyEMI` |
| `eliteEmiValue`  | `payload.alternatives.find(a => a.tier === 'premium').payload.financing.value.monthlyEMI` |
| `essentialEmiValue` | `payload.alternatives.find(a => a.tier === 'base').payload.financing.value.monthlyEMI` |
| `smartDaily`     | `payload.savings.value.monthlySavings ÷ 30` |
| `eliteDaily`     | `payload.alternatives.find(a => a.tier === 'premium').payload.savings.value.monthlySavings ÷ 30` |
| `essentialDaily` | `payload.alternatives.find(a => a.tier === 'base').payload.savings.value.monthlySavings ÷ 30` |
| `subsidyAmt`     | `payload.subsidy.value.subsidyAmount` (constant across tiers for a given size) |
| `smartSubsidyMinus` | same, negative-formatted |
| `savingsRange`   | `payload.savings.value.{monthlySavingsLow, monthlySavingsHigh}` |
| `emiLabel` / `emiOn` / `emiValue` / `dailyValue` / `downLabel` | `payload.financing.value.*` (already implemented) |

Renderer change scope: replace the `tryTier(payload, tier, field, section)` helper in `src/lib/approvedTemplate.js` (NEW file — not protected) to read `payload.alternatives.find(a => a.tier === tierKey).payload.<section>.value.<field>`. Old renderer untouched.

### 4. Existing functions reused (no reimplementation)

Every function below is called by the new `orchestrateThreeTiers` verbatim — no rewrite, no wrapper that changes behavior:

- `salesOrchestrator.orchestrateQuotation` — for the recommended (Smart / value) tier. Runs the full 14-step pipeline + `Q.createDraft` + `Q.issueQuotation`.
- `salesOrchestrator.findApprovedPackage` (private — needs export)
- `salesOrchestrator.generateIds` (private — needs export)
- `projectWorkspace.{createProject, setProjectConfiguration, selectPackage, editBomComponent, setCostInputs, runChecker, lockBom, viewBom}`
- `costEngine.calculateCost`
- `pricingEngine.calculatePricing`
- `offerLifecycle.{findApplicableOffer, calculateOfferAmount}`
- `commercialSnapshot.createCommercialSnapshot`
- `quotationWorkspace.{registerBomSnapshot, registerCommercialSnapshot, setQuotationFields}`
- `rbac.{assertCan, CAPABILITY.QUOTATION_CREATE, isIndividualSalesRole}`
- All engines under the hood: `subsidyEngine`, `savingsEngine`, `financeEngine`, `energyEngine`, `engineeringChecker`

Zero new business logic. Zero new formula. Zero new invented value.

### 5. Files that would need modification

**One file, one small export set:**

- **`src/lib/salesOrchestrator.js`** — add new exported function `orchestrateThreeTiers(workspaceStore, quotationStore, env, input, actor, options)`. Uses existing steps 1–14 for tier #1 (recommended = `input.tier ?? 'value'`); then for the OTHER two tiers runs steps 2, 5–7, 8–14 (BOM + cost + pricing + commercial snapshot), skips 17–18 (draft/issue), collects `{tier, bomSnapshotId, commercialSnapshotId, system}` per tier, passes them as `alternativeOptions` to `Q.createDraft`, then issues once. Export the two private helpers (`findApprovedPackage`, `generateIds`) or duplicate as small inline functions — same 8-line contents. **Net add: ~120 lines. Zero edits to existing exports.**

**One file, one small internal helper update:**

- **`src/lib/approvedTemplate.js`** (NEW file — not protected). Replace `tryTier(payload, tier, field, section)` stub with real reader that walks `payload.alternatives[]`. **Net change: ~15 lines. Old renderer file untouched.**

Optional configuration surface (data-only, existing edit path):

- **`data/tier-display-names.json`** — activate P1-1 from `IMPLEMENTATION_PLAN_v2` (`base → "Essential System"`, `value → "Smart System"`, `premium → "Elite System"`, `recommendedTier: 'value'`, `recommendedBadge: "Recommended · Most Popular"`). Data file. No code change.

### 6. Protected files potentially affected

**None.**

| Protected file | Change required? | Reason |
|---|:-:|---|
| `src/lib/quotationPayload.js` (D6-approved pass-through only) | **No** | `payload.alternatives[]` and `payload.quotation.value.quotationLanguage` already flow. |
| `src/lib/quotationWorkspace.js` | **No** | `alternativeOptions` is a first-class DRAFT_FIELD (line 220), `buildAlternativePayloads` already builds full per-tier payloads (line 677). |
| `src/lib/costEngine.js` | **No** | Called per-tier with per-BOM input, produces per-tier costResult. Already correct. |
| `src/lib/pricingEngine.js` | **No** | Called per-tier with per-costResult input. Tier param already carried. |
| `src/lib/subsidyEngine.js` | **No** | Called by `resolveSubsidyResult` per-alternative in `buildAlternativePayloads`. |
| `src/lib/financeEngine.js` | **No** | Called per-alternative with per-commercialSnapshot input. |
| `src/lib/savingsEngine.js` | **No** | Called per-alternative with per-commercialSnapshot input. |
| `src/lib/commercialSnapshot.js` | **No** | Called per-tier from orchestrator. |
| `src/lib/engineeringChecker.js` | **No** | Called per-tier via `W.runChecker`. |
| `src/lib/offerLifecycle.js` | **No** | `findApplicableOffer` READ-only; per-tier filter already correct. |
| `src/lib/bomSnapshot.js` | **No** | Snapshot created per-tier by `W.lockBom`. |
| `src/lib/bomLock.js` | **No** | Same. |
| `src/lib/projectBom.js` / `projectWorkspace.js` | **No** | Existing per-project functions called per-tier. |
| `src/lib/upgradeAssessment.js` / `upgradeReviewWorkspace.js` | **No** | Not on the tier path. |
| `src/lib/batteryCompatibility.js` | **No** | Not on the tier path. |
| `server.js` | **No** | Route unchanged for the read-only orchestrator; only new POST `/api/sales/quotation/three-tier` would be added in server-sales.js (non-protected). |
| `public/lib/quotationDocument.js` (old renderer) | **No** | Untouched. |
| `public/workspace.html` | **No** | Untouched. |
| `data/packages.proposed.json` | **No** to schema; data-side prerequisite: Engineering must APPROVE all three tier packages per (systemType, size, phase). Already tracked as P0-9. |

### `orchestrateThreeTiers` — proposed signature (read-only, no implementation)

```
/**
 * Run BOM + cost + pricing + commercial snapshot 3× (base / value / premium),
 * pin all three snapshots into ONE quotation, issue once. Delegates entirely
 * to existing functions. No invented value. No engine rewrite.
 *
 * @param {object} input — { customer, systemType, size, phase?, roofType?, distanceKm?, ...,
 *                            recommendedTier?='value', tierSelections?: { base:{}, value:{}, premium:{} } }
 * @returns { primary: <orchestrateQuotation full result>,
 *            alternatives: [ { tier, bomSnapshotId, commercialSnapshotId } × 2 ] }
 * @throws  OrchestrationError with per-tier detail if any tier fails
 */
export function orchestrateThreeTiers(workspaceStore, quotationStore, env, input, actor, options = {}) { ... }
```

Per-tier failure policy: if any of the 3 tier packages is not APPROVED, throw `NO_APPROVED_PACKAGE` with `{ blockedTier }`. All-or-nothing — never ship a two-tier quotation.

---

## Track B · Approved template slot contract, Pages 1–12

**Instruction to designer:** the approved artwork is the visual golden. Do NOT redesign. This spec adds `{{mustache}}` and `<image-slot>` and repeating-table binding markers into the existing DOM. Every added slot must sit inside the existing composition; no visual layout change.

Naming: mustaches use `camelCase`. Image slots use `kebab-case` ids. Repeating tables use `<template-row for="collectionPath">…</template-row>` (approved-DOM extension parallel to `<image-slot>`; runtime clones the row per collection entry).

For each page: **existing dynamic slots** (already in template) · **new mustaches** · **new image-slots** · **new repeat blocks** · **data source** · **formatter** · classification tags (**C**ustomer / **B**usiness/commercial / **T**echnical/BOM / **L**egal/company / **O**ffer/campaign).

### Page 1 — Cover + Proposal Details

Existing: none. Currently a single baked JPEG `9f438ce4-…`.

New mustaches (24):

| Token | Data source | Formatter | Tags |
|---|---|---|---|
| `salutationFirstName`     | `payload.customer.value.firstName`                | passthrough  | C |
| `customerFullName`        | `payload.customer.value.fullName`                 | passthrough  | C |
| `customerAddressLine1`    | `payload.customer.value.address.line1`            | passthrough  | C |
| `customerAddressLine2`    | `payload.customer.value.address.line2`            | passthrough  | C |
| `customerPincode`         | `payload.customer.value.address.pincode`          | passthrough  | C |
| `customerPhone`           | `payload.customer.value.phone`                    | passthrough  | C |
| `customerCurrentBillAmount`   | `payload.customer.value.currentBill.amount`   | inrRupees    | C · B |
| `customerCurrentBillCycle`    | `payload.customer.value.currentBill.cycle`    | `monthly`/`bi-monthly` | C |
| `systemSize`              | `payload.system.value.systemSizeKw`               | `N kW`       | T |
| `quotationNumber`         | `payload.quotation.value.quotationNumber`         | passthrough  | B · L |
| `proposalBy`              | `payload.quotation.value.proposalBy`              | passthrough  | B |
| `quotationDate`           | `payload.quotation.value.quotationDate`           | `DD/MM/YYYY` | B |
| `validUntil`              | `payload.quotation.value.validUntil`              | `DD/MM/YYYY` | B |
| `companyGstNumber`        | `payload.company.value.gstNumber`                 | passthrough  | L |
| `companyRegistrationNumber` | `payload.company.value.registrationNumber`      | passthrough  | L |
| `companyLegalName`        | `payload.company.value.legalName`                 | passthrough  | L |
| `companyAddress`          | `payload.company.value.address`                   | passthrough  | L |
| `companyWebsite`          | `payload.company.value.website`                   | passthrough  | L |
| `companyEmail`            | `payload.company.value.email`                     | passthrough  | L |
| `companyPhone`            | `payload.company.value.phone`                     | passthrough  | L |
| `subsidyHeadlineAmount`   | `payload.subsidy.value.subsidyAmount`             | `₹N` (short) | B |
| `subsidyProgramName`      | `payload.subsidy.value.programName`               | passthrough  | B |
| `homesInstalledCount`     | `payload.company.value.homesInstalledCount`       | `N+` int     | L |
| `mnreEmpanelledLabel`     | `payload.company.value.mnreEmpanelled ? 'MNRE Empanelled' : ''` | boolean-to-string | L |

New image-slots (2):

| id | default asset | override path | Tags |
|---|---|---|---|
| `issuer-signature` | manifest UUID (default handwritten Team Flarize) | `payload.company.value.signatureImageUri` | L |
| `issuer-seal`      | manifest UUID (default company seal)           | `payload.company.value.sealImageUri`      | L |

New repeat blocks: none.

### Page 2 — Onam / Festival Offer

Existing: 4 image-slots (`ofr-scooter`, `ben-ac1`, `ben-ac2`, `ben-ac3`).

New mustaches (9):

| Token | Data source | Formatter | Tags |
|---|---|---|---|
| `campaignHeadline`         | `payload.campaign.value.headline`                                    | passthrough | O |
| `campaignSubheadline`      | `payload.campaign.value.subheadline`                                 | passthrough | O |
| `campaignPrimaryBenefitAmount` | `payload.campaign.value.primaryBenefit.amount`                   | inrRupees   | O · B |
| `campaignPeriodFrom`       | `payload.campaign.value.period.from`                                 | `DD MMMM`   | O |
| `campaignPeriodTo`         | `payload.campaign.value.period.to`                                   | `DD MMMM`   | O |
| `campaignSlotCount`        | `payload.campaign.value.urgency.slotCount`                           | int         | O |
| `campaignLuckyDrawPrize`   | `payload.campaign.value.luckyDraw.prize`                             | passthrough | O |
| `campaignBenefitAcLabel`   | `payload.campaign.value.offers[0].label`                             | passthrough | O |
| `campaignBenefitHybridLabel` | `payload.campaign.value.offers[1].label`                           | passthrough | O |
| `campaignReferralLabel`    | `payload.campaign.value.referral.label`                              | passthrough | O |
| `companyWebsite`           | `payload.company.value.website` (shared)                             | passthrough | L |
| `companyPhone`             | `payload.company.value.phone` (shared)                               | passthrough | L |

New image-slots: none beyond existing 4.

New repeat blocks: **none** (campaign has fixed 3 benefit slots; already handled by 3 image-slots + 3 mustache labels).

### Page 3 — Generation & Appliance Usage

Existing: none. Currently one baked JPEG.

New mustaches (5):

| Token | Data source | Formatter | Tags |
|---|---|---|---|
| `dailyGenerationRange`     | `payload.energyProfile.value.{dailyGenerationLow, dailyGenerationHigh}` | `L–H units` | T · C |
| `monthlyKsebValueRange`    | `payload.energyProfile.value.{monthlyKsebValueLow, monthlyKsebValueHigh}` | `₹L–H`     | B · C |
| `homeUsesUnitsPerDay`      | `payload.energyProfile.value.homeUsesUnitsPerDay`                    | `~N`         | C |
| `surplusExportedRange`     | `payload.energyProfile.value.{surplusExportedLow, surplusExportedHigh}` | `L–H`      | C |
| `totalDailyUsage`          | `payload.energyProfile.value.totalDailyUsage`                        | `N units`    | C |

New image-slots: none.

New repeat blocks (1) — appliance table:

```
<template-row for="payload.applianceUsage.value.items">
  <tr>
    <td>{{ appliance.icon }}</td>
    <td>{{ appliance.name }}</td>
    <td>{{ appliance.quantity }}</td>
    <td>{{ appliance.hoursPerDay }} hrs</td>
    <td>{{ appliance.unitsPerDay }} units</td>
  </tr>
</template-row>
```

Data source: `payload.applianceUsage.value.items[]` — currently exists as a section in `quotationPayload.js` but is empty in production (per prior forensic). Populating this requires the ENERGY_LOAD_CALCULATION_ENGINE (not yet built). Until that ships, Page 3 remains blocked as-is.

### Page 4 — Why Choose Flarize

Existing: 8 approved `<img>` (marketing photography), 0 mustaches.

New mustaches (3, optional — only if business wants live stats):

| Token | Data source | Formatter | Tags |
|---|---|---|---|
| `statHomesInstalled`  | `payload.company.value.homesInstalledCount`  | `N+`      | L |
| `statYearsInBusiness` | `payload.company.value.yearsInBusiness`      | `N+ Years` | L |
| `statProjectsCount`   | `payload.company.value.projectsCount`        | `N+`      | L |

**Recommendation: leave as-is.** Marketing copy is acceptable static for this page.

New image-slots: none. New repeat blocks: none.

### Page 5 — Three Options

Existing: 24 mustaches (tier pricing + finance + savings), 2 `<img>` (logo + separator).

New mustaches (6):

| Token | Data source | Formatter | Tags |
|---|---|---|---|
| `systemCapacityLabel`      | `payload.system.value.systemSizeKw`     | `N kW`       | T |
| `eliteTierHeadline`        | `payload.alternatives.find(t=premium).payload.system.value.packageHeadline` | passthrough | T |
| `smartTierHeadline`        | `payload.system.value.packageHeadline`  | passthrough  | T |
| `essentialTierHeadline`    | `payload.alternatives.find(t=base).payload.system.value.packageHeadline` | passthrough | T |
| `subsidyAmountInCopy`      | `payload.subsidy.value.subsidyAmount`   | inrRupees    | B |
| `subsidyProgramName`       | `payload.subsidy.value.programName`     | passthrough  | B |

New image-slots: none.

New repeat blocks (2) — install-timeline + warranty-years feature rows:

```
<template-row for="payload.system.value.tierFeatures">
  <tr>
    <td>{{ feature.name }}</td>
    <td>{{ feature.eliteValue }}</td>
    <td>{{ feature.smartValue }}</td>
    <td>{{ feature.essentialValue }}</td>
  </tr>
</template-row>
```

Data source: NEW payload section `payload.system.value.tierFeatures[]` — small addition to `data/quotation-inclusions.json` (already exists as inclusion matrix) + `resolveInputs` in `quotationWorkspace.js`. Additive, no engine change. If not wired, Page 5 renders installation timelines / warranties / feature comparison as approved static artwork (acceptable when the marketing values are stable).

### Page 6 — Homeowners Around You

Existing: none. Currently one baked JPEG.

New mustaches (4):

| Token | Data source | Formatter | Tags |
|---|---|---|---|
| `localityCityAndPincode`  | `payload.customer.value.address.{city, pincode}`               | `city (pincode)` | C |
| `localityHomesInstalledCount` | `payload.company.value.localityStats[pincode].count`      | `N`          | C · L |
| `districtHomesInstalledCount` | `payload.company.value.districtStats[district].count`     | `N`          | C · L |
| `districtStatsYear`       | `payload.company.value.districtStats[district].year`           | int          | L |

New image-slots: none.

New repeat blocks (1) — testimonial cards (3):

```
<template-row for="payload.testimonials.value.items" limit="3">
  <div class="testimonial-card">
    <img src="{{ testimonial.photoUri }}">
    <h4>{{ testimonial.name }} — {{ testimonial.locality }}</h4>
    <p>{{ testimonial.systemSizeKw }} kW · Installed {{ testimonial.installedMonth }}</p>
    <blockquote>{{ testimonial.quote }}</blockquote>
    <p>{{ testimonial.beforeBill }} → {{ testimonial.afterBill }} · Saves {{ testimonial.monthlySavings }}/mo</p>
  </div>
</template-row>
```

Data source: NEW `payload.testimonials.value.items[]` — needs new `TESTIMONIAL_STORE` or CMS section. Not in scope of current engines. Until built, testimonials remain baked marketing (or Page 6 blocks).

### Page 7 — Technical Specifications

Existing: 13 mustaches (tier prices + subsidy + finance), 1 `<img>` (logo).

New mustaches (0 — the tier price mustaches already exist).

New image-slots: none.

New repeat block (1) — the hardware spec-sheet grid:

```
<template-row for="payload.bomSnapshotByTier.rows">
  <tr>
    <td>{{ row.specLabel }}</td>
    <td>{{ row.eliteValue }}</td>
    <td>{{ row.smartValue }}</td>
    <td>{{ row.essentialValue }}</td>
  </tr>
</template-row>
```

Data source: NEW `payload.bomSnapshotByTier.rows[]` — computed by NEW `resolveBomSpecSheet(bomSnapshot, alternatives)` in `quotationWorkspace.js`. Reads `bomSnapshot.components` for each tier and emits rows: `Panel Brand & Power`, `Module Power (W) and Type`, `Panel Warranty`, `Inverter Brand & Warranty`, `Mounting Structure`, `Modules per Inverter`, `DC Cable (mm)`, `AC Cable (sqmm)`, `Earthing Wire`. Pure copy from bomSnapshot fields already frozen in each tier's snapshot. **This is the correction for `PAGE_7_BAKED_HARDWARE_SPECS`.**

Also new: `PAGE_7_FOOTER_INCONSISTENT_C7` — footer must bind to `payload.company.value.*` like every other page. Current baked footer shows `goldenray.in` — C7 must resolve before Page 7 can ship.

### Page 8 — Your Savings Over Time

Existing: none. Currently one baked JPEG.

New mustaches (12):

| Token | Data source | Formatter | Tags |
|---|---|---|---|
| `paybackMonths`               | `payload.savings.value.returnPeriodMonths`  | `N months` | B |
| `currentMonthlyBill`          | `payload.customer.value.currentBill.amount / (cycle=='bi-monthly'?2:1)` | inrRupees | C · B |
| `withSolarMonthlyBillRange`   | `payload.savings.value.{postSolarBillLow, postSolarBillHigh}` | `₹L–H/month` | B |
| `lifetimeKsebPaid25Years`     | `payload.savings.value.lifetimeCostWithoutSolar25yr` | `₹N lakh` | B |
| `lifetimeSaved25Years`        | `payload.savings.value.lifetime25yrSavings` | `₹N lakh` | B |
| `tariffEscalationPct`         | `payload.savings.value.assumptions.tariffEscalationPct` | `N% yearly` | B |
| `bankName`                    | `payload.company.value.bank.name`           | passthrough | L |
| `bankAccountName`             | `payload.company.value.bank.accountName`    | passthrough | L |
| `bankAccountNumber`           | `payload.company.value.bank.accountNumber`  | passthrough | L |
| `bankIfsc`                    | `payload.company.value.bank.ifsc`           | passthrough | L |
| `bankBranch`                  | `payload.company.value.bank.branch`         | passthrough | L |
| `upiId`                       | `payload.company.value.bank.upiId`          | passthrough | L |
| `additionalStructureRatePerKw` | `payload.system.value.additionalStructureRatePerKw` | `₹N/kw` | B |

New image-slots (1):

| id | default | override | Tags |
|---|---|---|---|
| `payment-qr` | manifest UUID (default UPI QR) | `payload.company.value.bank.upiQrImageUri` | L |

New repeat block (1) — 25-year cumulative-cost chart series:

```
<template-row for="payload.savings.value.yearlySeries" limit="25">
  <chart-point year="{{ item.year }}" withoutSolar="{{ item.cumulativeWithoutSolar }}" withSolar="{{ item.cumulativeWithSolar }}" />
</template-row>
```

Data source: NEW `payload.savings.value.yearlySeries[]` — small addition to `savingsEngine.js` output OR runtime-derived from `monthlySavings` + `tariffEscalationPct`. Not an engine rewrite — just a series projection.

Additionally the "Required Documents" 8-item list is fully static approved copy.

### Page 9 — Booking to Savings

Existing: none. Currently one baked JPEG.

New mustaches (3):

| Token | Data source | Formatter | Tags |
|---|---|---|---|
| `bookingFeeAmount`        | `payload.system.value.bookingFeeAmount`   | `₹N` | B |
| `ksebRefundPerKw`         | `payload.subsidy.value.ksebRefundPerKw`   | `₹N per kW + 18% tax` | B |
| `ksebRefundForSystemSize` | `payload.subsidy.value.ksebRefundAmountForSize` (derived: refundPerKw × systemSize + tax) | `Xkw – Rs N` | B · T |

New image-slots: none. New repeat blocks: none (the 6 timeline stages are static approved copy; day counts are marketing copy per PHASE0_SYSTEM_AUDIT).

### Page 10 — Terms & Conditions (clauses 1–9)

Existing: none.

New mustaches: **footer only.**

| Token | Data source | Formatter | Tags |
|---|---|---|---|
| `companyAddress`  | `payload.company.value.address` | passthrough | L |
| `companyWebsite`  | `payload.company.value.website` | passthrough | L |
| `companyEmail`    | `payload.company.value.email`   | passthrough | L |
| `companyPhone`    | `payload.company.value.phone`   | passthrough | L |

Body copy (clauses 1–9) stays static approved text. If clauses need edits, that is a template revision — not a renderer concern.

### Page 11 — Terms & Conditions (clauses 10–19)

Same as Page 10 — footer only.

### Page 12 — Investment Summary

Existing: 10 mustaches, 1 `<img class="pg">` background.

New mustaches (3):

| Token | Data source | Formatter | Tags |
|---|---|---|---|
| `systemCapacityLabel`       | `payload.system.value.systemSizeKw`             | `N kW` | T |
| `recommendedTierLabel`      | `payload.system.value.packageDisplayName`       | passthrough | T |
| `lifetime25yrNetSavings`    | `payload.savings.value.lifetime25yrNetSavings`  | `₹N+ lakh` | B |

New image-slots: none. New repeat blocks: none.

### Slot contract summary

| Page | Existing slots | New mustaches | New image-slots | New repeat blocks | Ships without | Requires |
|--:|--:|--:|--:|--:|---|---|
|  1 | 0 | 24 | 2 | 0 | ❌ | full template rewrite of Page 1 |
|  2 | 4 slots | 9 | 0 | 0 | ⚠️ | +9 mustaches |
|  3 | 0 | 5 | 0 | 1 | ❌ | full rewrite + ENERGY_LOAD_CALCULATION_ENGINE for repeat |
|  4 | 0 | 0-3 | 0 | 0 | ✅ | none (optional stats mustaches) |
|  5 | 24 | 6 | 0 | 1 | ⚠️ | +6 mustaches + `tierFeatures` payload extension |
|  6 | 0 | 4 | 0 | 1 | ❌ | full rewrite + testimonial store |
|  7 | 13 | 0 | 0 | 1 | ❌ | `bomSnapshotByTier` payload extension + C7 |
|  8 | 0 | 12-13 | 1 | 1 | ❌ | full rewrite + `savings.value.yearlySeries` + `company.value.bank.*` |
|  9 | 0 | 3 | 0 | 0 | ⚠️ | +3 mustaches + subsidy engine gains `ksebRefundPerKw` |
| 10 | 0 | 4 (footer only) | 0 | 0 | ✅ (static clauses acceptable) | +4 footer mustaches when C7 clears |
| 11 | 0 | 4 (footer only) | 0 | 0 | ✅ | same |
| 12 | 10 | 3 | 0 | 0 | ⚠️ | +3 mustaches |

**Totals for full-dynamic template**: 78-83 mustaches (currently 47), 3 image-slots (currently 4 — no removals), 5 repeat blocks (currently 0).

---

## Track C · Language architecture

**Field already exists.**

- `q.quotationLanguage` — DRAFT_FIELDS entry at `quotationWorkspace.js:220`.
- `payload.quotation.value.quotationLanguage` — emitted at `quotationPayload.js:607`.
- No engine reads it. No engine will need to (business logic is language-independent — money is numbers, formatters print numbers into strings).

**Recommendation:**

1. **Values**: `'en'` (default) · `'ml'`. Any other value is `LANGUAGE_UNSUPPORTED`.
2. **Renderer chooses template by language:** `approvedTemplate.loader.js` gains a `language` arg (default `'en'`) → resolves to the appropriate vendored bundle: `assets/approved-template/Flarize_Solar_Quotation.<lang>.v<n>.html`. Meta file per language + version pins its own hashes.
3. **Renderer chooses mustache formatters by language:** `FORMATTERS` grows a language-aware layer (English digits vs Malayalam numerals, comma grouping vs Indic grouping, date format, currency symbol placement). Formatters are pure functions — no engine.
4. **Business fields never translate.** Only presentation strings (mustache OUTPUT) do. Never rewrite `payload.*` on language change.
5. **Same snapshot serves both languages.** Two renders of the same ISSUED document with different `quotationLanguage` produce two PDFs from the same immutable payload — proving reproducibility.
6. **Malayalam not implemented in this phase.** Only the English bundle is vendored. Requesting `quotationLanguage = 'ml'` throws `LANGUAGE_NOT_YET_AVAILABLE` in the loader; server surface allows the field but rejects issuance until the Malayalam bundle ships.
7. **No translation strings in renderer.** Renderer never embeds ANY user-visible copy. Every string comes from the vendored approved template's own HTML (which is language-specific) or from the payload (which is language-neutral — numbers + names + dates as raw values).

Additive change surface for language:
- `src/lib/approvedTemplate.loader.js` — 1-arg addition (`language`), 1-file-path resolver update, per-language meta file. ~15 lines.
- `src/lib/approvedTemplate.js` — accept `payload.quotation.value.quotationLanguage`, pass to loader. ~5 lines.
- `assets/approved-template/` — future `Flarize_Solar_Quotation.ml.v1.html` + `.meta.json` (not this phase).
- **No engine change.**

---

## Production blockers

Ordered by architectural priority:

1. **`TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT`** — cleared by `orchestrateThreeTiers` in `salesOrchestrator.js` + `tryTier` update in `approvedTemplate.js`. **Zero engine change. Zero protected-file change.**
2. **`PAGE_1_BAKED_CUSTOMER_DATA`** — requires Page 1 template revision: 24 mustaches + 2 image-slots (§Track B, Page 1). Cannot ship customer PDFs until cleared.
3. **`C7_COMPANY_IDENTITY_UNRESOLVED`** — every page's footer + Page 1 legal + Page 7 different footer + Page 8 bank block all block until company profile is authoritative. Business/legal decision.
4. **`PAGE_2_CAMPAIGN_MISMATCH`** — Page 2 template revision: 9 mustaches to bind campaign snapshot to DOM. Until cleared, guard by refusing when active campaign ≠ baked Onam.
5. **`PAGE_3_DYNAMIC_DATA_NOT_SUPPORTED_BY_TEMPLATE`** — Page 3 template revision + ENERGY_LOAD_CALCULATION_ENGINE (5 mustaches + 1 repeat block).
6. **`PAGE_6_BAKED_TESTIMONIALS`** — Page 6 template revision + testimonial store.
7. **`PAGE_7_BAKED_HARDWARE_SPECS`** — Page 7 template revision + `bomSnapshotByTier` payload extension. Blocks whenever BOM differs from baked spec sheet.
8. **`PAGE_8_BAKED_FINANCIALS_AND_BANK`** — Page 8 template revision + `savings.value.yearlySeries` + `company.value.bank.*`.
9. **`PAGE_9_BAKED_KSEB_REFUND_5KW`** — Page 9 template revision + subsidy engine gains `ksebRefundPerKw`.
10. **`PAGE_5_BAKED_TIER_COPY`** — Page 5 6 mustaches + `tierFeatures` payload extension.
11. **`PAGE_12_BAKED_CAPACITY_AND_LIFETIME_SAVINGS`** — Page 12 3 mustaches + `savings.value.lifetime25yrNetSavings`.
12. **`C6_TIER_DISPLAY_NAMES_NOT_ACTIVATED`** — activate `data/tier-display-names.json`.
13. **`LANGUAGE_NOT_YET_AVAILABLE (ml)`** — Malayalam bundle not vendored. Only affects Malayalam issuance. English unaffected.

---

## Exact implementation order (proposal — not started)

Each step is independently reviewable, independently rollback-able. Each ends with a commit + a working test suite pass.

**Step 1 — Tier orchestration (renderer + orchestrator).**
- `src/lib/salesOrchestrator.js` — add `orchestrateThreeTiers` + export `findApprovedPackage` and `generateIds`. Additive. No existing export changes.
- `src/lib/approvedTemplate.js` — update `tryTier` helper to read from `payload.alternatives[]` shape. New file, not protected.
- Tests: `tests/approved-template/three-tier.test.mjs` — mock a 3-tier package registry + procurement prices, run `orchestrateThreeTiers`, assert single quotationNumber, single customer, 3 bomSnapshots, 3 commercialSnapshots, `document.payload.alternatives.length === 2`, all 15 tier mustaches resolve in the renderer.
- Data prereq: P0-4 (procurement prices), P0-9 (3 tier packages APPROVED per (systemType, size, phase)), P1-1 (tier display names).
- Blockers cleared: `TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT`, `C6_TIER_DISPLAY_NAMES_NOT_ACTIVATED`.

**Step 2 — Language architecture (loader only, English still the only bundle).**
- `src/lib/approvedTemplate.loader.js` — add `language` arg, per-language meta path.
- `src/lib/approvedTemplate.js` — pass `payload.quotation.value.quotationLanguage ?? 'en'` to loader.
- Tests: assert `language='en'` returns the vendored English bundle; `language='ml'` throws `LANGUAGE_NOT_YET_AVAILABLE`.

**Step 3 — C7 company identity resolution + `company.value.bank.*` fields.**
- Business decision required. Once made:
  - Wire `data/company-profile.json` fields (bank, GST, signature/seal image URIs).
  - `resolveInputs` in `quotationWorkspace.js` — pass through.
  - Blockers cleared: `C7_COMPANY_IDENTITY_UNRESOLVED` + `PAGE_7_FOOTER_INCONSISTENT_C7`.

**Step 4 — Approved-template Rev 2 (English).**
- Designer produces `Flarize_Solar_Quotation.en.v2.html` with the mustaches/image-slots/repeat blocks specified in Track B.
- Vendor the new bundle. Update loader meta hashes. Existing renderer consumes v2 verbatim (no code change, only new mustaches now resolve).
- Blockers cleared: `PAGE_1_BAKED_CUSTOMER_DATA`, `PAGE_2_CAMPAIGN_MISMATCH`, `PAGE_5_BAKED_TIER_COPY`, `PAGE_9_BAKED_KSEB_REFUND_5KW`, `PAGE_12_BAKED_CAPACITY_AND_LIFETIME_SAVINGS`.

**Step 5 — `bomSnapshotByTier` payload extension (Page 7 spec sheet).**
- Add `resolveBomSpecSheet(bomSnapshot, alternatives)` to `quotationWorkspace.js`. Reads existing snapshot fields, emits `rows[]`. Pure read.
- Blocker cleared: `PAGE_7_BAKED_HARDWARE_SPECS`.

**Step 6 — Savings `yearlySeries` + subsidy `ksebRefundPerKw`.**
- Additive fields on existing engine outputs. No formula change.
- Blockers cleared: `PAGE_8_BAKED_FINANCIALS_AND_BANK`, `PAGE_9_BAKED_KSEB_REFUND_5KW`.

**Step 7 — Testimonial store + Page 6 repeat block.**
- New CMS section OR admin data file. Wire into payload.
- Blocker cleared: `PAGE_6_BAKED_TESTIMONIALS`.

**Step 8 — ENERGY_LOAD_CALCULATION_ENGINE → Page 3 dynamic.**
- Largest-effort engine build (already tracked as P2-G-4 in existing plan).
- Blocker cleared: `PAGE_3_DYNAMIC_DATA_NOT_SUPPORTED_BY_TEMPLATE`.

**Step 9 — Cutover.**
- Feature flag `USE_APPROVED_TEMPLATE_RENDERER=true` in staging → prod.
- Old `public/lib/quotationDocument.js` untouched. Delete after 30 clean days.

**Step 10 — Malayalam bundle (optional, later).**
- Vendor `Flarize_Solar_Quotation.ml.v1.html`. Loader picks it when `quotationLanguage='ml'`.
- No engine change. Same snapshot serves both.

---

## HALT

- No production file modified.
- No approved HTML modified.
- No business logic modified.
- No page implemented.
- No Page 4 started.
- No template edits.
- Old renderer + new renderer + all 24 approved-template tests remain untouched.
- Awaiting decision on Step 1 (start with tier orchestration + tier display names data file activation).
