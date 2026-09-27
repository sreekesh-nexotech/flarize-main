# QUOTATION TEMPLATE — FORENSIC INVENTORY

**Purpose:** establish, page by page, which parts of the supplied customer quotation are static artwork and which carry customer, technical, commercial or legal data — so the HYBRID renderer scope can be decided from evidence rather than assumption.
**Status:** forensic report only. **No code was written and no file other than this report was created or changed.**
**Date:** 2026-08-16
**Artifact examined:** `Flarize Solar Quotation.html` (3,961,623 bytes) as supplied.

> **EVERY VALUE QUOTED IN THIS REPORT IS ARTIFACT EVIDENCE, NOT CONFIGURATION.**
> Values are reproduced here only to prove where they live and what kind of value
> they are. Nothing in this document is authoritative, current, approved or
> ready for production. No decision — commercial, engineering, legal or design —
> is made or implied. C6, C7, C13 and C14 remain unresolved.

---

## 0. WHAT THE FILE ACTUALLY IS

The upload is not a page. It is a **self-extracting bundle** whose payload unpacks at runtime:

```
<script type="__bundler/manifest">     48 assets, base64, mime + compressed flags
<script type="__bundler/template">     47,342 chars of HTML
<script type="__bundler/page_order">
```

The unpacked template contains **12 × `<section class="page">`**, matching the 12-page structure. Of those twelve, **nine are a single full-bleed JPEG each**, one carries a JPEG plus a live HTML block, and two are live HTML.

```
document order   content                     text nodes   page artwork asset
 1               <img class="pg">                     0   9f438ce4  (alt "Page 1")
 2               live HTML                        1,329   — (decorative assets only)
 3               <img class="pg">                     0   bff49528  (alt "Page 3")
 4               live HTML                        1,147   — (photo assets only)
 5               <img class="pg">                     0   fe31a034  (alt "Page 4")
 6               <img class="pg">                     0   033da978  (alt "Page 6")
 7               <img class="pg">                     0   dbee1e5a  (alt "Page 7")
 8               <img class="pg">                     0   f7a5ca2c  (alt "Page 8")
 9               <img class="pg">                     0   c80af147  (alt "Page 9")
10               <img class="pg">                     0   6565cc00  (alt "Page 10")
11               <img class="pg">                     0   f2babbf7  (alt "Page 11")
12               <img class="pg"> + live HTML       281   6c8f7583  (alt "Page 12")
```

Every page image is `image/jpeg`, 1000 × 1414 px (A4 at ~120 dpi), ~2.4 MB of base64 in total.

**Consequence:** on the nine image-only pages there is no DOM node, no text layer and no placeholder to bind. Their content — including every customer, technical and commercial figure — exists only as pixels.

A whole-template token scan confirms it:

```
"kWp" 0 · "kW" 0 · "Quotation No" 0 · "Customer" 0 · "Pincode" 0 · "Phone" 0
"GSTIN" 0 · "Inverter" 0 · "Panel" 0 · "EMI" 0 · "Subsidy" 0
"₹" 3   (all three inside marketing copy on the live campaign page)
```

The `alt` labels are also internally inconsistent with document position (`alt="Page 4"` sits at document position 5; there is no `alt="Page 2"` or `"Page 5"`). Document order is used throughout this report and the artifact's own `alt` label is given alongside. **This is not a page-numbering decision** — C13 remains open.

---

## 1. PAGE-BY-PAGE INVENTORY

### PAGE 1 (doc order 1 · artifact `alt="Page 1"`) — COVER + PROPOSAL DETAILS

