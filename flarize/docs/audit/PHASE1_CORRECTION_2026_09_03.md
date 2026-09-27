# Phase 1 Correction — Baked-Data Reclassification (Read-Only)

**Date:** 2026-09-03
**Trigger:** Phase 1 deliverable classified image-only pages as "production-safe". User rejection is correct — 8 of the 12 approved JPEGs contain baked customer / commercial / technical / legal / campaign / social-proof data. Prior forensic report `docs/phase3/QUOTATION_TEMPLATE_FORENSIC.md` had already established this; Phase 1 missed the cross-reference.
**Scope:** READ-ONLY trace. No implementation. No production file modified. No approved HTML modified. No page implemented. Old renderer untouched.
**Correction target:** honest per-page classification + Page 1 field inventory + Page 2 offer trace + Page 3 blocker confirmation + tier-pricing architecture trace.

Evidence pipeline (this session): rasterized every approved page at 96 DPI, ran Tesseract OCR on all 12, cross-referenced with `docs/phase3/QUOTATION_TEMPLATE_FORENSIC.md`, `claude/FLARIZE_QUOTATION_AUDIT_REPORT.md`, and `docs/audit/PHASE0_SYSTEM_AUDIT_2026_09_02.md`.

---

## 1. Page-by-page classification — Pages 1–12

Classes: **PURE_ARTWORK** (safe to ship JPEG verbatim), **HYBRID** (artwork + authorized dynamic slots — approved template already supports the pattern on Pages 7 and 12), **TEMPLATE_REVISION_REQUIRED** (baked dynamic data with no legitimate slot in the approved DOM).

| # | Doc-order name | Approved DOM shape | Class | Baked dynamic data present |
|--:|---|---|---|---|
| 1 | Cover + Proposal Details | Single JPEG cover | **TEMPLATE_REVISION_REQUIRED** | customer name, salutation, address, pincode, phone, current bill, system size, quotation number, proposal owner, quotation date, valid-until, GST No, company registration, footer contact |
| 2 | Onam Offer / Campaign | Live HTML + 4 `<image-slot>` | **HYBRID** | campaign name, benefit values (₹40,000 / 5 slots), prize (Electric Scooter), date range (28 JULY – 12 AUGUST), AC voucher, hybrid upgrade, referral copy, urgency |
| 3 | Generation & Appliance Usage | Single JPEG cover | **TEMPLATE_REVISION_REQUIRED** | daily generation (18–22), KSEB value (₹5,500–6,600), 8-row appliance table + hours + units, total daily usage (13.1), 18-22 → 13 → 4-8 flow, Life comparison, footer contact |
| 4 | Why Choose Flarize | Live HTML, 8 `<img>` | **PURE_ARTWORK** (marketing) with 3 baked stats | "300+ Homes", "8+ Years", "300+ Projects" — these are business claims; if actual counts diverge, they are stale copy, not per-customer |
| 5 | Three Options | Live HTML, 24 mustaches | **HYBRID + TEMPLATE_REVISION_REQUIRED** for baked strings | mustaches cover 24 dynamic values; BUT baked: system capacity "5 kW" × 3, tier headline strings ("Micro Inverter Plus", "Premium string", "Solar System"), "₹78,000 PM Surya Ghar" subsidy repeated in copy, install timelines (5-10/10-15/15-20 days), warranty years (5/5/3), feature-comparison rows |
| 6 | Homeowners Around You | Single JPEG cover | **TEMPLATE_REVISION_REQUIRED** | "12 homes in Alappuzha (688008)", "43 installations across Alappuzha district in 2025", 3 named third-party customers (Jose VP, Siraj K P, Stephen V C), locations, install months, before/after (₹3,200 → ₹200), Saves ₹2,900/mo × 3, QR code + URL |
| 7 | Technical Specifications | JPEG + white mask + 13 mustaches | **HYBRID + TEMPLATE_REVISION_REQUIRED** for spec block | mustaches cover pricing/EMI/subsidy; BUT baked: 3-column hardware spec sheet — panel brands + wattages, TopCon Bifacial claims, inverter brands, warranty terms (12/25/30), MC4 make, DC/AC cable specs, earthing gauge. **If BOM changes, this page is wrong.** Different footer contact (goldenray.in) from all other pages — C7 unresolved |
| 8 | Your Savings Over Time | Single JPEG cover | **TEMPLATE_REVISION_REQUIRED** | 25-year cumulative-cost chart values, monthly bill (₹6,000/bi-monthly), monthly savings (₹250–380), payback (35 months), lifetime saved (₹13 lakh), lifetime KSEB (₹20+ lakh), full bank details (Union Bank, LLP name, account 510 101 0069 819 30, IFSC UBIN 0901725, UPI flarize@upi), 8-item required-documents list, ₹500/kW additional-structure rate |
| 9 | Booking to Savings | Single JPEG cover | **TEMPLATE_REVISION_REQUIRED** | 6-stage timeline with day counts, KSEB refund example "5kw – Rs 4000" (size-specific), 80% loan disbursement figure, WHAT WE HANDLE / WHAT YOU NEED lists |
| 10 | Terms & Conditions (part 1) | Single JPEG cover | **PURE_ARTWORK** (legal) + footer contact | clauses 1-9 static legal text; footer contact strip only per-quotation-varying element |
| 11 | Terms & Conditions (part 2) | Single JPEG cover | **PURE_ARTWORK** (legal) + footer contact | clauses 10-19 static legal text; footer contact strip only per-quotation-varying element |
| 12 | Investment Summary | JPEG + white mask + 10 mustaches | **HYBRID + TEMPLATE_REVISION_REQUIRED** for baked strings | mustaches cover pricing/EMI/subsidy/savings; BUT baked: "5 kW Solar System — Recommended Package" (capacity + tier hardcoded), "₹13,60,000+" 25-year net savings, "Refer & Earn" block |

