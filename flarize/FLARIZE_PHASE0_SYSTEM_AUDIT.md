# FLARIZE — PHASE 0 SYSTEM AUDIT & DOCUMENTATION

**Date:** 2026-09-02
**Author:** Cowork audit pass
**Scope:** Read-only. Zero code modifications. Documents the existing system as it is on disk in `flarizebomfinal20260831.zip` (snapshot 2026-08-31).
**Deliverable status:** Audit only. Awaits review + approval. No implementation, no refactor, no bugfix, no engine replacement.
**Authority:** This document overrides nothing. `docs/DECISION_LOG.md` is the single authoritative decision record.

---

## 0. GROUND RULES OBSERVED IN THIS AUDIT

- Do NOT modify code. Do NOT redesign. Do NOT refactor. Do NOT invent replacement engines. Do NOT fix bugs.
- The existing BOM configuration screen already contains the approved future-ready logic. Reuse; do not reinvent.
- Distinguish four data planes: technical configuration, procurement cost, internal commercial data, customer-facing data.
- Every claim traceable to a file + line (or a `docs/DECISION_LOG.md` decision id).

---

## 1. PLATFORM SUMMARY

| Fact | Value |
|---|---|
| Backend | Pure Node.js HTTP (no npm runtime deps), single process on `PORT` (default 4800). `server.js` |
| Frontend | Vite + React SPA. Entry `src/main.jsx` → `src/App.jsx` (6460 lines). Plus standalone HTML pages under `public/`. |
| Storage | JSON files under `data/`. No SQL. C15 approves PostgreSQL for V1 production but migration is Phase 6 (not started). |
| Auth | Multi-user, per-user identity, `crypto.scrypt` password hashing, opaque server-issued bearer tokens, 8h TTL, in-memory session Map. `server-users.js`. |
| RBAC | Explicit capability matrix in `src/lib/rbac.js`, 8 roles × ~24 capabilities. Enforced at service boundary via `assertCan`. |
| Bundle | `index-vy7RQ7xF.js`, 382–405 kB. `src/App.jsx` intentionally byte-frozen since Phase 1E — SHA `97dfe333…`, `data/catalog.json` SHA `8147aca9…`. |
| Golden baseline | v3 contract hash `b215b2fdbaf706eb54ded498a1d36faaeed9d82e66963a174c423edbae10adc1`, 54 cells, 0 changed since Phase 1C. |
| Tests | 2081 tests across ~50 suites, 2031 pass, 16 pre-existing failures (all data/config mismatches, not regressions), 34 cancelled (need live server). |

**Runtime layout (server.js:746-773):**

```
workspace.init()               // loads projectWorkspace + rbac + companyProfile + procurement + cms + quotation
  → OL = offerLifecycle
  → company.init()
  → sales.init()
  → packageApproval.init()
  → salesOrchestrator.init({ getWorkspaceStore, getWorkspaceEnv, persistWorkspace,
                             getQuotationStore, persistQuotation, getCompanyProfile })
  → userAuth.ensureAdminExists()
server.listen(4800)
```

All services register their routes via a single `addRoute(method, pattern, handler)` router in `server.js:127-149`.

---

## 2. SOURCE OF TRUTH — MASTER FILE MAP

### 2.1 Data (all `data/*.json`)

| File | Owns |
|---|---|
| `catalog.json` | Component catalog (categories: panel, inverter, acdb, dcdb, enphase, ug_cable, battery, mccb_box, structure_material, hoymiles), `bomTemplates` (ongrid/hybrid/upgrade slots + fixedItems + sizes), `packageProfiles` (per-tier profile — battery inclusion, structureType, inverterType), `structureTemplates`, `installationMatrix`, `transportConfig`, `officeExpense`, `marketRates`, `offers`, `costs` (legacy commercial block). Read by every server module. Serves stripped view to non-admin at `/api/catalog`. |
| `packages.proposed.json` | 48 package records × ~322 component pins. `approvalStatus: PROPOSED | APPROVED | REJECTED`. 34 APPROVED / 288 PROPOSED (per C38). |
| `battery-master.json` | Per-battery overlay: `protectionMode`, `protectionRating`, `compatibleInverters`, `engineeringStatus`, `procurementStatus`. Supersedes hardcoded battery table (C40). |
| `bom-state.json` | Legacy `App.jsx` persisted BOM selections (Phase 0 canonical shape in `src/lib/persistedState.js`, C19). |
| `procurement-price-master.json` | Projection consumed by Cost Engine. Written by procurement commit. Empty by default → `LANDED_COST_NOT_CONFIGURED`. |
| `procurement-state.json` | Suppliers, batches, batch lines, batch charges, audit log. Full procurement state. |
| `commercial-history.json` | Append-only commercial config history (single store, adopted by procurement on init). |
| `cost-config.json` | Margin per tier, GST regime + split, procurement version pointers, rate card link. 20% gross margin all tiers. |
| `finance-config.json` | EMI: down payment %, tenure, interest brackets (≤2L 5.75%, >2L 7.90%). |
| `subsidy-config.json` | PM Surya Ghar CFA: 30K/kW first 2kW, 18K for 3rd, cap 78K. |
| `energy-config.json` | Tariff bands, yield, sizing, KSEB value bounds. |
| `savings-config.json` | Self-consumption model. |
| `company-profile.json` | Company Master: legalName, displayName, GSTIN, address, bank, IFSC. Currently: Flarize Technologies Pvt. Ltd., GSTIN 32AAUFG1464A1ZP. |
| `customers.json` | Customer records (sales-owned). |
| `quotation-state.json` | Quotation store: `bomSnapshots`, `commercialSnapshots`, `quotations`, `documents[]` (indexed by version-1), `versionStatus` map. Deep-frozen on rehydrate. |
| `quotation-counter.json` | Server-authoritative sequential quotation number: `GR-YYYYMMDD-NNNN`. |
| `quotation-inclusions.json` | Inclusion matrix (services/features per tier). |
| `tier-display-names.json` | C6 tier display: `base→Basic`, `value→Smart`, `premium→Premium`. Internal keys never rename. |
| `cms-state.json` | CMS pages + versions + assets index + campaigns. |
| `cms-assets/` | CMS binary asset store (images, etc). Content-addressed by asset id. |
| `users.json` | User store: userId, username, name, email, passwordHash (`scrypt salt:key`), role, status, createdAt, createdBy. |
| `workspace-state.json` | Project Head workspace state: projects, their BOMs, cost inputs, discounts, snapshots. |
| `backups/` | Auto-rotated 50-file catalog snapshots created by `writeData` (`server.js:41-49`). |

### 2.2 Server modules (all Node.js CJS at repo root)

| File | Purpose | Registers routes | Lines |
|---|---|---|---|
| `server.js` | HTTP boot, MIME, router, static, catalog read/write, admin catalog CRUD, admin offers CRUD + lifecycle, admin costs, admin bom-template, admin bom-state, admin market-rates, admin export/import, `/api/health`. | see §5 | ~774 |
| `server-users.js` | Auth (login/logout/session), legacy `/api/auth`, admin user CRUD, scrypt hashing, session Map, rate limiter (5/15min per IP). | `/api/auth/*`, `/api/admin/users/*` | ~546 |
| `server-workspace.js` | Project Head workspace transport. Loads ESM `projectWorkspace.js` + `rbac.js`. Builds ENV from disk. Loads and registers procurement + cms + quotation. | `/api/workspace/*` | ~280 |
| `server-procurement.js` | Suppliers, batches, lines, charges, allocation preview, commit. Writes price-master + commercial-history projections. Rebuilds cost-engine env on commit. | `/api/procurement/*` | ~224 |
| `server-quotation.js` | Snapshot register (BOM + commercial), quotation draft/patch/issue/revise, payload, gate, versions, verify. Deep-freezes on rehydrate. | `/api/quotation/*` | ~285 |
| `server-cms.js` | Pages (draft/preview/submit/approve/publish/archive), assets, campaigns, fields, templates. | `/api/cms/*` | ~254 |
| `server-company.js` | Company Master read/write (admin) + sales read-only subset + quotation-shape adapter. | `/api/admin/company-profile`, `/api/sales/company-profile` | ~228 |
| `server-sales.js` | Customers (with ownership filter), quotation-number (server-authoritative), quotation-history (ownership filter), system-options, BOM preview (via `server-bom-builder`), component alternatives, salespersons list, districts list, quotation versions, sales session. | `/api/sales/*` | ~601 |
| `server-sales-orchestrator.js` | The 15-step orchestrate flow + preflight + bulk preflight + size recommendation from bill (via `energyEngine`). | `/api/sales/orchestrate`, `/api/sales/preflight`, `/api/sales/preflight-all`, `/api/sales/recommend-size` | ~233 |
| `server-package-approval.js` | Package registry list (role-filtered), approval summary, approve/reject/reset/bulk-approve/detail. | `/api/packages/*` | ~171 |
| `server-bom-builder.js` | Server-side BOM materialisation from catalog templates + package profiles + registry `approvedAlternates`. Used by sales BOM preview + alternatives. Mirrors legacy `App.jsx` client-side resolution. | (no routes) | ~524 |

### 2.3 Frozen ESM engines + services (`src/lib/*.js`)

