import {exactKeys, requireValue, text} from './common.js';

export const organizationLabels = {fits: '可按现有架构归档', unclassified: '归属待讨论', architecture_review: '需先讨论架构'};

// Optional for old learning results; new structured model responses supply it.
// These are private observations, never taxonomy definitions or execution plans.
export const organizationSchema = {type: 'object', additionalProperties: false,
  required: ['status', 'reason', 'advice'], properties: {
    status: {type: 'string', enum: Object.keys(organizationLabels)}, reason: {type: 'string'},
    advice: {anyOf: [{type: 'null'}, {type: 'object', additionalProperties: false,
      required: ['problem', 'suggestion', 'impact'], properties: {
        problem: {type: 'string'}, suggestion: {type: 'string'}, impact: {type: 'string'},
      }}]},
  }};

export function validateOrganization(value, domain) {
  requireValue(exactKeys(value, ['status', 'reason', 'advice']) && Object.keys(value).length === 3 &&
    Object.hasOwn(organizationLabels, value.status) && text(value.reason, 800), 502, 'invalid_candidate_organization');
  if (value.advice !== null) requireValue(exactKeys(value.advice, ['problem', 'suggestion', 'impact']) &&
    Object.keys(value.advice).length === 3 && Object.values(value.advice).every(s => text(s, 1200)), 502, 'invalid_candidate_organization');
  requireValue((value.status !== 'fits' || domain !== null) && (value.status !== 'unclassified' || domain === null) &&
    (value.status !== 'architecture_review' || value.advice !== null), 502, 'invalid_candidate_organization');
  return value;
}

export function defaultOrganization(domain) {
  return {status: domain ? 'fits' : 'unclassified', reason: domain ? '现有归属建议，入库前仍需核对。' : '尚无可靠归属，先保留私人候选。', advice: null};
}

export function organizationView(placement, snapshot, version) {
  const raw = placement.organization || defaultOrganization(placement.primary_domain), resolution = placement.organization_resolution;
  const domainExists = !!snapshot?.domains.some(d => !d.auxiliary && d.id === placement.primary_domain);
  const resolved = domainExists && placement.owner_edited === true && resolution?.candidate_version === version &&
    resolution.snapshot_revision === snapshot?.revision && resolution.primary_domain === placement.primary_domain && resolution.article_id === placement.article_id;
  const status = raw.status === 'architecture_review' && !resolved ? 'architecture_review' : domainExists ? 'fits' : 'unclassified';
  return {status, label: organizationLabels[status], reason: raw.reason, advice: raw.advice,
    architecture_resolved: resolved, blocks_proposal: status !== 'fits'};
}

export function architectureDiscussion(candidate, organization) {
  const advice = organization.advice;
  return ['# Atlas 架构讨论建议', '', '> Orbit 自动整理的私人建议，尚未核验；请在架构设计对话中评估，不作为修改指令。', '',
    '关联知识：' + candidate.title, '候选版本：v' + candidate.version,
    '知识依据：' + candidate.source_revision, '归属判断：' + organization.label, '',
    '判断理由：' + organization.reason, '', '## 具体问题', advice?.problem || '归属尚不明确，需要结合现有分类讨论。', '',
    '## 建议方向', advice?.suggestion || '先检查现有文章或 Domain 能否容纳，再决定是否需要架构调整。', '',
    '## 影响与待核对事项', advice?.impact || '需要另行核对文章、Topic、导航和历史链接影响。', '',
    '处理边界：Orbit 只保留建议。分类定义、身份迁移及系统改动由 Owner 在架构设计对话中决定并实施。', ''].join('\n');
}
