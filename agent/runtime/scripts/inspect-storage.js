import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
export const DATABASE_NAME = 'atlas-agent-private';
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value) && value !== '00000000-0000-0000-0000-000000000000';
class InspectionError extends Error {}
const requireValue = (value, code) => {if (!value) throw new InspectionError(code);};

// Every query is a fixed read. No caller-supplied SQL, exports, restore endpoints,
// bindings, credentials or user rows can enter the public workflow output.
export const READS = Object.freeze({
  schema: "SELECT name,type FROM sqlite_master WHERE type IN ('table','trigger') ORDER BY name",
  migrations: 'SELECT name FROM d1_migrations ORDER BY name',
  foreignKeys: 'PRAGMA foreign_key_check',
  integrity: 'PRAGMA quick_check',
});

export async function inspectStorage({env = process.env, fetchImpl = fetch} = {}) {
  requireValue(/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID || ''), 'invalid_account_id');
  requireValue(uuid(env.ATLAS_D1_DATABASE_ID), 'invalid_database_id');
  requireValue(typeof env.CLOUDFLARE_API_TOKEN === 'string' && env.CLOUDFLARE_API_TOKEN.length >= 16, 'storage_token_required');
  const files = (await readdir(MIGRATIONS)).filter(n => /^\d{4}_.+\.sql$/.test(n)).sort();
  requireValue(files.length > 0, 'missing_migrations');
  const definitions = (await Promise.all(files.map(name => readFile(path.join(MIGRATIONS, name), 'utf8')))).join('\n');
  const tables = [...definitions.matchAll(/^CREATE TABLE (\w+)\s*\(/gm)].map(m => m[1]);
  const triggers = [...definitions.matchAll(/^CREATE TRIGGER (\w+)\s*$/gm)].map(m => m[1]);
  const base = 'https://api.cloudflare.com/client/v4/accounts/' + env.CLOUDFLARE_ACCOUNT_ID + '/d1/database/' + env.ATLAS_D1_DATABASE_ID;
  async function request(suffix, sql) {
    let response;
    try {
      response = await fetchImpl(base + suffix, {method: sql ? 'POST' : 'GET', redirect: 'error',
        headers: {Authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN, 'Content-Type': 'application/json'},
        ...(sql ? {body: JSON.stringify({sql, params: []})} : {}), signal: AbortSignal.timeout(20_000)});
    } catch {throw new InspectionError('storage_read_incomplete');}
    requireValue(response.ok, 'cloudflare_http_' + response.status);
    let result;
    try {
      requireValue(response.body, 'invalid_cloudflare_response');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let bytes = 0, body = '';
      try {
        for (;;) {const {value, done} = await reader.read(); if (done) break;
          bytes += value.byteLength; requireValue(bytes <= 100_000, 'storage_metadata_too_large'); body += decoder.decode(value, {stream: true});}
        body += decoder.decode();
      } finally {await reader.cancel().catch(() => {});}
      result = JSON.parse(body);
    } catch (error) {if (error instanceof InspectionError) throw error; throw new InspectionError('invalid_cloudflare_response');}
    requireValue(result?.success === true && result.result, 'invalid_cloudflare_response');
    return result.result;
  }
  async function query(sql) {
    const result = await request('/query', sql);
    requireValue(Array.isArray(result) && result.length === 1 && result[0].success === true && Array.isArray(result[0].results), 'invalid_storage_query_response');
    return result[0].results;
  }
  const database = await request('');
  requireValue(database.name === DATABASE_NAME && database.uuid === env.ATLAS_D1_DATABASE_ID, 'database_identity_mismatch');
  requireValue(database.version === 'production', 'time_travel_backend_unverified');
  const schema = await query(READS.schema);
  requireValue(['d1_migrations', ...tables].every(name => schema.some(row => row.name === name && row.type === 'table')) &&
    triggers.every(name => schema.some(row => row.name === name && row.type === 'trigger')), 'storage_schema_incomplete');
  const applied = await query(READS.migrations);
  requireValue(JSON.stringify(applied.map(row => row.name)) === JSON.stringify(files), 'migration_history_mismatch');
  requireValue((await query(READS.foreignKeys)).length === 0, 'storage_foreign_key_check_failed');
  const integrity = await query(READS.integrity);
  requireValue(integrity.length === 1 && Object.values(integrity[0]).length === 1 && Object.values(integrity[0])[0] === 'ok', 'storage_integrity_check_failed');
  const bookmark = await request('/time_travel/bookmark');
  requireValue(typeof bookmark.bookmark === 'string' && bookmark.bookmark.length >= 8 && bookmark.bookmark.length <= 200, 'storage_bookmark_unavailable');
  // A current bookmark proves neither a plan's retention window nor a restore.
  return {database: DATABASE_NAME, status: 'storage_read_checks_passed', mutations: false,
    migration_count: files.length, required_schema_objects: 'present', foreign_keys: 'passed', integrity: 'passed',
    time_travel: 'current_bookmark_available', retention_window: 'not_inspected', restore_drill: 'pending'};
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {console.log(JSON.stringify(await inspectStorage()));}
  catch (error) {console.error(error instanceof InspectionError ? error.message : 'storage_inspection_failed'); process.exitCode = 1;}
}