| File | Role | Lines |
|---|---|---|
| `rbac.js` | Role enum + capability enum + `CAPABILITY_MATRIX` + `assertCan`/`assertOwnsCostHead`/`assertOwnsConfig`/`assertCanEditBomRole` + `capabilitiesOf` + `INDIVIDUAL_SALES_ROLES`. | 207 |
| `projectConfiguration.js` | `SALES_IMMUTABLE_ROLES`, `canRoleBeChangedBy`. | — |
| `projectBom.js` | `createProjectBom`, `setComponent`, `setQuantity`, `removeRole`, `effectiveLines`, `diffAgainstPackage`. Pure mutation of an in-memory BOM. | — |
| `bomRoles.js` | 20-role taxonomy (C37). `ROLES`, `roleForLine`. | — |
| `bomLock.js` | Lock-policy logic. | — |
| `bomSnapshot.js` | `SNAPSHOT_STATUS` (DRAFT/LOCKED/SUPERSEDED), deep-freeze contract for locked BOMs. | — |
| `bomStatus.js` | Status constants. | — |
| `catalogLifecycle.js` | Component `status` classification (ACTIVE / TEST / PENDING_REVIEW). C25. | — |
| `packageAuthority.js` | Sales-selectable roles, alternate allowlist. C12. | — |
| `packageApproval.js` | Package registry approve/reject/reset/bulkApprove + role-filtered listing + summary. | — |
| `packageComponents.js` | Package → component derivation. | — |
| `componentIdentity.js` | Component identity + alias resolution (Battery C27). | — |
| `resolveBattery.js` | Battery resolution, protection modes (INTEGRATED / EXTERNAL_REQUIRED / EXTERNAL_OPTIONAL / UNKNOWN — C35). | — |
| `batteryOverlay.js` / `batteryMaster.js` | Battery master overlay (C40) — `engineeringStatus`, `procurementStatus`, `protectionMode`, `protectionRating`, `compatibleInverters`. | — |
| `batteryCompatibility.js` | 10-dimension compatibility (C45 — BC-A…BC-J). | — |
| `engineeringChecker.js` | 33-rule deterministic checker. 19 categories A–S. `SEVERITY` = BLOCKED/WARNING/INFO. `CHECK_STATUS` = VALID/WARNING/BLOCKED. No clock, no random, `at` is a parameter. Read-only over BOM. | 474 |
| `engineeringValidation.js` | Higher-level validate helper. | — |
| `upgradeModel.js` | `APPROVED_UPGRADE_PATHS` (C10 — 3→5, 3→6, 3→8, 5→8, 5→10, 8→10). | — |
| `upgradeAssessment.js` | C10 closure rules (FUTURE_READY vs EXISTING_SYSTEM, inverter/panel/DC-AC/structure verdicts — RETAIN / REPLACE / ADD / ENGINEERING_REVIEW). | — |
| `upgradeReviewWorkspace.js` | Upgrade review workflow. | — |
| `procurementBatch.js` | Batch model + line + allocation. | — |
| `procurementPriceMaster.js` | `toPriceRecord`, `projectUnitCost`, `procurementUplift`, `PRICE_KIND`. | — |
| `procurementBoundary.js` | Landed-cost invariants. | — |
| `procurementWorkspace.js` | Procurement service: `createSupplier`, `createBatch`, `setBatchLines`, `setBatchCharges`, `allocationPreview`, `commitBatch`, `priceMasterView`, `landedCostVersionSummary`, `priceHistoryPanel`, `compareVersionsPanel`, `dashboard`, `assertProcurementRead`. Uses `commercialHistory`. | 831 |
| `projectRateCard.js` | `RATE_TYPE`, `resolveRate`, `installationKey`. Versioned rate card. | — |
| `commercialHistory.js` | Append-only history + `CONFIG_OWNER` map. | — |
| `commercialSnapshot.js` | `createCommercialSnapshot`, `VERSION_KEYS` (13 pinned versions), `COMMERCIAL_SNAPSHOT_STATUS`. Deep-frozen on issue. | 177 |
| `costEngine.js` | `calculateCost` — cost heads MATERIAL_LANDED / STRUCTURE / INSTALLATION / SITE_SURVEY / ENGINEERING_DESIGN / TRANSPORTATION / SERVICE_AMC / SPECIAL_PROJECT_WORKS / OFFICE_EXPENSE_ALLOCATION / MISCELLANEOUS. `COST_HEAD_OWNER` per head. `COST_ERROR` codes named per gap. `COST_STATUS` = COMPLETE/INCOMPLETE/UNAVAILABLE. No silent fallback. | 548 |
| `pricingEngine.js` | `calculatePricing` — gross margin only (`price = cost / (1 - margin)`). `MARGIN_TYPE.GROSS_MARGIN`; MARKUP forbidden. `GST_REGIME.SOLAR_70_30_COMPOSITE` (goods 70%@5% + service 30%@18% → 8.9% derived) or FLAT. `APPROVAL` = NONE_REQUIRED / SALES_HEAD_APPROVAL_REQUIRED / BLOCKED. `FORBIDDEN_EXTRA_TYPES = [NET_METERING, NET_METER]`. `CUSTOMER_SIDE_EXPENSE_TYPE.NET_METER` for customer information only. | 507 |
| `offerLifecycle.js` | `OFFER_STATUS` DRAFT→APPROVED→ACTIVE→EXPIRED→ARCHIVED. `OFFER_TYPE` flat / percentage. `VALID_TRANSITIONS` map. `validateOffer`, `marginSafetyCheck`, `transitionOffer`, `findApplicableOffer`, `calculateOfferAmount`, `autoExpireOffers`. | 398 |
| `salesOrchestrator.js` | 15-step orchestrated flow (see §16). `ORCHESTRATION_ERROR`. `stripForSales` + `stripCostFieldsForSales`. Uses internal elevated `wsActor` with role PROJECT_HEAD so workspace capability checks pass while carrying original Sales userId in the audit trail. | 595 |
| `projectWorkspace.js` | `listProjects`, `createProject`, `openProject`, `setProjectConfiguration`, `listPackages`, `selectPackage`, `viewBom`, `availableComponents`, `editBomComponent`, `editBomQuantity`, `removeBomRole`, `runChecker`, `getValidation`, `lockBom`, `getSnapshot`, `setCostInputs`, `costPanel`, `setDiscount`, `pricingPanel`, `commercialHistoryPanel`, `rateCardPanel`, `configTypes`. `WORKSPACE_VERSION`. | 700 |
| `quotationPayload.js` | PURE assembler. `buildQuotationPayload`, `evaluateGenerationGate` (8 checks — see §17). `SOURCE`, `DEPENDENCY`, `TREATMENT`, `SUBSIDY_TREATMENT`, `QUOTATION_STATUS`, `GATE_CHECK`, `GATE_STATUS`, `REQUIRED_VERSION_KEYS` (13), `CUSTOMER_FACING_ROLES`, `INTERNAL_ONLY_ROLES`, `DISPLAY_CATEGORY`, `blockedSection`. Imports only `bomRoles.js`. | 843 |
| `quotationWorkspace.js` | Service around the assembler. `createQuotationStore`, `registerBomSnapshot`, `registerCommercialSnapshot`, `createDraft`, `getQuotation`, `setQuotationFields`, `buildPayload`, `checkGenerationGate`, `issueQuotation`, `createRevision`, `listVersions`, `getVersion`, `verifyImmutability`, `session`. Deep-freeze on issue. No money math. | 1029 |
| `energyEngine.js` | `calculateEnergyProfile` from bill + billingCycle + phase. Recommended kW, monthly/annual consumption + generation. Uses `energy-config.json`. | — |
| `savingsEngine.js` | 25-year savings — self-consumption model. | — |
| `subsidyEngine.js` | PM Surya Ghar CFA computation. | — |
| `financeEngine.js` | EMI (down payment %, tenure, brackets from `finance-config.json`). | — |
| `cmsStore.js` | CMS store CRUD + campaigns + version snapshots. `createCmsStore`, `getActiveCampaign`, `snapshotPageVersion`, `getCampaign`, `getPage`, `getPageVersion`. | — |
| `cmsWorkspace.js` | Full CMS service: `pageCreate`, `pageList`, `pageGet`, `draftUpdate`, `preview`, `submitForReview`, `approve`, `publish`, `archive`, `versionHistory`, `assetUpload`, `assetList`, `assetGet`, `assetFile`, `assetArchive`, `campaignCreate`, `campaignList`, `campaignGet`, `campaignUpdate`, `campaignActivate`, `campaignDeactivate`, `fieldList`. RBAC-guarded. | — |
| `cmsFieldRegistry.js` | `FieldRegistry` class, `BUILT_IN_FIELDS`, `FIELD_CATEGORY`, `FIELD_FORMAT`, `FALLBACK_MODE`, forbidden paths. | — |
| `cmsPageSchema.js` | Page schema definitions. | — |
| `cmsAssetManager.js` | Asset store: MIME whitelist, size cap, content-addressed storage under `data/cms-assets/`. | — |
| `mockCalculationProviders.js` | Test-only. | — |
| `money.js` | `roundMoney`, `sumExact`, `mulExact`, `isMoney`. Money arithmetic invariants. | — |
| `persistedState.js` | Canonical persisted BOM state shape (C19), `PERSISTED_KEYS`, deep key sort + numeric-string coercion. | — |

### 2.4 Public HTML pages (`public/*.html`)

| Page | Purpose |
|---|---|
| `login.html` | Unified login (username + password). Default landing at `/`. |
| `admin-dashboard.html` | Admin workspace entry. |
| `workspace.html` | Project Head workspace (project → package → BOM → check → lock → cost → pricing). |
| `procurement.html` | Procurement workspace (supplier → batch → allocation → landed cost → commit). |
| `sales.html` | Sales wizard (customer → system → BOM preview → orchestrate → quotation). |
| `company-profile.html` | Company Master editor. |
| `user-management.html` | Admin user CRUD. |
| `cms.html` | CMS page designer + campaign editor + asset library. |
| `quotation.html` | Quotation list / draft / issue. |
| `quotation-document.html` | 12-page customer-facing quotation renderer (uses `public/lib/quotationDocument.js`). |
| `quotation-history.html` | Quotation history table. |

### 2.5 Frontend

- `src/App.jsx` — legacy monolithic SPA (6460 lines). Frozen since Phase 1E. Handles Admin catalog CRUD, BOM configuration screen, cost/margin/market rate UI, Sales quotation flow scaffolding, quotation history entry point. Contains the **BOM configuration screen with the approved future-ready logic**.
- `src/main.jsx` — Vite React entry.
- `src/index.css` — Tailwind.
- `src/locales/` — EN/ML locale files.
- `public/lib/quotationDocument.js` — 3367 lines, all page renderers + styles.
- `public/lib/nav.js` — cross-page navigation.

---

## 3. THE FOUR DATA PLANES (explicit distinction)

| Plane | Owns | Files | Never mixes with |
|---|---|---|---|
| **Technical configuration** | Approved BOM lines, engineering rules, packages, catalog identity, upgrade paths, battery master, engineering verdict | `catalog.json`, `packages.proposed.json`, `battery-master.json`, `bom-state.json`, `bomSnapshot`, `engineeringChecker`, `projectBom`, `resolveBattery`, `bomLock` | Any price, any margin |
| **Procurement cost** | Supplier, batch, purchase price, other batch charges, landed unit cost, price versions | `procurement-state.json`, `procurement-price-master.json`, `commercial-history.json`, `procurementWorkspace`, `procurementBatch`, `procurementPriceMaster` | Customer-facing quotation payload — never surfaced |
| **Internal commercial data** | Cost heads, margins, GST config, rate card, offers, market rates, commercial snapshot | `cost-config.json`, `commercial-history.json`, `data/catalog.json→marketRates|offers|costs|installationMatrix|transportConfig|officeExpense`, `costEngine`, `pricingEngine`, `commercialSnapshot`, `offerLifecycle`, `projectRateCard` | Sales-role responses (stripped by `stripCostFieldsForSales` + `stripForSales`) |
| **Customer-facing** | Company Master identity, tier display names, inclusion matrix, energy/savings/subsidy/finance figures for the quote, offer name + value, list price, GST amount, customer price, testimonials, CMS campaign, T&Cs | `company-profile.json`, `tier-display-names.json`, `quotation-inclusions.json`, `energy-config.json`, `savings-config.json`, `subsidy-config.json`, `finance-config.json`, `cms-state.json`, `quotation-state.json` (documents), `quotationPayload`, `quotationDocument.js` | Purchase price, landed cost, per-head cost, margin, MISCELLANEOUS |

The Cost Engine reads planes 1 + 2 + 3; the Pricing Engine reads plane 3; the Quotation Payload reads planes 1 (lines only) + 4 + a redacted view of plane 3 (`CUSTOMER_FACING_ROLES` only). `stripForSales` + `stripCostFieldsForSales` gate what a Sales actor sees at the transport layer.

---

## 4. RBAC + ROLE / AUTHORITY MATRIX

### 4.1 Roles (`src/lib/rbac.js:26-37`)

`ADMIN`, `PROJECT_HEAD`, `ENGINEERING`, `PROCUREMENT`, `SALES`, `SALES_HEAD`, `SALES_CRS`, `FIELD_SALES`.

`INDIVIDUAL_SALES_ROLES = [SALES, SALES_CRS, FIELD_SALES]` — see only own data.

### 4.2 Capability matrix (`src/lib/rbac.js:73-113`, verbatim)

| Capability \ Role | ADMIN | PROJECT_HEAD | ENGINEERING | PROCUREMENT | SALES | SALES_HEAD | SALES_CRS | FIELD_SALES |
|---|---|---|---|---|---|---|---|---|
| PROJECT_CREATE | | ✓ | | | | | | |
| PROJECT_VIEW | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| PROJECT_CONFIGURE | | ✓ | | | | | | |
| PACKAGE_SELECT | | ✓ | | | | | | |
| BOM_VIEW | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| BOM_EDIT | | ✓ | | | | | | |
| BOM_RUN_CHECKER | ✓ | ✓ | ✓ | | | | | |
| BOM_LOCK | | ✓ | | | | | | |
| BOM_ACKNOWLEDGE_WARNING | | ✓ | | | | | | |
| ENGINEERING_APPROVE | | | ✓ | | | | | |
| COST_VIEW | ✓ | ✓ | | | | | | |
| COST_INPUT_EDIT | | ✓ | | | | | | |
| PRICING_VIEW | ✓ | ✓ | | | ✓ | ✓ | ✓ | ✓ |
| DISCOUNT_REQUEST | | | | | ✓ | ✓ | ✓ | ✓ |
| MARGIN_APPROVE | | | | | | ✓ | | |
| COMMERCIAL_CONFIG_EDIT | ✓ | | | | | | | |
| COMMERCIAL_HISTORY_VIEW | ✓ | ✓ | | ✓ | | | | |
| RATE_CARD_EDIT | | ✓ | | | | | | |
| PROCUREMENT_PRICE_EDIT | | | | ✓ | | | | |
| QUOTATION_CREATE | ✓ | | | | ✓ | ✓ | ✓ | ✓ |
| CMS_VIEW | ✓ | ✓ | | | | | | |
| CMS_EDIT | ✓ | ✓ | | | | | | |
| CMS_PUBLISH | ✓ | ✓ | | | | | | |
| CMS_ASSET_MANAGE | ✓ | ✓ | | | | | | |

**Domain-layer authority (delegated, not restated in `rbac.js`):**
- `projectConfiguration.SALES_IMMUTABLE_ROLES` — BOM roles Sales may never touch. Enforced via `assertCanEditBomRole` which calls BOTH `assertCan(BOM_EDIT)` AND `canRoleBeChangedBy`.
- `costEngine.COST_HEAD_OWNER` (`src/lib/costEngine.js:50-61`) — MATERIAL_LANDED→PROCUREMENT, STRUCTURE/INSTALLATION/SITE_SURVEY/ENGINEERING_DESIGN/TRANSPORTATION/SERVICE_AMC/SPECIAL_PROJECT_WORKS→PROJECT_HEAD, OFFICE_EXPENSE_ALLOCATION/MISCELLANEOUS→ADMIN. Enforced by `assertOwnsCostHead`.
- `commercialHistory.CONFIG_OWNER` — enforced by `assertOwnsConfig`.

### 4.3 Auth flow (`server-users.js`)

