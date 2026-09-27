# ENGINEERING DECISIONS REQUIRED

**Status:** 🟡 **First round CLOSED. Second round OPEN.** · **Updated:** 2026-08-15 (Phase 1C)

## Round 1 — CLOSED, implemented

| ID | Decision | Outcome |
|---|---|---|
| D11-A | `is1` Honey Well 2P 40A for 1P Base/Value/Premium | ✅ APPROVED, tier eligibility extended, no new component created |
| D11-B | `is2` L&T 40A 4P for 3P Base/Value/Premium | ✅ APPROVED, tier eligibility extended |
| D11-C | Separate DC isolator? | ✅ APPROVED — **V1 does NOT model DC_ISOLATOR.** Excluded from the role taxonomy |
| D11-D | "New Isolator" is a test record | ✅ APPROVED — marked TEST, excluded from resolution, **record retained** |
| D12-A/B/C | Premium battery protection | ✅ APPROVED — Enphase is INTEGRATED; `mb1` and the generic DC cable are PROHIBITED on premium |
| C32 | Role taxonomy | ✅ APPROVED — 20 roles implemented, `DC_ISOLATOR` excluded |

**Result: BLOCKED packages 16 → 0.**

---

## Round 2 — OPEN

These are the decisions that remain. Everything below blocks either full package authority or automated electrical validation.

| ID | Decision | Owner | Blocks |
|---|---|---|---|
| D12-D | Protection mode for `bt1`, `bt3`, `bt4` (Deye/SEG) | Electrical | `ENG-BAT-007` warning on every hybrid value package |
| D12-E | Is `mb1` correctly rated for `bt1`? | Electrical | confirmation that current value BOMs are correct |
| D12-F | Enphase configuration: Envoy / IQ Relay / CT | Electrical | `ENG-ENP-003` warning on every premium hybrid |
| D12-G | Enphase communication cable — catalog identity | Procurement | `ENG-ENP-004`; item known commercially (10 m, ₹6,000 + GST) but absent from the catalog |
| D12-H | `en7` ₹110,000 vs `en_sysctrl` ₹25,000 | Procurement | which System Controller record is correct — 4.4× price difference |
| ENP-1 | Enphase electrical limits | Electrical | panel/IQ8P compatibility, branch limits, Q Cable and Q Terminator rules — **none implemented, no values exist** |
| S1 | Catalog schema — electrical rating fields | Engineering | any automated rating validation |
| S2 | Battery `kwh`, voltage, discharge current | Engineering | protection sizing; "Battery Capacity" still prints `—` on every quotation |
| PKG-1 | Approve the remaining 288 PROPOSED components | Engineering | fallback count 319 → 0 |

---

## D12-D — Protection mode for Deye/SEG batteries

`bt1`, `bt3`, `bt4` are all `batteryProtectionMode: UNKNOWN`. Decision D12 states some batteries may have integrated protection and forbids blindly adding `mb1` to every Deye battery.

**Existing behaviour was preserved** — hybrid value still emits `mb1` ₹8,500 — and `ENG-BAT-007` warns that the mode is unconfirmed. Nothing was silently changed in either direction.

**Question:** for each of `bt1`, `bt3`, `bt4` — is battery-side protection INTEGRATED, EXTERNAL_REQUIRED, or EXTERNAL_OPTIONAL?

**Answer:** `bt1` ☐ INTEGRATED ☐ EXTERNAL_REQUIRED ☐ EXTERNAL_OPTIONAL · `bt3` ☐ ☐ ☐ · `bt4` ☐ ☐ ☐

---

## D12-E — Is `mb1` correctly rated for `bt1`?

"160A" appears only inside a display name. `bt1` has no nominal voltage and no max discharge current recorded.

**Answer:** ☐ Correct as supplied ☐ Wrong rating — correct device: `____________________`

---

## D12-F — Enphase supplied configuration

