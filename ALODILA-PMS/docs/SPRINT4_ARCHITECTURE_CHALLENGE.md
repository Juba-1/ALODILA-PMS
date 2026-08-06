# Sprint 4 — Architecture Challenge (Multi-Tenancy Plan)

**Product:** ALODILA-PMS  
**Document type:** Architecture challenge / adversary review  
**Author role:** Architect Challenge Agent  
**Date:** 2026-08-04  
**Scope:** Challenge the multi-tenancy plan as documented and partially shipped. **No code/SQL changes in this workstream.**  
**Governing sources:** `PLATFORM_ARCHITECTURE_V1.md` · `SPRINT4_RLS_DESIGN.md` · `SPRINT4_SHARED_ADAPTER.md` · `SPRINT4_STATUS.md` · Sprint 3–4 execution docs  

**Assumptions under challenge**

| # | Assumption |
|---|------------|
| A1 | Soft RLS with Super Admin (`is_super_admin()`) bypass of company predicates |
| A2 | Dual enforcement: app filters (`companyDb` / `withCompanyEq`) **and** RLS |
| A3 | Transitional Super Admin → ALODILA defaulting (missing claim ⇒ ALODILA) |
| A4 | `company_id` stays nullable through Sprint 4 soft mode |
| A5 | Auth persona cutover is a separate Sprint 5 |
| A6 | Shared `companyDb` / tenancy adapter layer as the PMS entry pattern |

**Current factual posture (as of Sprint 4 status)**

- Sprint 1–3: `companies` + `company_id` on all in-scope PMS tables, backfilled to ALODILA, still **nullable**.
- Sprint 4 app Streams A–D: **COMPLETE** (adapter, stamps, read filters, write company eq).
- Soft RLS SQL (`006_…`): **AUTHORED, not applied**. Isolation QA: **not executed**.
- Sprints 5–7 still planned as Auth → isolation debt → multi-company beta.

---

## Verdict (one paragraph)

Shared-DB + denormalized `company_id` is the right v1 shape. The **wrong complexity** is the long soft-transition corridor: nullable columns, SA portfolio bypass, dual soft-NULL semantics in app and RLS, and Auth deferred to Sprint 5 while isolation claims to be “proven” under soft RLS. That corridor maximizes docs and dual-path maintenance without closing the real leak surface (privileged sessions that still see everything). Prefer a **shorter hard gate on clone**: bind ALODILA company login, `NOT NULL` after zero-NULL proof, company-role RLS without SA PMS bypass, then second company. Keep thin app stamps/filters; drop soft-NULL theater and premature assume-company product scaffolding.

---

## 1. Is there a simpler architecture?

**Yes — same tenancy model, much simpler transition mechanics.**

### Keep (already simple enough)

- One Postgres project, shared schema, `company_id` on tenant tables.
- One Company = One Login for MVP (no `company_members`).
- Owner portal remains `owner_crm_id` + company alignment.
- Platform Admin stays on `companies` only, outside PMS adapters.

### Reject as “architecture”; treat as temporary debt

| Current complexity | Simpler alternative |
|--------------------|---------------------|
| Soft RLS + NULL-tolerant `company_matches` | After Package 5 zero-NULL audits: **`NOT NULL` + strict equality** on clone, then prod |
| SA bypass on every PMS policy “so ALODILA keeps working” | **Separate ALODILA company login**; SA only for `companies` + optional break-glass |
| Dual soft resolution chains (JS `resolveCurrentCompany` + SQL `current_company_id` with fallbacks to `user_metadata` / legacy default) | **One claim path:** `app_metadata.company_id` only; JS mirrors SQL with the same 3-line rules |
| Full `companyDb` façade (`scopedSelect`, rich types, assume hooks) | **Three helpers:** `resolveScope`, `withCompanyEq`, `stampInsert` — already what call sites use |
| Soft FAIL-OPEN for untagged rows as ALODILA | Unnecessary once residuals are proven zero; FAIL-CLOSED always |

### Concrete recommendation

Do **not** redesign to DB-per-tenant or schema-per-tenant. Redesign the **enforcement timeline**:

```
DONE: companies + company_id backfill
NEXT (clone campaign, one gate):
  1. Bind ALODILA company Auth user (claims)
  2. NOT NULL company_id (after COUNT NULL = 0)
  3. RLS: company match OR (SA AND assume-company) — no silent SA full portfolio
  4. Keep app filters as belt, not as soft-NULL peer logic
THEN: seed Company B → isolation matrix → prod
```

That is simpler than Soft RLS → Sprint 5 Auth → Sprint 6 debt → Sprint 7 beta with soft semantics living for months.

---

## 2. Is there a safer rollout?

