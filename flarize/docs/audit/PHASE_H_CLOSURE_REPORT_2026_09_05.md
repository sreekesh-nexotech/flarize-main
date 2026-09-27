# Phase H — Final Closure / Production-Readiness Audit
**Date:** 2026-09-05
**Model:** claude-opus-4-7
**Scope:** Final gate before declaring the Flarize quotation foundation production-ready. Halt-for-review handoff. No further implementation phase started.

---

## Production-readiness status: **CONDITIONAL PASS**

The **code side** is production-ready. Every locked invariant (2.1–2.10)
holds; the renderer pin-path is closed against Rev 2 substitution; RBAC
gates hold; historical quotation state is untouched; the E2E chain
proves reproducibility, mutation immunity and deterministic output.

The **data side** carries three EXPLICIT blockers a human still has to
resolve before the first production quotation is issued (§9). These are
not silent — the code refuses to invent values, and the tests below
document each blocker as a business decision.

Regression, Phase G baseline vs Phase H:
```
Phase G baseline : 2358 total / 2310 pass / 14 fail / 34 cancelled
Phase H now      : 2395 total / 2347 pass / 14 fail / 34 cancelled
```
Delta: **+37 tests, +37 pass, 0 new failures, 0 new cancellations.** The
14 pre-existing failures are the same set carried through every prior
phase (device-allocation legacy, package-approval legacy, phase-2/3
orchestrator). None are Phase-H-caused.

---

## 1. Files changed + SHA256

| Path                                              | SHA256                                                             | Change                                                                                                                                        |
|---------------------------------------------------|--------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `src/lib/approvedTemplate.js`                     | `cf6aa2b30485ee035ee2817348b4e44e817ff84ab76b3ca27050232d1d645c42` | H4 — `renderQuotationHtml(..., { templatePaths })`: pinned bundle path flows into `loadTemplate` so a v1-pinned document renders v1 regardless of the loader's current default. |
| `server-quotation.js`                             | `e14f9a52ca976c9b2455e181e187f21bb53951a9db28f90b945d91b7707d8221` | H4 — `GET .../rendered-html` now resolves the pinned bundle's paths via `resolveApprovedTemplatePaths()` and passes them into `renderQuotationHtml`. The prior current-equals-pinned gate is downgraded to informational. |
| `tests/phase-h-production-readiness.test.mjs` (NEW) | `7acd56ace57bd123c9d74d9af8d401e0866237abf0831c7d55a5a5c834898221` | 37 tests spanning H1/H2/H3/H4/H5/H7 + RBAC audit.                                                                                            |
| `docs/audit/PHASE_H_CLOSURE_REPORT_2026_09_05.md` | (this file)                                                        | Closure report.                                                                                                                              |

Approved v1 artwork bundle — UNCHANGED (locked baseline preserved):
```
fbb4e5e206b867b0391c6c0f696bf040c68abb7678cb626a317ad2923582d1d1  assets/approved-template/Flarize_Solar_Quotation.v1.html
b4f5d119247cf463da84762a89d3d7304cc20a4d7958a7c7dfd8b89309204731  assets/approved-template/Flarize_Solar_Quotation.v1.meta.json
```

Historical persistence file — UNCHANGED (verified over full Phase H run):
```
ff71e6f0a1f564c5aa13734f94ff92130f5f9cb4a33c59e59279e0d069ba2ae4  data/quotation-state.json
```

---

## 2. H1 — Procurement

### 2.1 The 145 `landedUnitCost == purchasePrice` records — explicit classification

The 257-record procurement price master partitions cleanly and
deterministically into two commercial classes:

- **145 records — supplier price IS the landed price at Flarize's
  warehouse.** These are bulky low-value bulk items where the supplier
  quotes an all-inclusive delivered price and no separate freight/GST
  break exists. Dominant categories (from the classification test):
  - `panel` — 36 records
  - `armoured_cable` — 15
  - `acdb` / `dcdb` — 10 each
  - `meter`, `cb_rod`, `conduit_pipe`, `dc_cable`, `hoymiles`,
    `structure_material` — 6 each
  - remainder across `ac_cable`, `painting_material`, `ss_screw`,
    `earth_cable`, `isolator`, `solar_clamp`, `copper_lug`, `la_cable`,
    `ug_cable`, `welding_material`, `battery_cable`, `change_over`,
    `cable_tie`, `flexible_pipe`, `insulation_tape`, `mccb_box`,
    `meter_box`, `mc4_connector`.
- **112 records — landed > purchase (landing adjustment applied).**
  These are high-value equipment classes where the supplier quotes
  ex-warehouse and Flarize adds freight + landed adjustments:
  - `inverter` — 98
  - `enphase` — 9
  - `battery` — 5

