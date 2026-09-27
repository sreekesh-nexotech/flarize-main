# FLARIZE — UAT HANDOFF MANIFEST

**Handoff date:** 2026-09-05
**Build:** vite v5.4.21 → `dist/`
**Status:** UAT-ready with restricted scope. **Not production-ready.** See `KNOWN_BLOCKERS.md`.

---

## What this ZIP is

The current validated build **exactly as it stands** — no code or data modified for packaging. Every SHA below matches the state at the end of the last UAT re-test.

## What this ZIP is NOT

- Not a production release.
- Not a fix for the engineering blockers listed in `KNOWN_BLOCKERS.md`.
- Not a substitute for the Engineering Head, Admin, Procurement Head, or Business decisions still outstanding.

## Package contents (root layout)

```
src/                       — server + client library source
server*.js                 — HTTP transport layer
data/                      — configuration + master data + seed procurement + empty policy/branding
assets/approved-template/  — locked v1 quotation artwork (do not modify)
tests/                     — 88 test files
docs/audit/                — every phase closure report (A-J + P0 fix)
dist/                      — production build output (vite build)
KNOWN_BLOCKERS.md          — authoritative list of what still requires human decision
UAT_HANDOFF_MANIFEST.md    — this file
package.json               — start / build / test / server scripts
server.js                  — entry (requires ADMIN_PASSWORD env)
```

## Key file SHA256 fingerprints (frozen at handoff)

**Source (validated with 2394/2442 tests + live UAT):**
```
0ffb5e3f0110b14a534a8971bf985b17010dd88e9f926d58dc5422c61eb5e0b4  src/lib/salesOrchestrator.js
7f25765f2371277b6e66336154e9055ea80db993ec47bab984467e3cfe3a138a  src/lib/quotationWorkspace.js
82e304aa4c56b4fe99af56cd454ec61d9c84b388a5eabd06397e58ca5894f14a  src/lib/commercialFreeze.js
3345920ceba6eefe95fedf04a83f2ada00e3d333c393454c665487ea3768e5f1  src/lib/quotationBranding.js
909dbadf95007a34d2f858b508d7f50ebbc9f0cc9b70ea6a351c570fe074e6a6  src/lib/quotationPolicy.js
cf6aa2b30485ee035ee2817348b4e44e817ff84ab76b3ca27050232d1d645c42  src/lib/approvedTemplate.js
fb596a6aa329d8c80127fcf2edfd5b3137f14b734d2fb4628800a4f8434577a8  server-quotation.js
efac019b4c0142a809f11f8a42d9951eed77fc151930f21db8d49f89b5d37b0b  server-sales-orchestrator.js
```

**Locked v1 artwork (must remain byte-identical):**
```
fbb4e5e206b867b0391c6c0f696bf040c68abb7678cb626a317ad2923582d1d1  assets/approved-template/Flarize_Solar_Quotation.v1.html
b4f5d119247cf463da84762a89d3d7304cc20a4d7958a7c7dfd8b89309204731  assets/approved-template/Flarize_Solar_Quotation.v1.meta.json
```

**Data (empty starters, seed-only procurement, historical state):**
```
ff71e6f0a1f564c5aa13734f94ff92130f5f9cb4a33c59e59279e0d069ba2ae4  data/quotation-state.json           (byte-identical since Phase G)
aaa2847b0a9b7df358976598dd8db4cad1ddcf9ddfa411923329d2645f5771ad  data/quotation-policy.json          (schema v2 — Project Head effective-period policies; currently empty)
3331e9d5b3c05cdeff2cdd7debb79e312807e97a8a7c9a30dfb0854b433ca7b0  data/quotation-branding-state.json  (schema v2 — multi-account bank/UPI + single-slot signature/seal; currently empty)
4e46c60925078c3fa5c21e2c5ebfe9cf786e4a599679e236a43dc4e3ea41295d  data/procurement-state.json         (5 seed batches, no production batch — assertProductionProcurementAvailable will refuse)
896aa0f5b506c7d3c2a0a85076101d68a220e33d1a499a4e80a5a637c55bef70  data/battery-master.json            (protection fields NULL for bt1/bt3/bt4 — see KNOWN_BLOCKERS.md §1)
```

**Production build output (`npm run build`):**
```
4d942e8bd25eecabe9f01c75db6c555f47618754f701ff2b5addbc4a5cb72447  dist/index.html
b277dc74fc0ca04fb1cc478ba7346dcc4d7a5424e93501e9c2dfa138eea186b9  dist/assets/index-DUcRuSkJ.js
97c261eb06031e6fabe17b321af9203cff98bd41fd6e66ef7a81996fc59082c4  dist/assets/index-DYZaFO_n.css
```

## How to start the server (UAT)

```
ADMIN_PASSWORD=<value>  PORT=<port>  PRODUCTION_MODE=false  npm start
```

- `ADMIN_PASSWORD` is **required** — server refuses to start without it.
- `PORT` defaults to 4800.
- `PRODUCTION_MODE=false` (default) allows DEMO branding for controlled UAT.
- `PRODUCTION_MODE=true` refuses issuance when any resolved branding kind is `isDemo:true` (error code: `DEMO_BRANDING_BLOCKED_IN_PRODUCTION`).

## Test / build reference

- `npm test` — runs 88 test suites (`node --test tests/*.test.mjs`).
- Latest baseline: **2442 tests / 2394 pass / 14 pre-existing fail / 34 pre-existing cancelled**. 0 new failures during this handoff.
- `npm run build` — production Vite build. Succeeds cleanly.

## Phase-by-phase closure reports (in `docs/audit/`)

- `PHASE_B_CODE_SIDE_REPORT_2026_09_05.md`
- `PHASE_C_COMPLETE_REPORT_2026_09_05.md`
- `PHASE_D_COMPLETE_REPORT_2026_09_05.md`
- `PHASE_E_COMPLETE_REPORT_2026_09_05.md`
- `PHASE_F_COMPLETE_REPORT_2026_09_05.md`
- `PHASE_G_CLOSURE_REPORT_2026_09_05.md`
- `PHASE_H_CLOSURE_REPORT_2026_09_05.md`
- Plus every earlier phase, blueprint, and delta report in the same directory.

## What UAT can exercise today

With DEMO fixtures + `PRODUCTION_MODE=false`:
- ongrid Base 5sp / 5tp — full quotation issuance with populated snapshot.
- ongrid Value 5sp — full quotation issuance.
- hybrid Base battery=2 (Enphase `bt2` path) — full quotation issuance.
- Historical immutability under live master-data mutation.
- DEMO production guard refusal in `PRODUCTION_MODE=true`.
- RBAC boundaries at every editor role gate.

## What UAT CANNOT exercise today (engineering-blocked)

- ongrid Premium — Enphase-side engineering gap.
- hybrid Base / Value / Premium with `bt1` / `bt3` / `bt4` — D12-E and its sibling gaps.
- Any configuration referencing `ba_3b51aef23f0b` — lifecycle inconsistency.

See `KNOWN_BLOCKERS.md` for the exact decisions required, per battery, in the format the codebase expects.

---

**Handoff issued as-is. No production claim. No engineering value invented. No code or data modified for packaging.**
