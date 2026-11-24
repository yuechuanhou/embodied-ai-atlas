import {canonical, requireValue, sha256, text} from './common.js';
import {checkAddition} from './proposal-preparation.js';

export const PUBLIC_REPOSITORY = 'yuechuanhou/embodied-ai-atlas';
export const REQUIRED_PUBLIC_CHECKS = ['check', 'Validate private runtime from a clean checkout', 'Validate Orbit knowledge change'];

// An allowlisted public projection, never a sanitized copy of the private envelope.
// In particular: no candidate/session/source IDs, evidence list or editorial notes.
export async function publicProjection(detail, snapshot) {
  const {proposal, review, files} = detail;
  requireValue(files.length === 1 && proposal.file_changes.length === 1 && proposal.publication.release_scope === 'open_pr' &&
    review.operation === 'extend_article' && review.graph_changes === 'none' && review.topic_assignment === 'unchanged', 409, 'publication_operation_unsupported');
  const article = snapshot?.articles.find(a => a.id === review.article_id && a.primary_domain === review.primary_domain);
  const file = files[0];
  requireValue(article && /^[a-z0-9][a-z0-9_-]*\.md$/.test(article.file) && file.path === 'content/' + article.file &&
    file.before_utf8 === article.markdown && text(file.addition, 13000) && file.after_utf8 === file.before_utf8 + file.addition &&
    file.before_utf8.length < 120000 && file.after_utf8.length < 135000, 409, 'publication_projection_invalid');
  checkAddition(file.addition);
  const receipt = {schema_version: 1, operation: 'extend_article', base_commit: proposal.base_commit,
    contract_digest: proposal.contract_digest, article_id: article.id, path: file.path,
    before_sha256: await sha256(file.before_utf8), after_sha256: await sha256(file.after_utf8)};
  requireValue(receipt.before_sha256 === proposal.file_changes[0].before_sha256, 409, 'publication_projection_invalid');
  const branch = 'orbit/content-' + (await sha256(canonical(receipt) + proposal.patch_digest)).slice(0, 32);
  const projection = {repository: PUBLIC_REPOSITORY, base_commit: proposal.base_commit, branch,
    title: '知识增补：' + article.title,
    body: '为现有文章补充经本人审阅的知识内容。\n\n本 PR 仅包含下列文件的正文增补：\n\n- `' + file.path +
      '`\n\n结构、内容、构建与渲染检查由 GitHub CI 执行。合并发布需要另行确认。',
    commit_message: 'Atlas knowledge update\n\nAtlas-Publication: ' + canonical(receipt),
    file: {path: file.path, before_sha256: receipt.before_sha256, after_sha256: receipt.after_sha256, after_utf8: file.after_utf8}};
  return {...projection, public_digest: await sha256(canonical(projection))};
}
