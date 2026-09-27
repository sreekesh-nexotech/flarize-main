# DECISION LOG

**Owner:** Goldenray IT / Flarize Engineering
**Status:** Active
**Phase:** 0 (seeded), maintained for the life of the project
**Purpose:** Single authoritative record of architectural and business decisions. A decision recorded here overrides any conflicting statement in code, in the Build Spec, or in the Data Contract.
**Last updated:** 2026-08-15

## Rules for this file

1. Every decision gets an ID, a status, a date, an owner, and the reason.
2. `APPROVED` decisions are binding on all later phases.
3. `PENDING` decisions **block** the phase named in "Blocks". Do not proceed past that gate by guessing.
4. Never delete a decision. Supersede it with a new ID and link both ways.
5. If code contradicts an APPROVED decision, the code is wrong.

## Status legend

| Status | Meaning |
|---|---|
| APPROVED | Binding. Implement as written. |
| APPROVED DIRECTION | Intent is settled; the detailed design is still to be produced in its phase. |
| PENDING | Not decided. Blocks the named phase. Do not invent a value. |
| SUPERSEDED | Replaced by a later decision. Kept for history. |

---

## C1 — MARGIN TYPE

**Status:** APPROVED
**Date:** 2026-08-15
**Owner:** Admin / Business
**Blocks:** Phase 3 (Cost/Pricing)

**Decision:** Use **true gross margin**, not markup.

```
sellingPrice = totalInternalCost / (1 - grossMarginRate)
```

Example: cost ₹100 at 20% gross margin → selling price ₹125.

**Current legacy behaviour (to be replaced):** `App.jsx:1869-1874` computes
`mAmt = round(preGstSub × marginVal/100)` then `sub = preGstSub + mAmt` — i.e. **markup**. At the configured value of 20 the realised gross margin is 20/120 = **16.67%**.

**Consequence:** At the same numeric setting of 20, moving from markup to gross margin **raises the pre-GST selling price by ~4.17%**. This is a real customer-facing price change.

**Implementation requirements:**
- `commercial_settings.margin_type` is an explicit enum: `GROSS_MARGIN` | `MARKUP`. No default. The pricing engine refuses to price until it is set.
- `margin_rate` stored as a decimal, validated `0 <= rate < 1`.
- The Admin UI must state which formula is in force, in words, next to the field.
- Phase 3 must run shadow-mode reconciliation against at least 20 recent real quotations and present the delta per quotation before cutover.

**Reference:** Build Spec §15. Audit §19 C1, §15 item 2.

---

## C2 — GST TREATMENT

**Status:** ⛔ **PENDING — CA WRITTEN CONFIRMATION REQUIRED**
**Date raised:** 2026-08-15
**Owner:** Business / Chartered Accountant
**Blocks:** **Phase 3 (Cost/Pricing) cannot be completed without this.**

**Decision:** NOT MADE. Do not choose a GST treatment. Do not carry the legacy behaviour forward as if it were a decision.

**Why this is open:** the legacy system runs **two contradictory GST regimes at the same time**:

| Regime | Rate | Applied to | Location |
|---|---|---|---|
| Composite | flat **9%**, hardcoded | material total, and separately the whole selling price | `App.jsx:1779, 1875, 1901, 2577, 2631` |
| Per-item statutory | **5%** panels/inverters/enphase, **18%** everything else | add-on cables, price-difference deltas, structure grade uplift | `App.jsx:1883, 1932, 1809` |

Both reach the customer price in the same quotation. There is no goods/service split anywhere: installation, service, transport, overhead and miscellaneous are all folded into `preGstSub` and taxed at 9%.

**What is required before Phase 3:**

Written confirmation from the CA covering:
1. Is the supply a composite/works-contract supply taxed at a single effective rate, or separate supplies of goods and services?
2. If single rate — what rate, on what base (pre-margin cost, or the selling price)?
3. If split — which BOM categories are goods, which cost heads are services, and the rate for each.
4. Treatment of customer extras (net metering liaison, AMC, civil work) — same or different rate.
5. Whether a discount recalculates GST (the legacy system applies discount **after** GST with no recompute, so the stated GST no longer reconciles with the discounted total — `App.jsx:2781`).
6. Invoice/quotation presentation requirement — must a tax breakup be shown? The legacy quotation shows none.

**Phase 0/1/2 obligation:** build the *configuration architecture* so any of the above can be expressed — a `tax_config` table supporting per-category rates, per-cost-head rates, a composite-rate mode, and a base selector. **Populate nothing.** The pricing engine must refuse to price when `tax_config` is unset.

**Reference:** Build Spec §17. Audit §5.4, §19 C2.

---

## C3 — MARKET RATE AUTHORITY

**Status:** APPROVED
**Date:** 2026-08-15
**Owner:** Admin / Business
**Blocks:** Phase 3

**Decision:** The **cost-up authoritative pricing engine is the sole source of the customer price**. `marketRate` is **reference only**. It must never override, replace, or short-circuit the pricing engine.

**Current legacy behaviour (to be replaced):** `App.jsx:1953`
```js
customerPrice = marketRate > 0 ? marketRate + addOnTotal + priceDiffDelta : grand
```
Whenever an admin has typed a market rate, the entire cost engine — every material price, all five overheads, the margin and the GST — is discarded.

**Consequence:** only two market-rate cells are currently populated (`ongrid_value["3"] = 200000`, `ongrid_premium["5sp"] = 250000`). Everything else already falls through to `grand`. **Removing market-rate authority changes the price of those two configurations** to whatever cost + margin yields. Both must be reconciled explicitly in Phase 3 shadow mode.

**Implementation requirements:**
- `marketRate` is retained as a stored reference figure and displayed for comparison.
- The pricing engine emits a **variance flag** when the computed price differs from the reference beyond a configurable threshold. The flag is informational, never corrective.
- No code path may assign `marketRate` to the customer price.

**Reference:** Build Spec §14. Audit §5.2, §19 C3.

---

## C4 — BATTERY QUANTITY AUTHORITY

**Status:** APPROVED
**Date:** 2026-08-15
**Owner:** Engineering / Project Head
**Blocks:** Phase 2

**Decision:** The **package profile / package configuration is authoritative** for battery quantity. Sales cannot freely alter it.

If an override is ever permitted, it must be modelled explicitly as an **approved package alternate or an approved override**, carry a reason, and pass engineering validation and the approval workflow. It may never be an unrecorded UI toggle.

**Current legacy behaviour (to be replaced):**
- `batConfig` is plain UI state, `useState('0')` at `App.jsx:851`, set only by three pills at 3356-3361. Nothing links tier → batConfig.
- `packageProfiles.hybrid_value` declares `batteryIncluded: true, batteryQuantity: 1, batteryCapacity: 10 kWh` — and is **never read by any engine**.
- `getProfileKey()` (`App.jsx:226-230`) can only return `premium`, `hybrid_bat`, `hybrid_nobat`, `ongrid_base`, `ongrid_value`. The keys `hybrid_base`, `hybrid_value`, `hybrid_premium` are **structurally unreachable**.
- Net effect: **Hybrid Value ships zero batteries at the default state.**

**Note on the original bug description:** the Build Spec §2.1 describes the defect as code equivalent to `slot.batQty['0']`. The actual code is `slot.batQty[batConfig] || slot.batQty['0']` — a *fallback*, not a hardcode. Fixing the literal named in the spec would **not** fix the bug. The defect is that `batConfig` is UI state rather than package-derived.

**Implementation requirements (Phase 1/2, not Phase 0):**
- Battery quantity resolves from `package_components` where `role = 'battery'`.
- `getProfileKey` is deleted; package resolution is by `(systemType, sizeKey, phase, tier)` against a real table.
- Regression test: Hybrid Value at every size yields exactly the profile-declared battery quantity.

**Reference:** Build Spec §2.1, §7, §8. Data Contract §9. Audit §8.

---

## C5 — PREMIUM TIER ARCHITECTURE

**Status:** APPROVED DIRECTION
**Date:** 2026-08-15
**Owner:** Engineering
**Blocks:** Phase 2 (BOM), Phase 5 (Quotation)

**Decision:** **Premium is a micro-inverter architecture.** There is no conventional central inverter in a Premium system. The quotation and the technical specification must eventually describe it **as a micro-inverter system**, not as a central-inverter system.

**Consequence — this resolves an ambiguity in the legacy code's favour:** `premiumQty = 0` on the inverter and DCDB slots (`App.jsx:1454-1468` + catalog) is therefore **correct behaviour**, not a bug. The defect is on the **presentation side**:

- `buildSpecTable` falls back `findByCat('inverter') || findByCat('enphase') || findByCat('hoymiles')` (`App.jsx:23`)
- `addMicroLine` (`App.jsx:1574-1580`) never sets `type`
- Result: every Premium quotation prints **"Inverter Type: On-Grid"** with an inverter count that is actually the panel count.

**Also to be resolved when this is implemented (do not fix now):**
- The nine SolarEdge `optimizerBased` inverters and `i97 ENPHASE IQ8P Micro` in `categories.inverter` are currently unreachable. Decide whether they are retired or belong to a future optimiser tier.
- `microBrand='hoymiles'` still selects the Enphase ACDB (`a5`/`a6` are the only premium-tier ACDB items).
- Hoymiles quantity arithmetic under-counts: 7 panels → 1×HMS2000 + 1×HMS1000 = 6 module slots.
- Premium hybrid battery is priced at ₹135,000 as `en_flexbat` while the same product is ₹95,000 as `categories.battery.bt2`.

**NOT to be implemented in Phase 0.**

**Reference:** Audit §7.2, §10, §19 C5.

---

## C6 — TIER NAMING

**Status:** APPROVED
**Date:** 2026-08-15
**Owner:** Sales / Marketing
**Blocks:** Phase 5

**Decision:**

| Internal (code, BOM, admin, DB) | Customer-facing (quotation, proposal) |
|---|---|
| `base` | **Basic** |
| `value` | **Smart** |
| `premium` | **Premium** |

`Smart` must support a future **"Recommended / Most Popular"** flag.

**Implementation requirements:**
- Internal keys never change — `base`/`value`/`premium` remain the stable identifiers in the DB and every engine.
- Customer labels live in **one** place, resolved at render time, translatable EN/ML.
- `package_profiles.is_recommended` boolean, defaulting false, set per tier per system type.
- Legacy has **four duplicate hardcoded tier label maps** (`App.jsx:3899, 5355, 5581, 5651`). All four are retired in Phase 5.

**Reference:** Design page 5 uses Basic/Smart/Premium with "★ Recommended – Most Popular". Audit §19 C6.

---

## C7 — COMPANY IDENTITY

**Status:** ⛔ **PENDING — BUSINESS / LEGAL CONFIRMATION REQUIRED**
**Date raised:** 2026-08-15
**Owner:** Business / Legal
**Blocks:** Phase 5 (Quotation renderer). Does **not** block Phases 1-4.

**Decision:** NOT MADE. Do not hardcode any identity. Do not reconcile the conflict silently.

**The conflict, as found:**

| Source | Identity printed |
|---|---|
| Design HTML pages 1, 3, 6, 8, 9, 10, 11, 12 | `www.flarize.com` · `sales@flarize.com` · `+91 9995 073 579` · **GST No 32AAUFG1464A1ZP** · **Company Reg AAP-6531** |
| Design HTML pages 5 and 7 | `www.goldenray.in` · `goldenray@gmail.com` · `+91 6282 922 988` |
| `App.jsx` locale (5513-5515, 5711) | Company name "Golden Ray Renewable Energy", legal name "Flarize Technologies Pvt. Ltd." |

**The uploaded quotation design prints two different companies in one document.**

**Required before Phase 5:**
1. Which legal entity issues the quotation and the eventual tax invoice?
2. Does GSTIN `32AAUFG1464A1ZP` belong to that entity?
3. Is the other name a brand/trading name of the same entity, or a separate company?
4. Canonical address, phone, email, website, bank account, UPI ID for the issuing entity.
5. If both entities genuinely trade, does the system need to issue under either — i.e. is Company a *selectable* field on a quotation?

**Architecture obligation:** a single authoritative **Company Master** record (or table, if multiple entities are confirmed), referenced by the quotation snapshot. No identity string may be hardcoded in a template or a locale file.

**NOT to be touched in Phase 0.**

**Reference:** Audit §6.1, §6.3, §19 C7.

---

## C8 — NET METERING