| # | Finding |
|---|---|
| 2 | **MIXED** — brand/marketing hero above, customer data block below |
| 3 | **image/JPEG pixels only** |
| 4 | **Customer-specific:** salutation name; full name; address (two lines); pincode; phone number; current electricity bill with billing cycle; system size |
| 5 | **Business/legal:** quotation number; proposal owner field (placeholder text present); quotation date; valid-until date; a GST registration number; a company registration number; a signature graphic; a seal/stamp graphic; footer postal address, website, e-mail, phone |
| 6 | **Technical:** system size only |
| 7 | **Commercial:** a subsidy headline figure; current bill amount |
| 8 | **Marketing/static:** logo lock-up; hero photograph; headline; sub-headline; three trust badges; the "Dear …" letter body; "Warm Regards, Team Flarize"; "YOUR PROPOSAL DETAILS" heading; field labels |
| 9 | **NO** — reusing it unchanged ships one customer's name, address, phone and bill to every other customer |
| 10 | **YES — must be rebuilt as bindable HTML** (the whole lower detail block; the hero band can stay artwork if split) |
| 11 | `9f438ce4-074b-48aa-8441-da5f313c98ae` (image/jpeg, 1000×1414) |
| 12 | **C7** — a GST number, a company registration number, a legal entity name and a seal are printed here. **C13** — the artifact labels this "Page 1" |

---

### PAGE 2 (doc order 2) — ONAM CAMPAIGN / FESTIVAL OFFER

| # | Finding |
|---|---|
| 2 | **STATIC_MARKETING** — but campaign-dated and therefore perishable |
| 3 | **live HTML/text** (with decorative image assets) |
| 4 | **Customer-specific:** none |
| 5 | **Business/legal:** brand lock-up; a website; a phone number; a T&C footnote |
| 6 | **Technical:** none |
| 7 | **Commercial:** a "festival offers worth up to" figure; a slot-count claim; a lucky-draw prize; a winner count; an AC-voucher benefit; a free-hybrid-upgrade/buyback benefit; a referral benefit; a campaign date range |
| 8 | **Marketing/static:** festival branding, Malayalam headline, Mahabali illustration, floral decoration, "WHY BOOK DURING ONAM?" grid, booking QR |
| 9 | **NO — not because of customer data, but because every figure on it is campaign data.** Slot counts, prize lists, benefit values and campaign dates are exactly the class of value the contract (§25) says must come from an approved source and must never be manufactured |
| 10 | **PARTLY** — the layout stays; the campaign values must become payload/CMS-driven, and the page must be omitted or blocked when no campaign is supplied |
| 11 | `09e8e9ec` (floral decoration, ×4), `9512e6d9` (Mahabali illustration), `3c93b38b` (booking QR) |
| 12 | None directly. Contract §25 campaign dependency applies |

---

### PAGE 3 (doc order 3 · artifact `alt="Page 3"`) — DAILY GENERATION + APPLIANCE USAGE

| # | Finding |
|---|---|
| 2 | **DYNAMIC_CUSTOMER_DATA** |
| 3 | **image/JPEG pixels only** |
| 4 | **Customer-specific:** a per-appliance table (appliance, quantity, hours/day, units/day) with a total daily usage figure — this is the customer's own load profile |
| 5 | **Business/legal:** footer address, website, e-mail, phone |
| 6 | **Technical:** a daily generation range; a home-consumption figure; a surplus-export range |
| 7 | **Commercial:** a monthly value at KSEB rate (a rupee range) |
| 8 | **Marketing/static:** headline "See Exactly What Your Solar Powers Every Day"; the sub-line "Real numbers calculated from your usage — not estimates"; the "Your Life Now / Your Life with Solar" comparison copy |
| 9 | **NO** — it prints another customer's appliance list, usage total and rupee value |
| 10 | **YES — must be rebuilt as bindable HTML** |
| 11 | `bff49528-d33b-46bc-8230-e40356fd7491` |
| 12 | None visible. **Blocked-engine dependency:** every figure on this page is Savings-Engine and Load-Estimation-Engine output — both absent (contract §21, §23) |

---

### PAGE 4 (doc order 4) — WHY CHOOSE FLARIZE + INSTALLATION GALLERY

