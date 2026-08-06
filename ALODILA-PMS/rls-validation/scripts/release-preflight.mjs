/**
 * Release preflight — verify Soft RLS migration pair + quarantine + docs.
 * Never targets Production. Exit 0 when migration pair present; 2 when missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ARTIFACTS_PATH = path.join(ROOT, 'rls-validation', 'release', 'REQUIRED_ARTIFACTS.json');

const PROD_HOST = 'ryfqqyrqmsyngwcsfjug';
const ENV_KEYS = [
  'SUPABASE_URL',
  'LOCAL_SUPABASE_URL',
  'DATABASE_URL',
  'CLONE_DATABASE_URL',
  'PROD_DATABASE_URL',
  'DB_URL',
  'SUPABASE_DB_URL',
];

function loadArtifacts() {
  if (!fs.existsSync(ARTIFACTS_PATH)) {
    console.error(`Missing manifest: ${path.relative(ROOT, ARTIFACTS_PATH)}`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(ARTIFACTS_PATH, 'utf8'));
}

function resolveRepo(relPath) {
  return path.join(ROOT, relPath);
}

function exists(relPath) {
  return fs.existsSync(resolveRepo(relPath));
}

function refuseProductionEnv() {
  const hits = [];
  for (const key of ENV_KEYS) {
    const val = process.env[key];
    if (!val) continue;
    const lower = String(val).toLowerCase();
    if (lower.includes(PROD_HOST) || lower.includes('ryfqqyrqmsyngwcsfjug')) {
      hits.push(`${key}=${val}`);
    }
  }
  if (hits.length === 0) return false;
  console.error('REFUSE: environment points at Production Supabase host.');
  console.error(`Production project ref: ${PROD_HOST}`);
  for (const h of hits) console.error(`  - ${h}`);
  console.error('Unset Production URLs before preflight, or use a clone/local connection only.');
  process.exit(3);
}

function warnMissing(label, relPaths) {
  const missing = relPaths.filter((p) => !exists(p));
  if (missing.length === 0) {
    console.log(`OK ${label}: all present (${relPaths.length})`);
    return [];
  }
  console.warn(`WARN ${label}: missing ${missing.length}/${relPaths.length}`);
  for (const p of missing) console.warn(`  - ${p}`);
  return missing;
}

function failMissingMigrations(missing) {
  console.error(`FAIL migrations: missing required pair (${missing.length})`);
  for (const p of missing) console.error(`  - ${p}`);
  console.error('Exit code 2 — add migrations before release apply.');
  process.exit(2);
}

function printApplyList(ordered) {
  console.log('');
  console.log('=== Ordered migration apply list (clone / Gate A) ===');
  ordered.forEach((rel, i) => {
    const mark = exists(rel) ? '✓' : '✗';
    console.log(` ${String(i + 1).padStart(2, ' ')}. [${mark}] ${rel}`);
  });
  console.log('');
  console.log('Quarantined (do NOT apply via db reset):');
  console.log('  - supabase/quarantine/006_sprint4_soft_rls_and_indexes.sql (V1)');
  console.log('  - supabase/quarantine/007_company_id_not_null_DRAFT.sql');
  console.log('  - supabase/quarantine/006b_sprint4_wave_a_indexes_concurrent.sql');
  console.log('');
}

/** Supabase CLI version = filename prefix before first underscore. */
function migrationVersion(fileName) {
  const base = path.basename(fileName);
  const i = base.indexOf('_');
  return i > 0 ? base.slice(0, i) : base.replace(/\.sql$/i, '');
}

function assertMigrationFolderHealthy() {
  const migDir = path.join(ROOT, 'supabase', 'migrations');
  if (!fs.existsSync(migDir)) {
    console.error('FAIL: supabase/migrations missing');
    process.exit(2);
  }
  const files = fs.readdirSync(migDir).filter((f) => f.toLowerCase().endsWith('.sql'));
  const byVersion = new Map();
  for (const f of files) {
    const v = migrationVersion(f);
    if (!byVersion.has(v)) byVersion.set(v, []);
    byVersion.get(v).push(f);
  }
  const collisions = [...byVersion.entries()].filter(([, names]) => names.length > 1);
  if (collisions.length > 0) {
    console.error('FAIL: migration version collisions in supabase/migrations:');
    for (const [v, names] of collisions) {
      console.error(`  version ${v}: ${names.join(', ')}`);
    }
    process.exit(2);
  }

  const bannedInMigrations = [
    '006_sprint4_soft_rls_and_indexes.sql',
    '006b_sprint4_wave_a_indexes_concurrent.sql',
    '007_company_id_not_null_DRAFT.sql',
  ];
  const leaked = bannedInMigrations.filter((f) => files.includes(f));
  if (leaked.length > 0) {
    console.error('FAIL: quarantined files still present under supabase/migrations:');
    for (const f of leaked) console.error(`  - ${f}`);
    process.exit(2);
  }

  console.log(`OK migrations folder: ${files.length} SQL files, unique versions, no quarantine leaks`);
}

function assertPackageScripts() {
  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const required = [
    'release:preflight',
    'release:smoke',
    'release:closeout',
    'auth:promote:dry',
    'local:validate',
  ];
  const scripts = pkg.scripts || {};
  const missing = required.filter((s) => !scripts[s]);
  if (missing.length > 0) {
    console.error(`FAIL package scripts missing: ${missing.join(', ')}`);
    process.exit(2);
  }
  console.log(`OK package scripts: ${required.join(', ')}`);
}

function main() {
  console.log('=== ALODILA-PMS Release Preflight ===');
  console.log(`Root: ${ROOT}`);
  console.log(`Production host blocked: ${PROD_HOST}`);
  console.log('');

  refuseProductionEnv();
  assertMigrationFolderHealthy();
  assertPackageScripts();

  const manifest = loadArtifacts();
  const migrationPair = manifest.migrations?.required_pair ?? [];
  const applyOrder = manifest.migrations?.required_apply_order ?? migrationPair;
  const quarantinePaths = (manifest.quarantine?.files ?? []).map((f) => f.path);
  const docPaths = manifest.docs ?? [];

  const missingMigrations = migrationPair.filter((p) => !exists(p));
  if (missingMigrations.length > 0) {
    printApplyList(applyOrder);
    failMissingMigrations(missingMigrations);
  }

  printApplyList(applyOrder);

  warnMissing('quarantine artifacts', quarantinePaths);
  warnMissing('release docs', docPaths);

  console.log('PASS: required migration pair present.');
  console.log('Next: apply in order on CLONE only, then run clone smoke.');
  process.exit(0);
}

main();
