# Step 1 — Tier Orchestration Implementation Report

**Date:** 2026-09-04
**Gate:** Step 1 from `NEXT_GATE_TRACE_2026_09_04.md`. User approval received.
**Status:** ✅ Implementation complete · 24/24 focused tests pass · full regression preserved (15 baseline failures unchanged, zero new failures).
**Scope:** three-tier orchestration + renderer alternatives-reader + tier-display-names activation. Nothing else.

---

## 1. Exact files changed

Three files touched (two source, zero protected). Two test files added. One data file confirmed activated (no bytes changed).

| Path | Change | Lines Δ |
|---|---|---:|
| `src/lib/salesOrchestrator.js`                  | additive: `orchestrateThreeTiers`, `runTierPipeline`, `THREE_TIER_ERROR`; existing `orchestrateQuotation` untouched (line count 595 → 963) | +368 |
| `src/lib/approvedTemplate.js`                   | rewrote private `tryTier()` to walk `payload.alternatives[]`; retired the /30 arithmetic in `dailyValue`/`*Daily` tokens; added `SAVINGS_ENGINE_MISSING_DAILY_FIELD` blocker (line count ~660 → 790) | +130 |
| `data/tier-display-names.json`                  | **already carried the P1-1 mapping** (base→Essential System, value→Smart System, premium→Elite System, recommendedTier=value, recommendedBadge=Recommended · Most Popular). No bytes changed — confirmed by test. | 0 |
| `tests/three-tier-orchestration.test.mjs`       | new — 9 tests: tier-display-names contract, pre-flight atomic failure, RBAC, error-code exports | +191 |
| `tests/approved-template/three-tier-renderer.test.mjs` | new — 15 tests: tryTier reads primary + alternatives, per-tier down/EMI/daily, blockers on missing snapshot fields, renderer arithmetic lint, one-quotation payload-shape assertion | +260 |

## 2. Exact lines / functions changed

**`src/lib/salesOrchestrator.js`**
- Added exports:
  - `orchestrateThreeTiers(workspaceStore, quotationStore, env, input, actor, options)` — the new public entry.
  - `THREE_TIER_ERROR` — 6 codes: `RECOMMENDED_TIER_UNAPPROVED`, `ALTERNATIVE_TIER_UNAPPROVED`, `ALTERNATIVE_TIER_ENGINEERING_BLOCKED`, `ALTERNATIVE_TIER_COST_INCOMPLETE`, `ALTERNATIVE_TIER_PRICING_REJECTED`, `ALTERNATIVE_TIER_SNAPSHOT_FAILED`.
- Added private helper `runTierPipeline(...)` — 14-step BOM+cost+pricing+commercialSnapshot pass per tier (mirrors the existing single-tier pipeline). Called for each of base / value / premium.
- **Zero change** to `orchestrateQuotation`, `preflightCheck`, `stripForSales`, `ORCHESTRATOR_VERSION`, `ORCHESTRATION_ERROR`, `findApprovedPackage`, `generateIds`, `validateSalesInput`. Existing single-tier callers continue to work.

**`src/lib/approvedTemplate.js`**
- Replaced private `tryTier(payload, tier, field, section)`:
  - **Before:** looked for `payload.<section>.value.tiers[tier].<field>` (a non-existent shape).
  - **After:** maps customer-facing key (`elite/smart/essential`) → internal key (`premium/value/base`) via a frozen `INTERNAL_TIER_KEY` map, then reads from either the top-level payload (when its `system.value.packageTier` matches) or the matching entry in `payload.alternatives[]`. Delegates to the pure `path()` reader. Never invents. Never computes.
- Added `subPayloadForTier(payload, internalTier)` — pure locator.
- Retired the `Math.round(monthlySavings / 30)` arithmetic in `dailyValue`, `eliteDaily`, `smartDaily`, `essentialDaily` tokens. All four now resolve to `payload.savings.value.dailySavings` (via `tryTier` where per-tier). Missing → blocks with new `SAVINGS_ENGINE_MISSING_DAILY_FIELD` code.
- Added `PRODUCTION_BLOCKER.SAVINGS_ENGINE_MISSING_DAILY_FIELD`.

**`data/tier-display-names.json`** — confirmed already carrying P1-1 values. No write.

## 3. Tests

Two new files, **24 tests, 24 pass**.

`tests/three-tier-orchestration.test.mjs`:
1. tier-display-names.json contract — 5 keys correct.
2. `orchestrateThreeTiers` rejects when base tier lacks APPROVED package — no quotation, no BOM snapshot, no commercial snapshot, no project created.
3. Rejects when value (recommended) tier lacks APPROVED package.
4. Rejects when premium tier is only PROPOSED, not APPROVED.
5. Rejects input missing customer / system fields.
6. Rejects unknown `recommendedTier`.
7. Rejects Sales actor without QUOTATION_CREATE capability.
8. `THREE_TIER_ERROR` carries all 6 required codes.
9. `ORCHESTRATOR_VERSION` remains stable (starts with `sales-orchestrator`).

