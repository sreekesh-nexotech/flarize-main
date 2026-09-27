# Quotation Reproducibility Audit (Read-Only) — 2026-09-04

**Question:** for every value that appears on a rendered quotation, is it FROZEN inside the ISSUED document (immutable, replay-safe) or read LIVE from a mutable source (drift risk)?

**Scope:** READ-ONLY. No file edited. No template built. Reports gaps only.

**Reproducibility contract (V4 Phase 2D, established):** `server-quotation.js:253` — for ISSUED quotations `getIssuedPayload(store, actor, quotationId)` returns `document.payload` verbatim. Live rebuild only for DRAFT. `document = deepFreeze({ quotationId, version, status, issuedBy, issuedByRole, issuedAt, identityModel, commercialSnapshotId, bomSnapshotId, cmsPageVersions, payload })` — `document.payload` is `deepFreeze(buildQuotationPayload(...))`.

Below: every input to `issueQuotation` + every value read at render time, classified.

---

## 1. FROZEN AT ISSUE (safe — replay-identical)

Everything below is copied into `document.payload` at `issueQuotation` and returned verbatim by `getIssuedPayload`. Post-issue mutation of the underlying source has no effect on the historical document.

| Value | Source at issue | Pinned to | Notes |
|---|---|---|---|
| Customer identity (name, phone, address, pincode, currentBill, currentBillCycle) | `q.customer` on draft (from Sales input) | `payload.customer.*` (spread + `SOURCE.CUSTOMER_RECORD`) | Free-shape object, `Object.freeze` at build. |
| System config (systemType, systemSizeKw, phase, packageTier) | `q.system` on draft | `payload.system.*` + `packageTierDisplayName` derived by `resolveTierDisplayName` and PINNED. | ✅ display name pinned; recommendedBadge NOT pinned (see §3). |
| Quotation metadata (quotationNumber, quotationDate, validUntil, proposalBy, salespersonId, quotationSource, district, affiliateId, quotationLanguage) | `q.*` on draft | `payload.quotation.value.*` | ✅ |
| Engineering verdict | `q.engineering` | `payload.engineering.*` | ✅ |
| BOM snapshot | `store.bomSnapshots.get(q.bomSnapshotId)` (LOCKED, deep-frozen by `bomLock`) | `payload.bomSummary`, `payload.technicalSpecifications` (via `buildBomSummary` / `buildTechSpec`), `payload.system` reference | ✅ |
| Component display attributes | `componentAttributesFor(catalog, componentIds)` computed at issue | `payload.technicalSpecifications.value.rows[*].attributes` | ✅ Frozen. Post-issue catalog mutation cannot affect. |
| Commercial snapshot (pricing, cost, offer, subsidy at snapshot time, extras, customerSideExpenses, GST/margin/procurement/rate-card/costEngine/pricingEngine versions) | `store.commercialSnapshots.get(q.commercialSnapshotId)` (ISSUED, deep-frozen by `commercialSnapshot.js`) | `payload.pricing`, `payload.extras`, `payload.versions` (13 REQUIRED_VERSION_KEYS) | ✅ |
| **13 version keys** (`bomSnapshotId, catalogVersion, procurementPriceVersion, landedCostVersion, projectRateCardVersion, costConfigVersion, marginVersion, gstVersion, costEngineVersion, pricingEngineVersion, moneyRuleVersion, offerVersion, marketRateVersion`) | commercialSnapshot | `payload.versions.*` | ✅ Consolidated. |
| Subsidy result (PMSG central/state/total, eligibility, scheme metadata, treatment, engine version) | `resolveSubsidyResult(q, system, bomSnapshot, subsidyConfig)` at issue | `payload.subsidy.value.*` (deep-frozen) | ✅ |
| Savings result (monthly/dailySavings, range, currentMonthlyBill, postSolarBill, returnPeriodMonths, engine version, savingsBasis, assumptions) | `resolveSavingsResult(energyProfileResult, commercialSnapshot, customer, savingsConfig, energyConfig)` at issue | `payload.savings.value.*` (deep-frozen) | ✅ Post Track A: `monthlySavings + dailySavings` included. |
| Financing result (monthlyEMI, tenure, rate, downPaymentAmount, postSubsidyInvestment, engine version) | `resolveFinanceResult(commercialSnapshot, subsidyResult, financeConfig)` at issue | `payload.financing.value.*` (deep-frozen) | ✅ |
| Energy profile (dailyGeneration Low/High, monthlyKsebValue Low/High, homeUsesUnitsPerDay, surplusExported Low/High, engine version, configVersion) | `resolveEnergyProfileResult(customer, system, energyConfig)` at issue | `payload.energyProfile.value.*`, `payload.consumption.value.*`, `payload.applianceUsage.value.*` (deep-frozen) | ✅ |
| Campaign snapshot (id, name, template, headline, subheadline, period, primaryBenefit, offers[], luckyDraw, referral, urgency, cta, artwork, disclaimer, yearBadge, theme, heroImage) | `resolveCampaignResult(cmsStore)` at issue | `payload.campaign.value.*` (deep-frozen) | ✅ Campaign content pinned even if CMS mutates. |
| CMS page versions | `snapshotCmsPageVersions(cmsStore)` at issue | `document.cmsPageVersions` (outside payload, on document) | ✅ Records exact CMS page version IDs at issue. |
| Company profile (legalName, displayName, gstin, companyRegistration, address, city, state, pincode, phone, email, website, bank fields, mnreEmpanelled, completedInstallations, paymentInstructions) | `companyProfile` param (from `COMPANY_PROFILE_FN` at issue) | `payload.company` = `deepFreeze(companyProfile)` verbatim | ✅ Entire profile snapshotted. If admin edits `company-profile.json` after issue, historical doc keeps the issue-time copy. |
| Inclusion matrix (per-tier services) | `resolveInclusionMatrix(system.packageTier, inclusionMatrix)` at issue | `payload.inclusions.value.*` | ✅ Only the resolved tier's inclusions pinned. |
| Alternative tiers (base + premium tier snapshots) — full per-tier payload | `buildAlternativePayloads(store, q, version, catalog, cmsStore, capabilities, companyProfile, tierDisplayNames, inclusionMatrix, energyConfig, savingsConfig, subsidyConfig, financeConfig)` at issue | `payload.alternatives[].payload.*` (each deep-frozen, same shape as primary) | ✅ Per-tier bomSnapshot + commercialSnapshot + all engine reruns pinned inside alternatives[]. |
| Formatter locale (Indian digit grouping, en-dash) | Inline in renderer (no config) | Renderer code | ✅ Deterministic — same code, same output. |
| Payload version | `QUOTATION_PAYLOAD_VERSION` constant | `payload.payloadVersion` | ✅ Records assembler version. |

