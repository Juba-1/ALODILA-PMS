# Sprint 4 — Write Stamp Implementation Checklist

**Product:** ALODILA-PMS  
**Document type:** Implementation checklist (design / inventory only)  
**Status:** DRAFT — no code changes authorized by this document  
**Governing docs:** `SPRINT4_SHARED_ADAPTER.md` · `SPRINT4_APP_INVENTORY.md` · `SPRINT4_RLS_DESIGN.md`  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`  
**Source of truth for call sites:** `src/lib/db/*` (inspected 2026-08-04)

---

## 0. Purpose

When Sprint 4 wires the shared tenancy adapter, **every PMS INSERT must stamp `company_id`**, and **every UPDATE / soft-delete must be company-scoped**. This checklist maps each write path in `src/lib/db` to the adapter contracts:

| Adapter API | Role on writes |
|-------------|----------------|
| `resolveWriteCompany()` | Session → `{ companyId, allowWrite, … }` |
| `stampInsert(payload, write)` | `{ …payload, company_id }` — never leave NULL on new rows |
| Parent inheritance (§4.5) | Child stamp = session write company **and** must equal parent’s `company_id` |

**Current state:** No `src/lib/db/*` function reads or writes `company_id`. All inserts below need stamp work; all updates need company filter + omit `company_id` from client payloads.

---

## 1. Normative write rules (from Shared Adapter)

### 1.1 `resolveWriteCompany()` — before any mutation

Checklist for implementers:

- [ ] Call once per write (or once per **batch** for bulk/import).
- [ ] If `allowWrite === false` → throw **before** network (owner portal ops tables; platform super_admin without assume-company).
- [ ] Never trust form/query `company_id` as authority — only resolver output.
- [ ] Legacy staff without claim → ALODILA (`legacy_default_alodila`).

### 1.2 `stampInsert` — INSERT

- [ ] Always set `company_id` from `resolveWriteCompany().companyId`.
- [ ] Never leave `company_id` NULL on new rows once adapter is wired.
- [ ] Batch inserts: stamp **every** row with the same batch `companyId` (no mixed companies).

### 1.3 UPDATE / soft-delete

- [ ] Filter by primary key **and** company scope (`.eq('company_id', write.companyId)` or equivalent).
- [ ] **Omit** `company_id` from update payloads — clients must not reparent tenants.
- [ ] Soft-delete (`is_deleted: true`) must include company in the filter chain.
- [ ] Zero rows updated ≠ silent success — treat mismatch as error when expected row in scope.

### 1.4 Parent inheritance (child creates)

When creating a child with a parent FK:

1. [ ] `write = await resolveWriteCompany()` (deny if `!allowWrite`).
2. [ ] Load parent with **read scope** (same company).
3. [ ] If parent missing **or** `parent.company_id !== write.companyId` → reject.
4. [ ] Stamp child with `write.companyId` (equals parent).

### 1.5 Persona matrix (writes)

| Persona | `allowWrite` | Notes |
|---------|--------------|-------|
| Company login / staff legacy | `true` | Stamp resolved / ALODILA default |
| Owner portal | `false` for ops tables | Portal stays read-only unless product later allows owner-bounded maintenance create |
| Platform Super Admin (no assume) | `false` | No PMS domain writes via adapter |
| Platform Super Admin (assume-company) | `true` | Audited context only → assumed `companyId` |
| Platform Admin companies registry | N/A | Does **not** use this adapter |

---

## 2. Parent inheritance map

| Child table | Parent FK(s) | Parent load | Stamp must equal |
|-------------|--------------|-------------|------------------|
| `properties` | optional `owner_crm_id` → `owners` | If set: load owner in scope | Session write company; if owner linked, owner’s `company_id` |
| `units` | `property_id` → `properties` | Property in scope | Property `company_id` |
| `contracts` | `tenant_id` → `tenants`; `unit_id` (+ `secondary_unit_ids`) → `units` | Tenant + all units in scope | Session write = tenant = **all** units (main + secondary) |
| `invoices` | `contract_id` → `contracts` | Contract in scope | Contract `company_id` |
| `payments` | `invoice_id` → `invoices` | Invoice in scope | Invoice `company_id` |
| `maintenance_requests` | `unit_id` → `units` | Unit in scope | Unit `company_id` |
| `owners` / `tenants` | *(root CRM)* | None | Session write company only |
| `meters` | *(DB only)* | No app writes today | N/A until app uses table |

**Secondary units (contracts):** Attach only units whose `company_id` matches write company (and main unit’s property company). Reject cross-company secondary attach at app layer.

---

## 3. Root CRM writes

### 3.1 `src/lib/db/owners.js`

| Function | Op | Table | Stamp / scope checklist |
|----------|-----|-------|-------------------------|
| `createOwner` | INSERT | `owners` | [ ] `resolveWriteCompany` [ ] `stampInsert` [ ] no client `company_id` |
| `updateOwner` | UPDATE | `owners` | [ ] company eq on `.eq('id', …)` [ ] omit `company_id` from payload |
| `softDeleteOwner` | UPDATE soft | `owners` (+ guard SELECT `properties`) | [ ] soft-delete company-scoped [ ] property count guard company-scoped |

### 3.2 `src/lib/db/tenants.js`

| Function | Op | Table | Stamp / scope checklist |
|----------|-----|-------|-------------------------|
| `createTenant` | INSERT | `tenants` | [ ] resolve + stamp |
| `updateTenant` | UPDATE | `tenants` | [ ] company eq [ ] omit `company_id` |
| `softDeleteTenant` | UPDATE soft | `tenants` (+ guard SELECT `contracts`) | [ ] soft-delete company-scoped [ ] active-contract guard company-scoped |

---

## 4. Portfolio writes

### 4.1 `src/lib/db/properties.js`

| Function | Op | Table | Stamp / scope checklist |
|----------|-----|-------|-------------------------|
| `createProperty` | INSERT | `properties` | [ ] resolve + stamp [ ] if `owner_crm_id` set → parent inheritance vs `owners` |
| `updateProperty` | UPDATE | `properties` | [ ] company eq [ ] omit `company_id` [ ] if changing `owner_crm_id` → owner must be same company |
| `softDeleteProperty` | UPDATE soft | `properties` | [ ] company-scoped soft-delete [ ] `countActiveContractsOnProperty` company-scoped |

### 4.2 `src/lib/db/units.js`

| Function | Op | Table | Stamp / scope checklist |
|----------|-----|-------|-------------------------|
| `bulkCreateUnits` | INSERT batch | `units` | [ ] resolve **once** per batch [ ] stamp every row [ ] parent inheritance: each `property_id` in scope & same company [ ] reject mixed `property_id` companies in one batch |
| `updateUnit` | UPDATE | `units` | [ ] company eq [ ] omit `company_id` (and do not allow silent property reparent via payload) |
| `softDeleteUnit` | UPDATE soft | `units` (+ guard `contracts`) | [ ] company-scoped [ ] active-contract guard company-scoped |

**Note:** Meter fields on units/properties are **columns**, not `public.meters` rows — stamp applies to parent row only.

---

## 5. Contract writes

### 5.1 `src/lib/db/contracts.js`

| Function | Op | Table | Stamp / scope checklist |
|----------|-----|-------|-------------------------|
| `createContract` | INSERT | `contracts` | [ ] resolve + stamp [ ] inherit: `tenant_id`, `unit_id`, each `secondary_unit_ids[]` same company [ ] reject cross-company attach |
| `updateContract` | UPDATE | `contracts` | [ ] company eq [ ] omit `company_id` [ ] re-validate tenant/unit/secondary units on FK change |
| `terminateContractAndSettle` | UPDATE status | `contracts` | [ ] company eq on terminate [ ] downstream invoice soft-deletes scoped (via `deletePendingInvoicesForContract`) |
| `softDeleteContract` | UPDATE soft | `contracts` | [ ] company-scoped soft-delete |
| `createContract` rollback soft-delete | UPDATE soft | `contracts` | [ ] occupancy-failure rollback also company-scoped |
| `refreshUnitOccupancyFromContracts` (internal) | UPDATE | `units.status` | [ ] do **not** stamp (status only) [ ] filter unit by company [ ] active-contracts scan must be company-scoped (**Needs Rewrite** per inventory) |

---

## 6. Finance writes

### 6.1 `src/lib/db/invoices.js`

| Function | Op | Table | Stamp / scope checklist |
|----------|-----|-------|-------------------------|
| `createInvoice` | INSERT | `invoices` | [ ] resolve + stamp [ ] parent: `contract_id` company match |
| `updateInvoice` | UPDATE | `invoices` | [ ] company eq [ ] omit `company_id` [ ] if `contract_id` changes → new contract same company |
| `softDeleteInvoice` | UPDATE soft | `invoices` | [ ] company-scoped |

### 6.2 `src/lib/db/payments.js`

| Function | Op | Table | Stamp / scope checklist |
|----------|-----|-------|-------------------------|
| `createPayment` | INSERT | `payments` | [ ] resolve + stamp [ ] parent: `invoice_id` → invoice.company_id |
| `updatePayment` | UPDATE | `payments` | [ ] company eq [ ] omit `company_id` |
| `softDeletePayment` | UPDATE soft | `payments` | [ ] company-scoped |

### 6.3 `src/lib/db/contractFinance.js` (bulk invoice paths)

| Function | Op | Table | Stamp / scope checklist |
|----------|-----|-------|-------------------------|
| `generateInstallmentsForContract` | optional soft-delete + INSERT batch | `invoices` | [ ] resolve once [ ] assert `contract.company_id === write.companyId` [ ] stamp every installment [ ] replaceExisting soft-delete company-scoped |
| `deletePendingInvoicesForContract` | UPDATE soft (pending ids) | `invoices` | [ ] load/filter invoices under contract **and** company [ ] soft-delete `.in('id', …)` + company eq |
| `regeneratePendingInstallmentsForContract` | soft-delete pending + INSERT | `invoices` | [ ] same as generate: parent contract check + batch stamp + scoped deletes |

---

## 7. Maintenance writes

### 7.1 `src/lib/db/maintenance.js`

| Function | Op | Table | Stamp / scope checklist |
|----------|-----|-------|-------------------------|
| `createRequest` | INSERT | `maintenance_requests` | [ ] resolve + stamp [ ] parent: `unit_id` company match [ ] owner portal: deny unless product explicitly allows (`allowWrite`) |
| `updateRequest` | UPDATE | `maintenance_requests` | [ ] company eq [ ] omit `company_id` [ ] re-check unit on `unit_id` change |
| `softDeleteRequest` | UPDATE soft | `maintenance_requests` | [ ] company-scoped |

---

## 8. Smart import & bulk paths

### 8.1 `src/lib/db/smartImport.js`

Per Shared Adapter §4.6:

| Path | Op | Checklist |
|------|-----|-----------|
| `executeSmartImport` | orchestrator | [ ] `resolveWriteCompany()` **once** at job start [ ] deny if `!allowWrite` [ ] never mix companies in one import |
| `createUnitDirect` | INSERT `units` | [ ] stamp with batch companyId [ ] parent: target `propertyId` / created property same company |
| Indirect creates via `createProperty` / `createTenant` / (`createOwner` if added) | INSERT | [ ] those helpers must stamp (or pass write company through) |
| Indirect updates via `updateProperty` / `updateUnit` / `updateTenant` | UPDATE | [ ] company-scoped updates only |
| Name-matching helpers (`fetchActive*Lite`, `getOwners`) | SELECT | Out of **stamp** scope — must still be **read-scoped** so matches cannot cross tenants (**Needs Rewrite**) |

### 8.2 `bulkCreateUnits` (`units.js`)

- [ ] Same batch rules as §4.2 / adapter §4.6.
- [ ] Prefer resolving write company once; stamp all rows; verify all `property_id`s share that company.

---

## 9. Read-only / no stamp modules (explicit)

These modules have **no INSERT/UPDATE** today. Checklist = **do not invent write stamps here**; they consume scoped reads later.

| Module | Write stamp? |
|--------|--------------|
| `dashboard.js` | None |
| `reports.js` | None |
| `ledgerTotals.js` | None |
| `tenantStatement.js` | None |
| `ownerPortal.js` | None (read-only; writes must stay denied via `allowWrite`) |
| `src/platform/services/companies.js` | **Out of adapter** — registry only |

RPC: `ownerLookupForOnboarding` — not a stamp path; company-aware rewrite is separate (inventory **Needs Rewrite**).

---

## 10. Implementation order (recommended)

Aligns with Shared Adapter §6.3 (writes first):

1. [ ] Land `src/lib/tenancy/*` (`resolveWriteCompany`, `stampInsert`, constants).
2. [ ] Wire root CRM: `owners.js`, `tenants.js`.
3. [ ] Wire portfolio: `properties.js`, `units.js` (+ parent checks).
4. [ ] Wire `contracts.js` (+ secondary unit company checks + occupancy rewrite).
5. [ ] Wire finance: `invoices.js`, `payments.js`, `contractFinance.js`.
6. [ ] Wire `maintenance.js`.
7. [ ] Wire `smartImport.js` batch stamp + scoped matchers.
8. [ ] Confirm owner portal still cannot write ops tables (`allowWrite === false`).
9. [ ] Confirm Platform Admin never imports tenancy adapter.

---

## 11. Acceptance checklist (when coding is approved)

- [ ] Every PMS INSERT in §3–8 calls `resolveWriteCompany` + `stampInsert` (or equivalent).
- [ ] Every UPDATE / soft-delete filters by company; never updates by id alone across tenants.
- [ ] No update payload accepts client-supplied `company_id`.
- [ ] Child creates enforce parent inheritance (§2).
- [ ] Bulk / smart import: one company per job; all rows stamped.
- [ ] Production single-company: all paths resolve to ALODILA → behavior unchanged.
- [ ] Owner / unscoped platform sessions cannot insert via adapter.
- [ ] Two-company clone test: zero cross-tenant inserts/updates through app write paths.

---

## Document control

| Field | Value |
|-------|--------|
| Version | 0.1 DRAFT |
| Authoring agent | Agent D — Write Stamp Checklist |
| Implementation | **Not started** — checklist only |
| Companion | `SPRINT4_SHARED_ADAPTER.md` §§4, 6.2–6.3 |

---

*End of Sprint 4 Write Stamp Implementation Checklist*