**Status:** APPROVED DIRECTION
**Date:** 2026-08-15
**Owner:** Engineering + Commercial
**Blocks:** Phase 2 (BOM treatment), Phase 3 (extras pricing)

**Decision — the two halves are separated:**

| Item | Treatment |
|---|---|
| **Meter hardware**, where engineering requires it | A normal **BOM component**, `treatment = INCLUDED`, resolved from the package like any other component |
| **Net-metering liaison / application / KSEB coordination service** | A separate **customer extra**, itemised, priced, `treatment = EXTRA` |

The liaison service charge must **not** be hidden inside the core solar system cost.

**Current legacy behaviour (to be replaced):**
- Printed as an included service with **₹0 attached** (`App.jsx:5631` hardcoded array).
- The meter row prints a hardcoded fallback `'Net Meter (KSEB Approved)'` / `'1 nos'` (`App.jsx:74`) **even when the BOM contains no meter line at all** — the quotation invents hardware.
- No cost head, no extra, no price anywhere.

**Open value (do not invent):** the actual liaison charge. Leave the configuration field empty until the business supplies it.

**Reference:** Build Spec §13. Data Contract §18. Audit §19 C8.

---

## C9 — SERVICE / AMC COST FORMULA

**Status:** APPROVED
**Date:** 2026-08-15
**Owner:** Project Head
**Blocks:** Phase 3

**Decision:**

```
internalServiceCost = costPerVisit × visitsPerYear × serviceYears
```

All three are explicit, separately editable configuration fields owned by Project Head.

**Current legacy behaviour (to be replaced):** `App.jsx:1853`
```js
service = costOvr.service ?? (costs.serviceRateYear || 0) * (costs.serviceYears || 0)
```
= `2000 × 5 = ₹10,000`. **There is no visits-per-year term at all**, and the result is flat regardless of system size. The upgrade engine (`App.jsx:2591-2595`) has **no service line whatsoever**.

**⚠️ Data ambiguity to resolve before Phase 3:** the existing value `serviceRateYear: 2000` can be read either as *per visit* or as *per year*. The two readings differ by a factor of `visitsPerYear`. **Do not assume.** The business must state: what is ₹2,000, and how many visits per year are actually performed?

**Also required:** internal service cost must stay separate from any customer-facing AMC price (Build Spec §11).

**Reference:** Build Spec §11, §28. Audit §5.3, §19 C9.

---

## C10 — UPGRADE PATHS

**Status:** APPROVED
**Date:** 2026-08-15
**Owner:** Engineering
**Blocks:** Phase 2

**Decision:** **No heuristic upgrade pricing or design.** Only explicitly engineering-approved upgrade paths may be offered. Anything else is **blocked**, not extrapolated.

Initial approved path set:

| From → To |
|---|
| 3 → 5 |
| 3 → 6 |
| 3 → 8 |
| 5 → 8 |
| 5 → 10 |
| 8 → 10 |

Any other pair is **unsupported and blocked** until explicitly defined and engineered.

**Current legacy behaviour (to be replaced):**
- `bomTemplates.upgrade.fixedItems` is keyed by path string and contains **only four**: `"3_5"`, `"5_8"`, `"5_10"`, `"8_10"`.
- **3→6 and 3→8 — both on the approved list — have no explicit definition today** and currently fall into the auto-scale heuristic at `App.jsx:2519-2528`, which picks the closest known path by panel count and scales `refQty × newPanels / refPanels`, with `refPanels` defaulting to 4 when unknown (`App.jsx:2501`).
- The UI exposes `kwOptions = [3,5,6,8,10,15,20,25,30]` = **72 from→to combinations. Four are real. Sixty-eight are extrapolated. None are blocked.**

**Action required from Engineering before Phase 2 can close:** author explicit fixed-item definitions for **3→6** and **3→8**. Until then those two paths are blocked like the rest.

**Reference:** Build Spec §8. Audit §12.1, §19 C10.

---

## C10 — CLOSURE (locked with the Project Head)

**Status:** CLOSED — behaviour locked · **Date:** 2026-08-16 · **Owner:** Project Head + Engineering
**Supersedes nothing.** The original C10 above stands: explicit paths only, no heuristic. This section
adds the workflow rules and is implemented in `src/lib/upgradeAssessment.js`
(tests: `tests/phase3-upgrade-c10.test.mjs`, `tests/phase3-upgrade-c10-closure.test.mjs`).

**1. Two scenarios, never conflated.**
`FUTURE_READY` — install a lower-capacity system now, prepare for a target later; BOTH the initial and the
target DC/AC ratio are checked. `EXISTING_SYSTEM` — a plant already exists; the existing inverter is
inspected FIRST.

**2. Inverter.** Retain only when every required check passes. A failure marks `REPLACE` and the approved
target inverter is `ADD`ed — chosen by Engineering, never by the module. The removed unit is never a
negative quantity. "A 6 kW inverter exists" is not sufficient to retain it. 3→6 and 3→8 are designed around
an appropriate three-phase target inverter.

**3. Existing panels.** Sales already screens panel health; the platform adds no second questionnaire and
consumes the screening RESULT. Healthy panels at or above **500 W** are normally retained; poor or
below-boundary panels (280/300 W class) are normally replaced; a declared space/string/MPPT constraint may
force replacement. Removed panels remain the customer's property: **zero pricing impact, no buyback, no
trade-in value, no negative quantity.**

**4. Mixed panels.** Different models or wattages are never combined into one series string automatically.
Old and new panels go on separate compatible MPPT/string configurations where one exists; where none exists
the configuration is `ENGINEERING_REQUEST_REQUIRED`. Strings are never silently reconfigured.

**5. Panel quantity.** The target configuration is derived from target capacity and available panel wattage
and then judged ELECTRICALLY. Capacity deviation alone is not a selection rule — only electrically permitted
candidates may be proposed, and deviation only orders candidates that already passed. No quantity is ever
taken from another upgrade path.

**6. DC/AC ratio.** The manufacturer inverter specification is the **hard electrical ceiling**. A Flarize
preferred operating range may be introduced later and may never raise that ceiling. Four states:
`VALID` (within the manufacturer limit and any preferred range) · `WARNING` (manufacturer permits, outside
preferred) · `BLOCKED` (exceeds the manufacturer specification) · `UNRESOLVED` (manufacturer data absent).
**No numerical DC/AC limit is defined by this decision and none is invented in code.**

**7. Structure.** Adequate → `RETAIN`. Insufficient → `ADDITIONAL_REQUIRED` (`ADD`) with **no quantity** —
none is approved. Unknown → `ENGINEERING_REQUEST_REQUIRED`.

**8. Preliminary Sales quotation.** Estimated allowances, adjustable by the Project Head after site and
configuration verification: **DC cable 30 m total (15 m positive + 15 m negative)**; **MC4 3 pairs per NEW
string**. For 3→6 and 3→8 the three-phase conversion items appear automatically — 3-phase ACDB, AC
protection/isolator, AC cable allowance, meter/KSEB-side conversion — but **their quantities are not decided
and are emitted as unresolved, never as 0**. Standard upgrade installation and service scope stays on the
existing cost heads; C10 creates no pricing logic, no rate and no cost head.

**9. Upgrade BOM semantics.** Every affected component resolves to `RETAIN` / `REPLACE` / `ADD` /
`ENGINEERING_REVIEW` where the data permits. Unresolved technical decisions route to Project Head /
Engineering. Never an invented quantity, a zero placeholder, a quantity taken from another path, or a silent
substitution.

**10. Fixed-item paths.** The catalog defines explicit quantities for `3_5`, `5_8`, `5_10`, `8_10` only.
**`3_6` and `3_8` remain UNRESOLVED** until Engineering supplies explicit quantities; they are reported by
name as request-required and are never fabricated, derived from `3_5` or copied from another path.

**11. Approval.** Sales creates the preliminary upgrade request; Project Head or Engineering reviews the
unresolved configuration; the approved configuration becomes authoritative for `PROJECT_BOM`, `COST` and
`QUOTATION`. Existing RBAC only — no new role and no new capability (`rbac.js` unmodified).

**12. Discipline.** No frozen engine, `src/App.jsx`, `data/catalog.json` or existing test was changed. No
commercial rate, no AC-side quantity, no structure quantity and no inverter limit was invented. No clock and
no randomness in the service logic.

**Open at closure (Engineering input required):** the numerical DC/AC limits (manufacturer values per
inverter, and the Flarize preferred range if one is wanted); explicit `3_6` / `3_8` fixed-item quantities;
the preliminary quantities for the three-phase conversion items; the additional-structure quantity.

---

## C11 — 3 kW ON THREE-PHASE

**Status:** APPROVED DIRECTION
**Date:** 2026-08-15
**Owner:** Engineering
**Blocks:** Phase 2

**Decision:** If the engineering rule is that 3 kW cannot be supplied three-phase, then the combination must be **hidden or blocked with a clear message**. The system must **never silently change the system size** to make a selection valid.

**Current legacy behaviour (to be replaced):**
- `handlePhaseChange` (`App.jsx:2896`) auto-corrects only the **5 kW** variant between `5sp` and `5tp`. 3 kW remains selectable on three-phase.
- Separately and more seriously, `switchSysType` (`App.jsx:2880`) **silently rewrites 6 kW → 3 kW** when switching from on-grid to hybrid, because `bomTemplates.hybrid.sizes` has no `"6"` key. No warning, no confirmation.

**Open point (do not invent):** confirm the engineering rule — is 3 kW 3-phase genuinely never supplied, or merely rare? The requirement PDF item 6 states "when 3-Phase is selected, automatically hide the 3 kW system size", which reads as a hard rule. Confirm before implementing.

**Principle to apply generally:** any unsupported combination is **blocked with a stated reason**. Silent coercion of a user's selection is forbidden.

**Reference:** Requirement PDF item 6. Audit §11, §19 C11.

---

## C12 — SALES PACKAGE CONTROL

**Status:** APPROVED
**Date:** 2026-08-15
**Owner:** Engineering + Sales Head
**Blocks:** Phase 1 (data model), Phase 4 (RBAC)

**Decision:** Sales does **not** browse or change the whole catalog. Sales may select **only among approved package components and their approved alternates**. The package itself remains engineering-controlled.

**This resolves the apparent contradiction between:**
- Requirement PDF items 4 + 5: Sales sees a limited list and may edit Panel / Inverter / ACDB / DCDB
- Build Spec §4: Sales "cannot change package configuration"

**Resolution:** Sales is choosing among **pre-approved alternates within an engineering-approved package** — not freely picking any catalog item. Editing the inverter means "pick a different approved inverter for this package", not "pick any inverter in the catalog".

**Data model requirement (Phase 1):**
```
package_components(id, package_id, role, item_id, quantity_rule, required)
package_component_alternates(id, package_component_id, item_id, approved_by, approved_at)
```
Sales sees `package_component_alternates` for the roles marked sales-selectable. Everything else is read-only.

**Roles initially sales-selectable:** panel, inverter, acdb, dcdb. All other roles read-only for Sales, editable by Engineering/Admin.

**Reference:** Requirement PDF items 4-5. Build Spec §4, §7. Audit §19 C12.

---

## C13 — QUOTATION PAGE NUMBERING

**Status:** PENDING (low priority)
**Date raised:** 2026-08-15
**Owner:** Sales / Design
**Blocks:** Phase 5

**The conflict:** the design HTML has **12 pages**. `Quotation_Dynamic_Sections.pdf` references pages 1, 2, 4, 5, 6, 7 and 11 — a different numbering. The two documents cannot both be canonical.

**Required:** confirm which numbering is canonical for the build, and produce a single page-index table mapping page number → page name → dynamic fields.

**Reference:** Audit §19 C13.

---

## C14 — ACCOUNTS / DOCUMENTATION QUOTATION VARIANT

**Status:** APPROVED DIRECTION
**Date:** 2026-08-15
**Owner:** Accounts + Sales
**Blocks:** Phase 5

**Decision:** The renderer must support **page selection as a parameter** from the first page written, not as a later retrofit.

Confirmed variants:
1. **Full customer proposal** — all pages.
2. **Accounts / Documentation variant** — a simplified quotation containing only: Home/cover, Price details, Technical specification, Bank details. (Stated in the requirement PDF as pages 1, 4, 7, 8 — subject to C13 renumbering.)

**Architecture obligation:** the quotation payload is built once and completely; the renderer selects which pages to emit. The payload is never trimmed to match a variant.

**Reference:** Requirement PDF, "Quotation Vision Phase 1.2". Audit §19 C14.

---

## C15 — DATABASE

