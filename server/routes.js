'use strict';

const crypto = require('node:crypto');
const { prep, tx } = require('./db');
const C = require('./constants');
const live = require('./live');
const auth = require('./auth');
const mailer = require('./mailer');
const verification = require('./verification');
const moderation = require('./moderation');
const { bad, HANDLED, Router } = require('./http');

const router = new Router();

// ---------- Yardımcılar ----------

const now = () => Date.now();
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const clampInt = (v, min, max, def) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const like = (q) => '%' + q.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
const GAME_IDS = new Set(C.GAMES.map((g) => g.id));
const isGame = (id) => typeof id === 'string' && GAME_IDS.has(id);
const plain = (row) => (row ? { ...row } : row);
const newInviteCode = () => crypto.randomBytes(5).toString('hex');

// ---------- Kullanıcı görünümleri ----------

const userRow = (username) => (username ? prep('SELECT * FROM users WHERE username = ?').get(username) : undefined);

/** Listelerde gösterilen kısa görünüm. */
const brief = (u) => ({ id: u.id, username: u.username, displayName: u.display_name, online: live.isOnline(u.id) });
const userView = (u) => ({ ...brief(u), bio: u.bio || '', createdAt: u.created_at });

// ---------- E-posta ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const cleanEmail = (v) => str(v, 120).toLowerCase();
/** E-postası olup henüz doğrulamamış hesap. (E-postasız eski hesaplar kısıtlanmaz.) */
const needsVerify = (u) => !!u.email && !u.email_verified;
/** Kendi hesabımın görünümü: e-posta ve doğrulama durumu yalnızca bana gösterilir. */
const selfView = (u) => ({
  ...userView(u),
  email: u.email || null,
  emailVerified: !needsVerify(u),
  isAdmin: moderation.isAdmin(u),
  blocked: moderation.blockedIdsOf(u.id), // engellediğim kişilerin kimlikleri (canlı mesajları süzmek için)
});
function requireVerified(user) {
  if (needsVerify(user)) throw bad('email_unverified', 403);
}
const pickLang = (ctx) => {
  const l = ctx.body && typeof ctx.body.lang === 'string' ? ctx.body.lang : String(ctx.req.headers['accept-language'] || '');
  return /^en/i.test(l) ? 'en' : 'tr';
};

/** E-postadaki bağlantıların kökü. Sahte Host başlığı kullanılmasın: gerçek gönderimde yalnızca PUBLIC_URL güvenilir. */
function mailBase(ctx) {
  let base = mailer.publicUrl();
  if (!base && !mailer.configured) base = `http://${ctx.req.headers.host || 'localhost'}`;
  return base;
}

/** Yeni kod üretip doğrulama e-postasını gönderir. */
async function sendVerification(ctx, user) {
  const { code, token } = verification.issue(user);
  const base = mailBase(ctx);
  const link = base ? `${base}/api/auth/verify?token=${encodeURIComponent(token)}` : null;
  const mail = mailer.verificationMail({ lang: pickLang(ctx), name: user.display_name, code, link });
  await mailer.send({ to: user.email, ...mail });
}

async function sendReset(ctx, user) {
  const { code, token } = verification.issueReset(user);
  const base = mailBase(ctx);
  const link = base ? `${base}/?reset=${encodeURIComponent(token)}` : null;
  const mail = mailer.resetMail({ lang: pickLang(ctx), name: user.display_name, code, link });
  await mailer.send({ to: user.email, ...mail });
}

const checkNewPassword = (body) => {
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8 || password.length > 100) throw bad('weak_password');
  if (typeof body.passwordConfirm === 'string' && body.passwordConfirm !== password) throw bad('password_mismatch');
  return password;
};

// ---------- Arkadaşlık ----------

const pair = (a, b) => (a < b ? [a, b] : [b, a]);

function friendshipRow(a, b) {
  const [x, y] = pair(a, b);
  return prep('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?').get(x, y);
}

/** meId'nin other ile ilişkisi: self | friend | incoming (o bana istek yolladı) | outgoing (ben yolladım) | none */
function relationOf(meId, otherId) {
  if (meId === otherId) return 'self';
  const f = friendshipRow(meId, otherId);
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friend';
  return f.requester_id === meId ? 'outgoing' : 'incoming';
}
const areFriends = (a, b) => relationOf(a, b) === 'friend';

function acceptFriendship(me, other) {
  const [x, y] = pair(me.id, other.id);
  prep("UPDATE friendships SET status = 'accepted', created_at = ? WHERE user_a = ? AND user_b = ?").run(now(), x, y);
  live.toUser(other.id, 'friend:accepted', { user: brief(me), incoming: true }); // incoming: isteğini gönderen taraf
  live.toUser(me.id, 'friend:accepted', { user: brief(other) });
}

// ---------- Oda (oyun grubu / arkadaş grubu / dm) görünümleri ----------

// Bir odanın son hareketi: son mesaj ya da (mesaj yoksa) oluşturulma zamanı.
const ACTIVITY = 'MAX(r.created_at, COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE m.room_id = r.id), 0))';