**Yes. The current soft RLS + SA bypass rollout is convenience-safe for ALODILA, not isolation-safe for SaaS.**

### Why soft+SA is a false sense of safety

1. **Isolation QA under SA bypass does not prove production’s real risk.** Today’s ops path is still `is_super_admin()`. Soft policies that OR-in SA mean the live operator path remains an unscoped portfolio reader/writer. Company-B-only proofs for `role=company` users are necessary but **insufficient** if prod still runs as SA.
2. **Nullable + soft-NULL rules create asymmetric deny logic** that is easy to get wrong (ALODILA session may see NULL rows; Company B must not). That is a classic policy bug class. With zero NULLs already expected post–Package 5, keeping nullable “for softness” buys almost no rollback value and adds leak/lockout ambiguity.
3. **App filters before Auth cutover** mean every legacy staff session defaults to ALODILA. That preserves prod UX, but it also means **any forgotten filter still fails open at the DB** until hard RLS exists — and soft RLS with SA bypass fails open for the privileged role forever.
4. **`user_metadata.company_id` fallback** (documented as transition) is unsafe if it ever becomes authoritative; Supabase user metadata is user-editable. Safer rollout never reads it for authorization.

### Safer sequence (recommended)

| Step | Where | Why safer |
|------|-------|-----------|
| S0 | Clone restore + backup drill | Already in architecture; keep as hard gate |
| S1 | Provision/bind **ALODILA company login** (`role=company`, `company_id=ALODILA`); keep SA for `/platform` only | Removes “SA is the PMS” before second tenant |
| S2 | Smoke ALODILA ops **as company login** (not SA) | Proves the path customers will use |
| S3 | Verify `company_id IS NULL` = 0 → apply **`NOT NULL`** | Removes soft-NULL policy branch |
| S4 | Apply **strict company RLS** for company/owner; SA PMS only via explicit assume (even if assume UI is minimal) | Makes RLS meaningful |
| S5 | Seed Company B + matrix in `SPRINT4_ISOLATION_QA.md` | Real isolation proof |
| S6 | Prod: Auth bind → NOT NULL → RLS (same order), feature-flag if needed | No multi-week soft dual-mode in prod |

### What to stop doing for “safety theater”

- Do **not** call soft RLS “isolation complete” while SA still SELECTs all companies’ rows.
- Do **not** ship soft-NULL predicates to production if clone already shows zero NULLs.
- Do **not** delay Auth binding until after soft RLS prod apply; that inverts risk.

**Rollback still works:** Auth claims are reversible; `NOT NULL` is reversible only if you allow NULL again (additive posture prefers proving zero NULL first). Prefer clone confidence over soft forever.

---

## 3. Can any Sprint be merged?

**Yes — several merges cut calendar time without increasing risk if clone gates stay strict.**

| Merge proposal | Rationale | Do **not** merge |
|----------------|-----------|------------------|
| **Sprint 4 remaining (006 apply + isolation QA) ∪ Sprint 5 Auth (ALODILA bind + claim normalization)** into one **“Hard isolation gate”** | Soft RLS without company login is incomplete; Auth without RLS leaves app-only trust. One clone campaign should do both. | Do not merge subscription/billing (Sprint 8) into isolation |
| **Sprint 6 isolation debt items that block second company** (secondary units cross-company, global unique NIDs) ∪ **Sprint 7 beta prep** | Debt that blocks two-tenant correctness is beta scope, not a separate philosophy sprint | Do not merge cosmetic occupancy polish that does not affect cross-tenant integrity |
| **Sprint 4 Stream D-SQL ∪ Wave A indexes** (already one migration) | Keep as one apply | — |
| **Docs consolidation** (many Sprint 4 design/checklists → one runbook) | Reduces conflicting “Stream B vs C” naming and stale DRAFT headers | Do not delete Sprint 3 execution log (audit trail) |

### Explicit non-merges

- **Platform Admin (Sprint 2)** was correctly early; do not reopen.
- **Package-split of Sprint 3 DDL** was already done; do not re-package.
- **Commercial Sprint 8** stays after isolation beta.

### Merged target roadmap (compressed)

```
✅ 1–3  Foundation (done)
▶ 4★   Hard isolation gate = Auth bind (ALODILA) + NOT NULL + strict RLS + clone 2-company QA
▶ 5★   Multi-company beta = Company B provision + remaining structural debt that fails QA
▶ 6    Subscription stub / hardening / docs (old 8–9)
```

Old Sprint numbers can remain in git history; execution should follow the compressed gates.

---

## 4. Can remaining implementation time be reduced?

**Yes — estimated cut: ~30–50% of remaining isolation calendar**, if soft-mode and doc-parallelism are dropped.

### High-ROI cuts

