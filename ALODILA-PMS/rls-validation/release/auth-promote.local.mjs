#!/usr/bin/env node
/**
 * ALODILA-PMS — Auth claim promote (LOCAL / approved CLONE only)
 *
 * Promotes app_metadata via service role; strips authz keys from user_metadata.
 * Default: --dry-run. Writes require --apply --i-understand-clone.
 *
 * NEVER run against Production (ryfqqyrqmsyngwcsfjug / *.supabase.co).
 *
 * Uses GoTrue Admin HTTP API directly (no supabase-js) to avoid Windows
 * libuv UV_HANDLE_CLOSING crashes on client teardown.
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PRODUCTION_PROJECT_REF = 'ryfqqyrqmsyngwcsfjug';
const AUTHZ_USER_META_KEYS = ['role', 'company_id', 'owner_crm_id'];

/** Load rls-validation/release/.env.auth if present (never overrides existing env). */
function loadDotEnvAuth() {
  const envPath = path.join(__dirname, '.env.auth');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] == null) process.env[key] = val;
  }
}

function parseArgs(argv) {
  const args = {
    usersPath: null,
    dryRun: true,
    apply: false,
    understoodClone: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--users') {
      args.usersPath = argv[++i];
    } else if (a === '--dry-run') {
      args.dryRun = true;
      args.apply = false;
    } else if (a === '--apply') {
      args.apply = true;
      args.dryRun = false;
    } else if (a === '--i-understand-clone') {
      args.understoodClone = true;
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      printHelp();
      process.exit(1);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node rls-validation/release/auth-promote.local.mjs --users ./users.json [--dry-run]
  node rls-validation/release/auth-promote.local.mjs --users ./users.json --apply --i-understand-clone

Environment:
  SUPABASE_URL          Required (local or approved clone)
  SERVICE_ROLE_KEY      Required
  ALLOW_NON_LOCAL_AUTH_PROMOTE=YES   Allow non-localhost clone host (still blocks production ref)

users.json shape: [{ "email": "...", "app_metadata": { "role": "...", ... } }]
`);
}

function assertPromoteHostAllowed(url) {
  const u = String(url || '').trim().toLowerCase();
  if (!u) {
    throw new Error('SUPABASE_URL is required');
  }
  if (u.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(
      `REFUSED: Production project ref ${PRODUCTION_PROJECT_REF} detected in SUPABASE_URL`,
    );
  }
  const isLocal = u.includes('127.0.0.1') || u.includes('localhost');
  const allowNonLocal = process.env.ALLOW_NON_LOCAL_AUTH_PROMOTE === 'YES';
  if (!isLocal && !allowNonLocal) {
    throw new Error(
      'REFUSED: non-local SUPABASE_URL. Set ALLOW_NON_LOCAL_AUTH_PROMOTE=YES for approved clone (production ref still blocked).',
    );
  }
  if (u.includes('supabase.co') && !allowNonLocal) {
    throw new Error(
      'REFUSED: supabase.co host requires ALLOW_NON_LOCAL_AUTH_PROMOTE=YES (approved clone only; production ref always blocked).',
    );
  }
  return { url: String(url).trim().replace(/\/$/, ''), isLocal, allowNonLocal };
}

function stripAuthzFromUserMetadata(userMetadata) {
  const base = userMetadata && typeof userMetadata === 'object' ? { ...userMetadata } : {};
  for (const key of AUTHZ_USER_META_KEYS) {
    delete base[key];
  }
  return base;
}

function mergeAppMetadata(current, desired) {
  const next = { ...(current && typeof current === 'object' ? current : {}), ...desired };
  const role = String(next.role || '').trim().toLowerCase();
  if (role === 'platform_super_admin' || role === 'super_admin') {
    delete next.company_id;
    delete next.owner_crm_id;
  }
  return next;
}

function validateDesiredAppMetadata(appMetadata, email) {
  if (!appMetadata || typeof appMetadata !== 'object') {
    throw new Error(`Invalid app_metadata for ${email}`);
  }
  const role = String(appMetadata.role || '').trim();
  if (!role) {
    throw new Error(`Missing app_metadata.role for ${email}`);
  }
  const lower = role.toLowerCase();
  if (['company', 'company_admin', 'company_staff', 'owner'].includes(lower)) {
    if (!String(appMetadata.company_id || '').trim()) {
      throw new Error(`Missing app_metadata.company_id for ${email} (${role})`);
    }
  }
  if (lower === 'owner' && !String(appMetadata.owner_crm_id || '').trim()) {
    throw new Error(`Missing app_metadata.owner_crm_id for ${email}`);
  }
  if (lower === 'staff') {
    console.warn(
      `WARN ${email}: bare role "staff" is not accepted by 006 V2 is_company_login(); use company|company_admin|company_staff`,
    );
  }
}

function adminHeaders(serviceKey) {
  return {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    'Content-Type': 'application/json',
  };
}

/** Node http(s) — avoids undici/fetch keep-alive handles that crash Node on Windows exit. */
function requestJson(method, urlStr, headers, bodyObj) {
  const body = bodyObj == null ? null : JSON.stringify(bodyObj);
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const hdrs = { ...headers };
    if (body != null) hdrs['Content-Length'] = Buffer.byteLength(body);
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method,
        headers: hdrs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = {};
          if (text) {
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = { raw: text };
            }
          }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            body: parsed,
          });
        });
      },
    );
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

async function adminListUsers(baseUrl, serviceKey, page, perPage) {
  const url = `${baseUrl}/auth/v1/admin/users?page=${page}&per_page=${perPage}`;
  const res = await requestJson('GET', url, adminHeaders(serviceKey), null);
  if (!res.ok) {
    const msg = res.body?.msg || res.body?.message || res.body?.error_description || res.status;
    throw new Error(`listUsers HTTP ${res.status}: ${msg}`);
  }
  return res.body?.users || [];
}

async function adminUpdateUser(baseUrl, serviceKey, userId, payload) {
  const url = `${baseUrl}/auth/v1/admin/users/${userId}`;
  const res = await requestJson('PUT', url, adminHeaders(serviceKey), payload);
  if (!res.ok) {
    const msg = res.body?.msg || res.body?.message || res.body?.error_description || res.status;
    throw new Error(`updateUser HTTP ${res.status}: ${msg}`);
  }
  return res.body;
}

async function findUserByEmail(baseUrl, serviceKey, email) {
  const target = String(email || '').trim().toLowerCase();
  let page = 1;
  const perPage = 200;
  while (page <= 50) {
    const users = await adminListUsers(baseUrl, serviceKey, page, perPage);
    const hit = users.find((u) => String(u.email || '').trim().toLowerCase() === target);
    if (hit) return hit;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

function loadUsersFile(usersPath) {
  if (!usersPath) {
    throw new Error('--users <path> is required');
  }
  const abs = path.isAbsolute(usersPath) ? usersPath : path.resolve(process.cwd(), usersPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Users file not found: ${abs}`);
  }
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!Array.isArray(raw)) {
    throw new Error('Users file must be a JSON array');
  }
  return raw.map((row, idx) => {
    if (!row?.email) {
      throw new Error(`Row ${idx}: missing email`);
    }
    validateDesiredAppMetadata(row.app_metadata, row.email);
    return { email: String(row.email).trim(), app_metadata: row.app_metadata };
  });
}

