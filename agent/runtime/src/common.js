export class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
export function requireValue(value, status, code) { if (!value) throw new ApiError(status, code); }
export const epoch = () => Math.floor(Date.now() / 1000);
export const hex40 = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && value.length === 40;
export const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && value.length === 64;
export const uid = () => crypto.randomUUID();
export function canonical(value) {
  const order = item => Array.isArray(item) ? item.map(order) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, order(item[key])])) : item;
  return JSON.stringify(order(value));
}
export async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function readText(response, limit = 1_000_000) {
  requireValue(response.ok && response.body, 503, 'upstream_unavailable');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) { const {value, done} = await reader.read(); if (done) break;
      size += value.byteLength; requireValue(size <= limit, 413, 'payload_too_large'); chunks.push(value); }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
}
export async function readJSONRequest(request, limit = 16_000) {
  requireValue(request.headers.get('content-type')?.split(';')[0].trim() === 'application/json', 415, 'json_required');
  // Reuse the bounded stream reader without treating a Request as an upstream response.
  const text = await readText(new Response(request.body), limit);
  try { return JSON.parse(text); } catch { throw new ApiError(400, 'invalid_json'); }
}
export function record(value) { return value && typeof value === 'object' && !Array.isArray(value); }
export function exactKeys(value, allowed) { return record(value) && Object.keys(value).every(key => allowed.includes(key)); }
export function text(value, max) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
export function json(value, status = 200, extra = {}) {
  return Response.json(value, {status, headers: {'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra}});
}
