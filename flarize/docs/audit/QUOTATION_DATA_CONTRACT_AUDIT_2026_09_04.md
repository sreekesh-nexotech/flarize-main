# Quotation Data-Contract Audit (Read-Only) — 2026-09-04

**Scope:** READ-ONLY. No code edited. No template built. No Malayalam. No Page 4. No KSEB implementation. No C7 resolution. No renderer arithmetic.
**Purpose:** enumerate every dynamic field the approved 12-page artwork requires, name its authoritative payload path, and mark whether it is available, blocked, or needs a schema / business decision. The output is the input the template designer needs to build Rev 2 and the input engineering needs to unblock the remaining fields.

**Column key** (identical for every row):
1. **Page** — 1..12
2. **Visual field** — what the approved artwork shows
3. **Token** — proposed `{{ mustache }}` name (kebab-avoided; camelCase)
4. **Payload path** — authoritative snapshot location the renderer reads
5. **Source / engine** — where the value originates
6. **Available today?** — ✅ resolves against a current issued quotation · ⚠️ present but empty · ❌ absent
7. **New schema field?** — Y if a NEW field must be added to a config / data file / engine output
8. **Business / legal approval?** — Y if the value cannot be filled without a business or legal decision
9. **Image slot?** — Y if `<image-slot>` (not `{{mustache}}`)
10. **Repeat block?** — Y if `<template-row for="…">` (a collection, not a scalar)
11. **Blocked?** — Y with named blocker code; else N

Payload sections available today (per `src/lib/quotationPayload.js`):
`quotation, customer, site, system, inclusions, upgrade, engineering, bomSummary, technicalSpecifications, pricing, extras, subsidy, savings, financing, consumption, applianceUsage, energyProfile, testimonials(blocked), campaign, terms(blocked), company, versions, alternatives[]`.

---

## Group 1 — Company identity

| # | Page | Visual field | Token | Payload path | Source | Avail | NewSchema | Approval | ImgSlot | Repeat | Blocked |
|--:|--:|---|---|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 1.1 |  1 | Company Registration | `companyRegistrationNumber` | `payload.company.value.companyRegistration` | `company-profile.json` (`companyRegistration`) | ✅ | N | N | N | N | N |
| 1.2 |  1 | GST No | `companyGstNumber` | `payload.company.value.gstin` | `company-profile.json` (`gstin`) | ⚠️ | N | **Y** | N | N | `C7_GSTIN_DRIFT` — JSON `32AAUFG1464A1ZP` ≠ Page 1 baked `32AAUFC1454A1ZP` (different PAN). Owner: **CA**. |
| 1.3 |  1 | Signature (Team Flarize) | `issuerSignature` | `payload.company.value.signatureImageUri` | company-profile schema | ❌ | **Y** | Y | **Y** | N | `PAGE_1_SIGNATURE_ASSET_MISSING` — no field, no asset store. Owner: **Admin + Legal**. |
| 1.4 |  1 | Seal / stamp | `issuerSeal` | `payload.company.value.sealImageUri` | company-profile schema | ❌ | **Y** | Y | **Y** | N | `PAGE_1_SEAL_ASSET_MISSING`. Owner: **Admin + Legal**. |
| 1.5 |  1 | Salutation "Team Flarize" | `issuerBrandName` | `payload.company.value.displayName` | `company-profile.json` (`displayName`) | ✅ | N | N | N | N | N |
| 1.6 |  4 | "300+ Homes" business claim | `statHomesInstalled` | `payload.company.value.completedInstallations` | company-profile schema | ⚠️ | N | Y | N | N | `COMPANY_STAT_COMPLETED_INSTALLATIONS_NOT_SET` — field defined, currently `null`. Owner: **Admin** (data entry). |
| 1.7 |  4 | "8+ Years" business claim | `statYearsInBusiness` | `payload.company.value.yearsInBusiness` | company-profile schema | ❌ | **Y** | Y | N | N | `COMPANY_STAT_YEARS_IN_BUSINESS_MISSING`. Owner: **Admin + Engineering** (schema extension). |
| 1.8 |  4 | "300+ Projects" | `statProjectsCount` | `payload.company.value.projectsCount` | company-profile schema | ❌ | **Y** | Y | N | N | `COMPANY_STAT_PROJECTS_COUNT_MISSING`. Owner: **Admin + Engineering**. |
| 1.9 |  1 | "MNRE Empanelled" badge | `mnreEmpanelledLabel` | `payload.company.value.mnreEmpanelled` | company-profile schema | ⚠️ | N | Y | N | N | `COMPANY_MNRE_EMPANELLED_NOT_SET` — field defined, currently `null`. Owner: **Admin**. |
| 1.10 | 10, 11 | Legal entity in T&C body | (T&C is static approved artwork) | `payload.company.value.legalName` | `company-profile.json` (`legalName`) | ⚠️ | N | **Y** | N | N | `C7_LEGAL_ENTITY_UNRESOLVED` — JSON = Flarize Tech Pvt. Ltd.; T&C artwork = Golden Ray Renewable Energy. Owner: **Legal**. |

---

## Group 2 — Customer / project identity

Customer object is stored free-shape on the quotation draft (whatever Sales enters) and emitted verbatim under `payload.customer.*`. No strict schema today.