- Login: `POST /api/auth/login` with `{ username, password }`. `crypto.scrypt(password, salt, 64)` compared with `timingSafeEqual`. On success: `crypto.randomBytes(32)` → hex token. Session Map entry `{ userId, username, role, createdAt }`. Returned `{ token, user, identityModel: 'AUTHENTICATED_USER' }`.
- Storage client-side: token in `sessionStorage.gr_session_token` (C16). Role in `sessionStorage.gr_user_role`, name in `gr_user_name`.
- Every request: `Authorization: Bearer <token>`. Server derives actor from session only. Client headers `x-actor-role`/`x-actor-user` are IGNORED (`server-users.js:158-162`).
- Session TTL 8h. `gcSessions()` runs on every session create.
- Rate limit: 5 failed logins / 15 min per IP (`server-users.js:44-46`).
- Legacy `POST /api/auth` still accepts password-only login using `ADMIN_PASSWORD` env, creates admin session, marks `identityModel: LEGACY_ADMIN_PASSWORD`. Kept for backward compat.
- `ensureAdminExists()` seeds admin at first boot from `ADMIN_PASSWORD`.
- Server refuses to start if `ADMIN_PASSWORD` unset (`server.js:58-71`, C18).
- Cannot disable / demote last active ADMIN (`server-users.js:462-486`).
- Password reset invalidates all sessions for that user.

### 4.4 Identity model status

Multi-user auth **IS** delivered (2026-08-30 session, per DELIVERABLE_REPORT.md). Server-derived identity is authoritative. However `GET /api/workspace/session`, `/api/procurement/session`, `/api/quotation/session` still return `identityModel: OPERATOR_ASSERTED_ROLE` with an `identityNote` disclaimer (`server-workspace.js:120-125`) — text is stale relative to `server-users.js` which returns `AUTHENTICATED_USER`. **Documentation drift, not a code hole** — sessions ARE per-user identity-proven.

### 4.5 Seeded users (`data/users.json`)

| userId | username | role |
|---|---|---|
| admin-001 | admin | ADMIN |
| user-1787942393650-e48ae05d | sales1 | SALES |
| user-1788107741878-93850ad6 | projhead1 (Rajesh Kumar) | PROJECT_HEAD |
| user-1788107741939-b701552d | procurement1 (Anil Menon) | PROCUREMENT |
| user-1788107790245-95dac6c0 | eng1 (Suresh Pillai) | ENGINEERING |

---

## 5. API SURFACE (COMPLETE)

### 5.1 Public / Auth

| Method | Path | Guard | File |
|---|---|---|---|
| GET | `/api/health` | none | `server.js:226` |
| POST | `/api/auth/login` | rate-limited | `server-users.js:247` |
| POST | `/api/auth/logout` | token holder | `server-users.js:285` |
| GET | `/api/auth/session` | authenticated | `server-users.js:291` |
| POST | `/api/auth` | rate-limited (legacy) | `server-users.js:308` |
| GET | `/api/catalog` | none — public, stripped for non-admin | `server.js:153` |
| GET | `/api/catalog/:category` | none — same stripping | `server.js:172` |
| GET | `/api/upgrade-paths` | authenticated (Sales-safe subset) | `server.js:188` |
| GET | `/api/offers` | authenticated — ACTIVE only, stripped | `server.js:201` |

### 5.2 Admin (`isAdmin`)

| Method | Path | File |
|---|---|---|
| POST/PUT/DELETE/PATCH | `/api/admin/catalog/:category[/:id][/tiers]` | `server.js:232-278` |
| PUT | `/api/admin/structure-templates` | `server.js:281` |
| GET | `/api/admin/offers` (all statuses + audit) | `server.js:292` |
| POST | `/api/admin/offers` | `server.js:304` |
| PUT | `/api/admin/offers/:id` | `server.js:344` |
| POST | `/api/admin/offers/:id/approve|activate|expire|archive` | `server.js:374-493` |
| DELETE | `/api/admin/offers/:id` (soft-archive) | `server.js:495` |
| PUT | `/api/admin/costs` | `server.js:519` |
| PUT | `/api/admin/package-profiles` | `server.js:529` |
| PUT | `/api/admin/installation-matrix` | `server.js:540` |
| PUT | `/api/admin/transport-config` | `server.js:554` |
| PUT | `/api/admin/office-expense` | `server.js:564` |
| PUT | `/api/admin/market-rates` | `server.js:573` |
| PUT | `/api/admin/bom-template/:systemType` | `server.js:586` |
| GET | `/api/admin/export` | `server.js:596` |
| GET/PUT | `/api/admin/bom-state` | `server.js:609,614` |
| POST | `/api/admin/import` | `server.js:623` |
| POST | `/api/admin/migrate-panel-types` | `server.js:632` |
| POST | `/api/admin/users` | `server-users.js:384` |
| GET | `/api/admin/users` | `server-users.js:427` |
| PATCH | `/api/admin/users/:id` | `server-users.js:433` |
| PUT | `/api/admin/users/:id/password` | `server-users.js:496` |
| GET/PUT | `/api/admin/company-profile` | `server-company.js:196,201` |

### 5.3 Workspace (Project Head — `isAuthenticated`)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/workspace/session` | `capabilitiesOf(actor.role)` + full matrix |
| POST | `/api/workspace/reload` | rebuild ENV from disk |
| GET | `/api/workspace/projects` | `W.listProjects` |
| POST | `/api/workspace/projects` | `W.createProject` (PROJECT_CREATE) |
| GET | `/api/workspace/projects/:id` | `W.openProject` |
| PATCH | `/api/workspace/projects/:id` | `W.setProjectConfiguration` (PROJECT_CONFIGURE) |
| GET | `/api/workspace/packages?sysType&sizeKw&phase&tier` | `W.listPackages` |
| POST | `/api/workspace/projects/:id/package` | `W.selectPackage` (PACKAGE_SELECT) |
| GET | `/api/workspace/projects/:id/bom` | `W.viewBom` |
| GET | `/api/workspace/components?role` | `W.availableComponents` |
| PUT | `/api/workspace/projects/:id/bom/line` | `W.editBomComponent` (BOM_EDIT + role check) |
| PUT | `/api/workspace/projects/:id/bom/quantity` | `W.editBomQuantity` |
| DELETE | `/api/workspace/projects/:id/bom/:role?reason&at` | `W.removeBomRole` |
| POST | `/api/workspace/projects/:id/check` | `W.runChecker` (BOM_RUN_CHECKER) — also accepts `upgrade`/`futureUpgrade` |
| GET | `/api/workspace/projects/:id/check` | `W.getValidation` |
| POST | `/api/workspace/projects/:id/lock` | `W.lockBom` (BOM_LOCK; body carries `acknowledgements[]`, `upgrade`, `futureUpgrade`) |
| GET | `/api/workspace/projects/:id/snapshot` | `W.getSnapshot` |
| PUT | `/api/workspace/projects/:id/cost-inputs` | `W.setCostInputs` (COST_INPUT_EDIT + head owner) |
| GET | `/api/workspace/projects/:id/cost?at` | `W.costPanel` (COST_VIEW) |
| PUT | `/api/workspace/projects/:id/discount` | `W.setDiscount` |
| GET | `/api/workspace/projects/:id/pricing?at` | `W.pricingPanel` (PRICING_VIEW) |
| GET | `/api/workspace/commercial/types` | `W.configTypes` |
| GET | `/api/workspace/commercial/history?configType&recordId` | `W.commercialHistoryPanel` (COMMERCIAL_HISTORY_VIEW) |
| GET | `/api/workspace/commercial/rate-card` | `W.rateCardPanel` |

### 5.4 Procurement

| Method | Path |
|---|---|
| GET | `/api/procurement/session` |
| POST | `/api/procurement/reload` |
| GET | `/api/procurement/dashboard` |
| GET | `/api/procurement/materials` |
| GET | `/api/procurement/price-master?asOf` |
| GET/POST | `/api/procurement/suppliers` |
| GET/POST | `/api/procurement/batches` |
| GET | `/api/procurement/batches/:id` |
| PUT | `/api/procurement/batches/:id/lines` |
| PUT | `/api/procurement/batches/:id/charges` |
| GET | `/api/procurement/batches/:id/allocation` |
| POST | `/api/procurement/batches/:id/commit` — writes `procurement-price-master.json`, `commercial-history.json`, rebuilds workspace ENV, patches `cost-config.json` (`status: CONFIGURED`, `purchasePriceVersion`, `landedCostVersion`) |
| GET | `/api/procurement/materials/:componentId?asOf` |
| GET | `/api/procurement/materials/:componentId/history` |
| GET | `/api/procurement/materials/:componentId/compare?from&to` |

### 5.5 Packages

| Method | Path |
|---|---|
| GET | `/api/packages?systemType&tier&phase&size&approvalStatus` — role-filtered |
| GET | `/api/packages/approval-summary` |
| POST | `/api/packages/:id/approve` (ENGINEERING_APPROVE) |
| POST | `/api/packages/:id/reject` |
| POST | `/api/packages/:id/reset` |
| POST | `/api/packages/bulk-approve` |
| GET | `/api/packages/:id` — Sales gets only APPROVED |

### 5.6 CMS

| Method | Path |
|---|---|
| POST | `/api/cms/pages` |
| GET | `/api/cms/pages` |
| GET | `/api/cms/pages/:pageId` |
| PUT | `/api/cms/pages/:pageId/draft` |
| POST | `/api/cms/pages/:pageId/preview` |
| POST | `/api/cms/pages/:pageId/submit-review` |
| POST | `/api/cms/pages/:pageId/approve` |
| POST | `/api/cms/pages/:pageId/publish` |
| POST | `/api/cms/pages/:pageId/archive` |
| GET | `/api/cms/pages/:pageId/versions` |
| POST | `/api/cms/assets` |
| GET | `/api/cms/assets` |
| GET | `/api/cms/assets/:assetId` |
| GET | `/api/cms/assets/:assetId/file` — binary |
| POST | `/api/cms/assets/:assetId/archive` |
| POST/GET | `/api/cms/campaigns` |
| GET/PUT | `/api/cms/campaigns/:campaignId` |
| POST | `/api/cms/campaigns/:campaignId/activate|deactivate` |
| GET | `/api/cms/fields` |
| GET | `/api/cms/templates` |

### 5.7 Quotation

| Method | Path |
|---|---|
| GET | `/api/quotation/session` |
| POST | `/api/quotation/reload` |
| POST | `/api/quotation/bom-snapshots` |
| POST | `/api/quotation/commercial-snapshots` |
| GET | `/api/quotation/quotations` |
| POST | `/api/quotation/quotations` |
| GET | `/api/quotation/quotations/:id` |
| PATCH | `/api/quotation/quotations/:id` |
| GET | `/api/quotation/quotations/:id/payload` |
| GET | `/api/quotation/quotations/:id/gate` |
| POST | `/api/quotation/quotations/:id/issue` |
| POST | `/api/quotation/quotations/:id/revise` |
| GET | `/api/quotation/quotations/:id/versions` |
| GET | `/api/quotation/quotations/:id/versions/:v` — redacted for actor |
| GET | `/api/quotation/quotations/:id/versions/:v/verify` — immutability proof over HTTP |

### 5.8 Sales

| Method | Path |
|---|---|
| GET | `/api/sales/session` |
| GET/POST | `/api/sales/customers` (ownership-filtered) |
| GET/PATCH | `/api/sales/customers/:id` |
| POST | `/api/sales/quotation-number` — server-authoritative, `GR-YYYYMMDD-NNNN` |
| GET | `/api/sales/next-quotation-number` — read-only peek |
| GET | `/api/sales/quotation-history?q&status&source&district&dateFrom&dateTo&salesperson` — ownership-filtered, `salesperson` filter only honoured for SALES_HEAD/ADMIN |
| GET | `/api/sales/system-options` |
| POST | `/api/sales/bom-preview` — 3-tier BOM via `server-bom-builder` (cost fields stripped for Sales) |
| GET | `/api/sales/component-alternatives?systemType&size&tier&phase&category` — restricted to package `approvedAlternates` for Sales |
| GET | `/api/sales/salespersons` — SALES_HEAD/ADMIN see all sales users; individual sales get `[]` |
| GET | `/api/sales/districts` — distinct districts from quotation-state |
| GET | `/api/sales/quotation-versions/:id` — version list per quotation |
| GET/POST | `/api/sales/preflight?systemType&size&tier[&phase]` |
| GET | `/api/sales/preflight-all` — matrix of every combo |
| POST | `/api/sales/orchestrate` — 15-step flow |
| GET | `/api/sales/recommend-size?billAmount&billingCycle&phase` — via `energyEngine` |
| GET | `/api/sales/company-profile` — sales-facing subset |

---

## 6. BOM / CONFIGURATION WORKFLOW

### 6.1 Data model

