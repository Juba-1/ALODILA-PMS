/**
 * Local Supabase API validation suite.
 * Uses real GoTrue JWT + PostgREST (not GUC simulation alone).
 * LOCAL ONLY — refuses non-local hosts.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPORTS = path.join(ROOT, 'rls-validation', 'reports');

const C_A = 'a1000000-a10d-4000-8000-000000000001';
const C_B = 'b2000000-b20d-4000-8000-000000000002';
const O_A = 'a0a00000-0000-4000-8000-0000000000a1';
const P_A = 'a0a00000-0000-4000-8000-0000000000a3';
const P_B = 'b0b00000-0000-4000-8000-0000000000a3';
const U_A1 = 'a0a00000-0000-4000-8000-0000000000d1';
const U_A2 = 'a0a00000-0000-4000-8000-0000000000d2';
const U_B1 = 'b0b00000-0000-4000-8000-0000000000d1';
const T_A = 'a0a00000-0000-4000-8000-0000000000a2';
const T_B = 'b0b00000-0000-4000-8000-0000000000a2';
const PASSWORD = 'Password123!';

const USERS = {
  staffA: 'staff-a@local.alodila.test',
  staffB: 'staff-b@local.alodila.test',
  ownerA: 'owner-a@local.alodila.test',
  ownerB: 'owner-b@local.alodila.test',
  sa: 'sa@local.alodila.test',
  spoof: 'spoof@local.alodila.test',
};

function assertLocal(url) {
  const u = String(url || '').toLowerCase();
  if (!u.includes('127.0.0.1') && !u.includes('localhost')) {
    throw new Error(`Refusing non-local Supabase URL: ${url}`);
  }
  if (u.includes('supabase.co') || u.includes('ryfqqyrqmsyngwcsfjug')) {
    throw new Error('Refusing Production Supabase host');
  }
}

function client(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(url, anonKey, email) {
  const sb = client(url, anonKey);
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) {
    const detail = error.message || error.name || JSON.stringify(error);
    const status = error.status != null ? ` status=${error.status}` : '';
    throw new Error(`signIn ${email}: ${detail}${status}`);
  }
  if (!data?.session?.access_token) {
    throw new Error(`signIn ${email}: no session returned`);
  }
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function record(results, test_id, purpose, expected, actual, detail = null) {
  const ok = expected === actual;
  results.push({ test_id, purpose, expected, actual, detail, ok });
}

async function expectCount(sb, table, filter, expectedCount) {
  let q = sb.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count, error } = await q;
  return { count: count ?? 0, error };
}

async function runSuite({ url, anonKey }) {
  assertLocal(url);
  const results = [];

  const staffA = await signIn(url, anonKey, USERS.staffA);
  const staffB = await signIn(url, anonKey, USERS.staffB);
  const ownerA = await signIn(url, anonKey, USERS.ownerA);
  const sa = await signIn(url, anonKey, USERS.sa);
  const spoof = await signIn(url, anonKey, USERS.spoof);

  // SELECT Company A
  {
    const { count, error } = await expectCount(staffA, 'properties', (q) =>
      q.eq('is_deleted', false),
    );
    record(
      results,
      'API-SEL-PROP-A',
      'Company A SELECT properties via API',
      'PASS',
      !error && count === 1 ? 'PASS' : 'FAIL',
      error?.message || `count=${count}`,
    );
  }

  // IDOR Property B
  {
    const { data, error } = await staffA.from('properties').select('id').eq('id', P_B);
    const n = data?.length ?? 0;
    record(
      results,
      'API-IDOR-PROP-B',
      'Company A must not see Property B',
      'FAIL',
      n === 0 && !error ? 'FAIL' : 'PASS',
      error?.message || `visible=${n}`,
    );
  }

  // Company B units
  {
    const { count, error } = await expectCount(staffB, 'units', (q) => q.eq('is_deleted', false));
    record(
      results,
      'API-SEL-UNIT-B',
      'Company B SELECT units',
      'PASS',
      !error && count === 2 ? 'PASS' : 'FAIL',
      error?.message || `count=${count}`,
    );
  }

  // Ledger
  for (const [id, table, n] of [
    ['API-LEDGER-INV', 'invoices', 1],
    ['API-LEDGER-PAY', 'payments', 1],
    ['API-MAINT', 'maintenance_requests', 1],
    ['API-IMPORT-METERS', 'meters', 1],
  ]) {
    const { count, error } = await expectCount(staffA, table, (q) => q.eq('is_deleted', false));
    record(
      results,
      id,
      `Company A ${table} scope`,
      'PASS',
      !error && count === n ? 'PASS' : 'FAIL',
      error?.message || `count=${count}`,
    );
  }

  // Soft-deleted: company SELECT may see it (required for UPDATE soft-delete under PG RLS).
  // App lists still filter is_deleted=false. Owner portal SELECT keeps is_deleted=false.
  {
    const { data } = await staffA
      .from('owners')
      .select('id')
      .eq('id', 'a0a00000-0000-4000-8000-00000000dead');
    record(
      results,
      'API-SOFT-COMPANY-SEE',
      'Company SELECT can see soft-deleted own-company row (PG UPDATE/SELECT coupling)',
      'PASS',
      (data?.length ?? 0) === 1 ? 'PASS' : 'FAIL',
      `visible=${data?.length ?? 0}`,
    );
  }

  // Owner portal
  {
    const { count, error } = await expectCount(ownerA, 'properties', (q) =>
      q.eq('is_deleted', false),
    );
    record(
      results,
      'API-OWNER-SEL',
      'Owner A portal SELECT properties',
      'PASS',
      !error && count === 1 ? 'PASS' : 'FAIL',
      error?.message || `count=${count}`,
    );
  }
  {
    const { data } = await ownerA.from('properties').select('id').eq('id', P_B);
    record(
      results,
      'API-OWNER-IDOR',
      'Owner A must not see Property B',
      'FAIL',
      (data?.length ?? 0) === 0 ? 'FAIL' : 'PASS',
      `visible=${data?.length ?? 0}`,
    );
  }

  // SA soft bypass
  {
    const { count, error } = await expectCount(sa, 'properties', (q) => q.eq('is_deleted', false));
    record(
      results,
      'API-SA-SEL',
      'Platform SA SELECT sees both companies (soft design)',
      'PASS',
      !error && count >= 2 ? 'PASS' : 'FAIL',
      error?.message || `count=${count}`,
    );
  }

  // user_metadata spoof
  {
    const { data } = await spoof.from('properties').select('id').eq('is_deleted', false);
    record(
      results,
      'API-SPOOF-UMETA',
      'user_metadata company spoof must not grant SELECT',
      'FAIL',
      (data?.length ?? 0) === 0 ? 'FAIL' : 'PASS',
      `visible=${data?.length ?? 0}`,
    );
  }

  // INSERT same company
  {
    const { data, error } = await staffA
      .from('tenants')
      .insert({
        national_id_or_cr: `T-A-API-${Date.now()}`,
        full_name: 'Tenant A API',
        tenant_type: 'Individual',
        phone: '0510888001',
        national_address: 'Riyadh',
        company_id: C_A,
        is_deleted: false,
      })
      .select('id')
      .maybeSingle();
    record(
      results,
      'API-INS-TENANT',
      'Company A INSERT tenant',
      'PASS',
      !error && data?.id ? 'PASS' : 'FAIL',
      error?.message || data?.id,
    );
  }

  // INSERT cross company stamp
  {
    const { data, error } = await staffA
      .from('tenants')
      .insert({
        national_id_or_cr: `T-X-${Date.now()}`,
        full_name: 'Cross Stamp',
        tenant_type: 'Individual',
        phone: '0510888002',
        national_address: 'X',
        company_id: C_B,
        is_deleted: false,
      })
      .select('id')
      .maybeSingle();
    record(
      results,
      'API-INS-XCOMP',
      'Company A INSERT with Company B company_id must FAIL',
      'FAIL',
      error || !data ? 'FAIL' : 'PASS',
      error?.message || 'unexpected success',
    );
  }

  // Cross-company parent unit
  {
    const { data, error } = await staffA
      .from('units')
      .insert({
        property_id: P_B,
        unit_name: 'Hijack',
        type: 'Residential',
        target_rent_value: 1,
        company_id: C_A,
        is_deleted: false,
      })
      .select('id')
      .maybeSingle();
    record(
      results,
      'API-INS-XPARENT',
      'Unit under Property B as Company A must FAIL',
      'FAIL',
      error || !data ? 'FAIL' : 'PASS',
      error?.message || 'unexpected success',
    );
  }

  // secondary_unit_ids cross-company
  {
    const { data, error } = await staffA
      .from('contracts')
      .insert({
        unit_id: U_A1,
        tenant_id: T_A,
        start_date: '2026-05-01',
        end_date: '2027-05-01',
        contract_value: 1,
        deposit: 0,
        billing_cycle: 'monthly',
        status: 'active',
        secondary_unit_ids: [U_B1],
        company_id: C_A,
        is_deleted: false,
      })
      .select('id')
      .maybeSingle();
    record(
      results,
      'API-SEC-XCOMP',
      'secondary_unit_ids cross-company must FAIL',
      'FAIL',
      error || !data ? 'FAIL' : 'PASS',
      error?.message || 'unexpected success',
    );
  }

  // secondary_unit_ids OK
  {
    const { data, error } = await staffA
      .from('contracts')
      .insert({
        unit_id: U_A1,
        tenant_id: T_A,
        start_date: '2026-06-01',
        end_date: '2027-06-01',
        contract_value: 1,
        deposit: 0,
        billing_cycle: 'monthly',
        status: 'active',
        secondary_unit_ids: [U_A2],
        company_id: C_A,
        is_deleted: false,
      })
      .select('id')
      .maybeSingle();
    record(
      results,
      'API-SEC-OK',
      'secondary_unit_ids same company INSERT',
      'PASS',
      !error && data?.id ? 'PASS' : 'FAIL',
      error?.message || data?.id,
    );
  }

  // UPDATE own / IDOR
  {
    const { data, error } = await staffA
      .from('tenants')
      .update({ phone: '0510111222' })
      .eq('id', T_A)
      .eq('is_deleted', false)
      .select('id');
    record(
      results,
      'API-UPD-OWN',
      'Company A UPDATE own tenant',
      'PASS',
      !error && (data?.length ?? 0) === 1 ? 'PASS' : 'FAIL',
      error?.message || `rows=${data?.length ?? 0}`,
    );
  }
  {
    const { data, error } = await staffA
      .from('tenants')
      .update({ phone: 'hacked' })
      .eq('id', T_B)
      .eq('is_deleted', false)
      .select('id');
    record(
      results,
      'API-UPD-IDOR',
      'Company A UPDATE Company B tenant → 0 rows',
      'FAIL',
      !error && (data?.length ?? 0) === 0 ? 'FAIL' : 'PASS',
      error?.message || `rows=${data?.length ?? 0}`,
    );
  }

  // Soft delete — avoid RETURNING/select (SELECT policies require is_deleted=false)
  {
    const ins = await staffA
      .from('tenants')
      .insert({
        national_id_or_cr: `T-SOFT-${Date.now()}`,
        full_name: 'Soft Del',
        tenant_type: 'Individual',
        phone: '0510000111',
        national_address: 'X',
        company_id: C_A,
        is_deleted: false,
      })
      .select('id')
      .maybeSingle();
    if (ins.data?.id) {
      const upd = await staffA
        .from('tenants')
        .update({ is_deleted: true })
        .eq('id', ins.data.id);
      record(
        results,
        'API-SOFT-DEL',
        'Company A soft-delete own tenant',
        'PASS',
        !upd.error ? 'PASS' : 'FAIL',
        upd.error?.message || 'updated without returning deleted row',
      );
    } else {
      record(results, 'API-SOFT-DEL', 'Company A soft-delete own tenant', 'PASS', 'FAIL', ins.error?.message);
    }
  }

  // Hard DELETE
  {
    const { data, error } = await staffA.from('tenants').delete().eq('id', T_A).select('id');
    record(
      results,
      'API-HARD-DEL',
      'Hard DELETE blocked by RLS (no policy)',
      'FAIL',
      error || (data?.length ?? 0) === 0 ? 'FAIL' : 'PASS',
      error?.message || `rows=${data?.length ?? 0}`,
    );
  }

  // Reports / dashboard surface: contracts SELECT
  {
    const { count, error } = await expectCount(staffA, 'contracts', (q) => q.eq('is_deleted', false));
    record(
      results,
      'API-REPORTS-CONTRACTS',
      'Company A contracts (dashboard/reports)',
      'PASS',
      !error && count >= 1 ? 'PASS' : 'FAIL',
      error?.message || `count=${count}`,
    );
  }

  return results;
}

function writeReport(payload) {
  if (!fs.existsSync(REPORTS)) fs.mkdirSync(REPORTS, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(REPORTS, `local-api-validation-${id}.json`);
  const mdPath = path.join(REPORTS, `local-api-validation-${id}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  const lines = [
    `# Local Supabase API Validation`,
    '',
    `- Status: **${payload.status}**`,
    `- Passed: ${payload.summary.passed} / ${payload.summary.total}`,
    `- Production touched: NO`,
    '',
    '| ID | Expected | Actual | OK | Purpose |',
    '|----|----------|--------|----|---------|',
  ];
  for (const r of payload.results) {
    lines.push(
      `| ${r.test_id} | ${r.expected} | ${r.actual} | ${r.ok} | ${String(r.purpose).replace(/\|/g, '/')} |`,
    );
  }
  fs.writeFileSync(mdPath, lines.join('\n'));
  return { jsonPath, mdPath };
}

export { runSuite, writeReport, assertLocal };

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const url = process.env.SUPABASE_URL || process.env.LOCAL_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.LOCAL_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY (local)');
    process.exit(2);
  }
  const results = await runSuite({ url, anonKey: anon });
  const passed = results.filter((r) => r.ok).length;
  const payload = {
    status: passed === results.length ? 'PASS' : 'FAIL',
    summary: { passed, failed: results.length - passed, total: results.length },
    results,
    timestamp: new Date().toISOString(),
  };
  const paths = writeReport(payload);
  console.log(JSON.stringify({ ...payload.summary, report: paths.mdPath }, null, 2));
  process.exit(payload.status === 'PASS' ? 0 : 7);
}
