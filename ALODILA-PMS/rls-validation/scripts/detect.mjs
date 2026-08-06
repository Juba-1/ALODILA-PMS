/**
 * Environment discovery for local RLS validation.
 * Never connects to Production / Supabase hosts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..');

export function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  const out = {};
  if (!fs.existsSync(envPath)) return { envPath, exists: false, values: out };
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return { envPath, exists: true, values: out };
}

export function resolveConfig() {
  const { exists, values, envPath } = loadEnvLocal();
  const host = process.env.RLS_PGHOST || values.RLS_PGHOST || '127.0.0.1';
  const port = process.env.RLS_PGPORT || values.RLS_PGPORT || '5432';
  const user = process.env.RLS_PGUSER || values.RLS_PGUSER || 'postgres';
  const password = process.env.RLS_PGPASSWORD || values.RLS_PGPASSWORD || '';
  const maintenanceDb =
    process.env.RLS_PGMAINTENANCE_DB || values.RLS_PGMAINTENANCE_DB || 'postgres';
  const validationDb =
    process.env.RLS_VALIDATION_DB || values.RLS_VALIDATION_DB || 'alodila_rls_validation';
  return {
    envPath,
    envExists: exists,
    host,
    port,
    user,
    password,
    maintenanceDb,
    validationDb,
  };
}

export function findPsql() {
  const candidates = [
    process.env.RLS_PSQL_PATH,
    'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe',
    'psql',
  ].filter(Boolean);

  for (const c of candidates) {
    if (c === 'psql') {
      const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
      if (r.status === 0) return c;
      continue;
    }
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function loadConstants() {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, 'config', 'constants.json'), 'utf8'),
  );
}

export function assertNotProduction(cfg, constants) {
  const host = String(cfg.host || '').toLowerCase();
  for (const bad of constants.forbiddenHostSubstrings || []) {
    if (host.includes(String(bad).toLowerCase())) {
      return {
        ok: false,
        reason: `Refusing host "${cfg.host}" — matches forbidden Production pattern "${bad}".`,
      };
    }
  }
  if (String(cfg.validationDb).toLowerCase() !== 'alodila_rls_validation') {
    // Allow override only if still clearly local name
    if (/supabase|prod|production/i.test(cfg.validationDb)) {
      return {
        ok: false,
        reason: `Refusing validation DB name "${cfg.validationDb}".`,
      };
    }
  }
  return { ok: true };
}

export function detect() {
  const constants = loadConstants();
  const cfg = resolveConfig();
  const psql = findPsql();
  const safety = assertNotProduction(cfg, constants);

  const migrationFiles = (constants.migrationFiles || []).map((rel) => {
    const abs = path.resolve(ROOT, 'sql', rel);
    return { rel, abs, exists: fs.existsSync(abs) };
  });

  const missingMigrations = migrationFiles.filter((m) => !m.exists);

  const result = {
    stage: 'DETECT',
    timestamp: new Date().toISOString(),
    postgresServiceHint: 'postgresql-x64-18 (Windows)',
    psqlPath: psql,
    psqlFound: Boolean(psql),
    envLocalPath: cfg.envPath,
    envLocalExists: cfg.envExists,
    credentialsPresent: Boolean(cfg.password),
    connection: {
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      maintenanceDb: cfg.maintenanceDb,
      validationDb: cfg.validationDb,
      passwordSet: Boolean(cfg.password),
    },
    safety,
    migrations: migrationFiles,
    missingMigrations: missingMigrations.map((m) => m.rel),
    repoRoot: REPO,
    harnessRoot: ROOT,
  };

  const blockers = [];
  if (!result.psqlFound) blockers.push('psql client not found');
  if (!result.envLocalExists) {
    blockers.push(
      `Missing ${cfg.envPath} — copy rls-validation/.env.example to .env.local and set RLS_PGPASSWORD`,
    );
  } else if (!result.credentialsPresent) {
    blockers.push('RLS_PGPASSWORD is empty in .env.local / environment');
  }
  if (!safety.ok) blockers.push(safety.reason);
  if (missingMigrations.length) {
    blockers.push(`Missing migration files: ${missingMigrations.map((m) => m.rel).join(', ')}`);
  }

  result.blockers = blockers;
  result.ok = blockers.length === 0;
  return { result, cfg, constants, psql };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { result } = detect();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}