**Only Pages 10 and 11 (Terms & Conditions) are truly safe as pure approved artwork.** All 10 other pages carry baked per-quotation data.

## 2. Page 1 dynamic field inventory (must come from snapshot)

Per prior forensic (`docs/phase3/QUOTATION_TEMPLATE_FORENSIC.md`) + this session's OCR of `approved_bundle-01.png`. Every field below is authored into `9f438ce4-074b-48aa-8441-da5f313c98ae` (the Page 1 JPEG) as sample data and must NOT be shipped verbatim.

**Customer identity (source: `payload.customer.value`, currently a payload section):**
1. Salutation first name — `Dear Sareena,` line — from `customer.firstName`
2. Full name — `Name : Sareena kv` — from `customer.fullName`
3. Address line 1 — `Kurukkaankizhakke` — from `customer.address.line1`
4. Address line 2 — `Viappil, Azhikkode` — from `customer.address.line2`
5. Pincode — `123458` — from `customer.address.pincode`
6. Phone — `9809445408` — from `customer.phone`
7. Current bill — `86,000/bi monthly` — from `customer.currentBill` (amount + cycle)
8. System size — `5 kW` — from `system.value.capacityKw` (kw label)

**Quotation metadata (source: `payload.quotation.value`):**
9. Quotation number — `QUO-GR-AS-2025-26-062` — from `quotation.quotationNumber` (server-generated, unique per §I of audit report)
10. Proposal owner — placeholder `XXXX` — from `quotation.issuedBy` (username of authenticated actor)
11. Quotation date — `10/02/2026` — from `quotation.issuedAt`
12. Valid until — `20/02/2026` — from `quotation.validUntil`

**Legal identity (source: `payload.company.value` — currently BLOCKED per C7):**
13. GST No — `32AAUFC1454A1ZP` — from `company.gstNumber`
14. Company Registration — `AAP-6531` — from `company.registrationNumber`
15. Company name in salutation — from `company.legalName`
16. Signature graphic — approved artwork asset OR configurable per-issuer
17. Seal / stamp graphic — approved artwork asset OR configurable per-issuer
18. Footer address — from `company.address`
19. Footer website — from `company.website`
20. Footer email — from `company.email`
21. Footer phone — from `company.phone`

**Commercial (source: `payload.subsidy.value`):**
22. Subsidy headline `₹78,000 Subsidy` chip — from `subsidy.value.pmSuryaGharAmount` (labeled `PM Surya Ghar` with the caption "guaranteed")

**Business stats (source: `payload.company.value` OR CMS):**
23. `300+ Homes Installed in Kerala` chip — from `company.homesInstalledCount`
24. `MNRE Empanelled Government certified` chip — from `company.mnreEmpanelled` (boolean)

**Total dynamic fields on Page 1: 24.**

## 3. Page 1 static asset inventory (safe to keep as artwork)

