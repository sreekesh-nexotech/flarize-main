# Users / RBAC / Sales Head / Quotation History — Architecture Audit

**Date:** 2026-08-28
**Type:** READ-ONLY AUDIT — zero files modified
**Scope:** Determine whether existing architecture supports admin user management, Sales Head team-level visibility, individual sales user quotation isolation, and future roles (SALES_HEAD, SALES_CRS, FIELD_SALES)

---

## 1. Current Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HTTP LAYER                                   │
│                                                                     │
│  server.js                                                          │
│  ├── POST /api/auth ─── ADMIN_PASSWORD (env var, single credential)│
│  │   └── returns Bearer token (session Map, 8hr TTL)               │
│  │                                                                  │
│  ├── server-workspace.js   (/api/workspace/*)                      │
│  ├── server-company.js     (/api/admin/company-profile,            │
│  │                          /api/sales/company-profile)            │
│  ├── server-sales.js       (/api/sales/*)                          │
│  ├── server-quotation.js   (/api/quotation/*)                     │
│  ├── server-procurement.js (/api/procurement/*)                    │
│  └── server-cms.js         (/api/cms/*)                            │
│                                                                     │
│  EVERY route: guard() → isAdmin(req) → validSession(Bearer token)  │
│  Identity: x-actor-role + x-actor-user HEADERS (operator-asserted) │
│  NO per-user credential. NO user store. NO login-per-user.         │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     SERVICE LAYER (ESM)                              │
│                                                                     │
│  rbac.js                                                            │
│  ├── ROLE: ADMIN, PROJECT_HEAD, ENGINEERING, PROCUREMENT,          │
│  │         SALES, SALES_HEAD                                       │
│  ├── 22 CAPABILITY constants                                       │
│  ├── CAPABILITY_MATRIX: frozen, explicit per-role grants           │
│  ├── can(role, capability) → boolean                               │
│  ├── assertCan(actor, capability) → throws RbacError               │
│  │   requires actor = { userId, role }                             │
│  └── No data-driven grants. Matrix is code.                        │
│                                                                     │
│  quotationWorkspace.js                                              │
│  ├── createDraft(): createdBy = actor.userId                       │
│  ├── setQuotationFields(): updatedBy = actor.userId                │
│  ├── issueQuotation(): issuedBy = actor.userId, issuedByRole       │
│  ├── createRevision(): revisedBy = actor.userId                    │
│  ├── DRAFT_FIELDS includes: proposalBy, salespersonId              │
│  ├── listQuotations(): returns ALL quotations (no user filter)     │
│  ├── getVersion(): redacts internal cost for non-COST_VIEW         │
│  ├── IDENTITY_MODEL = 'OPERATOR_ASSERTED_ROLE'                    │
│  └── P3-D: explicitly unresolved                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                     │
│                                                                     │
│  data/quotation-state.json                                          │
│  ├── quotations Map: {quotationId → record}                       │
│  │   record.createdBy = actor.userId (string, operator-asserted)   │
│  │   record.proposalBy = (string, set by UI)                      │
│  │   record.salespersonId = (string, set by UI)                   │
│  ├── documents Map: {quotationId → [frozen versions]}             │
│  │   document.issuedBy, document.issuedByRole                     │
│  └── versionStatus Map: {quotationId#version → ISSUED|SUPERSEDED} │
│                                                                     │
│  data/customers.json                                                │
│  └── [{customerId, name, phone, ..., createdBy, billCycle}]       │
│      createdBy = req.headers['x-actor-user']                      │
│                                                                     │
│  data/users.json                                                    │
│  └── DOES NOT EXIST                                                │
│                                                                     │
│  data/company-profile.json                                          │
│  └── Company profile (admin-managed)                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Existing Capabilities

### A. What already exists

| Capability | Status | Where |
|------------|--------|-------|
| **6 roles defined** | ✅ EXISTS | `rbac.js` — ADMIN, PROJECT_HEAD, ENGINEERING, PROCUREMENT, SALES, SALES_HEAD |
| **SALES_HEAD role in matrix** | ✅ EXISTS | `rbac.js` line 98-101 — has PRICING_VIEW, QUOTATION_CREATE, MARGIN_APPROVE, etc. |
| **Capability-based access** | ✅ EXISTS | `rbac.js` — 22 capabilities, frozen matrix, `assertCan()` at service boundary |
| **RBAC enforcement at service layer** | ✅ EXISTS | `quotationWorkspace.js` — every exported function calls `assertCan(actor, ...)` |
| **Actor identity on quotation** | ✅ EXISTS | `createdBy`, `proposalBy`, `salespersonId` stored on quotation record |
| **Actor identity on issued document** | ✅ EXISTS | `issuedBy`, `issuedByRole` frozen in immutable document |
| **Actor identity on customer** | ✅ EXISTS | `createdBy`, `updatedBy` stored on customer record |
| **Quotation numbering (server-authoritative)** | ✅ EXISTS | `server-sales.js` — `GR-YYYYMMDD-NNNN`, sequential, collision-free |
| **Quotation history API** | ✅ EXISTS | `GET /api/sales/quotation-history` — search by q/status/user |
| **Quotation versioning** | ✅ EXISTS | DRAFT → ISSUED (immutable, frozen) → SUPERSEDED on revision |
| **Version list per quotation** | ✅ EXISTS | `listVersions()` returns all versions with issuedAt, issuedBy |
| **Internal cost redaction** | ✅ EXISTS | `getVersion()` withholds internal cost/margin for non-COST_VIEW actors |
| **Immutability verification** | ✅ EXISTS | `verifyImmutability()` proves document matches commercial snapshot |
| **Session endpoint reports identity model** | ✅ EXISTS | Both workspace and quotation session endpoints report `OPERATOR_ASSERTED_ROLE` and P3-D status |
| **Company profile (admin-only write)** | ✅ EXISTS | `server-company.js` — admin read/write, sales read-only |
| **Single credential auth** | ✅ EXISTS | `ADMIN_PASSWORD` env var, Bearer token, 8hr TTL, rate limiting |
| **Quotation history user filter** | ✅ EXISTS | `GET /api/sales/quotation-history?user=X` filters by createdBy/proposalBy |

### B. How identity is currently determined

Single `ADMIN_PASSWORD` → one Bearer token for everyone. Role/user are **headers** set by client:
- `x-actor-role` → `actorOf(req).role`
- `x-actor-user` → `actorOf(req).userId`

Server validates token (proves "authorized operator") but **never validates who the operator claims to be**. Any authenticated session can claim any role and any userId.

### C. Where users are currently stored

**Nowhere.** No `data/users.json`. No user table. No user model. Identity is a free-text string from HTTP headers. Every `createdBy`, `salespersonId`, `issuedBy` is whatever the client sent.

### D. Salesperson ownership on quotation

Stored on quotation record via three fields:
- `createdBy`: set by `quotationWorkspace.createDraft()` from `actor.userId`
- `proposalBy`: set by client via DRAFT_FIELDS (string, operator-typed)
- `salespersonId`: set by client via DRAFT_FIELDS (string, operator-typed)

Also stored on issued document: `issuedBy`, `issuedByRole`.

All are free-text strings — no foreign key to any user store.

### E. Can Sales Head see all quotations?

**Yes, trivially — everyone can.** `listQuotations()` returns all quotations with no per-user filter. `quotation-history` API also returns all, with optional text search. No visibility restriction exists at any layer.

### F. Can individual sales users be restricted to their own quotations?

**Not currently.** `listQuotations()` (workspace layer) has no per-user filter. `quotation-history` (sales layer) has a `user` query param that does text matching on `createdBy`/`proposalBy`, but it's client-enforced — any client can omit the filter. Server never checks "is this actor allowed to see this quotation?"

---

## 3. Missing Capabilities

| Missing | Impact | Severity |
|---------|--------|----------|
| **No user store** | Cannot authenticate individual users. Cannot prove identity. Cannot manage users (add/disable/assign role). | CRITICAL |
| **No per-user credentials** | Everyone shares one password. Cannot distinguish who logged in. | CRITICAL |
| **No per-user sessions** | Session token not bound to a userId. Cannot revoke one user's access. | CRITICAL |
| **No quotation visibility filter** | `listQuotations()` returns everything. Sales user A sees Sales user B's quotations and customer data. | CRITICAL |
| **No customer visibility filter** | All customers visible to all authenticated users. No ownership on customer records. | HIGH |
| **Identity is spoofable** | Any authenticated operator can send `x-actor-role: ADMIN` and `x-actor-user: anyone`. RBAC is enforced but the inputs are untrusted. | CRITICAL |
| **No SALES_CRS role** | Not in rbac.js ROLE enum or CAPABILITY_MATRIX. | NEEDED |
| **No FIELD_SALES role** | Not in rbac.js ROLE enum or CAPABILITY_MATRIX. | NEEDED |
| **No user management UI** | No admin page to add/remove/disable users or assign roles. | NEEDED |
| **No user disable/remove** | No concept of user status (active/disabled). | NEEDED |
| **No salesperson → quotation ownership enforcement** | `createdBy` exists but never used to restrict reads. | HIGH |
| **No team hierarchy** | No concept of "Sales Head manages salesperson X". | MEDIUM |
| **No audit trail for role changes** | No log of who assigned which role to whom. | MEDIUM |

---

## 4. Exact Files That Would Need Modification

### New files required

| File | Purpose |
|------|---------|
| `data/users.json` | User store — `[{userId, name, email, passwordHash, role, status, createdAt, createdBy}]` |
| `server-users.js` | User management CRUD — admin-only create/update/disable/list, password hashing, per-user login |
| `public/user-management.html` | Admin UI — manage users, assign roles, disable accounts |

### Existing files requiring modification

| File | Change | Risk |
|------|--------|------|
| `server.js` | **Auth rewrite**: POST /api/auth accepts username+password, looks up user store, creates session bound to userId+role. Register user module. | MEDIUM — auth is 30 lines, well-isolated |
| `server.js` | `isAdmin(req)` → `isAuthenticated(req)` — session now carries userId and role, not just "valid" | MEDIUM — every transport module uses `isAdmin` via guard |
| `src/lib/rbac.js` | Add SALES_CRS, FIELD_SALES to ROLE enum and CAPABILITY_MATRIX | LOW — additive, frozen matrix |
| `src/lib/quotationWorkspace.js` | `listQuotations()`: add per-user filter for SALES role (only own quotations). SALES_HEAD sees all. | LOW — filter logic, no architecture change |
| `src/lib/quotationWorkspace.js` | `getQuotation()`: add ownership check for SALES role | LOW — guard, no architecture change |
| `server-sales.js` | Customer list: filter by `createdBy` for individual sales. Quotation history: enforce user filter server-side for SALES role. | LOW — filter logic |
| `server-quotation.js` | `actorOf(req)` reads userId and role from session instead of headers. Remove `x-actor-role`/`x-actor-user` dependency. | MEDIUM — central change |
| `server-workspace.js` | Same `actorOf` change — read from session, not headers | LOW — same pattern |
| `server-procurement.js` | Same `actorOf` change | LOW — same pattern |
| `server-cms.js` | Same `actorOf` change | LOW — same pattern |
| `server-company.js` | Same `actorOf` change | LOW — same pattern |
| `public/sales.html` | Login sends username+password. Remove manual role/user header setting. Session carries identity. | MEDIUM — UI change |
| `public/workspace.html` | Same login change | MEDIUM — UI change |
| `public/procurement.html` | Same login change | LOW |

### Files NOT modified (boundary respected)

| File | Reason |
|------|--------|
| `src/lib/quotationPayload.js` | No payload architecture change needed. |
| `public/lib/quotationDocument.js` | No renderer change needed. |
| `server-bom-builder.js` | No BOM dependency. |
| Procurement modules | No BOM/procurement logic change. |
| Quotation template/artwork | No template change. |

---

## 5. Proposed Minimal Implementation

### Phase A: User Store + Per-User Auth (resolves P3-D)

1. **Create `data/users.json`** — initial admin seed. Schema:
```json
[{
  "userId": "admin-001",
  "username": "admin",
  "name": "Administrator",
  "passwordHash": "<bcrypt>",
  "role": "ADMIN",
  "status": "ACTIVE",
  "createdAt": "...",
  "createdBy": "SYSTEM"
}]
```

2. **Create `server-users.js`** — admin-only CRUD:
   - `POST /api/admin/users` — create user (hash password with crypto.scrypt, zero npm deps)
   - `GET /api/admin/users` — list all users
   - `PATCH /api/admin/users/:id` — update role, status, name
   - `PUT /api/admin/users/:id/password` — reset password

3. **Modify `server.js` auth** — `POST /api/auth` accepts `{username, password}`. Looks up user. Verifies hash. Creates session bound to `{userId, role, username}`. `isAdmin(req)` becomes `isAuthenticated(req)` returning session with user info. All transport modules get actor from session, not headers.

4. **Migration**: `ADMIN_PASSWORD` env var → seed the first admin user. Existing `x-actor-role`/`x-actor-user` headers → ignored once sessions carry identity. Backward compat: keep env var for initial bootstrap only.

### Phase B: Quotation Visibility

5. **`quotationWorkspace.js` — `listQuotations()`**: 
   - ADMIN, PROJECT_HEAD, SALES_HEAD: see all
   - SALES, SALES_CRS, FIELD_SALES: filter by `createdBy === actor.userId`
   - Same filter on `getQuotation()`, `listVersions()`, `getVersion()`

6. **`server-sales.js` — quotation-history**: enforce user filter server-side for non-HEAD sales roles. Remove client-optional `user` query param enforcement.

7. **`server-sales.js` — customers**: SALES roles see only customers where `createdBy === actor.userId`. SALES_HEAD sees all.

### Phase C: New Roles

8. **`rbac.js`** — add to ROLE enum and CAPABILITY_MATRIX:
   - `SALES_CRS`: same as SALES (quotation create, pricing view, etc.)
   - `FIELD_SALES`: subset of SALES (maybe view-only, no create — TBD by business)

9. **Role differences TBD by business.** Architecture supports any capability combination without code change — just add row to frozen matrix.

### Phase D: Admin UI

10. **`public/user-management.html`** — admin page. Login, user list, add/edit/disable form, role assignment dropdown.

---

## 6. Risks / Conflicts

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Auth migration**: existing sessions invalidated when auth changes | LOW | Deploy during maintenance window. One-time password reset for all users. |
| **Existing quotation records have free-text `createdBy`** | MEDIUM | Migration script: map existing `createdBy` strings to new userId values. Unmapped ones become "legacy-unknown". |
| **Customer `createdBy` is free-text** | MEDIUM | Same migration. Or: customer visibility based on quotation ownership rather than customer.createdBy. |
| **`isAdmin` → `isAuthenticated` ripples through all 6 transport modules** | MEDIUM | All use same `guard` pattern. Mechanical find-replace. Good test coverage exists. |
| **Password hashing without npm deps** | LOW | Node.js built-in `crypto.scrypt` — zero-dependency, production-grade. |
| **SALES_HEAD seeing all vs. team-only** | LOW | Start with "all". Team hierarchy is future scope. Capability matrix can narrow later. |
| **Quotation records missing `salespersonId`** | LOW | Already nullable. Filter uses `createdBy` which always exists. |
| **`x-actor-role` header removal breaks existing client integrations** | MEDIUM | Transition period: accept header as fallback when session has no role. Remove after all UIs migrate. |
| **No conflicting sources of truth created** | ✅ | User store is the ONE new source. RBAC matrix stays code-only. Quotation ownership uses existing `createdBy` field. |

---

## 7. Tests That Should Be Added

| Test | File | Coverage |
|------|------|----------|
| User CRUD — create, list, update, disable | `tests/users.test.mjs` | server-users.js |
| Per-user login — correct password, wrong password, disabled user | `tests/users.test.mjs` | server.js auth |
| Session bound to userId — actor from session not headers | `tests/users.test.mjs` | server.js |
| SALES_CRS role in matrix — correct capabilities | `tests/rbac-roles.test.mjs` | rbac.js |
| FIELD_SALES role in matrix — correct capabilities | `tests/rbac-roles.test.mjs` | rbac.js |
| listQuotations filters by createdBy for SALES role | `tests/quotation-visibility.test.mjs` | quotationWorkspace.js |
| listQuotations shows all for SALES_HEAD | `tests/quotation-visibility.test.mjs` | quotationWorkspace.js |
| getQuotation blocks SALES from other user's quotation | `tests/quotation-visibility.test.mjs` | quotationWorkspace.js |
| quotation-history enforces user filter server-side | `tests/quotation-visibility.test.mjs` | server-sales.js |
| Customer list filters by createdBy for SALES | `tests/customer-visibility.test.mjs` | server-sales.js |
| Password hash + verify round-trip | `tests/users.test.mjs` | server-users.js |
| Disabled user cannot login | `tests/users.test.mjs` | server.js auth |
| Admin cannot disable themselves | `tests/users.test.mjs` | server-users.js |
| Role assignment only to known roles | `tests/users.test.mjs` | server-users.js |
| Existing RBAC tests still pass (no regression) | existing test files | rbac.js |
| Identity model changes from OPERATOR_ASSERTED to PER_USER_AUTHENTICATED | `tests/identity-model.test.mjs` | quotationWorkspace.js |

---

## 8. Whether Existing Quotation History/Numbering Can Be Reused

### Quotation numbering: ✅ YES — fully reusable

`server-sales.js` quotation number generator (`GR-YYYYMMDD-NNNN`) is:
- Server-authoritative
- Sequential, collision-free
- Counter persisted in `data/quotation-counter.json`
- Counter backfilled from existing quotation numbers on startup
- No user identity dependency — numbers are global, not per-user

**No change needed.**

### Quotation history: ✅ YES — fully reusable with one addition

`GET /api/sales/quotation-history` already:
- Reads from `quotation-state.json`
- Enriches with version count, customer summary, system info
- Supports search by quotation number, customer name, phone
- Supports filter by status
- Supports filter by user (text match on `createdBy`/`proposalBy`)
- Sorts newest first

**One change needed:** enforce user filter server-side for SALES role (currently client-optional). This is a 3-line addition in the existing filter chain.

### Quotation versioning: ✅ YES — fully reusable

- DRAFT → ISSUED (immutable, frozen) → SUPERSEDED on revision
- Version list per quotation with `issuedAt`, `issuedBy`
- Documents are `deepFreeze`-d at issuance, never re-created
- `verifyImmutability()` proves document matches snapshot
- Internal cost redaction already capability-gated

**No change needed.**

---

## 9. Whether Sales Head vs. Individual-Sales Visibility Can Be Implemented Without Changing Quotation Payload Architecture

### ✅ YES — absolutely. No payload architecture change required.

**Reasoning:**

Visibility is a **read filter**, not a payload shape. The data needed for filtering already exists:

1. Every quotation record already has `createdBy` (set from `actor.userId` in `createDraft()`).
2. `listQuotations()` already iterates `store.quotations.values()` — adding `.filter(q => q.createdBy === actor.userId)` for SALES role is mechanical.
3. `getQuotation()` already does `mustGet(store, quotationId)` — adding an ownership check for SALES role is one conditional.
4. Quotation history already has `createdBy` in its output and a `user` query param.

**What stays untouched:**
- `quotationPayload.js` — zero modification. Assembler is pure function, never sees actor.
- `quotationDocument.js` — zero modification. Renderer reads payload, never checks actor.
- Quotation template/artwork — zero modification.
- BOM logic — zero modification.
- Pricing/cost engines — zero modification.

**The filter lives in the service layer (`quotationWorkspace.js`) and transport layer (`server-sales.js`, `server-quotation.js`). It never touches the payload architecture.**

SALES_HEAD gets all quotations (same `listQuotations()` call, no filter applied).
Individual SALES gets only `createdBy === actor.userId`.

This is the same architectural pattern as internal cost redaction: the service layer decides what an actor can SEE, not what the payload CONTAINS. The stored document is always complete; the reader's view is filtered.

---

## Determination Summary

| Question | Answer |
|----------|--------|
| A. What already exists? | RBAC with 6 roles, 22 capabilities, frozen matrix, service-boundary enforcement, quotation ownership fields, versioning, immutability, history API, numbering |
| B. What is missing? | User store, per-user credentials, per-user sessions, visibility filters, user management, SALES_CRS/FIELD_SALES roles |
| C. Where are users stored? | Nowhere. No user store exists. |
| D. How is identity determined? | Operator-asserted via HTTP headers (`x-actor-role`, `x-actor-user`). Not authenticated. |
| E. How is salesperson ownership stored? | `createdBy` (from actor.userId), `proposalBy`, `salespersonId` on quotation record — all free-text strings |
| F. Can Sales Head see all quotations? | Yes — everyone can. No visibility filter exists. |
| G. Can individual sales be restricted? | Not currently. Requires per-user filter in `listQuotations()` and `getQuotation()`. |
| H. Is quotation history sufficient? | Yes. Search, filter, version count, customer summary all exist. Needs server-side user filter enforcement only. |
| I. Is revision history sufficient? | Yes. DRAFT→ISSUED→SUPERSEDED, frozen documents, immutability verification all exist. |
| J. Is numbering server-authoritative? | Yes. GR-YYYYMMDD-NNNN, sequential, collision-free, counter persisted. |
| K. What changes for role model? | Create user store + per-user auth (resolves P3-D). Add visibility filter. Add 2 roles to matrix. Build user management UI. No payload/renderer/BOM/template changes. |