Current BOM: Envoy ×1 (`en3`), IQ Relay ×1 (`en4`), CT ×4 (`en6`), System Controller ×1 (`en7`).

All three are marked `PENDING_CONFIGURATION_CONFIRMATION`, **retained**, and raise `ENG-ENP-003` (WARNING). A premium hybrid therefore never reports fully VALID while this is open.

**Answer:** Envoy ☐ required ☐ integrated into SysCtrl · IQ Relay ☐ required ☐ integrated · CT ☐ qty ____ ☐ not required

---

## D12-G — Enphase communication cable

Supplied commercial BOM: **10 m, ₹6,000 + GST**. **Not added** — no catalog identity, manufacturer and model unconfirmed. Role `ENPHASE_COMMUNICATION` exists and is empty.

**Answer:** manufacturer `__________` model `__________` part no `__________`

---

## D12-H — Duplicate System Controller records

| componentId | Name | Price |
|---|---|---|
| `en7` | Enphase System Controller | **₹110,000** |
| `en_sysctrl` | Enphase System Controller with Cable | **₹25,000** |

Name matching currently selects `en7`. Both map to `ENERGY_SYSTEM_CONTROLLER`.

**Answer:** ☐ `en7` correct ☐ `en_sysctrl` correct ☐ different products — clarify: `____________________`

---

## ENP-1 — Enphase electrical limits (not implemented)

D12 asks the validator to check panel/IQ8P compatibility, IQ8P electrical limits, branch/circuit limits, IQ Cable configuration, Q Cable and Q Terminator requirements.

**None were implemented.** The catalog holds no Enphase limits — no max module power per IQ8P, no branch current limit, no max microinverters per branch, no cable length rule. Implementing them would mean inventing values.

**Required:** the Enphase engineering documentation or approved source configuration, with concrete numbers.

**Answer:** source document / reference: `____________________`

---

## Round 1 detail — retained for history

## D11 — ISOLATOR COVERAGE

### Current catalog — complete

| componentId | Name | Brand | Tiers | Phase | Price | Status |
|---|---|---|---|---|---|---|
| `is1` | Honey Well Isolator 2P 40A | Honey Well | base | 1P | ₹212 | ACTIVE |
| `is2` | L&T Isolator 40A 4P | L&T | value, premium | 3P | ₹623 | ACTIVE |
| `is_9b53be37fab1` | New Isolator | *(none)* | value | *(none)* | ₹0 | TEST |

### Coverage gaps

| Phase | Tier | Legitimate component | Currently ships |
|---|---|---|---|
| 1P | base | `is1` | ✅ correct |
| **1P** | **value** | **NONE** | ⚠️ `is_9b53be37fab1` placeholder at **₹0** |
| **1P** | **premium** | **NONE** | 🔴 `N/A ₹0` line — no isolator at all |
| **3P** | **base** | **NONE** | 🔴 `N/A ₹0` line — no isolator at all |
| 3P | value | `is2` | ✅ correct |
| 3P | premium | `is2` | ✅ correct |

---

### D11-A — Is `is1` Honey Well 2P 40A acceptable for 1P Value and 1P Premium?

**Context:** `is1` is the only legitimate 1P isolator in the catalog. It is currently restricted to `base`. If it is electrically suitable across tiers, this is a **tier-eligibility change** — no new component needed.

**If YES:** add `value` and `premium` to `is1.tiers`. Unblocks `ONGRID-3-1P-VALUE`, `ONGRID-5sp-1P-VALUE`, `ONGRID-3-1P-PREMIUM`, `ONGRID-5sp-1P-PREMIUM`, `HYBRID-3-1P-VALUE`, `HYBRID-5-1P-VALUE`, and contributes to the two 1P premium hybrids.

**If NO:** name the approved 1P value/premium isolator with brand, model, poles, current rating, voltage rating, AC/DC, purchase price.

**Consider before answering:** is a ₹212 device appropriate on a premium system where the ACDB alone is ₹6,080? A tier difference may be commercially intended even where it is electrically unnecessary.

