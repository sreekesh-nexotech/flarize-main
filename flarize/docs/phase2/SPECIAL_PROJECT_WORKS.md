# SPECIAL PROJECT WORKS

**Phase 2A final** · §9 · owner: **PROJECT HEAD**

---

## Explicit, optional, never automatic

```
CIVIL_WORK · TRENCHING · SCAFFOLDING · CRANE · ROOF_REINFORCEMENT ·
DISMANTLING · WATERPROOFING · CABLE_ROUTE · DIFFICULT_ACCESS ·
PANEL_MODIFICATION · OTHER
```

The Project Head adds a work when the project needs it. The system never adds
one, never infers one from the roof type, the distance or the system size.

If no work is added:

```
SPECIAL_PROJECT_WORKS = 0
```

That zero is a genuine zero — nothing was required — and is distinct from the
`null` that a missing configuration produces elsewhere.

---

## Each work is its own visible line

```
{ workType, amount, reason, addedBy, at }
```

Every work appears as its own line with its own amount and reason, traceable to
the person who added it. **Special works are never hidden inside
miscellaneous** — that is exactly the pattern this head exists to prevent, and
the two are separate cost heads with separate owners.

---

## No rate is invented

A work added without an amount returns `SPECIAL_WORK_INVALID` and blocks. There
is no rate card, no per-square-foot assumption and no default crane charge. The
Project Head supplies the actual amount for the actual project.

---

## Traceability

```
workType · amount · extendedCost · reason · addedBy · at · status
```

Sorted by `workType` so the output is deterministic regardless of the order in
which the works were added.
