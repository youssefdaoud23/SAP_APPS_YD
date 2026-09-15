'use strict';

const crypto = require('crypto');

function b64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function fromB64url(value) {
  return Buffer.from(String(value || ''), 'base64url');
}

function keyFromSecret(secret) {
  const value = String(secret || '');
  if (value.length < 32) throw new Error('OIDC_SESSION_SECRET must be at least 32 characters.');
  return crypto.createHash('sha256').update(value).digest();
}

function seal(payload, secret, purpose = 'session') {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  cipher.setAAD(Buffer.from(`invarture:${purpose}`));
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${b64url(iv)}.${b64url(ciphertext)}.${b64url(tag)}`;
}

function open(token, secret, purpose = 'session') {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid secure cookie.');
  const [ivText, cipherText, tagText] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFromSecret(secret), fromB64url(ivText));
  decipher.setAAD(Buffer.from(`invarture:${purpose}`));
  decipher.setAuthTag(fromB64url(tagText));
  const plaintext = Buffer.concat([decipher.update(fromB64url(cipherText)), decipher.final()]).toString('utf8');
  return JSON.parse(plaintext);
}

function parseCookies(header) {
  const result = {};
  for (const item of String(header || '').split(';')) {
    const index = item.indexOf('=');
    if (index < 1) continue;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (!key) continue;
    try { result[key] = decodeURIComponent(value); }
    catch { result[key] = value; }
  }
  return result;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value || '')}`];
  parts.push(`Path=${options.path || '/'}`);
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0, Math.floor(Number(options.maxAge)))}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

module.exports = { seal, open, parseCookies, serializeCookie };