| Cut | Time saved (order-of-magnitude) | Cost |
|-----|----------------------------------|------|
| Skip production **soft RLS**; go clone → strict RLS after Auth bind | 1–2 weeks of soft-policy debugging + dual QA matrices | Requires Auth bind earlier (good) |
| Drop soft-NULL helpers / app NULL-as-ALODILA branches | Days of policy + test matrix cells | Requires zero-NULL verification (already expected) |
| Collapse Sprint 5–7 into two gates (above) | 1–3 weeks of handoffs / re-approvals | Needs single ownership of clone campaign |
| Stop writing new Sprint 4 design variants; one apply runbook | Days of agent/doc thrash | Discipline only |
| Defer **audited assume-company product** (Sprint 7 UI) until after beta | Days–week | SA must not use unscoped PMS; minimal assume (JWT claim / session flag) is enough for support |
| Do not expand `companyDb` API surface further | Ongoing | Call sites already use thin helpers |

### What not to cut

- Two-company clone matrix before prod RLS.
- Write stamps + app `.eq('company_id')` already landed — keep them.
- Backup / restore drill before prod DDL.
- Owner portal read-only + company alignment checks.

### Honest estimate framing

App Streams A–D are largely **done**. Remaining cost is mostly: **Auth claims, SQL apply, QA, structural debt**. Soft RLS as a long-lived phase does not reduce that cost — it **duplicates** it (soft then hard).

---

## 5. Can future maintenance be simplified?

**Yes. Optimize for one persona model and one enforcement story.**

### Target steady state (maintenance-friendly)

1. **Claims:** only `app_metadata` (`platform_super_admin` | `company`+`company_id` | `owner`+`owner_crm_id`+`company_id`).
2. **RLS:** company match / owner graph; SA on `companies`; SA on PMS only with assume-company.
3. **App:** stamp + filter helpers; no legacy_default_alodila.
4. **Schema:** `company_id NOT NULL` on tenant tables; composite uniques per company.
5. **Docs:** one tenancy runbook + one isolation QA; archive sprint stream novels.

### Maintenance killers in the current plan

| Killer | Fix |
|--------|-----|
| Two sources of truth for “current company” (JS + SQL) with **different** soft fallbacks | Identical resolution order; delete soft steps when unused |
| SA means both “platform operator” and “ALODILA staff” | Split accounts; delete dual meaning |
| Nullable column + soft match forever | `NOT NULL` after proof |
| Three overlapping QA docs / checklists | One matrix, one sign-off |
| `assumeCompanyContext` before product need | Keep a 20-line hook max; no product surface until beta support needs it |
| Dual filter discipline (“every module must remember”) without hard RLS | Hard RLS makes forgotten filters fail closed |

### Concrete maintenance rule

> After Hard isolation gate: **any** code path that defaults missing company to ALODILA is a **bug**, not a feature — except a one-release feature flag for emergency rollback, then delete.

---

## 6. Are any current abstractions unnecessary?

**Yes — several. Keep the thin ones; challenge the soft-transition and façade weight.**

### Necessary (keep)

| Abstraction | Why |
|-------------|-----|
| `ALODILA_COMPANY_ID` constant (PMS-side) | Avoid platform ↔ db cycles |
| `stampInsert` / `withCompanyEq` / `withWriteCompanyEq` | Real call-site consistency |
| `resolveReadScope` / `resolveWriteCompany` | Persona branching in one place |
| Platform services **not** importing tenancy | Correct boundary |
| Denormalized `company_id` on hot tables | RLS performance / correctness |

### Unnecessary or premature (simplify / delete when gate passes)

| Abstraction | Challenge |
|-------------|-----------|
| **Soft-NULL `company_matches` / “untagged = ALODILA”** | Data is backfilled; soft-NULL is speculative compatibility, not a requirement |
| **JWT fallback chain including `user_metadata.company_id`** | Authorization smell; cut in Auth bind |
| **`legacy_default_alodila` as long-term resolver source** | Transition only; schedule deletion date at Auth bind |
| **`is_company_login()` that includes “legacy staff”** | Blurs Sprint 5 personas; prefer explicit company role |
| **Rich `companyDb` object / `scopedSelect`** if call sites only use named helpers | Façade without adoption = noise |
| **Multiple SQL helper layers** (`company_matches`, `can_access_company_row`, `owner_company_aligned`) before policies exist in prod | Prefer fewer helpers inlined into clear policy templates once; extract only if duplication hurts |
| **Full assume-company product in tenancy package now** | Hook OK; product premature until SA leaves PMS default path |
| **Dual app+RLS soft semantics that must stay “in sync” manually** | Defense in depth is good; **dual soft modes** are not — app can stay strict while RLS is strict |

