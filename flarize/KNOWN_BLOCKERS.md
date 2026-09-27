# FLARIZE — KNOWN BLOCKERS (UAT HANDOFF)

**Date:** 2026-09-05
**Status:** UAT-ready with restricted scope. **NOT production-ready.**

This file names, without inventing values, what still requires an explicit business or engineering decision before the platform can issue quotations across the full configuration matrix.

---

## 1. Battery protection — Engineering Head decisions required (D12-E)

Every battery below is currently BLOCKED for quotation issuance until Engineering Head records the missing values in `data/battery-master.json` (and where indicated, in `data/catalog.json`). **No value has been invented.** No fallback protection component has been assigned.

### `bt1` — SEG.5 PRO 100AH LV Battery — BLOCKED
- `externalProtectionRequired: true` (Engineering standing decision)
- `protectionType`: **NULL — Engineering must record**
- `protectionRating` (Amps, integer): **NULL — Engineering must record. Cannot be derived from Ah.**
- `maximumDischargeCurrent`: **NULL — Engineering must record before rating can be defended**
- Approved BATTERY_PROTECTION component: **NOT SELECTED.** Existing catalog `mccb_box/mb1 "Battery MCCB Box 160A"` is available but Engineering's own note in the record says *"mb1 160A is not selected, no other MCCB is selected, and no rating is derived from Ah."* Engineering Head must either approve `mb1` for `bt1` (and record its rating) or add a new supplier-verified device to the catalog.
- Hybrid BOM template `catalog.bomTemplates.hybrid.slots[pos=4] (mccb_box)`: `qty: null`, `default: null`. Engineering must publish per-(batteryQuantity, size) quantity map before hybrid BOM can resolve battery protection.

### `bt3` — Okaya 100AH — BLOCKED
- Every protection field NULL: `integratedProtection`, `externalProtectionRequired`, `protectionType`, `protectionRating`.
- Also missing: `nominalVoltage`, `maximumDischargeCurrent`, `compatibleInverters`.
- Engineering Head must decide protection topology first (integrated vs. external), then supply the fields that follow from that decision.

### `bt4` — Livguard 100AH — BLOCKED
- Same posture as `bt3`. Every protection field NULL.

### `ba_3b51aef23f0b` — "New Battery" — BLOCKED (LIFECYCLE INCONSISTENCY)
- `engineeringStatus: REJECTED` in `data/battery-master.json`
- `approvalStatus: APPROVED` in `data/catalog.json`
- Engineering Head must reconcile: RETIRE the catalog record OR reopen intake and publish the full protection topology set. Nothing else may reach this record until the two states agree.

### `bt2` — Enphase Flex Battery — NOT BLOCKED (do not modify)
- Already engineering-approved. Integrated protection via Energy System Controller. No external device required. Untouched by this handoff.

## 2. Enphase Premium path — Engineering-blocked

- ongrid Premium (5sp) and hybrid Premium via HTTP orchestrate BLOCKED at engineering with multiple safety-critical blockers on Enphase micro-inverter / accessory configuration.
- Root cause is parallel to D12-E: the Enphase-side battery/accessory selection and protection posture requires Engineering Head decisions on Enphase components and quantities. No hardcoded fallback exists (correct — no fabrication).
- Engineering Head must review the Premium package engineering rules (`src/lib/engineeringChecker.js` PBC-M-* + PBC-H-* families) and publish the missing catalog/component data through the same channel as `bt1`.

## 3. Data-side production gates (business decisions, unchanged)

- **Validity default policy** — `data/quotation-policy.json` currently `validity.status: NOT_CONFIGURED`. Effective-period `policies: []` is empty. Project Head must publish at least one ACTIVE policy covering the target window before production issuance.
- **Branding** — `data/quotation-branding-state.json` currently empty (`bank/upi accounts: {}`, `signature/seal current: null`). Admin/Project Head must publish real (or explicitly `isDemo:true`) versions.
- **Production procurement batch** — 5 seed batches only (`BATCH-SEED-001..005`). Procurement Head must commit at least one non-seed COMMITTED batch. `assertProductionProcurementAvailable` refuses production issuance until then.
- **fi_* consumables treatment** — 47 consumable IDs with no procurement landed cost. Business must ratify Option A (line-item landed prices) or Option B (overhead absorption with rupee amount + scaling formula).

## 4. UAT-usable scope (with DEMO fixtures + `PRODUCTION_MODE=false`)

Confirmed passing via live HTTP in the last UAT run:
- ongrid Base 5sp — full snapshot populated ✅
- ongrid Base 5tp — full snapshot populated ✅
- ongrid Value 5sp — full snapshot populated ✅
- hybrid Base battery=2 (bt2 Enphase path) — full snapshot populated ✅
- Historical immutability under live mutation — verified ✅
- DEMO production guard in `PRODUCTION_MODE=true` — refuses with `DEMO_BRANDING_BLOCKED_IN_PRODUCTION` ✅
- Full regression: **2442 / 2394 pass / 14 pre-existing fail / 34 pre-existing cancelled** — 0 new failures.

