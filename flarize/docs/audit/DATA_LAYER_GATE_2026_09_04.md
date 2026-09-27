# Data-Layer Gate Report — 2026-09-04

**Scope:** Track A (savings dailySavings) implemented. Track B (KSEB refund) READ-ONLY verification only — **KSEB_AUTHORITY_UNVERIFIED**, no code touched. C7 hard-hold observed. All other hard locks honored.

---

## 1. Exact files changed

| Path | Change | Lines Δ |
|---|---|---:|
| `src/lib/savingsEngine.js`         | +2 fields on the existing return object: `monthlySavings` (the midpoint already computed at line 119 and already used at line 175 for `annualSavingsAmount = monthlySavings * 12`) and `dailySavings = Math.round(monthlySavings / 30)`. No formula, no config change, no new imports, no new engine version bump. | +12 |
| `tests/savings-engine.test.mjs`    | +6 tests in a new `describe('monthlySavings midpoint + dailySavings (additive fields)')` block. +2 fields added to the existing "test 32 — output contract" required-field list. No other tests modified. | +65 |

Track B: **zero files touched.**

## 2. Exact tests added / changed

Added (6 tests):
1. `monthlySavings emitted and equals annualSavingsAmount / 12` — midpoint parity.
2. `monthlySavings sits inside the [Low, High] range` — sanity band.
3. `dailySavings === Math.round(monthlySavings / 30)` — no other derivation.
4. `deterministic: same inputs → same monthlySavings + dailySavings`.
5. `present in V1 fallback too (no regionConfig)` — V1 path still emits both fields.
6. `renderer sees no /30 division: engine field is pre-rounded integer` — both fields are integers.

Changed (1 test, additive to existing assertion list):
- Test 32 (`output contract matches renderer field expectations`) — added `monthlySavings` and `dailySavings` to the required-field allow-list. All other assertions in that test unchanged.

No other test files touched.

## 3. Full test result

Focused suite:
```
node --test tests/savings-engine.test.mjs
# tests 60 · pass 60 · fail 0 · duration_ms 202
```

Full regression (`npm test`):
```
Before Track A: 2208 tests · 2159 pass · 15 fail · 34 cancelled
After  Track A: 2214 tests · 2165 pass · 15 fail · 34 cancelled
Delta:          +6 tests · +6 pass · 0 new failures
```

Baseline 15 failures unchanged (all pre-existing hybrid-battery / C7 / procurement gaps). Full list:
```
not ok 13 - profile hybrid_value declares one battery
not ok 14-17 - D1 FIXED — hybrid {3/5/8/10}kW value is battery-consistent
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
not ok 1243 - Phase A — Security Acceptance
```

## 4. Does `dailySavings` now exist in every per-tier quotation snapshot?

**Yes.** Path is fully wired end-to-end, no additional plumbing needed:

- `src/lib/savingsEngine.js` — every successful `calculateSavings()` return now carries `monthlySavings` + `dailySavings`.
- `src/lib/quotationWorkspace.js` (untouched) — `resolveSavingsResult(...)` calls `calculateSavings` **per alternative** inside `buildAlternativePayloads` (line 713). Each tier's own commercialSnapshot flows in, each tier's own `payload.savings.value` flows out with the new fields.
- `src/lib/quotationWorkspace.js` (untouched) — the PRIMARY tier's `resolveSavingsResult` runs the same call at line 859. Top-level `payload.savings.value.dailySavings` is present.
- Renderer path (`src/lib/approvedTemplate.js`, untouched since Step 1) — `tryTier('elite', 'dailySavings', 'savings')` walks `payload.alternatives[]` to the `premium` alt and reads `.savings.value.dailySavings`. `smart` reads primary. `essential` reads base alt. **All 4 daily tokens (`dailyValue`, `eliteDaily`, `smartDaily`, `essentialDaily`) resolve.**
- Existing test proof: `tests/approved-template/three-tier-renderer.test.mjs` test #14 (`Savings per tier — dailySavings must come from snapshot (no renderer arithmetic)`) already fed a payload with `dailySavings` per tier and asserted rendered strings `₹183/day` / `₹203/day` / `₹160/day`. Still passing.

Renderer's `SAVINGS_ENGINE_MISSING_DAILY_FIELD` blocker on those 4 tokens: **CLEARED** for any quotation whose savings engine actually ran (i.e. every quotation with an authoritative energy profile).

## 5. KSEB authoritative-source verification result

**`KSEB_AUTHORITY_UNVERIFIED`** — Track B HALTED per gate directive.

### Search coverage

| Location | Result |
|---|---|
| `data/*.json` (all 30+ files) | Zero hits for `registrationFee`, `refundPct`, `refundEligible`, `ksebRefund`, `registrationFeePerKw`. |
| `data/subsidy-config.json` | Covers PM Surya Ghar CFA only. `stateTopUp.kerala = 0`. No KSEB refund section. |
| `src/lib/**` | Zero authoritative references to KSEB registration fee, GST rate on it, or refund fraction. `subsidyEngine.js` emits `centralSubsidy`/`stateSubsidy`/`totalSubsidy` only — no KSEB registration head. |
| `server*.js` | No route, no config-loader, no reference. |
| `docs/**` | The **only** reference in project documentation to this rule is `docs/DECISION_LOG.md` line 520: `KSEB refund rule (appears only as pixels in the design) | Phase 5 | Commercial | **Not supplied**`. |
| Approved artwork (Page 9 JPEG) | Bakes `"REFUND FROM KSEB (80% of Pre-tax value of registration fee) (1000 per kw + 18% tax) 5kw – Rs 4000"`. Reverse-engineering this yields the formula — but the artwork is the ONLY place these constants appear, and it is not an authoritative source. |
| External web / KSEB portal | Not accessible from this session, and would not qualify as authoritative even if fetched — a Kerala state utility's fee schedule must be signed off by Commercial/Legal, not scraped. |

