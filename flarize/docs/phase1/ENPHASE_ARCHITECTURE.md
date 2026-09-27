# ENPHASE PREMIUM ARCHITECTURE — V1

**Status:** 🟡 Core approved, several components PENDING · **Phase:** 1C · **Decision:** D12

## Approved V1 architecture

```
PV panel
  → 1 × IQ8P microinverter per approved PV panel
  → Enphase IQ Cable / branch architecture
  → Enphase AC system
  → IQ System Controller
        ↕
  Enphase FlexPhase battery
```

Premium **must not inherit Deye battery logic**.

## Approved rules — implemented

| Rule | Implementation | Verified |
|---|---|---|
| IQ8P quantity = approved panel quantity | engine uses `numPanels`; `ENG-ENP-002` BLOCKS a mismatch | ✅ 3 kW→5, 5 kW→9, 8 kW→13, 10 kW→17 |
| **Not** hardcoded 13 IQ8P | quantity scales with panel count | ✅ four distinct values |
| FlexPhase battery ×1 for 3/5/8/10 kW | `resolveBattery` from profile | ✅ `bt2` ×1 in all four |
| Battery is a BATTERY, not an accessory | canonical `battery` category | ✅ `bt2` ₹95,000 |
| IQ System Controller REQUIRED | `ENG-ENP-001` BLOCKS if absent | ✅ ×1 in all four |
| System Controller is its own role | `ENERGY_SYSTEM_CONTROLLER` — never INVERTER/BATTERY/ACCESSORY | ✅ |
| Generic `mb1` MCCB PROHIBITED | engine emits none; `ENG-BAT-008` BLOCKS | ✅ 0 in all four |
| Generic 25 mm DC battery cable PROHIBITED | engine suppresses; `ENG-BAT-008` BLOCKS | ✅ 0 in all four |

### Captured verification — baseline v3

| Package | Panels | IQ8P | equal? | FlexPhase | SysCtrl | mb1 | DC cable | AC isolator |
|---|---|---|---|---|---|---|---|---|
| hybrid 3 kW premium | 5 | 5 | ✅ | 1 | 1 | 0 | 0 | `is1` |
| hybrid 5 kW premium | 9 | 9 | ✅ | 1 | 1 | 0 | 0 | `is1` |
| hybrid 8 kW premium | 13 | 13 | ✅ | 1 | 1 | 0 | 0 | `is2` |
| hybrid 10 kW premium | 17 | 17 | ✅ | 1 | 1 | 0 | 0 | `is2` |

## ⚠️ PENDING_CONFIGURATION_CONFIRMATION

Current supplied BOM contains **Envoy ×1, IQ Relay ×1, CT ×4, System Controller ×1**. Enphase documentation indicates some of these functions may be integrated into the System Controller, but **the exact supplied configuration is not confirmed**.

| componentId | Item | Status |
|---|---|---|
| `en3` | Envoy S Metered | **PENDING** — retained, not removed |
| `en4` | IQ Relay | **PENDING** — retained, not removed |
| `en6` | CT 200 | **PENDING** — quantity and necessity unconfirmed |

`ENG-ENP-003` raises a **WARNING** whenever any of these appears. A premium hybrid therefore **never reports as fully VALID** while its configuration is unconfirmed — the unresolved issue is not hidden.

**Nothing was removed, nothing duplicated, no function reassigned.**

## Enphase cabling

The Deye/SEG `BATTERY_CABLE` role is **not reused** for Enphase. A separate role exists:

**`ENPHASE_COMMUNICATION`** — Enphase-specific communication/control cabling.

Supplied commercial BOM records: **communication cable, 10 m, ₹6,000 + GST**.

**Not added to the BOM.** No catalog identity exists and manufacturer/model are unconfirmed — creating one would mean inventing a product. `ENG-ENP-004` raises a WARNING on every premium hybrid recording that the item is known commercially but absent from the catalog.

## Validator gaps — deliberately not implemented

D12 asks the validator to additionally check panel/IQ8P compatibility, IQ8P electrical limits, branch/circuit limits, IQ Cable configuration, Q Cable and Q Terminator requirements.

**None were implemented.** The catalog carries no Enphase electrical limits — no max module power per IQ8P, no branch current limit, no maximum microinverters per branch, no Q Cable length rule. Implementing these would require inventing values, which is prohibited.

**Required input:** the Enphase engineering documentation or the approved source configuration, with concrete limits. Until then these remain unvalidated and are recorded here rather than silently skipped.

## Catalog duplicate — still open

`en7` "Enphase System Controller" **₹110,000** vs `en_sysctrl` "Enphase System Controller with Cable" **₹25,000**.

Both map to `ENERGY_SYSTEM_CONTROLLER`. Current name-matching selects **`en7`** — a 4.4× price difference decided by catalog array order. **Which record is correct has not been decided.** Blocks the D12-C option (c) path where the System Controller is treated as the battery protection device.
