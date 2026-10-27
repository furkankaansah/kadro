// Sohbet listesi, okunmamış sayıları ve arkadaşlık bildirimleri: tüm sayfalarda geçerli olan canlı durum.
// Sayfalar `kadro:chats` ve `kadro:friends` olaylarını dinleyip kendilerini yeniler.

import { api } from './api.js';
import { state, emit } from './state.js';
import { t } from './i18n.js';
import { toast } from './ui.js';
import * as rt from './realtime.js';

/** Şu an ekranda açık olan sohbetin id'si (yoksa 0). */
export function activeChatId() {
  const m = /^#\/chat\/(\d+)/.exec(location.hash);
  return m ? Number(m[1]) : 0;
}

export async function refreshChats() {
  if (!state.user) {
    state.chats = [];
    state.chatsLoaded = true;
    emit('kadro:chats');
    return;
  }
  try {
    const { chats } = await api.get('/chats');
    state.chats = chats;
    state.chatsLoaded = true;
    emit('kadro:chats');
  } catch {
    /* ağ yoksa eski liste kalsın */
  }
}

export async function refreshRequests() {
  if (!state.user) {
    state.requests = 0;
    emit('kadro:chats');
    return;
  }
  try {
    const d = await api.get('/friends');
    state.requests = d.incoming.length;
    emit('kadro:chats');
  } catch {
    /* yoksay */
  }
}

/** Bir sohbeti okundu say (yerelde hemen, sunucuda arkadan). */
export function markRead(roomId) {
  const c = state.chats.find((x) => x.id === roomId);
  if (c && c.unread) {
    c.unread = 0;
    emit('kadro:chats');
  }
  api.post(`/groups/${roomId}/read`, {}).catch(() => {});
}

const preview = (text) => (text.length > 80 ? text.slice(0, 80) + '…' : text);

function onMessage(d) {
  const me = state.user;
  if (!me) return;
  if ((me.blocked || []).includes(d.userId)) return; // engellediğim kişi: bildirim ve okunmamış sayısı yok
  const mine = d.userId === me.id;
  const chat = state.chats.find((c) => c.id === d.roomId);
  if (!chat) {
    // Listede olmayan bir odadan mesaj geldi (yeni eklendik, vb.): listeyi baştan çek.
    refreshChats();
    return;
  }
  chat.last = { body: d.body, mine, displayName: d.displayName, createdAt: d.createdAt };
  chat.activity = d.createdAt;
  const viewing = activeChatId() === d.roomId && !document.hidden;
  if (!mine) {
    if (viewing) markRead(d.roomId);
    else {
      chat.unread = (chat.unread || 0) + 1;
      if (chat.kind !== 'lfg') {
        const who = chat.kind === 'dm' ? d.displayName : `${d.displayName} · ${chat.title}`;
        toast(`${who}: ${preview(d.body)}`, 'info', { href: `#/chat/${d.roomId}`, hrefLabel: t('common.open') });
      }
    }
  }
  state.chats.sort((a, b) => b.activity - a.activity);
  emit('kadro:chats');
}

export function startChatEvents() {
  rt.on('chat:message', onMessage);

  rt.on('chat:read', (d) => {
    const c = state.chats.find((x) => x.id === d.roomId);
    if (c && c.unread) {
      c.unread = 0;
      emit('kadro:chats');
    }
  });

  rt.on('room:added', (d) => {
    refreshChats();
    if (!d.dm && d.title) {
      toast(t('toast.addedToGroup', { name: d.by.displayName, title: d.title }), 'info', { href: `#/chat/${d.roomId}`, hrefLabel: t('common.open') });
    }
  });

  const drop = (d) => {
    const before = state.chats.length;
    state.chats = state.chats.filter((c) => c.id !== d.roomId);
    if (state.chats.length !== before) emit('kadro:chats');
  };
  rt.on('room:deleted', drop);
  rt.on('room:kicked', drop);

  rt.on('room:updated', (d) => {
    const c = state.chats.find((x) => x.id === d.roomId);
    if (!c) return;
    c.title = d.group.title;
    c.maxMembers = d.group.maxMembers;
    c.status = d.group.status;
    emit('kadro:chats');
  });

  const members = (d, delta) => {
    const c = state.chats.find((x) => x.id === d.roomId);
    if (!c) return;
    c.memberCount = Math.max(1, c.memberCount + delta);
    emit('kadro:chats');
  };
  rt.on('member:joined', (d) => members(d, 1));
  rt.on('member:left', (d) => members(d, -1));

  // Arkadaşlık
  rt.on('friend:request', (d) => {
    state.requests += 1;
    emit('kadro:chats');
    emit('kadro:friends');
    toast(t('toast.friendRequest', { name: d.user.displayName }), 'info', { href: '#/friends', hrefLabel: t('common.open') });
  });
  rt.on('friend:accepted', (d) => {
    refreshRequests();
    emit('kadro:friends');
    if (d.incoming) toast(t('toast.friendAccepted', { name: d.user.displayName }), 'success', { href: '#/friends', hrefLabel: t('common.open') });
  });
  rt.on('friend:removed', () => {
    refreshRequests();
    emit('kadro:friends');
  });
  rt.on('presence', (d) => {
    for (const c of state.chats) if (c.peer && c.peer.id === d.userId) c.peer.online = d.online;
    emit('kadro:chats');
    emit('kadro:friends', { presence: d });
  });

  // Sekmeye dönünce açık sohbeti okundu say.
  document.addEventListener('visibilitychange', () => {
    const id = activeChatId();
    if (!document.hidden && id) markRead(id);
  });
}
