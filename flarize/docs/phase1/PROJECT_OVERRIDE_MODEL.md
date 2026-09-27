# PACKAGE DEFAULT vs PROJECT OVERRIDE

**Phase 1D §7** · `src/lib/projectConfiguration.js`

---

## The distinction

| | PACKAGE | PROJECT |
|---|---|---|
| what it is | the default approved engineering configuration | the configuration actually selected for one project |
| scope | global, shared by every project | local to one project |
| who changes it | Engineering / Admin, as a catalog decision | Project Head, per project |
| stored as | `packageProfiles` + package component registry | `projectConfiguration.overrides` |

```
Package: 5 kW Hybrid Value, default battery = bt1

Project A: Project Head selects bt3   -> Project A uses bt3
Project B: untouched                  -> Project B still starts from bt1
Package:                              -> still bt1
```

---

## Enforcement

`createProjectConfiguration({ projectId, packageId, packageDefaults })`
**deep-freezes** `packageDefaults`. `applyProjectOverride` returns a **new**
configuration object and writes only into `overrides`. There is no code path in
which a project selection mutates the package.

```js
const cfg   = createProjectConfiguration({ projectId:'PRJ-A', packageId:'hybrid_value',
                                           packageDefaults:{ BATTERY:'bt1' } })
const after = applyProjectOverride(cfg, { role:'BATTERY', componentId:'bt3',
                                          selectedBy:'ph@flarize' })

resolveSelection(after, 'BATTERY')   // -> bt3, source PROJECT
after.packageDefaults.BATTERY        // -> bt1
cfg.packageDefaults.BATTERY          // -> bt1
```

Test 9 asserts all three, plus that a fresh Project B still resolves `bt1` with
`selectionMethod: PACKAGE_DEFAULT`, and that the caller's own defaults object was
not mutated.

---

## Selection methods

```
PACKAGE_DEFAULT           the package decided
PROJECT_HEAD_OVERRIDE     a Project Head decided, for this project only
ENGINEER_PROPOSAL         proposed, not yet approved
PROCUREMENT_SUBSTITUTION  reserved — NOT used automatically anywhere
FALLBACK                  the engine had to guess; visible, never silent
```

`PROCUREMENT_SUBSTITUTION` exists as a vocabulary entry for a future *manual,
recorded* substitution. Automatic substitution is not implemented and must not be.

---

## Who may change what

`ROLE_OWNER` records the owning role. `SALES_IMMUTABLE_ROLES` lists the
engineering-critical roles Sales may never change:

```
BATTERY · BATTERY_PROTECTION · BATTERY_CABLE · MICRO_INVERTER
ENERGY_SYSTEM_CONTROLLER · STRUCTURE · AC_ISOLATOR · CHANGEOVER
```

`canRoleBeChangedBy(role, actorRole)` gates it; `assertCanChange` throws with the
owning role named. Sales retains the ability to move within approved alternates
for commercial roles (`PANEL`, `INVERTER`, `ACDB`, `DCDB`) — that is a pricing
choice, not an engineering one.

**RBAC itself is not built in this phase.** These are the rules the future RBAC
layer must enforce, expressed as testable functions rather than UI.

---

## Every selection is recorded

`resolveSelection` never returns a bare id. It returns
`{ role, componentId, selectionMethod, selectedBy, at, source }` where `source`
is `PROJECT` or `PACKAGE`, so any BOM line can be traced to the decision and the
person behind it.
