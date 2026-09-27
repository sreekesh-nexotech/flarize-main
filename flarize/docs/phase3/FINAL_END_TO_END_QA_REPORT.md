# FLARIZE — FINAL END-TO-END QUOTATION QA REPORT

**Date:** 2026-08-29  
**Scope:** Real BOM → Calculation Pipeline → Quotation → PDF — 6 test cases  
**Method:** Programmatic E2E tests + Playwright visual inspection  
**Caveat:** Manual commercial snapshots used (20% test margin) because production cost→pricing pipeline is blocked by null margin configuration (Category G)

---

## SUMMARY TABLE

| # | Test | Result | Key Issues |
|---|------|--------|------------|
| 1 | 3 kW On-Grid DCR + Finance | **PASS** | Savings values null in payload (Category F) |
| 2 | 5 kW On-Grid DCR + Finance | **PASS** | — |
| 3 | 10 kW On-Grid DCR + Finance | **PASS** | — |
| 4 | 3 kW Non-DCR | **PASS** | Subsidy correctly INELIGIBLE |
| 5 | No Finance (3 kW DCR) | **PASS** | Finance section correctly NOT AVAILABLE |
| 6 | Hybrid (3 kW Value) | **PASS** | Battery SEG×2 + Deye inverter correct |
| 7 | PDF / Visual Inspection | **PASS** | 0 NaN, 0 undefined, 0 null in render |
| 8 | Issue / Snapshot Freeze | **PASS** | Immutability verified, re-issue blocked |
| 9 | Sales Identity | **PASS** | Server-derived, client assertion rejected |
| — | Margin Config | **CAT G** | All tier margins null — pipeline blocked |
| — | Procurement Config | **CAT G** | No landed costs — costEngine blocked |
| — | Transportation Config | **CAT G** | No vehicles configured |
| — | Company Profile | **CAT G** | companyName/GSTIN/address/bank all null |

**Overall: 9/9 functional tests PASS. 4 Category G configuration blockers reported.**

---

## 1. ACTUAL BOM USED

| Config | Profile | Panel | Panel Qty | Inverter | Inv Qty | Battery | Grand Total |
|--------|---------|-------|-----------|----------|---------|---------|-------------|
| 3 kW Ongrid Value | ongrid_value | Adani Mono Perc Bifacial 550W DCR (p2) | 6 | Sungrow SG 3.0RT (i20) | 1 | — | ₹1,32,311 |
| 5 kW Ongrid Value | ongrid_value | Adani Mono Perc Bifacial 550W DCR (p2) | 10 | Sungrow SG 5.0RT (i23) | 1 | — | ₹2,36,793 |
| 10 kW Ongrid Value | ongrid_value | Adani Mono Perc Bifacial 550W DCR (p2) | 19 | Sungrow SG 10RT (i27) | 1 | — | ₹3,82,231 |
| 3 kW Ongrid Base | ongrid_base | Adani Mono Perc 545W Non-DCR (p1) | 6 | ABB 3kW (i1) | 1 | — | ₹1,22,378 |
| 3 kW Hybrid Value | hybrid_value | Adani Mono Perc Bifacial 550W DCR (p2) | 6 | Deye Hybrid 1P 3-48v (i56) | 1 | SEG.5 PRO 100AH LV (bt1) ×2 | ₹4,16,633 |

All components from existing catalog. Nothing invented.

## 2. ACTUAL PACKAGE/PROFILE

All quotations used real `packageProfiles` from `catalog.json`. Profile keys: `ongrid_value`, `ongrid_base`, `hybrid_value`. Each resolved correctly via `getProfileKey(systemType, tier)`.

## 3. ACTUAL QUOTATION PRICES