**Answer:** ☐ YES, extend tiers ☐ NO, the approved component is: `____________________`

---

### D11-B — Is `is2` L&T 40A 4P acceptable for 3P Base?

**Context:** `is2` is the only legitimate 3P isolator. It is restricted to `value, premium`. **3P Base has no isolator at all** — `ONGRID-{5tp,6,8,10}-3P-BASE` and `HYBRID-{8,10}-3P-BASE` all emit `N/A ₹0`.

This is the more serious half of D11: those six packages are shipping **with no isolation device listed**, not merely a wrong one.

**If YES:** add `base` to `is2.tiers`.
**If NO:** name the approved 3P base isolator with full specification.

**Answer:** ☐ YES, extend tiers ☐ NO, the approved component is: `____________________`

---

### D11-C — Are AC and DC isolators separate requirements?

**Context:** the catalog has **one untyped `isolator` category** and the BOM has one untyped isolator slot (`bomTemplates[*].slots[9]`, quantity 1 per system). No item carries an AC/DC field.

The requested role taxonomy separates `AC_ISOLATOR` and `DC_ISOLATOR`. **The system cannot currently express that distinction.**

Both existing products read as AC devices by their descriptions (2P 40A, 4P 40A). If a **DC isolator is also required** on the array side, it is currently **absent from every BOM in the system** — which would be a safety-compliance gap far larger than D11 as originally scoped.

**Questions:**
1. Does a Flarize installation require a separate DC isolator on the PV array side?
2. If yes, is it supplied inside the DCDB (`d1`–`d10` descriptions mention MCB + SPD) or as a discrete component?
3. If discrete — it is missing from every BOM. Confirm and specify.

**Answer:** ☐ AC only, one role is sufficient ☐ DC isolation is inside the DCDB ☐ Separate DC isolator required — specification: `____________________`

---

### D11-D — Is "New Isolator" a test record that may be retired?

**Context:** `is_9b53be37fab1`, no brand, no model, no phase, **₹0**, tier `value`. Classified `TEST` by heuristic, not by an explicit flag. It is **currently being sold** inside 1P value quotations at zero price.

**Not deleted, not hidden, not force-filtered** — pending your confirmation.

**If it is a test record:** it is retired once D11-A supplies a real 1P value isolator. Retiring it before that leaves those packages with no isolator.
**If it represents a real product:** supply brand, model, ratings and price.

**Answer:** ☐ Test record — retire after D11-A ☐ Real product — specification: `____________________`

---

## D12 — PREMIUM HYBRID BATTERY PROTECTION

### Current catalog — complete

`mccb_box` contains exactly one component:

| componentId | Name | Brand | Tiers | Price |
|---|---|---|---|---|
| `mb1` | Battery MCCB Box 160A | Generic | base, value | ₹8,500 |

### The two topologies are not the same

| | Base / Value | **Premium** |
|---|---|---|
| Battery | `bt1` SEG.5 PRO 100AH **LV** ₹86,717 | `bt2` **Enphase Flex** ₹95,000 |
| Inverter | Deye Hybrid (central, DC-coupled) | **Enphase micro-inverter** |
| Also in BOM | — | Envoy S Metered, Q Relay, System Controller |
| Protection today | `mb1` 160 A DC MCCB | **no candidate → `N/A ₹0`** |

Enphase architecture is normally **AC-coupled**, with disconnection and protection provided through the System Controller rather than a 160 A DC battery MCCB.

---

### D12-A — What protection device does the Premium Hybrid battery architecture require?

**This is the root question. D12-B and D12-C both depend on it.**

**Questions:**
1. Is the Enphase Flex Battery **AC-coupled or DC-coupled** in the Flarize premium design?
2. If AC-coupled — is a battery MCCB required at all, or does the Enphase System Controller provide the required disconnection and protection?
3. If a device is required, at what rating, and on which side (battery DC / AC output)?