async function main() {
  loadDotEnvAuth();
  const args = parseArgs(process.argv);

  if (args.apply && !args.understoodClone) {
    console.error('REFUSED: --apply requires --i-understand-clone');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('REFUSED: SUPABASE_URL and SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  let hostInfo;
  try {
    hostInfo = assertPromoteHostAllowed(url);
  } catch (err) {
    console.error(`REFUSED: ${err.message}`);
    process.exit(1);
  }

  const entries = loadUsersFile(args.usersPath);

  const mode = args.apply ? 'APPLY' : 'DRY-RUN';
  console.log('=== ALODILA Auth Promote ===');
  console.log(`Mode: ${mode}`);
  console.log(`Host: ${hostInfo.url} (local=${hostInfo.isLocal})`);
  console.log(`Users: ${entries.length}`);
  console.log('');

  const results = { applied: [], wouldApply: [], refused: [], notFound: [] };

  for (const entry of entries) {
    const label = entry.email;
    try {
      const user = await findUserByEmail(hostInfo.url, serviceKey, entry.email);
      if (!user) {
        console.log(`NOT_FOUND: ${label}`);
        results.notFound.push(label);
        continue;
      }

      const nextApp = mergeAppMetadata(user.app_metadata, entry.app_metadata);
      const nextUserMeta = stripAuthzFromUserMetadata(user.user_metadata);
      const strippedKeys = AUTHZ_USER_META_KEYS.filter((k) => user.user_metadata?.[k] != null);

      const summary = {
        email: label,
        userId: user.id,
        app_metadata: nextApp,
        stripped_user_metadata_keys: strippedKeys,
      };

      if (args.apply) {
        const data = await adminUpdateUser(hostInfo.url, serviceKey, user.id, {
          app_metadata: nextApp,
          user_metadata: nextUserMeta,
        });
        console.log(`APPLIED: ${label} (${user.id})`);
        if (strippedKeys.length) {
          console.log(`  stripped user_metadata: ${strippedKeys.join(', ')}`);
        }
        results.applied.push({ ...summary, updatedAt: data?.user?.updated_at || data?.updated_at });
      } else {
        console.log(`WOULD_APPLY: ${label} (${user.id})`);
        console.log(`  app_metadata: ${JSON.stringify(nextApp)}`);
        if (strippedKeys.length) {
          console.log(`  would strip user_metadata: ${strippedKeys.join(', ')}`);
        }
        results.wouldApply.push(summary);
      }
    } catch (err) {
      console.log(`REFUSED: ${label} — ${err.message}`);
      results.refused.push({ email: label, error: err.message });
    }
  }

  console.log('');
  console.log('--- Summary ---');
  console.log(`APPLIED:      ${results.applied.length}`);
  console.log(`WOULD_APPLY:  ${results.wouldApply.length}`);
  console.log(`NOT_FOUND:    ${results.notFound.length}`);
  console.log(`REFUSED:      ${results.refused.length}`);

  // Dry-run with example emails → NOT_FOUND is expected (exit 0).
  // Apply with missing users → exit 2. Refused ops → exit 1.
  let code = 0;
  if (results.refused.length > 0) code = 1;
  else if (args.apply && results.notFound.length > 0) code = 2;
  process.exit(code);
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