const ROOM_SELECT = `
  SELECT r.*, u.username AS owner_username, u.display_name AS owner_display,
    ${ACTIVITY} AS activity,
    (SELECT COUNT(*) FROM room_members m WHERE m.room_id = r.id) AS member_count,
    EXISTS (SELECT 1 FROM room_members m WHERE m.room_id = r.id AND m.user_id = ?) AS is_member
  FROM rooms r JOIN users u ON u.id = r.owner_id`;

const queryRooms = (me, where, params, tail = '') => prep(`${ROOM_SELECT} WHERE ${where} ${tail}`).all(me, ...params);
const getRoom = (id, me) => prep(`${ROOM_SELECT} WHERE r.id = ?`).get(me, id);
const idleCutoff = () => now() - C.GROUP_IDLE_MS;

function serializeRoom(r) {
  const out = {
    id: r.id,
    kind: r.kind,
    gameId: r.game_id,
    title: r.title,
    description: r.description,
    isPublic: !!r.is_public,
    maxMembers: r.max_members,
    status: r.status,
    createdAt: r.created_at,
    activity: r.activity,
    memberCount: r.member_count,
    full: r.member_count >= r.max_members,
    isMember: !!r.is_member,
    owner: { id: r.owner_id, username: r.owner_username, displayName: r.owner_display },
  };
  // Davet kodu sadece arkadaş gruplarında ve sadece üyelere gösterilir.
  if (r.is_member && r.kind === 'community') out.inviteCode = r.invite_code;
  return out;
}

const memberIds = (roomId) => prep('SELECT user_id FROM room_members WHERE room_id = ?').all(roomId).map((r) => r.user_id);

const roomMembers = (roomId) =>
  prep(
    `SELECT u.id, u.username, u.display_name, m.role, m.joined_at
       FROM room_members m JOIN users u ON u.id = m.user_id
      WHERE m.room_id = ? ORDER BY m.joined_at, u.id`
  )
    .all(roomId)
    .map((m) => ({
      id: m.id,
      username: m.username,
      displayName: m.display_name,
      role: m.role,
      online: live.isOnline(m.id),
    }));

const previewMembers = (roomId) =>
  prep(
    `SELECT u.username, u.display_name FROM room_members m JOIN users u ON u.id = m.user_id
      WHERE m.room_id = ? ORDER BY m.joined_at, u.id LIMIT 5`
  )
    .all(roomId)
    .map((m) => ({ username: m.username, displayName: m.display_name }));

const lastReadOfNewMember = '(SELECT COALESCE(MAX(id), 0) FROM messages WHERE room_id = ?)';

function addMember(roomId, userId, role = 'member') {
  prep(
    `INSERT INTO room_members (room_id, user_id, role, joined_at, last_read_id)
     VALUES (?, ?, ?, ?, ${lastReadOfNewMember})`
  ).run(roomId, userId, role, now(), roomId);
}

function joinRoom(user, row, code) {
  if (!row || row.kind === 'dm' || row.status !== 'open') throw bad('not_found', 404);
  if (row.is_member) return;
  if (row.kind === 'lfg' && row.activity < idleCutoff()) throw bad('expired', 410);
  if (!row.is_public && (!code || String(code).toLowerCase() !== row.invite_code)) throw bad('invalid_code', 403);
  if (row.member_count >= row.max_members) throw bad('group_full', 409);
  addMember(row.id, user.id);
  live.toUsers(memberIds(row.id), 'member:joined', { roomId: row.id, user: brief(user) });
}

function requireMember(roomId, userId) {
  const ok = prep('SELECT 1 AS x FROM room_members WHERE room_id = ? AND user_id = ?').get(roomId, userId);
  if (!ok) throw bad('not_member', 403);
}

// ---------- Genel bilgi ----------

router.get('/games', () => ({
  games: C.GAMES.map((g) => ({ id: g.id, name: g.name, color: g.color, short: g.short })),
}));

// Arayüzün ihtiyaç duyduğu herkese açık site bilgileri (yasal sayfalardaki iletişim adresi gibi).
router.get('/config', () => ({
  siteName: process.env.SITE_NAME || 'Kadro',
  operator: process.env.OPERATOR_NAME || '',
  contactEmail: process.env.CONTACT_EMAIL || '',
  mailConfigured: mailer.configured,
}));

router.get('/stats', () => {
  const rows = prep(
    `SELECT r.game_id AS gameId, COUNT(*) AS c FROM rooms r
      WHERE r.kind = 'lfg' AND r.status = 'open' AND ${ACTIVITY} > ?
      GROUP BY r.game_id`
  ).all(idleCutoff());
  const byGame = {};
  let openGroups = 0;
  for (const r of rows) {
    byGame[r.gameId] = r.c;
    openGroups += r.c;
  }
  return {
    players: prep('SELECT COUNT(*) AS c FROM users').get().c,
    online: live.onlineCount(),
    openGroups,
    byGame,
  };
});

// ---------- Kimlik doğrulama ----------

