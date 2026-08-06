/**
 * Clone / local API smoke — reuses suite.mjs for localhost; minimal subset for clone.
 * REFUSES Production. Clone requires ALLOW_CLONE_SMOKE=YES.
 *
 * Seed users Password123! are LOCAL rls-validation seed only.
 * Clone must have real Auth-bound users — see AUTH_RELEASE_MIGRATION_KIT.md.
 */
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSuite, writeReport } from '../api/suite.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPORTS = path.join(ROOT, 'rls-validation', 'reports');

const PROD_HOST = 'ryfqqyrqmsyngwcsfjug';
const LOCAL_PASSWORD = 'Password123!';

const SUITE_USERS = {
  staffA: 'staff-a@local.alodila.test',
  staffB: 'staff-b@local.alodila.test',
};

const P_B = 'b0b00000-0000-4000-8000-0000000000a3';

const AUTH_BIND_MESSAGE = [
  '',
  '=== Auth bind required ===',
  'Sign-in failed against this Supabase project.',
  '',
  'Password123! and *@local.alodila.test users exist only in LOCAL rls-validation seed.',
  'Clone smoke expects real provisioned users with JWT app_metadata company bindings.',
  'Provision clone Auth users before re-running — see docs/AUTH_RELEASE_MIGRATION_KIT.md.',
  '',
].join('\n');

function isLocalhost(url) {
  const u = String(url || '').toLowerCase();
  return u.includes('127.0.0.1') || u.includes('localhost');
}

function isProduction(url) {
  const u = String(url || '').toLowerCase();
  return u.includes(PROD_HOST) || u.includes('ryfqqyrqmsyngwcsfjug');
}

function assertAllowedHost(url) {
  if (!url) throw new Error('Missing SUPABASE_URL');
  if (isProduction(url)) {
    throw new Error(`Refusing Production Supabase host (${PROD_HOST})`);
  }
  if (isLocalhost(url)) return 'local';
  if (process.env.ALLOW_CLONE_SMOKE === 'YES') return 'clone';
  throw new Error(
    'Refusing non-local Supabase URL without ALLOW_CLONE_SMOKE=YES (clone/staging only)',
  );
}

function parseStatusEnv(stdout) {
  const env = {};
  const trimmed = String(stdout || '').trim();
  if (trimmed.startsWith('{')) {
    try {
      const jsonLine = trimmed.split(/\r?\n/).find((l) => l.trim().startsWith('{')) || trimmed;
      const obj = JSON.parse(jsonLine);
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') env[k] = v;
      }
      return env;
    } catch {
      /* fall through */
    }
  }
  for (const line of trimmed.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').replace(/\r$/, '');
  }
  return env;
}

/** When env vars missing, pull local Docker stack credentials via `supabase status`. */
function resolveLocalStackEnv() {
  // Windows npm shims need shell; args are fixed literals only.
  const r = spawnSync('supabase', ['status', '-o', 'env'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.status !== 0) return null;
  const env = parseStatusEnv(r.stdout || '');
  const url = env.API_URL || env.SUPABASE_URL;
  const anon = env.ANON_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !anon || !isLocalhost(url) || isProduction(url)) return null;
  return { url, anonKey: anon, source: 'supabase status' };
}

