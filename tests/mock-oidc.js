'use strict';

const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.MOCK_OIDC_PORT || 18084);
const ISSUER = process.env.MOCK_OIDC_ISSUER || `http://127.0.0.1:${PORT}`;
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: 'jwk' });
publicJwk.kid = 'mock-key';
publicJwk.use = 'sig';
publicJwk.alg = 'RS256';
const codes = new Map();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signJwt(claims) {
  const header = { alg: 'RS256', typ: 'JWT', kid: 'mock-key' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaims = base64url(JSON.stringify(claims));
  const input = `${encodedHeader}.${encodedClaims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
  return `${input}.${signature}`;
}

function challenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, ISSUER);
  if (req.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
    return json(res, 200, {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
      end_session_endpoint: `${ISSUER}/logout`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256']
    });
  }
  if (req.method === 'GET' && url.pathname === '/jwks') return json(res, 200, { keys: [publicJwk] });
  if (req.method === 'GET' && url.pathname === '/authorize') {
    const code = crypto.randomBytes(18).toString('base64url');
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    if (!redirectUri || !state || url.searchParams.get('response_type') !== 'code') return json(res, 400, { error: 'invalid_request' });
    codes.set(code, {
      clientId: url.searchParams.get('client_id'),
      redirectUri,
      nonce: url.searchParams.get('nonce'),
      codeChallenge: url.searchParams.get('code_challenge')
    });
    const target = new URL(redirectUri);
    target.searchParams.set('code', code);
    target.searchParams.set('state', state);
    res.statusCode = 302;
    res.setHeader('Location', target.toString());
    return res.end();
  }
  if (req.method === 'POST' && url.pathname === '/token') {
    const form = new URLSearchParams(await readBody(req));
    const code = form.get('code');
    const record = codes.get(code);
    if (!record) return json(res, 400, { error: 'invalid_grant' });
    if (form.get('client_id') !== record.clientId || form.get('redirect_uri') !== record.redirectUri) return json(res, 400, { error: 'invalid_grant' });
    if (challenge(form.get('code_verifier') || '') !== record.codeChallenge) return json(res, 400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
    codes.delete(code);
    const now = Math.floor(Date.now() / 1000);
    const idToken = signJwt({
      iss: ISSUER,
      sub: 'ci-user-subject',
      aud: record.clientId,
      exp: now + 300,
      iat: now,
      nonce: record.nonce,
      preferred_username: 'ci.user',
      name: 'CI User',
      email: 'ci.user@example.test',
      groups: ['ci-external-group']
    });
    return json(res, 200, { token_type: 'Bearer', expires_in: 300, id_token: idToken, access_token: 'mock-access-token' });
  }
  if (req.method === 'GET' && url.pathname === '/logout') {
    res.statusCode = 302;
    res.setHeader('Location', url.searchParams.get('post_logout_redirect_uri') || '/');
    return res.end();
  }
  return json(res, 404, { error: 'not_found' });
});

server.listen(PORT, '127.0.0.1', () => console.log(`Mock OIDC provider listening on ${ISSUER}`));
