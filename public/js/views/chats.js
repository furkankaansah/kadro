import { h, icon, clear, avatar, avatarWithDot, toast, errText, confirmDialog, copyText, fmtClock, fmtShort, fmtDay, openDialog } from '../ui.js';
import { api, qs } from '../api.js';
import { state, gameOf } from '../state.js';
import { t } from '../i18n.js';
import * as rt from '../realtime.js';
import { openReport, isBlocked } from '../moderation.js';
import { markRead, refreshChats } from '../chats.js';
import {
  chatAvatar, chatTitle, emptyState, gameBadge, goTo, joinGroup, openAuth, openEditForm, openGroupForm,
  openJoinByCode, relationActions,
} from '../components.js';

// Sohbetler: solda benim sohbetlerim (oyun grupları, arkadaş grupları, birebir), sağda açık sohbet.
// Aynı ekran #/chats (liste) ve #/chat/:id (liste + sohbet) için kullanılır.
export default async function chats(el, ctx) {
  const openId = ctx.params.id ? Number(ctx.params.id) : 0;
  const me = state.user;

  const layout = h('div', { class: 'chats-layout' + (me ? '' : ' no-list'), 'data-open': openId ? '1' : '0' });
  const pane = h('section', { class: 'chat-pane' });
  el.append(layout);

  // ---------- Sol: sohbet listesi ----------

  if (me) {
    const listBox = h('div', { class: 'chat-items', role: 'list' });
    const search = h('input', {
      class: 'input', type: 'search', placeholder: t('chats.search'), 'aria-label': t('chats.search'), autocomplete: 'off',
    });

    const previewText = (c) => {
      if (!c.last) return c.kind === 'lfg' ? gameOf(c.gameId).name : c.kind === 'dm' ? t('chats.dm.empty') : t('chats.group.empty');
      const who = c.last.mine ? t('chats.you') : c.kind === 'dm' ? '' : c.last.displayName;
      return who ? `${who}: ${c.last.body}` : c.last.body;
    };

    function drawList() {
      const q = search.value.trim().toLowerCase();
      const scroll = listBox.scrollTop;
      clear(listBox);
      const rows = state.chats.filter((c) => !q || chatTitle(c).toLowerCase().includes(q));
      if (!rows.length) {
        listBox.append(
          h(
            'div',
            { class: 'chat-list-empty' },
            h('p', null, state.chats.length ? t('chats.noMatch') : t('chats.empty')),
            !state.chats.length && h('a', { class: 'btn btn-soft btn-sm', href: '#/' }, icon('gamepad', 16), t('chats.findGame'))
          )
        );
        return;
      }
      for (const c of rows) {
        listBox.append(
          h(
            'a',
            { class: 'chat-item' + (c.id === openId ? ' active' : ''), href: `#/chat/${c.id}`, role: 'listitem' },
            c.kind === 'dm' ? avatarWithDot(c.peer, 46) : chatAvatar(c, 46),
            h(
              'span',
              { class: 'chat-item-main' },
              h('span', { class: 'chat-item-top' }, h('span', { class: 'chat-item-title' }, chatTitle(c)), h('time', null, fmtShort(c.activity))),
              h(
                'span',
                { class: 'chat-item-bottom' },
                h('span', { class: 'chat-item-preview' + (c.unread ? ' strong' : '') }, previewText(c)),
                c.unread > 0 && h('span', { class: 'badge' }, c.unread > 99 ? '99+' : c.unread)
              )
            )
          )
        );
      }
      listBox.scrollTop = scroll;
    }
    search.addEventListener('input', drawList);

    const onChats = () => drawList();
    window.addEventListener('kadro:chats', onChats);
    ctx.onCleanup(() => window.removeEventListener('kadro:chats', onChats));

    layout.append(
      h(
        'aside',
        { class: 'chat-list-pane' },
        h(
          'div',
          { class: 'chat-list-head' },
          h('h1', null, t('chats.title')),
          h(
            'div',
            { class: 'chat-list-actions' },
            h('button', { class: 'btn-icon', type: 'button', title: t('code.title'), 'aria-label': t('code.title'), onClick: openJoinByCode }, icon('key', 18)),
            h('button', { class: 'btn-icon btn-icon-primary', type: 'button', title: t('chats.newGroup'), 'aria-label': t('chats.newGroup'), onClick: () => openGroupForm('community') }, icon('plus', 18))
          )
        ),
        h('div', { class: 'chat-list-search' }, search),
        listBox
      )
    );
    drawList();
    if (!state.chatsLoaded) refreshChats();
  }

  layout.append(pane);

  if (!openId) {
    pane.append(
      me
        ? h('div', { class: 'chat-placeholder' }, icon('chat', 40), h('h2', null, t('chats.pick.title')), h('p', null, t('chats.pick.text')))
        : emptyState(t('chats.login.title'), t('chats.login.text'), h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openAuth('login') }, t('nav.login')))
    );
    if (!me) layout.classList.add('no-list');
    return;
  }

  await openChat(pane, openId, ctx);
}