| # | Page | Visual field | Token | Payload path | Source | Avail | NewSchema | Approval | ImgSlot | Repeat | Blocked |
|--:|--:|---|---|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 2.1 |  1 | "Dear <first name>" | `salutationFirstName` | `payload.customer.firstName` (derived from `customer.name` on save, or entered) | Sales wizard input | ✅ | (soft — a `firstName` split may be needed if Sales only enters `name`) | N | N | N | N |
| 2.2 |  1 | Name (full) | `customerFullName` | `payload.customer.name` OR `payload.customer.fullName` | Sales input | ✅ | N | N | N | N | N |
| 2.3 |  1 | Address line 1 | `customerAddressLine1` | `payload.customer.address.line1` | Sales input | ✅ | N | N | N | N | N |
| 2.4 |  1 | Address line 2 | `customerAddressLine2` | `payload.customer.address.line2` | Sales input | ✅ | N | N | N | N | N |
| 2.5 |  1 | Pincode | `customerPincode` | `payload.customer.address.pincode` | Sales input | ✅ | N | N | N | N | N |
| 2.6 |  1 | Phone | `customerPhone` | `payload.customer.phone` | Sales input | ✅ | N | N | N | N | N |
| 2.7 |  1 | Current Bill (amount) | `customerCurrentBillAmount` | `payload.customer.currentBillAmount` | Sales input | ✅ | N | N | N | N | N |
| 2.8 |  1 | Current Bill (cycle: monthly / bi-monthly) | `customerCurrentBillCycle` | `payload.customer.currentBillCycle` | Sales input | ✅ | N | N | N | N | N |
| 2.9 |  1 | System size (customer view) | `systemSize` | `payload.system.value.systemSizeKw` | Sales wizard → project config | ✅ | N | N | N | N | N |
| 2.10 |  1 | Quotation number | `quotationNumber` | `payload.quotation.value.quotationNumber` | `server-sales.js` counter | ✅ | N | N | N | N | N |
| 2.11 |  1 | Proposal By | `proposalBy` | `payload.quotation.value.proposalBy` | Actor session (fallback to admin username) | ✅ | N | N | N | N | N |
| 2.12 |  1 | Quotation Date | `quotationDate` | `payload.quotation.value.quotationDate` | server clock at issue | ✅ | N | N | N | N | N |
| 2.13 |  1 | Valid Until | `validUntil` | `payload.quotation.value.validUntil` | Sales input | ✅ | N | N | N | N | N |
| 2.14 | 6 | Locality city (of THIS customer) | `localityCity` | `payload.customer.address.city` | Sales input | ✅ | N | N | N | N | N |
| 2.15 | 6 | Locality pincode | `localityPincode` | `payload.customer.address.pincode` | Sales input | ✅ | N | N | N | N | N |
| 2.16 |  1 | Language toggle | `quotationLanguage` | `payload.quotation.value.quotationLanguage` | Sales input, default `'en'` | ✅ | N | N | N | N | N — English bundle only today. |

---

## Group 3 — System / package / tier data

| # | Page | Visual field | Token | Payload path | Source | Avail | NewSchema | Approval | ImgSlot | Repeat | Blocked |
|--:|--:|---|---|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 3.1 | 5, 12 | System capacity label ("5 kW") | `systemCapacityLabel` | `payload.system.value.systemSizeKw` | project config | ✅ | N | N | N | N | N |
| 3.2 | 5, 12 | Recommended tier display name | `recommendedTierLabel` | `payload.system.value.packageTierDisplayName` | `data/tier-display-names.json` → resolved by `resolveTierDisplayName` | ✅ | N | N | N | N | N |
| 3.3 | 5 | Elite tier headline ("Micro Inverter Plus") | `eliteTierHeadline` | `payload.alternatives.find(t=premium).payload.system.value.packageHeadline` | package registry | ❌ | **Y** — `packageHeadline` not on package record today | N | N | N | `PACKAGE_HEADLINE_MISSING` — Engineering to add per-package headline copy in `packages.proposed.json`. |
| 3.4 | 5 | Smart tier headline ("Premium string") | `smartTierHeadline` | `payload.system.value.packageHeadline` | same | ❌ | Y | N | N | N | same |
| 3.5 | 5 | Essential tier headline ("Solar System") | `essentialTierHeadline` | `payload.alternatives.find(t=base).payload.system.value.packageHeadline` | same | ❌ | Y | N | N | N | same |
| 3.6 | 5 | Install timeline per tier ("5-10 / 10-15 / 15-20 days") | `installTimelineFeatureRow` | `payload.inclusions.value.tierFeatures[]` | `data/quotation-inclusions.json` | ⚠️ — inclusion matrix exists but its `tierFeatures[]` collection is not yet the shape needed for the row-by-row grid | **Y** — extend inclusion matrix schema | Y | N | **Y** | `PAGE_5_TIER_FEATURES_SCHEMA` — extend inclusion matrix to array-of-features per tier. Owner: **Product + Engineering**. |
| 3.7 | 5 | Warranty years per tier ("5 / 5 / 3") | (same row block) | same | same | ⚠️ | Y | Y | N | Y | same |
| 3.8 | 5 | Service comparison rows (24/7 Priority / WhatsApp / Preventive / Health check / etc.) | (same row block) | same | same | ⚠️ | Y | Y | N | Y | same |
| 3.9 | 12 | "Recommended Package" badge label | `recommendedBadge` | `data/tier-display-names.json` → `recommendedBadge` | tier-display-names | ✅ | N | N | N | N | N |

---

## Group 4 — BOM / hardware data

Every field below reads from `bomSnapshot.components[]` (already frozen per tier via three-tier orchestration).

| # | Page | Visual field | Token / row | Payload path | Source | Avail | NewSchema | Approval | ImgSlot | Repeat | Blocked |
|--:|--:|---|---|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 4.1 | 7 | 3-column hardware spec sheet (Panel Brand + Power/Type, Panel Warranty, Inverter Brand & Warranty, Mounting Structure, Modules per Inverter, DC Cable, AC Cable, Earthing) — 8-10 rows × 3 tier columns | `<template-row for="payload.bomSpecSheet.value.rows">` with per-row `{ specLabel, eliteValue, smartValue, essentialValue }` | `payload.bomSpecSheet.value.rows[]` | NEW `resolveBomSpecSheet(bomSnapshot, alternatives)` derived from existing `bomSnapshot.components` fields (no engine change) | ❌ | **Y** — new payload section built from EXISTING snapshot data | N | N | **Y** | `PAGE_7_BAKED_HARDWARE_SPECS` — payload resolver missing. Owner: **Engineering** (pure copy from bomSnapshot). |
| 4.2 | 7 | Individual component brand strings ("Emmvee / Renewsys / Adani") | (rows above) | `payload.bomSpecSheet.value.rows[i].{eliteValue, smartValue, essentialValue}` | catalog component displayAttributes | ❌ | Y | N | N | Y | same |

Note: `payload.technicalSpecifications` and `payload.bomSummary` already exist and expose `componentIds` + `rows` for the customer-facing set. They are per-tier (per alternative) after three-tier orchestration.

---

## Group 5 — Savings / financial data

All fields read from `payload.savings.value.*` (per-tier via alternatives). Post Track A: `monthlySavings` + `dailySavings` present.