**Sub-total frozen:** every business value on the customer-facing document.

---

## 2. FROZEN BY REFERENCE, RECOVERABLE (safe if source retained)

These are recorded ON the document but as IDs, not embedded values. Full replay requires the referenced source to still exist (or a bit-identical mirror).

| Value | On document | Recovery requires |
|---|---|---|
| `document.bomSnapshotId` | ID string | `store.bomSnapshots.get(id)` must retain the frozen snapshot |
| `document.commercialSnapshotId` | ID string | `store.commercialSnapshots.get(id)` must retain the frozen snapshot |
| `document.cmsPageVersions[pageId]` | version ID per page | Deleted CMS pages would break replay. Guard by never hard-deleting versioned CMS pages. |
| `payload.versions.*` (13 keys) | version strings | Every pinned version's underlying config file must exist by that version. `commercial-history.json` is the append-only ledger — safe. |
| `payload.alternatives[].bomSnapshotId` + `.commercialSnapshotId` | ID strings | Same as above per tier. |

Snapshots + commercialHistory are append-only in this build; `bomLock` deep-freezes and never edits; `commercialSnapshot.js` deep-freezes and never edits. **Practically safe** provided snapshots are never garbage-collected. `data/quotation-state.json` is the persistent store and is treated as append-only.

---

## 3. LIVE-READ AT RENDER (DRIFT RISK — gaps below)

These values are read at RENDER time (not at issue) or are pinned in a way that breaks under upgrades. Each one is a potential silent drift when historical quotations are re-rendered.

### 3.1 `recommendedTier` + `recommendedBadge`