| Config | Material Cost | Total Actual Cost | Selling Price (pre-GST) | GST (8.9%) | **Gross (incl GST)** |
|--------|-------------|-------------------|------------------------|------------|---------------------|
| 3 kW DCR | ₹1,32,311 | ₹1,78,075 | ₹2,22,593 | ₹19,811 | **₹2,42,404** |
| 5 kW DCR | ₹2,36,793 | ₹2,90,173 | ₹3,62,716 | ₹32,960 | **₹3,95,676** |
| 10 kW DCR | ₹3,82,231 | ₹4,57,031 | ₹5,71,289 | ₹51,841 | **₹6,23,130** |
| 3 kW Non-DCR | ₹1,22,378 | ₹1,68,090 | ₹2,10,113 | ₹18,635 | **₹2,28,748** |
| 3 kW Hybrid | ₹4,16,633 | ₹4,64,239 | ₹5,80,299 | ₹53,008 | **₹6,33,307** |

Pricing uses 20% test gross margin (production margin NOT_CONFIGURED). GST: SOLAR_70_30_COMPOSITE (70%×5% + 30%×18% = 8.9%).

## 4. ENERGY RESULTS

| Config | Daily Low–High | Monthly KSEB Value Low–High | Home Use/Day | Surplus Low–High |
|--------|---------------|---------------------------|-------------|-----------------|
| 3 kW | 10.8–13.2 units | ₹2,168–₹2,649 | 7.5 units | 3.3–5.7 units |

Energy Engine v1.0.0. KSEB Phase 3 non-telescopic multi-slab billing. All values from real configuration.

## 5. SAVINGS RESULTS

| Config | Monthly Savings | Annual Savings | Post-Solar Bill | Return Period |
|--------|---------------|---------------|----------------|--------------|
| 3 kW | ₹1,443 | ₹17,316 | ₹56/bimonth | 168 months |

Savings Engine v2.0.0. Bill-difference model (pre-solar bill − post-solar bill). Lifetime savings: null (25-year projection requires tariff escalation config — Category F).

## 6. SUBSIDY RESULTS

| Config | DCR | Eligible | Subsidy Amount | Scheme |
|--------|-----|----------|---------------|--------|
| 3 kW DCR | YES | YES | ₹78,000 | PM Surya Ghar |
| 5 kW DCR | YES | YES | ₹78,000 | PM Surya Ghar |
| 10 kW DCR | YES | YES | ₹78,000 | PM Surya Ghar |
| 3 kW Non-DCR | NO | NO | ₹0 | — |
| 3 kW Hybrid | YES | YES | ₹78,000 | PM Surya Ghar |

Subsidy tiers: ≤2kW → ₹30,000/kW, 3rd kW → ₹18,000/kW, cap ₹78,000. DCR required. All correct.

## 7. DOWN PAYMENT

| Config | Gross | Down Payment (10%) |
|--------|-------|-------------------|
| 3 kW DCR | ₹2,42,404 | ₹24,240 |
| 5 kW DCR | ₹3,95,676 | ₹39,568 |
| 10 kW DCR | ₹6,23,130 | ₹62,313 |

Formula: `Math.round(gross × 0.10)` ✓

## 8. YOUR INVESTMENT

| Config | Gross | Subsidy | Your Investment |
|--------|-------|---------|----------------|
| 3 kW DCR | ₹2,42,404 | ₹78,000 | **₹1,64,404** |
| 5 kW DCR | ₹3,95,676 | ₹78,000 | **₹3,17,676** |
| 10 kW DCR | ₹6,23,130 | ₹78,000 | **₹5,45,130** |
| 3 kW Non-DCR | ₹2,28,748 | ₹0 | **₹2,28,748** |

Formula: `Math.max(0, gross − subsidy)` ✓

## 9. FINANCE AMOUNT

| Config | Gross | Down Payment | Subsidy | **Finance Amount** |
|--------|-------|-------------|---------|-------------------|
| 3 kW DCR | ₹2,42,404 | ₹24,240 | ₹78,000 | **₹1,40,164** |
| 5 kW DCR | ₹3,95,676 | ₹39,568 | ₹78,000 | **₹2,78,108** |
| 10 kW DCR | ₹6,23,130 | ₹62,313 | ₹78,000 | **₹4,82,817** |