| # | Page | Visual field | Token | Payload path | Source | Avail | NewSchema | Approval | ImgSlot | Repeat | Blocked |
|--:|--:|---|---|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 5.1 | 5 | Daily investment ("₹N/day") — Smart | `dailyValue` | `payload.savings.value.dailySavings` | savingsEngine | ✅ (post Track A) | N | N | N | N | N |
| 5.2 | 5 | Daily investment — Elite | `eliteDaily` | `payload.alternatives.find(t=premium).payload.savings.value.dailySavings` | savingsEngine per tier | ✅ | N | N | N | N | N |
| 5.3 | 5 | Daily investment — Essential | `essentialDaily` | `.…tier=base.…dailySavings` | same | ✅ | N | N | N | N | N |
| 5.4 | 12 | Monthly Savings range ("₹5,183–5,700") | `savingsRange` | `payload.savings.value.{monthlySavingsLow, monthlySavingsHigh}` | savingsEngine | ✅ | N | N | N | N | N |
| 5.5 | 8 | Current KSEB Bill ("₹6,000 bi-monthly") | `currentMonthlyBill` | `payload.savings.value.currentMonthlyBill` | savingsEngine | ✅ | N | N | N | N | N |
| 5.6 | 8 | With Solar monthly bill range ("₹250–380/month") | `postSolarBillRange` | `payload.savings.value.{postSolarBillLow, postSolarBillHigh}` | savingsEngine | ✅ | N | N | N | N | N |
| 5.7 | 8 | Payback ("In just 35 months") | `paybackMonths` | `payload.savings.value.returnPeriodMonths` | savingsEngine | ✅ | N | N | N | N | N |
| 5.8 | 8 | 25-year cumulative chart series (25 data points × 2 series) | `<template-row for="payload.savings.value.yearlySeries">` | `payload.savings.value.yearlySeries[]` | savingsEngine — currently `null` | ❌ | **Y** — new engine field | **Y** — needs degradation + escalation approved | N | **Y** | `SAVINGS_ENGINE_YEARLY_SERIES_NOT_APPROVED` — `savings-config.json` says degradation + tariff escalation `NOT_APPROVED`. Owner: **Commercial**. |
| 5.9 | 8 | "₹20+ lakh paid to KSEB in 25 years" | `lifetimeKsebPaid25Years` | `payload.savings.value.lifetimeKSEBSpend` | savingsEngine — `null` | ❌ | N (field exists) | Y | N | N | same blocker |
| 5.10 | 8 | "₹13 lakh saved over 25 years" | `lifetime25yrSavings` | `payload.savings.value.lifetimeSavingsAmount` | savingsEngine — `null` | ❌ | N | Y | N | N | same blocker |
| 5.11 | 8 | Tariff escalation caption ("8-12% yearly") | `tariffEscalationRange` | `payload.savings.value.{tariffEscalationLow, tariffEscalationHigh}` | savingsEngine — `null` | ❌ | N | Y | N | N | same blocker |
| 5.12 | 12 | "25-Year Net Savings ₹13,60,000+" | `lifetime25yrNetSavings` | `payload.savings.value.lifetime25yrNetSavings` (**new field**) | savingsEngine derived from lifetimeSavings – subsidy pass-through | ❌ | **Y** | Y | N | N | same blocker |
| 5.13 | 5, 7 | EMI amount "N yrs @ M%" | `emiLabel` | `payload.financing.value.{tenureYears, interestRatePct}` | financeEngine | ✅ | N | N | N | N | N |
| 5.14 | 5, 7 | EMI base "on ₹N" | `emiOn` | `payload.financing.value.postSubsidyInvestment` | financeEngine | ✅ | N | N | N | N | N |
| 5.15 | 5, 7 | EMI value "₹N/mo" (Smart / recommended) | `emiValue` | `payload.financing.value.monthlyEMI` | financeEngine | ✅ | N | N | N | N | N |
| 5.16 | 5, 7 | EMI value per tier | `eliteEmiValue` / `smartEmiValue` / `essentialEmiValue` | `payload.alternatives.….financing.value.monthlyEMI` | financeEngine per tier | ✅ | N | N | N | N | N |
| 5.17 | 5, 7 | Down payment label ("Down Payment (10%)") | `downLabel` | `payload.financing.value.downPaymentPercentage` | financeEngine | ✅ | N | N | N | N | N |
| 5.18 | 5, 7 | Down payment amount per tier | `eliteDown` / `smartDown` / `essentialDown` | `payload.….financing.value.downPaymentAmount` | financeEngine per tier | ✅ | N | N | N | N | N |
| 5.19 | 5, 7, 12 | Post-subsidy investment per tier | `eliteFin` / `smartFin` / `essentialFin` | `payload.….financing.value.postSubsidyInvestment` | financeEngine per tier | ✅ | N | N | N | N | N |
| 5.20 | 5, 7, 12 | Tier price per tier ("Total System Cost") | `eliteCost` / `smartCost` / `essentialCost` | `payload.….pricing.value.customerTotalIncludingGST` | commercialSnapshot (pricingEngine) | ✅ | N | N | N | N | N |

---

## Group 6 — Subsidy / KSEB data

| # | Page | Visual field | Token | Payload path | Source | Avail | NewSchema | Approval | ImgSlot | Repeat | Blocked |
|--:|--:|---|---|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 6.1 | 1 | Subsidy chip "₹78,000" | `subsidyHeadlineAmount` | `payload.subsidy.value.subsidyAmount` | subsidyEngine (PMSG) | ✅ | N | N | N | N | N |
| 6.2 | 1 | Subsidy program caption "PM Surya Ghar" | `subsidyProgramName` | `payload.subsidy.value.schemeName` | subsidyEngine | ✅ | N | N | N | N | N |
| 6.3 | 5, 12 | Subsidy negative line ("−₹78,000") | `smartSubsidyMinus` | `payload.subsidy.value.subsidyAmount` (formatted negative) | subsidyEngine | ✅ | N | N | N | N | N |
| 6.4 | 7 | Subsidy amount row (positive) | `subsidyAmt` | `payload.subsidy.value.subsidyAmount` | subsidyEngine | ✅ | N | N | N | N | N |
| 6.5 | 5 | Subsidy amount in body copy ("all prices after ₹78,000 …") | `subsidyAmountInCopy` | `payload.subsidy.value.subsidyAmount` | subsidyEngine | ✅ | N | N | N | N | N |
| 6.6 | 9 | KSEB refund per kW ("1000 per kw + 18% tax") | `ksebRegistrationFeePerKw` + `ksebGstOnFeePct` | `payload.subsidy.value.kseb.{registrationFeePerKw, gstOnFeePct}` | NEW `data/subsidy-config.json` → `kseb` section | ❌ | **Y** | **Y** | N | N | `KSEB_AUTHORITY_UNVERIFIED` (DECISION_LOG.md:520 "Not supplied"). Owner: **Commercial**. |
| 6.7 | 9 | KSEB refund fraction ("80% of pre-tax") | `ksebRefundEligibleFractionPct` | `payload.subsidy.value.kseb.refundEligibleFractionPct` | same | ❌ | Y | Y | N | N | same |
| 6.8 | 9 | KSEB refund for system size ("5kw – Rs 4000") | `ksebRefundForSystemSize` | `payload.subsidy.value.kseb.refundAmountForSize` | subsidyEngine (derived once config exists) | ❌ | Y | Y | N | N | same |
| 6.9 | 9 | Booking fee ("Pay ₹5,000") | `bookingFeeAmount` | `payload.system.value.bookingFeeAmount` OR `payload.subsidy.value.bookingFeeAmount` | NEW config field | ❌ | **Y** | Y | N | N | `BOOKING_FEE_NOT_CONFIGURED`. Owner: **Business + Engineering**. |
| 6.10 | 9 | Loan disbursement % ("80% loan amount") | `loanDisbursementPct` | `payload.financing.value.loanDisbursementPct` (**new field**) | financeEngine (currently absent) | ❌ | **Y** | Y | N | N | `FINANCE_LOAN_DISBURSEMENT_PCT_NOT_CONFIGURED`. Owner: **Commercial + Engineering**. |

