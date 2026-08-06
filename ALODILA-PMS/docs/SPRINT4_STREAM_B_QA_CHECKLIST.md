# Sprint 4 — Stream B Write Stamp QA Checklist

**Product:** ALODILA-PMS  
**Document type:** QA acceptance checklist (documentation only)  
**Stream:** **B — Write Stamp** (INSERT `company_id` via `companyDb` / `resolveWriteCompany` / `stampInsert`)  
**Status:** DRAFT — execute after Stream B write wiring lands on clone/staging  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`  
**Governing docs:** `SPRINT4_SHARED_ADAPTER.md` · `SPRINT4_WRITE_STAMP_CHECKLIST.md` · `SPRINT4_COMPANYDB_QUERY_INVENTORY.md` · `SPRINT4_QA_ISOLATION_TEST_PLAN.md`

---

## 0. Scope & assumptions (Stream B only)

### 0.1 What Stream B ships

| In | Out (later streams) |
|----|---------------------|
| PMS **INSERT** paths stamp `company_id` from `resolveWriteCompany()` via `stampInsert` / `companyDb` | App **SELECT** company filters (`withCompanyEq` / `resolveReadScope`) |
| `allowWrite === false` denies owner / unscoped platform writes **before** network | Soft RLS policy changes |
| Parent-inheritance checks on child creates (when wired with stamp) | Hard `NOT NULL` / hard RLS cutover |
| Bulk / Smart Import batch stamp (one company per job) | Assume-company UX productization |

### 0.2 Hard QA assumptions for this checklist

| Assumption | Implication for testers |
|------------|-------------------------|
| **INSERT stamps** | New rows must have non-null `company_id` matching session write company (ALODILA for legacy/staff without claim). |
| **SELECTs still unscoped** | Lists/details/aggregates may still return rows from any company. Do **not** fail Stream B if cross-company rows appear in UI lists. Isolation of reads is a later stream. |
| **API return types unchanged** | Exported `src/lib/db/*` create helpers keep the same success shape (row / `{ data, error }` / batch summary as today). Callers must not break because of stamp. |
| **Client `company_id` is not authority** | Forged form/payload `company_id` must be overwritten or ignored; stamp comes only from resolver. |
| **Environment** | Prefer clone/staging. Production ALODILA smoke only when approved; no Company B seed on prod for this stream. |

### 0.3 Pass / fail rules

| Verdict | Rule |
|---------|------|
| **PASS** | Stamp correct on INSERT; denials work for owner/unscoped SA; UI create flows succeed on ALODILA; return shapes unchanged. |
| **FAIL** | New row with `company_id` NULL; stamp wrong company; owner write succeeds on ops create; create API shape breaks pages; silent drop of required return fields. |
| **N/A this stream** | Cross-tenant **list** leakage (expected while SELECTs unscoped); UPDATE company filter gaps if UPDATE wiring is partial and documented separately. |

### 0.4 Personas (Stream B)

| ID | Persona | Write expectation |
|----|---------|-------------------|
| **ST** | Legacy staff / company ops (ALODILA default) | `allowWrite: true` → stamp ALODILA |
| **CA** | Company login with `company_id = ALODILA` | Stamp ALODILA |
| **OA** | Owner portal | `allowWrite: false` → create ops APIs denied |
| **SA** | Super Admin **without** assume-company | PMS creates via adapter denied |
| **CB** | Company B (clone only, if seeded) | Stamp Company B only; optional isolation of **writes** |

---

## 1. Preconditions

- [ ] Stream A adapter available (`src/lib/tenancy/*`, `companyDb`, `resolveWriteCompany`, `stampInsert`).
- [ ] Stream B write wiring merged on test branch (INSERT paths in `src/lib/db/*` per write-stamp checklist).
- [ ] Sprint 3 Packages 1–5: `company_id` column exists on owners, tenants, properties, units, contracts, invoices, payments, maintenance_requests.
- [ ] Live/clone ALODILA rows already backfilled (existing data not reparented by this stream).
- [ ] Test accounts: ST/CA, OA; optional CB + SA on clone.
- [ ] Ability to inspect DB row after create (`company_id` column) — SQL editor, table UI, or PostgREST select by id.

---

## 2. Regression — single-company ALODILA (mandatory)

Goal: production-like staff/company session behaves as before, with stamp invisible to UX.

### 2.1 CRM & portfolio creates

| ID | Steps | Expected | ☐ |
|----|-------|----------|---|
| REG-W-01 | ST/CA: create owner via Owners UI / `createOwner` | Success; returned owner shape unchanged; DB `company_id = ALODILA` | ☐ |
| REG-W-02 | ST/CA: create tenant | Success; shape unchanged; stamp ALODILA | ☐ |
| REG-W-03 | ST/CA: create property (with/without owner link) | Success; stamp ALODILA; if owner linked, owner is ALODILA | ☐ |
| REG-W-04 | ST/CA: bulk-create units on a property | Success; **every** new unit stamped ALODILA; batch return shape unchanged | ☐ |
| REG-W-05 | ST/CA: soft-delete / update existing ALODILA rows (smoke) | Existing flows still work; no accidental `company_id` reparent in payload | ☐ |

### 2.2 Contracts & finance creates (ALODILA)

| ID | Steps | Expected | ☐ |
|----|-------|----------|---|
| REG-W-06 | ST/CA: create contract (main unit ± secondary units) | Success; contract stamped ALODILA; UI detail still loads | ☐ |
| REG-W-07 | ST/CA: create manual invoice on contract | Success; invoice stamped ALODILA | ☐ |
| REG-W-08 | ST/CA: generate installments for contract | All new invoice rows stamped ALODILA; schedule UI unchanged | ☐ |
| REG-W-09 | ST/CA: record payment on invoice | Payment stamped ALODILA; invoice status/derived UI still correct | ☐ |
| REG-W-10 | ST/CA: create maintenance request | Request stamped ALODILA | ☐ |

### 2.3 Lists still work (unscoped SELECT)

| ID | Steps | Expected | ☐ |
|----|-------|----------|---|
| REG-R-01 | After creates: open Owners / Tenants / Properties / Units lists | New ALODILA rows appear (SELECTs unscoped — full list still OK) | ☐ |
| REG-R-02 | Dashboard / reports / owner portal (as OA read) | No blank-screen regressions from create stamp alone | ☐ |
| REG-R-03 | Contract detail + invoice list after REG-W-06–09 | Same fields/types as pre-Stream-B; no missing nested objects | ☐ |

### 2.4 Platform boundary

| ID | Steps | Expected | ☐ |
|----|-------|----------|---|
| REG-P-01 | SA: Platform Admin companies list/create/edit | Unaffected; must **not** require / import write stamp for registry | ☐ |
| REG-P-02 | SA without assume: attempt PMS create via app db helpers | Denied (`allowWrite` / TenancyError) — no silent insert | ☐ |

---

## 3. Owner portal (write denial)

Owner portal remains **read-only** for PMS ops tables. Stream B must not open write paths.

| ID | Steps | Expected | ☐ |
|----|-------|----------|---|
| OWN-01 | OA: dashboard, properties, reports, maintenance **read** | Regression PASS (reads unscoped or owner-filtered as today — out of stamp scope) | ☐ |
| OWN-02 | OA: call / trigger `createInvoice` / `createPayment` / `createContract` / `createProperty` (UI if exposed, else direct helper) | **Denied** before or at adapter (`allowWrite === false`); no new row | ☐ |
| OWN-03 | OA: `createRequest` (maintenance) unless product explicitly sets `allowOwnerWrite` | **Denied** by default | ☐ |
| OWN-04 | OA: forge payload with `company_id = ALODILA` on a create attempt | Still denied; no stamp bypass | ☐ |
| OWN-05 | Confirm `ownerPortal.js` still has **no** INSERT paths | No new write surface added for portal | ☐ |

---

## 4. Smart Import & bulk stamp

| ID | Steps | Expected | ☐ |
|----|-------|----------|---|
| IMP-01 | ST/CA: run Smart Import against an ALODILA property | Job succeeds; every **inserted** unit/tenant/property row stamped ALODILA | ☐ |
| IMP-02 | Inspect import summary / return value of `executeSmartImport` | Same success/error summary shape as before Stream B | ☐ |
| IMP-03 | Confirm `resolveWriteCompany()` once per job (no mixed companies) | All new rows share one `company_id` | ☐ |
| IMP-04 | OA: attempt Smart Import | Denied (`!allowWrite`) | ☐ |
| IMP-05 | `bulkCreateUnits` on ALODILA property | All rows stamped; API return type unchanged | ☐ |
| IMP-06 | *(Clone + CB only)* CB Smart Import must not create rows stamped ALODILA | Stamp = Company B only | ☐ |
| IMP-07 | Name-match helpers still resolve entities | Matching may still be global (SELECTs unscoped) — document observed behavior; do **not** block Stream B on cross-name match alone | ☐ |

---

## 5. Finance write stamp

| ID | Steps | Expected | ☐ |
|----|-------|----------|---|
| FIN-01 | `createInvoice` | Returned invoice object/fields unchanged; `company_id` stamped in DB | ☐ |
| FIN-02 | `createPayment` | Return shape unchanged; payment + any invoice refresh still work in UI | ☐ |
| FIN-03 | `generateInstallmentsForContract` | Batch inserts all stamped; function return (created count / rows) unchanged | ☐ |
| FIN-04 | `regeneratePendingInstallmentsForContract` | Soft-delete + recreate path: new rows stamped; UI schedule consistent | ☐ |
| FIN-05 | Parent inheritance: invoice for contract | Stamp equals session write company and contract’s `company_id` | ☐ |
| FIN-06 | Parent inheritance: payment for invoice | Stamp equals invoice `company_id` | ☐ |
| FIN-07 | Client sends `company_id: null` or foreign UUID on create payload | Overwritten by stamp / ignored; row not left NULL; not reassigned to foreign company | ☐ |
| FIN-08 | PaymentModal / InvoiceForm UX smoke | No console/type errors from extra `company_id` on returned rows | ☐ |

---

## 6. Contracts write stamp

| ID | Steps | Expected | ☐ |
|----|-------|----------|---|
| CTR-01 | `createContract` happy path | Return type/shape unchanged (contract row + any side effects as today); DB stamp ALODILA for ST/CA | ☐ |
| CTR-02 | Parent checks: tenant + main unit same company as write | Success only when parents align | ☐ |
| CTR-03 | Secondary units: all secondary unit ids same company | Success; all units ALODILA (or CB for CB session) | ☐ |
| CTR-04 | *(If wired)* Reject secondary unit from another company | Create fails clearly; no partial stamp orphan | ☐ |
| CTR-05 | Contract create → installment generation chain | Contract + invoices all stamped consistently | ☐ |
| CTR-06 | Terminate / soft-delete smoke | Existing behavior; no client-driven `company_id` change | ☐ |
| CTR-07 | Occupancy refresh after create | Unit status updates still occur; create return path unchanged | ☐ |
| CTR-08 | ContractForm / ContractDetail UI | No breakage from stamped field present on returned entity | ☐ |

---

## 7. API behavior — return types unchanged

Stream B may add `company_id` **on the persisted row** and may include it in returned objects if the SELECT/returning clause already returns `*`. It must **not** change the **contract** of exported helpers (promise resolution shape, error throwing style, required keys consumers rely on).

### 7.1 Signature / shape matrix

| Module | Function | Assert | ☐ |
|--------|----------|--------|---|
| `owners.js` | `createOwner` | Same success value type as pre-stream; pages that set state from result still work | ☐ |
| `tenants.js` | `createTenant` | Unchanged | ☐ |
| `properties.js` | `createProperty` | Unchanged | ☐ |
| `units.js` | `bulkCreateUnits` | Unchanged (array / count / thrown errors as today) | ☐ |
| `contracts.js` | `createContract` | Unchanged | ☐ |
| `invoices.js` | `createInvoice` | Unchanged | ☐ |
| `payments.js` | `createPayment` | Unchanged | ☐ |
| `contractFinance.js` | `generateInstallmentsForContract` / regenerate | Unchanged | ☐ |
| `maintenance.js` | `createRequest` | Unchanged | ☐ |
| `smartImport.js` | `executeSmartImport` | Unchanged summary object | ☐ |

### 7.2 Negative / error API

| ID | Steps | Expected | ☐ |
|----|-------|----------|---|
| API-01 | Owner / SA-denied create | Throws tenancy/write-denied style error (or existing error wrapper); **not** a half-inserted row | ☐ |
| API-02 | Validation failure (bad FK, missing required field) | Same domain validation errors as before; stamp must not mask them | ☐ |
| API-03 | Pages catching errors (toasts / form banners) | Still display useful message; no raw crash from undefined destructure | ☐ |
| API-04 | Returned row may contain `company_id` | Consumers that ignore unknown fields remain fine; no required new arg on create inputs | ☐ |
| API-05 | Create inputs still do **not** require caller to pass `company_id` | Optional client field ignored; resolver is source of truth | ☐ |

---

## 8. Optional clone isolation (write-only evidence)

Only when Company B is seeded. SELECTs remain unscoped — judge **writes**, not list leakage.

| ID | Steps | Expected | ☐ |
|----|-------|----------|---|
| ISO-W-01 | CB: create property/tenant/owner | New row `company_id = COMPANY_B_ID` | ☐ |
| ISO-W-02 | CB: forge insert intending ALODILA `company_id` | Stamp still Company B (or denied); **no** ALODILA-tagged insert from CB session | ☐ |
| ISO-W-03 | CA: create row | Always ALODILA stamp | ☐ |
| ISO-W-04 | CB: create contract only with CB parents | Success; stamp Company B | ☐ |
| ISO-W-05 | Do **not** use SA “sees both companies” in SELECT as isolation PASS | Expected under unscoped reads / soft RLS | ☐ |

---

## 9. Explicit non-goals (do not block Stream B)

- [ ] Failing because Company B rows appear in CA **lists** (SELECTs unscoped).
- [ ] Failing because Smart Import **name match** finds another company’s entity by name (read rewrite later).
- [ ] Hard RLS / `company_id NOT NULL` enforcement.
- [ ] Platform assume-company product UX.
- [ ] Full UPDATE `.eq('company_id', …)` coverage if scoped as a follow-on write wave — track separately unless already claimed in Stream B PR.

---

## 10. Exit criteria (Stream B QA sign-off)

All must be checked before declaring Stream B Write Stamp QA complete:

- [ ] §2 Regression ALODILA creates PASS (CRM, portfolio, contracts, finance, maintenance).
- [ ] §3 Owner portal writes denied; reads not broken by stamp work.
- [ ] §4 Smart Import / bulk inserts stamp correctly; return summary unchanged.
- [ ] §5 Finance stamp + parent inheritance PASS.
- [ ] §6 Contracts stamp + secondary-unit company alignment PASS (or documented gap if inheritance deferred).
- [ ] §7 API return types / shapes unchanged for all create entry points.
- [ ] No new PMS INSERT leaves `company_id` NULL under staff/company session.
- [ ] Platform companies registry untouched by adapter.
- [ ] *(Optional)* §8 clone write isolation PASS for CB stamp correctness.

**Sign-off**

| Role | Name | Date | Result |
|------|------|------|--------|
| QA | | | PASS / FAIL |
| Eng | | | PASS / FAIL |

---

## Document control

| Field | Value |
|-------|--------|
| Version | 0.1 DRAFT |
| Authoring agent | Agent 4 — Stream B Write Stamp QA |
| Implementation | Checklist only — no application code |
| Companion | `SPRINT4_WRITE_STAMP_CHECKLIST.md` · `SPRINT4_SHARED_ADAPTER.md` §4 · `SPRINT4_QA_ISOLATION_TEST_PLAN.md` |

---

*End of Sprint 4 Stream B Write Stamp QA Checklist*
