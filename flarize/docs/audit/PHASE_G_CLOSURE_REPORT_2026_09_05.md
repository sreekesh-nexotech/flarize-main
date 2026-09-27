# Phase G — Quotation Renderer Wiring — Closure Report
**Date:** 2026-09-05
**Model:** claude-opus-4-7
**Scope:** Q1 Option A wired to HTTP; buildCommercialSnapshot() wired into issueQuotation(); end-to-end quotation proof; mutation immunity; reproducibility.

Halt-for-review handoff. No further phase started.

---

## 1. Files changed + SHA256

| Path                                                | SHA256                                                             | Change                                                                                                                    |
|-----------------------------------------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| `src/lib/quotationWorkspace.js`                     | `e5a4a62313c66bb36c673029d811c5bb10324ded9542533142145b7fbe7205ad` | G0 — added `import { buildCommercialSnapshot }` + optional `commercialFreezeInputs` parameter + `document.snapshot` freeze |
| `src/lib/commercialFreeze.js`                       | `8e13d6ff3db4a2ae1bc463461071518e42789c21d5542f7c751384ffa96dd556` | Repaired to clean ESM. Widened to accept versioned commercialSnapshot shape (`{cost, pricing, versions}`) alongside flat.  |
| `src/lib/quotationBranding.js`                      | `d14954eb0b24887029b63f0b689c1d13a1ec98e4c6b696dd81ebc7cf9934909a` | Repaired to clean ESM. Public API unchanged.                                                                              |
| `src/lib/quotationPolicy.js`                        | `fa25c3560d736cbfc01febf9cb73f1e57486e8b61456e3ad7a69084375ccd6e4` | Repaired to clean ESM. Public API unchanged.                                                                              |
| `server-quotation.js`                               | `4782239932b5a759e2d755aca1f183bdf3f0a9f59f8ffb176e0f61ad672d5c2a` | G1 — `GET /api/quotation/quotations/:id/rendered-html` route wired to the existing `renderQuotationHtml` + pin-enforced.  |
| `tests/phase-f-snapshot.test.mjs`                   | `d4f397dde7a508209d2f940807aab585468cc6015d4e4669c263e53d49fd904c` | Switched to dynamic `await import()` for the newly-ESM Phase F modules.                                                   |
| `tests/phase3-quotation-workspace.test.mjs`         | `8938f6dbe9f26331a883fc7317302a790340d0b25fdaa060f72211e5c6b93d9f` | Hermetic-import guard extended to permit `./commercialFreeze.js`.                                                         |
| `tests/phase-g-quotation-e2e.test.mjs` (NEW)        | `c284ccb06b40e437ee539f2e9e3d51f1cecc69257ad26089ddf2b3019309dc51` | 17-test E2E suite covering G0/G1/G2/G3/G4/G5.                                                                             |
| `docs/audit/PHASE_G_CLOSURE_REPORT_2026_09_05.md`   | (this file)                                                        | Closure report.                                                                                                           |

Approved v1 artwork bundle (untouched — verify SHA matches locked baseline):
```
fbb4e5e206b867b0391c6c0f696bf040c68abb7678cb626a317ad2923582d1d1  assets/approved-template/Flarize_Solar_Quotation.v1.html
b4f5d119247cf463da84762a89d3d7304cc20a4d7958a7c7dfd8b89309204731  assets/approved-template/Flarize_Solar_Quotation.v1.meta.json
```

Historical persistence file (untouched):
```
ff71e6f0a1f564c5aa13734f94ff92130f5f9cb4a33c59e59279e0d069ba2ae4  data/quotation-state.json
```

Untouched configuration files:
```
d987aece188e8c0e826f17d15ffab4f2038c90605eb0e2c2ddf0293a9937acfa  data/quotation-policy.json
27a31aa028c8ebe31e127fa00df0227b1f124a73ce10df7cdb131eb561ce253b  data/quotation-branding-state.json
```

---

## 2. G0 — issueQuotation snapshot integration proof