---

## Group 7 — Offers / commercial data

Campaign already flows through `payload.campaign.value.*` (per §Track B of NEXT_GATE_TRACE). Baked Page 2 needs template slots to consume it.

| # | Page | Visual field | Token | Payload path | Source | Avail | NewSchema | Approval | ImgSlot | Repeat | Blocked |
|--:|--:|---|---|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 7.1 | 2 | Campaign headline ("Celebrate Onam with Flarize!") | `campaignHeadline` | `payload.campaign.value.headline` | cmsStore | ✅ | N | N | N | N | N |
| 7.2 | 2 | Campaign sub-headline (Malayalam) | `campaignSubheadline` | `payload.campaign.value.subheadline` | cmsStore | ✅ | N | N | N | N | N |
| 7.3 | 2 | Primary benefit amount ("₹40,000") | `campaignPrimaryBenefitAmount` | `payload.campaign.value.primaryBenefit.amount` | cmsStore | ✅ | N | N | N | N | N |
| 7.4 | 2 | Campaign period from ("28 JULY") | `campaignPeriodFrom` | `payload.campaign.value.period.from` | cmsStore (D6 approved) | ✅ | N | N | N | N | N |
| 7.5 | 2 | Campaign period to ("12 AUGUST") | `campaignPeriodTo` | `payload.campaign.value.period.to` | cmsStore | ✅ | N | N | N | N | N |
| 7.6 | 2 | Urgency slot count ("Only 5 slots") | `campaignSlotCount` | `payload.campaign.value.urgency.slotCount` | cmsStore | ✅ | N | N | N | N | N |
| 7.7 | 2 | Lucky-draw prize label ("Electric Scooter") | `campaignLuckyDrawPrize` | `payload.campaign.value.luckyDraw.prize` | cmsStore | ✅ | N | N | N | N | N |
| 7.8 | 2 | AC-voucher benefit label | `campaignBenefitAcLabel` | `payload.campaign.value.offers[0].label` | cmsStore | ✅ | N | N | N | N | N |
| 7.9 | 2 | Hybrid-upgrade benefit label | `campaignBenefitHybridLabel` | `payload.campaign.value.offers[1].label` | cmsStore | ✅ | N | N | N | N | N |
| 7.10 | 2 | Referral benefit label | `campaignReferralLabel` | `payload.campaign.value.referral.label` | cmsStore | ✅ | N | N | N | N | N |
| 7.11 | 2 | Scooter image | (see §image-slot registry `ofr-scooter`) | `payload.campaign.value.artwork.scooterImageUri` | cmsStore | ✅ | N | N | **Y** | N | N (already implemented via IMAGE_SLOT_REGISTRY) |
| 7.12 | 2 | AC-voucher image | `ben-ac1` | `payload.campaign.value.artwork.acVoucherImageUri` | cmsStore | ✅ | N | N | **Y** | N | N |
| 7.13 | 2 | Hybrid inverter image | `ben-ac2` | `payload.campaign.value.artwork.hybridInverterImageUri` | cmsStore | ✅ | N | N | **Y** | N | N |
| 7.14 | 2 | Festive gift image | `ben-ac3` | `payload.campaign.value.artwork.festiveGiftImageUri` | cmsStore | ✅ | N | N | **Y** | N | N |

**Guard needed:** `PAGE_2_CAMPAIGN_MISMATCH` — if active campaign snapshot `id/template` ≠ baked Onam artwork, renderer must refuse issuance until template Rev 2 lands. Owner: Engineering (guard). No new schema.

---

## Group 8 — Testimonials / locality claims

| # | Page | Visual field | Token / row | Payload path | Source | Avail | NewSchema | Approval | ImgSlot | Repeat | Blocked |
|--:|--:|---|---|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 8.1 | 6 | Locality banner homes count | `localityHomesInstalledCount` | `payload.testimonials.value.localityStats[<pincode>].count` | NEW section (currently `payload.testimonials = blockedSection({CMS})`) | ❌ | **Y** | Y | N | N | `TESTIMONIALS_STORE_MISSING`. Owner: **Marketing + Engineering**. |
| 8.2 | 6 | District installations count + year | `districtHomesInstalledCount`, `districtStatsYear` | `payload.testimonials.value.districtStats[<district>].{count,year}` | NEW section | ❌ | Y | Y | N | N | same |
| 8.3 | 6 | 3 testimonial cards (name / locality / system size / install month / quote / before-after bill / monthly savings / photo) | `<template-row for="payload.testimonials.value.items" limit="3">` | `payload.testimonials.value.items[]` | NEW CMS section OR admin data file | ❌ | Y | Y | (per-row photo → slot) | **Y** | same |
| 8.4 | 6 | Testimonial video URL | `testimonialsVideoUrl` | `payload.testimonials.value.videoUrl` | NEW | ❌ | Y | Y | N | N | same |

Also DECISION_LOG entry `Testimonials source and consent | Phase 5 | Marketing | Not supplied` — legal consent to publish named customers must accompany the data.

---

## Group 9 — Bank / payment data