**No record has `landedUnitCost < purchasePrice`** (negative landing
adjustment is not permitted — the test refuses one). **No inverter,
Enphase device, or battery is recorded at parity** — every high-value
piece of equipment must carry an explicit landing adjustment; the test
enforces this.

### 2.2 Production procurement batch requirement

The `procurementWorkspace.assertProductionProcurementAvailable()` gate
(from Phase D) still refuses issuance backed by seed-only procurement
values. Its behavior is unchanged in Phase H — production issuance
requires the Procurement team to publish real approved batches keyed to
the components consumed. This is a **business/data completion item**
that the Phase F/G/H code does not silently work around.

### 2.3 `fi_*` consumables — landed-cost / policy decision (EXPLICIT)

**47 unique `fi_*` (fixed-item) IDs** are declared in
`catalog.bomTemplates.*.fixedItems`. **Zero of them** appear in
`data/procurement-price-master.json` with a `landedUnitCost`. The test
(`H1 — fi_* consumables … EXPLICIT DATA GAP`) locks this in.

Consequence in the server chain (verified by the test
`Server cost engine never uses catalog price where landed cost is
required`):

- `fi_*` lines are emitted by the BOM (design-level enumeration is
  correct).
- The Phase D convention — filter the LOCKED snapshot to lines whose
  component has a `procurement-price-master` entry with
  `landedUnitCost != null` — **excludes every `fi_*` line** from the
  cost engine input. There is **no silent catalog-price fallback**;
  `fi.price` from the catalog does **not** enter `MATERIAL_LANDED`.
- MATERIAL_LANDED is therefore an under-count relative to the
  design-level BOM, by exactly the sum of `fi_*` quantities × their
  catalog prices.

**Explicit business decision required (§9 blocker):** either publish
`fi_*` landed prices into the procurement master (preferred), or ratify
a formal consumables policy that folds them into
`officeExpenseAllocation` / a new head. Neither is done silently by the
code.

---

## 3. H2 — Branding

- `assertBrandingEditor` accepts **ADMIN** and **PROJECT_HEAD**;
  refuses SALES / SALES_HEAD / PROCUREMENT / ENGINEERING / CEO /
  FINANCE / null / '' — every non-editor role produces
  `BRANDING_EDITOR_FORBIDDEN`. Test coverage: two subtests in the H2
  suite plus the existing Phase F Sales-rejection cases.
- `freezeBrandingSnapshot(store)` captures the **current** version for
  every kind (`bank / upi / signature / seal`) with
  `source: 'CURRENT_VERSION'`.
- `freezeBrandingSnapshot(store, {signature: 'SIG-B', seal: 'SEAL-B'})`
  captures the **Project-Head-overridden** version with
  `source: 'PROJECT_HEAD_OVERRIDE'`. Both the current and
  overridden-selection paths are frozen deep — `Object.isFrozen` = true
  at every nested level.
- **No legal/signature/seal content is invented.** All test fixtures
  are labeled `FIXTURE_*`. The starter store on disk
  (`data/quotation-branding-state.json`) is still the empty Phase F
  starter — production requires Admin/PH to publish real versions
  before the first non-null branding block appears on an issued
  quotation.

---

## 4. H3 — Validity

- `assertPolicyEditor` accepts **ADMIN only**; refuses every other role
  including `PROJECT_HEAD`. This is intentional — Project Head cannot
  edit the **default** policy, only override it per-quotation. The
  policy-editor test enumerates 7 non-Admin roles and asserts
  `POLICY_EDITOR_FORBIDDEN` for each.
- `resolveEffectiveValidity(policy, null, issuedAt)` returns
  `{validityDays: defaultDays, source: 'ADMIN_DEFAULT'}`.
- `resolveEffectiveValidity(policy, 45, issuedAt)` returns
  `{validityDays: 45, source: 'PROJECT_HEAD_OVERRIDE'}`.
- `resolveEffectiveValidity(policy_with_null_default, null, issuedAt)`
  throws `POLICY_NOT_CONFIGURED` — the test enforces this.
- **Production data still uncofigured.** `data/quotation-policy.json`
  carries `validity.defaultDays: null` /
  `status: 'NOT_CONFIGURED'`. Sales cannot alter it (Sales is not in
  the editor list). This is an **explicit business decision** (§9).

---

## 5. H4 — Renderer pin-path (Rev 2 risk CLOSED)

**Prior state (Phase G):** the HTTP route enforced integrity of the pin
and, as a safety belt, refused to render when the loader's current
default was not exactly the pinned bundle. Once Rev 2 becomes the
default, that belt would refuse every historical v1-pinned document.

**Phase H fix — narrowly scoped renderer change:**