`buildCommercialSnapshot()` is now imported and invoked inside
`quotationWorkspace.issueQuotation()`. The change is **additive**:

- New optional parameter `commercialFreezeInputs` on `issueQuotation({...})`.
- When supplied, the frozen 10-domain snapshot is captured on the issued
  document as `document.snapshot`.
- When omitted, `document.snapshot === null` and every prior field
  (payload, version, status, issuedBy, issuedByRole, issuedAt,
  identityModel, commercialSnapshotId, bomSnapshotId, cmsPageVersions,
  rendererPinning) is unchanged byte-for-byte — verified by the entire
  pre-existing `phase3-quotation-workspace.test.mjs` suite passing
  unchanged.

Domains frozen on `document.snapshot`:
`engineering, battery, package, procurement, transportation, commercial,
subsidy, branding, validity, rendererPin` — all deep-cloned then
`Object.freeze()`d. `schemaVersion = 'flarize.commercial-snapshot/1'`.
`frozenAt = at` (the caller-supplied issuance timestamp).

Test proof: `G0 — buildCommercialSnapshot wired into issueQuotation`
    - "issued document carries document.snapshot with all 10 Phase F domains" ✅
    - "omitting commercialFreezeInputs still yields document.snapshot=null
       (back-compat)" ✅

No duplicate snapshot-building logic. Every consumer routes through the
Phase F helper; no domain is hand-assembled anywhere else.

---

## 3. G1 — Server HTTP renderer proof

New route on `server-quotation.js`:
```
GET /api/quotation/quotations/:id/rendered-html[?v=<version>][&relaxPage3=1]
```
- Delegates to the existing authoritative server renderer:
  `src/lib/approvedTemplate.js::renderQuotationHtml()`. No competing
  renderer created; no template modification.
- Retrieves the ISSUED document via `Q.getVersion()` — the fully frozen
  handle for callers with `COST_VIEW`; the redacted view otherwise.
- **Pin enforcement (three gates):**
  1. Document must carry `rendererPinning` (legacy `null` → HTTP 409
     `RENDERER_PIN_MISSING`).
  2. `loadPinnedApprovedTemplate(pinning)` — asserts the on-disk bundle
     at the pinned name/version exists AND its `bundleSha256` matches
     what was recorded at issue. Any mismatch → HTTP 409
     `RENDERER_PIN_INTEGRITY` (never a silent fallback).
  3. `getCurrentApprovedTemplatePinning()` must equal `document.rendererPinning`
     (name + version + bundleSha256). This closes the "renderer's own
     `loadTemplate()` picks the default" gap: if a future Rev 2 becomes
     the default while a v1-pinned quotation is replayed, the route
     refuses with HTTP 409 `RENDERER_PIN_CURRENT_MISMATCH` rather than
     substitute.