Formula: `Math.max(0, (gross − downPayment) − subsidy)` ✓

## 10. INTEREST RATE

| Config | Finance Amount | Rate Tier | **Rate** |
|--------|--------------|-----------|----------|
| 3 kW DCR | ₹1,40,164 | ≤₹200K | **5.75%** |
| 5 kW DCR | ₹2,78,108 | >₹200K | **7.90%** |
| 10 kW DCR | ₹4,82,817 | >₹200K | **7.90%** |

Rate tiers from finance-config.json. Boundary at ₹200,000. Correct.

## 11. EMI

| Config | Finance Amount | Rate | Tenure | **Monthly EMI** |
|--------|--------------|------|--------|----------------|
| 3 kW DCR | ₹1,40,164 | 5.75% | 10 yr | **₹1,539** |
| 5 kW DCR | ₹2,78,108 | 7.90% | 10 yr | **₹3,360** |
| 10 kW DCR | ₹4,82,817 | 7.90% | 10 yr | **₹5,832** |

Finance Engine v1.1.0. Standard amortization formula. All verified.

## 12. PDF / RENDERER RESULTS

**Visual inspection via Playwright (Chromium):**

- Pages rendered: cover letter, energy/generation, pricing (3 options), tech specs, inclusions, savings, investment summary
- **0 NaN** in rendered text
- **0 undefined** in rendered text
- **0 null** in rendered text
- **0 "BLOCKED"** visible to customer
- All critical financial values render correctly:
  - Customer name: Rajesh Kumar ✓
  - System size: 3 kW ✓
  - Subsidy ₹78,000 ✓
  - Gross ₹2,42,404 ✓
  - Your Investment ₹1,64,404 ✓
  - EMI visible ✓
  - Quotation number GR9700 ✓
  - Company name Flarize ✓
  - GST rate visible ✓
- Layout: clean, no clipped text, no broken page breaks

**Blocked fields in renderer (74 total — all EXPECTED):**

| Category | Count | Status |
|----------|-------|--------|
| ALTERNATIVE_QUOTATION_OPTIONS (base/premium not quoted) | 38 | D: Expected — single-tier quotation |
| LOCKED_BOM_SNAPSHOT (component display attrs) | 10 | F: Renderer needs enriched BOM |
| DECISION_C6 (tier display names) | 2 | G: Business decision pending |
| DECISION_C7 (bank details, QR) | 2 | G: Legal decision pending |
| SAVINGS_ENGINE (lifetime projections) | 5 | F: 25-year projection needs tariff escalation |
| COMPONENT_DISPLAY_ATTRIBUTES | 2 | F: Panel/inverter display names |
| FINANCE_ENGINE (EMI on alt options) | 3 | D: Expected — alt options not quoted |
| SERVICE_MATRIX (warranty) | 3 | G: No service matrix configured |
| CMS (required documents) | 1 | G: No CMS content |
| ENERGY_LOAD (daily usage) | 1 | F: Load calc not in payload |
| NET_MONTHLY_DURING_EMI | 1 | F: Savings−EMI not computed |
| CUSTOMER_RECORD (address, pincode) | 2 | F: Not in payload customer section |

## 13. SNAPSHOT / FREEZE RESULTS

- Quotation issued successfully as version 1
- `frozen: true` ✓
- `verifyImmutability()`: true ✓
- Re-issue of same version: blocked with error ✓
- BOM snapshot, commercial snapshot, subsidy, finance all frozen in issued document

## 14. SECURITY RESULTS

- `salespersonId` = server-derived `actor.userId` ✓
- Client-asserted fake salesperson ID: **rejected** ✓
- RBAC: ADMIN cannot `createDraft` or `issueQuotation` (QUOTATION_CREATE denied) ✓
- RBAC: SALES can create + issue, ADMIN can register snapshots + view ✓

## 15. BLOCKED FIELDS (renderer)