- `catalog.bomTemplates[systemType].slots[]` — variable slots (panel, inverter, acdb, dcdb, battery, mccb_box …). Each slot carries `pos`, `category`, `label`, `qty`/`batQty`/`premiumQty`/`premiumBatQty`, `filterType`, `filterPhase`, `gst`.
- `catalog.bomTemplates[systemType].fixedItems[]` — fixed BOM lines (75 total, all with `fi_*` ids as of prior session).
- `catalog.bomTemplates[systemType].sizes` — size-key → label map. `threePhase[]` — which sizes are 3P.
- `catalog.packageProfiles[profileKey]` — `structureType`, `inverterType`, `batteryIncluded`, `batteryQuantity`, `label`, `is_recommended`.
- `packages.proposed.json.packages[]` — record `{ packageId, systemType, size, tier, phase, approvalStatus, components: [{ role, componentId, approvedAlternates: [ids], derivedBy }] }`. Currently 48 packages × ~322 component records; 34 APPROVED / 288 PROPOSED (C38). 0 of 48 fully approved.
- `battery-master.json` — per-componentId overlay `{ engineeringStatus, procurementStatus, protectionMode, protectionRating, compatibleInverters }`.

### 6.2 Project BOM (`src/lib/projectBom.js`)

- `PROJECT_BOM_STATUS = { DRAFT, LOCKED }`.
- `createProjectBom` initialises from a package materialisation.
- `setComponent`, `setQuantity`, `removeRole` mutate DRAFT only. `assertEditable` refuses on LOCKED.
- `effectiveLines(bom)` — merges base package + overrides.
- `diffAgainstPackage(bom)` — surface deltas.

### 6.3 Server BOM builder (`server-bom-builder.js`)

Mirrors legacy `App.jsx` BOM resolution server-side:
1. Load `catalog.bomTemplates[systemType]`, resolve `packageProfile` via `getProfileKey(sysType, tier)` (hybrid→`hybrid_${tier}`, premium→`premium`, else `ongrid_${tier}`).
2. For each slot: resolve quantity from `premiumBatQty|premiumQty|batQty|qty` chain by size + battery config. Filter items by `tier`, `phase`, `status:ACTIVE`, `filterType|filterPhase`.
3. Selection: sales override → validate against `approvedAlternates` for Sales roles; else `inverter` uses nearest-kW; else first available.
4. Panel quantity dynamic: `ceil(systemWatts / panelWatt)`.
5. Premium micro-inverter accessories: IQ8P (× numPanels), Q Cable (× numPanels), Envoy, Q Relay, Q Terminal (1|3), CT (0|4), System Controller (premium hybrid), UG Cable 40 m (2/4-core by phase).
6. Fixed items: `premiumQty|batQty|qty` triage per size.
7. `stripCostFieldsForSales` removes `unitPrice, amount, gst, gstAmt, landedUnitCost, purchasePrice, supplier` before returning to Sales.

`SALES_SELECTABLE_CATEGORIES = ['panel', 'inverter', 'acdb', 'dcdb']` — C12.

### 6.4 Project Head workflow (canonical, via `/api/workspace/*`)

```
1. createProject(customer)                           PROJECT_CREATE     PROJECT_HEAD
2. setProjectConfiguration(sysType,sizeKw,phase,tier,architecture)   PROJECT_CONFIGURE
3. listPackages → selectPackage(packageId)           PACKAGE_SELECT
     → materialises BOM into project.bom (DRAFT)
4. editBomComponent | editBomQuantity | removeBomRole  BOM_EDIT
     → canRoleBeChangedBy enforced (SALES_IMMUTABLE_ROLES)
5. runChecker → engineeringChecker.validateBom       BOM_RUN_CHECKER
     → returns VALID|WARNING|BLOCKED + findings[{ruleId, category, severity, componentIds, reason}]
6. lockBom(acknowledgements[], upgrade?, futureUpgrade?)   BOM_LOCK + BOM_ACKNOWLEDGE_WARNING
     → runs checker fresh, requires acks for every WARNING
     → produces LOCKED bomSnapshot, deep-frozen
7. setCostInputs({installationType,distanceKm,vehicleType,structureMaterialCost,specialWorks[]})
                                                     COST_INPUT_EDIT + head owner
8. costPanel → calculateCost                         COST_VIEW
9. setDiscount(discount)                             DISCOUNT_REQUEST (per role limits)
10. pricingPanel → calculatePricing                  PRICING_VIEW
```

### 6.5 Engineering checker (`src/lib/engineeringChecker.js`)

- 33 rules organised into 19 categories A–S (`CATEGORY`):
  - A SYSTEM_ARCHITECTURE, B PANEL_INVERTER_COMPATIBILITY, C PANEL_ELECTRICAL_LIMITS, D INVERTER_ELECTRICAL_LIMITS, E BATTERY_INVERTER_COMPATIBILITY, F BATTERY_VOLTAGE, G BATTERY_CURRENT, H BATTERY_PROTECTION, I BATTERY_COMMUNICATION, J PHASE_COMPATIBILITY, K REQUIRED_COMPONENT_PRESENCE, L COMPONENT_QUANTITY, M MICROINVERTER_QUANTITY, N BRANCH_CIRCUIT_CONSTRAINTS, O DCDB_ACDB_CONFIGURATION, P AC_ISOLATOR, Q STRUCTURE, R UPGRADE_CONFIGURATION, S FUTURE_UPGRADE_CONFIGURATION.
- Rule ids `PBC-<category>-NNN`.
- Deterministic — no `Date.now`, no `Math.random`, `at` is a parameter.
- Read-only over BOM — no mutation reference.
- No invented thresholds — missing catalog field → `WARNING` "unverifiable", never a guess.

### 6.6 BOM configuration screen (the future-ready one)

The user's brief singles this out. On disk it lives inside `src/App.jsx` (the frozen 6460-line SPA). The corresponding backend surface is `/api/workspace/*` + `/api/packages/*` + `/api/sales/bom-preview` + `/api/sales/component-alternatives`. The **approved future-ready logic is encoded in `src/lib/upgradeAssessment.js` + `src/lib/upgradeReviewWorkspace.js` + `src/lib/upgradeModel.js` + rule categories R (UPGRADE_CONFIGURATION) and S (FUTURE_UPGRADE_CONFIGURATION) of the checker**. See §8.

### 6.7 Sales BOM path

Sales does not use `/api/workspace/*`. It uses `/api/sales/bom-preview` (POST body: `{systemType, size, phase, tierSelections}`) which drives `server-bom-builder.buildAllTierBoms`. Component alternatives fetched from `/api/sales/component-alternatives` and restricted to `approvedAlternates` per C12.

---

## 7. FUTURE-READY BOM LOGIC (C10 closure — DO NOT REINVENT)

Documented in `docs/DECISION_LOG.md` C10 CLOSURE (2026-08-16). Implemented in `src/lib/upgradeAssessment.js`. Tests: `tests/phase3-upgrade-c10.test.mjs`, `phase3-upgrade-c10-closure.test.mjs`, `phase3-upgrade-review-replace.test.mjs`, `phase3-upgrade-review-workspace.test.mjs`.

**Two scenarios (never conflated):**
- `FUTURE_READY` — install lower capacity now, prepare for a target later. Both initial + target DC/AC ratio checked.
- `EXISTING_SYSTEM` — plant already exists. Existing inverter is inspected first.

**Component verdicts:** `RETAIN` | `REPLACE` | `ADD` | `ENGINEERING_REVIEW`. Never invented quantity, never zero placeholder, never quantity taken from another path, never silent substitution.

**Inverter:** retain only if every required check passes. Failure → REPLACE + ADD approved target inverter (Engineering-chosen). Removed unit never negative qty.

**Existing panels:** consumes Sales's screening result (no second questionnaire). Healthy ≥500 W → retain. Poor / below-boundary → replace. Space/string/MPPT constraint may force replacement. Removed panels are customer's property — zero pricing impact.

**Mixed panels:** never combined into one series string automatically. Old + new on separate compatible MPPT/string configs where one exists; else `ENGINEERING_REQUEST_REQUIRED`.

**Panel quantity:** derived from target capacity + panel wattage → judged electrically. Capacity deviation alone is not selection.

**DC/AC ratio:** four states — `VALID` | `WARNING` | `BLOCKED` | `UNRESOLVED`. Manufacturer spec = hard ceiling. Preferred range may narrow, never widen. **No numerical limit is defined by C10 and none is invented in code — open item.**

**Structure:** adequate→RETAIN; insufficient→ADDITIONAL_REQUIRED (ADD, no quantity); unknown→ENGINEERING_REQUEST_REQUIRED.

**Preliminary sales quotation allowances (adjustable by Project Head after site survey):**
- DC cable 30 m total (15+15)
- MC4 3 pairs per NEW string
- For 3→6 / 3→8: 3-phase ACDB, AC protection/isolator, AC cable allowance, meter/KSEB conversion emitted automatically **but quantities unresolved, never 0**.
- Standard install/service stays on existing cost heads. C10 creates no pricing logic, no rate, no cost head.

**Approved paths (`APPROVED_UPGRADE_PATHS` in `upgradeModel.js`):** 3→5, 3→6, 3→8, 5→8, 5→10, 8→10. Any other pair unsupported and blocked.

**Fixed-item paths:** catalog defines explicit quantities for `3_5`, `5_8`, `5_10`, `8_10` only. `3_6` and `3_8` UNRESOLVED until Engineering supplies explicit quantities — reported by name as request-required, never fabricated.

**Approval:** Sales creates preliminary upgrade request → Project Head or Engineering reviews unresolved config → approved config becomes authoritative for PROJECT_BOM, COST, QUOTATION. **Existing RBAC only — no new role, no new capability. `rbac.js` unmodified.**

---

## 8. ENGINEERING VALIDATION / APPROVAL

- Checker: `src/lib/engineeringChecker.js` — §6.5 above.
- Higher-level helper: `src/lib/engineeringValidation.js`.
- Advisory vs enforcing: currently ADVISORY (C26/C33). Enforcement conditions per C33: D11 resolved (✅ per C34) + D12 resolved (per C35/C36 mostly done, but bt1 `PENDING_ENGINEERING_APPROVAL`, per C49 D12-E open) + package registry approved (0/48 fully approved).
- BOM lock policy: workspace `lockBom` runs the checker fresh, refuses if BLOCKED, requires acknowledgement for every WARNING (`BOM_ACKNOWLEDGE_WARNING`). Sales orchestrator auto-acknowledges warnings only when package `approvalStatus === APPROVED` (see §16 step 7).
- Snapshot immutability: `bomSnapshot.js` — `Object.freeze` + `applyProjectOverride` returns same object reference on LOCKED (C47).
- Engineering role: **`ENGINEERING_APPROVE`** capability held only by ENGINEERING (`rbac.js:89-92`). Used by `/api/packages/:id/approve|reject|reset|bulk-approve` (via `assertPackageSelectableByActor` + `PA` service).
- Rule authority: `RULES_VERSION = 'phase1e.1'`. `SEVERITY = { BLOCKED, WARNING, INFO }`; `CHECK_STATUS = { VALID, WARNING, BLOCKED }`.

---

## 9. PROCUREMENT + LANDED COST WORKFLOW

`server-procurement.js` + `src/lib/procurementWorkspace.js` + `src/lib/procurementBatch.js` + `src/lib/procurementPriceMaster.js` + `src/lib/commercialHistory.js`.

**End-to-end:**
```
1. createSupplier({supplierId, name, reference, at})              POST /api/procurement/suppliers
2. createBatch({supplierId, invoiceDate, invoiceRef, at})         POST /api/procurement/batches
3. setBatchLines({batchId, lines:[{componentId, qty, unitPurchasePrice}], at})
                                                                   PUT  /api/procurement/batches/:id/lines
4. setBatchCharges({batchId, charges:{delivery, duty, other}, at}) PUT  /api/procurement/batches/:id/charges
5. allocationPreview(batchId)                                     GET  /api/procurement/batches/:id/allocation
     → per-line landedUnitCost preview (allocation basis per line and reconciled)
6. commitBatch({batchId, effectiveFrom, changeReason, at})        POST /api/procurement/batches/:id/commit
     → writes procurement-price-master.json    (Cost Engine projection)
     → writes commercial-history.json          (append-only history)
     → patches cost-config.json                 (status: CONFIGURED, purchasePriceVersion, landedCostVersion)
     → workspace ENV rebuilt via ON_COMMIT hook (Cost Engine visibility)
```

**Read views:** `priceMasterView({asOf})`, `landedCostVersionSummary`, `materialDetail({componentId, asOf})`, `priceHistoryPanel`, `compareVersionsPanel`.

**Invariants (per `docs/DECISION_LOG.md` invariants 3, 4):**
- Only `landedUnitCost` enters material cost. Purchase price never substituted.
- Landed cost is ENTERED, never derived.

**Allocation basis for batch-level Other Procurement Charges** — currently allocated per line and reconciled; approved allocation basis is `docs/phase3/DECISION_REQUEST_OTHER_PROCUREMENT_CHARGES.md` — **OPEN decision**.

**Role:** `PROCUREMENT_PRICE_EDIT` (PROCUREMENT only). `COMMERCIAL_HISTORY_VIEW` shared with ADMIN + PROJECT_HEAD.

**Current data state:** `PROCUREMENT_PRICE_MASTER_AUDIT.md` — 0 of 112 BOM-used components have authoritative procurement costs entered. `cost-config.procurement.status` starts as `DECISION_CLOSED_VALUES_NOT_CONFIGURED` and moves to `CONFIGURED` after first commit.