| # | Finding |
|---|---|
| 2 | **STATIC_MARKETING** |
| 3 | **live HTML/text** (with photograph assets) |
| 4 | **Customer-specific:** none |
| 5 | **Business/legal:** brand lock-up; footer postal address, website, e-mail, phone |
| 6 | **Technical:** component-tier claims (Tier 1 / PVEL / ALMM listing, warranty-claim and spare-parts claims) — brand-level marketing claims, not this customer's specification |
| 7 | **Commercial:** none |
| 8 | **Marketing/static:** "Why Choose Flarize?" body copy; the promise quote; five credential tiles; "Homes We've Powered Across Kerala" gallery with location captions; the hand-picked-components strip |
| 9 | **YES — safe to reuse unchanged for every customer** |
| 10 | **NO** |
| 11 | `1794e273`, `8031bc90`, `1593f6ff`, `bedfceea`, `a145a15d`, `4f812f13`, `fea43e5e`, `4d989d5a` (installation photographs) |
| 12 | **C7** — footer carries a contact identity; the legal entity itself is not printed here |

---

### PAGE 5 (doc order 5 · artifact `alt="Page 4"`) — THREE-OPTION PRICING COMPARISON

| # | Finding |
|---|---|
| 2 | **DYNAMIC_CUSTOMER_DATA** |
| 3 | **image/JPEG pixels only** |
| 4 | **Customer-specific:** the system size repeated on all three option cards |
| 5 | **Business/legal:** footer address, website, e-mail, phone — **and this footer's website, e-mail and phone differ from the footer on pages 3, 6, 9, 10, 11 and 12** |
| 6 | **Technical:** installation lead-time bands; service-response bands; warranty/AMC inclusion matrix (12 rows) |
| 7 | **Commercial:** three struck-through pre-subsidy prices; three post-subsidy prices; a subsidy figure quoted four times; three EMI figures with a tenure; net-saving and break-even claims per option |
| 8 | **Marketing/static:** "Three Options. One Smart Choice."; "Pick what fits your home."; the "Recommended – Most Popular" ribbon; the comparison-table chrome |
| 9 | **NO** — every price, EMI and saving belongs to one specific configuration |
| 10 | **YES — must be rebuilt as bindable HTML** |
| 11 | `fe31a034-02a7-4a77-b3fb-d0766e1fc071` |
| 12 | **C6 — the three customer-facing tier display names are printed here as column headings and card titles.** This is the single clearest C6 dependency in the document. **C7** — footer identity conflict, see §D |

---

### PAGE 6 (doc order 6 · artifact `alt="Page 6"`) — LOCAL SOCIAL PROOF / TESTIMONIALS

| # | Finding |
|---|---|
| 2 | **MIXED** — testimonial content is static, but the locality banner is customer-targeted |
| 3 | **image/JPEG pixels only** |
| 4 | **Customer-specific:** a locality banner naming a town **and a pincode** plus an install count for that area — targeted at the recipient's location |
| 5 | **Business/legal:** three named third-party customers with locations; a testimonials URL; footer identity |
| 6 | **Technical:** a system size repeated on each testimonial card; installation months |
| 7 | **Commercial:** a before/after bill pair and a monthly saving, repeated identically on all three cards |
| 8 | **Marketing/static:** headline; sub-headline; three testimonial photographs and quote bodies; the video QR panel |
| 9 | **PARTLY** — the testimonial cards are reusable; the locality banner is not, because it names a town and pincode |
| 10 | **PARTLY** — the locality banner must become bindable (or be dropped); the testimonial cards can stay artwork until a CMS exists |
| 11 | `033da978-6e6b-4c33-91b6-8bd3dbfc0b3a` |
| 12 | None visible. **Blocked-engine dependency:** testimonials are CMS content (contract §24); the per-card saving figures are Savings-Engine output (§21) |

---

### PAGE 7 (doc order 7 · artifact `alt="Page 7"`) — TECHNICAL SPECIFICATIONS