- `renderQuotationHtml(payload, { templatePaths })` — new optional
  parameter. When present, it is forwarded to `loadTemplate(opts)` so
  the renderer reads the bundle at `templatePaths.bundlePath` +
  `templatePaths.metaPath` INSTEAD of the loader default. All existing
  callers (no `templatePaths`) get the prior behaviour.
- `server-quotation.js /api/quotation/quotations/:id/rendered-html`
  now:
  1. Retrieves the ISSUED document.
  2. Refuses `RENDERER_PIN_MISSING` when `rendererPinning` is null
     (legacy documents).
  3. Calls `loadPinnedApprovedTemplate(pinning)` — integrity gate
     asserting the on-disk bundle SHA at `pinning.name` /
     `pinning.version` matches the recorded pin. Never a silent
     substitution.
  4. Calls `resolveApprovedTemplatePaths({name, version})` to compute
     the pinned bundle's paths.
  5. Calls `renderQuotationHtml(payload, { templatePaths, ... })` —
     rendering flows through the PINNED bundle regardless of the
     loader's current default.
  6. Reports `currentPin` in the response envelope for informational
     comparison — it no longer gates rendering.

**Regression proof (in `phase-h-production-readiness.test.mjs`):**

- `templatePaths` option flows into `loadTemplate` — a bogus path is
  **REJECTED LOUD** (`BUNDLE_MISSING`), never silently substituted.
- `templatePaths` resolved from the pin renders the pinned bundle and
  the returned `meta.bundleSha256` echoes the pinned SHA byte-for-byte.
