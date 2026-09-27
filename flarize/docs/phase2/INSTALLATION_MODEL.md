# INSTALLATION MODEL

**Phase 2A final** · §6 · owner: **PROJECT HEAD**

---

## Rates live on the Project Head rate card

Installation rates are `INSTALLATION_RATE` records keyed `<kW>kW/<TYPE>`,
versioned and audited. Adding 12, 15 or 20 kW is a configuration change, not a
code change. The engine records the rate version it used on the cost trace.

## Configuration

```
{ systemSizeKw, installationType, unit, rate, effectiveFrom, version }
```

`unit` must be explicitly `PER_PROJECT` or `PER_KW`. A record without a valid
unit fails — the unit is never assumed.

```
PER_PROJECT   installationCost = rate
PER_KW        installationCost = rate × systemSizeKw
```

`installationType` covers the configured types (`FLAT`, `SHEET`, `ELEVATED`) and
any future type. Adding one is configuration, not code.

---

## Exact match only

The lookup requires an **exact** `systemSizeKw` + `installationType` match.

**The nearest system size is never used.** A 4 kW project with 3 kW and 5 kW
configured returns `INSTALLATION_COST_NOT_CONFIGURED` and blocks the commercial
calculation. Silently pricing a 4 kW install at the 3 kW rate would understate
cost on every off-matrix project.

The legacy per-kW fallback (`catalog.costs.installRate = 3000/kW`) has been
**removed** — decision C75. A test asserts the identifier no longer exists in
the engine.

---

## Unit evidence

The configured matrix is `PER_PROJECT`. That is established by the source, not
assumed: `src/App.jsx:2113` uses the matrix value directly without multiplying by
kW, and 3 kW FLAT = 15,000 against 10 kW FLAT = 42,000 is not a common per-kW
rate. Business confirmation remains open item **P2-H**.

---

## Rates carried forward

| kW | FLAT | SHEET | ELEVATED |
|---|---|---|---|
| 3 | 15,000 | 18,000 | 22,000 |
| 5 | 22,000 | 26,000 | 32,000 |
| 6 | 28,000 | 33,000 | 40,000 |
| 8 | 35,000 | 42,000 | 50,000 |
| 10 | 42,000 | 50,000 | 60,000 |

Source: `catalog.installationMatrix`. The legacy `5sp` / `5tp` split collapses to
5 kW because both carried identical rates.