Blocked at engineering step (as documented above):
- ongrid Premium — Enphase engineering gap
- hybrid Value / Premium (bt1/bt3/bt4) — D12-E
- Any config touching `ba_3b51aef23f0b` — lifecycle inconsistency

## 5. Non-blocker technical debt (do NOT expand scope)

- 4 `name.includes()` sites in `src/App.jsx` legacy client. Server BOM authoritative.
- Rev 2 renderer future landing — v1 artwork locked.
- Legacy quotations without `rendererPinning` remain non-replayable through pinned-render route (by design).
- Admin CRUD HTTP surfaces for validity policy + multi-account branding still missing (operational UX).

---

## Not production-ready

This build is UAT-ready **only** for the scope listed in §4. All items in §1, §2, and §3 must land — with values Engineering Head, Admin, Procurement Head and Business supply — before any customer-facing production quotation is issued.

---

## Addendum 2026-09-09 — Fast-quotation (kW packs) build

See `FAST_QUOTATION_BUILD_REPORT_2026-09-09.md` §6 for the full table. Owner actions, none of which the platform fills in on its own:

1. **Market rates per pack** — kW Packs → Market rates. Until set, `MARKET_RATE_NOT_SET` (owner PROJECT_HEAD) blocks Sales for that pack.
2. **On-grid Premium (Enphase)** — PBC-M-003 (D12) requires an IQ System Controller on every Enphase architecture; the owner's on-grid Premium template has none. Engineering decision needed (template line or D12 amendment).
3. **`bt1` external protection rating** — still NULL (D12-E). Enter via kW Packs → hybrid battery slot → "Battery engineering facts" (writes `data/battery-master.json`, audited), then Admin "Re-publish approved".
4. **Quotation validity** — Admin dashboard → Quotation Controls.
5. **Bank / UPI / seal / signature** — Admin → Company profile.
6. **Item warranty** — kW Packs → slot → alternatives → warranty field.
7. **Hybrid meter at 0 batteries** (owner v1 data lists 1) — kW Packs → hybrid slots.
8. **GI structure items** — catalog only has "GP"-named tubes; Value/Premium price at GI rates by rule.

## Addendum 2026-09-10 — Usability review + approved-template PDF rebuild

See `USABILITY_AND_TEMPLATE_REBUILD_REPORT_2026-09-10.md` §5 for the full table. Owner actions, in order:

1. **Market rates** for every pack (kW Packs → Market rates → Submit → Admin approve). Release data prices 3 packs only.
2. **On-grid Premium** template line (MICRO_INVERTER / IQ System Controller — PBC-M-003 / PBC-K-001) or amend D12.
3. **Battery `bt1`** protection rating (PBC-H-002) — kW Packs → hybrid → battery engineering facts.
4. **Company profile:** bank / UPI / QR / seal / signature; completed installations, years of experience, MNRE (quotation trust badges).
5. **Savings projection assumptions** in `data/savings-config.json` (`tariffEscalationLow/High`, `degradationRatePerYear`) — until set, no 25-year graph / lifetime savings on pages 8 & 12.
6. **Testimonials** (`data/quotation-testimonials.json`, real customers only) — page 6 omitted until entered.
7. **Item warranties** in Items & Prices; retire test items ("hari 550", "New Solar Panel" ₹0, "adani 600").
8. Confirm the **Terms & Conditions entity** (approved artwork says Golden Ray Renewable Energy).
9. **Server PDF:** `npm i -D playwright && npx playwright install chromium` on the host (or `PDF_CHROMIUM_PATH`); without it the browser print dialog is used.

## Addendum 2026-09-10 (round 2) — Simplification build

See `SIMPLIFICATION_ROUND2_REPORT_2026-09-10.md` §7. Owner actions, in order — the platform never fills these in:

1. **Market rates** — kW Packs banner shows how many packs are red *NOT SET*. Project Head: *Save & submit for approval* → Admin: *Approve & publish* (or Admin edits and clicks *Save & publish now*). A tier with no rate is left out of the quotation and the Sales screen says why.
2. **On-grid Premium (Enphase) — DECISION (Aromal / Engineering).** Pages 5 and 7 now always print the Elite column in its approved place; until this decision it reads *Not available*. Rule: rule PBC-M-003 (D12 "System Controller mandatory for backup") blocks every on-grid premium pack because the pack has no backup battery / controller. Either scope D12 to hybrid (engineering change) or add the Enphase System Controller (`en7` or `en_sysctrl`) to the on-grid premium pack.
3. **Battery `bt1` MCCB / protection rating** (PBC-H-002) — kW Packs → hybrid → Battery engineering facts → Save → Admin *Re-publish approved*.
4. **Company profile** — bank name / A/c / IFSC (bank block prints only when all three exist), UPI id + **UPI QR upload**, **seal + signature uploads**, trust-badge numbers.
5. **Quotation content** — the approved Onam Solar Fest 2026 offer page is pre-loaded (OFF): check the campaign period + slot count, switch ON. Real customer testimonials still to enter.
6. Unchanged: savings projection assumptions, item warranties, T&C entity, validity policy, Playwright Chromium on the host for server-side PDF.