---

## 10. COST ENGINE (`src/lib/costEngine.js`)

**Version:** `costEngine.3`.

**Cost heads (`COST_HEAD`):** MATERIAL_LANDED, STRUCTURE, INSTALLATION, SITE_SURVEY, ENGINEERING_DESIGN, TRANSPORTATION, SERVICE_AMC, SPECIAL_PROJECT_WORKS, OFFICE_EXPENSE_ALLOCATION, MISCELLANEOUS.

`DIRECT_COST_HEADS` = all except MISCELLANEOUS. `COST_HEAD_ORDER` = DIRECT_COST_HEADS + MISCELLANEOUS.

**Owners (`COST_HEAD_OWNER`):**
- MATERIAL_LANDED → PROCUREMENT
- STRUCTURE / INSTALLATION / SITE_SURVEY / ENGINEERING_DESIGN / TRANSPORTATION / SERVICE_AMC / SPECIAL_PROJECT_WORKS → PROJECT_HEAD
- OFFICE_EXPENSE_ALLOCATION / MISCELLANEOUS → ADMIN

**Rate resolution:** prefers versioned Project Head rate card (`src/lib/projectRateCard.js`, `resolveRate({rateType, recordId, at})`); falls back to plain `costConfig` block if no card. **Never** falls back to nearest/first-available/default rate.

**Missing-value semantics — never ₹0.** Each gap emits a named `COST_ERROR` code and blocks the head:
- LANDED_COST_NOT_CONFIGURED, STRUCTURE_RATE_NOT_CONFIGURED, INSTALLATION_COST_NOT_CONFIGURED, SITE_SURVEY_NOT_CONFIGURED, SITE_SURVEY_EXCESS_RATE_NOT_CONFIGURED, ENGINEERING_DESIGN_NOT_CONFIGURED, TRANSPORT_RATE_NOT_CONFIGURED, TRANSPORT_DATA_INCOMPLETE, SERVICE_CONFIG_INCOMPLETE, SERVICE_OUT_OF_COVERAGE, SPECIAL_WORK_INVALID, OFFICE_ALLOCATION_INVALID, MISC_CONFIG_INVALID, PRICE_KIND_INVALID, COST_NOT_AVAILABLE_UNTIL_BOM_LOCKED.

**Status:** `COST_STATUS = { COMPLETE, INCOMPLETE, UNAVAILABLE }`.

**Inputs:** `{ snapshot (LOCKED BOM), config, priceMaster, project (sizeKw, sizeKey, installationType, phase, sysType, tier, distanceKm, vehicleType, structureMaterialCost, specialWorks[]), rateCard, calculatedAt, catalogVersion, procurementPriceVersion, landedCostVersion, projectRateCardVersion }`.

**Special project works types:** CIVIL_WORK, TRENCHING, SCAFFOLDING, CRANE, ROOF_REINFORCEMENT, DISMANTLING, WATERPROOFING, CABLE_ROUTE, DIFFICULT_ACCESS, PANEL_MODIFICATION, OTHER. Never added automatically.

**Cannot** modify BOM, resolve battery, select inverter, run engineering validation, read marketRate as pricing authority, apply discount, modify locked snapshot. Structurally imports only `money.js`, `bomSnapshot`, `procurementPriceMaster`, `projectRateCard`.

---

## 11. PRICING ENGINE (`src/lib/pricingEngine.js`)

**Version:** `pricingEngine.3`.

**Formula (only):** `sellingPriceBeforeGST = totalActualCost / (1 - grossMargin)`. Markup form (`cost × (1 + margin)`) FORBIDDEN — `FORBIDDEN_MARGIN_TYPES = ['MARKUP']`.

**Margin config:** per-tier `{ marginType: GROSS_MARGIN, targetMarginPct, minimumMarginPct }`, `0 ≤ minimum ≤ target < 100`. Currently 20% target / 15% minimum for BASE, VALUE, PREMIUM.

**GST regimes:** `SOLAR_70_30_COMPOSITE` (C73 approved) — goods 70% @ 5% + service 30% @ 18% → 8.9% derived (not entered as flat). `FLAT` retained for regression + true-flat scenarios.

**Approval outcomes:** `NONE_REQUIRED` | `SALES_HEAD_APPROVAL_REQUIRED` | `BLOCKED`. `SALES_HEAD_APPROVAL_REQUIRED` triggered when margin below target but above minimum, plus discount pushing under threshold, etc.

**Errors:** COST_NOT_AVAILABLE, COST_INCOMPLETE, MARGIN_NOT_CONFIGURED, MARGIN_OUT_OF_RANGE, MARGIN_TYPE_FORBIDDEN, GST_NOT_CONFIGURED, GST_REGIME_INVALID, GST_SPLIT_INVALID, GST_EFFECTIVE_RATE_MISMATCH, EXTRA_INVALID, MARGIN_CONFIG_INVALID, MARGIN_BELOW_MINIMUM, DISCOUNT_INVALID, EXTRA_TYPE_FORBIDDEN.

**Extras:** OPTIONAL_ACCESSORY, ADDITIONAL_SERVICE, OTHER_APPROVED_EXTRA. NET_METER + NET_METERING FORBIDDEN as extras (net meter is customer-side).

**Customer-side expenses (informational, never Flarize total):** NET_METER, GOVERNMENT_FEE, OTHER_CUSTOMER_PROCURED.

**Money semantics:** PURCHASE_COST, INTERNAL_COST, SELLING_PRICE, CUSTOMER_EXTRA, GST, TOTAL_CUSTOMER_PRICE, REFERENCE_ONLY.

**Cannot** recalculate engineering / BOM / material purchase price; modify cost assumptions. Imports only `money.js`, `costEngine (status only)`.

---

## 12. MARGIN + MARKET-VALUE CONTROLS

- **Margin authority:** ADMIN (`COMMERCIAL_CONFIG_EDIT`) via `PUT /api/admin/costs` writes `data/cost-config.json` (which the workspace ENV rebuilds via `POST /api/workspace/reload`). Sales-Head-level approval on margin breach handled by pricing engine result surfacing `SALES_HEAD_APPROVAL_REQUIRED`; `MARGIN_APPROVE` capability held only by SALES_HEAD.
- **Market rate:** REFERENCE_ONLY (C3). `PUT /api/admin/market-rates` updates `data/catalog.json → marketRates[systemKey][sizeKey]`. Pricing engine emits a `marketRateReference` (`{value, source, kind: 'REFERENCE_ONLY'}`) but no code path assigns market rate to customer price.
- **Discount:** `PUT /api/workspace/projects/:id/discount` sets discount; pricing engine applies then evaluates margin gates. Discount authority per role — UNRESOLVED business value in DECISION_LOG.

---

## 13. OFFER LIFECYCLE (`src/lib/offerLifecycle.js`)

**Types:** `flat` (₹ off), `percentage` (% off list). Max 100 for percentage.

**States + transitions:**
```
DRAFT    → APPROVED | ARCHIVED
APPROVED → ACTIVE   | DRAFT   | ARCHIVED
ACTIVE   → EXPIRED  | ARCHIVED
EXPIRED  → ARCHIVED | DRAFT
ARCHIVED → (terminal)
```

**Errors:** INVALID_TYPE, INVALID_VALUE, MARGIN_BREACH, OFFER_NOT_FOUND, MISSING_FIELD, INVALID_TRANSITION, ALREADY_ARCHIVED, NOT_DRAFT, NOT_APPROVED.

**Admin API:**
- `GET /api/admin/offers` — all statuses + audit trail.
- `POST /api/admin/offers` — creates DRAFT; `validateOffer` first.
- `PUT /api/admin/offers/:id` — content update; `offerVersion++`. Content change in an ACTIVE offer reverts to DRAFT (`updateOffer` returns `{offer, reverted}` — `server.js:355`).
- `POST /api/admin/offers/:id/approve` — DRAFT→APPROVED. Optional margin safety check (`marginSafetyCheck(listPrice, cost, offer, minMargin=0.15)`); returns 422 MARGIN_BREACH on failure.
- `POST /api/admin/offers/:id/activate` — APPROVED→ACTIVE.
- `POST /api/admin/offers/:id/expire` — ACTIVE→EXPIRED.
- `POST /api/admin/offers/:id/archive` — → ARCHIVED (soft delete via DELETE also).

**Sales/Public API:** `GET /api/offers` — returns only ACTIVE offers within `startDate..endDate`. Auto-expires past-endDate on read + persists. Stripped of admin-internal fields (`createdBy, changedBy, transitions, offerVersion`).

**Offer applicability:** `appliesTo`, `appliesToTier`, `appliesToSize`. `findApplicableOffer(offers, {systemType, tier, size})` — best-match. `calculateOfferAmount(offer, listPrice)`.

Every transition records `changedBy, changedAt`. Every content change increments `offerVersion`.

---

## 14. SALES WORKFLOW

**Roles:** SALES, SALES_HEAD, SALES_CRS, FIELD_SALES. `INDIVIDUAL_SALES_ROLES = [SALES, SALES_CRS, FIELD_SALES]` see only own data (`server-sales.js:339-344, 347-351`).

**Sales cannot:** touch BOM (no `BOM_EDIT`), lock BOM, run checker, view cost, edit commercial config, or select unapproved packages. Sales CAN: select approved packages, choose approved alternates (C12) for `panel|inverter|acdb|dcdb`, request discount, create quotation.

**UI:** `public/sales.html` + `sales.js`. Sales wizard drives:
1. Choose customer (or create) — `/api/sales/customers`
2. Enter bill amount → recommend size — `/api/sales/recommend-size`
3. Choose system + size + phase + tier — `/api/sales/system-options`
4. Pick alternates per tier — `/api/sales/component-alternatives`
5. BOM preview per tier — `/api/sales/bom-preview` (cost fields stripped)
6. Preflight — `/api/sales/preflight` (checks approved package exists)
7. Orchestrate → issue — `/api/sales/orchestrate` (see §16)
8. View history — `/api/sales/quotation-history`

Every response is ownership-filtered server-side for individual sales roles. Client `?user`/`?userId` params are IGNORED — server derives from session (`server-sales.js:285-286`).

**Sales session** at `/api/sales/session` returns `{role, isSalesRole, userId, capabilities, ui: 'SALES_WIZARD' | 'ADMIN'}`.

---

## 15. QUOTATION GENERATION + SNAPSHOT / VERSIONING

### 15.1 Quotation payload assembler (`src/lib/quotationPayload.js`)

- PURE function. No I/O, no clock, no random, no RBAC lookup, no catalog access. Imports only `bomRoles.js`.
- Takes LOCKED BOM snapshot + ISSUED commercial snapshot + engineering + customer + system + optional `cmsStore`, `companyProfile`, `tierDisplayNames`, `inclusionMatrix`, `energyConfig`, `savingsConfig`, `subsidyConfig`, `financeConfig`.
- Emits contract payload — sections named per `DEPENDENCY` when unavailable.
- `SOURCE` enum for provenance: LOCKED_BOM_SNAPSHOT, COMMERCIAL_SNAPSHOT, ENGINEERING_CHECKER, PROJECT_CONFIGURATION, QUOTATION_RECORD, CUSTOMER_RECORD, COMPONENT_DISPLAY_ATTRIBUTES, UPGRADE_MODEL.
- `TREATMENT` per line: INCLUDED, EXTRA, OPTIONAL, EXCLUDED.
- `CUSTOMER_FACING_ROLES` (BOM roles that surface on the customer doc): PANEL, INVERTER, MICRO_INVERTER, BATTERY, BATTERY_PROTECTION, STRUCTURE, DCDB, ACDB, DC_CABLE, AC_CABLE, EARTHING, PROTECTION, MONITORING, METER, AC_ISOLATOR, CHANGEOVER, ENERGY_SYSTEM_CONTROLLER. `INTERNAL_ONLY_ROLES`: BATTERY_CABLE, ENPHASE_COMMUNICATION, OTHER.
- Reads energy/savings/subsidy/finance engines when configs supplied (imported by `quotationWorkspace`).

### 15.2 Commercial snapshot (`src/lib/commercialSnapshot.js`)

Freezes: **13 pinned versions** (`VERSION_KEYS`) — `bomSnapshotId, catalogVersion, procurementPriceVersion, landedCostVersion, projectRateCardVersion, costConfigVersion, marginVersion, gstVersion, costEngineVersion, pricingEngineVersion, moneyRuleVersion, offerVersion, marketRateVersion`.

Also freezes full `cost{}`, `pricing{}`, `offer{}` blocks. `COMMERCIAL_SNAPSHOT_STATUS = { ISSUED, SUPERSEDED }`. Deep-frozen. Configuration change never mutates a snapshot — produces new calculation with new version chain.

### 15.3 Generation gate (`src/lib/quotationPayload.js:197-245`) — 8 checks