| # | Page | Visual field | Token | Payload path | Source | Avail | NewSchema | Approval | ImgSlot | Repeat | Blocked |
|--:|--:|---|---|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 9.1 | 8 | Bank name | `bankName` | `payload.company.value.bankName` | company-profile schema | ⚠️ | N | **Y** | N | N | `C7_BANK_ENTITY_LEAKS` + `BANK_FIELDS_NOT_SET` (all null). Owner: **Legal + Admin**. |
| 9.2 | 8 | Account holder | `bankAccountName` | `payload.company.value.bankAccountName` | same | ⚠️ | N | Y | N | N | same |
| 9.3 | 8 | Account number | `bankAccountNumber` | `payload.company.value.bankAccountNumber` | same | ⚠️ | N | Y | N | N | same |
| 9.4 | 8 | IFSC | `bankIfsc` | `payload.company.value.bankIfsc` | same | ⚠️ | N | Y | N | N | same |
| 9.5 | 8 | Branch | `bankBranch` | `payload.company.value.bankBranch` | schema **missing** | ❌ | **Y** | Y | N | N | `COMPANY_BANK_BRANCH_MISSING`. Owner: **Engineering + Admin**. |
| 9.6 | 8 | UPI ID | `upiId` | `payload.company.value.upiId` | schema **missing** | ❌ | **Y** | Y | N | N | `COMPANY_UPI_ID_MISSING`. Owner: **Engineering + Admin**. |
| 9.7 | 8 | UPI QR image | `paymentQr` (image-slot) | `payload.company.value.upiQrImageUri` | schema **missing** | ❌ | **Y** | Y | **Y** | N | `COMPANY_UPI_QR_MISSING`. Owner: **Engineering + Admin**. |
| 9.8 | 8 | Payment instructions caption | `paymentInstructions` | `payload.company.value.paymentInstructions` | schema | ⚠️ | N | Y | N | N | field defined, null. |
| 9.9 | 8 | Required-documents list (8 items) | (static approved copy) | — | approved artwork | ✅ (static) | N | N | N | N | N |
| 9.10 | 8 | Additional structure rate ("₹500/kW") | `additionalStructureRatePerKw` | `payload.system.value.additionalStructureRatePerKw` (**new field**) | costEngine config OR project-rate-card | ❌ | **Y** | Y | N | N | `ADDITIONAL_STRUCTURE_RATE_NOT_CONFIGURED`. Owner: **Project Head + Engineering**. |

---

## Group 10 — Legal / terms

| # | Page | Visual field | Token | Payload path | Source | Avail | NewSchema | Approval | ImgSlot | Repeat | Blocked |
|--:|--:|---|---|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 10.1 | 10, 11 | T&C clauses 1-19 body | (static approved artwork) | — | approved template artwork | ✅ | N | Y (legal review of clauses) | N | N | N — treat body as immutable; edits are template revisions. |
| 10.2 | 10, 11 | Warrantor / payee / defendant name in clauses | (baked artwork today; if made dynamic → `payload.company.value.legalName`) | company-profile | ⚠️ | N | **Y** | N | N | `C7_TERMS_ENTITY_LEAKS` — artwork says "Golden Ray Renewable Energy"; JSON says Flarize Tech Pvt. Ltd. Owner: **Legal**. |
| 10.3 | 10, 11 | Warranty duration ("5 year for complete solar system") | (static in clause 1) | if dynamic → `payload.company.value.systemWarrantyYears` | schema **missing** | ❌ | N (static acceptable if approved) | Y | N | N | non-blocking unless business wants dynamic. |
| 10.4 | 10, 11 | Refund window ("within 7 working days") | (static clause 6) | — | approved | ✅ | N | Y | N | N | N |
| 10.5 | 10, 11 | Jurisdiction ("Kerala") | (static clause 19) | — | approved | ✅ | N | Y | N | N | N |

---

## Group 11 — Footer / contact data

Same 4 fields per page footer strip (Pages 1, 2, 3, 4, 6, 8, 9, 10, 11, 12). Pages 5 and 7 currently bake a DIFFERENT footer (Golden Ray domain) — C7 conflict.

| # | Page(s) | Visual field | Token | Payload path | Source | Avail | NewSchema | Approval | ImgSlot | Repeat | Blocked |
|--:|--:|---|---|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 11.1 | 1-12 (except 5, 7) | Footer address | `companyAddress` | `payload.company.value.address` (+ `city`, `pincode`) | company-profile | ✅ | N | N | N | N | N |
| 11.2 | 1-12 (except 5, 7) | Footer website | `companyWebsite` | `payload.company.value.website` | company-profile | ✅ | N | N | N | N | N |
| 11.3 | 1-12 (except 5, 7) | Footer email | `companyEmail` | `payload.company.value.email` | company-profile | ✅ | N | N | N | N | N |
| 11.4 | 1-12 (except 5, 7) | Footer phone | `companyPhone` | `payload.company.value.phone` | company-profile | ✅ | N | N | N | N | N |
| 11.5 | 5, 7 | Alternate footer (goldenray.in / goldenray@gmail.com / +91 6282 922 988) | (same 4 tokens as above once C7 resolves) | `payload.company.value.*` OR two-entity `payload.company.value.marketingBrand.footer.*` | company-profile OR C7 Option C model | ⚠️ | depends on C7 outcome | **Y** | N | N | `C7_FOOTER_MULTI_DOMAIN`. Owner: **Legal**. |

---

## A. COMPLETE TOKEN CONTRACT

Every `{{ mustache }}` the approved Rev 2 template must declare, with authoritative payload path. Reads may traverse `payload.alternatives.find(a => a.tier === '<internal>').payload.*` for per-tier tokens.

