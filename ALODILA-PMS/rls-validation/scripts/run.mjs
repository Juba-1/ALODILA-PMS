/**
 * ONE-COMMAND RLS validation orchestrator.
 *
 * Stages: DETECT → VERIFY → BUILD → SEED → EXECUTE → REPORT → CLEANUP
 * Stops on first hard prerequisite failure. Never touches Production.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { detect } from './detect.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORTS = path.join(ROOT, 'reports');

const args = new Set(process.argv.slice(2));
const KEEP_DB = args.has('--keep-db');
const DETECT_ONLY = args.has('--detect-only');
const NO_REPORT = args.has('--no-report');

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function psqlEnv(cfg) {
  return {
    ...process.env,
    PGPASSWORD: cfg.password,
    PGHOST: cfg.host,
    PGPORT: String(cfg.port),
    PGUSER: cfg.user,
    PGSSLMODE: process.env.RLS_PGSSLMODE || 'disable',
  };
}

function runPsql(psql, cfg, database, sqlFileOrArgs, opts = {}) {
  const env = psqlEnv(cfg);
  const base = ['-v', 'ON_ERROR_STOP=1', '-d', database, '-h', cfg.host, '-p', String(cfg.port), '-U', cfg.user];
  let argsOut;
  if (opts.command) {
    argsOut = [...base, '-c', opts.command];
  } else if (opts.file) {
    argsOut = [...base, '-f', opts.file];
  } else {
    argsOut = [...base, ...sqlFileOrArgs];
  }
  const r = spawnSync(psql, argsOut, {
    encoding: 'utf8',
    env,
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.error ? String(r.error.message || r.error) : null,
  };
}

function verifyConnectivity(psql, cfg) {
  const r = runPsql(psql, cfg, cfg.maintenanceDb, null, {
    command: "select current_user, current_database(), version();",
  });
  if (r.status !== 0) {
    return {
      ok: false,
      detail: r.stderr || r.error || r.stdout || 'psql failed',
    };
  }
  return { ok: true, detail: r.stdout.trim() };
}

function dropValidationDb(psql, cfg) {
  // Terminate backends then drop
  runPsql(psql, cfg, cfg.maintenanceDb, null, {
    command: `
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${cfg.validationDb.replace(/'/g, "''")}'
  AND pid <> pg_backend_pid();
`,
  });
  const r = runPsql(psql, cfg, cfg.maintenanceDb, null, {
    command: `DROP DATABASE IF EXISTS ${cfg.validationDb};`,
  });
  return r.status === 0;
}

function createValidationDb(psql, cfg) {
  dropValidationDb(psql, cfg);
  const r = runPsql(psql, cfg, cfg.maintenanceDb, null, {
    command: `CREATE DATABASE ${cfg.validationDb};`,
  });
  return { ok: r.status === 0, detail: r.stderr || r.stdout || r.error };
}

function applyFile(psql, cfg, absPath, stageLog) {
  const name = path.basename(absPath);
  const r = runPsql(psql, cfg, cfg.validationDb, null, { file: absPath });
  stageLog.push({
    file: name,
    path: absPath,
    ok: r.status === 0,
    stderr: (r.stderr || '').slice(0, 4000),
    stdout: (r.stdout || '').slice(0, 2000),
  });
  return r.status === 0;
}

function writeReport(payload) {
  if (!fs.existsSync(REPORTS)) fs.mkdirSync(REPORTS, { recursive: true });
  const id = stamp();
  const jsonPath = path.join(REPORTS, `rls-validation-${id}.json`);
  const mdPath = path.join(REPORTS, `rls-validation-${id}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');

  const lines = [
    `# RLS Validation Report`,
    ``,
    `- Generated: ${payload.timestamp}`,
    `- Pipeline status: **${payload.pipelineStatus}**`,
    `- Validation DB: \`${payload.validationDb}\``,
    `- Production touched: **NO**`,
    ``,
    `## Stages`,
    ``,
  ];
  for (const s of payload.stages || []) {
    lines.push(`- **${s.name}**: ${s.status}${s.detail ? ` — ${s.detail}` : ''}`);
  }
  if (payload.blockers?.length) {
    lines.push(``, `## Blockers`, ``);
    for (const b of payload.blockers) lines.push(`- ${b}`);
  }
  if (payload.summary) {
    lines.push(
      ``,
      `## Suite summary`,
      ``,
      `- Passed: ${payload.summary.passed}`,
      `- Failed: ${payload.summary.failed}`,
      `- Total: ${payload.summary.total}`,
    );
  }
  if (payload.results?.length) {
    lines.push(``, `## Cases`, ``);
    lines.push(`| ID | Expected | Actual | OK | Purpose |`);
    lines.push(`|----|----------|--------|----|---------|`);
    for (const row of payload.results) {
      lines.push(
        `| ${row.test_id} | ${row.expected} | ${row.actual} | ${row.ok} | ${String(row.purpose).replace(/\|/g, '/')} |`,
      );
    }
  }
  lines.push(``, `## Capability`, ``, `See \`rls-validation/CAPABILITY.md\`.`, ``);
  fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');
  return { jsonPath, mdPath };
}

function main() {
  const report = {
    timestamp: new Date().toISOString(),
    pipelineStatus: 'STOPPED',
    stages: [],
    blockers: [],
    productionTouched: false,
    validationDb: null,
  };

  console.log('=== RLS VALIDATION PIPELINE ===');
  console.log('Stage DETECT…');

  const { result: det, cfg, constants, psql } = detect();
  report.stages.push({
    name: 'DETECT',
    status: det.ok ? 'OK' : 'FAIL',
    detail: det.ok ? 'prerequisites present' : det.blockers.join('; '),
  });
  report.detection = det;
  report.validationDb = cfg.validationDb;

  if (!det.ok) {
    report.blockers = det.blockers;
    report.pipelineStatus = 'STOPPED_AT_DETECT';
    report.humanActions = [
      'Copy rls-validation/.env.example → rls-validation/.env.local',
      'Set RLS_PGPASSWORD to the LOCAL postgres password (never Production)',
      'Confirm PostgreSQL service postgresql-x64-18 is Running',
      'Re-run: npm run rls:validate',
    ];
    if (!NO_REPORT) {
      const paths = writeReport(report);
      report.reportPaths = paths;
      console.log(`Report written: ${paths.mdPath}`);
    }
    console.error('STOP: DETECT failed.');
    for (const b of det.blockers) console.error(' -', b);
    process.exit(2);
  }

  if (DETECT_ONLY) {
    report.pipelineStatus = 'DETECT_ONLY_OK';
    if (!NO_REPORT) report.reportPaths = writeReport(report);
    console.log('DETECT-ONLY complete.');
    process.exit(0);
  }

  console.log('Stage VERIFY…');
  const ver = verifyConnectivity(psql, cfg);
  report.stages.push({
    name: 'VERIFY',
    status: ver.ok ? 'OK' : 'FAIL',
    detail: ver.ok ? 'local connection succeeded' : ver.detail,
  });
  if (!ver.ok) {
    report.blockers.push(`VERIFY failed: ${ver.detail}`);
    report.pipelineStatus = 'STOPPED_AT_VERIFY';
    report.humanActions = [
      'Fix local PostgreSQL credentials in rls-validation/.env.local',
      'Ensure host/port/user can connect to maintenance DB',
      'Re-run: npm run rls:validate',
    ];
    if (!NO_REPORT) report.reportPaths = writeReport(report);
    console.error('STOP: VERIFY failed —', ver.detail);
    process.exit(3);
  }

  console.log('Stage BUILD (create DB + replay schema/packages/006)…');
  const created = createValidationDb(psql, cfg);
  if (!created.ok) {
    report.stages.push({ name: 'BUILD', status: 'FAIL', detail: created.detail });
    report.blockers.push(`CREATE DATABASE failed: ${created.detail}`);
    report.pipelineStatus = 'STOPPED_AT_BUILD';
    if (!NO_REPORT) report.reportPaths = writeReport(report);
    console.error('STOP: BUILD failed');
    process.exit(4);
  }

  const applyLog = [];
  const files = (constants.migrationFiles || []).map((rel) =>
    path.resolve(ROOT, 'sql', rel),
  );

  for (const abs of files) {
    // Skip suite until EXECUTE; seed/jwt applied in order from constants
    const base = path.basename(abs);
    if (base === '92_validation_suite.sql') continue;
    console.log('  apply', base);
    const ok = applyFile(psql, cfg, abs, applyLog);
    if (!ok) {
      report.stages.push({
        name: 'BUILD',
        status: 'FAIL',
        detail: `Failed applying ${base}`,
      });
      report.applyLog = applyLog;
      report.blockers.push(`Migration apply failed: ${base}`);
      report.pipelineStatus = 'STOPPED_AT_BUILD';
      if (!KEEP_DB) dropValidationDb(psql, cfg);
      if (!NO_REPORT) report.reportPaths = writeReport(report);
      console.error('STOP: apply failed for', base);
      console.error(applyLog.at(-1)?.stderr);
      process.exit(5);
    }
  }
  report.stages.push({ name: 'BUILD', status: 'OK', detail: 'schema + packages + 006 + seed + jwt' });
  report.stages.push({ name: 'SEED', status: 'OK', detail: 'included in BUILD sequence (90_seed)' });
  report.applyLog = applyLog;

  console.log('Stage EXECUTE (validation suite)…');
  const suitePath = path.resolve(ROOT, 'sql', '92_validation_suite.sql');
  const suite = runPsql(psql, cfg, cfg.validationDb, null, { file: suitePath });
  if (suite.status !== 0) {
    report.stages.push({ name: 'EXECUTE', status: 'FAIL', detail: suite.stderr || suite.error });
    report.blockers.push('Validation suite SQL failed to run');
    report.pipelineStatus = 'STOPPED_AT_EXECUTE';
    if (!KEEP_DB) dropValidationDb(psql, cfg);
    if (!NO_REPORT) report.reportPaths = writeReport(report);
    console.error('STOP: EXECUTE failed');
    console.error(suite.stderr);
    process.exit(6);
  }

  // Fetch results
  const q = runPsql(psql, cfg, cfg.validationDb, null, {
    command: `copy (
      select test_id, purpose, expected, actual, coalesce(detail,''), ok
      from rls_val.results order by id
    ) to stdout with csv;`,
  });
  const results = [];
  if (q.status === 0) {
    for (const line of q.stdout.split(/\r?\n/).filter(Boolean)) {
      // naive CSV split (fields may contain commas in purpose — use safer query)
      results.push(line);
    }
  }

  const q2 = runPsql(psql, cfg, cfg.validationDb, null, {
    command: `select json_agg(row_to_json(t)) from (
      select test_id, purpose, expected, actual, detail, ok from rls_val.results order by id
    ) t;`,
  });
  let parsed = [];
  if (q2.status === 0) {
    const raw = q2.stdout.trim();
    if (raw && raw !== '') {
      try {
        parsed = JSON.parse(raw) || [];
      } catch {
        parsed = [];
      }
    }
  }

  const passed = parsed.filter((r) => r.ok).length;
  const failed = parsed.filter((r) => !r.ok).length;
  report.summary = { passed, failed, total: parsed.length };
  report.results = parsed;
  report.stages.push({
    name: 'EXECUTE',
    status: failed === 0 && parsed.length > 0 ? 'OK' : 'FAIL',
    detail: `passed=${passed} failed=${failed} total=${parsed.length}`,
  });

  console.log('Stage REPORT…');
  report.pipelineStatus =
    failed === 0 && parsed.length > 0 ? 'PASS' : parsed.length === 0 ? 'FAIL_NO_RESULTS' : 'FAIL';
  if (!NO_REPORT) {
    report.reportPaths = writeReport(report);
    console.log('Report:', report.reportPaths.mdPath);
  }
  report.stages.push({ name: 'REPORT', status: 'OK' });

  console.log('Stage CLEANUP…');
  if (KEEP_DB) {
    report.stages.push({ name: 'CLEANUP', status: 'SKIPPED', detail: '--keep-db' });
    console.log('Kept DB', cfg.validationDb);
  } else {
    const dropped = dropValidationDb(psql, cfg);
    report.stages.push({
      name: 'CLEANUP',
      status: dropped ? 'OK' : 'FAIL',
      detail: dropped ? `dropped ${cfg.validationDb}` : 'drop failed',
    });
  }

  console.log('=== PIPELINE', report.pipelineStatus, '===');
  console.log(JSON.stringify(report.summary, null, 2));
  process.exit(report.pipelineStatus === 'PASS' ? 0 : 7);
}

main();