| # | Check | Blocking reason |
|---|---|---|
| 1 | CUSTOMER_DATA | `customerId` + `customerName` required |
| 2 | SYSTEM_CONFIGURATION | `systemType` + `systemSizeKw` + `phase` required |
| 3 | BOM_EXISTS | Snapshot must have `lines[]` non-empty |
| 4 | BOM_LOCKED | `bomSnapshot.status === LOCKED` |
| 5 | ENGINEERING_VALIDATION | `engineering.status` set and not `BLOCKED` |
| 6 | COMMERCIAL_SNAPSHOT | `commercialSnapshot.status === ISSUED` |
| 7 | SUBSIDY_RESOLVED | `subsidyTreatment ∈ {NOT_QUOTED, ENGINE_RESULT}` — operator must state |
| 8 | QUOTATION_METADATA | `quotationNumber`, `quotationVersion`, `quotationDate` required |

`GATE_STATUS = { PASS, BLOCKED }`. On BLOCKED, `issueQuotation` throws `GENERATION_BLOCKED` with `failedChecks` + `reasons`.

### 15.4 Quotation workspace (`src/lib/quotationWorkspace.js`)

- `createQuotationStore()` → Maps: `bomSnapshots`, `commercialSnapshots`, `quotations`, `documents` (arrays, index=version-1), `versionStatus`.
- `registerBomSnapshot`, `registerCommercialSnapshot` — store deep-frozen snapshots.
- `createDraft`, `setQuotationFields` — DRAFT.
- `buildPayload` — assembles via `quotationPayload.buildQuotationPayload`.
- `checkGenerationGate` — read-only pre-check.
- `issueQuotation` — evaluates gate; on PASS, freezes document, pushes into `documents[quotationId]`, marks version status ISSUED.
- `createRevision` — creates new version. Prior version marked SUPERSEDED. Prior version content preserved byte-for-byte.
- `listVersions`, `getVersion` (redacted for actor without COST_VIEW), `verifyImmutability`.
- No clock, no random, `at` supplied by caller.

### 15.5 Persistence (`server-quotation.js`)

Serialises Maps to plain JSON on `persist()`. On `hydrateStore`, every document + snapshot is re-frozen. Version-status map keyed `${quotationId}#${version}`.

### 15.6 Sales-facing history

`/api/sales/quotation-history` — reads `data/quotation-state.json`, enriches with `documents[quotationId].length` (versionCount) + latest amount from `documents.at(-1).pricing.finalPrice|totalPrice|totalAmount`. Ownership-filtered. Salesperson filter server-enforced (only SALES_HEAD/ADMIN honoured).

### 15.7 Quotation number

Server-authoritative. `POST /api/sales/quotation-number` → `GR-YYYYMMDD-NNNN` (sequential, collision-free). `GET /api/sales/next-quotation-number` — read-only peek. On boot `sales.init()` backfills counter from existing `quotation-state.json` numbers (`server-sales.js:110-125`) — avoids collision after restore.

### 15.8 Quotation document (customer PDF/web) — canonical 12-page assembly

`public/quotation-document.html` + `public/lib/quotationDocument.js` (3367 lines).

| Page | Renderer | Section |
|---|---|---|
| 1 | `renderPage1` | Cover + Proposal Details |
| 2 | `renderPage2` | Campaign (conditional on CMS content) |
| 3 | `renderPage3` | Daily Solar Generation + Appliance Usage |
| 4 | `renderPage4` | Why Choose Flarize + Installation Gallery |
| 5 | `renderPage5` | Three-Option Pricing |
| 6 | `renderPage6Testimonials` | Testimonials / Social Proof |
| 7 | `renderPage7` | Technical Specifications (3-column comparison) |
| 8 | `renderPage8` | Savings Over Time + Payment Details (DETAILED) |
| 9 | `renderPage9Timeline` | Installation Timeline + Scope Split |
| 10 | `renderPage10Terms` | T&Cs 1/2 |
| 11 | `renderPage11Terms` | T&Cs 2/2 |
| 12 | `renderPage12` | Investment Summary + Refer & Earn (DETAILED) |

Excluded from customer doc (exported but not wired): FAQ (`renderPage10Faq`), Mounting & Safety (`renderPage8Mounting`), simplified Savings (`renderPage6Savings`), simplified Investment (`renderPage13Investment`), Inclusion Matrix (`renderInclusionPage` — open decision to embed in page 5 or add page 13).

Backward-compat aliases: `renderPage5Testimonials → renderPage6Testimonials`, `renderPage12Terms → renderPage11Terms`, `renderPage3Pricing`, `renderPage2Generation`.

24 canonical dispatch tests in `tests/canonical-document-dispatch.test.mjs`.

### 15.9 Financial engines

- `energyEngine.js` — `calculateEnergyProfile({billAmount, billingCycle, phase}, energyConfig)`. Derives `recommendedSystemSizeKw`, monthly/annual consumption + generation, KSEB value bounds.
- `savingsEngine.js` — 25-year self-consumption model.
- `subsidyEngine.js` — PM Surya Ghar CFA (30K/kW first 2kW, 18K for 3rd, cap 78K). Post-subsidy net computed.
- `financeEngine.js` — EMI: down payment 10% of gross (before subsidy). Rate: ≤2L → 5.75%; >2L → 7.90%.

---

## 16. SALES ORCHESTRATOR (`src/lib/salesOrchestrator.js`) — 15 steps

`POST /api/sales/orchestrate`, body `{ customer, systemType, size, tier, phase?, roofType?, tierSelections?, offerId?, distanceKm?, vehicleType?, architecture?, at? }`.

Gate: `assertCan(actor, CAPABILITY.QUOTATION_CREATE)` — SALES / SALES_HEAD / SALES_CRS / FIELD_SALES / ADMIN.

Internal elevated actor `wsActor = { userId: actor.userId, role: 'PROJECT_HEAD' }` used only for workspace ops — authority not bypassed because the orchestrator uses only APPROVED packages, committed prices, frozen engines. Sales userId preserved in audit trail.

**Steps:**

| # | Step | Action | Blocker code |
|---|---|---|---|
| 1 | FIND_PACKAGE | Resolve `{systemType, size, tier, phase}` → APPROVED package | `NO_APPROVED_PACKAGE` (409) |
| 2 | CREATE_PROJECT | `W.createProject` with customer | |
| 3 | CONFIGURE_PROJECT | `W.setProjectConfiguration` (sysType, sizeKw, phase, tier, architecture) | |
| 4 | SELECT_PACKAGE | `W.selectPackage` — materialises BOM | |
| 4a | ADD_STRUCTURE | If BOM lacks STRUCTURE role, `W.editBomComponent` with first `structure_material` item | |
| 4b | APPLY_ALTERNATIVES | For each `tierSelections[role]`, `W.editBomComponent` (approved alternate validation) | `MISSING_INPUT` |
| 5 | SET_COST_INPUTS | `W.setCostInputs({installationType, distanceKm, vehicleType, sizeKey})` | |
| 6 | ENGINEERING_CHECK | `W.runChecker` → status + counts | |
| 7 | LOCK_BOM | Auto-acknowledge WARNINGS (package is APPROVED) → `W.lockBom` | `ENGINEERING_BLOCKED` (422) |
| 8 | CALCULATE_COST | `calculateCost({snapshot, config, priceMaster, rateCard, project, at, versions...})` | `COST_INCOMPLETE` — reports blocked heads (422) |
| 9 | CALCULATE_PRICING | `calculatePricing({costResult, margin, gst, tier, discount:null, pricedAt})` | `PRICING_REJECTED` (422) |
| 10 | FIND_OFFER | `input.offerId` or `findApplicableOffer(options.offers, {systemType, tier, size})` | (WARN only if named id not found) |
| 11 | COMMERCIAL_SNAPSHOT | `createCommercialSnapshot({snapshotId, costResult, pricingResult, offer, issuedBy, issuedAt, moneyRuleVersion})` | |
| 12 | REGISTER_SNAPSHOTS | `Q.registerBomSnapshot` + `Q.registerCommercialSnapshot` in quotation store | |
| 13 | CREATE_DRAFT | `Q.createDraft({quotationId, customer, system, engineering, quotationNumber (auto-generated if absent)})` | |
| 14 | (implicit BUILD_PAYLOAD) | `Q.buildPayload` — pure assembler, runs generation gate | `GENERATION_BLOCKED` (409) |
| 15 | ISSUE_QUOTATION | `Q.issueQuotation` — deep-freezes v1 document | |

After success, `stripForSales(result)` for individual sales roles: exposes `{success, orchestratorVersion, quotationId, customer, systemSummary{systemType, systemSizeKw, packageTier}, pricing{listPrice, gstAmount, customerPrice}, offer, version, steps[{step, status}]}` — no cost breakdown, no engineering findings, no snapshot ids beyond quotationId.

---

## 17. QUOTATION REVIEW

- The system does not have a separate "quotation review workflow" module. Approval gate for a quotation is the **generation gate** (§15.3).
- Margin approval gate: pricing engine returns `APPROVAL = SALES_HEAD_APPROVAL_REQUIRED` when a discount/margin breach requires SALES_HEAD sign-off (`MARGIN_APPROVE` capability). Handling is at the caller layer.
- Package review: `/api/packages/:id/approve|reject|reset` — Engineering only.
- Upgrade review: `src/lib/upgradeReviewWorkspace.js` — Project Head / Engineering review preliminary Sales upgrade requests (see §7).
- Revision workflow: `POST /api/quotation/quotations/:id/revise` — creates new version, prior version SUPERSEDED but preserved byte-for-byte.
- Immutability proof: `GET /api/quotation/quotations/:id/versions/:v/verify` — over-HTTP proof (the getVersion `document` handle is not JSON-serialised for actors without `COST_VIEW`).

---

## 18. CMS (`src/lib/cmsWorkspace.js` + `src/lib/cmsStore.js` + `src/lib/cmsFieldRegistry.js` + `src/lib/cmsPageSchema.js` + `src/lib/cmsAssetManager.js`)

**Scope:** manages content for quotation pages 2/4/6 (campaign, why-choose, testimonials), asset library, campaign windows.

**Page lifecycle:** draft → preview → submit-for-review → approve → publish → archive. Version history preserved.

**Field registry:** typed field metadata. `FIELD_CATEGORY`, `FIELD_FORMAT`, `FALLBACK_MODE`. Forbidden path prefixes prevent bleed into engineering/commercial fields.

**Assets:** MIME whitelist, size cap, content-addressed under `data/cms-assets/`, served binary at `/api/cms/assets/:assetId/file` with 1-day cache. Archive is soft.

**Campaigns:** `campaignCreate`, `campaignActivate/deactivate` — an ACTIVE campaign is picked up by quotation page 2 via `cmsStore.getActiveCampaign()`. `snapshotPageVersion` allows quotations to pin the campaign content at issue time (via `getCampaign` / `getPage` / `getPageVersion`).

**RBAC:** CMS_VIEW / CMS_EDIT / CMS_PUBLISH / CMS_ASSET_MANAGE (ADMIN + PROJECT_HEAD).

**Integration with quotation:** `server-quotation.js:39, 78, 245, 253` — quotation `buildPayload`/`issueQuotation` receive `cmsStore` and pass to `quotationWorkspace.js` which imports `getActiveCampaign`, `snapshotPageVersion`, `getCampaign`, `getPage`, `getPageVersion`.

**Tests:** `cms-asset-manager`, `cms-field-registry`, `cms-page-schema`, `cms-quotation-integration`, `cms-rbac`, `cms-renderer`, `cms-store`, `cms-transport`, `cms-workspace`, `cms-browser-check`.

**C11 architecture doc:** `C11_CMS_PAGE_DESIGNER_ARCHITECTURE.md` + `C11_FINAL_PRODUCTION_INTEGRATION_AUDIT.md`.

---

## 19. USER MANAGEMENT

**Public HTML:** `public/user-management.html` (admin-only).

**Server:** `server-users.js` §4.3 above.

**Storage:** `data/users.json` — plaintext-safe user record; passwords are `scrypt salt:key` hex.

**Fields:** `userId`, `username` (2-50 chars, case-insensitive unique), `name`, `email`, `passwordHash`, `role`, `status` (ACTIVE|DISABLED), `createdAt`, `createdBy`, optional `updatedAt`, `updatedBy`.

**Password rules:** min 6 chars. `scrypt` with `crypto.timingSafeEqual` verify.

**Guards:**
- Cannot disable last active ADMIN.
- Cannot demote last active ADMIN.
- Disabling / password reset invalidates all sessions for that user.

**Valid roles:** `VALID_USER_ROLES = ['ADMIN', 'SALES_HEAD', 'SALES_CRS', 'FIELD_SALES', 'SALES', 'PROJECT_HEAD', 'ENGINEERING', 'PROCUREMENT']`.

---

## 20. AUDIT / HISTORY