| Token | Path | Avail |
|---|---|:-:|
| `salutationFirstName` | `payload.customer.firstName` | ✅ |
| `customerFullName` | `payload.customer.name` | ✅ |
| `customerAddressLine1` | `payload.customer.address.line1` | ✅ |
| `customerAddressLine2` | `payload.customer.address.line2` | ✅ |
| `customerPincode` | `payload.customer.address.pincode` | ✅ |
| `customerPhone` | `payload.customer.phone` | ✅ |
| `customerCurrentBillAmount` | `payload.customer.currentBillAmount` | ✅ |
| `customerCurrentBillCycle` | `payload.customer.currentBillCycle` | ✅ |
| `systemSize` | `payload.system.value.systemSizeKw` | ✅ |
| `systemCapacityLabel` | `payload.system.value.systemSizeKw` | ✅ |
| `recommendedTierLabel` | `payload.system.value.packageTierDisplayName` | ✅ |
| `recommendedBadge` | derived from `data/tier-display-names.json.recommendedBadge` (renderer passes via loader; not on payload) | ✅ |
| `quotationNumber` | `payload.quotation.value.quotationNumber` | ✅ |
| `proposalBy` | `payload.quotation.value.proposalBy` | ✅ |
| `quotationDate` | `payload.quotation.value.quotationDate` | ✅ |
| `validUntil` | `payload.quotation.value.validUntil` | ✅ |
| `companyLegalName` | `payload.company.value.legalName` | ⚠️ C7 |
| `companyGstNumber` | `payload.company.value.gstin` | ⚠️ C7 |
| `companyRegistrationNumber` | `payload.company.value.companyRegistration` | ✅ |
| `companyAddress` | `payload.company.value.address` | ✅ |
| `companyWebsite` | `payload.company.value.website` | ✅ |
| `companyEmail` | `payload.company.value.email` | ✅ |
| `companyPhone` | `payload.company.value.phone` | ✅ |
| `subsidyHeadlineAmount` | `payload.subsidy.value.subsidyAmount` | ✅ |
| `subsidyProgramName` | `payload.subsidy.value.schemeName` | ✅ |
| `subsidyAmountInCopy` | `payload.subsidy.value.subsidyAmount` | ✅ |
| `subsidyAmt` | `payload.subsidy.value.subsidyAmount` (positive) | ✅ |
| `smartSubsidyMinus` | `payload.subsidy.value.subsidyAmount` (negative-formatted) | ✅ |
| `mnreEmpanelledLabel` | `payload.company.value.mnreEmpanelled` | ⚠️ admin |
| `statHomesInstalled` / `statYearsInBusiness` / `statProjectsCount` | `payload.company.value.{completedInstallations, yearsInBusiness, projectsCount}` | ⚠️ / ❌ / ❌ |
| `eliteCost` / `smartCost` / `essentialCost` | `payload.….pricing.value.customerTotalIncludingGST` | ✅ |
| `eliteDown` / `smartDown` / `essentialDown` | `payload.….financing.value.downPaymentAmount` | ✅ |
| `eliteFin` / `smartFin` / `essentialFin` | `payload.….financing.value.postSubsidyInvestment` | ✅ |
| `downLabel` | `payload.financing.value.downPaymentPercentage` | ✅ |
| `emiLabel` | `payload.financing.value.{tenureYears, interestRatePct}` | ✅ |
| `emiOn` | `payload.financing.value.postSubsidyInvestment` | ✅ |
| `emiValue` | `payload.financing.value.monthlyEMI` | ✅ |
| `eliteEmiValue` / `smartEmiValue` / `essentialEmiValue` | `payload.….financing.value.monthlyEMI` | ✅ |
| `dailyValue` | `payload.savings.value.dailySavings` | ✅ (Track A) |
| `eliteDaily` / `smartDaily` / `essentialDaily` | `payload.….savings.value.dailySavings` | ✅ |
| `savingsRange` | `payload.savings.value.{monthlySavingsLow, monthlySavingsHigh}` | ✅ |
| `currentMonthlyBill` | `payload.savings.value.currentMonthlyBill` | ✅ |
| `postSolarBillRange` | `payload.savings.value.{postSolarBillLow, postSolarBillHigh}` | ✅ |
| `paybackMonths` | `payload.savings.value.returnPeriodMonths` | ✅ |
| `tariffEscalationRange` | `payload.savings.value.{tariffEscalationLow, tariffEscalationHigh}` | ❌ NOT_APPROVED |
| `lifetimeKsebPaid25Years` | `payload.savings.value.lifetimeKSEBSpend` | ❌ NOT_APPROVED |
| `lifetime25yrSavings` | `payload.savings.value.lifetimeSavingsAmount` | ❌ NOT_APPROVED |
| `lifetime25yrNetSavings` | `payload.savings.value.lifetime25yrNetSavings` **(new)** | ❌ NOT_APPROVED |
| `dailyGenerationRange` | `payload.energyProfile.value.{dailyGenerationLow, dailyGenerationHigh}` | ⚠️ ENERGY_ENGINE not run |
| `monthlyKsebValueRange` | `payload.energyProfile.value.{monthlyKsebValueLow, monthlyKsebValueHigh}` | ⚠️ same |
| `homeUsesUnitsPerDay` | `payload.energyProfile.value.homeUsesUnitsPerDay` | ⚠️ same |
| `surplusExportedRange` | `payload.energyProfile.value.{surplusExportedLow, surplusExportedHigh}` | ⚠️ same |
| `totalDailyUsage` | `payload.applianceUsage.value.totalDailyUsage` | ⚠️ same |
| `campaignHeadline` | `payload.campaign.value.headline` | ✅ |
| `campaignSubheadline` | `payload.campaign.value.subheadline` | ✅ |
| `campaignPrimaryBenefitAmount` | `payload.campaign.value.primaryBenefit.amount` | ✅ |
| `campaignPeriodFrom` / `campaignPeriodTo` | `payload.campaign.value.period.{from,to}` | ✅ |
| `campaignSlotCount` | `payload.campaign.value.urgency.slotCount` | ✅ |
| `campaignLuckyDrawPrize` | `payload.campaign.value.luckyDraw.prize` | ✅ |
| `campaignBenefitAcLabel` / `campaignBenefitHybridLabel` / `campaignReferralLabel` | `payload.campaign.value.offers[0..1].label`, `payload.campaign.value.referral.label` | ✅ |
| `bankName` / `bankAccountName` / `bankAccountNumber` / `bankIfsc` | `payload.company.value.bank*` | ⚠️ all null |
| `bankBranch` | `payload.company.value.bankBranch` **(new)** | ❌ |
| `upiId` | `payload.company.value.upiId` **(new)** | ❌ |
| `paymentInstructions` | `payload.company.value.paymentInstructions` | ⚠️ null |
| `additionalStructureRatePerKw` | `payload.system.value.additionalStructureRatePerKw` **(new)** | ❌ |
| `bookingFeeAmount` | `payload.system.value.bookingFeeAmount` **(new)** | ❌ |
| `loanDisbursementPct` | `payload.financing.value.loanDisbursementPct` **(new)** | ❌ |
| `ksebRegistrationFeePerKw` / `ksebGstOnFeePct` / `ksebRefundEligibleFractionPct` / `ksebRefundForSystemSize` | `payload.subsidy.value.kseb.*` **(new)** | ❌ KSEB_AUTHORITY_UNVERIFIED |
| `eliteTierHeadline` / `smartTierHeadline` / `essentialTierHeadline` | `payload.….system.value.packageHeadline` **(new)** | ❌ |
| `localityCity` / `localityPincode` | `payload.customer.address.{city, pincode}` | ✅ |
| `localityHomesInstalledCount` / `districtHomesInstalledCount` / `districtStatsYear` | `payload.testimonials.value.{localityStats, districtStats}` **(new section)** | ❌ TESTIMONIALS_STORE_MISSING |
| `testimonialsVideoUrl` | `payload.testimonials.value.videoUrl` **(new)** | ❌ |

## B. COMPLETE IMAGE-SLOT CONTRACT