function client(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(url, anonKey, email, password = LOCAL_PASSWORD) {
  const sb = client(url, anonKey);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    const err = new Error(`signIn ${email}: ${error.message}`);
    err.code = 'AUTH_BIND_REQUIRED';
    throw err;
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

function writeCloneReport(payload, target) {
  if (!fs.existsSync(REPORTS)) fs.mkdirSync(REPORTS, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const base = `clone-smoke-${target}-${id}`;
  const jsonPath = path.join(REPORTS, `${base}.json`);
  const mdPath = path.join(REPORTS, `${base}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  const lines = [
    `# Clone / API Smoke — ${target}`,
    '',
    `- Status: **${payload.status}**`,
    `- Passed: ${payload.summary.passed} / ${payload.summary.total}`,
    `- Target: ${payload.target}`,
    `- Supabase URL: ${payload.supabaseUrl}`,
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

/** Minimal API checks when runSuite assertLocal would block clone hosts. */
async function runCloneSubset({ url, anonKey }) {
  const results = [];
  let staffA;
  try {
    staffA = await signIn(url, anonKey, SUITE_USERS.staffA);
  } catch (e) {
    if (e.code === 'AUTH_BIND_REQUIRED') throw e;
    throw e;
  }

  {
    const { count, error } = await staffA
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('is_deleted', false);
    record(
      results,
      'SMOKE-SEL-PROP',
      'Staff SELECT properties (clone smoke)',
      'PASS',
      !error && (count ?? 0) >= 1 ? 'PASS' : 'FAIL',
      error?.message || `count=${count ?? 0}`,
    );
  }

  {
    const { data, error } = await staffA.from('properties').select('id').eq('id', P_B);
    const n = data?.length ?? 0;
    record(
      results,
      'SMOKE-IDOR-PROP',
      'Staff must not see cross-company property by id',
      'FAIL',
      n === 0 && !error ? 'FAIL' : 'PASS',
      error?.message || `visible=${n}`,
    );
  }

  try {
    await signIn(url, anonKey, SUITE_USERS.staffB);
    record(results, 'SMOKE-AUTH-B', 'Second company user sign-in', 'PASS', 'PASS', SUITE_USERS.staffB);
  } catch (e) {
    record(
      results,
      'SMOKE-AUTH-B',
      'Second company user sign-in',
      'PASS',
      'FAIL',
      e.message || String(e),
    );
  }

  return results;
}

async function main() {
  let url = process.env.SUPABASE_URL || process.env.LOCAL_SUPABASE_URL;
  let anonKey = process.env.SUPABASE_ANON_KEY || process.env.LOCAL_SUPABASE_ANON_KEY;
  let envSource = 'process.env';

  if (!url || !anonKey) {
    const local = resolveLocalStackEnv();
    if (local) {
      url = url || local.url;
      anonKey = anonKey || local.anonKey;
      envSource = local.source;
    }
  }

  if (!url || !anonKey) {
    console.error('Missing SUPABASE_URL and SUPABASE_ANON_KEY (or LOCAL_* equivalents).');
    console.error('For local Docker: start stack (`npm run local:start`) then re-run, or export keys from `supabase status`.');
    process.exit(2);
  }

  let target;
  try {
    target = assertAllowedHost(url);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(isProduction(url) ? 3 : 4);
  }

  console.log('=== ALODILA-PMS Clone Smoke ===');
  console.log(`Target mode: ${target}`);
  console.log(`URL: ${url}`);
  console.log(`Env source: ${envSource}`);
  console.log(`Production blocked: ${PROD_HOST}`);
  if (target === 'clone') {
    console.log('ALLOW_CLONE_SMOKE=YES acknowledged.');
  }
  console.log('');

  let results;
  try {
    if (target === 'local') {
      results = await runSuite({ url, anonKey });
    } else {
      results = await runCloneSubset({ url, anonKey });
    }
  } catch (e) {
    if (e.code === 'AUTH_BIND_REQUIRED') {
      console.error(AUTH_BIND_MESSAGE);
      process.exit(5);
    }
    console.error(String(e.message || e));
    process.exit(6);
  }

  const passed = results.filter((r) => r.ok).length;
  const payload = {
    status: passed === results.length ? 'PASS' : 'FAIL',
    summary: { passed, failed: results.length - passed, total: results.length },
    results,
    target,
    supabaseUrl: url,
    timestamp: new Date().toISOString(),
  };

  const paths =
    target === 'local'
      ? writeReport(payload)
      : writeCloneReport(payload, target);

  console.log(JSON.stringify({ ...payload.summary, status: payload.status, report: paths.mdPath }, null, 2));
  process.exit(payload.status === 'PASS' ? 0 : 7);
}

main();