**Status:** APPROVED
**Date:** 2026-08-15
**Owner:** Admin / Engineering
**Blocks:** Phase 1

**Decision:** **PostgreSQL for V1 production.**

Do **not** build a JSON → repository → PostgreSQL temporary production architecture. The repository layer exists for testability and clean service boundaries, not as a pretend database.

Legacy JSON (`data/catalog.json`, `data/bom-state.json`) remains operational **only** during migration and parallel-run, then goes read-only and is archived.

**Consequences:**
- Phase 1 delivers real schema + real migrations, not an abstraction over files.
- Concurrent-write corruption risk on the JSON files (no visible write locking) persists until cutover — mitigated only by the Phase 0 backup script, not eliminated.
- The parallel-run period requires an explicit data-sync or freeze policy. To be defined at the start of Phase 1.

**Reference:** Build Spec §5. Audit §19 C15, §24.

---

# UNRESOLVED BUSINESS VALUES

Not decisions — **missing inputs**. The Build Spec (§38) forbids inventing any of these. Each must become a clearly labelled, empty configuration field. The system must refuse to price or to quote when a required one is unset.

| Value | Needed by | Owner | Status |
|---|---|---|---|
| Site survey — internal cost | Phase 3 | Project Head | Not supplied |
| Site survey — customer charge, refundable flag | Phase 3 | Project Head | Not supplied |
| Engineering/design cost per project | Phase 3 | Project Head | Not supplied |
| Service — cost per visit (see C9 ambiguity) | Phase 3 | Project Head | Not supplied |
| Service — visits per year | Phase 3 | Project Head | Not supplied |
| Transport — included km, trip count, round-trip rule, extra trip cost | Phase 3 | Project Head | Not supplied |
| Special project works — the list and the rates | Phase 3 | Project Head | Not supplied |
| Margin rate (the number; the *type* is settled by C1) | Phase 3 | Admin | Not supplied |
| GST treatment (C2) | Phase 3 | CA | **Pending CA** |
| Discount authority limits per role | Phase 4 | Sales Head / Admin | Not supplied |
| Net metering liaison charge (C8) | Phase 3 | Commercial | Not supplied |
| EMI — lender, rate, tenure, and whether the financed amount is pre- or post-subsidy | Phase 5 | Commercial | Not supplied |
| Warranty per component (no catalog field exists at all) | Phase 2 | Engineering | Not supplied |
| Per-tier service matrix (13 rows in the design) | Phase 5 | Service | Not supplied |
| Tariff escalation % for the 25-year savings model | Phase 5 | Commercial | Not supplied |
| KSEB refund rule (appears only as pixels in the design) | Phase 5 | Commercial | Not supplied |
| Testimonials source and consent | Phase 5 | Marketing | Not supplied |
| Company master: GSTIN, registration, bank, UPI (C7) | Phase 5 | Legal | **Pending legal** |
| Inverter electrical limits — voltage, current, MPPT count, per item | Phase 2 | Engineering | Not supplied (data entry across 260 items) |
| Battery capacity `kwh` — all four catalog batteries are `null` | Phase 2 | Engineering | Not supplied |

---

# DECISION INDEX

| ID | Title | Status | Blocks |
|---|---|---|---|
| C1 | Margin type | APPROVED — gross margin | Phase 3 |
| C2 | GST treatment | ⛔ PENDING CA | **Phase 3** |
| C3 | Market rate authority | APPROVED — reference only | Phase 3 |
| C4 | Battery quantity authority | APPROVED — package profile | Phase 2 |
| C5 | Premium architecture | APPROVED DIRECTION — micro-inverter | Phase 2, 5 |
| C6 | Tier naming | APPROVED — Basic/Smart/Premium | Phase 5 |
| C7 | Company identity | ⛔ PENDING LEGAL | Phase 5 |
| C8 | Net metering | APPROVED DIRECTION — hardware BOM, service extra | Phase 2, 3 |
| C9 | Service cost formula | APPROVED — visit × visits/yr × years | Phase 3 |
| C10 | Upgrade paths | CLOSED — explicit only, no heuristic; closure rules locked 2026-08-16 | Phase 2 |
| C11 | 3 kW / 3-phase | APPROVED DIRECTION — block, never coerce | Phase 2 |
| C12 | Sales package control | APPROVED — approved alternates only | Phase 1, 4 |
| C13 | Quotation page numbering | PENDING | Phase 5 |
| C14 | Accounts variant | APPROVED DIRECTION — page selection param | Phase 5 |
| C15 | Database | APPROVED — PostgreSQL | Phase 1 |

---

# PHASE 0 HOTFIX DECISIONS — appended 2026-08-15

Previous decisions above are unchanged. Nothing has been deleted.

## C16 — SESSION TOKEN STORAGE

**Status:** APPROVED (implemented) · **Owner:** Engineering · **Phase:** 0

**Decision:** Persist the opaque server-issued session token in **`sessionStorage`** under `gr_session_token`. Never persist the password. Always **validate the token server-side** before trusting it.

`sessionStorage` over `localStorage`: the session dies with the tab, which matches an 8-hour server TTL and limits exposure on shared machines. Over a cookie: the server issues a bearer token and every client call already sends `Authorization`; switching to cookies would be an API change, which this hotfix was told not to make.

Superseded by the Phase 1 auth design (httpOnly refresh cookie + short-lived access token + revocable server session table).

## C17 — FALLBACK POLICY IS TRANSPARENCY, NOT ENFORCEMENT, IN PHASE 0

**Status:** APPROVED (implemented) · **Owner:** Engineering · **Phase:** 0 → enforcement in Phase 2

**Decision:** In Phase 0, silent component substitution is made **visible and attributable**. It is **not blocked**.

**Why enforcement was refused here:** `data/bom-state.json` holds 3 saved selections. The golden baseline covers ~3,200 component resolutions. Practically all are fallbacks today. Converting fallback to a hard error would blank or block essentially the whole baseline — contradicting the binding requirement that H1–H3 be numerically neutral.

Enforcement belongs in **Phase 2**, once BLOCKED/WARNING/VALID exists, packages carry explicit approved component IDs (C4, C12), and an authorised-override path exists.

## C18 — ADMIN CREDENTIAL FROM ENVIRONMENT ONLY

**Status:** APPROVED (implemented) · **Owner:** Goldenray IT · **Phase:** 0

**Decision:** `ADMIN_PASSWORD` comes from the process environment only. **No default. No fallback.** The server exits non-zero at startup if it is unset or blank. The value is never logged. Dead `adminPassword` keys removed from all three catalog JSON files after grep-confirming nothing reads them.

**Correction to earlier guidance in this project:** rotating the password by editing `data/catalog.json` was advised earlier. **That was wrong** — `server.js` never read that field; the literal in `server.js` was the only credential. The catalog keys were dead data.

**The previous value is in git history and must be treated as compromised. Rotate it.**

Does not supersede the Phase 1 auth work: hashing, per-user identity, revocable sessions and RBAC all remain outstanding.

## C19 — CANONICAL PERSISTED-STATE SHAPE

**Status:** APPROVED (implemented) · **Owner:** Engineering · **Phase:** 0

**Decision:** One canonical definition of persisted BOM state — `src/lib/persistedState.js` — shared by the load path, the save path and the dirty comparator. `PERSISTED_KEYS` is the authoritative list; `savedAt`, timestamps, tokens, transient UI state and calculated display state are excluded by construction.

Two normalisation rules are deliberate and load-bearing: **deep key sorting** (insertion order cannot cause a false positive) and **numeric-string coercion** (`"20"` from a number input equals `20` from the file, so focusing a field does not mark the state dirty).

This module is the seed of the Phase 1 persistence contract.

## C20 — GOLDEN BASELINE REGRESSION CHECK IS A CONTRACT HASH

**Status:** APPROVED · **Owner:** Engineering · **Phase:** 0

**Decision:** The regression check is a **contract hash** over cell id + BOM lines + totals, excluding all timestamps and UI text.

```
Contract hash (numeric):  ae5478233c889646f0cebff653a57c2446ec35aab872d9268344156ac9e7002d
Frozen artifact SHA-256:  db3188f89d84aef878875f331399af9ae8b0ca2774a398d68c44b56eb01a915f
```

**Why:** the frozen artifact contains `capturedAtUtc`, so its file SHA changes on every re-run and can never be reproduced. It remains valid as the immutable fingerprint of the stored file; it is not a re-runnable test. The contract hash is deterministic and is the actual gate.

The frozen artifact is unchanged and was not overwritten.

## C21 — CROSS-ROLE BOM-STATE ACCESS DEFERRED

**Status:** DEFERRED to Phase 1 · **Owner:** Engineering · **Phase:** 1

**Decision:** "Saved selections must load for every authorised role" is **not** delivered in Phase 0.

There are no roles yet, and `data/bom-state.json` contains customer name, phone and address. Serving it to unauthenticated callers would publish PII and constitute the data-visibility change this hotfix was explicitly told not to make.

**Consequence, stated plainly:** admin refresh now works, but a Sales user still does not load saved selections. The reported inverter mismatch is **reduced, not eliminated**. Full resolution requires the Phase 1 identity model.

## C22 — ENGINE REFACTOR DEFERRED

**Status:** DEFERRED to Phase 1/2 · **Owner:** Engineering

**Decision:** "One authoritative configuration source" and "collapse the seven independent inverter-resolution paths" are **not** delivered in Phase 0. Both are engine refactors and cannot be guaranteed numerically neutral.

H3 delivers the safe precursor: every resolution path is now labelled and observable, so a later refactor can be proved equivalent against the labels rather than assumed equivalent.

---

# PHASE 1 DECISIONS — appended 2026-08-15

Previous decisions above are unchanged. Nothing deleted.

## C23 — PACKAGE AUTHORITY: MODEL NOW, ENFORCEMENT AFTER BACKFILL

**Status:** APPROVED · **Phase:** 1 model, 2 enforcement

`packageComponents` and `approvedAlternates` are delivered as a model and are derived from the catalog, but selection is **not yet restricted** to the approved set.

**Why:** no profile currently names a single `componentId` — profiles carry brand/model *text*. `derivePackageComponents()` reports every role as unpinned. Enforcing today would reject the existing saved selections and change component choice across the baseline.

**Blocking work:** backfill real component ids into the profiles. Engineering task, not developer task. Audit risk **R1**.

## C24 — UPGRADE IDENTITY LIVES IN THE QUOTATION, NOT THE BOM

**Status:** APPROVED · **Phase:** 1

Premium 3→8 and 5→10 produce identical BOMs because both are a 5 kW delta and premium has no central inverter. **The BOM is correct; the BOM is simply not identity.**

Nothing was padded into the material list to force a difference — that would corrupt engineering data to solve a bookkeeping problem. Instead `upgradePathId, fromSize, toSize, deltaKw, tier` are carried explicitly by the quotation.

Mandatory upgrade sections: `panels, structure, inverter, wiring`. Optional: `hybridInv, battery`. The shipped wiring-only default was **not** changed (it would move the frozen baseline); `ENG-UPG-003` blocks the quotation instead.

## C25 — CATALOG LIFECYCLE: CLASSIFY AND VALIDATE, DO NOT FILTER YET

**Status:** APPROVED · **Phase:** 1 classify, 2 filter

Placeholder records are classified (`TEST`, `PENDING_REVIEW`) and raise `ENG-CMP-001` BLOCKED. Production dropdowns are **not** filtered yet.

**Why:** `is_9b53be37fab1 "New Isolator"` (₹0) is the **only value-tier 1P isolator in the catalog**. Filtering it would leave every 1P value/premium system with no isolator at all — worse than the placeholder. Logged as new defect **D11**.

**Blocking work:** add a real 1P value/premium isolator. Procurement + Engineering.

## C26 — ENGINEERING GATE IS ADVISORY IN PHASE 1

**Status:** APPROVED · **Phase:** 1 advisory, 2 enforcing

`validateEngineering()` runs on every BOM and the verdict is surfaced. The quotation is **not** hard-blocked.

**Why:** enforcing today would block most on-grid configurations because of D11 — a catalog data problem, not an engineering-logic one. Blocking before the data is fixed would stop Sales working.

**Enforcement conditions:** D11 (1P isolator) and D12 (premium battery MCCB) resolved.

## C27 — BATTERY IDENTITY IS ALWAYS THE `battery` CATEGORY

**Status:** APPROVED (implemented) · **Phase:** 1

A battery resolves to `categories.battery` and is priced from that record. The premium battery moves from the `enphase` alias (₹135,000) to canonical `bt2` (₹95,000).