| # | Finding |
|---|---|
| 2 | **DYNAMIC_CUSTOMER_DATA** — this is the BOM-facing page |
| 3 | **image/JPEG pixels only** |
| 4 | **Customer-specific:** the whole specification is this customer's configuration |
| 5 | **Business/legal:** footer identity (the variant that differs — see §D) |
| 6 | **Technical:** a heading stating an equivalent wattage; system size on each column; solar module brand set; module power range and cell technology; panel warranty terms; inverter type; inverter brand set and warranty; mounting structure; ACDB/DCDB makes; DC cable cross-section and brand; AC cable cross-section and brand; earthing wire gauge and length — **listed twice, an apparent duplicate row in the artwork** |
| 7 | **Commercial:** total system cost per option; subsidy amount per option; total after subsidy per option |
| 8 | **Marketing/static:** headline; "total transparency for your peace of mind"; table chrome |
| 9 | **NO** |
| 10 | **YES — must be rebuilt as bindable HTML.** This page is the direct target of the quotation Data Contract §6–§16, and of the supplied *BOM Changes in quotation design / technical spec page* note |
| 11 | `dbee1e5a-…` |
| 12 | **C6** — the three tier display names appear again as column headings. **C13** — page position |

---

### PAGE 8 (doc order 8 · artifact `alt="Page 8"`) — SAVINGS OVER TIME + PAYMENT DETAILS

| # | Finding |
|---|---|
| 2 | **DYNAMIC_CUSTOMER_DATA** |
| 3 | **image/JPEG pixels only** |
| 4 | **Customer-specific:** the current KSEB bill amount and its billing cycle |
| 5 | **Business/legal:** **a bank name, an account holder name, a full account number, an IFSC code, a branch, a UPI ID and a payment QR code**; a "Required Documents" list; footer identity |
| 6 | **Technical:** a 25-year cumulative-cost chart |
| 7 | **Commercial:** post-solar monthly bill range; monthly savings range; 25-year net savings; a payback period in months; a 25-year KSEB spend claim; a tariff-escalation percentage range; an additional structure cost per kW |
| 8 | **Marketing/static:** headline; "Without Solar / With Solar" panels; "Key Takeaway" framing; "Book now" heading |
| 9 | **NO** — bill figures, savings and payback are customer-specific; **and the payment block carries live banking credentials that must not be republished without verification** |
| 10 | **YES — must be rebuilt as bindable HTML**, with the payment block treated as configuration, not artwork |
| 11 | `f7a5ca2c-…` |
| 12 | **C7 — the bank account is held in a named legal entity.** Which entity issues the quotation, and which account is current, is exactly what C7 has not decided. **Blocked engines:** Savings (§21) and Finance/EMI (§22) |

---

### PAGE 9 (doc order 9 · artifact `alt="Page 9"`) — PROCESS TIMELINE + SCOPE SPLIT

| # | Finding |
|---|---|
| 2 | **MIXED** — process copy is static; two figures are not |
| 3 | **image/JPEG pixels only** |
| 4 | **Customer-specific:** none directly |
| 5 | **Business/legal:** the "WHAT WE HANDLE / WHAT YOU NEED TO DO" scope split — contractual in nature; footer identity |
| 6 | **Technical:** six-stage day-range timeline; net-meter and commissioning steps |
| 7 | **Commercial:** a booking-fee amount; a KSEB refund formula (percentage, per-kW rate, tax rate) **and a worked example for one specific system size**; a loan-instalment percentage inside the payment step |
| 8 | **Marketing/static:** "From Booking to Savings — Step by Step"; the six stage descriptions; both scope lists |
| 9 | **MOSTLY** — everything except the size-specific refund example and the booking-fee/loan percentages |
| 10 | **PARTLY** — the worked refund example must become bindable or be removed; the rest can stay artwork |
| 11 | `c80af147-…` |
| 12 | None visible. The refund and booking-fee figures are commercial values requiring Admin confirmation before reuse |

---

### PAGE 10 (doc order 10 · artifact `alt="Page 10"`) — TERMS AND CONDITIONS (1 of 2)