**Answer:** ☐ AC-coupled, System Controller suffices ☐ AC-coupled, additional device required: `______` ☐ DC-coupled, MCCB required at `______` A

---

### D12-B — Is `mb1` applicable to Premium Hybrid? *(do not assume)*

`mb1` was **not** given premium eligibility. Suitability could not be established from the source, and widening the tier list would have turned validation green while adding a possibly meaningless ₹8,500 line.

**The catalog cannot answer this:**

| Needed to size protection | Present? |
|---|---|
| Battery nominal voltage | ❌ absent |
| Battery `kwh` | ❌ **null on all five batteries** |
| Max discharge current | ❌ absent |
| AC/DC coupling flag | ❌ absent |
| MCCB rating vs battery current | ❌ "160A" exists only inside a display name |

**Answer:** ☐ YES, `mb1` is suitable — extend tiers ☐ NO — see D12-C

---

### D12-C — If Premium Hybrid does not require `mb1`, what replaces it?

Three possible outcomes, each with a different implementation:

| Outcome | Implementation |
|---|---|
| **(a)** No battery protection component required — the System Controller covers it | **Rule `ENG-BAT-003` needs a topology condition.** The catalog needs nothing. |
| **(b)** A different protection device is required | Add the component with full specification; assign role `BATTERY_PROTECTION`. |
| **(c)** The System Controller *is* the protection device | Map it to role `BATTERY_PROTECTION` for premium. **Note: two System Controller records exist — `en7` ₹110,000 and `en_sysctrl` ₹25,000 — and the current name-matching picks `en7`. That duplicate must be resolved first.** |

### ⚠️ My own rule may be the defect, not the catalog

`ENG-BAT-003` states *"battery present without required MCCB → BLOCKED"*, unconditionally. It was extracted from `bomTemplates.hybrid.slots[4]`, where `mccb_box` tracks battery quantity 1:1 — **but that template only ever described the DC-coupled base/value topology.**

If the answer to D12-A is "AC-coupled, no MCCB required", then **the rule is wrong for premium and must gain a topology condition.** Flagging this rather than quietly widening `mb1` to make the screen green.

**Also outstanding for premium:** no **battery cable** line is emitted either. Same root question — an AC-coupled battery would not use a 25 mm DC battery cable.

**Answer:** ☐ (a) no device — amend the rule ☐ (b) component: `____________________` ☐ (c) System Controller, and resolve `en7`/`en_sysctrl` first

---

## C32 — CANONICAL BOM ROLE TAXONOMY

**Proposed roles for approval:**

```
PANEL              INVERTER           MICRO_INVERTER
BATTERY            BATTERY_PROTECTION BATTERY_CABLE
AC_ISOLATOR        DC_ISOLATOR        ACDB
DCDB               STRUCTURE          CHANGEOVER
MONITORING         PROTECTION         EARTHING
DC_CABLE           AC_CABLE           METER
OTHER
```

### Which roles the engine can express today

| Role | Engine slot? | Source today |
|---|---|---|
| PANEL, INVERTER, ACDB, DCDB, METER, DC_CABLE, AC_CABLE, BATTERY | ✅ | typed slots |
| BATTERY_PROTECTION | ✅ | `mccb_box` slot |
| EARTHING | ⚠️ split | `earth_cable` + `cb_rod` — two slots, one role |
| PROTECTION | ⚠️ partial | `la_cable` only (LA down conductor) |
| AC_ISOLATOR | ⚠️ untyped | one `isolator` slot, no AC/DC field |
| **DC_ISOLATOR** | ❌ | no category exists |
| **MICRO_INVERTER** | ❌ | `enphase` accessories, matched **by display name** |
| **BATTERY_CABLE** | ❌ | uncategorised `fixedItems` — *catalog category `battery_cable` exists but the BOM line carries no category* |
| **CHANGEOVER** | ❌ | uncategorised `fixedItems` — *catalog category `change_over` exists, same problem* |
| **STRUCTURE** | ❌ | generated from `structureTemplates`, not selected |
| **MONITORING** | ❌ | Envoy / DTU inside the micro branch, no category |