- **`commercial-history.json`** — single append-only history store. Adopted by procurement on init (`server-procurement.js:74`). Written on every batch commit + every commercial-config change.
- **Procurement audit array** — `store.audit[]` per procurement store. Tracks supplier / batch / line / charge / commit events with actor + at.
- **Quotation version history** — `quotation-state.json` → `documents[quotationId][]` + `versionStatus`. ISSUED versions never overwritten; a revision creates a new version and marks predecessor SUPERSEDED.
- **User audit** — `createdBy`, `createdAt`, `updatedBy`, `updatedAt` on user records.
- **Customer audit** — same pattern on customer records.
- **Offer audit** — every state transition records `changedBy`, `changedAt`; content change bumps `offerVersion`.
- **Package registry audit** — `PA.approvePackage/rejectPackage/resetPackage` push transition records into the registry.
- **Catalog backup** — `server.js:41-49` — every write copies current `catalog.json` to `data/backups/catalog_${ts}.json`, retains latest 50.
- **CMS page versions** — `versionHistory(pageId)` per page.
- **BOM snapshots** — every LOCK produces a deep-frozen snapshot; project can carry `previousSnapshot` on relock.

There is **no unified audit log** across subsystems. Each subsystem writes its own history. There is **no `audit*.js` module in `src/lib/`.**

---

# A. CURRENT ARCHITECTURE MAP

```
                             ┌────────────────────────────────────────────┐
                             │            LOGIN (username + pwd)          │
                             │     POST /api/auth/login  → bearer token   │
                             │     scrypt · 8h TTL · in-memory Map        │
                             └────────────────────────────────────────────┘
                                                │
      ┌──────────┬──────────────┬──────────────┬─────────────┬───────────────┬────────────┬────────────┐
      │          │              │              │             │               │            │            │
   ADMIN    PROJECT_HEAD  ENGINEERING   PROCUREMENT      SALES         SALES_HEAD      CRS       FIELD_SALES
      │          │              │              │             │               │            │            │
      │  /workspace/*   /packages/*  /procurement/*  /sales/* (wizard)   /sales/*    /sales/*  /sales/*
      │  (project→pkg→BOM   (approve   (supplier→batch→   /sales/orchestrate      + margin_approve
      │   →check→lock→cost   packages)  landed→commit)
      │   →pricing)
      │
  ADMIN also: /admin/catalog, /admin/offers (full lifecycle), /admin/costs,
             /admin/rate/margin/market, /admin/users, /admin/company-profile,
             /cms/* (with PROJECT_HEAD)

  ── DATA PLANES ────────────────────────────────────────────────────────────────────
  TECHNICAL:      catalog.json · packages.proposed.json · battery-master.json ·
                  bomSnapshot · engineeringChecker · projectBom · upgradeAssessment
  PROCUREMENT:    procurement-state.json · procurement-price-master.json ·
                  procurementBatch · procurementWorkspace
  COMMERCIAL:     cost-config.json · commercial-history.json · costEngine ·
                  pricingEngine · projectRateCard · offerLifecycle · marketRates ·
                  commercialSnapshot (13 pinned versions, deep-frozen)
  CUSTOMER:       company-profile.json · tier-display-names.json ·
                  quotation-inclusions.json · energy/savings/subsidy/finance-config ·
                  cms-state.json · quotation-state.json.documents[] ·
                  quotationPayload (pure assembler) · quotationDocument.js (12 pages)

  ── AUTHORITY CHAIN ───────────────────────────────────────────────────────────────
  Catalog → Package Configuration → Approved Package → BOM (Project Head) →
  Engineering Validation (33 rules) → LOCK → Procurement (batch commit → landed cost) →
  Cost Engine (10 heads) → Admin Commercial (margin, GST, offers) → Pricing Engine
  (gross margin only) → Commercial Snapshot (13 pinned versions) → Quotation Payload
  (8-gate) → Issued Document (deep-frozen v1) → Revision (v2, v1 preserved) → History
```

# B. ROLE / AUTHORITY MATRIX

Full capability matrix — see §4.2.

**Ownership per artefact:**

| Artefact | Owner | Enforced by |
|---|---|---|
| Catalog category CRUD | ADMIN | `isAdmin(req)` |
| BOM template edit | ADMIN | `isAdmin(req)` |
| Structure templates | ADMIN | `isAdmin(req)` |
| Package profiles | ADMIN | `isAdmin(req)` |
| Installation matrix | ADMIN | `isAdmin(req)` |
| Transport config | ADMIN | `isAdmin(req)` |
| Office expense | ADMIN | `isAdmin(req)` |
| Market rates | ADMIN | `isAdmin(req)` (REFERENCE_ONLY, C3) |
| Offers (create/approve/activate/expire/archive) | ADMIN | `isAdmin(req)` + `offerLifecycle` |
| Commercial config edit | ADMIN | `CAPABILITY.COMMERCIAL_CONFIG_EDIT` |
| Users | ADMIN | `isAdmin(req)` + last-admin guard |
| Company Master | ADMIN | `isAdmin(req)` |
| CMS pages + assets + campaigns | ADMIN, PROJECT_HEAD | `CMS_EDIT|CMS_PUBLISH|CMS_ASSET_MANAGE` |
| Project creation + configuration | PROJECT_HEAD | `PROJECT_CREATE`, `PROJECT_CONFIGURE` |
| Package selection | PROJECT_HEAD | `PACKAGE_SELECT` (must be APPROVED) |
| BOM edit | PROJECT_HEAD | `BOM_EDIT` + `canRoleBeChangedBy` |
| BOM lock | PROJECT_HEAD | `BOM_LOCK` + `BOM_ACKNOWLEDGE_WARNING` |
| Cost input edit per head | PROJECT_HEAD (except MATERIAL_LANDED → PROCUREMENT, OFFICE/MISC → ADMIN) | `assertOwnsCostHead` |
| Cost view | ADMIN, PROJECT_HEAD | `COST_VIEW` |
| Rate card edit | PROJECT_HEAD | `RATE_CARD_EDIT` |
| Engineering approve (packages, components) | ENGINEERING | `ENGINEERING_APPROVE` |
| Procurement price + landed cost | PROCUREMENT | `PROCUREMENT_PRICE_EDIT` |
| Commercial history view | ADMIN, PROJECT_HEAD, PROCUREMENT | `COMMERCIAL_HISTORY_VIEW` |
| Pricing view | ADMIN, PROJECT_HEAD, all Sales | `PRICING_VIEW` |
| Discount request | all Sales | `DISCOUNT_REQUEST` |
| Margin approve | SALES_HEAD | `MARGIN_APPROVE` |
| Quotation create | ADMIN + all Sales | `QUOTATION_CREATE` |
| Customer records | Sales owners (individual) + SALES_HEAD/ADMIN see all | server-side ownership filter |
| Quotation history | Sales owners + SALES_HEAD/ADMIN see all | server-side ownership filter |

# C. SOURCE-OF-TRUTH MATRIX

| Business value | File | Function/API | Notes |
|---|---|---|---|
| Component catalog | `data/catalog.json` | `GET /api/catalog` (stripped) / `/api/admin/catalog/*` | Public gets no price / perWatt / landed / purchase / supplier |
| Package registry | `data/packages.proposed.json` | `GET /api/packages` | 34/322 APPROVED components; 0/48 packages fully approved |
| Battery data overlay | `data/battery-master.json` | `resolveBattery` + `batteryCompatibility` | Overrides legacy hardcoded table (C40) |
| Purchase price (per component per batch) | `data/procurement-state.json` (batches) | `POST /api/procurement/batches/:id/commit` | Historical; never re-derived |
| Landed unit cost | `data/procurement-price-master.json` (projection) | Cost Engine reads via `env.priceMaster` | Only landed enters material cost |
| Rate card | `data/project-rate-card.json` | `W.rateCardPanel` / `resolveRate` | Versioned; PROJECT_HEAD authoritative |
| Cost heads formula | `src/lib/costEngine.js` | `calculateCost` | GST outside every head |
| Margin per tier | `data/cost-config.json → margin` | `PUT /api/admin/costs` → `resolveTierMargin` | GROSS_MARGIN only |
| GST regime | `data/cost-config.json → gst` | Pricing engine | SOLAR_70_30_COMPOSITE (C73), effective 8.9% derived |
| Market rate | `data/catalog.json → marketRates` | `PUT /api/admin/market-rates` | REFERENCE_ONLY (C3) |
| Offers | `data/catalog.json → offers` | `/api/offers` (public ACTIVE) / `/api/admin/offers` | Lifecycle DRAFT→APPROVED→ACTIVE→EXPIRED→ARCHIVED |
| Quotation counter | `data/quotation-counter.json` | `POST /api/sales/quotation-number` | Server-authoritative |
| Quotation store | `data/quotation-state.json` | quotation workspace Maps | Documents frozen on rehydrate |
| Commercial snapshot | inside quotation store | `commercialSnapshot.createCommercialSnapshot` | 13 pinned versions, deep-frozen |
| Company Master | `data/company-profile.json` | `GET/PUT /api/admin/company-profile` | Flarize Technologies Pvt. Ltd., GSTIN 32AAUFG1464A1ZP |
| Tier display names | `data/tier-display-names.json` | quotation payload | `base→Basic`, `value→Smart`, `premium→Premium` (C6) |
| Inclusion matrix | `data/quotation-inclusions.json` | quotation payload | Services/features per tier |
| CMS pages + assets + campaigns | `data/cms-state.json` + `data/cms-assets/` | `/api/cms/*` | Version history preserved |
| Customers | `data/customers.json` | `/api/sales/customers` | Ownership-filtered |
| Users + auth | `data/users.json` + in-memory sessions Map | `/api/auth/*` + `/api/admin/users/*` | scrypt; 8h TTL |
| Commercial history | `data/commercial-history.json` | `commercialHistoryPanel` | Append-only |
| Approved upgrade paths | `src/lib/upgradeModel.js` `APPROVED_UPGRADE_PATHS` | `GET /api/upgrade-paths` | 3→5, 3→6, 3→8, 5→8, 5→10, 8→10 (C10) |
| RBAC capability matrix | `src/lib/rbac.js` | `capabilitiesOf(role)` | Code, never data |

# D. DEPARTMENT WORKFLOW MAPS

**Sales:** login → wizard → recommend size (energy engine) → choose system + tier → pick approved alternates → BOM preview → preflight → orchestrate (15 steps) → quotation issued → history.

**Project Head:** login → workspace → createProject → configure → selectPackage → editBOM (own overrides) → runChecker → acknowledge warnings → lockBOM → setCostInputs → costPanel → setDiscount → pricingPanel → commercial history.

**Engineering:** login → packages screen → review PROPOSED → approve/reject/reset → workspace `runChecker` for spot checks → upgrade review workspace for FUTURE_READY / EXISTING_SYSTEM requests.

**Procurement:** login → procurement workspace → createSupplier → createBatch → setBatchLines → setBatchCharges → allocationPreview → commit (writes price master + history + patches cost-config + rebuilds workspace ENV) → price history / version compare.

**Admin:** login → admin dashboard → catalog CRUD, offers lifecycle, cost/margin/GST/rate config, market rates, installation matrix, transport, office expense, users, company profile, CMS.

**CRS / Field sales:** identical to Sales but wider ownership boundary — still individual (own quotations only). No margin approve, no CMS.

**Sales Head:** all Sales caps + `MARGIN_APPROVE` + sees all salespersons + all quotations (via salesperson filter).

# E. PAGE / API / FILE MAP

- Pages: §2.4 (11 HTML files)
- APIs: §5 (~110 endpoints across 7 mount points)
- Files: §2.1 data + §2.2 servers + §2.3 lib

# F. EXISTING FUNCTIONALITY INVENTORY (WORKING)

- Multi-user auth (scrypt, 8h TTL, rate-limited)
- 8-role RBAC with explicit capability matrix
- User management (CRUD, last-admin guards, session invalidation)
- Full company Master (validation of GSTIN / phone / email / IFSC / pincode)
- Catalog admin CRUD (categories, structure templates, package profiles, installation matrix, transport, office expense, market rates, BOM templates)
- BOM configuration workflow end-to-end (workspace path AND sales BOM-preview path)
- 20-role BOM taxonomy (C37)
- 33-rule deterministic engineering checker
- BOM lock with warning acknowledgement
- Snapshot immutability (`Object.freeze` recursively)
- Package approval lifecycle (approve/reject/reset/bulk-approve)
- Battery master overlay (C40 — engineeringStatus + procurementStatus + protectionMode + protectionRating + compatibleInverters)
- 10-dimension battery compatibility (C45 — BC-A…BC-J)
- Upgrade paths (C10 approved set) + upgrade assessment (FUTURE_READY / EXISTING_SYSTEM, verdicts RETAIN / REPLACE / ADD / ENGINEERING_REVIEW) + upgrade review workspace
- Procurement UI: supplier → batch → allocation → landed cost → versioned price master → history + compare
- Cost Engine (10 heads, versioned rate card, named blockers, no silent fallback)
- Pricing Engine (gross margin only, GST composite 70/30, discount, extras with FORBIDDEN_EXTRA_TYPES)
- Offer lifecycle (5 states, valid-transition matrix, margin safety check, auto-expire, applicability rules)
- Commercial snapshot (13 pinned versions, deep-frozen)
- Sales orchestrator 15-step flow
- Quotation workspace: draft, gate, issue, revise, versions, verify, redacted per-actor view
- Quotation history (server-side ownership filter, salesperson filter for SALES_HEAD/ADMIN)
- Quotation counter (`GR-YYYYMMDD-NNNN`)
- 12-page quotation document renderer + inclusion matrix (page count subject to inclusion-matrix decision)
- Energy / Savings / Subsidy / Finance engines
- CMS: page lifecycle, assets, campaigns, versions, RBAC, quotation-integration
- Commercial history append-only
- Rate card versioned
- 2081 tests, 2031 pass (16 pre-existing failures)