router.post('/auth/register', (ctx) => {
  const username = str(ctx.body.username, 20);
  const password = typeof ctx.body.password === 'string' ? ctx.body.password : '';
  const displayName = str(ctx.body.displayName, 30) || username;
  const email = cleanEmail(ctx.body.email);
  if (!EMAIL_RE.test(email)) throw bad('invalid_email');
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) throw bad('invalid_username');
  if (password.length < 8 || password.length > 100) throw bad('weak_password');
  if (ctx.body.acceptTerms !== true) throw bad('terms_required'); // kullanım şartları ve gizlilik politikası kabulü
  if (typeof ctx.body.passwordConfirm === 'string' && ctx.body.passwordConfirm !== password) throw bad('password_mismatch');
  if (prep('SELECT 1 AS x FROM users WHERE username = ?').get(username)) throw bad('username_taken', 409);
  if (prep('SELECT 1 AS x FROM users WHERE email = ?').get(email)) throw bad('email_taken', 409);
  const t = now();
  let info;
  try {
    info = prep(
      'INSERT INTO users (username, display_name, password_hash, email, email_verified, langs, hours, created_at, last_seen, accepted_terms_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)'
    ).run(username, displayName, auth.hashPassword(password), email, 'tr', '', t, t, t);
  } catch (err) {
    // Aynı anda gelen iki kayıt kontrolü geçse bile benzersiz dizin yakalar.
    if (/UNIQUE/.test(String(err.message))) throw bad(/email/.test(String(err.message)) ? 'email_taken' : 'username_taken', 409);
    throw err;
  }
  const user = prep('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
  auth.setAuthCookie(ctx.req, ctx.res, user);
  // E-posta yolda diye kaydı bekletme; gönderilemezse kullanıcı "yeniden gönder" ile tekrar dener.
  verification.mailAllowed(user, { ignoreGap: true });
  sendVerification(ctx, user).catch((err) => console.error('[posta] doğrulama e-postası gönderilemedi:', err.message));
  ctx.status = 201;
  return { user: selfView(user), verify: { sent: true } };
});

// E-postadaki bağlantı: doğrular ve ana sayfaya döner (arayüz ?verified=1|0 ile haber verir).
router.get('/auth/verify', (ctx) => {
  const ok = verification.consumeToken(str(ctx.query.token, 80));
  ctx.res.writeHead(302, { Location: ok ? '/?verified=1' : '/?verified=0', 'Cache-Control': 'no-store' });
  ctx.res.end();
  return HANDLED;
});

// Elle kod girme (e-postadaki 6 haneli kod).
router.post('/auth/verify', { auth: true }, ({ user, body }) => {
  if (!needsVerify(user)) return { user: selfView(user) };
  const result = verification.checkCode(user, str(body.code, 12).replace(/\s/g, ''));
  if (result === 'expired') throw bad('verify_expired', 410);
  if (result === 'locked') throw bad('verify_locked', 429);
  if (result !== 'ok') throw bad('bad_verify_code', 400);
  return { user: selfView(prep('SELECT * FROM users WHERE id = ?').get(user.id)) };
});

router.post('/auth/resend-verification', { auth: true }, async (ctx) => {
  const { user } = ctx;
  if (!needsVerify(user)) return { ok: true };
  if (!verification.mailAllowed(user)) throw bad('rate_limited', 429);
  try {
    await sendVerification(ctx, user);
  } catch (err) {
    console.error('[posta] doğrulama e-postası gönderilemedi:', err.message);
    throw bad('mail_failed', 502);
  }
  return { ok: true };
});

// Yanlış yazılmış e-postayı doğrulamadan önce düzeltmek için.
router.post('/auth/change-email', { auth: true }, async (ctx) => {
  const { user, body } = ctx;
  if (!needsVerify(user)) throw bad('already_verified', 409);
  const email = cleanEmail(body.email);
  if (!EMAIL_RE.test(email)) throw bad('invalid_email');
  const other = prep('SELECT id FROM users WHERE email = ?').get(email);
  if (other && other.id !== user.id) throw bad('email_taken', 409);
  if (!verification.mailAllowed(user, { ignoreGap: true })) throw bad('rate_limited', 429);
  prep('UPDATE users SET email = ? WHERE id = ?').run(email, user.id);
  const fresh = prep('SELECT * FROM users WHERE id = ?').get(user.id);
  try {
    await sendVerification(ctx, fresh);
  } catch (err) {
    console.error('[posta] doğrulama e-postası gönderilemedi:', err.message);
    throw bad('mail_failed', 502);
  }
  return { user: selfView(fresh) };
});

router.post('/auth/login', (ctx) => {
  const username = str(ctx.body.username, 20);
  const password = typeof ctx.body.password === 'string' ? ctx.body.password : '';
  const user = prep('SELECT * FROM users WHERE username = ?').get(username);
  const ok = auth.verifyPassword(password, user ? user.password_hash : auth.DUMMY_HASH);
  if (!user || !ok) throw bad('bad_credentials', 401);
  // Şifre doğru olduktan sonra söylenir: yasak bilgisi başkalarına sızmasın.
  if (user.banned_at) throw bad('banned', 403, { reason: user.ban_reason || '' });
  auth.setAuthCookie(ctx.req, ctx.res, user);
  return { user: selfView(user) };
});

// Şifremi unuttum: hesap olsun olmasın aynı yanıt döner (e-posta adresinin kayıtlı olup olmadığı sızmasın),
// ve gönderim arkada yapılır (yanıt süresinden de anlaşılmasın).
router.post('/auth/forgot', (ctx) => {
  const email = cleanEmail(ctx.body.email);
  if (!EMAIL_RE.test(email)) throw bad('invalid_email');
  const user = prep('SELECT * FROM users WHERE email = ?').get(email);
  if (user && !user.banned_at && verification.mailAllowed(user, { kind: 'reset' })) {
    sendReset(ctx, user).catch((err) => console.error('[posta] sıfırlama e-postası gönderilemedi:', err.message));
  }
  return { ok: true };
});

