'use strict';

// E-posta doğrulama: 6 haneli kod + tek tıkla bağlantı. İkisi de veritabanında sadece özet (HMAC) olarak durur.

const crypto = require('node:crypto');
const { prep } = require('./db');
const auth = require('./auth');

const TTL_MS = 24 * 3600 * 1000;
const MAX_ATTEMPTS = 5; // yanlış kod hakkı; dolunca yeni kod istenmeli
const RESEND_GAP_MS = 60_000;
const PER_HOUR = 5;

const hashCode = (userId, code) => auth.sign(`vc:${userId}:${code}`);
const hashToken = (token) => auth.sign(`vt:${token}`);
const safeEq = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Yeni kod + bağlantı anahtarı üretir ve (özetlerini) kaydeder. Eskileri geçersiz kılar. */
function issue(user) {
  const code = String(crypto.randomInt(100000, 1000000));
  const token = crypto.randomBytes(24).toString('base64url');
  prep(
    `UPDATE users SET verify_code_hash = ?, verify_token_hash = ?, verify_expires = ?, verify_attempts = 0, verify_sent_at = ? WHERE id = ?`
  ).run(hashCode(user.id, code), hashToken(token), Date.now() + TTL_MS, Date.now(), user.id);
  return { code, token };
}

function markVerified(userId) {
  prep(
    `UPDATE users SET email_verified = 1, verify_code_hash = NULL, verify_token_hash = NULL, verify_expires = 0, verify_attempts = 0 WHERE id = ?`
  ).run(userId);
}

/** 'ok' | 'bad' | 'locked' | 'expired' */
function checkCode(user, code) {
  if (!user.verify_code_hash || user.verify_expires < Date.now()) return 'expired';
  if (user.verify_attempts >= MAX_ATTEMPTS) return 'locked';
  if (/^\d{6}$/.test(code) && safeEq(user.verify_code_hash, hashCode(user.id, code))) {
    markVerified(user.id);
    return 'ok';
  }
  prep('UPDATE users SET verify_attempts = verify_attempts + 1 WHERE id = ?').run(user.id);
  return user.verify_attempts + 1 >= MAX_ATTEMPTS ? 'locked' : 'bad';
}

/** E-postadaki bağlantı. Başarılıysa true. */
function consumeToken(token) {
  if (typeof token !== 'string' || token.length < 16) return false;
  const row = prep('SELECT id, verify_expires FROM users WHERE verify_token_hash = ?').get(hashToken(token));
  if (!row || row.verify_expires < Date.now()) return false;
  markVerified(row.id);
  return true;
}

// ---------- Şifre sıfırlama (aynı mantık: 6 haneli kod + tek kullanımlık bağlantı, ama 1 saat geçerli) ----------

const RESET_TTL_MS = 3600_000;
const hashResetCode = (userId, code) => auth.sign(`rc:${userId}:${code}`);
const hashResetToken = (token) => auth.sign(`rt:${token}`);

function issueReset(user) {
  const code = String(crypto.randomInt(100000, 1000000));
  const token = crypto.randomBytes(24).toString('base64url');
  prep(
    `UPDATE users SET reset_code_hash = ?, reset_token_hash = ?, reset_expires = ?, reset_attempts = 0, reset_sent_at = ? WHERE id = ?`
  ).run(hashResetCode(user.id, code), hashResetToken(token), Date.now() + RESET_TTL_MS, Date.now(), user.id);
  return { code, token };
}

/** Bağlantıdaki anahtara karşılık gelen (süresi dolmamış) kullanıcı satırı ya da null. */
function findByResetToken(token) {
  if (typeof token !== 'string' || token.length < 16) return null;
  const row = prep('SELECT * FROM users WHERE reset_token_hash = ?').get(hashResetToken(token));
  return row && row.reset_expires >= Date.now() ? row : null;
}

/** 'ok' | 'bad' | 'locked' | 'expired' (başarıda kodu silmez; şifre yazıldıktan sonra clearReset çağrılır) */
function checkResetCode(user, code) {
  if (!user.reset_code_hash || user.reset_expires < Date.now()) return 'expired';
  if (user.reset_attempts >= MAX_ATTEMPTS) return 'locked';
  if (/^\d{6}$/.test(code) && safeEq(user.reset_code_hash, hashResetCode(user.id, code))) return 'ok';
  prep('UPDATE users SET reset_attempts = reset_attempts + 1 WHERE id = ?').run(user.id);
  return user.reset_attempts + 1 >= MAX_ATTEMPTS ? 'locked' : 'bad';
}

function clearReset(userId) {
  prep(
    `UPDATE users SET reset_code_hash = NULL, reset_token_hash = NULL, reset_expires = 0, reset_attempts = 0 WHERE id = ?`
  ).run(userId);
}

// Kullanıcı başına gönderim sınırı: iki gönderim arası en az 1 dk, saatte en fazla 5 (doğrulama ve sıfırlama ayrı sayılır).
const sent = new Map(); // "kind:userId" -> [zamanlar]
function mailAllowed(user, { ignoreGap = false, kind = 'verify' } = {}) {
  const t = Date.now();
  const last = kind === 'reset' ? user.reset_sent_at : user.verify_sent_at;
  if (!ignoreGap && t - (last || 0) < RESEND_GAP_MS) return false;
  const key = `${kind}:${user.id}`;
  const arr = (sent.get(key) || []).filter((x) => t - x < 3600_000);
  if (arr.length >= PER_HOUR) {
    sent.set(key, arr);
    return false;
  }
  arr.push(t);
  sent.set(key, arr);
  return true;
}
setInterval(() => sent.clear(), 3600_000).unref();

module.exports = { issue, checkCode, consumeToken, markVerified, issueReset, findByResetToken, checkResetCode, clearReset, mailAllowed };
