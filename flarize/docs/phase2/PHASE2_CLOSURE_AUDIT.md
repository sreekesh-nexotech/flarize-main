# PHASE 2 CLOSURE AUDIT

**Date:** 2026-08-16 · audit only — no engineering or commercial value invented.

**Verdict: PHASE 2 BLOCKED.** Two decision-log items that explicitly state
`Blocks: Phase 2` are still unsatisfied, and both require data only Engineering
can supply.

---

## 1. C10 — upgrade paths · **BLOCKED**

Approved set: 3→5, 3→6, 3→8, 5→8, 5→10, 8→10.

Checked `catalog.bomTemplates.upgrade.fixedItems`. Across all 34 fixed items the
only path keys that appear are:

```
3_5   5_8   5_10   8_10
```

**3→6 and 3→8 still have no explicit engineering BOM.** They remain on the
approved list and remain extrapolated by the legacy heuristic at
`App.jsx:2776-2803` — closest known path by panel count, then
`refQty × newPanels / refPanels` with `refPanels` defaulting to 4.

Nothing was invented, auto-scaled or nearest-pathed to close this. The engineering
checker reports it (`PBC-R-002`), and an unapproved pair is blocked outright
(`PBC-R-001`). New regression tests lock the state: the day `3_6` or `3_8` gains
a definition, the guard test fails and the path must be re-verified against C10.

**Engineering must supply:** for 3→6 and 3→8, the explicit fixed-item quantity
set — for every fixed item that varies by path, the actual quantity for that
path. Not a scaling factor; the quantities.

## 2. C11 — 3 kW on three phase · **BLOCKED**

The rule is still unconfirmed. `bomTemplates.ongrid.sizes` offers `3`, and
`threePhase` is `["5tp","6","8","10"]` — 3 kW is absent from the three-phase
list, but no decision states whether that combination is *forbidden* or merely
*not currently listed*. C11 itself records the open point.

Two distinct defects sit under C11:

1. **3 kW remains selectable on three phase** with no block and no message.
2. **`switchSysType` silently rewrites 6 kW → 3 kW** when moving on-grid → hybrid,
   because `bomTemplates.hybrid.sizes` has no `"6"`. No warning, no confirmation.

The *principle* — never silently coerce a user's selection — is decided. The
*replacement behaviour* is not: block, hide, or warn-and-confirm are three
different products, and the correct one depends on the unconfirmed 3 kW rule and
on what a 6 kW hybrid should do. Implementing either half would mean inventing
that, so neither was implemented. A regression test records both defects exactly.

**Engineering must supply:** (a) is 3 kW ever supplied three-phase — hard no, or
allowed-but-rare? (b) when a user on 6 kW on-grid switches to hybrid, and hybrid
has no 6 kW, what happens — block with a message, hide hybrid, or offer the
nearest size for explicit confirmation?

## 3. Battery / engineering data · **BLOCKS SAFE ISSUE, narrow scope**

Verified against `data/battery-master.json` — nothing invented:

| battery | status | protectionRating | capacityKwh | compatibleInverters |
|---|---|---|---|---|
| bt1 | PENDING_ENGINEERING_APPROVAL | null | null | null |
| bt2 | APPROVED | null (INTEGRATED) | null | null |
| bt3 | PENDING_ENGINEERING_APPROVAL | null | null | null |
| bt4 | PENDING_ENGINEERING_APPROVAL | null | null | null |

Hybrid inverters record no `batteryVoltageMin/Max`, `maxBatteryCurrent` or
`communicationProtocols`, so BC-B/C/D/E stay INDETERMINATE.

**Effect on Phase 2:** four hybrid Value packages are BLOCKED
(VALID 12 / WARNING 32 / BLOCKED 4). That is the correct safety behaviour, not a
defect — but it does mean those packages cannot be issued or costed. This is the
only battery item that genuinely prevents safe BOM resolution today; the rest
(multi-battery rules, per-inverter compatibility population) are Procurement-UI
and Phase-3 dependencies and were deliberately **not** pulled into this phase.

## 4. Package authority / engineering gate

- **D11 — RESOLVED.** is1 and is2 carry all three tiers; the placeholder is TEST.
- **D12 — RESOLVED.** bt2 INTEGRATED via `ENERGY_SYSTEM_CONTROLLER`; Enphase
  prohibitions enforced.
- **Package registry — NOT APPROVED.** 48 packages, 322 components,
  **34 APPROVED / 288 PROPOSED, 0 packages fully approved.** Every APPROVED
  record cites its decision id. None was auto-approved, and none was auto-approved
  in this audit either. Approving the remaining 288 is an Engineering decision.

## 5. Phase 2A commercial engine — intact, unmodified

Re-verified by test: gross margin (never markup) · landed cost drives material
cost · purchase price separate · procurement delivery separate from project
transport · service ₹1,000 × 2 × 5 · survey ₹500 + excess × ₹3 · engineering
≤20 kW ₹500 · >20 kW rate-card only · net meter excluded · append-only history ·
versioned rate card · locked snapshot · no commercial rate literal in the Cost
Engine.

## 6. Regression

```
tests    261/261 pass (was 250; +11 closure guards)
build    index-vy7RQ7xF.js  byte-identical
App.jsx  97dfe333b4f81bae  unchanged
catalog  8147aca94e79e4f6  unchanged
baseline b215b2fd...  ->  b215b2fd...        0/54 cells changed
```