The duplicate record is **retained** and registered in `BATTERY_IDENTITY_ALIASES` with its canonical id. **Do not delete before catalog review.**

**Price impact is real and intended:** premium hybrid material cost falls by ₹40,000 per system. Commercial sign-off required before this reaches customers.

## C28 — GOLDEN BASELINE v2

**Status:** APPROVED · **Phase:** 1

```
v1 (frozen, pre-Phase 1) : ae5478233c889646f0cebff653a57c2446ec35aab872d9268344156ac9e7002d
v2 (post-Phase 1)        : 13d2693275feb8677e91cc954844c2d7c9cbf93e41ef50c5615895cd9740350e
```
8 of 54 cells changed — all hybrid, all D1/D2 corrections. 46 unchanged. v1 remains frozen and untouched; v2 becomes the gate for Phase 2.

---

# PHASE 1B DECISIONS — appended 2026-08-15

Previous decisions above are unchanged. Nothing deleted.

## C29 — D11 ISOLATOR: STOPPED, NOT PATCHED

**Status:** ⛔ **BLOCKED — awaiting Engineering / Procurement** · **Phase:** 1B

No isolator component was created and no tier eligibility was changed.

**Gap is wider than first reported:** three tier × phase combinations have no legitimate isolator — **1P value, 1P premium, and 3P base**. 14 of 48 packages are BLOCKED.

The catalog cannot express the required specification at all: `poles`, `currentRating`, `voltageRating` and `AC/DC` **do not exist as fields** on any component, and there is no purchase/selling price split. Even the two real isolators (`is1`, `is2`) fail the stated field requirement — their ratings live inside display names.

**Required:** confirm whether `is1` and `is2` are electrically acceptable for the uncovered tiers (a tier-eligibility decision, not a new component), or name the approved products; decide whether AC and DC isolators must be modelled separately; extend the catalog schema.

## C30 — D12 PREMIUM MCCB: RULE MAY BE WRONG, NOT ONLY THE CATALOG

**Status:** ⛔ **BLOCKED — awaiting Engineering** · **Phase:** 1B

`mb1` was **not** given premium eligibility, because suitability could not be established from the source.

Premium hybrid is an **Enphase micro-inverter, likely AC-coupled** architecture (Envoy, Q Relay and System Controller are already in its BOM). Base/value use a **DC low-voltage** battery behind a Deye hybrid inverter. A 160 A DC battery MCCB is correct for the second topology and may be meaningless for the first.

**Therefore rule `ENG-BAT-003` ("battery present without MCCB → BLOCKED") may itself be over-applying.** It was extracted from `bomTemplates.hybrid.slots[4]`, which only ever described the DC-coupled topology. If the Enphase battery is AC-coupled, the rule needs a topology condition — the catalog does not need a new MCCB.

Widening `mb1`'s tier list would have turned the screen green while adding a possibly meaningless ₹8,500 line. Not done.

**Required:** confirm AC- vs DC-coupling for the premium battery; then either add tier eligibility, name the correct component, or add the topology condition to the rule. Also populate battery `kwh`, nominal voltage and max discharge current — currently `kwh` is **null on all five batteries**, so protection sizing can never be validated automatically.

## C31 — PACKAGE REGISTRY IS PROPOSED, NEVER AUTO-APPROVED

**Status:** APPROVED (process) · **Phase:** 1B

`data/packages.proposed.json` pins explicit componentIds for all 48 packages, but every record is `approvalStatus: "PROPOSED"` and each component carries `derivedBy` provenance.

**Why:** the ids were produced by fallback — `available[0]` and nearest-kW, decided by catalog array order. Marking them APPROVED would promote an accident into a permanent engineering decision.

**Measured state: 3 explicit of 326 components. 323 fallbacks. 0 of 48 packages meet the zero-fallback target.** Reported, not silently converted.

The registry is **not wired into the engine** — wiring it would move baseline v2 and enshrine unreviewed choices.

## C32 — ROLE TAXONOMY REQUIRES bomTemplates RESTRUCTURE

**Status:** DEFERRED to Phase 2 · **Phase:** 1B

The requested roles `microInverter`, `batteryCable`, `changeover`, `structure`, `acIsolator`, `dcIsolator`, `monitoring` and `protection` **do not exist as engine slots**. Battery cable and change-over are uncategorised `fixedItems` with no `category` field; the micro-inverter is emitted as `enphase` accessories; structure comes from `structureTemplates`.

**Package authority cannot pin what the BOM engine cannot name.** Giving every BOM line a role is a prerequisite, changes line metadata, and must be done against an explicit baseline diff.

## C33 — ENGINEERING GATE REMAINS ADVISORY

**Status:** APPROVED · **Phase:** 1B, enforcement after D11/D12/C31

Confirmed unchanged. Enforcing today would block 16 of 48 packages — including on-grid 3 kW Value, the highest-volume configuration — on catalog data gaps rather than genuine design faults.

**Enforcement conditions:** D11 resolved · D12 resolved · package registry approved. All three are Engineering decisions, none are developer tasks.

---

# PHASE 1C DECISIONS — appended 2026-08-15

Previous decisions above are unchanged. Nothing deleted.

## C34 — D11 ISOLATORS: APPROVED AND IMPLEMENTED

**Status:** ✅ APPROVED (implemented) · **Phase:** 1C

- **D11-A** `is1` Honey Well 2P 40A → eligible base, value, premium (1P).
- **D11-B** `is2` L&T 40A 4P → eligible base, value, premium (3P).
- **D11-C** V1 does **NOT** model a separate DC isolator. `DC_ISOLATOR` is excluded from the role taxonomy. Approved architecture: `PV → DCDB → inverter → ACDB → AC isolator → meter/grid`. DCDB and ACDB are independent assemblies; the AC isolator substitutes for neither.
- **D11-D** `is_9b53be37fab1` "New Isolator" → `status: TEST`. **Retained** for historical reference, **excluded** from resolution by a new engine status filter.

**No new isolator component was created.** Tier eligibility only. The catalog still holds exactly three isolator records.

**Baseline impact: 15 cells** — six of which previously shipped with **no isolation device at all** (`ONGRID-{5tp,6,8,10}-3P-BASE`, `HYBRID-{8,10}-3P-BASE`). Material +₹212 (1P) or +₹623 (3P) per system.

## C35 — BATTERY PROTECTION MODE

**Status:** ✅ APPROVED (implemented), per-battery values PENDING · **Phase:** 1C

`batteryProtectionMode ∈ {INTEGRATED, EXTERNAL_REQUIRED, EXTERNAL_OPTIONAL, UNKNOWN}`.

- `bt2` Enphase Flex/FlexPhase → **INTEGRATED**, provided by `ENERGY_SYSTEM_CONTROLLER`. Source: D12.
- `bt1`, `bt3`, `bt4` Deye/SEG → **UNKNOWN**. D12 forbids blindly adding `mb1` to every Deye battery, and the per-battery answer was not given.

`UNKNOWN` **preserves existing template behaviour** and raises `ENG-BAT-007` (WARNING). It neither asserts an unapproved requirement nor silently removes protection that is currently supplied.

**This also corrects rule `ENG-BAT-003`**, which in Phase 1 demanded an MCCB for every battery unconditionally. That rule was extracted from a template describing only the DC-coupled topology and was over-applying. It is now topology-aware.

## C36 — ENPHASE PREMIUM ARCHITECTURE

**Status:** ✅ Core APPROVED (implemented), several components PENDING · **Phase:** 1C

Approved and implemented:
- IQ8P quantity **= approved panel quantity** (verified 5/9/13/17 across 3/5/8/10 kW — not a hardcoded 13).
- FlexPhase battery **×1** for 3/5/8/10 kW premium hybrid.
- IQ System Controller **REQUIRED**, modelled as its own role `ENERGY_SYSTEM_CONTROLLER` — never INVERTER, BATTERY or ACCESSORY.
- Generic `mb1` 160 A MCCB **PROHIBITED** on premium.
- Generic 25 mm DC battery cable **PROHIBITED** on premium.
- The premium battery is a **BATTERY**, in the canonical `battery` category at ₹95,000 (`bt2`), never an accessory.

**PENDING — retained, not removed, not duplicated:** `en3` Envoy, `en4` IQ Relay, `en6` CT. Marked `PENDING_CONFIGURATION_CONFIRMATION`; `ENG-ENP-003` raises WARNING so a premium hybrid never reports fully VALID while unconfirmed.

**NOT IMPLEMENTED — no data exists:** panel/IQ8P compatibility, IQ8P electrical limits, branch/circuit limits, IQ Cable configuration, Q Cable and Q Terminator rules. The catalog holds no Enphase limits. Implementing them would require inventing values. Recorded as open item ENP-1.

**Enphase communication cable** (supplied commercial BOM: 10 m, ₹6,000 + GST) — recorded as role `ENPHASE_COMMUNICATION`, **not added to the BOM**, no catalog identity invented. `ENG-ENP-004` warns.

## C37 — ROLE TAXONOMY IMPLEMENTED

**Status:** ✅ APPROVED (implemented) · **Phase:** 1C · supersedes the deferral in C32

20 roles in `src/lib/bomRoles.js`. **`DC_ISOLATOR` excluded** per D11-C.

Enphase rows map **by componentId, never by display name**. Only two uncategorised `fixedItems` were mapped — `25mm Battery Cable` and `40A Change Over Switch` — because their physical identity is unambiguous. The remaining ~36–39 per system stay `OTHER`, per the instruction not to force a role onto an uncertain item.

**The mapping changed no BOM quantity and no price.** Metadata only; confirmed by the baseline diff.

## C38 — PARTIAL PACKAGE APPROVAL

**Status:** ✅ APPROVED (implemented) · **Phase:** 1C

**34 of 322** component records now carry `approvalStatus: APPROVED` with an `approvedByDecision` id (`D11-A`, `D11-B`, `D12`). **288 remain PROPOSED.**

**No fallback-derived component was auto-approved.** A test asserts that any APPROVED component carries a decision id and that no fallback component is approved without one. Packages fully approved: **0 of 48**.

## C39 — GOLDEN BASELINE v3

**Status:** APPROVED · **Phase:** 1C

```
v1 legacy      : ae5478233c889646f0cebff653a57c2446ec35aab872d9268344156ac9e7002d  (frozen)
v2 engineering : 13d2693275feb8677e91cc954844c2d7c9cbf93e41ef50c5615895cd9740350e
v3 engineering : b215b2fdbaf706eb54ded498a1d36faaeed9d82e66963a174c423edbae10adc1
```

**19 of 54 cells changed. All attributable:** 15 isolator (D11), 2 premium MCCB removal (D12), 2 both. 35 unchanged. Verified reproducible — two independent captures produced the identical hash.

v1 and v2 remain retained. v3 is the gate for the next phase.

---

# PHASE 1D — BATTERY SELECTION + ENGINEERING COMPATIBILITY MODEL

## C40 — THE BATTERY IS NOT BOUND TO ANY SINGLE PRODUCT

**Status:** ✅ APPROVED (implemented) · **Owner:** Engineering · **Phase:** 1D

The hardcoded `BATTERY_PROTECTION_BY_COMPONENT` table that named `bt1`–`bt4`
literally is **superseded** by `data/battery-master.json`, an overlay keyed by
componentId. Protection topology and engineering approval are now **data**.

The legacy table is retained, marked SUPERSEDED, and consulted **only** when a
caller supplies no master data — so offline scripts and older tests keep their
exact previous behaviour. No new entries may be added to it.

## C41 — BATTERY LIFECYCLE: PROCUREMENT PROPOSES, ENGINEERING APPROVES

**Status:** ✅ APPROVED (implemented) · **Phase:** 1D

```
PROCUREMENT CATALOG -> PENDING_ENGINEERING_APPROVAL -> APPROVED -> selectable
```

A battery record with no master-data overlay defaults to
`PENDING_ENGINEERING_APPROVAL`, so **a battery Procurement adds is not selectable
by default**. Safety does not depend on Procurement remembering to do anything.

`ENGINEERING_STATUS` and `PROCUREMENT_STATUS` are separate axes. A battery must
be APPROVED **and** commercially available to appear in a Project Head shortlist.

## C42 — NO AUTOMATIC BATTERY SUBSTITUTION, EVER

**Status:** ✅ APPROVED (implemented) · **Phase:** 1D

