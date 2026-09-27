# CEO Critique & Final-Version Plan — 2026-09-13

Tested in a clean cloud copy of `flarize-main` (master, 13 Sep): full test suite, live server, headless-Chromium PDF render of quotation `GR-20260913-9720` (3 kW on-grid Elite), and a code audit of every area you raised. Findings first, then what to build, then what to cut.

## 1. What is actually broken (verified, not guessed)

| # | Symptom you saw | Real cause | Severity |
|---|---|---|---|
| B1 | Packages / Approvals show "Unauthorized" while nav still says "Administrator ADMIN" | Sessions live in a `Map` in `server-users.js`. Every server restart (and every Render deploy) wipes them. Nav renders name/role from `sessionStorage` without checking the token, so the UI looks logged in while every API call 401s. No page handles 401 → shows raw error instead of sending you to login. | **P0** — will hit every user on every deploy |
| B2 | Quotation preview "looks wrong, PDF is right" | Preview and PDF are the *same* renderer (`public/lib/quotationDocument.js`). Server serves `/lib/*.js` with `Cache-Control: max-age=31536000` (1 year) and no version hash. Your browser kept the 8-Sep renderer (the copy in `quotationDocument_BACKUP.js.js` — "Our quality standards", "long-term clean energy partner"); headless Chromium fetched the new one. Every JS deploy is invisible to Sales until a hard refresh. | **P0** |
| B3 | Server PDF silently fails with 501 after 60 s | `waitForRenderReady()` in `quotation-document.html` never resolves when an `<img>` has already failed (`complete=true, naturalWidth=0`) before the listener attaches. Any missing CMS asset (deleted signature/seal, 404 photo) kills server PDF for that quotation. Reproduced; one-line fix. | **P0** |
| B4 | PDF render depends on `fonts.googleapis.com` | Poppins is already vendored as woff2; the `<link>` to Google Fonts is dead weight and a timeout risk on Render. | P1 |
| B5 | Test suite reports 19 failures + 34 cancelled | 34 need a live server and pass (34/34) when run against one. Of the 19: ~12 assert against **live data files** (`packages.proposed.json` "still 288 PROPOSED", `quotation-policy.json` "NOT_CONFIGURED", signature slots "null", bank fields "null") — they fail because you configured the system, not because code broke. `security-acceptance` also *writes test users into the real `data/users.json`*. | P1 — tests must not be coupled to production data |
| B6 | "3-phase hides 3 kW" (your spec) | Not implemented. `renderSizeOptions()` in `sales.html` never filters by phase. | P2 |

## 2. Your understanding of "kW Packs → Review & approve" — corrected

What you assumed: Admin sees each kW pack's BOM spec, edits per item, sends back to Project Head, PH checks and resubmits, Admin approves.

What the code does:
- One atomic config (all packs together), one draft version. Admin **can** edit the draft directly and self-approve ("Save & publish now"). PH edits and submits; Admin approves or rejects the **whole** draft with one free-text reason (browser `prompt()`).
- The Review tab shows changed *section names*, a change log, and the publish report — **not the BOM**. To see a pack's BOM you must run the single-combo preview at the bottom, one pack at a time.
- There is a second, older per-package registry (Packages / Approvals pages, 583 packages, DRAFT→SUBMITTED→APPROVED each). Since the kW Packs publish step now writes into it automatically as a machine actor, those two pages are effectively dead for humans, and Project Head cannot even navigate to them.

So: no per-item send-back exists, and the reviewer is approving blind. This is the biggest *workflow* gap.

## 3. Editable content — where each section really lives

| Section | Today | Editable by |
|---|---|---|
| Terms & Conditions (pages 10–11) | Pixels in `q-page-10.jpg` / `q-page-11.jpg` | Nobody |
| Booking→savings timeline (p9) | Pixels in `q-page-09.jpg` | Nobody |
| What we handle / customer scope (p9) | Pixels in `q-page-09.jpg` | Nobody |
| Appliance table + "13.1 units" (p3) | Pixels in `q-page-03.jpg` (typo "uniits" preserved on purpose) | Nobody |
| Required documents (p8) | Hardcoded array; a `payload.requiredDocuments` hook exists but nothing feeds it | Nobody |
| Extra structure cost | Not rendered at all | — |
| Testimonials (p6) | `data/quotation-testimonials.json`, capped at 3, edited on `quotation-content.html` | **ADMIN only** (PUT is admin-only; PH has no nav link) |
| Page 2 offer | CMS campaign with status ACTIVE → page 2 rendered; otherwise page 2 omitted. Already "only for offer". | ADMIN via CMS → Campaigns |
| Language | `quotationLanguage` field exists server-side, defaults `'en'`, **no UI sets it**; renderer has no en/ml switch. Malayalam in the PDF today = one campaign headline. | — |

The "CMS" (`cms.html`, 984 lines, absolute-positioned block designer, 1 321 pages / 331 campaigns / 668 assets = 2.1 MB of state) is **never rendered into the quotation** except the active campaign. It substitutes 33 scalar fields (name, kW, price…) into a designer canvas. It cannot hold a list of clauses, steps or appliance rows. You are right that a normal person cannot use it — and even if they could, it would change nothing in the PDF.

## 4. CEO verdict

The engineering core (BOM → validation → cost → pricing → snapshot → PDF) is solid: 2 384 unit tests pass, all 34 security/RBAC tests pass on a clean server, the generated 12-page PDF is A4-correct and close to the designer's artwork. That part is done.

What is not done is the *operating surface*: sessions that die on deploy, a 1-year JS cache, a PDF gate that hangs on one broken image, a review screen that hides the thing being reviewed, and every customer-facing text block locked inside JPEGs. The CMS and the second package registry are over-built for a 5-person team and add maintenance without adding control. Malayalam is a data problem, not a translation problem: the text-heavy pages are images.