- With pinned == current (today's state), the pin-path call and the
  default-path call produce IDENTICAL HTML SHA256. This becomes the
  golden regression harness on the day Rev 2 lands: if the pin-path
  call diverges from the pinned bundle, this test breaks.
- `loadPinnedApprovedTemplate` refuses a hash-mismatched pin — the
  integrity gate itself is tested with a fabricated SHA of `'0'*64`.

**Note on the "current template ≠ pinned template" simulation:** Phase
H installs the routing (templatePaths → loadTemplate) that makes such a
divergence safe. A physical two-bundle fixture cannot be shipped
alongside v1 without inventing artwork, which the phase directive
forbids. The routing plumbing is proved end-to-end today; on the day a
real Rev 2 lands, the same test asserts pinned-path stays with v1.

---

## 6. H5 — Legacy quotations

- `data/quotation-state.json` — SHA256 unchanged before / after the
  entire Phase H suite runs. mtime unchanged. The test asserts both.
- `loadPinnedApprovedTemplate(null)` and `loadPinnedApprovedTemplate({})`
  BOTH refuse — the HTTP route's `RENDERER_PIN_MISSING` short-circuit
  is documented and tested. A quotation without `rendererPinning`
  **cannot** be replayed through the pinned-render route; no pin is
  fabricated for it. Legacy quotations remain readable via the existing
  `/versions/:v` route (returns the stored document handle) — only the
  pinned-render replay is unavailable, by design.
- `issueQuotation` without `commercialFreezeInputs` still yields
  `document.snapshot: null` (Phase G back-compat preserved — H5 test
  locks this in).

---

## 7. H6 — App.jsx legacy routing

**Finding:** four `name.includes()` business-routing sites exist in
`src/App.jsx` (lines 1954, 1979, 1988, 2796). They are all inside
micro-inverter / accessory selection blocks (Enphase IQ8P, Q Cable,
Envoy, Q Relay, Q Terminal, CT; Hoymiles HMS 2000, HMS 1000, DTU Pro /
Lite; UG Cable "2 Core" / "4 Core"). Server-side production code is
already clean of `name.includes()` business routing — verified across
`src/**` and `server-*.js` (only path-safety `filename.includes('..')`
in `cmsAssetManager.js` and comments in `server-bom-builder.js` /
`deviceAllocation.js` documenting the ban).

**Decision:** these four sites are **NOT** removed. Refactoring any of
them requires either extending the catalog schema with new role fields
per Enphase / Hoymiles subtype, or rebuilding the client micro-inverter
accessory selection. Both are broader than "targeted cleanup"; the
directive says to skip in that case. **Server BOM is the production
authority; App.jsx is legacy client-side rendering only.** Documented
as accepted legacy tech debt (§9).

---

## 8. H7 — Final E2E production matrix

**Every** locked configuration axis is covered in the joined test
surface (Phase G + Phase H):

| Axis                          | Coverage source                             | Status |
|-------------------------------|---------------------------------------------|--------|
| on-grid Base / Value / Premium | Phase G G2 (`phase-g-quotation-e2e`)        | ✅     |
| hybrid Base / Value / Premium | Phase H H7 (3 tiers × 3 battery = 9 cases)  | ✅     |
| hybrid battery 0 / 1 / 2      | Phase H H7 + Phase G G2                     | ✅     |
| 1-panel micro / optimizer     | Phase H H7 (`IQ8P panelsPerDevice=1`)       | ✅     |
| 2-panel micro / optimizer     | Phase H H7 (mixed with HMS1000)             | ✅     |
| 4-panel micro / optimizer     | Phase H H7 (`HMS2000 panelsPerDevice=4`)    | ✅     |
| mixed device allocation       | Phase H H7 (2×HMS2000 + 1×HMS1000)          | ✅     |
| impossible allocation → BLOCKED | Phase H H7 (7 panels + 4-panel-only device) | ✅     |
| 3 kW 3P → BLOCKED             | Phase H H7 (mirrors `phase-c-boundary`)     | ✅     |
| Premium classification (2.2)  | Phase H H7 (profileKey=ongrid_premium)      | ✅     |
| Transportation vehicle/rate/distance (2.1) | Phase H H7 (30km × 35 = 2× at 60km) | ✅ |
| Landed procurement cost       | Phase H H1 + Phase D                        | ✅     |
| Gross margin (never MARKUP)   | Phase E (existing coverage)                 | ✅     |
| GST 8.9% (SOLAR_70_30_COMPOSITE) | Phase H H7 (asserted per hybrid case)     | ✅     |
| Subsidy separation (2.7)      | Phase H H7 (`sellingPrice ≥ cost`)          | ✅     |
| Commercial snapshot           | Phase F + G                                 | ✅     |
| Quotation issuance            | Phase G G0                                  | ✅     |
| Branding versioning           | Phase G G2 + H2                             | ✅     |
| Validity                      | Phase G G2 + H3                             | ✅     |
| Renderer pin                  | Phase G G1 + H4                             | ✅     |
| Deterministic HTML            | Phase G G5 + H4                             | ✅     |
| Mutation immunity             | Phase G G3                                  | ✅     |
| RBAC                          | Phase F + H2/H3/RBAC-audit                  | ✅     |
| Historical quotation safety   | Phase G G4 + H5                             | ✅     |

Phase H alone: **37 new tests, all pass.**

---

## 9. Remaining blockers (explicit — not silently resolved)

Each item below requires an EXPLICIT human decision before the FIRST
production quotation can be issued. The code does not paper over any of
them.

1. **`data/quotation-policy.json` — Admin default validity is
   `NOT_CONFIGURED`.** Issuance with commercial-freeze inputs will
   throw `POLICY_NOT_CONFIGURED`. **Admin must publish a
   `defaultDays`** (locked 2.6) or every quotation must carry a
   per-quotation `validityOverrideDays`. Decision: Admin.
2. **`data/quotation-branding-state.json` — no bank / upi / signature /
   seal versions published.** Issued quotations will freeze
   `snapshot.branding.{kind}: null`. **Admin / Project Head must
   publish real BK-* / UPI-* / SIG-* / SEAL-* versions** (locked 2.4 +
   2.5). Decision: Admin + Project Head. **Do not** ask this tool to
   invent legal signature or seal content.
3. **`fi_*` consumables landed cost.** 47 unique fixed-item IDs from
   `catalog.bomTemplates.*.fixedItems` are ABSENT from
   `procurement-price-master.json`. They are currently excluded from
   `MATERIAL_LANDED`. Decision required: either publish landed prices
   for each `fi_*` into the procurement master, OR ratify a formal
   consumables policy that absorbs them into
   `officeExpenseAllocation` / a dedicated cost head. Decision:
   Procurement + Admin (business).
4. **Production procurement batches.** The Phase D
   `assertProductionProcurementAvailable()` gate refuses issuance
   backed by seed values. Decision: Procurement must publish real
   approved batches referencing the components consumed. Business.
5. **App.jsx name-based accessory selection (4 sites — legacy).**
   Client-side only; server BOM is authoritative and clean. Refactor
   requires catalog schema extension or a client rewrite. Decision:
   product / engineering, non-blocking for server production.
6. **Rev-2 template landing.** When Rev 2 becomes the loader's current
   default, the pin-path plumbing (H4) means v1-pinned quotations
   continue to render v1. The visual golden for Rev 2 itself is a
   separate exercise, not part of Phase H scope. Decision: design /
   product when Rev 2 is authored.
7. **Legacy documents without `rendererPinning`.** Those already
   present in `data/quotation-state.json` cannot be replayed through
   the pin-enforced HTML route. No pin is fabricated. They remain
   readable via `/versions/:v`. Decision: accept, or re-issue the
   affected quotations under the current pinning contract.

---

## 10. Halted — Phase H closed. Awaiting review.
