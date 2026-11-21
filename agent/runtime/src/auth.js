import {createRemoteJWKSet, customFetch, jwtVerify} from 'jose';
import {ApiError, requireValue, sha256} from './common.js';

export function createAuthenticator(fetchImpl) {
  const sets = new Map();
  return async function authenticate(request, env) {
    requireValue(/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER || '') &&
      typeof env.ACCESS_AUD === 'string' && env.ACCESS_AUD.length >= 8 &&
      typeof env.OWNER_EMAIL === 'string' && env.OWNER_EMAIL.includes('@') &&
      /^https:\/\/[^/?#]+$/.test(env.PRIVATE_ORIGIN || ''), 503, 'identity_not_configured');
    requireValue(new URL(request.url).origin === env.PRIVATE_ORIGIN, 403, 'wrong_origin');
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    requireValue(token && token.length <= 16_384, 401, 'authentication_required');
    let jwks = sets.get(env.ACCESS_ISSUER);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(env.ACCESS_ISSUER + '/cdn-cgi/access/certs'), {
        [customFetch]: (url, init) => fetchImpl(url, {...init, redirect: 'manual'}), timeoutDuration: 5000,
      });
      sets.set(env.ACCESS_ISSUER, jwks);
    }
    let payload;
    try {
      ({payload} = await jwtVerify(token, jwks, {issuer: env.ACCESS_ISSUER,
        audience: env.ACCESS_AUD, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub', 'email']}));
    } catch { throw new ApiError(401, 'invalid_identity'); }
    requireValue(typeof payload.email === 'string' && payload.email.toLowerCase() === env.OWNER_EMAIL.trim().toLowerCase() &&
      typeof payload.sub === 'string' && payload.sub.length > 0 && payload.iat <= Math.floor(Date.now() / 1000) + 30,
    403, 'owner_required');
    return {ownerId: await sha256(env.ACCESS_ISSUER + '\0' + env.OWNER_EMAIL.trim().toLowerCase()), subject: payload.sub};
  };
}

export function mutationGuard(request, env) {
  requireValue(request.headers.get('Origin') === env.PRIVATE_ORIGIN &&
    request.headers.get('X-Atlas-Request') === '1' &&
    !['cross-site'].includes(request.headers.get('Sec-Fetch-Site')), 403, 'request_origin_required');
}