Extractable from the approved JPEG (crop / re-export from Claude Design source) as independent assets, or preserved as CSS-positioned image layers on a re-authored Page 1 HTML section.

| Asset | Region in approved JPEG (visual) | Notes |
|---|---|---|
| Flarize logo lock-up (top-left) | ~top: 0-8%, left: 0-30% | Same logo asset already vendored under `assets/quotation/` |
| Hero photograph (Kerala home with solar) | ~top: 8-42%, full width | Approved photography; not per-customer |
| Marketing headline "Empowering Kerala homes with clean energy…" | ~top: 42-48%, full width | Static approved copy |
| Trust-badge frame (3 chips, LEFT CHIP = subsidy amount, MIDDLE = installs, RIGHT = MNRE) | ~top: 48-56%, full width | Chip FRAMES + icons are static; VALUES inside are dynamic (§2 items 22, 23, 24) |
| "Dear <name>," salutation frame | ~top: 56-58%, left 30% | Static frame; first-name in dynamic slot (§2 item 1) |
| Letter body paragraphs (3 paragraphs) | ~top: 58-72%, full width | Static approved copy |
| "Warm Regards, Team Flarize" signature | ~top: 72-76%, left 20% | Static copy + approved handwritten Flarize logo |
| Company signature/seal graphic (right) | ~top: 72-80%, right 20% | Static approved asset for now; may become per-issuer once C7 resolved |
| "YOUR PROPOSAL DETAILS" heading | ~top: 80-82%, full width | Static heading + rule |
| Field labels grid (Name / Address / Pincode / Phone / Current Bill / System Size / Sol No / Proposal By / Date / Valid until / GST No / Company Registration) | ~top: 82-95% | Static column labels; VALUES in dynamic slots (§2 items 1-14) |
| Footer decorative artwork (Flarize + address + web + email + phone icons) | ~top: 95-100% | Icons + geometry are static; VALUES are dynamic (§2 items 18-21) |

**Extraction path (READ-ONLY, do NOT execute in this phase):** hero photograph, logo, signature, seal, and letter-body typographic composition can be re-exported from the Claude Design source at their intrinsic resolution as 5 separate assets, then composed via CSS-positioned layers on a re-authored Page 1 `<section class="page">` HTML block. Dynamic slots fill via approved `{{mustache}}` bindings and one new `<image-slot>` per configurable asset. **This is a template revision, not renderer work** — the approved template must supply the slots; the renderer only fills them.

## 4. Page 2 offer-data ownership trace

Page 2 approved DOM is live HTML (17 KB) + 4 `<image-slot>` (already in `IMAGE_SLOT_REGISTRY`). OCR + DOM inspection identifies each value's true owner. **No renderer arithmetic. Nothing hardcoded in renderer. Everything below must originate from a snapshot section.**