### Dual app + RLS (assumption A2) — nuanced verdict

- **Keep dual enforcement** after hard gate: app filters catch bugs early; RLS is authority against forged clients.
- **Do not keep dual soft-transition logic.** The expensive part is not two layers — it is two layers each implementing NULL/default/SA special cases.

---

## 7. If starting from scratch today, would you design it differently?

**Same destination, different order and fewer soft phases.**

### Still choose

- Shared DB / shared schema / `company_id`.
- Supabase Auth + `app_metadata` personas.
- One Company = One Login MVP.
- ALODILA as Company #1, additive migrations, zero data loss.
- App query helpers + RLS defense in depth.

### Design differently

| From-scratch choice | vs current plan |
|---------------------|-----------------|
| **Auth personas and ALODILA company login binding in the same phase as `companies` seed** | Platform UI (Sprint 2) before tenancy columns was fine; Auth deferred to Sprint 5 is late relative to isolation claims |
| **`NOT NULL` immediately after backfill on clone, then prod** | Nullable soft season is optional, not architectural |
| **No Soft RLS phase** — clone-tested strict company RLS | Soft RLS is a risk-management story that prolongs privileged bypass |
| **SA never gets silent PMS portfolio SELECT once company login exists** | Current soft design preserves SA full access by design |
| **One isolation runbook, fewer parallel “stream” design docs** | Doc-first multi-agent stream model created naming conflicts (Stream B/C flip) and DRAFT drift |
| **Composite unique audit before second company insert** | Still needed; would schedule inside first two-tenant attempt, not a distant Sprint 6 by default |
| **Owner onboarding scoped from day one of multi-tenant design** | Correctly flagged; would not leave as pure Sprint 5 afterthought if NID is global |

### What you would not change even from scratch

- Reject DB-per-tenant for this product stage.
- Reject memberships before isolation is real.
- Reject destructive cleanup of ALODILA rows.
- Keep Vite/React + Supabase.

---

## Assumption-by-assumption rulings

| Assumption | Ruling | Action |
|------------|--------|--------|
| Soft RLS + SA bypass | **Reject as target state**; accept only as hours-long clone experiment if needed | Prefer Auth bind → strict RLS; SA PMS via assume only |
| Dual app + RLS filters | **Accept** as steady state | Strip soft-NULL/default dual logic |
| Transitional SA → ALODILA default | **Accept briefly**, delete on Auth bind | Do not apply soft RLS to prod while this is primary ops path |
| Nullable `company_id` | **Reject past zero-NULL proof** | `NOT NULL` on hard isolation gate |
| Separate Sprint 5 Auth | **Reject separation** from remaining Sprint 4 SQL/QA | Merge into Hard isolation gate |
| `companyDb` adapter layer | **Accept thin helpers**; challenge façade growth | Freeze API; no new soft modes |

---

## Concrete recommendations (priority order)

1. **Freeze soft-RLS-as-destination.** Treat `006` as candidate for rewrite toward strict predicates + `NOT NULL`, or apply only on clone behind Auth-bound company users.
2. **Bind ALODILA company login before calling isolation “done”.** Keep SA for platform registry; stop using SA as the normal PMS session.
3. **Merge remaining Sprint 4 SQL/QA with Sprint 5 Auth into one Hard isolation gate** with a single clone sign-off.
4. **Verify zero NULLs → `NOT NULL`**; delete soft-NULL policy/app branches.
5. **Keep app stamps/filters; do not expand tenancy abstractions.**
6. **Fold cross-tenant structural blockers into the beta gate**; defer assume-company UX and subscriptions.
7. **Collapse Sprint 4 doc set** into one runbook + one QA matrix after decisions land (archive the rest).

---

## Challenge summary answers (explicit)

1. **Simpler architecture?** Yes — same shared-schema tenancy; drop soft-NULL/SA-portfolio transition architecture.
2. **Safer rollout?** Yes — Auth bind + `NOT NULL` + strict RLS on clone before prod; soft+SA is not isolation-safe.
3. **Merge sprints?** Yes — 4-remaining∪5; 6-blockers∪7; keep commercial separate.
4. **Reduce remaining time?** Yes — skip long soft phase and merge gates; ~30–50% of remaining isolation calendar.
5. **Simplify maintenance?** Yes — one claim path, `NOT NULL`, SA≠PMS, one runbook.
6. **Unnecessary abstractions?** Yes — soft-NULL matchers, metadata fallbacks, legacy default as design, rich `companyDb` façade, premature assume product.
7. **From scratch differently?** Same end-state; Auth and hard constraints earlier; no Soft RLS season; SA never silent full portfolio.

---

*End of architecture challenge. No code or SQL changed.*