// Yeni şifre: e-postadaki bağlantı anahtarı (token) YA DA e-posta + 6 haneli kod ile.
router.post('/auth/reset', (ctx) => {
  const { body } = ctx;
  const password = checkNewPassword(body); // önce şifre geçerli mi: hatalı şifre denemesi kod hakkını yemesin
  let user = null;
  if (typeof body.token === 'string' && body.token) {
    user = verification.findByResetToken(str(body.token, 80));
    if (!user) throw bad('reset_invalid', 400);
  } else {
    const u = prep('SELECT * FROM users WHERE email = ?').get(cleanEmail(body.email));
    if (!u) throw bad('bad_verify_code', 400); // kayıtlı olmayan adres de "kod yanlış" gibi görünür
    const result = verification.checkResetCode(u, str(body.code, 12).replace(/\s/g, ''));
    if (result === 'expired') throw bad('reset_invalid', 400);
    if (result === 'locked') throw bad('verify_locked', 429);
    if (result !== 'ok') throw bad('bad_verify_code', 400);
    user = u;
  }
  if (user.banned_at) throw bad('forbidden', 403);
  // Şifre değişince eski oturumlar düşer (session_ver); e-postaya erişimi kanıtlandığı için adres de doğrulanmış olur.
  prep(
    'UPDATE users SET password_hash = ?, session_ver = session_ver + 1, email_verified = CASE WHEN email IS NULL THEN email_verified ELSE 1 END WHERE id = ?'
  ).run(auth.hashPassword(password), user.id);
  verification.clearReset(user.id);
  verification.markVerified(user.id);
  const fresh = prep('SELECT * FROM users WHERE id = ?').get(user.id);
  auth.setAuthCookie(ctx.req, ctx.res, fresh);
  return { user: selfView(fresh) };
});

// Giriş yapmış kullanıcı şifresini değiştirir (mevcut şifre şart); diğer cihazlardaki oturumlar kapanır.
router.post('/auth/change-password', { auth: true }, (ctx) => {
  const { user, body } = ctx;
  const current = typeof body.current === 'string' ? body.current : '';
  if (!auth.verifyPassword(current, user.password_hash)) throw bad('bad_credentials', 403);
  const password = checkNewPassword(body);
  prep('UPDATE users SET password_hash = ?, session_ver = session_ver + 1 WHERE id = ?').run(auth.hashPassword(password), user.id);
  const fresh = prep('SELECT * FROM users WHERE id = ?').get(user.id);
  auth.setAuthCookie(ctx.req, ctx.res, fresh);
  return { ok: true };
});

router.post('/auth/logout', (ctx) => {
  auth.clearAuthCookie(ctx.req, ctx.res);
  return { ok: true };
});

router.get('/me', (ctx) => ({ user: ctx.user ? selfView(ctx.user) : null }));

router.patch('/me', { auth: true }, ({ user, body }) => {
  const displayName = body.displayName !== undefined ? str(body.displayName, 30) : user.display_name;
  if (!displayName) throw bad('invalid_name');
  const bio = body.bio !== undefined ? str(body.bio, 200) : user.bio;
  prep('UPDATE users SET display_name = ?, bio = ? WHERE id = ?').run(displayName, bio, user.id);
  return { user: selfView(prep('SELECT * FROM users WHERE id = ?').get(user.id)) };
});

// ---------- Kullanıcılar ----------

router.get('/users/search', { auth: true }, ({ user, query }) => {
  const q = str(query.q, 30).replace(/^@/, '');
  if (q.length < 2) return { users: [] };
  const rows = prep(
    `SELECT * FROM users WHERE id != ? AND banned_at IS NULL AND (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\')
        AND id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
        AND id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)
      ORDER BY (username = ?) DESC, last_seen DESC LIMIT 8`
  ).all(user.id, like(q), like(q), user.id, user.id, q);
  return { users: rows.map((u) => ({ ...brief(u), relation: relationOf(user.id, u.id) })) };
});

router.get('/users/:username', ({ user, params }) => {
  const u = userRow(params.username);
  if (!u || (u.banned_at && !moderation.isAdmin(user))) throw bad('not_found', 404);
  if (user && prep('SELECT 1 AS x FROM blocks WHERE blocker_id = ? AND blocked_id = ?').get(u.id, user.id)) throw bad('not_found', 404); // beni engelleyenin profili görünmez
  const out = userView(u);
  if (user) {
    out.relation = relationOf(user.id, u.id);
    out.blocked = !!prep('SELECT 1 AS x FROM blocks WHERE blocker_id = ? AND blocked_id = ?').get(user.id, u.id);
  }
  return { user: out };
});

// ---------- Arkadaşlar ----------