| # | Finding |
|---|---|
| 2 | **STATIC_MARKETING** (more precisely: static legal) |
| 3 | **image/JPEG pixels only** |
| 4 | **Customer-specific:** none |
| 5 | **Business/legal:** clauses 1–9 — warranty term and exclusions, consumables, customer responsibilities, service and training, payment terms, price variations, GST and tax changes, system-capacity confirmation. **A legal entity is named repeatedly as the warrantor and payee.** A refund-processing window and a warranty duration are stated |
| 6 | **Technical:** warranty scope over panels, inverters and OEM products |
| 7 | **Commercial:** payment-stage rules; "prices quoted are inclusive of applicable GST" |
| 8 | **Marketing/static:** the entire clause text |
| 9 | **YES for layout — NO for content until Legal confirms.** It is customer-independent, but it is a legal instrument naming an entity |
| 10 | **NO** — no rebuild needed for binding. It may need re-issuing if Legal changes the entity or clauses |
| 11 | `6565cc00-8912-4283-892f-473cc1f25a86` |
| 12 | **C7 — the warrantor/payee entity is named in the clause text.** **C2** is also implicated: clause 8 makes a GST-inclusivity statement, and the statutory GST position is still awaiting CA sign-off |

---

### PAGE 11 (doc order 11 · artifact `alt="Page 11"`) — TERMS AND CONDITIONS (2 of 2)

| # | Finding |
|---|---|
| 2 | **STATIC_MARKETING** (static legal) |
| 3 | **image/JPEG pixels only** |
| 4 | **Customer-specific:** none |
| 5 | **Business/legal:** clauses 10–19 — completion timeline, statutory/KSEB scope, government-subsidy disclaimer, data privacy, additional expenses and civil works, retention of title, liability, force majeure, confidentiality, jurisdiction. **The legal entity is named again**, and a governing law and court jurisdiction are stated |
| 6 | **Technical:** none |
| 7 | **Commercial:** cost-allocation rules for statutory charges and civil work |
| 8 | **Marketing/static:** the entire clause text |
| 9 | **YES for layout — NO for content until Legal confirms** |
| 10 | **NO** |
| 11 | `f2babbf7-09f9-4f3a-bcec-c502f59e1c85` |
| 12 | **C7 — entity named; jurisdiction asserted.** Clause 12's subsidy disclaimer sits against an absent Subsidy Engine (§20) |

---

### PAGE 12 (doc order 12 · artifact `alt="Page 12"`) — INVESTMENT SUMMARY + REFER & EARN

| # | Finding |
|---|---|
| 2 | **MIXED** — a JPEG investment summary plus a live HTML referral strip |
| 3 | **BOTH** — `image/JPEG pixels` for the summary and trust strip; `live HTML/text` for the referral block |
| 4 | **Customer-specific:** the recommended package is stated at this customer's system size |
| 5 | **Business/legal:** footer identity; a "Special Offer" validity date; award/rating badges (MNRE, trusted-choice, a star rating); refundability, no-obligation, price-lock and installation-window promises |
| 6 | **Technical:** system size; a hybrid-system upsell prompt |
| 7 | **Commercial (all in pixels):** pre-subsidy system cost; subsidy amount; net investment; monthly savings range; payback period; 25-year net savings; EMI amount with tenure and an interest rate; net monthly position during EMI; a refundable booking-fee amount; a price-lock duration |
| 8 | **Marketing/static:** "Your Investment Summary" framing; the backup-power prompt; the trust strip; the whole referral block (live HTML) |
| 9 | **NO** for the summary; **YES** for the referral strip |
| 10 | **YES for the JPEG half — must be rebuilt as bindable HTML.** The live referral strip can stay as-is |
| 11 | `6c8f7583-…` (investment summary + trust strip artwork) |
| 12 | **C6** — "Recommended Package" is a tier-derived label. **C14** — a special-offer validity date and a price-lock window imply document-variant/expiry handling. **Blocked engines:** Subsidy (§20), Savings (§21), Finance/EMI (§22) |

---

## A. STATIC PAGES — SAFE TO REUSE

| Page | Why |
|---|---|
| **4** (doc order 4) — Why Choose Flarize + gallery | Live HTML, zero customer data, brand claims only. **Fully reusable as-is.** |
| **12 — referral strip only** (live HTML half) | No customer data, no figures. **Reusable as-is.** |
| **10 and 11** — Terms & Conditions | Customer-independent. **Layout reusable unchanged**, but the content is a legal instrument naming an entity, so reuse is conditional on Legal confirming the entity and clauses (C7, and C2 for the GST clause). Not a renderer problem. |
| **9** — process timeline, *excluding* the size-specific refund example and fee percentages | The narrative and scope split are customer-independent. |
| **2** — Onam campaign, *as a layout only* | No customer data, but every figure on it is campaign data with an expiry. Reusable only while a supplied campaign says so. |
| **6 — testimonial cards only** | The three cards are customer-independent; the locality banner is not. |

