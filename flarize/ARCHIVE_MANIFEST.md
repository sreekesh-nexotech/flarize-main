# ARCHIVE MANIFEST — flarize-src.zip

**Created:** 2026-08-16. Snapshot of the working tree exactly as it stands.
**Purpose:** hand the current source state to a fresh execution chat without losing context.

## VERIFIED STATE AT ARCHIVE TIME

```
tests                290/290 pass   (node --test tests/*.test.mjs)
golden baseline v3   b215b2fdbaf706eb54ded498a1d36faaeed9d82e66963a174c423edbae10adc1   54 cells, 0 changed
src/App.jsx          97dfe333b4f81bae2d861f11745de33cf22ea9b733404d651ef8ebf49dbd84c3
data/catalog.json    8147aca94e79e4f62081b1b3dac2021c1d36fb1117237b7afeacb53c033e3345
build               clean — bundle index-vy7RQ7xF.js (382.17 kB)
```

## PHASE STATE

- Phase 2 commercial engine — COMPLETE (cost, pricing, GST, rate card, append-only history)
- Phase 3 PART C/D/E/G Project Head Workspace — COMPLETE
- Phase 2 engineering blockers — REMAIN OPEN (C10, C11, battery data, package authority)
- **Next task: Phase 3 PART F — Procurement UI** (see `claude/NEXT_TASK.md`)
- P3-D per-user identity — UNRESOLVED (`identityModel: OPERATOR_ASSERTED_ROLE`)

## ⚠ TWO STRAY LEGACY FILES AT THE ARCHIVE ROOT

`./App.jsx` and `./catalog.json` sit at the repository root and are **NOT** the
authoritative files. They are stale copies with different hashes:

```
./App.jsx          2e2b6630…    STALE — do not edit
./catalog.json     21e060ba…    STALE — do not edit
src/App.jsx        97dfe333…    AUTHORITATIVE
data/catalog.json  8147aca9…    AUTHORITATIVE
```

They were preserved rather than deleted (nothing is deleted in this project), but
**every hash check, every test and every baseline run uses `src/` and `data/`.**

## LAYOUT

```
src/            React app (App.jsx untouched since Phase 1E) + src/lib/ engines
data/           catalog, battery master, package registry, cost config, runtime state
tests/          11 suites, 290 tests
docs/           DECISION_LOG.md (authoritative) + phase1/2/3 models + baselines/
claude/         PROJECT_STATE.md · PHASE_PLAN.md · NEXT_TASK.md
public/         workspace.html (Project Head Workspace UI)
scripts/        registry + validation helpers
server.js       zero-dependency HTTP server
server-workspace.js   /api/workspace/* transport
```

## TO RESUME

```bash
npm install
node --test tests/*.test.mjs          # expect 290/290
npx vite build                        # expect index-vy7RQ7xF.js
ADMIN_PASSWORD=<value> node server.js  # never a default, never logged
# app:       http://localhost:4800/
# workspace: http://localhost:4800/workspace.html
```

Baseline re-capture uses the Playwright harness outside this tree (`baseline2.mjs`
then `upg.mjs`, no overlap), and the contract hash is computed timestamp-free over
cell id + bomLineCount + bomLines + totals (excluding `_rawFigures`).

Read `claude/PROJECT_STATE.md` first, then `claude/NEXT_TASK.md`.
`docs/DECISION_LOG.md` overrides everything else.

## RE-VERIFICATION — 2026-08-16, repack session

Independently re-run in a clean container before this archive was written. No
application code, test, catalog, baseline or `App.jsx` was modified.

```
node --test tests/*.test.mjs   →  290 pass / 0 fail   (11 suites)
npx vite build                 →  dist/assets/index-vy7RQ7xF.js   382.17 kB   ✓ name unchanged
sha256 src/App.jsx             →  97dfe333b4f81bae2d861f11745de33cf22ea9b733404d651ef8ebf49dbd84c3  ✓
sha256 data/catalog.json       →  8147aca94e79e4f62081b1b3dac2021c1d36fb1117237b7afeacb53c033e3345  ✓
numeric-contract-v3            →  b215b2fdbaf706eb54ded498a1d36faaeed9d82e66963a174c423edbae10adc1  ✓ (docs/baselines/CONTRACT_HASH_v3.txt)
sha256 golden-baseline-v3.json →  7afcde416f23d25752406485d2c331c91e1d66a67686884c19ac701327f494ce  ✓
stray root ./App.jsx           →  2e2b6630…   STALE, preserved, not authoritative
stray root ./catalog.json      →  21e060ba…   STALE, preserved, not authoritative
```

`dist/` is NOT in this archive — it is reproducible from source and the bundle
name was verified above. `node_modules/` and `.git/` excluded.

Next task remains **Phase 3 PART F — Procurement UI**. Not started.