**Note:** `battery_cable` and `change_over` already exist as **catalog categories**. The gap is that the BOM emits those lines as uncategorised `fixedItems`, so nothing downstream can identify them by role. Roughly **36–39 fixed items per system carry no `category` field at all.**

### Decisions required

1. **Approve or amend the 19-role list.** Specifically: should `EARTHING` cover both the rod and the cable, or split? Should `PROTECTION` mean SPD/LA generally, or only lightning protection?
2. **Confirm `DC_ISOLATOR`** is a real role — depends on D11-C.
3. **Accept that assigning roles to `fixedItems` will change BOM line metadata.** It will be executed against an explicit baseline diff, with every changed cell classified INTENTIONAL or REGRESSION.

**Answer:** ☐ Approve as proposed ☐ Approve with amendments: `____________________`

---

## S1 — CATALOG SCHEMA: ELECTRICAL RATING FIELDS *(prerequisite)*

The required component specification **cannot be stored today**. Missing from every catalog item:

`poles` · `currentRating` · `voltageRating` · `currentType (AC/DC)` · `purchasePrice` vs `sellingPrice` (one `price` field serves both)

Even `is1` and `is2` fail the stated field requirement — their ratings exist only inside display names (`"Honey Well Isolator 2P 40A"`).

**Until this is added, no isolator can be created that meets the specification you set, and no automated validation of ratings is possible.**

**Answer:** ☐ Approve schema extension ☐ Amend field list: `____________________`

---

## S2 — BATTERY ELECTRICAL DATA *(prerequisite for D12)*

All five battery records have **`kwh: null`**. No nominal voltage, no max discharge current, no coupling flag.

Consequences: the customer specification row "Battery Capacity" renders `—` on every quotation; protection sizing cannot be validated automatically; D12 cannot be answered from data.

| componentId | Name | kwh | Price | Tiers |
|---|---|---|---|---|
| `bt1` | SEG.5 PRO 100AH LV Battery | **null** | ₹86,717 | base, value |
| `bt2` | Enphase Flex Battery | **null** | ₹95,000 | premium |
| `bt3` | Okaya 100AH | **null** | ₹78,000 | base |
| `bt4` | Livguard 100AH | **null** | ₹75,000 | base |
| `ba_3b51aef23f0b` | New Battery | **null** | ₹0 | value *(TEST)* |

**Answer:** ☐ Data to be supplied by: `____________________` by `__________`

---

## Related catalog duplicates — not decisions, but they affect the above

| Records | Issue | Relevant to |
|---|---|---|
| `en7` ₹110,000 / `en_sysctrl` ₹25,000 | Two "Enphase System Controller" rows, **4.4× price difference**. Name matching currently selects `en7`. | D12-C |
| `en_flexbat` ₹135,000 / `bt2` ₹95,000 | Same physical battery, two identities. Canonical `bt2` is now used; alias retained for traceability. | D12 |
| `pa_0006870e2e7d` "hari 550", `pa_9e35d4adf2a3` "adani 600" | `PENDING_REVIEW` — real products with unqualified names, or test rows? | catalog hygiene |

---

## What happens once these are answered

1. D11-A/B → 12 packages unblock.
2. D11-D → the placeholder retires.
3. D12-A/B/C → 4 premium hybrid packages unblock, and `ENG-BAT-003` is corrected if needed.
4. **BLOCKED count: 16 → 0.**
5. C32 + S1 → role taxonomy assignable; package authority becomes wireable.
6. Engineering reviews `data/packages.proposed.json` and approves componentIds → 323 fallbacks convert to explicit → WARNING → VALID.
7. Registry wired, fallback disabled for pinned roles, baseline re-captured, every diff classified.

**Steps 6–7 will move baseline v2 and must be reviewed cell by cell.**