- **Where:** `data/tier-display-names.json` — `{ recommendedTier: 'value', recommendedBadge: 'Recommended · Most Popular' }`.
- **Frozen?** Partially. `payload.system.value.packageTierDisplayName` = the CURRENT PRIMARY tier's display name (Smart), pinned. But `recommendedTier` and `recommendedBadge` are NOT copied into the payload. If a template Rev 2 mustache `{{recommendedBadge}}` reads live JSON, historical quotations show a badge string that can change post-issue.
- **Old renderer:** does not reference `recommendedBadge` directly (grep confirms no hit). No current drift.
- **Approved template renderer (new):** currently reads `recommendedBadge` from `data/tier-display-names.json` at render time via loader options (§Track A of `NEXT_GATE_TRACE`). Would drift if the JSON's `recommendedBadge` string changes.
- **Impact if drifted:** cosmetic label change on the recommended tier card of Pages 5/12. Never affects money. Still violates the "issued = replay-identical" contract.
- **Remediation:** pin `recommendedTier` + `recommendedBadge` inside `payload.system.value` at issue.

### 3.2 Approved-template bundle version

- **Where:** `assets/approved-template/Flarize_Solar_Quotation.v1.html` + `.v1.meta.json` (bundle SHA `fbb4e5e2…`, template SHA `f632f67e…`, manifest SHA `799e4b10…`).
- **Pinning at loader:** `approvedTemplate.loader.js:94` asserts `bundleSha256 == meta.bundleSha256`. If either file is tampered without updating the sibling, load throws.
- **Pinning at document:** **NONE.** `document.payload` does not record which bundle was used at issue.
- **Risk:** a legitimate Rev 2 upgrade (say `Flarize_Solar_Quotation.v2.html` with a new pinned `.v2.meta.json`) that also updates the loader's DEFAULT path from `.v1.html` to `.v2.html` will silently re-render every historical ISSUED quotation against the NEW template. Same customer, same payload, different visible document.
- **Old renderer path:** same shape — `public/lib/quotationDocument.js` version constant not recorded on document.
- **Remediation:** at issue time, capture `loaded.meta.name`, `loaded.meta.version`, `loaded.meta.bundleSha256`, `loaded.meta.templateSha256` into `document.rendererPinning` (new document-level field). Loader on replay must resolve to the pinned version's bundle file. New template versions coexist under different filename versions (`v1`, `v2`) — historical replays always resolve to their pinned version.

### 3.3 Renderer version (formatter, tryTier, token registry)

- **Where:** `src/lib/approvedTemplate.js` — `APPROVED_TEMPLATE_VERSION = 'approvedTemplate.1'`. Old renderer: no equivalent.
- **Pinning at render:** returned in `renderQuotationHtml()` meta.
- **Pinning at document:** **NONE.**
- **Risk:** if a renderer bug is fixed that changes a formatter's output (e.g. digit grouping rule), historical quotations render differently.
- **Remediation:** capture `APPROVED_TEMPLATE_VERSION` on the document at issue (same `document.rendererPinning`).

### 3.4 Approved-bundle manifest assets (fonts, JPEGs, image-slot defaults)

- **Where:** the 48 UUID-keyed assets in the bundle manifest (fonts + all 9 approved page JPEGs + 4 image-slot default JPEGs + logos + decoratives).
- **Pinning at loader:** covered by bundle SHA — one hash covers the whole bundle.
- **Pinning at document:** none directly, but transitively pinned once §3.2 fix lands.

### 3.5 Config file versions (energy / savings / subsidy / finance / inclusions)

- **Where:** `data/{energy,savings,subsidy,finance}-config.json` each carries `configVersion`. Every engine (`energyEngine`, `savingsEngine`, `subsidyEngine`, `financeEngine`) emits `configVersion` and `engineVersion` fields inside its result.
- **Pinning at issue:** the ENGINE RESULT is deep-frozen into the payload (§1). Config values used by the engine are consumed at issue time; their engine outputs are frozen. Live post-issue mutation of the config file changes NOTHING on already-issued documents.
- **Weak spot:** the `configVersion` string per engine is inside the engine result (e.g. `payload.savings.value.configVersion`, `payload.energyProfile.value.configVersion` where present). NOT consolidated on the document alongside `payload.versions.*`. Difficult to audit "which savings config produced this quotation" without walking into each section.
- **Remediation (minor):** append `energyConfigVersion`, `savingsConfigVersion`, `subsidyConfigVersion`, `financeConfigVersion`, `inclusionMatrixVersion` to `REQUIRED_VERSION_KEYS` (or a sibling `engineConfigVersions` block on payload). Additive; no formula change.

### 3.6 Company profile (Admin edits after issue)