| id | Page | Default UUID (manifest) | Override payload path | Blocked? |
|---|--:|---|---|---|
| `ofr-scooter` | 2 | `16d6bc21-…` | `payload.campaign.value.artwork.scooterImageUri` | N (implemented) |
| `ben-ac1` | 2 | `563c0494-…` | `payload.campaign.value.artwork.acVoucherImageUri` | N (implemented) |
| `ben-ac2` | 2 | `0cf315e2-…` | `payload.campaign.value.artwork.hybridInverterImageUri` | N (implemented) |
| `ben-ac3` | 2 | `d2af45dc-…` | `payload.campaign.value.artwork.festiveGiftImageUri` | N (implemented) |
| `issuer-signature` | 1 | (approved default) | `payload.company.value.signatureImageUri` **(new)** | `PAGE_1_SIGNATURE_ASSET_MISSING` |
| `issuer-seal` | 1 | (approved default) | `payload.company.value.sealImageUri` **(new)** | `PAGE_1_SEAL_ASSET_MISSING` |
| `payment-qr` | 8 | (approved default) | `payload.company.value.upiQrImageUri` **(new)** | `COMPANY_UPI_QR_MISSING` |
| `testimonial-photo-{n}` (n=1..3) | 6 | approved defaults per card | `payload.testimonials.value.items[n].photoUri` **(new)** | `TESTIMONIALS_STORE_MISSING` |

## C. COMPLETE REPEAT-BLOCK CONTRACT

| Page | Purpose | `for="…"` collection | Per-row shape | Blocked? |
|--:|---|---|---|---|
|  3 | Appliance table (8 rows) | `payload.applianceUsage.value.appliances` | `{ icon, name, quantity, hoursPerDay, unitsPerDay }` | `ENERGY_ENGINE_APPLIANCE_ARRAY_MISSING` — engine emits `homeUsesUnitsPerDay` etc. as scalars but the appliance array is empty; also entire section is `blocked` when energy engine did not run. Owner: **Engineering** (energyEngine schema). |
|  5 | Tier feature comparison rows (install timeline / warranty / WhatsApp / Preventive / Health check / Panel Cleaning / Standby Inverter / Priority Queue / Annual Audit) | `payload.inclusions.value.tierFeatures` | `{ name, essentialValue, smartValue, eliteValue }` | `PAGE_5_TIER_FEATURES_SCHEMA` — inclusion-matrix schema extension required. |
|  6 | Testimonial cards (limit 3) | `payload.testimonials.value.items` (limit 3) | `{ name, locality, systemSizeKw, installedMonth, quote, beforeBill, afterBill, monthlySavings, photoUri }` | `TESTIMONIALS_STORE_MISSING`. |
|  7 | Hardware spec sheet (8-10 rows × 3 tier columns) | `payload.bomSpecSheet.value.rows` | `{ specLabel, eliteValue, smartValue, essentialValue }` | `PAGE_7_BAKED_HARDWARE_SPECS` — new `resolveBomSpecSheet` needed. |
|  8 | 25-year cumulative-cost chart series | `payload.savings.value.yearlySeries` (limit 25) | `{ year, cumulativeWithoutSolar, cumulativeWithSolar }` | `SAVINGS_ENGINE_YEARLY_SERIES_NOT_APPROVED`. |

## D. BUSINESS / LEGAL DECISIONS REQUIRED BEFORE TEMPLATE REV 2

| Decision | Owner | Blocks |
|---|---|---|
| C7 legal entity — which entity issues quotations (Flarize Tech Pvt. Ltd. / Golden Ray Renewable Energy LLP / two-entity model) | Legal | Group 1, 9, 10, 11 (bank block + T&C body + Pages 5/7 footer) |
| C7 GST drift — JSON vs Page 1 baked GST (different PANs) | CA | Group 1 |
| Bank account holder — which entity owns Union Bank a/c `510 101 0069 819 30` | Legal | Group 9 |
| Bank fields data entry (name/holder/no/IFSC/branch/UPI/QR/instructions) | Admin | Group 9 |
| `completedInstallations` count (business claim) | Admin | Group 1.6 |
| `mnreEmpanelled` badge (verify credential + date) | Admin + Legal | Group 1.9 |
| `yearsInBusiness` + `projectsCount` — real values | Admin + Marketing | Group 1.7, 1.8 |
| Signature + seal image assets — who's signature/seal legitimately signs quotations | Legal | Group 1.3, 1.4 |
| Package headlines per tier ("Micro Inverter Plus" / "Premium string" / "Solar System") | Product | Group 3.3-3.5 |
| Tier feature matrix — every row of Page 5 comparison approved as business truth | Product + Service | Group 3.6-3.8 |
| Booking fee amount (Page 9 "Pay ₹5,000") | Business | Group 6.9 |
| Loan disbursement % (Page 9 "80%") | Commercial + Bank partner | Group 6.10 |
| Additional structure rate ("₹500/kW") — pricing decision | Project Head | Group 9.10 |
| Savings degradation rate — % per year | Commercial | Group 5.8-5.12 |
| Savings tariff escalation — Low % / High % / year | Commercial | Group 5.8-5.12 |
| 25-year net savings claim & liability | Commercial + Legal | Group 5.12 |
| KSEB registration fee / GST / refund fraction with citation | Commercial (KSEB circular) | Group 6.6-6.8 |
| Testimonials — 3 named customer consents to publish | Marketing + Legal | Group 8 |
| Locality/district installation-count claims per pincode/district | Marketing (backed by real data) | Group 8.1-8.2 |
| Language: Malayalam Rev 2 template — approve? | Business | Group 2.16 (future) |

## E. ENGINEERING CHANGES REQUIRED BEFORE TEMPLATE REV 2

Only additive schema/config work. No engine formula changes.

