# PROJECT BOM AUTHORITY

**Phase 1E** · `src/lib/projectBom.js`

---

## Who decides what

| Authority | Owns | Cannot |
|---|---|---|
| **Project Head** | what is in the project BOM — component identity and quantity per role | declare it valid |
| **Engineering Checker** | whether that BOM is technically valid | change what is in it |
| **Procurement** | material availability, supplier, purchase price | change engineering selection or architecture |
| **Admin** | overhead, margin, commercial rules | change engineering selection |
| **Sales** | consumes the approved quotation | change any engineering-critical role |

The first two lines are the whole phase. **Selection and validation are separate
concepts.** Conflating them is what produces a system that silently "fixes"
itself and ships the wrong hardware.

---

## The rule that follows from that split

> The system must NEVER silently substitute, remove, or change a Project Head's
> selected component because the checker finds a problem.

Enforced structurally, not by convention:

- `projectBom.js` performs **no validation**. `setComponent` accepts any
  componentId, including one with no engineering data at all. It has no
  knowledge of compatibility and no access to the checker.
- `engineeringChecker.js` performs **no mutation**. It imports no mutation
  function; a test asserts that `setComponent`, `setQuantity` and `removeRole`
  do not appear in its source at all.
- A line leaves the BOM **only** through `removeRole`, which is an explicit
  Project Head action recorded in history. `setComponent(role, null)` throws and
  tells the caller to use `removeRole` instead.
- Quantity is never zeroed to hide a problem. A role present with quantity ≤ 0
  is itself a blocker (`PBC-L-001`).

A bad configuration therefore looks like this — visible, named, still in the BOM:

```
Battery    bt2  Enphase Flex Battery       1 no
           🔴 BLOCKED  PBC-A-002
           "Enphase Flex Battery" is an Enphase component and cannot be used
           on a DEYE architecture.
```

---

## Package default vs project BOM

```
createProjectBom({ ..., lines: <package default> })
  packageLines   frozen. A project edit NEVER writes here.
  overrides      per-role project edits
  removedRoles   explicit removals
  history        every action, with who and when
```

`effectiveLine(bom, role)` = override → package default → null.

Project A selecting `bt3` does not touch `packageLines`, does not touch the
caller's own array, and does not affect Project B. Test 3 asserts all three.

---

## Editable roles

```
PANEL · INVERTER · MICRO_INVERTER · BATTERY · STRUCTURE · ACDB · DCDB
AC_ISOLATOR · CHANGEOVER · AC_CABLE · DC_CABLE · BATTERY_PROTECTION
BATTERY_CABLE · MONITORING · EARTHING · PROTECTION
ENERGY_SYSTEM_CONTROLLER · ENPHASE_COMMUNICATION · METER · OTHER
```

`DC_ISOLATOR` is absent — decision D11-C, not modelled in V1. Selecting it is
not merely unsupported: `PBC-P-002` blocks a BOM that contains one.

---

## Not built in this phase

The Project Head **UI** is minimal by instruction. This is the domain model and
the validation. No Cost Engine, no Procurement UI, no RBAC, no Sales workflow,
no quotation redesign. `projectConfiguration.js` already records which roles Sales
may never change; enforcing that at the transport layer is the RBAC phase.
