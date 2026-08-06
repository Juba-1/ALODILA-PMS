-- rls-validation/sql/92_validation_suite.sql
-- Enterprise Soft RLS suite. Each case records Purpose / Expected / Actual.
-- Constants:
--   ALODILA a1000000-a10d-4000-8000-000000000001
--   CoB     b2000000-b20d-4000-8000-000000000002

do $$
declare
  c_a uuid := 'a1000000-a10d-4000-8000-000000000001';
  c_b uuid := 'b2000000-b20d-4000-8000-000000000002';
  o_a uuid := 'a0a00000-0000-4000-8000-0000000000a1';
  o_b uuid := 'b0b00000-0000-4000-8000-0000000000b1';
  p_a uuid := 'a0a00000-0000-4000-8000-0000000000a3';
  p_b uuid := 'b0b00000-0000-4000-8000-0000000000a3';
  u_a1 uuid := 'a0a00000-0000-4000-8000-0000000000d1';
  u_a2 uuid := 'a0a00000-0000-4000-8000-0000000000d2';
  u_b1 uuid := 'b0b00000-0000-4000-8000-0000000000d1';
  t_a uuid := 'a0a00000-0000-4000-8000-0000000000a2';
  t_b uuid := 'b0b00000-0000-4000-8000-0000000000a2';
  n int;
  ok boolean;
  err text;
  new_id uuid;