## B. DYNAMIC PAGES — MUST BECOME BINDABLE

Ordered by how much of the quotation's correctness depends on them:

| Page | What must bind |
|---|---|
| **1** (cover / proposal details) | name, address, pincode, phone, current bill, system size, quotation number, proposal owner, date, valid-until, and the legal identity fields |
| **7** (technical specifications) | the entire component table, capacities, warranties, cable sizes, and the cost/subsidy/after-subsidy rows — the Data Contract §6–§16 target |
| **5** (three-option pricing) | all pre-subsidy, post-subsidy, subsidy and EMI figures, plus the per-option inclusion matrix |
| **12 — summary half** | system cost, subsidy, net investment, monthly savings, payback, 25-year savings, EMI, net monthly position |
| **8** (savings + payment) | current bill, post-solar bill, monthly and 25-year savings, payback, escalation, structure rate — and the payment block as configuration |
| **3** (generation + appliance usage) | generation range, appliance table, total daily usage, KSEB-rate value, surplus |

**Every one of these six is currently pixels.** None can be bound without being rebuilt as HTML.

## C. MIXED PAGES — WHAT MUST BE SEPARATED

| Page | Keep as artwork | Split out and bind |
|---|---|---|
| **1** | hero photograph, headline, trust badges, letter body | the "YOUR PROPOSAL DETAILS" block and the legal identity strip |
| **6** | three testimonial cards, video QR panel | the locality banner (town + pincode + install count) |
| **9** | six-stage timeline, both scope lists | the size-specific KSEB refund example; booking fee; loan percentage |
| **12** | trust strip, backup-power prompt, referral block | the investment summary card in full |
| **2** | festival artwork, Malayalam headline, illustration, QR | slot count, benefit values, prize list, campaign dates |

## D. C6 / C7 / C13 / C14 DEPENDENCIES

**C6 — customer-facing tier display names. PENDING.**
Three tier names are printed as column headings and card titles on **page 5** and again on **page 7**, and a "Recommended Package" label appears on **page 12**. The renderer cannot supply these until C6 is decided. The payload already emits `system.packageTierDisplayName` as a named blocked dependency; the artwork assumes the names exist.

**C7 — company / legal identity. PENDING, and the artifact is internally inconsistent.**
Evidence, all in pixels:

- **page 1** prints a GST registration number and a company registration number, plus a signature and a seal
- **pages 10 and 11** name a legal entity repeatedly as warrantor, payee and defendant in the jurisdiction clause
- **page 8** prints a bank name, account holder, account number, IFSC, branch and UPI ID
- **the footer identity is not consistent across the document.** Pages 3, 6, 8, 9, 10, 11 and 12 carry one website / e-mail / phone triplet; **pages 5 and 7 carry a different website, a different e-mail and a different phone number.** Page 2 carries a third phone-number formatting.

This is not a rendering defect — it is unresolved identity, exactly what C7 exists to settle. **No entity, number or account from this artifact may be treated as current.**

**C13 — page numbering. PENDING, and the artifact contradicts itself.**
The `alt` attributes run `Page 1, 3, 4, 6, 7, 8, 9, 10, 11, 12` across twelve document positions — there is no `Page 2` or `Page 5`, and `alt="Page 4"` sits at document position 5. The artifact therefore supplies a page *order* but not a page *numbering*. The current payload deliberately emits **named sections, never page numbers**; that stays correct.

**C14 — document variants. PENDING.**
Page 12 prints an offer-validity date and a price-lock window, and page 2 prints a campaign period — all implying an expiry/variant concept. Nothing in the artifact defines an Accounts/Documentation cut-down variant. The payload's "build once, never trim, carry `variant`" behaviour remains the correct posture.