If a project override names a battery that is not selectable, `resolveBattery`
returns **that component** with `source: 'projectOverride(blocked)'` and issue
`BATTERY_OVERRIDE_NOT_SELECTABLE`. It does not fall through to another battery.
The identity is preserved specifically so the block can name it.

## C43 — NO PROTECTION RATING IS ASSUMED

**Status:** ✅ APPROVED (implemented) · **Phase:** 1D · extends D12

`protectionRating` is `null` for every battery in the current data set.

- 160 A is not assumed. 125 A is not assumed. Nothing is derived from Ah.
- **`bt1` is NOT permanently bound to `mb1` 160 A.** It is recorded as
  `externalProtectionRequired: true`, `protectionRating: null`.
- `resolveBattery` raises `BATTERY_PROTECTION_RATING_UNRECORDED` in that state.

The `mb1` line still emits for `bt1` because that is existing approved template
behaviour and this phase is numerically neutral. The rating remains **open item
D12-E**.

## C44 — PROTECTION IS THE ONE SAFETY-CRITICAL FIELD IN V1

**Status:** ✅ APPROVED (implemented) · **Phase:** 1D

`REQUIRED_FOR_SAFE_ISSUE = ['integratedProtection']`.

- protection unknown -> **BLOCKED** ("Cannot safely validate this battery configuration")
- protection known, other electrical data missing -> **WARNING** ("Engineering data incomplete — review required")

`bt3` (Okaya) and `bt4` (Livguard) are in the BLOCKED state and are consequently
`PENDING_ENGINEERING_APPROVAL`, so they never reach a BOM.

## C45 — COMPATIBILITY MODELLED IN TEN DIMENSIONS, NO INVENTED THRESHOLDS

**Status:** ✅ APPROVED (implemented) · **Phase:** 1D

Checks **BC-A … BC-J**. A check whose input data does not exist returns
`INDETERMINATE` naming the missing field — never PASS. `compatibleInverters` is
`null` for every battery, so per-inverter compatibility is **modelled and
enforced but not yet populated**. Populating it is an engineering data task, not
a code change.

BC-J (architecture) is the only fully decided rule: ENPHASE accepts only Enphase;
an Enphase battery cannot be placed on a non-Enphase architecture.

## C46 — PACKAGE DEFAULT AND PROJECT OVERRIDE ARE SEPARATE CONCEPTS

**Status:** ✅ APPROVED (implemented) · **Phase:** 1D

`packageDefaults` is deep-frozen at construction; `applyProjectOverride` returns
a new configuration and writes only into `overrides`. A Project Head changing
Project A cannot alter the package or Project B. Sales cannot change `BATTERY` at
all (`SALES_IMMUTABLE_ROLES`).

RBAC is **not** built in this phase; these are the rules the future RBAC layer
must enforce, expressed as testable functions.

## C47 — LOCKED PROJECT BOMS ARE STRUCTURALLY IMMUTABLE

**Status:** ✅ APPROVED (implemented) · **Phase:** 1D

Snapshots and their lines are `Object.freeze`d.
`applyProcurementPriceChange` on a LOCKED snapshot returns **the same object
reference**, unchanged. New quotations price through a different function
entirely. `classifyProcurementChange().rewritesLockedProjectBoms` is `false` by
construction. Revision produces `{ previous: SUPERSEDED, current: LOCKED }` —
history is added to, never overwritten.

## C48 — PHASE 1D IS NUMERICALLY NEUTRAL

**Status:** ✅ APPROVED (verified) · **Phase:** 1D

```
v3 engineering (gate) : b215b2fdbaf706eb54ded498a1d36faaeed9d82e66963a174c423edbae10adc1
v4 after Phase 1D     : b215b2fdbaf706eb54ded498a1d36faaeed9d82e66963a174c423edbae10adc1
```

**0 of 54 cells changed.** The engineering gate removes from selection only
components that were never chosen anyway (`ba_3b51aef23f0b`, and `bt3`/`bt4` in
the ambiguous base tier), so identity, quantities and every total are identical.

A side effect worth recording: the gate also **removes the `BATTERY_AMBIGUOUS`
condition** in the base tier — three candidates became one approved candidate —
without changing which battery is chosen.

**288 PROPOSED components remain PROPOSED. None was auto-approved.**

## C49 — REMAINING BATTERY ENGINEERING DECISIONS

**Status:** OPEN · **Owner:** Project/Engineering · **Blocks:** Cost Engine confidence, Procurement UI

| id | question |
|---|---|
| D12-E | `bt1` external protection: which device, what rating? (must not be assumed) |
| D13-A | `bt3` Okaya: protection mode, electrical data, approve or reject? |
| D13-B | `bt4` Livguard: protection mode, electrical data, approve or reject? |
| D13-C | `compatibleInverters` per battery — which Deye/SEG inverters is each battery approved for? |
| D13-D | Voltage/current windows on inverter records (`batteryVoltageMin/Max`, `maxBatteryCurrent`) |
| D13-E | Communication protocol per battery and per inverter |
| D13-F | `capacityKwh` for `bt1` and `bt2` — required for backup sizing |
| D13-G | Multi-battery Deye packages: is `batteryQuantity > 1` approved, and with what protection? |

## C50 — bt1 IS PENDING_ENGINEERING_APPROVAL, NOT APPROVED

**Status:** ✅ APPROVED (implemented) · **Owner:** Project/Engineering · **Phase:** 1D review

`bt1` (SEG.5 PRO 100AH LV) was recorded APPROVED in the initial Phase 1D overlay.
That was **inconsistent with the validator**: `externalProtectionRequired: true`
with `protectionRating: null` makes BC-G INDETERMINATE and safety-critical, so the
compatibility verdict is BLOCKED. **An APPROVED engineering status must never
imply a battery is safe to issue.**

`bt1.engineeringStatus = PENDING_ENGINEERING_APPROVAL` until these seven are
confirmed — none of which is invented here:

1. exact SEG battery model · 2. nominal battery voltage ·
3. maximum continuous discharge current · 4. exact Deye inverter compatibility ·
5. communication protocol · 6. external protection requirement confirmation ·
7. correct protection device / rating

Standing decision unchanged: **EXTERNAL BATTERY PROTECTION = REQUIRED.**
Device and rating remain **OPEN D12-E**. `mb1` 160 A was not selected. No other
MCCB was selected. **The BOM was not changed to compensate.**

`statusHistory` on the record retains the prior APPROVED entry — the correction
is added, not overwritten.

## C51 — TWO GATES: FREE SELECTION vs RESOLVABILITY

**Status:** ✅ APPROVED (implemented) · **Phase:** 1D review

A PENDING battery must not be freely selectable, but must NOT be erased from a
package that already uses it — erasing it would emit a hybrid BOM with **no
battery**, which is defect D1 that Phase 1C fixed.

| gate | function | on PENDING |
|---|---|---|
| free selection (Project Head shortlist, new picks) | `isSelectable` | not offered |
| resolvability (what a package may still resolve to) | `isPermanentlyUnselectable` | **retained** |

Only REJECTED / WITHDRAWN / INACTIVE / DISCONTINUED are removed outright.

**Approval must not reorder identity.** Tier candidates are filtered by
resolvability only, so approving some other battery can never silently change
which battery a package resolves to. Approval is asserted after resolution via:

```
ENG-BAT-009  BLOCKED  selected battery is not engineering-approved
ENG-BAT-010  BLOCKED  data required to issue the BOM safely is not recorded
```

## C52 — BASELINE v5: BLOCKED WITHOUT ANY NUMERIC CHANGE

**Status:** ✅ APPROVED (verified) · **Phase:** 1D review

```
v3 engineering (gate) : b215b2fdbaf706eb54ded498a1d36faaeed9d82e66963a174c423edbae10adc1
v5 after correction   : b215b2fdbaf706eb54ded498a1d36faaeed9d82e66963a174c423edbae10adc1
```

**0 of 54 cells changed.** What changed is the engineering verdict only:

| | before | after |
|---|---|---|
| hybrid Value (3, 5, 8, 10 kW) | WARNING · 1 warn | **BLOCKED · 2 blocked · 1 warn** |
| hybrid Base / Premium | WARNING | unchanged |
| all on-grid, upgrade, future-upgrade | WARNING / VALID | unchanged |

Package resolution: VALID 12 → 12, WARNING 36 → 32, BLOCKED 0 → **4**.
**4 packages moved WARNING → BLOCKED. 0 moved from VALID.**

This BLOCKED state is the **desired safety behaviour** while engineering data is
incomplete. It is not a software failure.

---

# PHASE 1E — PROJECT BOM AUTHORITY + AUTOMATIC ENGINEERING CHECKER

## C53 — SELECTION AND VALIDATION ARE SEPARATE AUTHORITIES

**Status:** ✅ APPROVED (implemented) · **Owner:** Project/Engineering · **Phase:** 1E

- **Project Head** = authority for WHAT is in the project BOM.
- **Engineering Checker** = authority for WHETHER it is valid.
- **Procurement** = material/pricing authority. **Admin** = commercial authority.
  **Sales** = quotation consumer.

Enforced structurally, not by convention:

- `projectBom.js` contains **no validation**. `setComponent` accepts any
  componentId, including one with no engineering data. A component is never
  refused for engineering reasons at selection time.
- `engineeringChecker.js` contains **no mutation** and imports no mutation
  function. A test asserts `setComponent` / `setQuantity` / `removeRole` do not
  appear anywhere in its source.

## C54 — AN INVALID COMPONENT IS NEVER HIDDEN

**Status:** ✅ APPROVED (implemented) · **Phase:** 1E

If a Project Head selects an invalid component, the system does **not** remove
it, replace it, substitute another, set its quantity to zero, or fall back. It
stays in the BOM, is named in the finding, and the configuration is BLOCKED.

- a line leaves the BOM ONLY via `removeRole` — an explicit, recorded Project
  Head action. `setComponent(role, null)` throws and points at `removeRole`.
- a role present with quantity ≤ 0 is itself a blocker (`PBC-L-001`), so zeroing
  cannot be used to hide a component.

## C55 — CHECKER RULE REGISTER: 19 CATEGORIES, 33 RULES

**Status:** ✅ APPROVED (implemented) · **Phase:** 1E

Categories **A–S** from the brief are all represented; a test fails if any
category has no rule. Battery categories E–I delegate to
`batteryCompatibility.js` so there is one battery rule set, not two.

Every finding carries `ruleId · category · severity · componentIds · message ·
reason · source · inputs · rulesVersion · catalogVersion · at`.

**No threshold is invented.** Every limit compared against is a value recorded in
the catalog. The one derived value is cold Voc, using the EXISTING App.jsx
stringConfig assumption (min cell 15 °C, STC 25 °C), cited as the rule source.
Where a limit is not recorded the checker reports it unverifiable (`PBC-C-001`,
`PBC-D-001`, `PBC-D-003`, `PBC-F-002`, `PBC-G-002`, `PBC-I-001`, `PBC-N-001`) —
never a silent pass and never a guessed number.

## C56 — THE CHECKER IS DETERMINISTIC

**Status:** ✅ APPROVED (implemented) · **Phase:** 1E

Same BOM + same catalog version + same rules version → identical result.

- `at` is a parameter; a test asserts `Date.now(`, `new Date(` and `Math.random(`
  do not appear in the code (comments stripped first)
- `effectiveLines` sorts by role; category scan sorts keys; findings sort by
  `(ruleId, componentIds)`. Test 21 reverses the input order and asserts an
  identical verdict.
- no nearest-kW fallback — a test asserts the string `nearest` is absent
- `deterministicKey` exposes the finding set without timestamps for comparison

`RULES_VERSION = 'phase1e.1'`.

## C57 — BOM LOCK POLICY

**Status:** ✅ APPROVED (implemented) · **Phase:** 1E

`attemptLock` runs a COMPLETE validation pass at lock time — never a cached
verdict.

```
BLOCKED         -> REJECTED_BLOCKED         BOM returned unchanged, still editable
WARNING         -> LOCKED only with explicit acknowledgement of the gating rules
                   otherwise REJECTED_UNACKNOWLEDGED
VALID           -> LOCKED, immutable snapshot
already locked  -> ALREADY_LOCKED           revise instead
```

Six warning rules require a named acknowledgement because they hide an
**unverified electrical limit**: `PBC-D-001`, `PBC-D-003`, `PBC-F-002`,
`PBC-G-002`, `PBC-N-001`, `PBC-R-002`. Each acknowledgement records
`{ ruleId, by, at, note }` **on the snapshot** — who accepted an unverified limit
is part of the permanent record.

