# PACKAGE AUTHORITY — V1 status

**Status:** 🟡 Partially approved · **Phase:** 1C · **Decisions:** C23, C31, D11, D12

## What is APPROVED

| Rule | Decision | Scope |
|---|---|---|
| 1P AC isolator → `is1` | D11-A | every 1P package, all tiers |
| 3P AC isolator → `is2` | D11-B | every 3P package, all tiers |
| Placeholder isolator → INACTIVE | D11-D | globally excluded from resolution |
| Premium battery → `bt2` FlexPhase ×1 | D12 | hybrid premium 3/5/8/10 kW |
| Premium IQ8P → panel quantity | D12 | hybrid + ongrid premium |
| Premium System Controller → required | D12 | hybrid premium |
| Premium `mb1` → prohibited | D12 | hybrid premium |
| Premium generic DC battery cable → prohibited | D12 | hybrid premium |

**34 of 322 component records are now `approvalStatus: APPROVED`**, each carrying `approvedByDecision` (`D11-A`, `D11-B`, or `D12`).

## What remains PROPOSED

**288 of 322 components.** Every one is still fallback-derived — `available[0]` or nearest-kW, decided by catalog array order.

```
components APPROVED   34
components PROPOSED  288
fallback total       319
explicit selections    3   (from data/bom-state.json)
packages fully approved 0  of 48
```

**No fallback-derived component was auto-approved.** A test asserts that any `APPROVED` component must carry a decision id, and that no fallback component is approved without one.

## Engineering status — all 48 packages

| System | VALID | WARNING | BLOCKED |
|---|---|---|---|
| on-grid (18) | 0 | 18 | **0** |
| hybrid (12) | 0 | 12 | **0** |
| upgrade (18) | 12 | 6 | **0** |
| **Total** | **12** | **36** | **0** |

**BLOCKED: 16 → 0.** Every remaining WARNING is either "component resolved by fallback" or an unconfirmed Enphase/battery-protection item — never a hidden defect.

## Role taxonomy (C32) — implemented

20 approved roles in `src/lib/bomRoles.js`. **`DC_ISOLATOR` deliberately excluded** per D11-C.

| Mapping | How |
|---|---|
| engine slot category → role | `CATEGORY_TO_ROLE`, 18 entries |
| Enphase rows → role | `ENPHASE_COMPONENT_ROLES`, **by componentId, never by display name** |
| unambiguous `fixedItems` → role | only `25mm Battery Cable` → BATTERY_CABLE, `40A Change Over Switch` → CHANGEOVER |
| everything else | `OTHER` |

Per instruction, **ambiguous fixed items were not forced into a role**. Roughly 36–39 uncategorised items per system remain `OTHER`. Assigning them requires confirming physical identity item by item.

**The role mapping changed no BOM quantity and no price** — it is metadata only, and the baseline diff confirms it.

## Catalog data model — prepared, not populated

`componentIdentity.js` supports `status`/`engineeringStatus` today. The following remain **absent and unpopulated**, exactly as instructed:

`poles` · `currentRating` · `voltageRating` · `acDc` · `purchasePrice` · `sellingPrice` · `tierEligibility` · `phaseEligibility` · `systemTypeEligibility`

No value was guessed. `is1` and `is2` carry `engineeringStatus` markers recording their approval, and nothing else was added.

## Procurement price boundary — recorded, not implemented

Future rule, acknowledged and **not built** in this phase:

- Procurement maintains `latestPurchasePrice`, `supplier`, `purchaseDate`, `source/reference`, `sellingPrice`.
- **Engineering package selection must not depend on purchase price.** Changing a purchase price must change COST and must never change engineering BOM selection.

Current state: engineering selection already ignores price — resolution is by tier, phase, type and status only. The boundary is therefore intact today, but it is not yet *enforced* by a separate price store. Phase 2/3.

## Path to fallbackCount = 0

1. Engineering reviews `data/packages.proposed.json` and approves componentIds per package/role.
2. Assign roles to the remaining `fixedItems` once physical identity is confirmed.
3. Wire the approved registry into the engine, with explicit componentId taking precedence and **nearest-kW / first-array fallback disabled for any pinned role**.
4. Re-capture and classify every diff.

Step 3 will move the baseline substantially — 319 components would switch from fallback to pinned.