router.get('/friends', { auth: true }, ({ user }) => {
  const rows = prep(
    `SELECT u.*, f.status AS f_status, f.requester_id AS f_requester, f.created_at AS f_at
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
      WHERE f.user_a = ? OR f.user_b = ?
      ORDER BY f.created_at DESC`
  ).all(user.id, user.id, user.id);
  const out = { friends: [], incoming: [], outgoing: [] };
  for (const r of rows) {
    const v = { ...brief(r), bio: r.bio || '', since: r.f_at };
    if (r.f_status === 'accepted') out.friends.push(v);
    else if (r.f_requester === user.id) out.outgoing.push(v);
    else out.incoming.push(v);
  }
  return out;
});

router.post('/friends', { auth: true }, (ctx) => {
  const { user, body } = ctx;
  requireVerified(user);
  const target = userRow(str(body.username, 20).replace(/^@/, ''));
  if (!target) throw bad('not_found', 404);
  if (target.id === user.id) throw bad('invalid_user');
  if (target.banned_at || moderation.blockedEitherWay(user.id, target.id)) throw bad('not_found', 404); // engelli/yasaklı: yok gibi davran
  const f = friendshipRow(user.id, target.id);
  if (f) {
    if (f.status === 'accepted') throw bad('already_friends', 409);
    if (f.requester_id === user.id) throw bad('request_pending', 409);
    // Karşı taraf zaten istek göndermişti: iki taraf da istiyor, direkt arkadaş olurlar.
    acceptFriendship(user, target);
    return { relation: 'friend' };
  }
  const pending = prep(
    "SELECT COUNT(*) AS c FROM friendships WHERE requester_id = ? AND status = 'pending'"
  ).get(user.id).c;
  if (pending >= C.MAX_PENDING_REQUESTS) throw bad('limit_reached', 429);
  const [x, y] = pair(user.id, target.id);
  prep("INSERT INTO friendships (user_a, user_b, requester_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)").run(
    x,
    y,
    user.id,
    now()
  );
  live.toUser(target.id, 'friend:request', { user: brief(user) });
  ctx.status = 201;
  return { relation: 'outgoing' };
});

router.post('/friends/:username/accept', { auth: true }, ({ user, params }) => {
  const target = userRow(params.username);
  if (!target || relationOf(user.id, target.id) !== 'incoming') throw bad('not_found', 404);
  acceptFriendship(user, target);
  return { relation: 'friend' };
});