74 total. See §12 above for full categorization. None are new failures — all are either:
- D: Expected behavior (alt options not generated)
- F: Template/renderer issue (data not flowing to display slots)
- G: Configuration/business decision pending

## 16. NaN / undefined / null

**Zero** in rendered quotation output. ✓

## 17. EXISTING FAILURES (pre-existing, unchanged)

| Test | Count | Nature |
|------|-------|--------|
| Battery hybrid config | 5 | Pre-existing hybrid BOM tests |
| BOM hybrid builder | 4 | Pre-existing BOM hybrid tests |
| Quotation history/security | 1 | Pre-existing security test |
| **Total** | **10** | All pre-existing |

## 18. NEW FAILURES

**Zero.** No regressions introduced. Test suite: 1876 tests, 1832 pass, 10 fail (all pre-existing), 34 cancelled.

## 19. PRODUCTION BLOCKERS

| # | Blocker | Category | Severity | Action Required |
|---|---------|----------|----------|----------------|
| 1 | Margin config — all tiers null | G | **CRITICAL** | Admin must set BASE/VALUE/PREMIUM margin % in cost-config.json |
| 2 | Procurement landed cost — not configured | G | **CRITICAL** | Procurement must enter vendor prices in procurement batches |
| 3 | Transportation — no vehicles | G | MEDIUM | Configure transport vehicles if applicable |
| 4 | Company profile — name/GSTIN/address/bank null | G | **HIGH** | Admin must fill company-profile.json (legal + banking) |
| 5 | Component display attributes | F | MEDIUM | BOM snapshot needs enriched component data for renderer |
| 6 | 25-year savings projection | F | LOW | Tariff escalation config needed in savings-config.json |
| 7 | Service/warranty matrix | G | MEDIUM | Service AMC warranty terms not configured |
| 8 | CMS content (required documents) | G | LOW | CMS page for document checklist |

**Blockers 1–2 prevent ANY quotation from being generated through the production pipeline.** Manual commercial snapshots bypass them for testing only.

## 20. RECOMMENDED NEXT ACTION

1. **IMMEDIATE**: Set gross margin percentages in `data/cost-config.json` → `margin.tiers.BASE/VALUE/PREMIUM.targetMarginPct` — this unblocks the entire cost→pricing→commercial snapshot production pipeline.
2. **IMMEDIATE**: Enter procurement vendor prices — this unblocks material landed cost calculation.
3. **HIGH**: Complete `data/company-profile.json` — company name, GSTIN, registered address, bank details.
4. **MEDIUM**: Enrich BOM snapshot with component display attributes (panel warranty, inverter type, mounting structure brand) so renderer Page 5 tech specs populate.
5. **MEDIUM**: Configure tariff escalation parameters in savings-config.json for 25-year lifetime projections.
6. **LOW**: Build CMS content for required-documents checklist.

**DO NOT CLAIM PRODUCTION READY.** The calculation engines, workspace, payload assembly, generation gate, issuance, freezing, sales identity and renderer all function correctly. But the production pipeline is blocked at the cost→pricing stage because margin and procurement configurations are empty. No real quotation can be generated without administrative data entry for items 1–4 above.

---

## TEST INFRASTRUCTURE

- Test file: `tests/qa-end-to-end-quotation.test.mjs` — 16 tests, 16 pass
- Visual inspection: `tests/qa-pdf-screenshot.mjs` — Playwright Chromium render
- Full regression: 1876 tests, 1832 pass, 10 fail (pre-existing), 34 cancelled, 0 new failures
- Vite build: clean ✓

---

## FILES CHANGED (QA only — no production code modified)

| File | Change |
|------|--------|
| `tests/qa-end-to-end-quotation.test.mjs` | Created — 16 E2E QA tests |
| `tests/qa-pdf-screenshot.mjs` | Created — Playwright visual inspection |
| `tests/qa-render-harness.html` | Created — standalone render harness |

**ZERO production files modified during QA.** ✓

---

**STOP.**