begin
  -- =========================================================================
  -- SELECT isolation — Company A
  -- =========================================================================
  begin
    perform rls_val.set_jwt(rls_val.jwt_company(c_a));
    set local role authenticated;
    select count(*) into n from public.properties where is_deleted = false;
    reset role;
    perform rls_val.record(
      'SEL-PROP-A',
      'Company A SELECT properties — only own company',
      'PASS',
      case when n = 1 then 'PASS' else 'FAIL' end,
      format('count=%s expected=1', n)
    );
  exception when others then
    reset role;
    perform rls_val.record('SEL-PROP-A', 'Company A SELECT properties', 'PASS', 'ERROR', sqlerrm);
  end;

  begin
    perform rls_val.set_jwt(rls_val.jwt_company(c_a));
    set local role authenticated;
    select count(*) into n from public.properties where id = p_b and is_deleted = false;
    reset role;
    perform rls_val.record(
      'IDOR-PROP-B',
      'Company A must NOT see Property B (IDOR)',
      'FAIL',
      case when n = 0 then 'FAIL' else 'PASS' end,
      format('visible_count=%s (FAIL means correctly hidden)', n)
    );
  exception when others then
    reset role;
    perform rls_val.record('IDOR-PROP-B', 'Company A IDOR Property B', 'FAIL', 'ERROR', sqlerrm);
  end;

  -- Company B SELECT units
  begin
    perform rls_val.set_jwt(rls_val.jwt_company(c_b, 'company_staff'));
    set local role authenticated;
    select count(*) into n from public.units where is_deleted = false;
    reset role;
    perform rls_val.record(
      'SEL-UNIT-B',
      'Company B staff SELECT units — only Company B',
      'PASS',
      case when n = 2 then 'PASS' else 'FAIL' end,
      format('count=%s expected=2', n)
    );
  exception when others then
    reset role;
    perform rls_val.record('SEL-UNIT-B', 'Company B SELECT units', 'PASS', 'ERROR', sqlerrm);
  end;

  -- Ledger surfaces
  begin
    perform rls_val.set_jwt(rls_val.jwt_company(c_a));
    set local role authenticated;
    select count(*) into n from public.invoices where is_deleted = false;
    reset role;
    perform rls_val.record(
      'LEDGER-INV-A',
      'Company A invoices (ledger/dashboard scope)',
      'PASS',
      case when n = 1 then 'PASS' else 'FAIL' end,
      format('count=%s', n)
    );
  exception when others then
    reset role;
    perform rls_val.record('LEDGER-INV-A', 'Company A invoices', 'PASS', 'ERROR', sqlerrm);
  end;

  begin
    perform rls_val.set_jwt(rls_val.jwt_company(c_a));
    set local role authenticated;
    select count(*) into n from public.payments where is_deleted = false;
    reset role;
    perform rls_val.record(
      'LEDGER-PAY-A',
      'Company A payments',
      'PASS',
      case when n = 1 then 'PASS' else 'FAIL' end,
      format('count=%s', n)
    );
  exception when others then
    reset role;
    perform rls_val.record('LEDGER-PAY-A', 'Company A payments', 'PASS', 'ERROR', sqlerrm);
  end;

  begin
    perform rls_val.set_jwt(rls_val.jwt_company(c_a));
    set local role authenticated;
    select count(*) into n from public.maintenance_requests where is_deleted = false;
    reset role;
    perform rls_val.record(
      'MAINT-A',
      'Company A maintenance',
      'PASS',
      case when n = 1 then 'PASS' else 'FAIL' end,
      format('count=%s', n)
    );
  exception when others then
    reset role;
    perform rls_val.record('MAINT-A', 'Company A maintenance', 'PASS', 'ERROR', sqlerrm);
  end;

  -- Soft-deleted hidden
  begin
    perform rls_val.set_jwt(rls_val.jwt_company(c_a));
    set local role authenticated;
    select count(*) into n from public.owners where id = 'a0a00000-0000-4000-8000-00000000dead'::uuid;
    reset role;
    perform rls_val.record(
      'SOFT-DEL-HIDE',
      'Soft-deleted owner hidden from company SELECT',
      'FAIL',
      case when n = 0 then 'FAIL' else 'PASS' end,
      format('visible=%s', n)
    );
  exception when others then
    reset role;
    perform rls_val.record('SOFT-DEL-HIDE', 'Soft-deleted owner hide', 'FAIL', 'ERROR', sqlerrm);
  end;

  -- Owner portal
  begin
    perform rls_val.set_jwt(rls_val.jwt_owner(o_a, c_a));
    set local role authenticated;
    select count(*) into n from public.properties where is_deleted = false;
    reset role;
    perform rls_val.record(
      'OWNER-SEL-A',
      'Owner A portal sees own properties',
      'PASS',
      case when n = 1 then 'PASS' else 'FAIL' end,
      format('count=%s', n)
    );
  exception when others then
    reset role;
    perform rls_val.record('OWNER-SEL-A', 'Owner A SELECT', 'PASS', 'ERROR', sqlerrm);
  end;

  begin
    perform rls_val.set_jwt(rls_val.jwt_owner(o_a, c_a));
    set local role authenticated;
    select count(*) into n from public.properties where id = p_b;
    reset role;
    perform rls_val.record(
      'OWNER-IDOR-B',
      'Owner A must not see Property B',
      'FAIL',
      case when n = 0 then 'FAIL' else 'PASS' end,
      format('visible=%s', n)
    );
  exception when others then
    reset role;
    perform rls_val.record('OWNER-IDOR-B', 'Owner A IDOR', 'FAIL', 'ERROR', sqlerrm);
  end;

  -- Platform SA sees PMS (soft design — not isolation evidence)
  begin
    perform rls_val.set_jwt(rls_val.jwt_sa());
    set local role authenticated;
    select count(*) into n from public.properties where is_deleted = false;
    reset role;
    perform rls_val.record(
      'SA-SEL-ALL',
      'Platform SA SELECT sees both companies (expected soft bypass)',
      'PASS',
      case when n >= 2 then 'PASS' else 'FAIL' end,
      format('count=%s', n)
    );
  exception when others then
    reset role;
    perform rls_val.record('SA-SEL-ALL', 'SA SELECT', 'PASS', 'ERROR', sqlerrm);
  end;

  -- user_metadata spoof — must NOT see company data
  begin
    perform rls_val.set_jwt(rls_val.jwt_spoof_user_metadata(c_a));
    set local role authenticated;
    select count(*) into n from public.properties where is_deleted = false;
    reset role;
    perform rls_val.record(
      'SPOOF-UMETA',
      'user_metadata company spoof must not grant SELECT',
      'FAIL',
      case when n = 0 then 'FAIL' else 'PASS' end,
      format('visible=%s', n)
    );
  exception when others then
    reset role;
    perform rls_val.record('SPOOF-UMETA', 'user_metadata spoof', 'FAIL', 'ERROR', sqlerrm);
  end;

  -- Owner spoof via user_metadata
  begin
    perform rls_val.set_jwt(rls_val.jwt_spoof_user_metadata(c_a, o_a));
    set local role authenticated;
    select count(*) into n from public.owners where id = o_a;
    reset role;
    perform rls_val.record(
      'SPOOF-OWNER-UMETA',
      'user_metadata owner spoof must not grant owner self SELECT',
      'FAIL',
      case when n = 0 then 'FAIL' else 'PASS' end,
      format('visible=%s', n)
    );
  exception when others then
    reset role;
    perform rls_val.record('SPOOF-OWNER-UMETA', 'owner user_metadata spoof', 'FAIL', 'ERROR', sqlerrm);
  end;

  -- =========================================================================
  -- INSERT / WITH CHECK
  -- =========================================================================
  begin
    perform rls_val.set_jwt(rls_val.jwt_company(c_a));
    set local role authenticated;
    insert into public.tenants (
      national_id_or_cr, full_name, tenant_type, phone, national_address, company_id, is_deleted
    ) values (
      'T-A-NEW-001', 'Tenant A New', 'Individual', '0510999001', 'Riyadh', c_a, false
    ) returning id into new_id;
    reset role;
    perform rls_val.record('INS-TENANT-A', 'Company A INSERT tenant same company', 'PASS', 'PASS', new_id::text);
  exception when others then
    reset role;
    perform rls_val.record('INS-TENANT-A', 'Company A INSERT tenant', 'PASS', 'ERROR', sqlerrm);
  end;

  -- Cross-company stamp on INSERT
  begin
    ok := false;
    err := null;
    perform rls_val.set_jwt(rls_val.jwt_company(c_a));
    set local role authenticated;
    begin
      insert into public.tenants (
        national_id_or_cr, full_name, tenant_type, phone, national_address, company_id, is_deleted
      ) values (
        'T-X-BAD', 'Cross Stamp', 'Individual', '0510999002', 'X', c_b, false
      );
      ok := true;
    exception when others then
      err := sqlerrm;
      ok := false;
    end;
    reset role;
    perform rls_val.record(
      'INS-XCOMP-STAMP',
      'Company A INSERT with Company B company_id must FAIL WITH CHECK',
      'FAIL',
      case when ok then 'PASS' else 'FAIL' end,
      err
    );
  exception when others then
    reset role;
    perform rls_val.record('INS-XCOMP-STAMP', 'cross company stamp', 'FAIL', 'ERROR', sqlerrm);
  end;

  -- Cross-company unit attach (unit of B under company A row)
  begin
    ok := false;
    err := null;
    perform rls_val.set_jwt(rls_val.jwt_company(c_a));
    set local role authenticated;
    begin
      insert into public.units (
        property_id, unit_name, type, target_rent_value, company_id, is_deleted
      ) values (
        p_b, 'Hijack', 'Residential', 1, c_a, false
      );
      ok := true;
    exception when others then
      err := sqlerrm;
      ok := false;
    end;
    reset role;
    perform rls_val.record(
      'INS-XCOMP-PARENT',
      'Company A INSERT unit under Property B must FAIL',
      'FAIL',
      case when ok then 'PASS' else 'FAIL' end,
      err
    );
  exception when others then
    reset role;
    perform rls_val.record('INS-XCOMP-PARENT', 'cross company parent', 'FAIL', 'ERROR', sqlerrm);
  end;

  -- secondary_unit_ids cross-company
  begin
    ok := false;
    err := null;
    perform rls_val.set_jwt(rls_val.jwt_company(c_a));
    set local role authenticated;
    begin
      insert into public.contracts (
        unit_id, tenant_id, start_date, end_date, contract_value, deposit,
        billing_cycle, status, secondary_unit_ids, company_id, is_deleted
      ) values (
        u_a1, t_a, '2026-03-01', '2027-03-01', 1, 0, 'monthly', 'active',
        jsonb_build_array(u_b1), c_a, false
      );
      ok := true;
    exception when others then
      err := sqlerrm;
      ok := false;
    end;
    reset role;
    perform rls_val.record(
      'SEC-UNIT-XCOMP',
      'secondary_unit_ids pointing at Company B unit must FAIL',
      'FAIL',
      case when ok then 'PASS' else 'FAIL' end,
      err
    );
  exception when others then
    reset role;
    perform rls_val.record('SEC-UNIT-XCOMP', 'secondary_unit_ids cross-company', 'FAIL', 'ERROR', sqlerrm);
  end;

  -- secondary_unit_ids same company OK
  begin
    perform rls_val.set_jwt(rls_val.jwt_company(c_a));
    set local role authenticated;
    insert into public.contracts (
      unit_id, tenant_id, start_date, end_date, contract_value, deposit,
      billing_cycle, status, secondary_unit_ids, company_id, is_deleted
    ) values (
      u_a1, t_a, '2026-04-01', '2027-04-01', 1, 0, 'monthly', 'active',
      jsonb_build_array(u_a2), c_a, false
    );
    reset role;
    perform rls_val.record('SEC-UNIT-OK', 'secondary_unit_ids same company INSERT', 'PASS', 'PASS', null);
  exception when others then
    reset role;
    perform rls_val.record('SEC-UNIT-OK', 'secondary_unit_ids same company', 'PASS', 'ERROR', sqlerrm);
  end;

  -- Cross-company owner_crm_id on property
  begin
    ok := false;
    err := null;
    perform rls_val.set_jwt(rls_val.jwt_company(c_a));
    set local role authenticated;
    begin
      insert into public.properties (
        name, type, total_units_capacity, owner_id, owner_crm_id, company_id, is_deleted
      ) values (
        'Bad Owner Attach', 'Residential', 1,
        '11111111-1111-4111-8111-111111111111'::uuid,
        o_b, c_a, false
      );
      ok := true;
    exception when others then
      err := sqlerrm;
      ok := false;
    end;
    reset role;
    perform rls_val.record(
      'OWN-ATTACH-XCOMP',
      'Attach Owner B to Company A property must FAIL',
      'FAIL',
      case when ok then 'PASS' else 'FAIL' end,
      err
    );
  exception when others then
    reset role;
    perform rls_val.record('OWN-ATTACH-XCOMP', 'cross owner attach', 'FAIL', 'ERROR', sqlerrm);
  end;

  -- =========================================================================
  -- UPDATE / soft delete
  -- =========================================================================
  begin
    perform rls_val.set_jwt(rls_val.jwt_company(c_a));
    set local role authenticated;
    update public.tenants set phone = '0510111222'
    where id = t_a and is_deleted = false;
    get diagnostics n = row_count;
    reset role;
    perform rls_val.record(
      'UPD-TENANT-A',
      'Company A UPDATE own tenant',
      'PASS',
      case when n = 1 then 'PASS' else 'FAIL' end,
      format('row_count=%s', n)
    );
  exception when others then
    reset role;
    perform rls_val.record('UPD-TENANT-A', 'Company A UPDATE tenant', 'PASS', 'ERROR', sqlerrm);
  end;

  begin
    perform rls_val.set_jwt(rls_val.jwt_company(c_a));
    set local role authenticated;
    update public.tenants set phone = 'hacked'
    where id = t_b and is_deleted = false;
    get diagnostics n = row_count;
    reset role;
    perform rls_val.record(
      'UPD-IDOR-B',
      'Company A UPDATE Company B tenant must affect 0 rows',
      'FAIL',
      case when n = 0 then 'FAIL' else 'PASS' end,
      format('row_count=%s', n)
    );
  exception when others then
    reset role;
    perform rls_val.record('UPD-IDOR-B', 'UPDATE IDOR', 'FAIL', 'ERROR', sqlerrm);
  end;

  begin
    perform rls_val.set_jwt(rls_val.jwt_company(c_a));
    set local role authenticated;
    update public.owners set is_deleted = true
    where id = o_a and is_deleted = false;
    get diagnostics n = row_count;
    -- restore for further tests
    reset role;
    update public.owners set is_deleted = false where id = o_a;
    perform rls_val.record(
      'SOFT-DEL-A',
      'Company A soft-delete own owner (UPDATE is_deleted)',
      'PASS',
      case when n = 1 then 'PASS' else 'FAIL' end,
      format('row_count=%s', n)
    );
  exception when others then
    reset role;
    update public.owners set is_deleted = false where id = o_a;
    perform rls_val.record('SOFT-DEL-A', 'soft delete', 'PASS', 'ERROR', sqlerrm);
  end;

  -- Hard DELETE should have no policy → fail or 0
  begin
    ok := false;
    err := null;
    perform rls_val.set_jwt(rls_val.jwt_company(c_a));
    set local role authenticated;
    begin
      delete from public.tenants where id = t_a;
      get diagnostics n = row_count;
      ok := (n > 0);
    exception when others then
      err := sqlerrm;
      ok := false;
    end;
    reset role;
    perform rls_val.record(
      'HARD-DEL-BLOCK',
      'Hard DELETE blocked (no DELETE policy / RLS deny)',
      'FAIL',
      case when ok then 'PASS' else 'FAIL' end,
      coalesce(err, format('row_count_attempted_success=%s', ok))
    );
  exception when others then
    reset role;
    perform rls_val.record('HARD-DEL-BLOCK', 'hard delete', 'FAIL', 'ERROR', sqlerrm);
  end;

  -- Privilege escalation: company trying to become SA via top-level only without app_metadata
  begin
    perform rls_val.set_jwt(jsonb_build_object(
      'sub', '11111111-1111-4111-8111-111111111111',
      'role', 'super_admin',
      'app_metadata', jsonb_build_object('role', 'company', 'company_id', c_a::text)
    ));
    -- is_super_admin reads app_metadata.role FIRST → still company, not SA
    set local role authenticated;
    select count(*) into n from public.companies where is_deleted = false;
    reset role;
    perform rls_val.record(
      'PRIV-ESC-SA',
      'Top-level super_admin with app_metadata.company must not list companies (SA-only)',
      'FAIL',
      case when n = 0 then 'FAIL' else 'PASS' end,
      format('companies_visible=%s', n)
    );
  exception when others then
    reset role;
    perform rls_val.record('PRIV-ESC-SA', 'privilege escalation', 'FAIL', 'ERROR', sqlerrm);
  end;

  -- Smart-import style: meters SELECT scoped
  begin
    perform rls_val.set_jwt(rls_val.jwt_company(c_b));
    set local role authenticated;
    select count(*) into n from public.meters where is_deleted = false;
    reset role;
    perform rls_val.record(
      'IMPORT-METERS-B',
      'Company B meters scope (smart import surface)',
      'PASS',
      case when n = 1 then 'PASS' else 'FAIL' end,
      format('count=%s', n)
    );
  exception when others then
    reset role;
    perform rls_val.record('IMPORT-METERS-B', 'meters scope', 'PASS', 'ERROR', sqlerrm);
  end;

  perform rls_val.clear_jwt();
end $$;

-- Machine-readable summary for the orchestrator
select
  count(*) filter (where ok) as passed,
  count(*) filter (where not ok) as failed,
  count(*) as total
from rls_val.results;

select test_id, purpose, expected, actual, detail, ok
from rls_val.results
order by id;