- **Frozen?** YES — full profile deep-frozen inside `payload.company` at issue. Post-issue edits do NOT affect historical documents. ✅
- **Gap:** payload records the PROFILE, not the profile's `updatedAt` cursor. If Admin edited between the same-day issue and re-read, no way to point at "the JSON version that issue used" beyond deep-comparing the payload copy. **Practically fine** — the payload IS the pinned copy.

### 3.7 `packageTierDisplayName` mapping vs stored value

- **Where:** `resolveTierDisplayName(packageTier, tierDisplayNames)` runs at issue. Result string ("Smart System") pinned in `payload.system.value.packageTierDisplayName`.
- **Frozen?** YES. ✅
- **Sub-gap:** if `data/tier-display-names.json` mapping mutates post-issue (business decides Smart → "Standard System"), historical payloads still say "Smart System" — correct for reproducibility. Live UI would show new label; PDF replay shows old label. **This is the intended behavior**, not a bug.

### 3.8 CMS store references (cmsStore vs cmsPageVersions)

- **What's pinned:** `document.cmsPageVersions` records version IDs per page at issue.
- **What's NOT pinned:** the actual page HTML content lives in `data/cms-state.json`. If CMS mutates and Admin retracts an old version, replay would fail.
- **Frozen?** YES for the campaign values inside `payload.campaign.value` (deep-frozen full campaign object). NO for CMS pages (only versions IDs pinned).
- **Risk:** if `renderCmsPage(pageId, version)` at render time can't find the pinned version → renderer must FAIL rather than substitute a newer version. This behavior currently depends on `cmsStore` retention policy — needs a hard rule.
- **Remediation:** enforce "CMS versions are append-only, never deleted"; test that hard-deletes are rejected. Alternatively, pin the entire CMS page CONTENT into the document (larger docs, guaranteed replay).

### 3.9 Loader-bound files that the renderer reads at RENDER TIME

Verified read at render (not at issue) by the new renderer path:
| File | Read by | Impact |
|---|---|---|
| `assets/approved-template/Flarize_Solar_Quotation.v1.html` | `approvedTemplate.loader.loadApprovedTemplate` | The bundle. §3.2. |
| `assets/approved-template/Flarize_Solar_Quotation.v1.meta.json` | same | Hash pinning. §3.2. |
| `data/tier-display-names.json` (for `recommendedBadge`) | `server-quotation.js` on every `/api/quotation/quotations/:id/payload` GET when caller is DRAFT, and via `TIER_DISPLAY_NAMES` module-level for ISSUED path's PDF render options | §3.1. |

Old renderer additionally reads on render: none — all values come from `getIssuedPayload()` verbatim. Old renderer contains hardcoded copy ("Flarize by Golden Ray", "POWERED BY GOLDEN RAY", "About Flarize / Flarize by Golden Ray") which represents a separate C7 concern (§C7_RENDERER_HARDCODES).

---

## 4. NOT ON DOCUMENT — currently not needed but future-relevant

Not required today. Listed so template Rev 2 doesn't introduce silent drift.

| Value | Current source | If ever added |
|---|---|---|
| `ksebRegistrationFeePerKw`, `ksebGstOnFeePct`, `ksebRefundEligibleFractionPct` | not implemented (`KSEB_AUTHORITY_UNVERIFIED`) | must be pinned inside `payload.subsidy.value.kseb.*` at issue |
| `bookingFeeAmount` | not implemented | must be pinned inside `payload.system.value.bookingFeeAmount` |
| `additionalStructureRatePerKw` | not implemented | must be pinned inside `payload.system.value.additionalStructureRatePerKw` |
| `loanDisbursementPct` | not implemented | must be pinned inside `payload.financing.value.loanDisbursementPct` |
| `packageHeadline` per tier | not implemented | must be pinned inside `payload.system.value.packageHeadline` per tier (already flows through alternatives if added to package registry) |
| Tier feature comparison rows (Page 5) | not implemented | must be pinned inside `payload.inclusions.value.tierFeatures[]` at issue |
| BOM spec sheet rows (Page 7) | not implemented | must be built by `resolveBomSpecSheet` AT ISSUE and pinned inside `payload.bomSpecSheet.value.rows[]` |
| Testimonials + locality stats (Page 6) | not implemented | must be pinned inside `payload.testimonials.value.*` at issue |
| Savings `yearlySeries` + lifetime figures (Page 8) | not implemented (`NOT_APPROVED`) | must be pinned inside `payload.savings.value.*` at issue |
| Signature + seal assets (Page 1) | not implemented | image-slot binding to `payload.company.value.{signatureImageUri, sealImageUri}` — the company-profile deep-freeze already covers URIs if added |
| UPI QR asset (Page 8) | not implemented | `payload.company.value.upiQrImageUri` — same |