Lock is a gate, not a repair: rejection never edits the BOM.

## C58 — PHASE 1E IS PURELY ADDITIVE

**Status:** ✅ APPROVED (verified) · **Phase:** 1E

Three new modules (`projectBom.js`, `engineeringChecker.js`, `bomLock.js`), one
new test file. **`src/App.jsx` was not modified**, so the built bundle hash is
byte-identical to the Phase 1D-review build.

```
baseline gate : b215b2fdbaf706eb54ded498a1d36faaeed9d82e66963a174c423edbae10adc1
after 1E      : b215b2fdbaf706eb54ded498a1d36faaeed9d82e66963a174c423edbae10adc1
```

**0 of 54 cells changed.** No BOM quantity or price moved.

## C59 — PROJECT BOM UI IS NOT BUILT IN 1E

**Status:** DEFERRED · **Phase:** 2

The domain model and validation are complete and tested without a UI, by
instruction. The Project workspace screen, the RBAC enforcement of
`SALES_IMMUTABLE_ROLES` at the transport layer, Cost Engine, Procurement UI,
Sales workflow and the quotation redesign remain not started.

---

# PHASE 2A — COST & PRICING ENGINE V1

## C60 — GROSS MARGIN, NOT MARKUP

**Status:** ✅ APPROVED (implemented) · **Owner:** Admin · **Phase:** 2A

```
sellingPriceBeforeGST = totalActualCost ÷ (1 − grossMargin)
```

₹2,00,000 at 20% → **₹2,50,000**, gross profit ₹50,000, achieved margin 20%.

`cost × (1 + margin)` is **FORBIDDEN**. It yields ₹2,40,000 and an achieved
margin of 16.7% — it understates margin on every project. `MARKUP` is in
`FORBIDDEN_MARGIN_TYPES`; a source assertion checks the `(1 + margin)` form does
not exist in `pricingEngine.js`.

The legacy engine applied the user-entered percentage as a **markup**
(`src/App.jsx`: `preGstSub × marginPct / 100`). That is the behaviour being
replaced, so no legacy default margin was carried forward. `targetGrossMargin`
is `null` until Admin records an approved figure (open item **P2-F**).

Validation: `0 <= m < 1`. 100%, 150% and negatives are rejected; there is no
division by zero.

## C61 — ONE AUTHORITATIVE COST ENGINE; MARKETRATE CANNOT REPLACE IT

**Status:** ✅ APPROVED (implemented) · **Phase:** 2A

`marketRate` is `REFERENCE_ONLY` with `usedInCalculation: false`.
`costEngine.js` contains no reference to it at all.

A test replays the Phase 0 loss-making case — market rate ₹2,00,000 against a
real cost of ₹2,24,869 — and asserts the engine still prices at cost ÷ (1 − m),
**above** the market rate. The old behaviour where `marketRate` could override
the cost engine cannot return.

## C62 — COST REQUIRES A LOCKED BOM

**Status:** ✅ APPROVED (implemented) · **Phase:** 2A

An unlocked BOM returns `COST_NOT_AVAILABLE_UNTIL_BOM_LOCKED` with
`totalActualCost: null`. A final commercial cost is never derived from an
unlocked engineering configuration.

## C63 — ONLY A PURCHASE PRICE MAY ENTER A PROJECT COST

**Status:** ✅ APPROVED (implemented) · **Phase:** 2A

```
PRICE_TYPE = PURCHASE_PRICE | SELLING_PRICE | REFERENCE_PRICE | UNKNOWN
VALID_FOR_COST = [PURCHASE_PRICE]
```

A missing purchase price is `COST_DATA_INCOMPLETE` — the line stays `null` and
the total stays `null`. No selling price, reference price, display price,
nearest catalog price or market rate is ever substituted.

## C64 — NINE COST HEADS, NEVER COLLAPSED, NEVER SILENTLY ZERO

**Status:** ✅ APPROVED (implemented) · **Phase:** 2A

MATERIAL · STRUCTURE · INSTALLATION · SITE_SURVEY · ENGINEERING_DESIGN ·
TRANSPORTATION · SERVICE_AMC · MISCELLANEOUS · OFFICE_EXPENSE_ALLOCATION.

Each carries owner, inputs, formula, amount, config version and status. Every
formula is in `docs/phase2/COST_HEADS.md`. An unconfigured head returns `null`
with a named code — **never** zero:

```
SITE_SURVEY_NOT_CONFIGURED · ENGINEERING_DESIGN_NOT_CONFIGURED
INSTALLATION_RATE_NOT_CONFIGURED · STRUCTURE_RATE_NOT_CONFIGURED
TRANSPORT_DATA_INCOMPLETE · SERVICE_CONFIG_INCOMPLETE
MISC_CONFIG_INCOMPLETE · OFFICE_ALLOCATION_INVALID
```

Structure is separate from installation. Engineering/design is separate from
installation. An explicit approved rate of `0` is accepted and recorded as such.

## C65 — INSTALLATION UNIT IS ESTABLISHED BY THE SOURCE, NOT ASSUMED

**Status:** ✅ APPROVED (implemented) · **Phase:** 2A

Both `PER_KW` and `PER_PROJECT` are supported and **every rate record must
declare its unit explicitly**, or the head fails.

The source establishes `PER_PROJECT`: `src/App.jsx:2113` uses the matrix value
directly without multiplying by kW, and 3 kW flat = 15000 vs 10 kW flat = 42000
is not a common per-kW rate. This is evidence, not an assumption, and it is
recorded in `data/cost-config.json` under `unitEvidence`.

`costs.installRate = 3000/kW` is retained as a LEGACY fallback but is **never
applied silently** — a matrix miss is `INSTALLATION_RATE_NOT_CONFIGURED` unless
the caller opts in explicitly.

## C66 — CONFLICTING SOURCE VALUES ARE RECORDED, NOT SILENTLY RESOLVED

**Status:** OPEN (recorded) · **Phase:** 2A

| conflict | engine uses | also in source | open item |
|---|---|---|---|
| transport rate | `transportConfig.costPerKm = 35` | `costs.transportRate = 40` (never read) | **P2-C** |
| office fallback | `monthlyExpense ÷ expected` | `costs.office = 5500` (legacy fallback) | **P2-E** |

The office fallback is deliberately **not** carried over: `expectedProjectsPerMonth <= 0`
returns `OFFICE_ALLOCATION_INVALID`, because a silent fallback hides a
misconfiguration.

## C67 — GST IS SEPARATE, SINGLE-REGIME, AND APPLIED ONCE

**Status:** ✅ APPROVED (implemented) · **Phase:** 2A

GST is computed once, on `sellingPriceBeforeGST`, at the configured rate (9%,
sourced from the existing engine). It is never inside any cost head and never
inside the gross-margin calculation. `priceExcludingGST`, `gstAmount` and
`priceIncludingGST` are distinct fields. Statutory correctness of a flat 9%
composite is open item **P2-G**.

## C68 — NET METERING AND EXTRAS ARE OUTSIDE THE BASE SYSTEM

**Status:** ✅ APPROVED (implemented) · **Phase:** 2A

Extras carry `extraId · type · description · customerPrice · gstRatePct ·
includedInBase: false` (set by the engine, not the caller). An extra does not
change `sellingPriceBeforeGST`, `grossProfit` or `achievedGrossMarginPct` — all
three asserted. Net metering is not a cost head and not a BOM line.

## C69 — COMMERCIAL SNAPSHOT PINS NINE VERSIONS

**Status:** ✅ APPROVED (implemented) · **Phase:** 2A

`bomSnapshotId · catalogVersion · procurementPriceVersion · costConfigVersion ·
marginVersion · gstVersion · costEngineVersion · pricingEngineVersion ·
moneyRuleVersion`.

Deep-frozen. `applyConfigChange` returns the SAME object reference with
`mutated: false`. `recalculateForNewQuotation` produces a new calculation and a
`{before, after, delta, versionsChanged}` comparison without touching the old
snapshot. A procurement price change and an admin margin change were both tested
against an issued snapshot: new calculation moves, snapshot does not.

## C70 — ONE CENTRAL ROUNDING RULE

**Status:** ✅ APPROVED (implemented) · **Phase:** 2A

`money.js`: full double precision throughout, round **once** at publication,
HALF_UP (symmetric for negatives), whole rupees. The total is the rounded sum of
**exact** heads, never a sum of rounded heads. `MONEY_RULE_VERSION = 'money.1'`
is pinned on every snapshot.

## C71 — PHASE 2A IS PURELY ADDITIVE

**Status:** ✅ APPROVED (verified) · **Phase:** 2A

Four new modules, one new config file, one new test file. **`src/App.jsx` was
not modified** — SHA `97dfe333…` before and after — so the built bundle hash is
byte-identical (`index-vy7RQ7xF.js`).

```
baseline gate : b215b2fdbaf706eb54ded498a1d36faaeed9d82e66963a174c423edbae10adc1
after 2A      : b215b2fdbaf706eb54ded498a1d36faaeed9d82e66963a174c423edbae10adc1
```

**0 of 54 cells changed.** The legacy engine's own cost/pricing display is
untouched; the new engines run alongside it and are not yet wired into the UI.

## C72 — REMAINING COMMERCIAL DECISIONS

**Status:** OPEN · **Owner:** Admin / Project Head · **Blocks:** quotation redesign

| id | question | owner |
|---|---|---|
| P2-A | Internal site-survey cost — approved rate, or an explicit approved 0? | Project Head |
| P2-B | Engineering/design cost — approved rate, or an explicit approved 0? | Project Head |
| P2-C | Transport rate: 35/km or 40/km? Two values exist in the source. | Admin |
| P2-D | Service: is the annual rate correct, or is it servicesPerYear × costPerService? | Project Head |
| P2-E | Office allocation when expected volume is unset — reject (current) or a floor? | Admin |
| P2-F | Approved target gross margin per tier / system type | Admin |
| P2-G | Is a flat 9% composite correct for every supply? | Admin |
| P2-H | Is the installation matrix PER_PROJECT confirmed by the business, not only by the code? | Project Head |
| P2-I | Customer-facing net-metering price, and whether an internal net-metering cost should be modelled | Admin |

## C73 — GST REGIME: SOLAR_70_30_COMPOSITE

**Status:** ✅ APPROVED (implemented) · **Owner:** Admin · **Phase:** 2A · **closes P2-G**

```
GOODS    70% of the supply  @  5%   ->  3.5
SERVICE  30% of the supply  @ 18%   ->  5.4
                            effective  8.9%
```

**8.9% is DERIVED, not entered.** The engine computes the goods and service
components separately and sums them, so both are reportable on an invoice.
`effectiveRatePct` in the config is a cross-check only: a declared value that
disagrees with the split returns `GST_EFFECTIVE_RATE_MISMATCH` and **the split
is authoritative**. Declaring 9% against this split is rejected.

On a ₹2,50,000 pre-GST selling price:

| component | taxable | rate | tax |
|---|---|---|---|
| GOODS | 175,000 | 5% | 8,750 |
| SERVICE | 75,000 | 18% | 13,500 |
| total | 250,000 | 8.9% | **22,250** |

**Supersedes the legacy flat 9%** (`gst@2026-08-15.1`), which overstated tax by
0.1 percentage point — ₹22,500 vs ₹22,250 on the example. A test asserts that
₹250 delta so the correction is visible, not incidental.

`FLAT` is retained as a regime for supplies that genuinely have one rate and for
legacy regression. **One regime per price, always** — asserted by component
count (composite → 2, flat → 1).

Validation added: `GST_REGIME_INVALID`, `GST_SPLIT_INVALID`,
`GST_EFFECTIVE_RATE_MISMATCH`. A valuation split that does not total 100% is
rejected.

Extras: an extra with no declared rate follows the system regime (net metering
is taxed 70/30); an extra declaring its own `gstRatePct` is taxed FLAT at that
rate on the extra alone.

GST remains outside every internal cost head and outside the gross-margin
calculation — re-asserted after the change.

---

# PHASE 2A FINAL — COMMERCIAL MODEL CORRECTION

Full decision register with owner, reason, modules and version:
`docs/phase2/PHASE2A_DECISIONS.md`. History above is unchanged.

## C74 — PROCUREMENT OWNS TWO VALUES; NO COMPONENT-LEVEL SELLING PRICE

**Status:** ✅ APPROVED (implemented) · **Date:** 2026-08-15 · **Owner:** Procurement/Admin
**Modules:** `procurementPriceMaster.js`, `costEngine.js` · **Version:** costEngine.2

