// No DB, model key, GitHub App key, Owner session or general API proxy here.
// The broker independently verifies GitHub OIDC and the exact assigned run.
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method !== 'POST' || !/^\/validation\/[a-f0-9-]{36}\/(claim|report)$/.test(path)) return new Response(null, {status: 404});
    if (!env.BROKER) return new Response(null, {status: 503});
    return env.BROKER.fetch(request);
  },
};
