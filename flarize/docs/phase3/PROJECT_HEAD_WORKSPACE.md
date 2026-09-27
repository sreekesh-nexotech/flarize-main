# PROJECT HEAD WORKSPACE — APPLICATION LAYER

Phase 3, PART C/D/E/G. Added **purely additively**: no engine was modified,
`src/App.jsx` is untouched and the Vite bundle is byte-identical.

## Files

| File | Role |
|---|---|
| `src/lib/rbac.js` | Capability matrix for the six roles. Imports the existing ownership rules; restates none. |
| `src/lib/projectWorkspace.js` | Application service layer. Composes the frozen engines. No formula, no rate, no threshold, no clock. |
| `server-workspace.js` | HTTP transport. Registers `/api/workspace/*`. Contains no rule. |
| `public/workspace.html` | The UI. Renders what the API returns; implements nothing. |
| `tests/phase3-workspace.test.mjs` | 29 tests, mostly negative assertions. |

`server.js` gained exactly two additive hunks: route registration and an async
`workspace.init()` before `listen`.

## Architecture

```
workspace.html  ──HTTP──▶  server-workspace.js  ──▶  projectWorkspace.js
                                                        │
        rbac.js ◀───────────────────────────────────────┤
                                                        ▼
     projectBom · engineeringChecker · bomLock · costEngine · pricingEngine
     commercialHistory · projectRateCard        (FROZEN — unchanged)
```

Data flows one way. The UI never computes; the service layer never decides.

## The seventeen Project Head capabilities

| # | Capability | Delegated to |
|---|---|---|
| 1 | Create / open a project | `createProject` / `openProject` |
| 2–6 | Customer, architecture, system type, size, phase | `setProjectConfiguration` |
| 7 | Select an approved package | `listPackages` / `selectPackage` (registry approval status reported verbatim) |
| 8 | View the package BOM | `viewBom` → `projectBom.effectiveLines` |
| 9–10 | Edit / add / remove roles | `projectBom.setComponent / setQuantity / removeRole` |
| 11 | Run the Engineering Checker | `engineeringChecker.checkProjectBom` |
| 12 | See VALID / WARNING / BLOCKED | the checker's own `status` — never assigned locally |
| 13 | Finding detail: rule, severity, component, reason, source | carried through unchanged |
| 14–15 | Fix and re-run | any edit clears the previous verdict; nothing is cached |
| 16 | Lock when policy permits | `bomLock.attemptLock` |
| 17 | Immutable snapshot after lock | `bomSnapshot` via `bomLock` |

## Invariants enforced by test

- **No clock.** Every operation takes a caller-supplied `at`; the service throws `MISSING_TIMESTAMP` without one.
- **No silent substitution.** A pending-approval component stays selectable and survives verbatim; the checker reports it. A component id outside the catalog is refused, not created.
- **No invented quantity.** The registry pins no structure line, so the BOM has none and the checker blocks on `PBC-K-001` until the Project Head supplies one.
- **No package mutation.** An edit becomes a `PROJECT_HEAD_OVERRIDE`; `packageLines` stays frozen.
- **A rejected lock changes nothing.** The BOM stays DRAFT and editable; no snapshot is produced.
- **No ₹0 for a missing value.** `amount: null`, `configured: false`, `blocked: true`; the UI prints `NOT CONFIGURED`.
- **One history mechanism.** `commercialHistoryPanel` reads `commercialHistory.js` and stores nothing.
- **RBAC is server-side.** The UI disables buttons for presentation; the service throws regardless.

## Cost / pricing panel (PART D)

Renders all ten cost heads in `COST_HEAD_ORDER` with owner, formula, inputs and
config version, then DIRECT PROJECT COST and TOTAL ACTUAL PROJECT COST, then the
pricing block (target margin, minimum margin, list price, discount, actual
margin, approval status), then GST components from the configured
`SOLAR_70_30_COMPOSITE` regime, then the customer price.

In the current repository state the panel is honestly **BLOCKED**: no procurement
landed cost is configured, so `MATERIAL_LANDED` is `LANDED_COST_NOT_CONFIGURED`,
the total is `null`, and pricing refuses rather than showing a zero.

## Known limitation — identity

Role enforcement is real at the service boundary, but the deployment has one
credential and no user store, so the acting role is operator-asserted rather than
identity-proven. Reported by `GET /api/workspace/session` as
`identityModel: OPERATOR_ASSERTED_ROLE`. See decision request item 5.

## Not built yet, by instruction

PART F (Procurement UI) and PART H (quotation document).
