import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {hex40, hex64, readText, sha256} from '../src/common.js';
import {REPOSITORY, SITE, validateSnapshot} from '../src/knowledge.js';

class ReadinessError extends Error {}
const requireValue = (value, code) => {if (!value) throw new ReadinessError(code);};
const API = 'https://api.github.com/repos/' + REPOSITORY;

// Public GETs only. No App credentials, D1 contents, writes or inferred Worker state.
export async function inspectPublication({fetchImpl = fetch} = {}) {
  async function get(url, limit = 1000000) {
    try {
      const response = await fetchImpl(url, {method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: {'User-Agent': 'Atlas-publication-readiness', Accept: 'application/json', 'Cache-Control': 'no-cache'}});
      requireValue(!response.headers.get('link')?.includes('rel="next"'), 'publication_metadata_incomplete');
      return await readText(response, limit);
    } catch (error) {
      if (error instanceof ReadinessError) throw error;
      throw new ReadinessError('publication_read_incomplete');
    }
  }
  const template = JSON.parse(await readFile(new URL('../../operations/main-ruleset.json', import.meta.url), 'utf8'));
  const expected = template.rules.find(r => r.type === 'required_status_checks').parameters.required_status_checks;
  let rules;
  try {rules = JSON.parse(await get(API + '/rules/branches/main?per_page=100'));}
  catch (error) {if (error instanceof ReadinessError) throw error; throw new ReadinessError('publication_rules_invalid');}
  requireValue(Array.isArray(rules) && rules.length <= 100 && rules.some(r => r.type === 'deletion') &&
    rules.some(r => r.type === 'non_fast_forward') && rules.some(r => r.type === 'pull_request' &&
      r.parameters?.required_approving_review_count === 0 && r.parameters.require_last_push_approval === false &&
      r.parameters.require_code_owner_review === false && r.parameters.required_review_thread_resolution === true), 'publication_main_rules_incomplete');
  const checkRules = rules.filter(r => r.type === 'required_status_checks' && r.parameters?.strict_required_status_checks_policy === true);
  requireValue(expected.every(check => checkRules.some(rule => rule.parameters.required_status_checks?.some(actual =>
    actual.context === check.context && actual.integration_id === check.integration_id))), 'publication_required_checks_incomplete');
  let head, manifest, manifestText, snapshot;
  try {
    head = JSON.parse(await get(API + '/branches/main')).commit?.sha;
    manifestText = await get(SITE + 'knowledge-manifest.json'); manifest = JSON.parse(manifestText);
    requireValue(hex40(head) && manifest.schema_version === 1 && manifest.revision === head && hex64(manifest.index_sha256) &&
      hex64(manifest.contract_digest) && manifest.index_path === 'knowledge-index.' + manifest.index_sha256 + '.json', 'publication_snapshot_not_current');
    const index = await get(SITE + manifest.index_path);
    requireValue(await sha256(index) === manifest.index_sha256, 'publication_snapshot_digest_mismatch');
    snapshot = JSON.parse(index); validateSnapshot(snapshot, manifest);
    for (const article of snapshot.articles) requireValue(await sha256(article.markdown) === article.content_digest, 'publication_article_digest_mismatch');
    requireValue(await get(SITE + 'knowledge-manifest.json') === manifestText &&
      JSON.parse(await get(API + '/branches/main')).commit?.sha === head, 'publication_baseline_changed');
  } catch (error) {if (error instanceof ReadinessError) throw error; throw new ReadinessError('publication_snapshot_invalid');}
  return {status: 'publication_read_checks_passed', mutations: false, repository: REPOSITORY,
    revision: head, required_checks: 'present', main_and_public_index: 'consistent',
    articles: snapshot.articles.length, topics: snapshot.topics.length,
    bypass_configuration: 'not_inspected', publisher_identity: 'not_inspected', worker_revision: 'not_inspected'};
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {console.log(JSON.stringify(await inspectPublication()));}
  catch (error) {console.error(error instanceof ReadinessError ? error.message : 'publication_inspection_failed'); process.exitCode = 1;}
}
