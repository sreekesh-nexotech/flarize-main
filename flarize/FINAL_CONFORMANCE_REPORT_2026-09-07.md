# FLARIZE — FINAL IMPLEMENTATION & CONFORMANCE EXECUTION REPORT

**Date:** 2026-09-07 / 08 · **Governing spec:** FINAL MASTER PRODUCT CONFORMANCE + BOM DELIVERY — FINAL — 2026-09-07 · **Base:** `flarize_updated_2026-09-07.zip` (the real repository) · **Deliverable:** `flarize_final_2026-09-07.zip`

Sequence followed: INSPECT → MAP → IDENTIFY REAL DEVIATIONS → FIX → TEST → BUILD → HTTP/E2E VERIFY → PACKAGE. Nothing was restarted or rebuilt from the spec; no parallel application; no engine duplicated; `App.jsx` untouched. No engineering, commercial, procurement, protection or pricing value was invented — every gap that needs business data is listed in section C as a DATA BLOCKER, not patched with a fallback.

---

## A. IMPLEMENTED (exact files / functions / features)

### A1. Sales chain — real deviations fixed (CODE DEFECTS)

| # | Deviation found in the real repo | Fix | Files |
|---|---|---|---|
| 1 | Orchestrator declared engineering architecture from `systemType` (`'GRID_TIED'`/`'HYBRID'`), a vocabulary the checker does not know; every Enphase (Premium) package therefore failed `PBC-A-002` by construction. | New `resolvePackageArchitecture(pkg, catalog)` → explicit `pkg.architecture` first, else the catalog profile's **configured** `packageProfiles[profileKey].inverterType` (`ongrid`/`hybrid` → `DEYE`, `micro` → `ENPHASE`), else `null` (checker raises `PBC-A-001`; nothing guessed). Orchestrator uses it for primary and alternative tiers. | `src/lib/packageApproval.js`, `src/lib/salesOrchestrator.js` (`packageArchitecture`) |
| 2 | `runPackageChecker` (PH workspace "Run Engineering Validation") crashed (`Cannot read properties of undefined (reading 'map')`) — lines were passed only inside `bom`; latent since V4, never reached because `ARCHITECTURE_UNDECLARED` fired first for all 53 legacy packages (`architecture: null`). | Passes `lines` explicitly; resolves architecture via A1; records `architecture` + `architectureSource` on `lastValidation`. | `src/lib/packageApproval.js` |
| 3 | Sales customization (§11) was broken end-to-end: the wizard sends `tierSelections[tier][category]`, the orchestrator iterated `{role: id}` with checker roles → every Sales selection was rejected as `Role "base" is not a project-editable role`. No server validation against approved alternatives; Sales could name any category. | `resolveSalesSelections(input, tier, {approvedAlternativesFor})` accepts both shapes, maps **only** `panel / inverter / structure_material` → `PANEL / INVERTER / STRUCTURE`, rejects every other category with `SELECTION_NOT_PERMITTED`, and rejects a componentId outside the package's approved alternatives with `SELECTION_NOT_APPROVED` (server resolver = `server-bom-builder.getAlternatives`, Sales visibility rules). | `src/lib/salesOrchestrator.js` (`SALES_CUSTOMIZABLE_CATEGORIES`, `resolveSalesSelections`, `applySalesSelections`, `withSharedStructure`), `server-sales-orchestrator.js` |
| 4 | Structure was silently added as `catalog.structure_material.items[0]` (array-position pick, forbidden §5). | Removed. Structure is a Sales-selected approved alternative (site-specific); missing → `STRUCTURE_SELECTION_REQUIRED`. Structure choice of the primary tier is shared with alternative tiers. `getAlternatives` exposes the APPROVED `structure_material` catalog items as a Sales-selectable virtual slot (templates carry no structure slot) and marks no positional default. | `src/lib/salesOrchestrator.js`, `server-bom-builder.js` |
| 5 | Alternatives "default" = `available[0]` (positional). | Default = the approved package's own component for that category → catalog `isDefault` flag → inverter nearest configured kW → none. Catalog `approvalStatus` now filtered too. | `server-bom-builder.js` (`getAlternatives`) |
| 6 | Cost inputs defaulted silently: `installationType 'FLAT'`, `distanceKm 0`, `vehicleType 'STANDARD'` (§15/§16 violations — wrong installation matrix row, zero transport). The wizard never collected any site fact. | `validateSalesInput` now REQUIRES `installationType` (alias `roofType`), numeric `distanceKm ≥ 0`, `vehicleType`; no defaults anywhere. | `src/lib/salesOrchestrator.js` |
| 7 | Subsidy never quoted through the orchestrator: it forced `subsidyTreatment: 'NOT_QUOTED'` and dropped `subsidyType`; `snapshot.subsidy` was always null. | `subsidyDraftFields(input)` forwards `subsidyType` / `ghsHouses`; `issueQuotation` resolves the real `subsidyEngine` result (PM Surya Ghar CFA from `data/subsidy-config.json`) and freezes it. | `src/lib/salesOrchestrator.js`, `src/lib/quotationWorkspace.js` |
| 8 | `resolveSubsidyResult` assumed `panelType = 'DCR'` when the BOM line carried none (locked lines carry `componentId`/`role` only) — a NON-DCR panel would have received subsidy. | `resolvePanelDcrType` resolves DCR status from the locked panel component's catalog attributes (`panelType` / `dcr`); unresolvable → engine not called, result `INVALID_INPUT` with reason; mixed panels → `NON_DCR` (Give-It-Up). | `src/lib/quotationWorkspace.js` |
| 9 | Payload subsidy section discarded the engine's reason when the engine said "no subsidy" (ineligible connection / non-DCR / unresolved) and reported a misleading "No Subsidy Engine". | Section carries the engine `status`, `eligibilityStatus`, `subsidyType`, `reason`. | `src/lib/quotationPayload.js` (`buildSubsidySection`) |
| 10 | Sales read of an ISSUED quotation leaked internal cost/margin: `getIssuedPayload` returned the complete frozen payload; `getVersion` redacted only the primary payload (alternatives kept `pricing.internal`) and returned nothing of the snapshot. | `projectIssuedPayloadForActor` (primary + every alternative; strips `landedCostVersion / marginVersion / procurementPriceVersion` and `versionKeys`), `projectIssuedSnapshotForActor` (Sales sees `validity / subsidy / branding / rendererPin` only — never `commercial / procurement / transportation / engineering / battery / package`). Applied in `getIssuedPayload` and `getVersion`. | `src/lib/quotationWorkspace.js` |
| 11 | Sales wizard read `payload.finance` (key is `financing`) → EMI always "unavailable"; wizard sent no bill data → savings/energy engines never ran. | Wizard forwards `currentBillAmount / currentBillCycle / connectionPhase / connectionType`, `subsidyType` (+ `ghsHouses`), `installationType / distanceKm / vehicleType`; step 6 shows **System Price · GST · Customer Price · Estimated Subsidy · Estimated Net Payable · Estimated Generation · Estimated Monthly Savings · EMI · Quotation Validity**, every figure copied from the issued payload / frozen validity (no frontend math). | `public/lib/sales-wizard.js` |
| 12 | `/api/sales/system-options` returned hardcoded `availableRoofTypes: ['RCC','Sheet','Ground']` (not the installation matrix). | Serves `siteOptions.installationTypes` (distinct `installationType` in `cost-config.installation.rates`) and `siteOptions.vehicleTypes` (ACTIVE PH rate-card vehicles ∪ cost-config vehicles — names only, no rates); `availableRoofTypes` now equals the installation types. | `server-sales.js` |