`purchasePrice` (supplier) and `landedUnitCost` (after inbound logistics,
handling, warehousing) are separate, separately versioned, and never overwrite
each other.

```
MATERIAL_LANDED = SUM(quantity × landedUnitCost)     NOT purchasePrice
```

A missing landed cost is **never** filled with the purchase price, even when one
exists — `LANDED_COST_NOT_CONFIGURED`. Landed cost is **entered by Procurement,
never derived**: no allocation by weight, quantity, value or volume. A test greps
the module for allocation logic and fails if any appears.

No component-level selling price exists in V1 — one pricing methodology, at
project level. Offering one marks the record with a violation.

## C75 — INSTALLATION: EXACT MATCH ONLY, LEGACY PER-KW FALLBACK REMOVED

**Status:** ✅ APPROVED (implemented) · **Owner:** Project Head · **Version:** install@2026-08-15.2

Exact `systemSizeKw` + `installationType`. **The nearest system size is never
used.** A 4 kW project with 3 kW and 5 kW configured returns
`INSTALLATION_COST_NOT_CONFIGURED` and blocks. `catalog.costs.installRate`
(3000/kW) is removed and unreachable.

## C76 — PROJECT TRANSPORTATION IS WAREHOUSE→SITE, ONE-WAY, PER VEHICLE

**Status:** ✅ APPROVED (implemented) · **Owner:** Project Head

```
TRANSPORTATION_COST = distanceKm × selectedVehicle.ratePerKm
```

Supplier→warehouse logistics live inside `landedUnitCost` and are never charged
again. Distance is ONE-WAY and the system never doubles it. **No universal
per-km rate**: the legacy 35/km, 40/km and the 100 km free-distance allowance are
all recorded as rejected and never applied. **No vehicle rate was supplied**, so
this head blocks — open item P2-M.

## C77 / C78 — SITE SURVEY AND ENGINEERING/DESIGN

**Status:** ✅ APPROVED (implemented) · **Owner:** Project Head

- Site survey **₹500 per project**, coverage **100 km**. Coverage is an
  ELIGIBILITY rule, not a multiplier; no transportation is added to the survey.
  Beyond 100 km → `SITE_SURVEY_OUT_OF_COVERAGE`, no rate invented (P2-K).
- Engineering/design **₹500 per project**, **≤20 kW**, **ALL-INCLUSIVE**
  (engineer cost, engineer travel, design work, site engineering report).
  Engineer travel is never added separately; never computed per kW. Above 20 kW →
  `ENGINEERING_DESIGN_OUT_OF_COVERAGE` (P2-L).

## C79 — SERVICE MODEL APPROVED, VALUES NOT SUPPLIED

**Status:** ⚠️ MODEL APPROVED, CONFIG BLOCKED · **Owner:** Project Head

`annualCost × serviceYears`, ≤10 kW, not by visit count. The values were not
supplied. `catalog.costs.serviceRateYear = 2000` / `serviceYears = 5` are
recorded as `UNCONFIRMED` and **not promoted** — `SERVICE_COST_NOT_CONFIGURED`,
never ₹0. Open item P2-N.

## C80 — SPECIAL PROJECT WORKS ARE EXPLICIT

**Status:** ✅ APPROVED (implemented) · **Owner:** Project Head

11 work types. Added only by the Project Head, each its own visible line with
`amount · reason · addedBy · at`. Never automatic, never hidden inside
miscellaneous, no invented rate. No work added → `0` (a real zero).

## C81 — MISCELLANEOUS IS A 1% ALLOWANCE ON DIRECT COST

**Status:** ✅ APPROVED (implemented) · **Owner:** Admin · **Version:** misc@2026-08-15.2

```
DIRECT_PROJECT_COST = the nine heads excluding miscellaneous
MISCELLANEOUS       = DIRECT_PROJECT_COST × 1%
```

Labelled **CONFIGURED MISCELLANEOUS ALLOWANCE**, not hidden margin. Never
computed from the selling price, so no circular dependency exists. Admin may
change it, including to 0% — and 0% is an explicit valid value, while an
*unconfigured* percentage is `MISC_CONFIG_INVALID`, not zero. The legacy fixed
₹1000 is superseded.

## C82 / C83 — TIER MARGINS AND THE MINIMUM-MARGIN HARD GATE

**Status:** ⚠️ MECHANISM IMPLEMENTED, VALUES BLOCKED · **Owner:** Admin

Per-tier `targetMarginPct` / `minimumMarginPct` for BASE, VALUE, PREMIUM,
versioned, constrained `0 ≤ min ≤ target < 100`. Nothing hardcoded; the shipped
config carries `null` and pricing returns `MARGIN_CONFIG_INVALID` (P2-F).

**Minimum margin is a hard commercial gate.** Actual margin below the tier
minimum → `MARGIN_BELOW_MINIMUM`, quotation **BLOCKED**, no price issued, and
Sales cannot bypass it. Below target but at or above minimum →
`SALES_HEAD_APPROVAL_REQUIRED`.

## C84 — DISCOUNT LAYER

**Status:** ✅ APPROVED (implemented) · **Owner:** Admin

```
LIST_SELLING_PRICE → DISCOUNT → FINAL_SELLING_PRICE → ACTUAL_GROSS_MARGIN → MINIMUM_MARGIN_CHECK
```

The margin is **always** recomputed after the discount, never reported only
before it. A discount never modifies the underlying cost. The Sales discount UI
and approval workflow remain a later phase.

## C85 — PUBLISHED FIGURES MUST RECONCILE

**Status:** ✅ APPROVED (implemented) · **Owner:** Admin · **Found during implementation**

Rounding once on an exact sum made `base + GST` differ from the printed total by
₹1. Corrected: figures a customer sees side by side are composed from **rounded
parts** — goods GST + service GST = total GST, base + GST = total — while exact
values are retained for audit. Cost heads still sum exact and round once.

## C86 — NET METERING BOUNDARY UNCHANGED, PRICE MASTER DEFERRED

**Status:** ✅ APPROVED · **Owner:** Admin

CUSTOMER_EXTRA, outside `TOTAL_ACTUAL_PROJECT_COST`, base selling price, base
gross profit and base gross margin. The detailed net-meter price master
(TP/SP/brand) is DEFERRED and none is invented. With no approved net-metering tax
rule, an extra with no declared rate follows the system GST regime.

## C87 — PHASE 2A FINAL IS BLOCKED ON EIGHT BUSINESS DECISIONS

**Status:** ⛔ BLOCKED · **Owner:** Admin / Project Head / Procurement

P2-J landed costs · P2-M vehicle rates · P2-N service values · P2-F tier margins ·
P2-K survey beyond 100 km · P2-L design above 20 kW · P2-H installation unit
confirmation · P2-I net-metering price.

The mechanism for every one is implemented and tested. Each returns an explicit
status code and blocks the total. **No rule was invented to make the phase
appear complete.**

## C79-CORRECTED — SERVICE FORMULA IS PER VISIT, PER C9

**Status:** ✅ CORRECTED (implemented) · **Date:** 2026-08-15 · **Owner:** Project Head
**Supersedes:** the C79 wording above · **Modules:** `costEngine.js`, `cost-config.json`
**Version:** service@2026-08-15.3 · costEngine.2

**The C79 entry above was wrong and is superseded.** It recorded the service
model as `annualCost × serviceYears`, taken from the Phase 2A brief's summary
wording. The authoritative approved decision is **C9**:

```
internalServiceCost = costPerVisit × visitsPerYear × serviceYears
```

C79's text is retained above as history, not as instruction.

**Why the correction matters, not just the wording:** an annual rate *hides*
`visitsPerYear` inside one number — which is precisely the defect C9 was written
to fix ("There is no visits-per-year term at all", on `App.jsx:1853`). Under an
annual rate, two visits a year and four visits a year are indistinguishable to
the cost engine, and a change in service policy silently fails to move cost.

**Implemented:**

- `costPerVisit`, `visitsPerYear`, `serviceYears`, `sizeLimitKw` — three
  separately configurable values plus the retained ≤10 kW limit, all owned by
  Project Head.
- Any missing value → `SERVICE_CONFIG_INCOMPLETE`, naming the missing fields, and
  the project total stays blocked. Never ₹0.
- **No annual-rate path exists in the engine.** A test asserts the identifier
  `annualCost` does not appear in `costEngine.js`, so an annual-shaped config
  cannot compute by accident.
- The legacy ₹2,000 is **not promoted** to `costPerVisit` or to an annual cost.
  C9 records that it may be read per visit or per year, and the two differ by a
  factor of `visitsPerYear`. Recorded `UNCONFIRMED_AND_NOT_PROMOTED`.
- `visitsPerYear` exists nowhere in the source and is never invented.
- Internal service cost stays separate from any customer-facing AMC price
  (`customerFacingAmcPrice: null`); a customer AMC is a `CUSTOMER_EXTRA` and does
  not move the base margin.

**Open item P2-N restated:** what is ₹2,000 — per visit or per year — and how
many visits per year are actually performed?

**Regression:** 209/209 tests pass, build byte-identical, `App.jsx` unchanged,
baseline `b215b2fd…` unchanged, 0/54 cells changed.

---

# PHASE 2A — RATE CARD + AUDIT TRAIL (2026-08-16)

Full register with owner, reason, modules and version:
`docs/phase2/PHASE2A_DECISIONS.md`. History above is unchanged.

## C88 — SITE SURVEY BEYOND 100 KM  [APPROVED · CONFIGURED]

**Date:** 2026-08-16 · **Owner:** Project Head · **Closes:** P2-K
**Modules:** `costEngine.js`, `projectRateCard.js`, `cost-config.json` · **Version:** survey@2026-08-16.1

```
<= 100 km : 500
 > 100 km : 500 + (distanceKm - 100) x 3
130 km    : 500 + (30 x 3) = 590
```

The ₹500 is **ALL-INCLUSIVE** — engineer cost, engineer travel, the site visit
and the report. No second engineer travel is ever added, and project
transportation remains a separate head. The 100 km threshold is an approved
business rule and is never silently changed. The ₹3/km excess rate is Project
Head configuration on the rate card; without it the head blocks with
`SITE_SURVEY_EXCESS_RATE_NOT_CONFIGURED` rather than applying the flat charge alone.

## C89 — SERVICE VALUES SUPPLIED  [APPROVED · CONFIGURED]

**Owner:** Project Head · **Closes:** P2-N · **Version:** service@2026-08-16.1

```
costPerVisit 1000 x visitsPerYear 2 x serviceYears 5 = 10000    (<= 10 kW)
```

This resolves the ambiguity C9 flagged: **₹2,000 was the ANNUAL figure**, and the
per-visit rate is ₹1,000 across two visits. ₹2,000/year is retained as
`annualEquivalentMetadata` marked `EXPLANATORY_METADATA_ONLY` — explanation, never
a calculation input. **Breakdown handling is INCLUDED**; no separate breakdown
cost head exists, asserted by test. Above 10 kW → `SERVICE_OUT_OF_COVERAGE`,
never extrapolated.

## C90 — NET METER IS NOT A FLARIZE ITEM  [APPROVED · SUPERSEDES C86]

**Owner:** Admin · **Modules:** `pricingEngine.js`, `cost-config.json`

The customer buys the net meter directly, as KSEB requires. It is therefore
excluded from the Flarize BOM, material cost, landed cost, total actual project
cost, Flarize margin and the solar system selling price.

`NET_METERING` was **removed from `EXTRA_TYPE`** so it cannot be sold as a Flarize
extra; offering it returns `EXTRA_TYPE_FORBIDDEN`. Where it must appear on a
document it goes through `customerSideExpenses` with `paidBy: 'CUSTOMER'`,
`flarizeMarkup: 0`, `includedInFlarizePrice: false` — displayed, never totalled
into anything Flarize charges. A test asserts adding one moves neither the
selling price, the gross profit, the actual margin, the GST nor the customer
total.

This **supersedes C86**, which treated net metering as a Flarize CUSTOMER_EXTRA.
The deferred net-meter price master (P2-I) is now moot: Flarize does not sell it.

## C91 — PROJECT HEAD RATE CARD  [APPROVED · IMPLEMENTED]

**Owner:** Project Head · **Module:** `src/lib/projectRateCard.js`

One versioned, audited home for installation, transport-vehicle, site-survey,
engineering/design, service and special-work rates. Each record carries
`rateId · rateType · configuration · rate · unit · range · effectiveFrom ·
effectiveTo · version · status · changedBy · changedAt · changeReason ·
previousVersionId`.

