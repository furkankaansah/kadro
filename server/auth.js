'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { prep, dataDir } = require('./db');
const { parseCookies } = require('./http');

const COOKIE = 'kadro_token';
const MAX_AGE_S = 30 * 24 * 3600;

function loadSecret() {
  if (process.env.KADRO_SECRET) return process.env.KADRO_SECRET;
  const file = path.join(dataDir, '.secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}
const SECRET = loadSecret();

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Kullanıcı adı yokken de aynı sürede hesaplama yapmak için (zamanlama farkından kullanıcı tespitini engeller).
const DUMMY_HASH = hashPassword('kadro-dummy-password');

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

function signToken(userId, ver = 0) {
  const payload = b64(JSON.stringify({ uid: userId, v: ver, exp: Date.now() + MAX_AGE_S * 1000 }));
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.uid || data.exp < Date.now()) return null;
    return { uid: data.uid, v: data.v || 0 };
  } catch {
    return null;
  }
}

function isSecure(req) {
  return (
    process.env.COOKIE_SECURE === '1' ||
    !!req.socket.encrypted ||
    req.headers['x-forwarded-proto'] === 'https'
  );
}

/** user: { id, session_ver } satırı. Şifre değişince session_ver artar ve eski çerezler geçersiz olur. */
function setAuthCookie(req, res, user) {
  const parts = [`${COOKIE}=${signToken(user.id, user.session_ver || 0)}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${MAX_AGE_S}`];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAuthCookie(req, res) {
  const parts = [`${COOKIE}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

/** İstekteki çerezden kullanıcı satırını döndürür (yoksa null). */
function userFromRequest(req) {
  const tok = verifyToken(parseCookies(req.headers.cookie)[COOKIE]);
  if (!tok) return null;
  const user = prep('SELECT * FROM users WHERE id = ?').get(tok.uid);
  if (!user || user.session_ver !== tok.v) return null;
  if (user.banned_at) return null; // yasaklı hesap oturumu anında düşer
  const t = Date.now();
  if (t - user.last_seen > 60_000) {
    prep('UPDATE users SET last_seen = ? WHERE id = ?').run(t, user.id);
    user.last_seen = t;
  }
  return user;
}

module.exports = {
  sign,
  hashPassword,
  verifyPassword,
  DUMMY_HASH,
  setAuthCookie,
  clearAuthCookie,
  userFromRequest,
};