router.post('/friends/:username/decline', { auth: true }, ({ user, params }) => {
  const target = userRow(params.username);
  if (!target || relationOf(user.id, target.id) !== 'incoming') throw bad('not_found', 404);
  const [x, y] = pair(user.id, target.id);
  prep('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(x, y);
  live.toUser(user.id, 'friend:removed', { userId: target.id });
  return { relation: 'none' };
});

// Arkadaşlıktan çıkar ya da gönderdiğin isteği geri çek.
router.delete('/friends/:username', { auth: true }, ({ user, params }) => {
  const target = userRow(params.username);
  const rel = target ? relationOf(user.id, target.id) : 'none';
  if (rel !== 'friend' && rel !== 'outgoing') throw bad('not_found', 404);
  const [x, y] = pair(user.id, target.id);
  prep('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(x, y);
  live.toUser(target.id, 'friend:removed', { userId: user.id });
  live.toUser(user.id, 'friend:removed', { userId: target.id });
  return { relation: 'none' };
});

// ---------- Gruplar ----------

// Bir oyunun açık grupları (oyun grupları: herkese açık ve geçici).
router.get('/groups', ({ user, query }) => {
  const where = ["r.kind = 'lfg'", "r.status = 'open'", `${ACTIVITY} > ?`];
  const params = [idleCutoff()];
  if (isGame(query.game)) {
    where.push('r.game_id = ?');
    params.push(query.game);
  }
  const q = str(query.q, 40);
  if (q) {
    where.push("(r.title LIKE ? ESCAPE '\\' OR r.description LIKE ? ESCAPE '\\')");
    params.push(like(q), like(q));
  }
  const rows = queryRooms(user ? user.id : 0, where.join(' AND '), params, 'ORDER BY activity DESC LIMIT 60');
  return { groups: rows.map((r) => ({ ...serializeRoom(r), members: previewMembers(r.id) })) };
});

router.post('/groups/join-by-code', { auth: true }, ({ user, body }) => {
  requireVerified(user);
  const code = str(body.code, 40).toLowerCase();
  const found = code ? prep('SELECT id FROM rooms WHERE invite_code = ?').get(code) : null;
  if (!found) throw bad('invalid_code', 404);
  joinRoom(user, getRoom(found.id, user.id), code);
  return { group: serializeRoom(getRoom(found.id, user.id)) };
});

router.post('/groups', { auth: true }, (ctx) => {
  const { user, body } = ctx;
  requireVerified(user);
  const isFriendGroup = body.kind === 'community';
  const kind = isFriendGroup ? 'community' : 'lfg';
  const title = str(body.title, 60);
  if (title.length < 3) throw bad('invalid_title');
  const description = str(body.description, 300);

  let gameId = null;
  if (!isFriendGroup) {
    if (!isGame(body.gameId)) throw bad('invalid_game');
    gameId = body.gameId;
  }

  const maxMembers = isFriendGroup
    ? clampInt(body.maxMembers, 2, C.FRIEND_GROUP_MAX, 20)
    : clampInt(body.maxMembers, 2, C.GAME_GROUP_MAX, 5);

  // Arkadaş grubunu kurarken eklenecek arkadaşlar: sadece kabul edilmiş arkadaşların eklenebilir.
  const invited = [];
  if (isFriendGroup && Array.isArray(body.members)) {
    for (const name of body.members.slice(0, C.FRIEND_GROUP_MAX)) {
      const u = userRow(str(name, 20));
      if (!u || u.id === user.id || invited.some((x) => x.id === u.id)) continue;
      if (!areFriends(user.id, u.id)) throw bad('not_friends', 403);
      invited.push(u);
    }
    if (invited.length + 1 > maxMembers) throw bad('group_full', 409);
  }

  // Kötüye kullanımı sınırla.
  const owned = isFriendGroup
    ? prep("SELECT COUNT(*) AS c FROM rooms WHERE owner_id = ? AND kind = 'community'").get(user.id).c
    : prep(
        `SELECT COUNT(*) AS c FROM rooms r WHERE r.owner_id = ? AND r.kind = 'lfg' AND r.status = 'open' AND ${ACTIVITY} > ?`
      ).get(user.id, idleCutoff()).c;
  if (owned >= (isFriendGroup ? C.OWNED_FRIEND_GROUPS : C.OWNED_GAME_GROUPS)) throw bad('limit_reached', 429);

  const t = now();
  const roomId = tx(() => {
    const info = prep(
      `INSERT INTO rooms (kind, game_id, title, description, owner_id, is_public, invite_code, max_members, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
    ).run(kind, gameId, title, description, user.id, isFriendGroup ? 0 : 1, newInviteCode(), maxMembers, t);
    const id = Number(info.lastInsertRowid);
    addMember(id, user.id, 'owner');
    for (const u of invited) addMember(id, u.id);
    return id;
  });
  for (const u of invited) live.toUser(u.id, 'room:added', { roomId, title, by: brief(user) });
  ctx.status = 201;
  return { group: serializeRoom(getRoom(roomId, user.id)) };
});

router.get('/groups/:id', ({ user, params, query }) => {
  const row = getRoom(Number(params.id), user ? user.id : 0);
  if (!row) throw bad('not_found', 404);
  if (!row.is_member) {
    const codeOk = query.code && String(query.code).toLowerCase() === row.invite_code;
    if (row.kind === 'dm' || (!row.is_public && !codeOk)) throw bad('not_found', 404);
  }
  return { group: serializeRoom(row), members: roomMembers(row.id) };
});

router.post('/groups/:id/join', { auth: true }, ({ user, params, body }) => {
  requireVerified(user);
  const id = Number(params.id);
  joinRoom(user, getRoom(id, user.id), body.code);
  return { group: serializeRoom(getRoom(id, user.id)) };
});

router.post('/groups/:id/leave', { auth: true }, ({ user, params }) => {
  const id = Number(params.id);
  const row = getRoom(id, user.id);
  if (!row) throw bad('not_found', 404);
  if (!row.is_member) throw bad('not_member', 400);
  if (row.kind === 'dm') throw bad('not_allowed', 400);

  let deleted = false;
  let newOwner = null;
  tx(() => {
    prep('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(id, user.id);
    if (row.owner_id === user.id) {
      const next = prep('SELECT user_id FROM room_members WHERE room_id = ? ORDER BY joined_at, user_id LIMIT 1').get(id);
      if (next) {
        newOwner = next.user_id;
        prep('UPDATE rooms SET owner_id = ? WHERE id = ?').run(newOwner, id);
        prep("UPDATE room_members SET role = 'owner' WHERE room_id = ? AND user_id = ?").run(id, newOwner);
      } else {
        prep('DELETE FROM rooms WHERE id = ?').run(id);
        deleted = true;
      }
    }
  });
  // Ayrılan kişinin diğer sekmeleri de listeyi güncellesin; kalanlara üye değişikliği gitsin.
  live.toUser(user.id, 'room:kicked', { roomId: id, self: true });
  if (!deleted) live.toUsers(memberIds(id), 'member:left', { roomId: id, userId: user.id, newOwnerId: newOwner });
  return { ok: true };
});

router.post('/groups/:id/kick', { auth: true }, ({ user, params, body }) => {
  const id = Number(params.id);
  const targetId = Number(body.userId);
  const row = getRoom(id, user.id);
  if (!row) throw bad('not_found', 404);
  if (row.kind === 'dm') throw bad('not_allowed', 400);
  if (row.owner_id !== user.id) throw bad('forbidden', 403);
  if (!targetId || targetId === user.id) throw bad('invalid_user');
  const res = prep('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(id, targetId);
  if (!res.changes) throw bad('not_member', 404);
  live.toUser(targetId, 'room:kicked', { roomId: id });
  live.toUsers(memberIds(id), 'member:left', { roomId: id, userId: targetId, kicked: true });
  return { ok: true };
});

// Arkadaş grubuna arkadaşını ekle (grubun herhangi bir üyesi kendi arkadaşlarını ekleyebilir).
router.post('/groups/:id/members', { auth: true }, ({ user, params, body }) => {
  requireVerified(user);
  const id = Number(params.id);
  const row = getRoom(id, user.id);
  if (!row || !row.is_member || row.kind !== 'community') throw bad('not_found', 404);
  const target = userRow(str(body.username, 20).replace(/^@/, ''));
  if (!target) throw bad('not_found', 404);
  if (!areFriends(user.id, target.id)) throw bad('not_friends', 403);
  if (prep('SELECT 1 AS x FROM room_members WHERE room_id = ? AND user_id = ?').get(id, target.id)) {
    throw bad('already_member', 409);
  }
  if (row.member_count >= row.max_members) throw bad('group_full', 409);
  addMember(id, target.id);
  live.toUsers(memberIds(id), 'member:joined', { roomId: id, user: brief(target) });
  live.toUser(target.id, 'room:added', { roomId: id, title: row.title, by: brief(user) });
  return { group: serializeRoom(getRoom(id, user.id)), members: roomMembers(id) };
});

router.patch('/groups/:id', { auth: true }, ({ user, params, body }) => {
  const id = Number(params.id);
  const row = getRoom(id, user.id);
  if (!row) throw bad('not_found', 404);
  if (row.kind === 'dm') throw bad('not_allowed', 400);
  if (row.owner_id !== user.id) throw bad('forbidden', 403);
  const title = body.title !== undefined ? str(body.title, 60) : row.title;
  if (title.length < 3) throw bad('invalid_title');
  const description = body.description !== undefined ? str(body.description, 300) : row.description;
  const status = row.kind === 'lfg' && (body.status === 'closed' || body.status === 'open') ? body.status : row.status;
  let maxMembers = row.max_members;
  if (body.maxMembers !== undefined) {
    const cap = row.kind === 'lfg' ? C.GAME_GROUP_MAX : C.FRIEND_GROUP_MAX;
    maxMembers = Math.max(row.member_count, clampInt(body.maxMembers, 2, cap, row.max_members));
  }
  prep('UPDATE rooms SET title = ?, description = ?, status = ?, max_members = ? WHERE id = ?').run(
    title,
    description,
    status,
    maxMembers,
    id
  );
  const updated = serializeRoom(getRoom(id, user.id));
  live.toUsers(memberIds(id), 'room:updated', { roomId: id, group: updated });
  return { group: updated };
});

router.delete('/groups/:id', { auth: true }, ({ user, params }) => {
  const id = Number(params.id);
  const row = getRoom(id, user.id);
  if (!row) throw bad('not_found', 404);
  if (row.kind === 'dm') throw bad('not_allowed', 400);
  if (row.owner_id !== user.id) throw bad('forbidden', 403);
  live.toUsers(memberIds(id), 'room:deleted', { roomId: id });
  prep('DELETE FROM rooms WHERE id = ?').run(id);
  return { ok: true };
});

// ---------- Sohbetler (benim tüm odalarım + okunmamış sayıları) ----------

router.get('/chats', { auth: true }, ({ user }) => {
  const rows = prep(
    `SELECT r.id, r.kind, r.game_id, r.title, r.max_members, r.owner_id, r.status, r.created_at,
            rm.last_read_id,
            (SELECT COUNT(*) FROM room_members x WHERE x.room_id = r.id) AS member_count,
            (SELECT COUNT(*) FROM messages m WHERE m.room_id = r.id AND m.id > rm.last_read_id AND m.user_id != rm.user_id
                AND m.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = rm.user_id)) AS unread,
            (SELECT MAX(m.id) FROM messages m WHERE m.room_id = r.id
                AND m.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = rm.user_id)) AS last_id
       FROM room_members rm JOIN rooms r ON r.id = rm.room_id
      WHERE rm.user_id = ?`
  ).all(user.id);

  const lastMsg = prep(
    `SELECT m.body, m.user_id, m.created_at, u.display_name
       FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`
  );
  const peerOf = prep(
    `SELECT u.id, u.username, u.display_name FROM room_members m JOIN users u ON u.id = m.user_id
      WHERE m.room_id = ? AND m.user_id != ?`
  );

  const chats = rows.map((r) => {
    const last = r.last_id ? lastMsg.get(r.last_id) : null;
    const out = {
      id: r.id,
      kind: r.kind,
      gameId: r.game_id,
      title: r.title,
      status: r.status,
      memberCount: r.member_count,
      maxMembers: r.max_members,
      isOwner: r.owner_id === user.id,
      unread: r.unread,
      activity: last ? last.created_at : r.created_at,
      last: last ? { body: last.body, mine: last.user_id === user.id, displayName: last.display_name, createdAt: last.created_at } : null,
    };
    if (r.kind === 'dm') {
      const peer = peerOf.get(r.id, user.id);
      out.peer = peer ? { id: peer.id, username: peer.username, displayName: peer.display_name, online: live.isOnline(peer.id) } : null;
    }
    return out;
  });
  chats.sort((a, b) => b.activity - a.activity);
  return { chats };
});

router.post('/groups/:id/read', { auth: true }, ({ user, params }) => {
  const id = Number(params.id);
  requireMember(id, user.id);
  prep(
    `UPDATE room_members SET last_read_id = (SELECT COALESCE(MAX(id), 0) FROM messages WHERE room_id = ?)
      WHERE room_id = ? AND user_id = ?`
  ).run(id, id, user.id);
  live.toUser(user.id, 'chat:read', { roomId: id });
  return { ok: true };
});

// ---------- Birebir mesajlaşma (sadece arkadaşlar) ----------

router.post('/dm/:username', { auth: true }, ({ user, params }) => {
  requireVerified(user);
  const target = userRow(params.username);
  if (!target) throw bad('not_found', 404);
  if (target.id === user.id) throw bad('invalid_user');
  if (!areFriends(user.id, target.id)) throw bad('not_friends', 403);
  const existing = prep(
    `SELECT r.id FROM rooms r
      WHERE r.kind = 'dm'
        AND EXISTS (SELECT 1 FROM room_members m WHERE m.room_id = r.id AND m.user_id = ?)
        AND EXISTS (SELECT 1 FROM room_members m WHERE m.room_id = r.id AND m.user_id = ?)
      LIMIT 1`
  ).get(user.id, target.id);
  if (existing) return { groupId: existing.id };
  const t = now();
  const id = tx(() => {
    const info = prep(
      `INSERT INTO rooms (kind, title, owner_id, is_public, invite_code, max_members, status, created_at)
       VALUES ('dm', '', ?, 0, ?, 2, 'open', ?)`
    ).run(user.id, newInviteCode(), t);
    const rid = Number(info.lastInsertRowid);
    addMember(rid, user.id, 'owner');
    addMember(rid, target.id);
    return rid;
  });
  live.toUser(target.id, 'room:added', { roomId: id, dm: true, by: brief(user) });
  return { groupId: id };
});

// ---------- Yazılı sohbet ----------

router.get('/groups/:id/messages', { auth: true }, ({ user, params, query }) => {
  const id = Number(params.id);
  requireMember(id, user.id);
  const before = Number(query.before) > 0 ? Number(query.before) : Number.MAX_SAFE_INTEGER;
  const limit = clampInt(query.limit, 1, 100, 50);
  const raw = prep(
    `SELECT m.id, m.room_id AS roomId, m.user_id AS userId, m.body, m.created_at AS createdAt,
            u.username, u.display_name AS displayName
       FROM messages m JOIN users u ON u.id = m.user_id
      WHERE m.room_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`
  )
    .all(id, before, limit)
    .map(plain)
    .reverse();
  // Engellediğim kişilerin mesajları bana gösterilmez ("daha fazla var mı" süzmeden önceki sayıya göre hesaplanır).
  const blocked = new Set(moderation.blockedIdsOf(user.id));
  const rows = blocked.size ? raw.filter((m) => !blocked.has(m.userId)) : raw;
  return { messages: rows, hasMore: raw.length === limit };
});

const chatBuckets = new Map(); // userId -> son mesaj zamanları
function chatRateOk(userId) {
  const t = now();
  const arr = (chatBuckets.get(userId) || []).filter((x) => t - x < 10_000);
  if (arr.length >= 10) {
    chatBuckets.set(userId, arr);
    return false;
  }
  arr.push(t);
  chatBuckets.set(userId, arr);
  return true;
}
setInterval(() => chatBuckets.clear(), 10 * 60_000).unref();

router.post('/groups/:id/messages', { auth: true }, (ctx) => {
  const { user, params, body } = ctx;
  requireVerified(user);
  const id = Number(params.id);
  requireMember(id, user.id);
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!text || text.length > 1000) throw bad('invalid_message');

  const room = prep('SELECT kind, status FROM rooms WHERE id = ?').get(id);
  if (!room) throw bad('not_found', 404);
  if (room.kind === 'dm') {
    // Arkadaşlıktan çıkılmışsa eski konuşma okunabilir ama yeni mesaj gönderilemez.
    const other = prep('SELECT user_id FROM room_members WHERE room_id = ? AND user_id != ?').get(id, user.id);
    if (!other || !areFriends(user.id, other.user_id)) throw bad('not_friends', 403);
  }
  if (!chatRateOk(user.id)) throw bad('rate_limited', 429);

  const t = now();
  const info = prep('INSERT INTO messages (room_id, user_id, body, created_at) VALUES (?, ?, ?, ?)').run(id, user.id, text, t);
  const msg = {
    id: Number(info.lastInsertRowid),
    roomId: id,
    userId: user.id,
    username: user.username,
    displayName: user.display_name,
    body: text,
    createdAt: t,
  };
  // Gönderenin kendi mesajı okunmuş sayılır.
  prep('UPDATE room_members SET last_read_id = ? WHERE room_id = ? AND user_id = ?').run(msg.id, id, user.id);
  live.toUsers(memberIds(id), 'chat:message', { ...msg, kind: room.kind });
  ctx.status = 201;
  return { message: msg };
});

router.post('/groups/:id/typing', { auth: true }, (ctx) => {
  const id = Number(ctx.params.id);
  requireMember(id, ctx.user.id);
  live.toUsers(
    memberIds(id),
    'chat:typing',
    { roomId: id, userId: ctx.user.id, displayName: ctx.user.display_name },
    ctx.clientId
  );
  return { ok: true };
});

// ---------- Canlı olaylar ----------

router.get('/events', { auth: true }, (ctx) => {
  live.connect(ctx.req, ctx.res, ctx.user);
  return HANDLED;
});

moderation.register(router, { str, userRow, brief, pair, memberIds, getRoom, requireVerified, like, clampInt });

module.exports = { router };