**Also implicated, though not in the C6/C7/C13/C14 set:**
**C2** (statutory GST) — page 10 clause 8 asserts GST inclusivity. **Subsidy (§20), Savings (§21), Finance/EMI (§22), Load estimation (§23), CMS (§24/§25)** — pages 3, 5, 6, 8 and 12 are almost entirely output of engines that do not exist in this build.

## E. VALUES THAT MUST **NOT** BE COPIED INTO PRODUCTION

Everything below is present in the artifact **as example or artwork content**. None of it is confirmed by `docs/DECISION_LOG.md`, the catalog, the cost configuration or any approved commercial record. **None may be hardcoded, seeded, defaulted or treated as configuration.**

| Class | Do not copy |
|---|---|
| **Customer identity** | the recipient's name, salutation, address lines, pincode, phone number, current bill amount and billing cycle |
| **Quotation metadata** | the quotation number, its format, the proposal-owner placeholder, the quotation date, the valid-until date |
| **Legal identity** | the GST registration number, the company registration number, the entity name, the signature image, the seal image, the jurisdiction assertion |
| **Payment credentials** | the bank name, account holder, account number, IFSC, branch, UPI ID and payment QR |
| **Tier names** | the three customer-facing tier display names (C6) |
| **Commercial figures** | every pre-subsidy price, post-subsidy price, subsidy amount, EMI amount, interest rate, tenure, monthly saving, 25-year saving, payback period, tariff-escalation range, booking fee, refund formula and worked example, per-kW structure rate, price-lock window |
| **Technical values** | the module brand sets, wattage ranges, warranty terms, inverter brands and warranty years, structure make, ACDB/DCDB makes, cable cross-sections, earthing gauge — these are artwork, not the catalog, and the artwork even repeats one row twice |
| **Campaign data** | the slot count, the benefit total, the prize list, the winner count, the campaign date range, the offer-validity date |
| **Social proof** | the three named third-party customers, their locations, install months, before/after bills and savings; the install counts; the star rating; the "300+ homes" and "8+ years" claims |
| **Load profile** | the appliance list, quantities, hours and units — this is one household's usage |

## F. RECOMMENDED HYBRID IMPLEMENTATION SCOPE

Stated as scope only. **This is a recommendation for approval, not a decision, and no code follows from this report.**

**Keep as supplied artwork (no rebuild):**
page 4 (live HTML, already correct) · page 12's referral strip (live HTML) · pages 10 and 11 (Terms, subject to Legal) · page 9 minus its refund example · page 6's testimonial cards · page 2's festival artwork.

**Rebuild as bindable HTML, in this order:**

1. **page 1** — cover / proposal details. Highest value: it carries the customer identity and the quotation metadata, and it is what the recipient sees first.
2. **page 7** — technical specifications. The Data Contract §6–§16 target and the subject of the supplied BOM-changes note.
3. **page 5** — three-option pricing.
4. **page 12** — investment summary half.
5. **page 8** — savings and payment. Split the payment block out as configuration rather than artwork.
6. **page 3** — generation and appliance usage. Lowest priority because both engines behind it are absent, so it will render blocked for now.

**Bind these fragments without rebuilding their host page:** page 6's locality banner · page 9's refund example · page 2's campaign values.

**Constraints that carry into implementation, unchanged:**

- the renderer calculates nothing and reads no catalog; every value comes from the approved quotation payload
- a section whose engine is absent renders the contract's blocked treatment — never ₹0, never a blank, never "TBD", never a figure lifted from this artwork
- no tier display name (C6), no company or legal identity (C7), no page number (C13) and no variant rule (C14) is supplied by the renderer; each is configured once decided
- the internal quotation workspace and the customer quotation stay separate artefacts
- the exported page artwork stays byte-identical where it is reused; nothing is redrawn

**Before implementation starts, three inputs are needed and none can be taken from the artwork:** the C6 tier display names, the C7 legal identity (entity, registration numbers, and the payment account), and confirmation of which footer contact triplet is current, given the artifact prints two different ones.

---

**C11 NOT STARTED.**
