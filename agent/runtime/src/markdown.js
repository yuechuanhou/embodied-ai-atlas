import {Marked} from 'marked';
import createDOMPurify from 'dompurify';

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const markdown = new Marked({gfm: true, breaks: false, renderer: {
  html: ({text}) => escape(text),
  image: ({text}) => escape(text || '图片'),
}});

export function renderMarkdown(text, document) {
  const purify = createDOMPurify(document.defaultView);
  const fragment = purify.sanitize(markdown.parse(text), {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
      'ul', 'ol', 'li', 'hr', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'title', 'start'], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false, RETURN_DOM_FRAGMENT: true,
  });
  for (const link of fragment.querySelectorAll('a')) {
    try {
      if (!link.hasAttribute('href')) throw new Error('missing_link');
      const url = new URL(link.getAttribute('href'), document.location.href);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('unsafe_link');
      link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    } catch {link.replaceWith(...link.childNodes);}
  }
  return fragment;
}