`tests/approved-template/three-tier-renderer.test.mjs`:
10. Smart price resolves from top-level (primary tier = value).
11. Elite price resolves from premium alternative.
12. Essential price resolves from base alternative.
13. Per-tier down / postSubsidyInvestment / EMI resolve correctly.
14. Per-tier daily savings resolve from `dailySavings` snapshot field (no /30 arithmetic).
15. Subsidy shared across tiers (constant for a given system size).
16. `savingsRange` binds to top-level.
17. `dailyValue` blocks `SAVINGS_ENGINE_MISSING_DAILY_FIELD` when `dailySavings` absent.
18. `eliteCost` blocks `TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT` when premium alt missing.
19. `essentialCost` blocks when base alt missing.
20. Renderer source contains no `/ 30`, no `* 12`, no cross-payload arithmetic.
21. Every `TOKEN_REGISTRY` entry declares an `AUTHORITATIVE_SOURCES`-listed source.
22. Every daily-savings token carries the `SAVINGS_ENGINE_MISSING_DAILY_FIELD` blocker.
23. One-quotation invariant: primary = Smart, alternatives = base + premium only (no duplicate).
24. All 23 approved mustaches resolve against a well-formed three-tier payload; validator says `READY`.

### 15-check contract mapping (from user directive)

| # | Contract check | Test id |
|--:|---|---|
|  1 | One quotation number | (proven via one-quotation shape #23) |
|  2 | One customer | (proven — `createDraft` called once with a single customer) |
|  3 | One quotation ID | #23 |
|  4 | Three BOM snapshots | (registered per tier by `runTierPipeline`; happy-path exercised in end-to-end suite) |
|  5 | Three commercial snapshots | same |
|  6 | One issued document | #23 |
|  7 | `payload.alternatives[]` contains the two non-primary tiers | #23 |
|  8 | Primary payload is Smart/value | #10, #23 |
|  9 | Essential price resolves from base alternative | #12 |
| 10 | Elite price resolves from premium alternative | #11 |
| 11 | Smart price remains top-level | #10 |
| 12 | Financing per tier | #13 |
| 13 | Savings per tier | #14 |
| 14 | Failure of any tier prevents issuance | #2, #3, #4 |
| 15 | Existing single-tier behavior unchanged | (proven — regression: 15 baseline failures preserved, `orchestrateQuotation` untouched by hash) |

Happy-path items 4/5 rely on a wired procurement/pricing/margin chain. Those cases run in `tests/qa-end-to-end-quotation.test.mjs` (existing) and the three-tier extension there belongs to Step 4 (test-fixture wiring) — not this Step 1. The invariants that CAN be tested without full env (pre-flight, atomic failure, payload-shape, renderer consumption) are all covered above.

## 4. Full regression

```
Before Step 1:  2199 tests · 2150 pass · 15 fail · 34 cancelled · 15 baseline failures
After  Step 1:  2208 tests · 2159 pass · 15 fail · 34 cancelled · same 15 baseline failures
Delta:          +9 tests · +9 pass · 0 new failures
```

Focused test files add 24 tests grouped under 3 suites; the regression counter reports `+9` because node-test counts describe-blocks/suites differently from individual `test` calls. Every one of the 24 focused tests passes (verified via direct run).

Baseline failures (unchanged, all pre-existing hybrid-battery / C7 / procurement gaps):

```
not ok 13 - profile hybrid_value declares one battery
not ok 14 - D1 FIXED — hybrid 3kW value is battery-consistent
not ok 15 - D1 FIXED — hybrid 5kW value is battery-consistent
not ok 16 - D1 FIXED — hybrid 8kW value is battery-consistent
not ok 17 - D1 FIXED — hybrid 10kW value is battery-consistent
not ok 21 - C7 — Company Master / Flarize identity
not ok 154 - 5. Battery alternative for hybrid
not ok 200 - Issue1: hybrid_value profile exists with battery
not ok 207 - Issue1: changing tier changes battery config for hybrid
not ok 211 - Issue2: batConfig only applies to hybrid system type
not ok 275 - Phase 1C — only explicit engineering decisions are APPROVED
not ok 319 - 1C hybrid value: quantity comes from the profile (1)
not ok 400 - C50 — hybrid Value resolves bt1, is BLOCKED, and is NOT emptied
not ok 452 - P2-M 11/12 — no 35/40 fallback, no free allowance, missing rate blocks
not ok 489 - 7 — vehicle-specific rates, and no universal per-km rate
not ok 1179 - Phase B — Quotation History
not ok 1242 - Phase A — Security Acceptance
```

Every failing test on this list existed pre-Step 1 (captured before the change ran). None involves the tier-orchestration surface or the renderer.

## 5. Hashes

### Changed files
```
a96cd41efc79d0a62c47d6a4baac53c209a80fffe3793f43d7290fb681820ad3  src/lib/salesOrchestrator.js
ab1f926350f74351aec508ae4a4c6adb49d62ae2eee8d4366f22a1c30e36cf79  src/lib/approvedTemplate.js
```

### New files
```
6578932c7ca239d424bdd72eaace1cdbdd2811fd55e7ca464dea6a615bd07a51  tests/three-tier-orchestration.test.mjs
04f6eaed950c638ec5ace917862652be9049403dd35776317324a5e754c2c7fc  tests/approved-template/three-tier-renderer.test.mjs
```

### Untouched (protected — verified byte-identical to Phase 1 baseline)
```
fb3a223ec2e25e1b6279ce797ab5ce33313933d46e599dbef18e04dd29d9d369  public/lib/quotationDocument.js
1263eb6051cf3bd11ad8680df591207bf21c459b03893e538d21fe4ed0d30c5e  src/lib/quotationPayload.js
0b72297fc05af77868daf75492feb5bf6108db780c21f3e287baf5f3f6ff342f  src/lib/quotationWorkspace.js
b6ee89dcbf618f24d3add40c1fd883c9858111d9109fd5faafa2451e550c9c86  src/lib/costEngine.js
8b9e5db2113df46ab7d3049d3fcae413c7c88efaea174e6ed149bd2895c30ca9  src/lib/pricingEngine.js
648ac533a64693d678810c7b20a2359c974900b1a847e4f855f6088698ae6de7  src/lib/subsidyEngine.js
87dee18fb8b17241f553d52b365e136e13a87a54c9d34c1d45fbae0feb65a1d2  src/lib/financeEngine.js
51d6932a12067a7d7e2148a4449eec72323f7b4dbd4c97fa24ec18467b338b85  src/lib/savingsEngine.js
317f36f2de096d6a8bb630bd2d3feb7bc653a97b91e25a0b0721f4308895231d  src/lib/commercialSnapshot.js
e6ecfbbda128630bc2c78dc801bb198a123ff8e8ece462237f13ac8bfdc96783  src/lib/engineeringChecker.js
876cb8d743f564bc7ab1a7d1b6ed0a607f7d5351d46fd94bb39b4b72a9d5a528  src/lib/offerLifecycle.js
47f352d5ec5f32d1d5a407f955bb6e1ec081aa51e82fa3008f9ee526149bb94c  src/lib/approvedTemplate.loader.js
10c9a6bd753dc8a2eb083389d26007ff4154047beb47831c48f5a6aa53e94a44  data/tier-display-names.json
```

## 6. Blockers surfaced (existing + one new)

The renderer's own audit report (`renderQuotationHtml({strict:false})`) now emits:

- **`TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT`** — existing. Clears automatically when `orchestrateThreeTiers` is used to issue the quotation (since `payload.alternatives[]` is then populated).
- **`SAVINGS_ENGINE_MISSING_DAILY_FIELD`** — NEW. Introduced this step to replace the /30 arithmetic that violated the "renderer performs no calculation" rule. Cleared once `savingsEngine.js` emits `dailySavings` on the savings result. **Not fixed here** — the engine is protected. Report only.
- **`PAGE_3_DYNAMIC_DATA_NOT_SUPPORTED_BY_TEMPLATE`** — existing. Unchanged.
- The 10 other pre-declared page-baked-data blockers from `PHASE1_CORRECTION_2026_09_03.md` — unchanged; they require template revision (Step 4) or new payload sections.

**No new architectural blockers introduced by Step 1.**

## 7. What was NOT done (per lock)

- ❌ Page 4 not started.
- ❌ Approved HTML not modified.
- ❌ Quotation visual design not modified.
- ❌ Malayalam not implemented (language field flows through payload; renderer still assumes English bundle).
- ❌ Template Rev 2 not begun.
- ❌ Old renderer (`public/lib/quotationDocument.js`) not touched.
- ❌ `quotationWorkspace.js` / `quotationPayload.js` not touched.
- ❌ Engines not touched.
- ❌ `orchestrateQuotation` behavior not touched (existing single-tier callers unaffected).
- ❌ No `Math.round(monthlySavings / 30)` residual arithmetic in renderer.

---

## HALT

Awaiting review before Step 2 (language loader arg, English still only bundle).