### A2. Project Head BOM Configuration Workspace (real server)

* `public/lib/ph-bom-config.js`: reads the real `/api/sales/system-options` shape (`options[sysType].sizes[]`), server-asserted role via `/api/auth/session` (Sales redirected; server RBAC still enforced on every call), working record = open DRAFT/SUBMITTED else current APPROVED (ARCHIVED/superseded never), **table = the authoritative registry package** (what `selectPackage` materialises and the checker validates) decorated from `/api/catalog`; the legacy template preview is shown only as a reference count ("not in the approved package"), checker findings rendered with rule id / reason / responsible owner, per-line and header status `NOT_RUN` when no checker run exists (no implied VALID; legacy approval labelled as such), `Run Engineering Validation` sends `at`, **"+ Template"** adds an APPROVED catalog item as an engineering line to a DRAFT (one line per role; server gates at submit/approve) alongside the existing **"+ Add-on"** (project-level).
* `src/lib/projectWorkspace.js` `searchComponents(env,{actor,q})` + `GET /api/workspace/components?q=` (free-text across every checker role; same selectability/battery-master rules as `availableComponents`).

### A3. Locked-contract hygiene

* `server-quotation.js`: removed every `new Date()` from the quotation transport (locked "no clock" contract): `at` always caller-supplied; `GET /api/quotation/policy?at=` resolves `activeNow`. `setBrandingAccountStatus` / `setPrimaryBrandingAccount` require `at`; primary change is audited (`primaryChangedBy/At`). Branding default `versionId` carries ms (two publishes in one second no longer collide).
* Test fixtures updated for the new required site inputs (`tests/sales-orchestrator.test.mjs`, `tests/three-tier-orchestration.test.mjs`).

