import {architectureDiscussion} from './candidate-organization.js';

export function candidateAdvice(document, candidate) {
  const organization = candidate.placement_view.organization;
  const node = (tag, text = '') => {const el = document.createElement(tag); el.textContent = text; return el;};
  const section = node('section'); section.className = 'candidate-organization';
  section.append(node('p', organization.label));
  const details = node('details'); details.append(node('summary', organization.advice ? '归属理由与架构建议' : '查看归属理由'), node('p', organization.reason));
  if (organization.advice || organization.status !== 'fits') {
    if (organization.advice) for (const [key, label] of [['problem', '问题'], ['suggestion', '建议'], ['impact', '待核对的影响']]) {
      details.append(node('strong', label), node('p', organization.advice[key]));
    }
    details.append(node('p', '建议保持私有；架构调整请带回架构设计对话讨论。Orbit 不会执行。'));
    const copy = node('button', '复制到架构讨论'), status = node('p'), fallback = node('textarea');
    copy.type = 'button'; copy.className = 'copy-architecture-advice'; fallback.hidden = true; fallback.readOnly = true;
    fallback.setAttribute('aria-label', '私人架构讨论建议'); status.setAttribute('role', 'status');
    copy.onclick = async () => {
      const value = architectureDiscussion(candidate, organization);
      try {await document.defaultView.navigator.clipboard.writeText(value); status.textContent = '已复制；请在架构设计对话中粘贴。';}
      catch {fallback.hidden = false; fallback.value = value; fallback.focus(); fallback.select(); status.textContent = '请复制下方已选中的建议。';}
    };
    details.append(copy, status, fallback);
  }
  section.append(details); return section;
}