Every NEW field must be resolved AT ISSUE and pinned inside `document.payload` (or `document.*`) — never read live at render.

---

## 5. Drift-risk summary

| # | Drift risk | Severity | Fix scope | Blocked on |
|--:|---|---|---|---|
| R1 | Approved-bundle version not pinned on document (§3.2). New Rev 2 template silently re-renders historical quotations. | **HIGH** | Additive: new document-level `rendererPinning` field capturing loader meta at issue; loader accepts `{ bundlePath, metaPath }` per document version. | Engineering (~30 lines across loader + workspace, protected file — needs gate). |
| R2 | Renderer version not pinned on document (§3.3). A formatter/tryTier bugfix silently changes historical output. | Medium | Same document-level `rendererPinning` field. Capture `APPROVED_TEMPLATE_VERSION`. | Same gate as R1. |
| R3 | `recommendedBadge` not pinned in payload (§3.1). If badge string changes, historical Pages 5/12 badge drifts. | Low | Additive: pin `payload.system.value.recommendedBadge` at issue via `resolveTierDisplayName` (extended). | Engineering (~5 lines in `quotationPayload.js` — protected file). |
| R4 | Engine `configVersion` per section not consolidated on `payload.versions` (§3.5). Historical audit awkward. | Low | Additive: extend `REQUIRED_VERSION_KEYS` OR add sibling `engineConfigVersions` block. | Engineering. |
| R5 | CMS page versions pinned only as IDs; page content itself lives in mutable `cms-state.json` (§3.8). Hard-delete of a pinned page would break replay. | Medium | Retention rule + test: `cmsStore` refuses hard-delete of a version pinned on any ISSUED document. Optionally embed full CMS page content into document (larger docs, guaranteed replay). | Engineering + Ops (retention policy). |
| R6 | Snapshots stored in `data/quotation-state.json` are practically append-only but no HARD lock prevents garbage collection. | Low | Ops rule + test: snapshot GC forbidden for snapshots referenced by any ISSUED document. | Ops. |
| R7 | Old-renderer hardcoded brand strings (`"Flarize by Golden Ray"` × 6) — replay always shows Flarize identity even if C7 resolves to Golden Ray. | Medium | Auto-clears at Step 9 cutover when old renderer retires. | C7 legal + Step 9. |

---

## 6. What is ALREADY correct

- Every business value on the customer document is deep-frozen into `document.payload` at issue.
- 13 commercial version keys consolidated in `payload.versions`.
- CMS page versions recorded in `document.cmsPageVersions` (as IDs).
- BOM + commercial snapshots deep-frozen and referenced by ID.
- Full campaign object pinned inside `payload.campaign.value`.
- Full company profile pinned inside `payload.company` (edits after issue can't drift historical doc).
- Per-tier alternatives (base + premium) each carry a full per-tier `payload` pinned inside `document.payload.alternatives[]`.
- `getIssuedPayload()` returns `document.payload` verbatim — no rebuild on read.
- Server route enforces "ISSUED → frozen, DRAFT → live" split.
- Existing `commercial-history.json` is append-only.

---

## 7. Remediation priority for Rev 2 readiness

Before template Rev 2 ships, close R1 + R3 at minimum:

1. **R1 (HIGH)** — pin bundle/loader version on document. Otherwise Rev 2 rollout silently overwrites v1-issued renders. Two-file change: `quotationWorkspace.js` (protected — explicit gate) + `approvedTemplate.loader.js`. Payload shape unchanged; only `document` shape grows a sibling `rendererPinning`.
2. **R3 (Low)** — pin `recommendedBadge` in payload before Rev 2 introduces a `{{recommendedBadge}}` mustache. One-line change in `quotationPayload.js` (protected).
3. **R2 (Medium)** — pin renderer version. Bundled with R1.
4. **R4 / R5 / R6** — non-blocking for Rev 2 launch; schedule after cutover.

Every fix is ADDITIVE. No formula change. No engine change. No live-read introduced.

---

## HALT

Read-only audit complete. No file edited. Awaiting explicit gate before touching `quotationWorkspace.js` / `quotationPayload.js` / `approvedTemplate.loader.js` for R1-R3.
