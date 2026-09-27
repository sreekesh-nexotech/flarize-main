# DECISION REQUEST — PHASE 2 BLOCKERS

Status: **BLOCKED — awaiting Engineering / Commercial decisions.**
Date: 2026-08-16. Re-verified directly against the repository, not carried over.

None of the four blockers has been supplied since the closure audit. No value was
guessed, extrapolated, defaulted or inferred. Each item below states exactly what
is needed, what the system will do once it arrives, and what it does today.

---

## 1 — C10 · Upgrade paths 3→6 kW and 3→8 kW have no engineering BOM

**What exists.** `data/catalog.json → bomTemplates.upgrade.fixedItems` defines
quantities for four paths only: `3_5`, `5_8`, `5_10`, `8_10`. Six paths are
approved. `UPG-3-6` and `UPG-3-8` carry `explicitBom: false`.

**What happens today.** The legacy engine extrapolates them
(`src/App.jsx` ~2776-2803: `knownPaths = { '3_5': 4, '5_8': 5, '5_10': 9, '8_10': 4 }`,
then `refQty * newPanels / refPanels`). The Engineering Checker flags every such
BOM with `PBC-R-002` (auto-scaled, unverified). An unapproved pair is `PBC-R-001`
BLOCKED rather than extrapolated.

**What is needed — explicit quantities, per path, for each affected item:**

| Path | Panels | Structure | DC cable | AC cable | Earthing | Protection | Other fixed items |
|---|---|---|---|---|---|---|---|
| 3 → 6 kW | ? | ? | ? | ? | ? | ? | ? |
| 3 → 8 kW | ? | ? | ? | ? | ? | ? | ? |

Also required: whether an inverter change is part of each path, and if so which.

**Do not answer with "scale it from 3→5".** That is precisely what the system is
doing now and what C10 exists to stop.

---

## 2 — C11 · 3 kW three-phase, and 6 kW on-grid switched to hybrid

**What exists.** On-grid offers 3 kW. `bomTemplates.ongrid.threePhase` is
`['5tp','6','8','10']` — 3 kW is absent from it, but no decision states whether
that absence means *forbidden* or merely *not offered*. `bomTemplates.hybrid`
has no 6 kW size at all.

**What happens today.** `switchSysType` in `src/App.jsx` contains
`if (size === '6') setSize('3');` — a silent, unannounced downgrade of the
customer's system size. C11 forbids silent coercion, but the replacement
behaviour is part of the undecided rule, so nothing was substituted for it.

**Two decisions are needed:**

**(a) Is 3 kW three-phase a permitted configuration?**
- ☐ FORBIDDEN — the system will block the combination with a named rule.
- ☐ PERMITTED — supply the three-phase 3 kW BOM (inverter, ACDB, isolator, meter).
- ☐ NOT OFFERED (but not electrically invalid) — the system will hide it with a stated reason.

**(b) 6 kW on-grid → hybrid, where hybrid has no 6 kW size:**
- ☐ BLOCK the switch and tell the user 6 kW hybrid is not available.
- ☐ OFFER the nearest *available* hybrid sizes (3 / 5 / 8 / 10) and require an explicit choice.
- ☐ SUPPORT 6 kW hybrid — supply the 6 kW hybrid BOM (inverter, battery, protection, cable).

Silent conversion is not on the list, and will not be implemented.

---

## 3 — Battery engineering data (safety-critical subset only)

Only the fields required to issue and cost a battery safely are requested. Every
one is currently `null` and stays `null` until supplied.

| Component | Field | Why it is needed |
|---|---|---|
| bt1 | `protectionRating` + protection device | A battery cannot be issued without its DC protection. Do **not** answer "160A MCCB / mb1" unless that is an engineering decision — it was explicitly rejected as an assumption. |
| bt1 | `compatibleInverters` | Battery/inverter pairing cannot be validated without it. |
| bt3, bt4 | `integratedProtection` (true/false), and if false the external device + rating | Determines whether a separate protection line belongs in the BOM. |
| bt1–bt4 | `capacityKwh`, `nominalVoltage`, `maximumDischargeCurrent`, `communicationProtocol` | Sizing, current and comms compatibility checks. |
| hybrid inverters | `batteryVoltageMin`, `batteryVoltageMax`, `maxBatteryCurrent`, `communicationProtocols` | Without these, checks BC-C and BC-D are INDETERMINATE, not passing. |

**Consequence of leaving this open:** bt1/bt3/bt4 stay
`PENDING_ENGINEERING_APPROVAL`, four hybrid Value packages stay BLOCKED, and the
Project Head can still *select* those batteries — the checker reports the state
rather than the picker hiding it. That is the intended safety behaviour, not a
software failure.

---

## 4 — Package authority · 288 PROPOSED component pins

**What exists.** `data/packages.proposed.json`: 48 packages, 34 components
APPROVED (each citing a decision id), 288 PROPOSED, **0 packages fully approved**.
Most PROPOSED pins carry `derivedBy: "fallback:firstAvailable"` — i.e. the
package has not actually chosen; the catalog order did.

**What is needed.** Per package and role, one of:
- APPROVE the proposed component id (with a decision id, as the existing 34 have), or
- PIN a different component id, or
- mark the role NOT APPLICABLE for that package.

**This cannot be batched by the system.** Nothing will be auto-approved, and a
PROPOSED package is reported as PROPOSED everywhere in the workspace UI.

**Suggested order of work** (highest commercial impact first, not an engineering
opinion): the on-grid Base 1P family, then on-grid Value, then hybrid.

---

## 5 — OPEN, raised by Phase 3: per-user identity for RBAC

Role enforcement is implemented and tested at the service boundary. However the
deployment has a single credential (`ADMIN_PASSWORD`) and no user store, so the
acting role is asserted by the authenticated operator rather than proven.

**Decision needed:** how users are created and authenticated —
- ☐ per-user accounts held in this system (needs a credential-storage decision), or
- ☐ an external identity provider, or
- ☐ accept operator-asserted roles for internal V1, with the limitation documented.

Until this is decided, `GET /api/workspace/session` reports
`identityModel: OPERATOR_ASSERTED_ROLE` so the limitation is visible rather than implied.

---

## What is NOT blocked

The Project Head Workspace, cost/pricing panel, commercial history views and RBAC
are complete and tested against the frozen engines. They render the blocked state
honestly — a missing quantity shows as NOT SET, a missing commercial value as
NOT CONFIGURED, and a blocked BOM refuses to lock. Supplying any answer above
turns that screen green without a code change to the engines.
