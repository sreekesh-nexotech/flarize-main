# BATTERY ARCHITECTURE — V1

**Status:** 🟡 Partially approved · **Phase:** 1C · **Decisions:** D12

## Core principle (approved)

**Deye/SEG and Enphase are different electrical topologies and must never share one generic battery-protection rule.**

Phase 1 had exactly that defect: `ENG-BAT-003` demanded an MCCB for every battery, unconditionally. That rule was extracted from `bomTemplates.hybrid.slots[4]`, which only ever described the DC-coupled topology.

## `batteryProtectionMode`

| Mode | Meaning |
|---|---|
| `INTEGRATED` | protection provided by the system itself; no external device |
| `EXTERNAL_REQUIRED` | a discrete protection device is required |
| `EXTERNAL_OPTIONAL` | permitted but not mandatory |
| `UNKNOWN` | not yet confirmed by Engineering |

### Assignments — derived from decisions, never guessed

| Component | Mode | Provided by | Source |
|---|---|---|---|
| `bt2` Enphase Flex/FlexPhase | **INTEGRATED** | `ENERGY_SYSTEM_CONTROLLER` | D12 — approved Enphase architecture |
| `bt1` SEG.5 PRO 100AH LV | **UNKNOWN** | — | D12 — per-battery confirmation pending |
| `bt3` Okaya 100AH | **UNKNOWN** | — | pending |
| `bt4` Livguard 100AH | **UNKNOWN** | — | pending |

**`UNKNOWN` preserves existing template behaviour** and raises `ENG-BAT-007` (WARNING). It does not assert a requirement that was never approved, and it does not silently drop protection that is currently being supplied.

## Deye / SEG — DC-coupled

| Tier | Battery | Protection | DC cable | Change-over |
|---|---|---|---|---|
| base | none (profile qty 0) | — | — | — |
| value | `bt1` ₹86,717 ×1 | `mb1` ₹8,500 ×1 | 25 mm ×5 m | ×1 |

Unchanged from Phase 1. **D1 remains fixed** — verified at 3/5/8/10 kW.

⚠️ `mb1` was **not** blindly confirmed as correct for `bt1`. Its mode is `UNKNOWN`; the BOM is unchanged and the warning stands until Engineering confirms per battery.

## Enphase Premium — INTEGRATED

| Item | Rule | Status |
|---|---|---|
| Battery | `bt2` Enphase FlexPhase **×1** for 3/5/8/10 kW | ✅ approved (D12) |
| Battery protection | **`mb1` PROHIBITED** | ✅ implemented |
| Battery cable | **generic 25 mm DC cable PROHIBITED** | ✅ implemented |
| Category | `battery` — never an accessory | ✅ implemented (D2) |
| Price | canonical `bt2` ₹95,000, not the `en_flexbat` ₹135,000 alias | ✅ |

**This is the current V1 *package* rule, not a backup-load calculation.** Whether one battery meets a given customer's backup load is a future engineering-validation question and is explicitly out of scope here.

## Validation rules

| Rule | Severity | Behaviour |
|---|---|---|
| `ENG-BAT-003` | BLOCKED | MCCB required — **only when mode ≠ INTEGRATED** |
| `ENG-BAT-007` | WARNING | protection mode not confirmed |
| `ENG-BAT-008` | BLOCKED | generic Deye MCCB or DC cable present on an Enphase topology |
| `BATTERY_MCCB_PROHIBITED` / `BATTERY_DC_CABLE_PROHIBITED` | BLOCKED | same, at validator level |

## Still open

1. **Per-battery protection mode for `bt1`, `bt3`, `bt4`** — is protection integrated in the battery, or is `mb1` genuinely required?
2. **Battery electrical data** — `kwh` is **null on all five batteries**. No nominal voltage, no max discharge current. Protection sizing cannot be validated automatically, and the customer specification row "Battery Capacity" still prints `—`.
3. **`mb1` rating suitability** for `bt1` — "160A" exists only inside a display name.