# G. KNOWN ISSUES INVENTORY

**From `docs/DECISION_LOG.md` blockers:**
- C10 — 3→6 and 3→8 fixed-item quantities still UNRESOLVED (Engineering).
- C11 — 3 kW three-phase rule unconfirmed; silent 6 kW→3 kW rewrite still live in legacy path.
- Battery data — bt1/bt3/bt4 PENDING; bt1 in `PENDING_ENGINEERING_APPROVAL` per C50.
- Package registry — 34/322 APPROVED, 288 PROPOSED, 0/48 packages fully approved.
- C49 open items: D12-E, D13-A, D13-B, D13-C, D13-D, D13-E, D13-F, D13-G.
- Per-user identity — resolved by `server-users.js` (`AUTHENTICATED_USER`) but `identityModel: OPERATOR_ASSERTED_ROLE` disclaimers still returned by `/api/workspace/session`, `/api/procurement/session`, `/api/quotation/session`. **Documentation drift, not a code hole.**
- P2-M vehicle rates, P2-F tier margins, P2-L >20 kW design rate: currently margin is 20% for all tiers (may need to differentiate — Admin decision).
- C2 GST — statutory CA sign-off not recorded (regime is SOLAR_70_30_COMPOSITE per C73, works in practice).
- C7 Company identity — done for Flarize Technologies Pvt. Ltd. + GSTIN, but multi-entity if any other trading name is still open (Legal).
- Batch-level Other Procurement Charges allocation basis — OPEN (`docs/phase3/DECISION_REQUEST_OTHER_PROCUREMENT_CHARGES.md`).

**From production audits:**
- 0 of 112 BOM-used components have authoritative procurement costs entered (`PROCUREMENT_PRICE_MASTER_AUDIT.md`).
- Hybrid battery quantity mismatch: catalog has `hybrid_value.batteryQuantity=2`; 10 tests expect 1. **Product decision needed**, not a code bug.
- 6 stale margin test assertions expect `null` margin; config now 20% — test drift.
- HTTP 429 rate-limit test flakes in `quotation-history.test.mjs`, `security-acceptance.test.mjs`.
- 34 cancelled tests — require live server (`quotation-history`, `security-acceptance`).
- Visual parity of 12-page renderer against supplied artwork **NOT verified pixel-level**.
- Page 2 campaign content NOT wired for a live campaign (CMS side of integration works; content is empty).
- Inclusion matrix rendered as function but NOT wired into 12-page assembly — decision needed (embed in page 5 or add page 13).
- Legacy `POST /api/auth` password-only route still live (backward compat for older HTML forms). Fine, but should be tracked for future retirement.
- Legacy `App.jsx` 6460-line monolith carries the BOM configuration UI + admin flows and must not be edited (frozen since Phase 1E).
- `server-quotation.js` returns `identityModel` from `Q.session(actor)` but overrides `identityNote` with a stale disclaimer. Cosmetic drift.
- `energy-config`, `savings-config`, `subsidy-config`, `finance-config` present but coverage of edge cases (per-region tariff, upgrade savings, hybrid subsidy) not fully verified in this snapshot.
- CMS pages 4, 6 have placeholder content (per handoff notes).

**Not yet implemented (per phase plan):**
- PostgreSQL migration (C15, Phase 6).
- Full C13/C14 page numbering + Accounts / Documentation variant of the quotation.
- Warranty per component (no catalog field yet).
- Per-tier service matrix (13 rows in the design).
- Tariff escalation % for 25-year model.
- KSEB refund rule.
- Testimonials source + consent.
- Discount authority limits per role.
- Net-metering liaison charge (`extras.NET_METER_LIAISON` currently would go via `additionalService` — no dedicated field).

# H. REUSE vs CHANGE ANALYSIS

## H.1 REUSE AS-IS (do not touch)

- All frozen engines: `costEngine`, `pricingEngine`, `engineeringChecker`, `commercialSnapshot`, `bomSnapshot`, `procurementBatch`, `procurementPriceMaster`, `offerLifecycle`, `quotationPayload`, `energyEngine`, `savingsEngine`, `subsidyEngine`, `financeEngine`.
- `rbac.js` capability matrix — code-authoritative, never data-authoritative. C10 closure explicitly forbids adding a new role or capability.
- `salesOrchestrator.js` 15-step flow.
- Server transport modules (`server-*.js`) — thin adapters, delegate to `src/lib/*`.
- `data/battery-master.json` overlay pattern.
- `packages.proposed.json` structure + approval lifecycle.
- BOM configuration screen inside `src/App.jsx` (the future-ready one — user specified DO NOT INVENT REPLACEMENT LOGIC).
- Upgrade assessment module — C10 closure locked with Project Head.
- 12-page renderer canonical ordering + backward-compat aliases.
- Company Master schema + validators.
- User auth flow + password hashing.
- Persistence patterns (Maps serialised to JSON with re-freeze on rehydrate).

## H.2 MAY NEED MODIFICATION (candidate — pending explicit approval)

- `identityNote` text in workspace/procurement/quotation session responses (cosmetic — reflects stale statement now that per-user auth exists).
- Inclusion matrix wiring into 12-page assembly (currently exported function is not called from `quotation-document.html`).
- Hybrid battery quantity — product decision (change catalog OR tests), then a single-line edit.
- Add `NET_METER_LIAISON` to `EXTRA_TYPE` (currently must ride under `ADDITIONAL_SERVICE`) — C8 direction.
- Add warranty field to catalog component records (currently no field).
- Populate empty commercial values (P2 blockers) — DATA entry, not code.
- Populate procurement price master with the real 112 components — DATA entry via existing UI, not code.
- Package approval bulk-close (0/48 → many/48) — DATA entry via existing UI, not code.
- 3→6 / 3→8 fixed-item catalog entries — DATA entry, then existing rules light up automatically.

## H.3 DO NOT REPLACE

- Do NOT introduce a parallel BOM engine.
- Do NOT introduce a parallel pricing formula.
- Do NOT introduce a parallel checker.
- Do NOT reintroduce markup (`cost × (1 + margin)`) — forbidden by C1.
- Do NOT let market rate authoritatively price a quotation — forbidden by C3.
- Do NOT let purchase price enter material cost — forbidden by invariant 3.
- Do NOT emit ₹0 for a missing commercial value — invariant 4.
- Do NOT introduce a client-generated quotation number — quotation counter is server-authoritative.
- Do NOT hardcode any commercial value literal in the Cost Engine — resolves via rate card.
- Do NOT touch `src/App.jsx` (bundle must remain `index-vy7RQ7xF.js`).
- Do NOT move the golden baseline v3 hash.

# I. DEPENDENCIES / RISKS

**Hard dependencies (upstream → downstream):**

```
LOCKED BOM  → Cost Engine  → Pricing Engine  → Commercial Snapshot  → Quotation Payload  → Issued Document
Procurement commit  → price master  → Cost Engine (via workspace ENV rebuild)
Rate card  → Cost Engine
Cost config (margin, GST)  → Pricing Engine
Offer  → Pricing Engine (applies) + Commercial Snapshot (pins offerVersion + marketRateVersion)
CMS active campaign  → Quotation Payload page 2 (via cmsStore)
Company Master  → Quotation Payload (header, bank, GSTIN)
Tier display names  → Quotation Payload (labels)
Inclusion matrix  → Quotation Payload (services/features table)
Energy/Savings/Subsidy/Finance configs  → Quotation Payload (pages 8, 12)
Package registry (APPROVED)  → Sales orchestrator (step 1)
User + session  → every guarded route (isAuthenticated / isAdmin / assertCan)
```

**Risks:**

- **JSON concurrent write** — no visible file-locking on `data/*.json` writes; a burst of writes from multiple handlers may race. Mitigated by 50-file rolling backup (`server.js:41-49`) but not eliminated. Persists until PostgreSQL cutover (C15).
- **In-memory session store** — sessions lost on server restart. Deliberate (users re-login). Fine for single-process deployment; for multi-instance a shared store is needed (Phase 4/5 concern).
- **Rate limiter is per-process in-memory** — same caveat.
- **Empty procurement price master** — Cost Engine cannot complete for any component that lacks landed cost. Sales orchestrator step 8 will fail with `COST_INCOMPLETE`. This is the correct behaviour but blocks quotation issuance until data is entered.
- **Package approval gap** — Sales orchestrator step 1 requires APPROVED package. Currently 0/48 fully approved. Blocks sales flow.
- **Engineering blockers on catalog data (D12-E, D13-*)** — checker returns WARNING for missing catalog fields; auto-ack path in sales orchestrator will pass, but a manual PROJECT_HEAD flow may accumulate warnings.
- **Legacy `POST /api/auth` password-only route** — still active for backward compat with older HTML forms. Security risk if ADMIN_PASSWORD leaks (kept per prior sessions).
- **Manual mtime-scheduling of `/api/offers` auto-expire** — happens on read; a fully idle server won't advance offer state. Fine; consumers always read before use.
- **Sales orchestrator elevated `wsActor` (`role: 'PROJECT_HEAD'`)** — audit trail carries original Sales userId, but a security review should confirm this elevation is opaque to future capability additions.

# J. RECOMMENDED IMPLEMENTATION ORDER (POST-AUDIT)

**Phase 0a — DATA-ONLY unblockers (no code):**
1. Enter real landed costs for the 112 BOM components through the existing Procurement UI (`public/procurement.html`). One supplier invoice at a time. Nothing may be estimated. (Per `NEXT_TASK.md` this is the current standing task.)
2. Engineering approves packages via `/api/packages/*` UI — target 0/48 → substantive coverage per system/size/tier/phase.
3. Engineering answers C10 (3→6 / 3→8 fixed items), C11 (3 kW 3-phase rule), and battery blockers (D12-E, D13-A/B/F).
4. Admin confirms company identity + margin per tier (`cost-config.json → margin`) + any second entity (C7 legal).
5. Fill P2 commercial values: vehicle rates, >20 kW design rate, service cost per visit + visits/year (C9 ambiguity), transport included km, special works list.

**Phase 0b — cosmetic + non-behavioural fixes (with explicit approval):**
6. Update `identityNote` text in the three session responses to match `AUTHENTICATED_USER` reality.
7. Resolve inclusion-matrix wiring decision: embed in page 5 OR add page 13 → single wiring change in `public/quotation-document.html`.
8. Product decision on hybrid battery quantity (catalog vs test). Apply the one-line fix.

**Phase 0c — targeted schema additions (with explicit approval):**
9. Add warranty field to catalog components (data + minor UI addition).
10. Add `NET_METER_LIAISON` to `EXTRA_TYPE` (adds a valid extras type in Pricing Engine per C8).

**Phase 4 — Full auth + transport hardening (already 80% done):**
11. Retire legacy `POST /api/auth` password-only path once all HTML forms migrated.
12. HTTPS enforcement + secure cookie option (future).

**Phase 5 — Quotation redesign (C6/C7/C13/C14):**
13. Wire tier display names into all remaining code paths (many places retire simultaneously).
14. Implement Accounts / Documentation quotation variant (page selection parameter — C14 direction is already established).
15. Populate testimonials + KSEB refund + tariff escalation + per-tier service matrix.

**Phase 6 — PostgreSQL migration (C15):**
16. Design schema mirroring the JSON stores + versioned tables for snapshots/documents.
17. Parallel run: dual-write, verify equivalence.
18. Cutover; JSON archive; retire file writes.

---

## RE-READ SIGNALS

If any of the following holds, the audit is stale and must be re-read:
- The bundle name changes from `index-vy7RQ7xF.js`.
- `src/App.jsx` SHA changes from `97dfe333…`.
- `data/catalog.json` SHA changes from `8147aca9…`.
- Golden baseline v3 hash moves from `b215b2fd…`.
- A new capability appears in `src/lib/rbac.js` `CAPABILITY`.
- A new cost head appears in `src/lib/costEngine.js` `COST_HEAD`.
- A new snapshot version key appears in `src/lib/commercialSnapshot.js` `VERSION_KEYS` (currently 13).
- A new generation-gate check appears in `src/lib/quotationPayload.js` `GATE_CHECK` (currently 8).

**Audit end.** No code touched. No engine changed. No test edited.