| Change | File(s) | Blocked field(s) cleared |
|---|---|---|
| Extend `data/company-profile.json` schema in `server-company.js` `buildProfile` — add `bankBranch`, `upiId`, `upiQrImageUri`, `signatureImageUri`, `sealImageUri`, `yearsInBusiness`, `projectsCount`, optional `paymentInstructions` | server-company.js + admin UI | Groups 1.3, 1.4, 1.7, 1.8, 9.5-9.7 |
| Add `packageHeadline` field to package records in `packages.proposed.json` and expose on `payload.system.value` | Data + `resolveInputs` | Group 3.3-3.5 |
| Extend `data/quotation-inclusions.json` to a `tierFeatures[]` array shape (currently flat inclusion strings) + expose under `payload.inclusions.value.tierFeatures` | Data + `resolveInclusionMatrix` | Group 3.6-3.8 |
| Add `resolveBomSpecSheet(bomSnapshot, alternatives)` helper in `quotationWorkspace.js` — pure copy from existing bomSnapshot fields; emits `payload.bomSpecSheet.value.rows[]` | `quotationWorkspace.js` (this is protected — will require an explicit gate) | Group 4.1-4.2 |
| Add `bookingFeeAmount` to `costEngine`/config + expose under `payload.system.value.bookingFeeAmount` | config + engine | Group 6.9 |
| Add `additionalStructureRatePerKw` under `payload.system.value.additionalStructureRatePerKw` — read from existing `project-rate-card.json` | `resolveInputs` | Group 9.10 |
| Add `loanDisbursementPct` on `financeEngine` return (config-driven) | financeEngine + config | Group 6.10 |
| Add `kseb.{registrationFeePerKw,gstOnFeePct,refundEligibleFractionPct,refundAmountForSize}` under `payload.subsidy.value.kseb.*` — subsidyEngine additive, only after `KSEB_AUTHORITY_UNVERIFIED` cleared | subsidy-config.json + subsidyEngine | Group 6.6-6.8 |
| Add `yearlySeries[]`, `lifetimeKSEBSpend`, `lifetimeSavingsAmount`, `lifetime25yrNetSavings`, `tariffEscalationLow/High` on `savingsEngine` — additive, only after degradation + escalation approved in `savings-config.json` | savings-config.json + savingsEngine | Group 5.8-5.12 |
| Wire `energyEngine` output `appliances[]` array (currently empty) — requires ENERGY_LOAD_CALCULATION_ENGINE build | energyEngine + config | Group 5 (Page 3 repeat block) + Group 3 Page 3 mustaches |
| NEW `payload.testimonials.value.*` — replace current `blockedSection(CMS)` with a real testimonial store (CMS section or admin data file) | new store + `resolveInputs` | Group 8 |
| `firstName` split — either accept `customer.firstName` as a first-class Sales input or derive it from `customer.name` in `resolveInputs` | quotationWorkspace | Group 2.1 |
| Optionally: two-entity model in company-profile (`marketingBrand{name,footer}` + `legalEntity{name,gstin,registration,bank}`) — only if C7 lands on Option C | server-company.js + admin UI | Group 1, 9, 10, 11 |
| Feature flag `USE_APPROVED_TEMPLATE_RENDERER` in quotation route — required at Step 9 cutover; not this gate | server-quotation.js | old renderer retirement |

## F. FIELDS ALREADY AVAILABLE (no engine change, ready for template Rev 2)

44 tokens + 4 image-slots. Template designer can bind these without waiting on any engineering work:

- Every customer identity field (§2 all rows except firstName-split-if-needed).
- Every quotation metadata field (`quotationNumber`, `proposalBy`, `quotationDate`, `validUntil`, `quotationLanguage`, `district`).
- Company identity where JSON already provides it: `companyRegistration`, `displayName`, `address`, `city`, `state`, `pincode`, `phone`, `email`, `website`.
- System capacity + package tier display name.
- Recommended tier badge (from tier-display-names).
- Full pricing tier trio (`eliteCost`/`smartCost`/`essentialCost`).
- Full financing tier trio (`eliteDown`/`smartDown`/`essentialDown`, `eliteFin`/`smartFin`/`essentialFin`, `eliteEmiValue`/`smartEmiValue`/`essentialEmiValue`).
- Financing scalars (`downLabel`, `emiLabel`, `emiOn`, `emiValue`).
- Daily-savings tier trio (`dailyValue`, `eliteDaily`, `smartDaily`, `essentialDaily`) — post Track A.
- Monthly savings range (`savingsRange`).
- Current & post-solar bills, payback months.
- Subsidy: `subsidyHeadlineAmount`, `subsidyProgramName`, `subsidyAmt`, `smartSubsidyMinus`, `subsidyAmountInCopy`.
- Campaign snapshot: `campaignHeadline`, `campaignSubheadline`, `campaignPrimaryBenefitAmount`, `campaignPeriodFrom`, `campaignPeriodTo`, `campaignSlotCount`, `campaignLuckyDrawPrize`, `campaignBenefitAcLabel`, `campaignBenefitHybridLabel`, `campaignReferralLabel`.
- Image-slots: `ofr-scooter`, `ben-ac1`, `ben-ac2`, `ben-ac3`.

## G. Protected file SHA-256 (proving nothing was touched this gate)

```
fb3a223ec2e25e1b6279ce797ab5ce33313933d46e599dbef18e04dd29d9d369  public/lib/quotationDocument.js
1263eb6051cf3bd11ad8680df591207bf21c459b03893e538d21fe4ed0d30c5e  src/lib/quotationPayload.js
0b72297fc05af77868daf75492feb5bf6108db780c21f3e287baf5f3f6ff342f  src/lib/quotationWorkspace.js
b6ee89dcbf618f24d3add40c1fd883c9858111d9109fd5faafa2451e550c9c86  src/lib/costEngine.js
8b9e5db2113df46ab7d3049d3fcae413c7c88efaea174e6ed149bd2895c30ca9  src/lib/pricingEngine.js
648ac533a64693d678810c7b20a2359c974900b1a847e4f855f6088698ae6de7  src/lib/subsidyEngine.js
87dee18fb8b17241f553d52b365e136e13a87a54c9d34c1d45fbae0feb65a1d2  src/lib/financeEngine.js
bdf67668845c85327f09b0600fe92e39f8a0c18a082f71e4de82da5ce8251376  src/lib/savingsEngine.js
317f36f2de096d6a8bb630bd2d3feb7bc653a97b91e25a0b0721f4308895231d  src/lib/commercialSnapshot.js
e6ecfbbda128630bc2c78dc801bb198a123ff8e8ece462237f13ac8bfdc96783  src/lib/engineeringChecker.js
876cb8d743f564bc7ab1a7d1b6ed0a607f7d5351d46fd94bb39b4b72a9d5a528  src/lib/offerLifecycle.js
a96cd41efc79d0a62c47d6a4baac53c209a80fffe3793f43d7290fb681820ad3  src/lib/salesOrchestrator.js
ab1f926350f74351aec508ae4a4c6adb49d62ae2eee8d4366f22a1c30e36cf79  src/lib/approvedTemplate.js
47f352d5ec5f32d1d5a407f955bb6e1ec081aa51e82fa3008f9ee526149bb94c  src/lib/approvedTemplate.loader.js
86112029ecee8fced2e5fb7339eea23239d67594acdac219716598ac5b5eb21e  data/company-profile.json
e5e8938399d5e8188d686bd09526855cd43a5d874892e1bffbac3a28e1c785e9  data/subsidy-config.json
002fe9736c07b6bf53ac1126bfea3091d9287fbf72aa3722865dd4c19d9b8a34  data/savings-config.json
10c9a6bd753dc8a2eb083389d26007ff4154047beb47831c48f5a6aa53e94a44  data/tier-display-names.json
```

Track A frozen (`savingsEngine.js` hash `bdf67668…1376` locked). All other protected file hashes match prior gates. Approved bundle + Malayalam template + old renderer unchanged.

---

## HALT

Read-only. No implementation this gate. Awaiting decisions in §D and approvals in §E before any next-gate engineering.