**No commercial rate lives in the Cost Engine.** A test strips comments from
`costEngine.js` and asserts the literals `15000`, `500`, `1000` and `3000` appear
nowhere in it. The engine calls `resolveRate` and gets a rate **with its version**
or an explicit `RATE_NOT_CONFIGURED` — never a nearest, first-available or
default rate. Seeding the card from config still writes full audit entries;
there is no un-audited way in.

## C92 — COMMERCIAL CONFIGURATION HISTORY IS APPEND-ONLY  [APPROVED · IMPLEMENTED]

**Module:** `src/lib/commercialHistory.js`

Ten audited configuration types, each with exactly one owner; **Sales owns none**.
Every version records `versionId · changedBy · changedAt · changeReason ·
effectiveFrom · previousVersionId · status`. All five audit fields are
**mandatory** — omitting any throws `MISSING_AUDIT_FIELDS`, so a commercial change
cannot be anonymous, undated or unexplained.

```
ACTIVE -> SUPERSEDED -> (ARCHIVED)
```

There is no update path and no delete path: a test asserts `updateVersion`,
`deleteVersion` and `splice(` are absent from the module. Archiving preserves the
value. Exactly one ACTIVE version per record; `getVersionEffectiveAt` selects
exactly one applicable version per date.

API for a future UI: `getHistory`, `getCurrentVersion`, `getVersion`,
`getVersionEffectiveAt`, `compareVersions`, `historyView`. **No UI was built.**

## C93 — ELEVEN PINNED VERSIONS  [APPROVED · IMPLEMENTED]

`bomSnapshotId · catalogVersion · procurementPriceVersion · **landedCostVersion** ·
**projectRateCardVersion** · costConfigVersion · marginVersion · gstVersion ·
costEngineVersion · pricingEngineVersion · moneyRuleVersion`.

A locked quotation keeps every one. Procurement or Project Head changing a landed
cost or a rate afterwards moves NEW quotations only.

## C94 — PHASE 2A REMAINS BLOCKED ON FOUR DECISIONS  [BLOCKED]

P2-J landed costs · P2-M vehicle types and rates · P2-F tier margins ·
P2-L engineering rate above 20 kW.

Closed this round: **P2-K** (survey excess), **P2-N** (service values),
**P2-I** (net meter — superseded, not a Flarize item).
Still open for confirmation: **P2-H** (installation unit is PER_PROJECT by code
evidence, not yet confirmed by the business).

Every blocked rule has its mechanism implemented and tested, returns a named
status and blocks the total. **No rule was invented to make the phase look complete.**

---

# PHASE 2A — REMAINING BLOCKERS CLOSED (2026-08-16)

Append-only. Full register: `docs/phase2/PHASE2A_DECISIONS.md`.

**Read the distinction carefully throughout this section:**
**DECISION CLOSED** = the rule is agreed and implemented.
**VALUE NOT YET CONFIGURED** = no number has been supplied. The engine returns a
named status and blocks. **An absent commercial value is never an invented zero.**

## C95 — P2-J CLOSED · LANDED COST + PROCUREMENT DELIVERY ALLOCATION

**Owner:** Procurement · **Module:** `src/lib/procurementBatch.js` · **Version:** procurement@2026-08-16.1

```
landedUnitCost = purchaseUnitPrice
               + allocatedProcurementDelivery / quantity
               + otherProcurementCharges / quantity
```

A batch delivery charge is allocated by **PURCHASE-VALUE PROPORTION**:

```
A 70,000 (70%) -> 3,500      B 20,000 (20%) -> 1,000      C 10,000 (10%) -> 500
total 100,000                                    delivery 5,000
```

**Not by weight, volume, quantity or equal split** — all four are in
`FORBIDDEN_ALLOCATION_METHODS` and rejected, as is any unrecognised method.

**Scope is supplier → warehouse only.** Passing a `projectTransportCost` returns
`PROJECT_TRANSPORT_NOT_ALLOWED`, and the module contains no reference to
`ratePerKm`, `vehicleType` or `distanceKm` (asserted by test). Project
transportation stays a separate cost head.

Allocations are reconciled by largest remainder so they sum **exactly** to the
delivery charge — a ₹5,000 charge never allocates to ₹4,999. Every allocation
records batch id, delivery cost, method, scope, each source material with its
purchase value, share and allocated amount, plus who recorded it and when.

**VALUE NOT YET CONFIGURED:** no batch has been entered, so material cost blocks
with `LANDED_COST_NOT_CONFIGURED`.

## C96 — P2-M CLOSED STRUCTURALLY · PROJECT TRANSPORTATION

**Owner:** Project Head

Warehouse → site, **ONE WAY**, `distanceKm × vehicle.ratePerKm`. Vehicle records
live on the versioned rate card with `vehicleId · vehicleName · ratePerKm ·
unit=PER_KM · effectiveFrom/To · version · status · changedBy · changedAt ·
changeReason · previousVersionId`. Rate changes append; old quotations keep the
old version.

Legacy ₹35/km, ₹40/km and the 100 km free allowance are recorded as rejected and
are unreachable — a test asserts the literals `35` and `40` and the identifiers
`freeDistanceKm`, `baseDistanceKm`, `chargeableKm` are absent from the engine.

**VALUE NOT YET CONFIGURED:** `vehicles: []`. Pickup / Lorry / Small Vehicle
appear only as documentation EXAMPLES and were deliberately **not** seeded as
active configuration. The head blocks with `TRANSPORT_RATE_NOT_CONFIGURED`.

## C97 — P2-F CLOSED STRUCTURALLY · MARGIN

**Owner:** Admin

Per-tier `targetMarginPct` / `minimumMarginPct` for BASE, VALUE, PREMIUM,
versioned, constrained `0 ≤ minimum ≤ target < 100`. Gross margin only —
`cost ÷ (1 − target)`, never `cost × (1 + margin)`.

The gate runs on the margin **after** discount:

```
actual <  minimum            -> MARGIN_BELOW_MINIMUM, hard block, no price issued
minimum <= actual < target   -> SALES_HEAD_APPROVAL_REQUIRED
actual >= target             -> no approval required
```

**VALUE NOT YET CONFIGURED:** every tier is `null`, so pricing blocks with
`MARGIN_CONFIG_INVALID`. A test asserts the blocked result is not the
cost-priced figure a 0% default would have produced.

## C98 — P2-L CLOSED STRUCTURALLY · ENGINEERING/DESIGN ABOVE 20 KW

**Owner:** Project Head

≤20 kW = ₹500 per project, ALL-INCLUSIVE. Above 20 kW the rate-card band
`>20kW` decides, using **the unit on that record** — PER_KW is honoured only
because a band explicitly declares it. ₹500 is never extrapolated.

**VALUE NOT YET CONFIGURED:** no `>20kW` rate supplied, so projects above 20 kW
block with `ENGINEERING_DESIGN_NOT_CONFIGURED`. Band rates are versioned and
historied like every other rate.

## C99 — REGRESSION

```
tests    250/250 pass (was 226)
build    index-vy7RQ7xF.js  byte-identical
App.jsx  97dfe333...  unchanged
catalog  8147aca9...  unchanged
baseline b215b2fd... -> b215b2fd...   0/54 cells changed
```

---

# PHASE 2 CLOSURE AUDIT (2026-08-16)

Append-only. Full audit: `docs/phase2/PHASE2_CLOSURE_AUDIT.md`.

## C100 — PHASE 2 IS BLOCKED

**Status:** ⛔ BLOCKED · **Date:** 2026-08-16 · **Owner:** Engineering

Phase 2 cannot be closed. Two decision-log items marked `Blocks: Phase 2` remain
unsatisfied, and both need data only Engineering can supply. Nothing was invented
to close them.

**C10 — 3→6 and 3→8 still have no explicit BOM.** The catalog defines only
`3_5`, `5_8`, `5_10`, `8_10` across all 34 upgrade fixed items. Both approved
paths are still extrapolated by the legacy heuristic (`App.jsx:2776-2803`).

**C11 — the 3 kW three-phase rule is still unconfirmed**, and the silent
`6 kW → 3 kW` rewrite in `switchSysType` is still live. The *principle* (never
coerce a selection silently) is decided; the *replacement behaviour* is not, and
it depends on the unconfirmed rule, so neither half was implemented.

**Verified resolved:** C4 (battery quantity authority), C5 (premium micro
architecture), C8 (net metering — superseded by C90), D11, D12.

**Verified still open but correctly handled:** bt1/bt3/bt4 PENDING with no
invented electrical values — four hybrid Value packages BLOCKED, which is the
intended safety behaviour. Package registry: 34 APPROVED / 288 PROPOSED, 0 of 48
packages fully approved. **No component was auto-approved during this audit.**

**Phase 2A commercial engine: intact and unmodified**, re-verified by test.

Eleven regression guards added (`tests/phase2-closure.test.mjs`) that fail the
day a blocked item gains data — the signal to re-audit rather than to assume.

```
tests 261/261 · build byte-identical · App.jsx unchanged · catalog unchanged
baseline b215b2fd... -> b215b2fd...   0/54 cells changed
```

---

## PHASE 3 — APPLICATION LAYER (PROJECT HEAD WORKSPACE)  [2026-08-16]

**PART A — Phase 2 blockers re-verified against the repository, not assumed.**
Nothing new has been supplied since the closure audit:

| Blocker | State on disk | Verified by |
|---|---|---|
| C10 — 3→6 / 3→8 BOM | `catalog.bomTemplates.upgrade.fixedItems` still defines only `3_5`, `5_8`, `5_10`, `8_10` | `tests/phase2-closure.test.mjs` |
| C11 — 3 kW three-phase / 6 kW→hybrid | `ongrid.threePhase = ['5tp','6','8','10']`; `switchSysType` still contains `if (size === '6') setSize('3')` | same |
| Battery data | `bt1.protectionRating`, `bt3/bt4.integratedProtection`, `bt*.compatibleInverters` all still `null` | same |
| Package authority | registry still 48 packages / 34 APPROVED / 288 PROPOSED / 0 fully approved | same |

No value was guessed, extrapolated or defaulted. A written decision request was
issued instead (`docs/phase3/DECISION_REQUEST_PHASE2_BLOCKERS.md`).

**PART B — ENGINES FROZEN.** No engine was modified in Phase 3. `projectBom.js`,
`engineeringChecker.js`, `bomLock.js`, `costEngine.js`, `pricingEngine.js`,
`commercialHistory.js` and `projectRateCard.js` are byte-identical. No new engine
abstraction was introduced.

**PART C/D/E/G — application layer added, purely additive:**
`src/lib/rbac.js`, `src/lib/projectWorkspace.js`, `server-workspace.js`,
`public/workspace.html`, `tests/phase3-workspace.test.mjs`. `src/App.jsx` is
untouched and the Vite bundle is byte-identical (`index-vy7RQ7xF.js`, 382.17 kB).

**P3-A — the application layer holds no rule.** Enforced by test: no clock, no
commercial literal, no margin/GST arithmetic, no `?? 0` / `|| 0` coercion, no
nearest-match fallback, no locally-assigned VALID/WARNING/BLOCKED status, no
second history mechanism.

**P3-B — an absent commercial value renders as NOT CONFIGURED, never ₹0.**
`headView()` carries `amount: null`, `configured: false`, `blocked: true`; the UI
prints `NOT CONFIGURED`. With no procurement landed cost configured, the cost
panel is INCOMPLETE and pricing refuses to price rather than show a zero total.

**P3-C — a pending component is offered, never hidden.** `availableComponents()`
filters on lifecycle and `isPermanentlyUnselectable` only. Hiding a
PENDING_ENGINEERING_APPROVAL component would be a silent substitution, which the
Project BOM authority forbids; the Engineering Checker reports it instead.

**P3-D — OPEN. Per-user identity is not decided.** The deployment has one
credential and no user store, so the acting role is asserted by the authenticated
operator rather than proven by an identity. RBAC is genuinely enforced at the
service boundary (`assertCan` / `assertCanEditBomRole` / `assertOwnsCostHead` /
`assertOwnsConfig`), and the limitation is reported by
`GET /api/workspace/session` as `identityModel: OPERATOR_ASSERTED_ROLE`. This is
recorded as a pending decision, not an accepted hole.

```
tests 290/290 · build byte-identical · App.jsx 97dfe333b4f81bae · catalog 8147aca94e79e4f6
baseline b215b2fd... -> b215b2fd...   0/54 cells changed
```