### A4. Carried from the 2026-09-07 session (already in `flarize_updated_2026-09-07.zip`, re-verified here)

PH workspace page + nav entry; project-level battery quantity 0/1/2 applied to the materialised BOM (`applyProjectBatteryQuantity`, `BATTERY_NOT_IN_PACKAGE`); `hybrid_value.batteryQuantity` restored to locked D1 (=1); versioned `isDemo` UAT transport vehicles + `DEMO_TRANSPORT_RATE_BLOCKED_IN_PRODUCTION` guard; snapshot freezes the transport rate the Cost Engine actually applied (`rateVersion`, `rateSource`); `PUT /api/workspace/commercial/rate-card` (PH-only, versioned, changeReason required); validity-policy and branding write surfaces (Admin + PH; Sales 403).

### A5. Tests added / changed

* `tests/conformance-2026-09-07.test.mjs` — 24 tests (transport freeze/demo guard, policy, branding, battery quantity, `resolveSalesSelections`, `subsidyDraftFields`, `resolvePackageArchitecture` incl. all 48 shipped packages, `runPackageChecker` on a legacy Premium package, Sales payload/snapshot projection).
* `tests/e2e/conformance-http-e2e.mjs` — 59 live-server checks (RBAC by direct API, PH lifecycle, rate card, policy, branding, Sales chain, snapshot domains, subsidy separation, Sales projection, §11 negative cases, §15/§16 required inputs, hybrid battery 0/1/2, Premium architecture, Future Ready, upgrade paths, historical immutability, renderer).
* `tests/e2e/browser-ph-sales.mjs` (21 checks), `tests/e2e/browser-ph-lifecycle.mjs` (8 checks), `tests/e2e/render-pdf-verify.mjs` — Playwright against the real pages/server.

---

## B. VERIFIED (exact runs and results)

| Check | Command | Result |
|---|---|---|
| Full unit/contract suite | `node --test tests/*.test.mjs` (pristine `data/`) | **2466 tests · 2432 pass · 0 fail · 34 cancelled** (the 34 are the two live-server suites, see next row) |
| Live HTTP suites | server on 4800 with `ADMIN_PASSWORD=TestAdmin2026!` (admin seeded from env), `node --test tests/quotation-history.test.mjs tests/security-acceptance.test.mjs` | **34/34 pass** |
| Production build | `npx vite build` | ✓ built (49 modules; `dist/` regenerated from `public/`) |
| Conformance HTTP/E2E | `E2E_BASE=http://127.0.0.1:4801 node tests/e2e/conformance-http-e2e.mjs` | **59/59 pass** |
| Browser — PH workspace + Sales wizard | `node tests/e2e/browser-ph-sales.mjs` | **21/21 pass** (PH loads authoritative BOM; Sales redirected off the engineering page; wizard steps 1→6 incl. site facts, structure required, customer price screen with subsidy/net payable/savings/EMI/validity; no internal cost or BOM ids in Sales UI; no JS errors) |
| Browser — PH lifecycle | `node tests/e2e/browser-ph-lifecycle.mjs` | **8/8 pass** (Premium 5 kW → Create Revision v2 → Run Validation → BLOCKED naming `MICRO_INVERTER` / `PBC-M-003`, architecture ENPHASE, no `PBC-A-002` → Submit disabled → "+ Template"/"+ Add-on" present → draft archived) |
| Renderer / PDF | `node tests/e2e/render-pdf-verify.mjs` | pin-enforced `rendered-html` 200 (v1 bundle, integrity hash checked), Playwright A4 `page.pdf` → **12-page `%PDF`** (3.6 MB), **byte-identical HTML across two renders**; `/versions/1/verify` → `matchesSnapshot: true` |

Specific business verifications performed through the API (all in the 59 E2E checks):