| Page 2 element | Class | Snapshot source | Notes |
|---|---|---|---|
| Radial gradient background `#fff9ec → #ffffff` | immutable artwork | — | approved inline style |
| Corner floral decoratives (2 SVG images) | immutable artwork | manifest asset UUID | approved static |
| Flarize logo top-left (small) + top-right (large) | immutable artwork | manifest asset UUID | approved static |
| "Best Deal of the Year" pill (green, #123f35) | immutable artwork frame + label | — | copy is static; may need a variant when campaign is not Onam |
| "LIMITED OFFER Only 5 slots" (top-right) | **dynamic offer data** | `payload.campaign.value.urgency.slotCount` | 5 is baked in JPEG-adjacent text — currently a mustache would be needed OR a template revision to add `{{slotCount}}` |
| "Celebrate Onam with Flarize!" headline | **dynamic offer data** | `payload.campaign.value.headline` | template revision needed — no {{mustache}} on Page 2 today |
| "₹40,000" total benefit value | **dynamic offer data** | `payload.campaign.value.primaryBenefit.amount` | template revision needed |
| Malayalam sub-headline (`ഓണംHDelvenLIfe$3JG"`, mis-OCR) | **dynamic offer data** OR immutable | `payload.campaign.value.subheadline` | if same across all Onam issues → immutable; if per-campaign → template revision |
| Onam hero artwork (Mahabali illustration) | immutable artwork | manifest asset UUID | approved static |
| "Mega Lucky Draw / Win an Electric Scooter" (prize card) | **dynamic offer data** + `<image-slot id="ofr-scooter">` | `payload.campaign.value.luckyDraw.prize` + slot image | slot ALREADY dynamic; prize label baked in JPEG — template revision needed |
| "Win an AC Voucher" (benefit 1) | **dynamic offer data** + `<image-slot id="ben-ac1">` | `payload.campaign.value.offers[0]` + slot | same |
| "Free Hybrid Upgrade" (benefit 2) | **dynamic offer data** + `<image-slot id="ben-ac2">` | `payload.campaign.value.offers[1]` + slot | same |
| "Refer Friends & Win More Prizes" (benefit 3) | **dynamic offer data** + `<image-slot id="ben-ac3">` | `payload.campaign.value.referral` + slot | same |
| "WHY BOOK DURING ONAM?" section | static approved copy | — | if campaign changes, whole section may swap |
| "28 JULY – 12 AUGUST" campaign date range | **dynamic offer data** | `payload.campaign.value.period.{from, to}` — D6-approved field, already in payload | RENDERER MUST NOT CALCULATE. Template revision needed to add `{{campaignFrom}} – {{campaignTo}}` mustaches |
| "Book Your Solar System Today" CTA | immutable copy | — | approved static |
| Website `www.flarize.com` | **customer/company metadata** | `payload.company.value.website` | template revision needed |
| Footer contact strip (`+91 9995 073 579`) | **customer/company metadata** | `payload.company.value.phone` | template revision needed |

**Assessment:** the 4 `<image-slot>` tags are the only dynamic fields Page 2 supports in the approved DOM today. **Every other campaign value (dates, benefit amounts, headline, prize, slot count, urgency) is baked into the JPEG image assets and pixel-adjacent HTML.** Without a template revision that adds `{{mustache}}` tokens for these values, Page 2 renders the Onam campaign whether or not it is still active. `offerLifecycle.js` produces a `campaign` snapshot section but the renderer has no way to inject it into approved Page 2.

**Correct posture until template revision:** the renderer refuses to issue Page 2 when the active campaign snapshot's `id` / `template` / `period` does not match the baked JPEG's identity. New blocker code: `PAGE_2_CAMPAIGN_MISMATCH` — added to `PRODUCTION_BLOCKER` in a Phase 2 change (not this phase).

## 5. Page 3 blocker confirmation

**Confirmed. Unchanged.**

- Approved Page 3 DOM: `<section class="page"><img class="pg" src="a20a72b1-…" alt="Page 3"></section>` — 107 bytes, no mustaches, no image-slots, no overlays.
- Baked into JPEG: daily generation (18–22), KSEB monthly value (₹5,500–6,600), 8-row appliance table (Lights + Fans / Refrigerator / Induction Stove / Washing Machine / TV+DTH / Air Conditioner / Inverter + Chargers / EV Charging), quantity + hours + units for each, total daily usage (13.1), 18-22 → 13 → 4-8 flow, "Your Life Now" vs "Your Life with Solar" comparison (Limiting AC Usage / Comfort Without Guilt / Electricity Anxiety / Complete Confidence / Gas & Fuel Expenses / Reduced Energy Expenses), footer contact strip.
- Every field is per-quotation-varying (customer's usage profile) yet no template slot exists.
- **Blocker: `PAGE_3_DYNAMIC_DATA_NOT_SUPPORTED_BY_TEMPLATE`** — already emitted by `PAGE_3_STATUS`.

No pixel overlays. No masks. No artwork edits. Page 3 dynamic data remains blocked until template revision.

## 6. Pages 5 / 7 / 12 tier-data gap trace

**Existing architecture (established, no invention):**
- `data/packages.proposed.json` — package registry keyed by `{ systemType, size, phase, tier }` where `tier ∈ { base, value, premium }`. 48 packages seeded, 0 fully approved.
- `data/tier-display-names.json` (per `docs/audit/IMPLEMENTATION_PLAN_v2_2026_09_02.md`, decision P1-1) — `base → "Essential System"`, `value → "Smart System"`, `premium → "Elite System"`, `recommendedTier: 'value'`, `recommendedBadge: "Recommended · Most Popular"`.
- **Each tier is a distinct APPROVED BOM.** Cost/pricing/subsidy/finance/savings engines already work per-BOM correctly. There is no invention risk in producing 3 tier prices — each is a real BOM through the real engines.
- **`salesOrchestrator.js:402`** creates ONE `commercialSnapshot` per orchestration run (`snapshotId: 'CS-...'`). Line 108 creates ONE `commercialSnapshotId` per quotation.
- **`quotationPayload.js`** exposes ONE `pricing.value.customerTotalIncludingGST`, ONE `financing.value.monthlyEMI`, ONE `savings.value.monthlySavings` — sized to ONE tier's snapshot.
- Approved template expects THREE snapshots (Elite / Smart / Essential) side-by-side on Pages 5, 7, 12 — 15 tier mustaches (`eliteCost`, `smartCost`, `essentialCost`, `eliteDown`, `smartDown`, `essentialDown`, `eliteFin`, `smartFin`, `essentialFin`, `eliteEmiValue`, `smartEmiValue`, `essentialEmiValue`, `eliteDaily`, `smartDaily`, `essentialDaily`).

**Smallest authoritative extension (READ-ONLY design — do NOT implement here):**

Option A — **Multi-tier orchestration** (recommended, smallest surface):
1. New `salesOrchestrator.orchestrateThreeTiers({ customer, systemType, size, phase })` which internally runs the existing `orchestrate` pipeline three times (once per tier: base / value / premium) against the three approved packages for that (systemType, size, phase). No engine change. Reuses `costEngine`, `pricingEngine`, `subsidyEngine`, `financeEngine`, `savingsEngine`, `commercialSnapshot` verbatim.
2. New `quotationWorkspace.issueQuotationThreeTiers` — takes the 3 commercial snapshots + 3 BOM snapshots, produces ONE issued document whose `payload` has:
   ```
   payload.pricing.value.tiers = {
     base:      { customerTotalIncludingGST, ... },   // from base tier's commercialSnapshot
     value:     { customerTotalIncludingGST, ... },   // from value tier's commercialSnapshot
     premium:   { customerTotalIncludingGST, ... },   // from premium tier's commercialSnapshot
   }
   payload.financing.value.tiers = { base, value, premium }
   payload.savings.value.tiers   = { base, value, premium }
   ```
   Plus the current single-tier top-level fields, populated from `recommendedTier` (`value` → "Smart") so single-tier consumers (page 12's `smartCost` / `smartFin` etc.) still work.
3. Renderer's existing `tryTier(payload, tier, field, section)` in `src/lib/approvedTemplate.js` already reads `payload.<section>.value.tiers[tier][field]` — **no renderer change needed**. Once payload grows the `tiers` axis, all 15 tier mustaches resolve; `TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT` clears automatically.
4. Sales UX already selects a recommended tier per `docs/audit/PHASE2_BLUEPRINT_2026_09_02.md` (Step 3 "Recommended: Smart"). Multi-tier orchestration adds cost (3× engine work per quotation) but produces the honest 3-column comparison the approved template requires.

Option B — **Extend commercialSnapshot** to carry 3 tiers per snapshot: bigger surgery on the snapshot contract + all its 13 pinned versions + downstream `commercialHistoryPanel` + audit. Rejected — Option A is strictly smaller.

**Prerequisites** (already listed in existing implementation plans — not new work for this correction):
- P0-9 — Engineering approves the 3 tier packages per (systemType, size, phase).
- P0-4 — Procurement enters ~112 landed unit costs so cost engine produces non-zero material costs.
- P0-5 — Admin confirms per-tier margins (currently 20% target for all; product may differentiate).
- P1-1 — Tier display names file activated (already documented, not applied).

**Additional baked strings that require template revision on Pages 5 / 7 / 12** (independent of tier pricing gap):
- Page 5: system capacity `5 kW`, tier headlines `Micro Inverter Plus / Premium string / Solar System`, `₹78,000 PM Surya Ghar subsidy` in body copy, install timelines, warranty years, feature-comparison rows.
- Page 7: 3-column hardware spec sheet (panel/inverter brands + wattages + warranties + cable specs). **If BOM changes, this page ships wrong hardware.**
- Page 12: system capacity + tier name `5 kW Solar System — Recommended Package`, 25-year net savings `₹13,60,000+`.

## 7. Pages truly safe as pure approved artwork

**Pages 10 and 11.** Terms & Conditions clauses 1-9 and 10-19 respectively. Static legal copy. The only per-quotation-varying element is the footer contact strip (address, website, email, phone). Even that changes when C7 (company identity) resolves.

**Nothing else on the deck is safe as pure JPEG.**

## 8. Pages containing baked customer / commercial / technical / legal / campaign values

10 of 12 pages. In the OCR evidence (this session) and forensic report:

- **Customer identity**: Pages 1, 6
- **Commercial**: Pages 1, 5, 6, 7, 8, 12
- **Technical / BOM**: Pages 5, 7
- **Legal / company / bank / GST**: Pages 1, 8, 10, 11 (10-11 only in footer contact)
- **Campaign**: Page 2
- **Sample energy profile**: Page 3
- **Social proof**: Page 6
- **Business claims**: Page 4

## 9. Pages requiring legitimate template slots (mustache or image-slot)

| Page | Slots needed today | Additional slots needed for full dynamic support |
|---|--:|---|
| 1  | 0 (JPEG only) | 24 mustaches + 2 image-slots (signature, seal) — see §2 |
| 2  | 4 image-slots present | 7-9 mustaches (headline, subheadline, benefit amount, prize label, slot count, campaign period, offer amounts, footer) |
| 3  | 0 | 5+ mustaches (daily gen, KSEB, home uses, surplus, footer) — plus a decision on whether the appliance table becomes per-customer (would require a repeat/table binding, which mustaches alone cannot express) |
| 4  | 0 | 3 mustaches for business stats (homes, years, projects) IF Admin wants them dynamic |
| 5  | 24 mustaches present | 6+ mustaches (system capacity, tier headline strings, subsidy-in-copy, install timelines, warranty years, feature rows) |
| 6  | 0 | 4 mustaches (locality banner: town + pincode + count + year) + 3 testimonial cards (each: name, location, install month, before/after bill, monthly savings) + video URL |
| 7  | 13 mustaches present | 20+ mustaches for the hardware spec-sheet grid (panel brand + power/type/warranty × 3 tiers, inverter brand + warranty × 3, structure make × 3, DC/AC cable × 3, earthing) OR replace the whole spec block with a bindable table from the BOM snapshot |
| 8  | 0 | 8+ mustaches (25-year chart series, monthly bill, monthly savings, payback months, lifetime saved, lifetime KSEB) + bank block from `company.value` (7 fields) + document list (immutable) + additional structure rate |
| 9  | 0 | Timeline day counts are already sort-of-static; KSEB refund per-kW formula, booking fee, loan disbursement % are dynamic |
| 10 | 0 | Footer contact only |
| 11 | 0 | Footer contact only |
| 12 | 10 mustaches present | 3 mustaches (capacity, tier name, 25-year net savings) |

## 10. Pages requiring template revision

**All 10 non-T&C pages** to some degree. Priority order for template designer:

1. **Page 1** — highest priority (customer identity + quotation number + GST cannot be Sareena's forever).
2. **Page 3** — every value is per-customer's energy profile.
3. **Page 6** — third-party customer names, testimonials, locality counts.
4. **Page 8** — bank details + savings chart + payback + additional-structure rate.
5. **Page 5** — 24 mustaches already present; add 6+ more for baked strings + system capacity.
6. **Page 7** — hardware spec sheet must bind to BOM snapshot, not baked artwork.
7. **Page 12** — capacity + tier name + 25-year net savings.
8. **Page 2** — campaign period + benefits + prize + slot count (currently baked to Onam).
9. **Page 9** — KSEB refund formula, booking fee, loan disbursement %.
10. **Page 4** — business stats IF product wants them dynamic (currently marketing copy is acceptable static).

## 11. Pages renderable immediately without visual reconstruction

Under the strict-verbatim posture:

| Page | Renderable today | Constraint |
|---|:-:|---|
| 1  | ❌ | ships Sareena's name / address / GST |
| 2  | ⚠️ | ships Onam campaign only — must refuse when active campaign snapshot ≠ Onam |
| 3  | ⚠️ | ships baked sample energy profile only — must refuse when engine values differ meaningfully |
| 4  | ✅ | marketing copy is acceptable static (business claims tolerated) |
| 5  | ❌ | tier pricing blocker + baked capacity / warranty / timelines |
| 6  | ❌ | ships someone else's testimonials + locality claims |
| 7  | ❌ | tier pricing blocker + baked hardware spec that lies when BOM changes |
| 8  | ❌ | ships wrong monthly bill / savings / payback + Union Bank details |
| 9  | ⚠️ | acceptable if 5 kW quotations only and refund figures + fee stay approved |
| 10 | ✅ | pure legal text |
| 11 | ✅ | pure legal text |
| 12 | ⚠️ | Smart-tier mustaches resolve; capacity + tier name + 25-year figure baked |

**Truly production-safe today: 3 pages (4, 10, 11).**
**Conditionally shippable with narrowed scope (guard by snapshot equality): 4 pages (2, 3, 9, 12).**
**Blocked: 5 pages (1, 5, 6, 7, 8).**

## 12. Production blockers

Named codes. Emitted by the renderer via `PRODUCTION_BLOCKER` allow-list. Each is a distinct architectural gap that requires either template revision OR snapshot extension.

| Code | Blocks | Fix path |
|---|---|---|
| `PAGE_1_BAKED_CUSTOMER_DATA` (new) | Page 1 dynamic customer / quotation / legal / footer fields (24 fields, §2) | Template revision: add 24 mustaches + 2 image-slots to Page 1 approved DOM. Then wire snapshot → tokens. |
| `PAGE_2_CAMPAIGN_MISMATCH` (new) | Page 2 whenever active campaign snapshot ≠ baked Onam | Template revision: add 7-9 mustaches to Page 2 approved DOM for campaign values. Short-term guard: refuse issuance when `payload.campaign.value.id !== 'campaign-onam-…'` and baked JPEG is still Onam. |
| `PAGE_3_DYNAMIC_DATA_NOT_SUPPORTED_BY_TEMPLATE` (already emitted) | Page 3 dynamic energy profile (5+ fields) | Template revision — designer must add legitimate mustaches / image-slots. No pixel overlays. |
| `PAGE_5_BAKED_TIER_COPY` (new) | Page 5 baked system capacity + tier headline strings + subsidy-in-copy + install timelines + warranty years + feature-comparison rows | Template revision. |
| `PAGE_6_BAKED_TESTIMONIALS` (new) | Page 6 locality count + 3 named third-party customers + testimonials + savings figures + QR | Template revision (or business decision that testimonials are marketing artwork). |
| `PAGE_7_BAKED_HARDWARE_SPECS` (new) | Page 7 3-column BOM spec sheet | Template revision. Spec sheet must bind to `bomSnapshot.value.components` — repeat/table binding required. |
| `PAGE_7_FOOTER_INCONSISTENT_C7` (new) | Page 7 shows `goldenray.in` while other pages show `flarize.com` | C7 legal decision + template revision. |
| `PAGE_8_BAKED_FINANCIALS_AND_BANK` (new) | Page 8 25-year chart + monthly bill + payback + Union Bank block + docs list + additional-structure rate | Template revision + wire `company.bank` fields to snapshot. |
| `PAGE_9_BAKED_KSEB_REFUND_5KW` (new) | Page 9 KSEB refund example is size-specific to 5 kW | Template revision to bind to `system.capacityKw` + `subsidy.value.pmSuryaGharAmount`. |
| `PAGE_12_BAKED_CAPACITY_AND_LIFETIME_SAVINGS` (new) | Page 12 capacity + tier name + `₹13,60,000+` | Template revision. |
| `TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT` (already emitted) | 15 mustaches on Pages 5/7/12 | Snapshot extension: multi-tier orchestration (§6 Option A). No engine change. |
| `C7_COMPANY_IDENTITY_UNRESOLVED` (existing project decision) | Every page's footer + Page 1 legal identity + Page 8 bank details + Page 10-11 legal entity + Page 7 different footer | Legal / business decision required before ANY footer or company field can bind. |
| `C6_TIER_DISPLAY_NAMES_NOT_ACTIVATED` (existing project decision) | Tier headline strings on Pages 5, 12 | Activate `data/tier-display-names.json` (P1-1 in existing implementation plan). |

**Existing renderer scope: 2 blockers emitted (Page 3 + Tier pricing). Correction adds: 11 blockers.**

**Total production blockers: 13.**

---

## HALT

- No production file modified.
- No approved HTML modified.
- No business logic modified.
- No page implemented.
- No Page 4 started.
- Prior-report Phase 1 test suite (24 passing) unchanged; it still validates architecture — but the "PURE_ARTWORK" characterization of Pages 1, 3, 6, 8, 9 in the Phase 1 report is corrected here.
- Awaiting review.

**Recommendation for next gate:** commission the approved-template designer to produce a revised bundle with the mustaches + image-slots §9 enumerates, plus the small `salesOrchestrator.orchestrateThreeTiers` + `payload.*.value.tiers` extension in §6 Option A. Neither step is renderer work — the renderer is finished; it is waiting on legitimate template slots and legitimate snapshot fields.