// ---------- Sağ: açık sohbet ----------

async function openChat(pane, id, ctx) {
  const me = state.user;
  let data;
  try {
    data = await api.get(`/groups/${id}` + qs({ code: ctx.query.code }));
  } catch (err) {
    if (err.status === 404) {
      pane.append(emptyState(t('common.notFound.title'), t('common.notFound.text'), h('a', { class: 'btn btn-primary', href: me ? '#/chats' : '#/' }, t('common.back'))));
      return;
    }
    throw err;
  }

  let group = data.group;
  let members = data.members;
  const isDm = group.kind === 'dm';
  const peer = () => (isDm ? members.find((m) => !me || m.id !== me.id) : null);
  const title = () => (isDm ? (peer() ? peer().displayName : '…') : group.title);
  const amOwner = () => !!me && group.owner.id === me.id;
  document.title = `${title()} · Kadro`;

  let messages = [];
  let hasMore = false;
  const typing = new Map(); // userId -> { name, timer }

  const head = h('header', { class: 'chat-head' });
  const body = h('div', { class: 'chat-body' });
  const list = h('div', { class: 'chat-scroll', role: 'log', 'aria-live': 'polite', 'aria-label': t('chat.messages') });
  const typingLine = h('p', { class: 'typing', 'aria-live': 'polite' });

  // ---------- Başlık ----------

  function subtitle() {
    if (isDm) {
      const p = peer();
      return p && p.online ? t('common.online') : t('common.offline');
    }
    if (group.kind === 'lfg') {
      return [gameOf(group.gameId).name, t('group.members', { a: group.memberCount, b: group.maxMembers }), group.status === 'closed' && t('chat.closed')].filter(Boolean).join(' · ');
    }
    return t('group.members', { a: group.memberCount, b: group.maxMembers }) + ' · ' + t('chat.private');
  }

  function drawHead() {
    clear(head);
    const p = peer();
    const lead = isDm ? avatarWithDot(p ? { ...p } : null, 42) : chatAvatar({ kind: group.kind, gameId: group.gameId }, 42);
    const actions = h('div', { class: 'chat-head-actions' });
    if (!group.isMember) {
      if (group.status === 'open' && !group.full) actions.append(h('button', { class: 'btn btn-primary btn-sm', type: 'button', onClick: () => joinGroup(group, ctx.query.code) }, t('group.join')));
      else actions.append(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: true }, group.full ? t('group.full') : t('chat.closed')));
    } else if (isDm) {
      if (p) actions.append(h('a', { class: 'btn-icon', href: `#/u/${encodeURIComponent(p.username)}`, title: t('chat.profile'), 'aria-label': t('chat.profile') }, icon('user', 18)));
    } else {
      actions.append(h('button', { class: 'btn-icon', type: 'button', title: t('chat.info'), 'aria-label': t('chat.info'), onClick: openInfo }, icon('info', 18)));
    }
    head.append(
      h('a', { class: 'btn-icon chat-back', href: me ? '#/chats' : '#/', 'aria-label': t('common.back') }, icon('arrow-left', 20)),
      lead,
      h('div', { class: 'chat-head-main' }, h('h2', { class: 'chat-title' }, title()), h('p', { class: 'chat-sub' }, subtitle())),
      actions
    );
  }

  // ---------- Mesajlar ----------

  function bubble(m, grouped, showName) {
    const own = !!me && m.userId === me.id;
    return h(
      'div',
      { class: 'msg' + (own ? ' own' : '') + (grouped ? ' grouped' : '') },
      !own && !isDm && (grouped ? h('span', { class: 'msg-gap' }) : avatar(m, 32)),
      h(
        'div',
        { class: 'msg-main' },
        showName && h('a', { class: 'msg-name', href: `#/u/${encodeURIComponent(m.username)}` }, m.displayName),
        h('div', { class: 'bubble' }, h('span', { class: 'bubble-text' }, m.body), h('time', { datetime: new Date(m.createdAt).toISOString() }, fmtClock(m.createdAt)))
      ),
      !own &&
        me &&
        m.id &&
        h(
          'button',
          {
            class: 'msg-flag',
            type: 'button',
            title: t('report.message'),
            'aria-label': t('report.message'),
            onClick: () => openReport({ kind: 'message', messageId: m.id }),
          },
          icon('flag', 14)
        )
    );
  }

  function drawMessages(forceBottom = false) {
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 100;
    clear(list);
    if (hasMore) list.append(h('button', { class: 'link-btn older', type: 'button', onClick: loadOlder }, t('chat.loadOlder')));
    if (!messages.length) list.append(h('p', { class: 'chat-empty' }, isDm ? t('chat.empty.dm') : t('chat.empty')));

    let prev = null;
    for (const m of messages) {
      if (!m.system && isBlocked(m.userId)) continue; // engellediğim kişinin mesajları görünmez
      if (m.system) {
        list.append(h('p', { class: 'sys-line' }, m.text));
        prev = null;
        continue;
      }
      if (!prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString()) {
        list.append(h('p', { class: 'day-sep' }, h('span', null, fmtDay(m.createdAt))));
        prev = null;
      }
      const own = !!me && m.userId === me.id;
      const grouped = !!prev && prev.userId === m.userId && m.createdAt - prev.createdAt < 180_000;
      list.append(bubble(m, grouped, !grouped && !own && !isDm));
      prev = m;
    }
    if (forceBottom || nearBottom) list.scrollTop = list.scrollHeight;
  }

  function addMessage(msg, force = false) {
    if (msg.id && messages.some((m) => m.id === msg.id)) return;
    messages.push(msg);
    if (messages.length > 400) messages.splice(0, messages.length - 400);
    drawMessages(force);
  }
  const sysLine = (text) => addMessage({ system: true, text, createdAt: Date.now() });

  async function loadMessages() {
    if (!group.isMember) return;
    try {
      const res = await api.get(`/groups/${id}/messages`);
      const known = new Set(messages.filter((m) => m.id).map((m) => m.id));
      const fresh = res.messages.filter((m) => !known.has(m.id));
      messages = [...messages.filter((m) => m.id), ...fresh].sort((a, b) => a.id - b.id);
      if (!known.size) hasMore = res.hasMore;
      drawMessages(true);
    } catch {
      /* ağ yoksa sessizce geç */
    }
  }

  async function loadOlder() {
    const first = messages.find((m) => m.id);
    if (!first) return;
    try {
      const res = await api.get(`/groups/${id}/messages` + qs({ before: first.id }));
      hasMore = res.hasMore;
      messages = [...res.messages, ...messages];
      const keep = list.scrollHeight - list.scrollTop;
      drawMessages();
      list.scrollTop = list.scrollHeight - keep;
    } catch (err) {
      toast(errText(err), 'error');
    }
  }

  // ---------- Yazma alanı ----------

  const input = h('textarea', { class: 'composer-input', rows: 1, maxlength: 1000, placeholder: t('chat.ph'), 'aria-label': t('chat.ph') });
  let lastTyping = 0;

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    autosize();
    try {
      const res = await api.post(`/groups/${id}/messages`, { body: text });
      addMessage(res.message, true);
    } catch (err) {
      input.value = text;
      autosize();
      toast(errText(err), 'error');
    }
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  input.addEventListener('input', () => {
    autosize();
    if (Date.now() - lastTyping > 2500 && input.value.trim()) {
      lastTyping = Date.now();
      api.post(`/groups/${id}/typing`, {}).catch(() => {});
    }
  });
  const composer = h(
    'form',
    { class: 'composer', onSubmit: (e) => (e.preventDefault(), send()) },
    input,
    h('button', { class: 'send-btn', type: 'submit', 'aria-label': t('chat.send'), title: t('chat.send') }, icon('send', 18))
  );

  function drawTyping() {
    const names = [...typing.values()].map((x) => x.name);
    typingLine.textContent = names.length ? t('chat.typing', { name: names.join(', ') }) : '';
  }

  // ---------- Üye değilsen: önizleme ----------

  function previewCard() {
    const joinable = group.status === 'open' && !group.full;
    return h(
      'div',
      { class: 'preview-card' },
      group.kind === 'lfg' ? gameBadge(group.gameId, 64) : chatAvatar({ kind: group.kind }, 64),
      h('h3', null, group.title),
      group.description && h('p', { class: 'preview-desc' }, group.description),
      h('p', { class: 'muted' }, t('group.members', { a: group.memberCount, b: group.maxMembers }) + ' · ' + t('group.by', { name: group.owner.displayName })),
      h('div', { class: 'avatar-stack large' }, members.slice(0, 8).map((m) => avatar(m, 36))),
      joinable
        ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => joinGroup(group, ctx.query.code) }, me ? t('group.join') : t('chat.loginToJoin'))
        : h('p', { class: 'notice' }, group.full ? t('group.full') : t('chat.closed'))
    );
  }

  // ---------- Grup bilgisi penceresi ----------

  async function openInfo() {
    // Üyelerle ilişkini öğren: arkadaş ekle / mesaj düğmeleri buna göre görünür.
    const rel = new Map();
    let myFriends = [];
    try {
      const f = await api.get('/friends');
      myFriends = f.friends;
      f.friends.forEach((u) => rel.set(u.username, 'friend'));
      f.incoming.forEach((u) => rel.set(u.username, 'incoming'));
      f.outgoing.forEach((u) => rel.set(u.username, 'outgoing'));
    } catch {
      /* düğmeler "ekle" olarak görünür */
    }

    openDialog(group.title, (close) => {
      const membersBox = h('ul', { class: 'member-list' });
      const addBox = h('div', { class: 'info-section' });

      function drawMembers() {
        clear(membersBox);
        for (const m of members) {
          const mine = me && m.id === me.id;
          membersBox.append(
            h(
              'li',
              { class: 'member-row' },
              avatarWithDot(m, 36),
              h(
                'a',
                { class: 'member-name', href: `#/u/${encodeURIComponent(m.username)}`, onClick: close },
                m.displayName,
                m.role === 'owner' && h('span', { class: 'owner-badge', title: t('chat.owner') }, icon('crown', 14)),
                mine && h('em', null, ` (${t('chats.you')})`)
              ),
              h(
                'span',
                { class: 'member-actions' },
                ...(mine
                  ? []
                  : relationActions(m, rel.get(m.username) || 'none', (next) => {
                      rel.set(m.username, next);
                      drawMembers();
                      drawAdd();
                    }, { compact: true })),
                amOwner() && !mine &&
                  h(
                    'button',
                    {
                      class: 'btn-icon btn-icon-danger', type: 'button', title: t('chat.kick'), 'aria-label': t('chat.kick'),
                      onClick: async () => {
                        if (!(await confirmDialog(t('confirm.kick', { name: m.displayName }), { confirmLabel: t('chat.kick'), danger: true }))) return;
                        try {
                          await api.post(`/groups/${id}/kick`, { userId: m.id });
                          members = members.filter((x) => x.id !== m.id);
                          group.memberCount = members.length;
                          drawMembers();
                          drawHead();
                        } catch (err) {
                          toast(errText(err), 'error');
                        }
                      },
                    },
                    icon('x', 16)
                  )
              )
            )
          );
        }
      }

      // Arkadaş grubunda: arkadaşlarından birini gruba ekle.
      function drawAdd() {
        clear(addBox);
        if (group.kind !== 'community') return;
        const free = myFriends.filter((f) => !members.some((m) => m.id === f.id));
        addBox.append(h('h3', null, t('chat.addFriend')));
        if (!free.length) {
          addBox.append(h('p', { class: 'muted' }, myFriends.length ? t('chat.addFriend.all') : t('chat.addFriend.none')));
          return;
        }
        const sel = h('select', { class: 'select', 'aria-label': t('chat.addFriend') }, free.map((f) => h('option', { value: f.username }, `${f.displayName} (@${f.username})`)));
        const btn = h(
          'button',
          {
            class: 'btn btn-primary btn-sm', type: 'button',
            onClick: async () => {
              btn.disabled = true;
              try {
                const res = await api.post(`/groups/${id}/members`, { username: sel.value });
                members = res.members;
                group = { ...group, ...res.group };
                drawMembers();
                drawAdd();
                drawHead();
              } catch (err) {
                toast(errText(err), 'error');
              } finally {
                btn.disabled = false;
              }
            },
          },
          icon('user-plus', 16),
          t('chat.add')
        );
        addBox.append(h('div', { class: 'inline-form' }, sel, btn));
      }

      const link = `${location.origin}/#/chat/${id}?code=${group.inviteCode}`;
      const inviteBox =
        group.kind === 'community' && group.inviteCode
          ? h(
              'div',
              { class: 'info-section' },
              h('h3', null, t('chat.invite')),
              h('p', { class: 'help' }, t('chat.invite.help')),
              h('code', { class: 'invite-code' }, group.inviteCode),
              h(
                'div',
                { class: 'btn-row' },
                h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => copyText(link) }, icon('link', 16), t('chat.copyLink')),
                h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => copyText(group.inviteCode) }, icon('copy', 16), t('chat.copyCode'))
              )
            )
          : null;

      const ownerActions = amOwner()
        ? [
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => (close(), openEditForm(group, applyGroup)) }, icon('edit', 16), t('chat.edit')),
            group.kind === 'lfg' &&
              h(
                'button',
                {
                  class: 'btn btn-ghost btn-sm', type: 'button',
                  onClick: async () => {
                    try {
                      applyGroup((await api.patch(`/groups/${id}`, { status: group.status === 'open' ? 'closed' : 'open' })).group);
                      close();
                    } catch (err) {
                      toast(errText(err), 'error');
                    }
                  },
                },
                group.status === 'open' ? t('chat.close') : t('chat.reopen')
              ),
            h('button', { class: 'btn btn-ghost btn-sm btn-danger-text', type: 'button', onClick: () => (close(), removeRoom()) }, icon('trash', 16), t('chat.delete')),
          ]
        : [];

      drawMembers();
      drawAdd();
      return h(
        'div',
        { class: 'info' },
        group.kind === 'lfg' && h('p', { class: 'info-game' }, gameBadge(group.gameId, 28), gameOf(group.gameId).name),
        group.description && h('p', { class: 'info-desc' }, group.description),
        group.kind === 'community' && h('p', { class: 'help' }, icon('lock', 14), ' ', t('chat.private.help')),
        h('div', { class: 'info-section' }, h('h3', null, t('chat.members'), h('span', { class: 'count' }, `${members.length}/${group.maxMembers}`)), membersBox),
        addBox,
        inviteBox,
        h(
          'div',
          { class: 'info-actions' },
          ...ownerActions,
          !amOwner() && me && h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => (close(), openReport({ kind: 'group', groupId: id })) }, icon('flag', 16), t('report.group')),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => (close(), leave()) }, icon('logout', 16), t('chat.leave'))
        )
      );
    });
  }

  async function leave() {
    if (!(await confirmDialog(t('confirm.leave'), { confirmLabel: t('chat.leave') }))) return;
    try {
      await api.post(`/groups/${id}/leave`, {});
      toast(t('toast.left'), 'info');
      await refreshChats();
      goTo('#/chats');
    } catch (err) {
      toast(errText(err), 'error');
    }
  }

  async function removeRoom() {
    if (!(await confirmDialog(t('confirm.delete'), { confirmLabel: t('chat.delete'), danger: true }))) return;
    try {
      await api.del(`/groups/${id}`);
      toast(t('toast.deleted'), 'info');
      await refreshChats();
      goTo('#/chats');
    } catch (err) {
      toast(errText(err), 'error');
    }
  }

  function applyGroup(g) {
    group = { ...group, ...g, isMember: group.isMember, inviteCode: group.inviteCode };
    document.title = `${title()} · Kadro`;
    drawHead();
  }

  // ---------- Yerleşim ----------

  drawHead();
  if (group.isMember) {
    drawMessages(true);
    body.append(list, typingLine, composer);
  } else {
    body.append(h('div', { class: 'chat-scroll centered' }, previewCard()));
  }
  pane.append(head, body);

  // ---------- Canlı olaylar ----------

  const offs = [
    rt.on('chat:message', (d) => {
      if (d.roomId !== id || isBlocked(d.userId)) return;
      const tm = typing.get(d.userId);
      if (tm) {
        clearTimeout(tm.timer);
        typing.delete(d.userId);
        drawTyping();
      }
      addMessage(d);
    }),
    rt.on('chat:typing', (d) => {
      if (d.roomId !== id) return;
      const old = typing.get(d.userId);
      if (old) clearTimeout(old.timer);
      typing.set(d.userId, {
        name: d.displayName,
        timer: setTimeout(() => {
          typing.delete(d.userId);
          drawTyping();
        }, 3500),
      });
      drawTyping();
    }),
    rt.on('member:joined', (d) => {
      if (d.roomId !== id || members.some((m) => m.id === d.user.id)) return;
      members.push({ ...d.user, role: 'member' });
      group.memberCount = members.length;
      drawHead();
      if (group.isMember && !isDm) sysLine(t('chat.joinedNote', { name: d.user.displayName }));
    }),
    rt.on('member:left', (d) => {
      if (d.roomId !== id) return;
      const gone = members.find((m) => m.id === d.userId);
      members = members.filter((m) => m.id !== d.userId);
      group.memberCount = members.length;
      if (d.newOwnerId) {
        members.forEach((m) => (m.role = m.id === d.newOwnerId ? 'owner' : 'member'));
        const o = members.find((m) => m.id === d.newOwnerId);
        if (o) group.owner = { id: o.id, username: o.username, displayName: o.displayName };
      }
      drawHead();
      if (gone && group.isMember && !(me && d.userId === me.id)) sysLine(t('chat.leftNote', { name: gone.displayName }));
    }),
    rt.on('room:updated', (d) => {
      if (d.roomId === id) applyGroup(d.group);
    }),
    rt.on('room:deleted', (d) => {
      if (d.roomId !== id) return;
      toast(t('toast.deleted'), 'info');
      location.hash = '#/chats';
    }),
    rt.on('room:kicked', (d) => {
      if (d.roomId !== id) return;
      if (!d.self) toast(t('toast.kicked'), 'error');
      location.hash = '#/chats';
    }),
    rt.on('presence', (d) => {
      const m = members.find((x) => x.id === d.userId);
      if (!m) return;
      m.online = d.online;
      if (isDm) drawHead();
    }),
  ];
  const onOpen = () => loadMessages();
  window.addEventListener('kadro:rt-open', onOpen);

  ctx.onCleanup(() => {
    offs.forEach((off) => off());
    window.removeEventListener('kadro:rt-open', onOpen);
    typing.forEach((x) => clearTimeout(x.timer));
  });

  if (group.isMember) {
    await loadMessages();
    markRead(id);
    if (matchMedia('(pointer: fine)').matches) input.focus();
  }
}