* **RBAC by direct API:** Sales → package detail (non-approved) 403, PATCH/approve 403, rate card 403, policy publish 403, branding read 403, procurement ≠ 200, commercial history 403; PH approve own package 403; ENGINEERING approve 403; Sales `bom-preview` carries no cost field and no totals; PH keeps totals.
* **PH workflow:** revision → DRAFT rev+1 → Save Draft persists quantity → run-checker (architecture resolved from profile) → submit → Admin approve → prior revision superseded → Sales sees only the current APPROVED revision.
* **Transport:** one-way `distanceKm × ratePerKm` from the PH rate card (versioned; `rateSource: PROJECT_HEAD_RATE_CARD`), negative rate refused, `changeReason` required, revision appends a version; snapshot freezes `vehicleType / distanceKm / distanceBasis ONE_WAY / ratePerKm / rateVersion`.
* **Installation:** exact size + type — 5 kW SHEET orchestration resolves and the snapshot carries the entered 12 km; missing `installationType / distanceKm / vehicleType` → `MISSING_INPUT` (no FLAT / 0 km / STANDARD defaults).
* **Subsidy / savings / finance:** 3 kW / 5 kW residential DCR → `totalSubsidy 78000`, `ELIGIBLE`, `schemeName` PM Surya Ghar; `financing.postSubsidyInvestment === customerTotalIncludingGST − totalSubsidy`; `monthlyEMI > 0`; `monthlySavings > 0`; all engine-sourced and present in the Sales payload.
* **Snapshot:** `engineering / package / procurement / transportation / commercial / subsidy / validity / branding / rendererPin` frozen; validity resolved from the ACTIVE effective-period policy (policyId + policyVersion frozen); branding versions frozen.
* **Historical safety:** after changing rate (45/km), publishing a new 7-day policy and a new bank version, quotation A is **byte-identical**; quotation B uses the NEW rate/validity/bank version.
* **Hybrid:** Value battery=2 → **422 `ENGINEERING_BLOCKED` / `PBC-H-002`** (bt1 protection rating not recorded — data, nothing invented); Value battery=0 runs battery-less; Base battery=1 → `BATTERY_NOT_IN_PACKAGE`.
* **Premium (Enphase):** architecture now `ENPHASE`; blocks only on the genuinely missing approved `MICRO_INVERTER` / IQ System Controller lines (`PBC-K-001`, `PBC-M-003`) — see C.
* **Sales limits:** `battery` selection → `SELECTION_NOT_PERMITTED`; panel outside approved alternatives → `SELECTION_NOT_APPROVED`; no structure → `STRUCTURE_SELECTION_REQUIRED`.
* **Future Ready:** `GET /api/packages?variant=FUTURE_READY` → 0 approved packages (reported honestly by the wizard as "none approved"); Sales does not fake FR cards.

---

## C. REMAINING REAL DATA BLOCKERS (business / engineering / procurement / admin input — no code fallback applied)

