'use strict';

// Moderasyon ve hesap yönetimi: engelleme, şikâyet, yönetici işlemleri, hesabı silme.
//
// Yönetici: ADMIN_USERNAMES ortam değişkenindeki kullanıcı adları (virgülle ayrılmış) ve e-postasını doğrulamış olmaları şart.

const { prep, tx } = require('./db');
const { bad } = require('./http');
const live = require('./live');
const auth = require('./auth');

const ADMINS = new Set(
  String(process.env.ADMIN_USERNAMES || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);
const REASONS = ['spam', 'harassment', 'hate', 'cheating', 'inappropriate', 'underage', 'other'];
const REPORTS_PER_HOUR = 10;
const REASON_LABEL = {
  spam: 'spam / reklam',
  harassment: 'taciz / tehdit',
  hate: 'nefret söylemi',
  cheating: 'dolandırıcılık / hile satışı',
  inappropriate: 'uygunsuz içerik',
  underage: 'yaş sınırı',
  other: 'kural ihlali',
};

const now = () => Date.now();

/** Yönetici mi? (doğrulanmamış e-postayla yönetici yetkisi kullanılamaz) */
const isAdmin = (u) => !!u && ADMINS.has(String(u.username).toLowerCase()) && !(u.email && !u.email_verified);

const blockedIdsOf = (userId) => prep('SELECT blocked_id AS id FROM blocks WHERE blocker_id = ?').all(userId).map((r) => r.id);

/** a ile b arasında (hangi yönde olursa olsun) engel var mı? */
const blockedEitherWay = (a, b) =>
  !!prep(
    'SELECT 1 AS x FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)'
  ).get(a, b, b, a);

function register(router, h) {
  const { str, userRow, brief, pair, memberIds, getRoom, requireVerified, like } = h;
  const adminOnly = { auth: true };

  const requireAdmin = (user) => {
    if (!isAdmin(user)) throw bad('forbidden', 403);
  };
  const logAdmin = (admin, action, target = '', detail = '') =>
    prep('INSERT INTO admin_log (admin_username, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)').run(
      admin.username,
      action,
      String(target).slice(0, 80),
      String(detail).slice(0, 300),
      now()
    );

  // ---------- Engelleme ----------

  router.get('/blocks', { auth: true }, ({ user }) => {
    const rows = prep(
      `SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC`
    ).all(user.id);
    return { users: rows.map(brief) };
  });

  // Engellenen kişiyle arkadaşlık (ve bekleyen istek) biter; birbirlerini arama sonuçlarında göremezler,
  // grup sohbetinde engelleyen kişi o kişinin mesajlarını görmez.
  router.post('/blocks', { auth: true }, ({ user, body }) => {
    const target = userRow(str(body.username, 20).replace(/^@/, ''));
    if (!target) throw bad('not_found', 404);
    if (target.id === user.id) throw bad('invalid_user');
    const [x, y] = pair(user.id, target.id);
    tx(() => {
      prep('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(user.id, target.id, now());
      prep('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(x, y);
    });
    live.toUser(user.id, 'friend:removed', { userId: target.id });
    live.toUser(target.id, 'friend:removed', { userId: user.id });
    return { ok: true, blocked: blockedIdsOf(user.id) };
  });

  router.delete('/blocks/:username', { auth: true }, ({ user, params }) => {
    const target = userRow(params.username);
    if (!target) throw bad('not_found', 404);
    prep('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(user.id, target.id);
    return { ok: true, blocked: blockedIdsOf(user.id) };
  });

  // ---------- Şikâyet ----------

  const reportBuckets = new Map(); // userId -> zamanlar
  setInterval(() => reportBuckets.clear(), 3600_000).unref();

  router.post('/reports', { auth: true }, (ctx) => {
    const { user, body } = ctx;
    requireVerified(user);
    const kind = body.kind;
    if (!['user', 'message', 'group'].includes(kind)) throw bad('invalid_report');
    const reason = REASONS.includes(body.reason) ? body.reason : null;
    if (!reason) throw bad('invalid_reason');
    const details = str(body.details, 500);

    const t = now();
    const arr = (reportBuckets.get(user.id) || []).filter((x) => t - x < 3600_000);
    if (arr.length >= REPORTS_PER_HOUR) throw bad('rate_limited', 429);

    let targetUser = null;
    let roomId = null;
    let messageId = null;
    let snapshot = {};

    if (kind === 'user') {
      targetUser = userRow(str(body.username, 20).replace(/^@/, ''));
      if (!targetUser) throw bad('not_found', 404);
      snapshot = { bio: targetUser.bio || '', displayName: targetUser.display_name };
    } else if (kind === 'message') {
      const msg = prep(
        `SELECT m.id, m.room_id, m.user_id, m.body, m.created_at, u.username FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`
      ).get(Number(body.messageId));
      if (!msg) throw bad('not_found', 404);
      const member = prep('SELECT 1 AS x FROM room_members WHERE room_id = ? AND user_id = ?').get(msg.room_id, user.id);
      if (!member) throw bad('not_member', 403);
      targetUser = prep('SELECT * FROM users WHERE id = ?').get(msg.user_id);
      roomId = msg.room_id;
      messageId = msg.id;
      // Moderatör bağlamı görsün diye öncesindeki birkaç mesaj da kanıt olarak saklanır.
      const before = prep(
        `SELECT u.username, m.body, m.created_at AS at FROM messages m JOIN users u ON u.id = m.user_id
          WHERE m.room_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT 4`
      )
        .all(msg.room_id, msg.id)
        .reverse();
      const room = prep('SELECT kind, title FROM rooms WHERE id = ?').get(msg.room_id);
      snapshot = { message: { username: msg.username, body: msg.body, at: msg.created_at }, context: before, room: room ? { kind: room.kind, title: room.title } : null };
    } else {
      const row = getRoom(Number(body.groupId), user.id);
      if (!row || row.kind === 'dm' || (!row.is_public && !row.is_member)) throw bad('not_found', 404);
      targetUser = prep('SELECT * FROM users WHERE id = ?').get(row.owner_id);
      roomId = row.id;
      snapshot = { title: row.title, description: row.description, gameId: row.game_id, kind: row.kind, memberCount: row.member_count };
    }
    if (targetUser && targetUser.id === user.id) throw bad('invalid_user');

    const dup = prep(
      `SELECT 1 AS x FROM reports WHERE reporter_id = ? AND kind = ? AND status = 'open'
          AND COALESCE(target_user_id, 0) = ? AND COALESCE(target_room_id, 0) = ? AND COALESCE(target_message_id, 0) = ?`
    ).get(user.id, kind, targetUser ? targetUser.id : 0, roomId || 0, messageId || 0);
    if (dup) throw bad('already_reported', 409);

    prep(
      `INSERT INTO reports (reporter_id, kind, target_user_id, target_username, target_room_id, target_message_id, reason, details, snapshot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(user.id, kind, targetUser ? targetUser.id : null, targetUser ? targetUser.username : '', roomId, messageId, reason, details, JSON.stringify(snapshot), t);
    arr.push(t);
    reportBuckets.set(user.id, arr);
    ctx.status = 201;
    return { ok: true };
  });

  // ---------- Yönetici paneli ----------

  const parseSnap = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return {};
    }
  };

  router.get('/admin/summary', adminOnly, ({ user }) => {
    requireAdmin(user);
    const c = (sql, ...p) => prep(sql).get(...p).c;
    return {
      users: c('SELECT COUNT(*) AS c FROM users'),
      banned: c('SELECT COUNT(*) AS c FROM users WHERE banned_at IS NOT NULL'),
      openReports: c("SELECT COUNT(*) AS c FROM reports WHERE status = 'open'"),
      groups: c("SELECT COUNT(*) AS c FROM rooms WHERE kind != 'dm'"),
      messages24h: c('SELECT COUNT(*) AS c FROM messages WHERE created_at > ?', now() - 86_400_000),
      newUsers24h: c('SELECT COUNT(*) AS c FROM users WHERE created_at > ?', now() - 86_400_000),
    };
  });

  router.get('/admin/reports', adminOnly, ({ user, query }) => {
    requireAdmin(user);
    const status = ['open', 'closed', 'all'].includes(query.status) ? query.status : 'open';
    const where = status === 'open' ? "r.status = 'open'" : status === 'closed' ? "r.status != 'open'" : '1 = 1';
    const rows = prep(
      `SELECT r.*, rep.username AS reporter_username, tu.banned_at AS target_banned,
              (SELECT COUNT(*) FROM reports x WHERE x.target_user_id IS NOT NULL AND x.target_user_id = r.target_user_id) AS target_report_count
         FROM reports r
         LEFT JOIN users rep ON rep.id = r.reporter_id
         LEFT JOIN users tu ON tu.id = r.target_user_id
        WHERE ${where} ORDER BY r.created_at DESC LIMIT 100`
    ).all();
    return {
      reports: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        reason: r.reason,
        details: r.details,
        status: r.status,
        note: r.note,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
        reporter: r.reporter_username || null,
        targetUsername: r.target_username || null,
        targetBanned: !!r.target_banned,
        targetReportCount: r.target_report_count,
        roomId: r.target_room_id,
        messageId: r.target_message_id,
        snapshot: parseSnap(r.snapshot),
      })),
    };
  });

  // Not: işlem (transaction) içinde çağrılır; kendi tx'ini açmaz.
  function banUser(admin, target, reason) {
    if (isAdmin(target) || target.id === admin.id) throw bad('forbidden', 403);
    prep('UPDATE users SET banned_at = ?, ban_reason = ?, session_ver = session_ver + 1 WHERE id = ?').run(now(), reason, target.id);
    // Yasaklının açtığı oyun grupları listeden kalkar.
    prep("UPDATE rooms SET status = 'closed' WHERE owner_id = ? AND kind = 'lfg'").run(target.id);
    live.kick(target.id);
    logAdmin(admin, 'ban', target.username, reason);
  }

  router.post('/admin/reports/:id/resolve', adminOnly, ({ user, params, body }) => {
    requireAdmin(user);
    const rep = prep('SELECT * FROM reports WHERE id = ?').get(Number(params.id));
    if (!rep) throw bad('not_found', 404);
    const action = body.action;
    if (!['dismiss', 'resolve', 'ban', 'delete_message', 'delete_group'].includes(action)) throw bad('invalid_action');
    const note = str(body.note, 300);
    const t = now();
    const close = (id, status) =>
      prep("UPDATE reports SET status = ?, note = ?, resolved_by = ?, resolved_at = ? WHERE id = ? AND status = 'open'").run(
        status,
        note,
        user.id,
        t,
        id
      );

    tx(() => {
      if (action === 'ban') {
        const target = rep.target_user_id ? prep('SELECT * FROM users WHERE id = ?').get(rep.target_user_id) : null;
        if (!target) throw bad('not_found', 404);
        banUser(user, target, note || REASON_LABEL[rep.reason] || 'kural ihlali');
        // Aynı kişi hakkındaki diğer açık şikâyetler de kapanır.
        for (const o of prep("SELECT id FROM reports WHERE target_user_id = ? AND status = 'open'").all(target.id)) close(o.id, 'resolved');
      } else if (action === 'delete_message') {
        if (!rep.target_message_id) throw bad('invalid_action');
        prep('DELETE FROM messages WHERE id = ?').run(rep.target_message_id);
        logAdmin(user, 'delete_message', rep.target_username, `mesaj #${rep.target_message_id}`);
        close(rep.id, 'resolved');
      } else if (action === 'delete_group') {
        if (!rep.target_room_id) throw bad('invalid_action');
        live.toUsers(memberIds(rep.target_room_id), 'room:deleted', { roomId: rep.target_room_id });
        prep('DELETE FROM rooms WHERE id = ?').run(rep.target_room_id);
        logAdmin(user, 'delete_group', rep.target_username, `grup #${rep.target_room_id}`);
        close(rep.id, 'resolved');
      } else {
        close(rep.id, action === 'dismiss' ? 'dismissed' : 'resolved');
        logAdmin(user, action, rep.target_username, `şikâyet #${rep.id}`);
      }
    });
    return { ok: true };
  });

  router.get('/admin/users', adminOnly, ({ user, query }) => {
    requireAdmin(user);
    const q = str(query.q, 40);
    const where = [];
    const params = [];
    if (q) {
      where.push("(u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')");
      params.push(like(q), like(q), like(q));
    }
    if (query.banned === '1') where.push('u.banned_at IS NOT NULL');
    const rows = prep(
      `SELECT u.id, u.username, u.display_name, u.email, u.email_verified, u.created_at, u.last_seen, u.banned_at, u.ban_reason,
              (SELECT COUNT(*) FROM reports r WHERE r.target_user_id = u.id) AS report_count
         FROM users u ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY u.created_at DESC LIMIT 50`
    ).all(...params);
    return {
      users: rows.map((u) => ({
        username: u.username,
        displayName: u.display_name,
        email: u.email,
        emailVerified: !!u.email_verified,
        createdAt: u.created_at,
        lastSeen: u.last_seen,
        banned: !!u.banned_at,
        banReason: u.ban_reason,
        reportCount: u.report_count,
        isAdmin: isAdmin(u),
      })),
    };
  });

  router.post('/admin/users/:username/ban', adminOnly, ({ user, params, body }) => {
    requireAdmin(user);
    const target = userRow(params.username);
    if (!target) throw bad('not_found', 404);
    tx(() => banUser(user, target, str(body.reason, 200) || 'kural ihlali'));
    return { ok: true };
  });

  router.post('/admin/users/:username/unban', adminOnly, ({ user, params }) => {
    requireAdmin(user);
    const target = userRow(params.username);
    if (!target) throw bad('not_found', 404);
    prep("UPDATE users SET banned_at = NULL, ban_reason = '' WHERE id = ?").run(target.id);
    logAdmin(user, 'unban', target.username);
    return { ok: true };
  });

  router.get('/admin/log', adminOnly, ({ user }) => {
    requireAdmin(user);
    return {
      log: prep('SELECT admin_username AS admin, action, target, detail, created_at AS createdAt FROM admin_log ORDER BY id DESC LIMIT 100').all(),
    };
  });

  // ---------- Hesabı silme (KVKK: silme hakkı) ----------

  // Kullanıcının ayrıldığı odalar: sahibiyse sahiplik sıradaki üyeye geçer, kimse kalmazsa oda silinir; birebir mesajlaşmalar silinir.
  function detachFromRooms(userId) {
    const rooms = prep(
      'SELECT r.id, r.kind, r.owner_id FROM room_members m JOIN rooms r ON r.id = m.room_id WHERE m.user_id = ?'
    ).all(userId);
    for (const r of rooms) {
      if (r.kind === 'dm') {
        live.toUsers(memberIds(r.id), 'room:deleted', { roomId: r.id });
        prep('DELETE FROM rooms WHERE id = ?').run(r.id);
        continue;
      }
      prep('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(r.id, userId);
      let newOwner = null;
      let deleted = false;
      if (r.owner_id === userId) {
        const next = prep('SELECT user_id FROM room_members WHERE room_id = ? ORDER BY joined_at, user_id LIMIT 1').get(r.id);
        if (next) {
          newOwner = next.user_id;
          prep('UPDATE rooms SET owner_id = ? WHERE id = ?').run(newOwner, r.id);
          prep("UPDATE room_members SET role = 'owner' WHERE room_id = ? AND user_id = ?").run(r.id, newOwner);
        } else {
          prep('DELETE FROM rooms WHERE id = ?').run(r.id);
          deleted = true;
        }
      }
      if (!deleted) live.toUsers(memberIds(r.id), 'member:left', { roomId: r.id, userId, newOwnerId: newOwner });
    }
    // Sahibi bu kullanıcı olup üyesi olmayan oda kalmamalı (cascade ile silinmesin diye): hepsi yukarıda devredildi.
  }

  router.post('/me/delete', { auth: true }, (ctx) => {
    const { user, body } = ctx;
    const password = typeof body.password === 'string' ? body.password : '';
    if (!auth.verifyPassword(password, user.password_hash)) throw bad('bad_credentials', 403);
    if (isAdmin(user)) throw bad('forbidden', 403); // yönetici hesabı önce ADMIN_USERNAMES'ten çıkarılmalı
    live.kick(user.id);
    tx(() => {
      detachFromRooms(user.id);
      prep('DELETE FROM users WHERE id = ?').run(user.id);
    });
    auth.clearAuthCookie(ctx.req, ctx.res);
    return { ok: true };
  });
}

module.exports = { register, isAdmin, blockedIdsOf, blockedEitherWay };
