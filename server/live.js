'use strict';

// Gerçek zamanlı katman: Server-Sent Events (SSE) ile sunucudan istemciye anlık olaylar.
// İstemci -> sunucu yönü normal POST istekleriyle gider. Her SSE bağlantısının bir clientId'si vardır.
//
// Olaylar kullanıcı bazında gönderilir: bir odadaki mesaj, o odanın üyesi olan herkesin açık sekmelerine gider;
// hangi sohbetin ekranda olduğuna istemci karar verir. Böylece abonelik yönetimi gerekmez.
//
// Durum (bellekte, sunucu yeniden başlarsa sıfırlanır):
//   clients : clientId -> { id, userId, res }
//   online  : userId   -> Set<clientId>

const crypto = require('node:crypto');
const { prep } = require('./db');

const clients = new Map();
const online = new Map();

const MAX_CLIENTS_PER_USER = 6;

function send(client, event, data) {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    /* bağlantı kopmuş; close olayı temizliği yapacak */
  }
}

function toUser(userId, event, data, exceptClientId) {
  const set = online.get(userId);
  if (!set) return;
  for (const id of set) {
    const c = clients.get(id);
    if (c && c.id !== exceptClientId) send(c, event, data);
  }
}

function toUsers(userIds, event, data, exceptClientId) {
  for (const id of new Set(userIds)) toUser(id, event, data, exceptClientId);
}

const isOnline = (userId) => !!online.get(userId)?.size;
const onlineCount = () => online.size;

function friendIds(userId) {
  return prep(
    `SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS id
       FROM friendships WHERE status = 'accepted' AND (user_a = ? OR user_b = ?)`
  )
    .all(userId, userId, userId)
    .map((r) => r.id);
}

function announcePresence(userId, isOn) {
  toUsers(friendIds(userId), 'presence', { userId, online: isOn });
}

// ---------- Bağlantı yaşam döngüsü ----------

function connect(req, res, user) {
  const id = crypto.randomBytes(12).toString('hex');
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  res.write('retry: 3000\n\n');

  const client = { id, userId: user.id, res };

  // Aynı kullanıcının çok fazla sekmesi varsa en eskisini kapat.
  const existing = online.get(user.id);
  if (existing && existing.size >= MAX_CLIENTS_PER_USER) {
    const oc = clients.get(existing.values().next().value);
    if (oc) {
      disconnect(oc);
      try {
        oc.res.end();
      } catch {
        /* yoksay */
      }
    }
  }

  const wasOnline = isOnline(user.id);
  clients.set(id, client);
  if (!online.has(user.id)) online.set(user.id, new Set());
  online.get(user.id).add(id);
  if (!wasOnline) announcePresence(user.id, true);

  send(client, 'hello', { clientId: id });

  const heartbeat = setInterval(() => {
    try {
      res.write(': hb\n\n');
    } catch {
      /* yoksay */
    }
  }, 20_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    disconnect(client);
  };
  req.on('close', cleanup);
  res.on('error', cleanup);
}

function disconnect(client) {
  if (!clients.has(client.id)) return;
  clients.delete(client.id);
  const set = online.get(client.userId);
  if (set) {
    set.delete(client.id);
    if (!set.size) {
      online.delete(client.userId);
      announcePresence(client.userId, false);
    }
  }
}

/** Kullanıcının tüm canlı bağlantılarını kapatır (yasaklama, hesap silme). */
function kick(userId) {
  const set = online.get(userId);
  if (!set) return;
  for (const id of [...set]) {
    const c = clients.get(id);
    if (!c) continue;
    disconnect(c);
    try {
      c.res.end();
    } catch {
      /* yoksay */
    }
  }
}

module.exports = { connect, toUser, toUsers, isOnline, onlineCount, kick };