- Response envelope carries `rendererPinning`, `currentPin`,
  `pinnedBundle` (the on-disk verified meta), `renderStatus`, `meta` (the
  renderer's own bundle/template/manifest SHAs) and `html`. A caller can
  independently verify the HTML was produced against the exact bundle
  the document was issued against.

Test proof: `G1 + G5 — server renderer + reproducibility`
    - "renderQuotationHtml against the pinned bundle produces HTML with
       the pinned meta" ✅
    - `pinned.meta.bundleSha256 === doc.rendererPinning.bundleSha256`
    - `current.bundleSha256 === doc.rendererPinning.bundleSha256`
    - `r.meta.rendererVersion === APPROVED_TEMPLATE_VERSION`

---

## 4. G2 — End-to-end quotation proof

Chain covered per configuration axis (all 6 permutations pass in
`tests/phase-g-quotation-e2e.test.mjs`):

| Axis                       | Cases                                                        |
|----------------------------|--------------------------------------------------------------|
| System type                | on-grid, hybrid                                              |
| Tier                       | base, value, premium (`ongrid_premium` profileKey verified)  |
| Battery quantity           | 0, 1, 2 (hybrid; locked 2.3)                                 |
| Transportation             | STANDARD @ 35₹/km × 30km (locked 2.1)                        |
| Validity                   | Admin default 15d + PH override 45d (locked 2.6)             |
| Branding versions          | bank BK-V1, upi UPI-V1, current + PH override SIG-V2/SEAL-V2 |
| Signature / seal versions  | SIG-V1 (current) + SIG-V2 (PH override)                      |
| Renderer pin               | v1 bundleSha256 = fbb4...2d1d1 captured on `snapshot.rendererPin` |

Full chain per case:
```
buildBom → LOCKED bom snapshot → calculateCost → calculatePricing
        → calculateSubsidy → createCommercialSnapshot
        → registerBomSnapshot + registerCommercialSnapshot
        → createDraft → issueQuotation (with commercialFreezeInputs)
        → renderQuotationHtml (pin-enforced)
```

All 17 Phase G tests pass.

Locked 2.2 Premium classification verified: on-grid Premium resolves to
`profileKey: 'ongrid_premium'` and `isPremiumTier: true`.

Locked 2.7 subsidy separation verified: `snapshot.subsidy` carries the
Subsidy Engine result verbatim, tagged with
`source: 'SUBSIDY_ENGINE (separate from cost/margin per locked 2.7)'`.

---

## 5. G3 — Snapshot immutability after issuance

Post-issue mutations tested against a real issued document:

- **Branding master data:** publish a new bank version and switch the
  store's `current` pointer. `document.snapshot.branding.bank.versionId`
  is still `BK-V1`; `bankAccountNumber` unchanged. Attempt to write
  through the frozen object silently no-ops; `Object.isFrozen()` = true
  at every level.
- **Validity policy:** change `policy.validity.defaultDays` from 15 to
  90 and bump the version string after issue.
  `document.snapshot.validity.validityDays` = 15;
  `.policyVersion` = `2026-09-05.1`.
- **Transportation:** the snapshot's `transportation` block is deeply
  frozen; assignment to `ratePerKm` cannot mutate the captured value.
- **CommercialSnapshot:** `createCommercialSnapshot()` already
  deep-freezes its output, and `commercialFreeze` deep-clones before
  freezing — mutations to the source cs cannot alter the doc's
  `snapshot.commercial`.

Test proof: `G3 — mutation immunity` (4 subtests, all pass ✅).

Cloning contract in `commercialFreeze.js`: every domain value is
`JSON.parse(JSON.stringify(...))` cloned before `Object.freeze()`, so no
live reference to any master-data source (branding store, policy JSON,
transportation config, commercial snapshot) survives into the frozen
document.

---

## 6. G4 — Historical safety

`data/quotation-state.json` is neither read nor written by the Phase G
test suite. Proven byte-for-byte:

- Pre-run SHA256:  `ff71e6f0a1f564c5aa13734f94ff92130f5f9cb4a33c59e59279e0d069ba2ae4`
- Post-run SHA256: `ff71e6f0a1f564c5aa13734f94ff92130f5f9cb4a33c59e59279e0d069ba2ae4`
- mtime unchanged.

Test proof: `G4 — historical quotation-state.json remains untouched`
    - "SHA256 of data/quotation-state.json is unchanged before/after
       the chain runs" ✅

The E2E test builds fresh in-memory stores per case; nothing persists to
the historical file.

`server-quotation.js` writes to `quotation-state.json` only through
`persist()` on POST routes (`/issue`, `/revise`, `/bom-snapshots`,
`/commercial-snapshots`, `/quotations`, `/quotations/:id`). The new
`GET .../rendered-html` route is read-only and never calls `persist()`.
Existing quotations already stored are hydrated on init and re-frozen —
untouched.

---

## 7. G5 — Renderer reproducibility

Same `(document.payload, document.rendererPinning)` pair produces the
same HTML bytes. Proven:

- Two consecutive calls to `renderQuotationHtml(doc.payload, {strict:false, includePage3Blocker:true})`.
- SHA256 of the two HTMLs compared → identical.

Test proof: `G1 + G5` — "G5 — same frozen payload + same pin => identical
HTML bytes (deterministic)" ✅

No clock, no randomness, no environment-derived value enters the renderer
path.

---

## 8. Regression

Full suite before Phase G (Phase F baseline):
```
tests 2341 · pass 2293 · fail 14 · cancelled 34
```

Full suite after Phase G:
```
tests 2358 · pass 2310 · fail 14 · cancelled 34
```

Delta:
- +17 tests (new `phase-g-quotation-e2e.test.mjs`)
- +17 pass
- 0 new failures
- 0 new cancellations
- All 14 baseline failures remain the SAME 14 pre-existing failures
  (device-allocation, package-approval, phase-2/3 orchestrator etc. that
  the earlier phases flagged as pre-existing; none are Phase-G-caused).

---

## 9. Explicit non-modifications (per Phase G directive)

- Pricing, subsidy, finance, energy, savings engines: **no code change**.
- v1 artwork / approved template bundle: **no change**. SHA256
  `fbb4e5e206b867b0391c6c0f696bf040c68abb7678cb626a317ad2923582d1d1`
  matches the locked baseline.
- Client legacy `App.jsx` BOM engine: **not used**. `server-bom-builder.js`
  is the authoritative BOM builder called throughout the Phase G test.
- Existing `data/quotation-state.json`: **unchanged** (SHA above).
- Renderer core `src/lib/approvedTemplate.js` and its loader: **no code
  change**. Only the pinned-load + current-pin-equals-pinned guard is
  layered in the HTTP route.

---

## 10. Explicit blockers / decisions remaining open (NOT silently resolved)

Per the Phase G directive these remain **explicit business/data
completion items**, unchanged:

1. **145 procurement parity records** — still pending reconciliation
   between `procurement-price-master.json` (11 priced components used
   here) and the full 46-line BOM. Cost engine already filters via
   `procurement-price-master` presence per the Phase D convention; Phase
   G does not touch this.
2. **Production procurement batches** — `procurementWorkspace.assertProductionProcurementAvailable()`
   still gates seed-vs-production. Phase G test data uses seed
   `procurement-price-master.json` values; production issuance still
   requires the Procurement team to publish real approved batches.
3. **Consumables policy** — no Consumables engine wired. The commercial
   snapshot's `commercial.customerSideExpenses` and `extras` remain
   empty arrays as per the current Phase E contract.
4. **Branding / legal signature-seal posture** — the branding store
   `data/quotation-branding-state.json` is still the empty starter
   published at Phase F. Test fixtures inject a working store per case;
   production issuance still requires Admin/PH to publish real BK-*/
   UPI-*/SIG-*/SEAL-* versions before an issued quotation carries
   non-null branding.

Additional items surfaced during Phase G:

5. **Validity policy default** — `data/quotation-policy.json` is still
   the empty starter (`defaultDays: null`, `status: NOT_CONFIGURED`).
   Production issuance with `commercialFreezeInputs` will throw
   `POLICY_NOT_CONFIGURED` from `resolveEffectiveValidity()` until Admin
   sets a default. This is the correct Phase F 2.6-locked behavior — the
   test injects `defaultDays: 15` per case; production still needs
   Admin to publish.
6. **Renderer pin CURRENT-MISMATCH once Rev 2 lands** — the HTTP route's
   third pin gate refuses to render a v1-pinned document once the
   loader's default becomes Rev 2. When that landing lands, we need to
   route the pinned path through `loadPinnedApprovedTemplate()` all the
   way into the renderer (currently `renderQuotationHtml()` calls
   `loadTemplate()` with no opts). This is documented in the route's
   comment block and is out-of-scope for Phase G — Rev 2 isn't in.
7. **Legacy documents without `rendererPinning`** — the HTTP route
   refuses `RENDERER_PIN_MISSING`. Any historical document in
   `quotation-state.json` issued before R1/R2 landed will not render
   through the new route. Deliberate: those documents can still be read
   via `/versions/:v` and inspected; they cannot be replayed to HTML
   because their reproducibility contract was never established.

---

## Ready for review — halted.