### Verdict

- **₹1,000 / kW registration fee** — no authoritative source. The rate exists only as pixels in Page 9 artwork.
- **18% GST on the fee** — no authoritative source. Follows generic-services rate but not confirmed against KSEB's tax treatment for solar prosumer registration.
- **80% refund fraction** — no authoritative source. Numerically confirmed by dividing baked artwork (`5 × 1000 × 0.8 = 4000`), but that only proves the artwork is self-consistent — not that KSEB's policy actually refunds 80%.

The DECISION_LOG explicitly records the rule as **not supplied**. Converting the baked constants into an engine rule would create fabricated authority — precisely what the gate directive forbids.

**Track B halted.** No `subsidyEngine.js` change. No `subsidy-config.json` change. No new `kseb-config.json` created. No implementation of the S1 approach (approved read-only in the prior gate) until Commercial supplies an authoritative source: a KSEB circular / tariff order / rate card / gazette notification with date and reference number, or an equivalent letter from Commercial confirming the three constants apply to the issuing entity.

### What Commercial needs to supply to unblock

One document that names, in writing:
1. The KSEB registration/inspection/commissioning fee for domestic rooftop solar (₹ per kW pre-tax).
2. The GST rate applied to that fee at issuance.
3. The refund percentage (or the rule that determines it) after commissioning.
4. Effective date + source reference (order number / circular / gazette).

Once supplied and dated, the previously recommended S1 implementation (config section on `subsidy-config.json` + 3 return fields on `subsidyEngine`) becomes safe to build.

## 6. Remaining blockers

| Blocker | Status this gate |
|---|---|
| `SAVINGS_ENGINE_MISSING_DAILY_FIELD` (renderer tokens `dailyValue`, `eliteDaily`, `smartDaily`, `essentialDaily`) | **CLEARED** — engine now emits `dailySavings`. |
| `PAGE_9_BAKED_KSEB_REFUND_5KW` | **HELD** — `KSEB_AUTHORITY_UNVERIFIED`. Waits on Commercial. |
| `TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT` | **CLEARED** — Step 1's `orchestrateThreeTiers` populates `payload.alternatives[]`. Test evidence in `three-tier-renderer.test.mjs`. |
| `PAGE_3_DYNAMIC_DATA_NOT_SUPPORTED_BY_TEMPLATE` | **PENDING** — approved template revision required. Untouched. |
| C7 sub-blockers (`C7_LEGAL_ENTITY_UNRESOLVED`, `C7_GSTIN_DRIFT`, `C7_FOOTER_MULTI_DOMAIN`, `C7_BANK_ENTITY_LEAKS`, `C7_TERMS_ENTITY_LEAKS`, `C7_RENDERER_HARDCODES`, `C7_TEAM_EMAIL_DOMAIN`) | **HARD-HELD** — legal/business decision. Untouched. |
| Page 1/2/5/6/7/8/12 baked-data blockers | **PENDING** — approved template Rev 2. Not this gate. |
| Savings lifetime blockers (`lifetime25yrSavings`, `yearlySeries`, `paybackMonths` for Page 8) | **PENDING** — `savings-config.json` marks degradation + escalation `NOT_APPROVED`. Separate business decision. |

## 7. SHA-256 hashes of protected files (proving untouched)

### Changed this gate
```
bdf67668845c85327f09b0600fe92e39f8a0c18a082f71e4de82da5ce8251376  src/lib/savingsEngine.js
6999da98a4c1a7e7974fb138b6d7a56a9e73bfabd8859188d87172c737536c82  tests/savings-engine.test.mjs
```

### Protected — verified byte-identical to prior gate

```
fb3a223ec2e25e1b6279ce797ab5ce33313933d46e599dbef18e04dd29d9d369  public/lib/quotationDocument.js
1263eb6051cf3bd11ad8680df591207bf21c459b03893e538d21fe4ed0d30c5e  src/lib/quotationPayload.js
0b72297fc05af77868daf75492feb5bf6108db780c21f3e287baf5f3f6ff342f  src/lib/quotationWorkspace.js
b6ee89dcbf618f24d3add40c1fd883c9858111d9109fd5faafa2451e550c9c86  src/lib/costEngine.js
8b9e5db2113df46ab7d3049d3fcae413c7c88efaea174e6ed149bd2895c30ca9  src/lib/pricingEngine.js
648ac533a64693d678810c7b20a2359c974900b1a847e4f855f6088698ae6de7  src/lib/subsidyEngine.js
87dee18fb8b17241f553d52b365e136e13a87a54c9d34c1d45fbae0feb65a1d2  src/lib/financeEngine.js
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

Confirms: no approved HTML, no template file, no renderer, no `quotationPayload.js`, no `quotationWorkspace.js`, no engine other than `savingsEngine.js`, no config file was modified. C7 identity + company profile + subsidy config + savings config bytes-identical. Old renderer bytes-identical.

---

## HALT

No Template Rev 2. No Malayalam. No Page 4. No quotation redesign. No old-renderer changes. No masks/overlays/pixel patches. No invented KSEB values. Track B remains held on `KSEB_AUTHORITY_UNVERIFIED`. Awaiting next gate.