| # | Blocker | Owner | Evidence |
|---|---|---|---|
| C1 | **Premium (Enphase) packages carry no `MICRO_INVERTER` and no `ENERGY_SYSTEM_CONTROLLER` line** (`PKG-ONGRID-*-PREMIUM`, `PKG-HYBRID-*-PREMIUM`). Approved catalog items exist (`en1` IQ8P, `en_sysctrl`), but quantity (device allocator) and inclusion are engineering decisions. PH can now author them in the workspace ("+ Template" → Run Validation → Submit → Admin approve). | PROJECT_HEAD + ENGINEERING | `PBC-K-001 MICRO_INVERTER`, `PBC-M-003` on every Premium orchestration and package check |
| C2 | **bt1 / bt3 / bt4 battery protection engineering data absent** in `data/battery-master.json` (rating, protection component). Hybrid Value/Base with battery ≥1 stays BLOCKED (`PBC-H-002`). `bt2` Enphase Flex (integrated protection) is valid. | ENGINEERING HEAD (D12-E) | E2E hybrid checks |
| C3 | **Battery `ba_3b51aef23f0b`** remains REJECTED / lifecycle-inconsistent in the registry; it is never selectable and never substituted. Business must decide retire vs. re-propose. | ENGINEERING / ADMIN | registry state |
| C4 | **Future Ready:** 0 packages with `variant = FUTURE_READY`. FR needs its own approved package identity, BOM (3 kW array + approved higher-capacity inverter, etc.), validation, cost, pricing. Not fabricated. | PROJECT_HEAD + ENGINEERING + ADMIN | `GET /api/packages?variant=FUTURE_READY` → 0 |
| C5 | **No production transport rate card is shipped** (`data/project-rate-card.json` does not exist yet; it is created on the first PH publish). Cost-config vehicles (35 / 50 ₹/km) are versioned **UAT reference, `isDemo:true`** and are refused in `PRODUCTION_MODE=true` (`DEMO_TRANSPORT_RATE_BLOCKED_IN_PRODUCTION`). PH must publish real vehicle rates via `PUT /api/workspace/commercial/rate-card`. | PROJECT_HEAD | cost-config `productionUse:false` |
| C6 | **Validity policy `NOT_CONFIGURED`** in shipped data (no ACTIVE effective-period policy, `defaultDays null`). In production mode issuance is refused (`POLICY_NOT_CONFIGURED`). Publish via `POST /api/quotation/policy/policies` (Admin/PH). | ADMIN / PROJECT_HEAD | `data/quotation-policy.json` |
| C7 | **Branding / bank / UPI / signature / seal store is empty** (no published versions; Finance has not supplied the Flarize receiving account per C7 decisions). Publish via `POST /api/quotation/branding/:kind/versions`. | ADMIN / PROJECT_HEAD / FINANCE | `data/quotation-branding-state.json` |
| C8 | **Procurement landed cost is seed/test-only** for many components; 47 `fi_*` template consumables have no landed cost. Note: the production BOM materialises the **registry package components only** (10–11 lines + structure); the 36–49-line legacy template preview (consumables, Enphase accessories) is **not** in the approved packages, so those consumables are neither priced nor supplied unless PH authors them into the packages. | PROCUREMENT + PROJECT_HEAD | `procurement-price-master.json`; PH workspace reference count |
| C9 | **Structure material** has no engineering quantity model in the package data (packages carry no structure line; legacy `structureTemplates` by roof type are not integrated into the production BOM). Today STRUCTURE = Sales-selected approved item × 1 (pre-existing quantity semantics preserved) plus the PH-owned STRUCTURE cost head (roofAddOn + labour). PH should author structure lines per package/roof type. | PROJECT_HEAD + ENGINEERING | `data/catalog.json` |
| C10 | **Duplicate component identity** `i97 "ENPHASE IQ8P Micro"` (category inverter → role INVERTER) vs `en1` (enphase → MICRO_INVERTER). Retire one. | ENGINEERING / ADMIN | catalog |
| C11 | **Approved v1 artwork page 1 is a raster with baked sample-tenant text** ("Dear Sareena", sample identity). Customer name/quotation number are not bound on page 1. Renderer v1 stays pinned and immutable by decision; Rev2 overlay bundle is a separate gated track (`docs/audit/REV2_*`). | ADMIN / DESIGN (Rev2 gate) | `render-pdf-verify` screenshot |
| C12 | Shipped `data/cms-state.json` already contains ~314 "Updated Campaign" test campaigns from earlier UAT test runs (pre-existing pollution; not added by this session, and the 5 created by this session's suite runs were removed). Admin should purge before production. | ADMIN | `cms-state.json` |

---

## D. NOT IMPLEMENTED (spec items still incomplete)

1. **Future Ready cards / FR quotation** — waits on C4 (data). Code path exists (`variant=FUTURE_READY` filtering, wizard FR toggle); PH workspace FR toggle is a stub that only explains the rule.
2. **Premium (Enphase) quotation issuance** — code path now correct (ENPHASE architecture), blocked by C1 (data).
3. **Hybrid with bt1/bt3/bt4 batteries** — blocked by C2 (engineering data) by design.
4. **Structure engineering quantities** in packages (C9) — not modelled; not invented.
5. **Rev2 renderer bundle / page-1 data overlays** (C11) — out of scope of this brief (no artwork redesign); v1 pinned.
6. **`finance.dailyPayment`** (earlier Phase-1 gate ask) — not in the final brief; not added.
7. **PH UI for validity policy / branding / rate-card** — write **APIs** exist and are verified (Admin/PH only); no dedicated screens yet (data is entered via API/Admin tooling).
8. `sales.html` (legacy page) still exists alongside the new wizard; it now receives real installation types from `system-options` but was not otherwise reworked (untouched per "do not modify legacy unless necessary").

---

## E. FINAL ZIP

`flarize_final_2026-09-07.zip` — complete source repository (server, `src/lib`, `public`, `assets`, `data`, `docs`, `tests`, configs). Excluded: `node_modules/`, `dist/` (regenerate with `npx vite build`; the server falls back to `public/` when `dist/` is absent), `.git/`, `tests/_pdf_out/`, `tests/e2e/_shots/`.

Run: `npm install` → `ADMIN_PASSWORD=<pw> PORT=4800 PRODUCTION_MODE=false node server.js` → `npx vite build` → `node --test tests/*.test.mjs`; live suites and E2E as in section B (create the `*_e2e` role users via `POST /api/admin/users`).

`data/` ships as the handoff data plus the two intentional 2026-09-07 corrections only (`catalog.json` hybrid_value battery quantity → 1 with `batteryComponentId bt1`; `cost-config.json` versioned `isDemo` UAT vehicles). No E2E/test mutations are included.