Ship order below is by "what stops a Sales person on Monday", not by what is interesting.

## 5. Build plan (what I will implement after your OK)

### P0 — must ship before UAT (≈1 day)
1. **Stateless sessions.** HMAC-signed tokens (`SESSION_SECRET` env; auto-generated into `data/.session-secret` if absent) carrying userId/role/exp + per-user `sessionVersion` so password reset still logs out. Survives restarts/deploys. No new dependency.
2. **401 handling.** One global fetch wrapper in `nav.js`: any `/api/` 401 → clear session → `/login.html?next=…`. Nav validates token on load.
3. **Cache headers.** `.html/.js/.css` → `no-cache, must-revalidate` + ETag; `/assets/**` (images, fonts) keep 1 year. Add `?v=<git-sha>` to `<script src>` tags in the 20 public pages for belt-and-braces.
4. **PDF ready gate.** `if (img.complete) resolve()`; drop the Google Fonts `<link>`; PDF route logs the page error instead of a generic 501.
5. **Hand-picked band whitespace** (p4): stretch gallery rows / band padding so the band sits on the footer like the artwork.

### P1 — the content system (≈3–4 days) — this is the real "final version"
6. **One structured content store** `data/quotation-content.json` with **both `en` and `ml` fields** for: T&C clauses (ordered list), timeline steps (day-range + title + body), "we handle" list, "you need to do" list, required documents list, KSEB refund note, extra-structure-cost line, default appliance rows per kW band (3/5/8/10), testimonials (max 3). Versioned like pack-config (draft → publish) so an issued quotation snapshots the content version it used.
7. **Render pages 3 (table), 9, 10, 11 as HTML** from that store instead of JPEGs, in the selected language, using the vendored Noto Sans Malayalam. Artwork stays for backgrounds/headers only. This is what makes Malayalam and editing possible at all.
8. **Fit guard.** Per-field limits derived from the A4 layout (e.g. each T&C clause ≤ 420 chars, ≤ 19 clauses across 2 pages; each timeline step title ≤ 40 chars / body ≤ 160; scope bullets ≤ 8 per column, ≤ 110 chars each; appliance rows ≤ 8). Server rejects over-limit saves; editor shows live "fits / X chars over" and a preview button that renders the page.
9. **Editor page** — extend `quotation-content.html` (already has testimonials) with tabs per section, EN/ML side by side. **PROJECT_HEAD and ADMIN** can edit and publish (today PUT is admin-only). Add it to PH nav.
10. **Language selector** in Sales wizard step 1 (English / മലയാളം) → `quotationLanguage` on the issued quotation → renderer picks `en`/`ml` strings for every overlay/HTML text. Pages that are still artwork-with-overlay (1, 5, 7, 8, 12) get their fixed labels from the same store.
11. **Appliance usage in the wizard.** Step 2 gains a compact appliance list pre-filled from the PH defaults for the recommended kW; Sales toggles EV charger / AC / pump and quantities. Total units/day is *computed* (no more hardcoded 13.1) and shown against the kW's daily generation (from `energy-config.json`, editable by PH on the Costs tab). Page 3 table renders those rows.

### P2 — workflow & hygiene (≈2 days)
12. **Review & approve tab shows the BOM.** For each systemType × kW × tier: draft vs approved component diff (from the same projection the registry uses), inline. Admin gets "Request changes" with a comment per pack section (stored on the draft change log, visible to PH) — instead of a browser `prompt()`. No per-item state machine; one lifecycle stays.
13. **3-phase hides 3 kW** in step 3. **Accounts version** PDF (`?pages=accounts` → pages 1, 5, 7, 8 only) as your spec asks.
14. **Tests**: point data-coupled tests at fixtures (`DATA_DIR` env, like `CMS_STATE_FILE`), stop `security-acceptance` writing into live `users.json`, delete the 12 stale "data is still unconfigured" assertions.

## 6. What to cut (with your OK)

- **CMS page designer** — hide the Pages/Assets tabs; keep only Campaigns (page 2 depends on it). Leave the 2.1 MB state file but stop loading 1 321 pages on boot. Delete later once the content store is live.
- **Packages / Approvals / BOM Configuration (registry) pages** — remove from nav; keep the routes and data (Sales reads the registry). Keep one "Registry (read-only)" link under Advanced for repair.
- **Legacy React app** (`App.jsx` 368 KB ×2, `vite build` in the Dockerfile, `index.html`) — nothing links to it; `dist/` isn't even in the repo. Drop the build step → faster Render deploys, smaller image.
- **Dead files**: `quotationDocument_BACKUP.js.js`, `quotationDocument.js.bak`, `public/lib/sales-wizard.js` + `sales-wizard-errors.js` (no page loads them), `renderPage6Savings/8Mounting/10Faq/13Investment/InclusionPage` exports (not in the 12-page pipeline).

## 7. Open questions for you

1. Malayalam: OK to rebuild pages 3-table, 9, 10, 11 as HTML (so both languages come from one editable store), rather than shipping a second set of Malayalam JPEGs? (JPEGs = not editable, and every T&C change needs a designer again.)
2. Testimonials: you said "only three, added by admin or project head" — confirm PH gets edit rights (today admin-only). Location matching by pincode/district: needed now, or free-text "place" is enough?
3. Who owns `energy-config.dailyGenPerKw` (the "3 kW → 12 units" figure): PH (proposed) or Admin?
4. Accounts version page set: 1, 5 (price), 7 (tech spec), 8 (bank) — your spec said "1, 4, 7, 8" with the old numbering; confirm.
