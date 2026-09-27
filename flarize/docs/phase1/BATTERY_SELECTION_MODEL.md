# BATTERY SELECTION MODEL

**Phase 1D** · Status: implemented · Owner: Engineering
Baseline gate: `b215b2fd…` — **unchanged** by this phase.

---

## 1. Why this exists

Before Phase 1D the battery was effectively bound to one product. `resolveBattery`
carried a hardcoded table (`BATTERY_PROTECTION_BY_COMPONENT`) that named `bt1`,
`bt2`, `bt3`, `bt4` literally, and the protection rule was attached to the
component id rather than to any recorded electrical fact.

That is not a platform. It is a calculator with one supplier baked in.

Phase 1D replaces it with a **data-driven selection model**:

```
PROCUREMENT CATALOG
        ↓        Procurement adds a battery. It is NOT selectable.
Engineering Review
        ↓
PENDING_ENGINEERING_APPROVAL
        ↓        Engineering records the electrical facts and approves.
APPROVED
        ↓        Project Head may now select it for a project.
Project Head selection
        ↓
Engineering Validation  (10 dimensions, BATTERY_COMPATIBILITY.md)
        ↓
VALID / WARNING / BLOCKED
```

**No automatic substitution exists anywhere in this path.** If the selected
battery is incompatible or under-specified, the configuration is BLOCKED and the
battery that was selected is still named in the block. It is never quietly
swapped for a different product.

---

## 2. Ownership

| Concern | Owner | Enforced by |
|---|---|---|
| Which batteries exist, price, supplier, availability | **Procurement** | `procurementBoundary.js` |
| Electrical specification, compatibility, approval | **Engineering** | `procurementBoundary.js` |
| Which approved battery a *project* uses | **Project Head** | `projectConfiguration.js` |
| Viewing the resulting BOM | **Sales** | `SALES_IMMUTABLE_ROLES` |

`BATTERY` is in `SALES_IMMUTABLE_ROLES`. `canRoleBeChangedBy('BATTERY','SALES')`
returns `false` and `assertCanChange` throws. Sales cannot change the engineering
battery selection at any level of the model.

---

## 3. Data model

`src/lib/batteryMaster.js` defines the 34 master-data fields from the brief plus
the two lifecycle statuses.

```
ENGINEERING_STATUS   DRAFT · PENDING_ENGINEERING_APPROVAL · APPROVED · REJECTED · WITHDRAWN
PROCUREMENT_STATUS   ACTIVE · INACTIVE · DISCONTINUED · PENDING_SOURCING
```

`toBatteryMaster(catalogItem, overlay)` projects a catalog row plus the
`data/battery-master.json` overlay onto that shape.

**Nothing is fabricated.** Any field the source does not contain resolves to
`null` — never to a guess, never inferred from the display name, never derived
from Ah. Each record also carries:

- `missingFields` — every null field
- `missingForValidation` — nulls that block automatic validation
- `missingForSafeIssue` — nulls that block safe issue of the BOM (`integratedProtection`)

A record with no overlay defaults to `PENDING_ENGINEERING_APPROVAL`. That is the
mechanism behind test 1: **a battery Procurement adds is not selectable until
Engineering approves it**, and it requires no extra step from Procurement to be
safe by default.

---

## 4. Selection order

`resolveBattery(profile, catalog, ctx)` resolves identity in this order:

1. `ctx.projectOverride.componentId` — the Project Head selection (`PROJECT_HEAD_OVERRIDE`)
2. `profile.batteryComponentId` — the package default (`PACKAGE_DEFAULT`)
3. the tier-scoped **engineering-approved** shortlist (`PACKAGE_DEFAULT`, or `FALLBACK` if ambiguous)

Quantity is decided **only** by the package profile (`batteryQuantity`), and only
for `sysType === 'hybrid'`. A non-hybrid profile declaring a battery raises
`BATTERY_ON_NON_HYBRID` and the battery is ignored.

If a project override names a battery that is not selectable, the resolver
returns that component with `source: 'projectOverride(blocked)'` and issue
`BATTERY_OVERRIDE_NOT_SELECTABLE`. It does **not** fall through to another
battery. Blocking loudly is the intended behaviour.

---

## 5. Traceability (§8)

Every battery BOM line carries identity and provenance, never a display name:

```js
{
  componentId:           'bt1',
  selectionMethod:       'PACKAGE_DEFAULT' | 'PROJECT_HEAD_OVERRIDE' | 'USER_SELECTION' | 'FALLBACK',
  approvalStatus:        'APPROVED',
  selectedBy:            'ph@flarize' | null,
  selectionTimestamp:    ISO-8601 | null,
  batteryProtectionMode: 'EXTERNAL_REQUIRED',
  batteryProtectionRating: null      // null means NOT RECORDED
}
```

If the slot-level resolution and `resolveBattery` ever name different
components, the engine emits a `BATTERY_IDENTITY_DIVERGENCE` resolution warning
rather than silently accepting one of them.

---

## 6. Backward compatibility

Callers that do not pass `batteryMaster` (older tests, offline scripts) keep the
legacy `BATTERY_PROTECTION_BY_COMPONENT` behaviour exactly. The legacy table is
retained for that reason only and is marked SUPERSEDED. **Do not add entries to
it — add master-data records instead.**

Baseline effect of the whole phase: **0 of 54 cells changed.**
Under the current catalog the engineering gate removes only components that were
already never chosen (`ba_3b51aef23f0b`, `bt3`, `bt4` in the ambiguous base tier),
so the resolved identity and every number are identical.

---

## 7. Not built in this phase

The Project Head selection **UI** is deliberately not built. `App.jsx` holds
`projectBatteryOverride` state (default `null`) which threads through to
`resolveBattery`; the control that sets it belongs to the Project workspace,
which is a later phase. The model is complete and tested without it.

---

## 8. Phase 1D review correction — approval is not implied by resolution

`bt1` was initially recorded APPROVED. That was inconsistent: `bt1` has
`externalProtectionRequired: true` with `protectionRating: null`, so BC-G is
INDETERMINATE and safety-critical, and the compatibility verdict is BLOCKED. An
APPROVED status must never imply a battery is safe to issue.

`bt1` is now `PENDING_ENGINEERING_APPROVAL`.

This forced a distinction the model needed anyway. **Two gates, not one:**

| gate | function | used for | on PENDING |
|---|---|---|---|
| free selection | `isSelectable` | Project Head shortlist, new selections | not offered |
| resolvability | `isPermanentlyUnselectable` | what a package may still resolve to | **retained** |

A PENDING battery is **retained in the BOM and the configuration is BLOCKED**.
It is not deleted. Deleting it would emit a hybrid system with no battery —
defect D1, which Phase 1C fixed — and would be a silent, unsafe change.

Approval also does **not** reorder identity. Tier candidates are filtered by
resolvability only; approving some other battery can never change which battery a
package resolves to. Approval is asserted separately, after resolution:

```
ENG-BAT-009  BLOCKED  selected battery is not engineering-approved
ENG-BAT-010  BLOCKED  data required to issue the BOM safely is not recorded
```

Result: **4 hybrid Value packages moved WARNING → BLOCKED. No BOM line, quantity
or price changed** — contract hash still `b215b2fd…`. The BLOCKED state is the
intended safety behaviour while engineering data is incomplete, not a defect.
