/**
 * ONE COMMAND: Local Supabase Development & Validation Platform
 *
 * DETECT → VERIFY → (start) → RESET(migrations+seed) → API VALIDATE → REPORT
 * Never touches Production.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { runSuite, writeReport, assertLocal } from '../api/suite.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function resolveCmd(cmd) {
  if (process.platform !== 'win32') return cmd;
  if (cmd === 'docker') return 'docker.exe';
  return cmd;
}

function run(cmd, args, opts = {}) {
  // Windows npm shims (.cmd/.ps1) require shell; args here are always fixed literals.
  const useShell = process.platform === 'win32';
  const r = spawnSync(resolveCmd(cmd), args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: useShell,
    windowsHide: true,
    maxBuffer: 50 * 1024 * 1024,
    ...opts,
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.error ? String(r.error.message || r.error) : null,
  };
}

function parseStatus(stdout) {
  const services = {};
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^\s*(\w+)\s*:\s*(.+)$/);
    if (m) services[m[1].toLowerCase()] = m[2].trim();
  }
  // Also parse API URL / keys from `supabase status -o env`
  return services;
}

function parseEnvOutput(stdout) {
  const env = {};
  // status -o env may be a single JSON object or KEY=VALUE lines
  const trimmed = stdout.trim();
  if (trimmed.startsWith('{')) {
    try {
      const jsonLine = trimmed.split(/\r?\n/).find((l) => l.trim().startsWith('{')) || trimmed;
      const obj = JSON.parse(jsonLine);
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') env[k] = v;
      }
      return env;
    } catch {
      /* fall through to line parser */
    }
  }
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim().replace(/^["']|["']$/g, '').replace(/\r$/, '');
    env[m[1]] = v;
  }
  return env;
}

async function main() {
  const report = {
    timestamp: new Date().toISOString(),
    productionTouched: false,
    stages: [],
    repairs: [],
    blockers: [],
    status: 'STOPPED',
  };

  console.log('=== LOCAL SUPABASE VALIDATION PLATFORM ===');
  console.log('DETECT…');

  const docker = run('docker', ['info']);
  if (docker.status !== 0) {
    report.blockers.push('Docker not available / not running');
    report.status = 'STOPPED_AT_DETECT';
    console.error('STOP: Docker required');
    process.exit(2);
  }

  const cli = run('supabase', ['--version']);
  if (cli.status !== 0) {
    report.blockers.push('Supabase CLI missing');
    report.status = 'STOPPED_AT_DETECT';
    process.exit(2);
  }

  if (!fs.existsSync(path.join(ROOT, 'supabase', 'config.toml'))) {
    report.blockers.push('supabase/config.toml missing — run supabase init');
    report.status = 'STOPPED_AT_DETECT';
    process.exit(2);
  }

  report.stages.push({ name: 'DETECT', status: 'OK', detail: `cli=${cli.stdout.trim()}` });

  console.log('VERIFY / START…');
  let status = run('supabase', ['status', '-o', 'env']);
  if (status.status !== 0) {
    console.log('Local stack not running — starting (may download images)…');
    const start = run('supabase', ['start'], { timeout: 0 });
    // spawnSync timeout 0 may not wait forever on node - default is unlimited
    if (start.status !== 0) {
      report.stages.push({ name: 'START', status: 'FAIL', detail: start.stderr || start.stdout });
      report.blockers.push('supabase start failed');
      report.status = 'STOPPED_AT_START';
      console.error(start.stderr || start.stdout);
      process.exit(3);
    }
    report.stages.push({ name: 'START', status: 'OK' });
    status = run('supabase', ['status', '-o', 'env']);
  } else {
    report.stages.push({ name: 'START', status: 'OK', detail: 'already running' });
  }

  if (status.status !== 0) {
    report.blockers.push('supabase status failed after start');
    report.status = 'STOPPED_AT_VERIFY';
    process.exit(3);
  }

  const env = parseEnvOutput(status.stdout);
  const url = env.API_URL || env.SUPABASE_URL;
  const anon = env.ANON_KEY || env.SUPABASE_ANON_KEY;
  const service = env.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    assertLocal(url);
  } catch (e) {
    report.blockers.push(String(e.message || e));
    report.status = 'STOPPED_AT_VERIFY';
    process.exit(3);
  }

  report.supabaseEnv = {
    apiUrl: url,
    hasAnon: Boolean(anon),
    hasService: Boolean(service),
    dbUrl: env.DB_URL ? 'present' : 'missing',
  };
  report.stages.push({ name: 'VERIFY', status: 'OK', detail: url });

  console.log('RESET (migrations + seed)…');
  const reset = run('supabase', ['db', 'reset', '--yes']);
  if (reset.status !== 0) {
    report.stages.push({
      name: 'RESET',
      status: 'FAIL',
      detail: (reset.stderr || reset.stdout).slice(0, 4000),
    });
    report.blockers.push('supabase db reset failed — see detail');
    report.status = 'STOPPED_AT_MIGRATE';
    console.error(reset.stderr || reset.stdout);
    // Attempt one self-heal: if identities conflict, surface clearly
    process.exit(4);
  }
  report.stages.push({ name: 'RESET', status: 'OK', detail: 'migrations + seed applied' });
  report.migrationStatus = 'APPLIED_VIA_DB_RESET';
  report.seedStatus = 'APPLIED_VIA_DB_RESET';

  console.log('API VALIDATE…');
  // Auth/Kong may briefly 502 while containers restart after reset
  let authReady = false;
  for (let i = 0; i < 40; i++) {
    try {
      const health = await fetch(`${url}/auth/v1/health`);
      if (health.ok) {
        const probe = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
        const { error } = await probe.auth.signInWithPassword({
          email: 'staff-a@local.alodila.test',
          password: 'Password123!',
        });
        if (!error) {
          authReady = true;
          break;
        }
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!authReady) {
    report.stages.push({ name: 'VALIDATE', status: 'FAIL', detail: 'Auth not ready after reset (health/signIn)' });
    report.blockers.push('Local Auth returned 502/errors after db reset — retry npm run local:validate');
    report.status = 'STOPPED_AT_VALIDATE';
    console.error('STOP: Auth not ready after reset');
    process.exit(5);
  }

  let results;
  try {
    results = await runSuite({ url, anonKey: anon });
  } catch (e) {
    report.stages.push({ name: 'VALIDATE', status: 'FAIL', detail: String(e.message || e) });
    report.blockers.push(`API suite threw: ${e.message || e}`);
    report.status = 'STOPPED_AT_VALIDATE';
    console.error(e);
    process.exit(5);
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  report.summary = { passed, failed, total: results.length };
  report.results = results;
  report.stages.push({
    name: 'VALIDATE',
    status: failed === 0 ? 'OK' : 'FAIL',
    detail: `passed=${passed} failed=${failed}`,
  });

  const payload = {
    status: failed === 0 ? 'PASS' : 'FAIL',
    summary: report.summary,
    results,
    timestamp: report.timestamp,
    stages: report.stages,
    repairs: report.repairs,
  };
  const paths = writeReport(payload);
  report.reportPaths = paths;
  report.status = payload.status;
  report.stages.push({ name: 'REPORT', status: 'OK', detail: paths.mdPath });

  console.log('===', report.status, '===');
  console.log(JSON.stringify({ summary: report.summary, report: paths.mdPath }, null, 2));
  process.exit(report.status === 'PASS' ? 0 : 7);
}

main();
