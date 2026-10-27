import { h, icon, clear, avatar, avatarWithDot, toast, errText, confirmDialog, debounce } from '../ui.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { t } from '../i18n.js';
import { emptyState, openAuth, openGroupForm, relationActions, startDm } from '../components.js';
import { refreshChats, refreshRequests } from '../chats.js';

// Arkadaşlar: kullanıcı adıyla ara ve ekle, gelen istekleri yanıtla, arkadaşlarınla mesajlaş, arkadaş grubu kur.
export default async function friends(el, ctx) {
  if (!state.user) {
    el.append(emptyState(t('friends.login.title'), t('friends.login.text'), h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openAuth('login') }, t('nav.login'))));
    return;
  }

  // ---------- Arkadaş ekle (arama) ----------

  const results = h('div', { class: 'search-results', 'aria-live': 'polite' });
  const search = h('input', {
    class: 'input input-lg', type: 'search', placeholder: t('friends.search.ph'), 'aria-label': t('friends.search.ph'), autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false',
  });
  let searchId = 0;

  async function runSearch() {
    const q = search.value.trim().replace(/^@/, '');
    const mine = ++searchId;
    clear(results);
    if (q.length < 2) return;
    try {
      const { users } = await api.get('/users/search?q=' + encodeURIComponent(q));
      if (mine !== searchId) return;
      if (!users.length) {
        results.append(h('p', { class: 'muted pad' }, t('friends.search.none')));
        return;
      }
      for (const u of users) results.append(personRow(u, u.relation, { onChange: runSearch, afterChange: true }));
    } catch (err) {
      toast(errText(err), 'error');
    }
  }
  search.addEventListener('input', debounce(runSearch, 250));

  // ---------- Listeler ----------

  const listsBox = h('div', { class: 'friend-lists' });

  function personRow(u, relation, { onChange, afterChange = false, showStatus = false } = {}) {
    const redraw = (next) => {
      if (afterChange) onChange();
      else loadLists();
      return next;
    };
    return h(
      'div',
      { class: 'person-row' },
      showStatus ? avatarWithDot(u, 44) : avatar(u, 44),
      h(
        'a',
        { class: 'person-main', href: `#/u/${encodeURIComponent(u.username)}` },
        h('span', { class: 'person-name' }, u.displayName),
        h('span', { class: 'person-sub' }, showStatus ? `@${u.username} · ${u.online ? t('common.online') : t('common.offline')}` : '@' + u.username)
      ),
      h('div', { class: 'person-actions' }, ...relationActions(u, relation, redraw, { compact: true }))
    );
  }

  function section(title, count, rows, extra) {
    return h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', null, title, count !== undefined && h('span', { class: 'count' }, count)), extra), rows);
  }

  async function loadLists() {
    let data;
    try {
      data = await api.get('/friends');
    } catch (err) {
      toast(errText(err), 'error');
      return;
    }
    state.requests = data.incoming.length;
    clear(listsBox);

    if (data.incoming.length) {
      listsBox.append(
        section(t('friends.requests'), data.incoming.length, h('div', { class: 'person-list' }, data.incoming.map((u) => personRow(u, 'incoming'))))
      );
    }
    if (data.outgoing.length) {
      listsBox.append(
        section(t('friends.sentRequests'), data.outgoing.length, h('div', { class: 'person-list' }, data.outgoing.map((u) => personRow(u, 'outgoing'))))
      );
    }

    const sorted = [...data.friends].sort((a, b) => Number(b.online) - Number(a.online) || a.displayName.localeCompare(b.displayName));
    const newGroup = h('button', { class: 'btn btn-soft btn-sm', type: 'button', onClick: () => openGroupForm('community') }, icon('users', 16), t('friends.newGroup'));
    listsBox.append(
      section(
        t('friends.title'),
        data.friends.length,
        sorted.length
          ? h(
              'div',
              { class: 'person-list' },
              sorted.map((u) =>
                h(
                  'div',
                  { class: 'person-row' },
                  avatarWithDot(u, 44),
                  h(
                    'a',
                    { class: 'person-main', href: `#/u/${encodeURIComponent(u.username)}` },
                    h('span', { class: 'person-name' }, u.displayName),
                    h('span', { class: 'person-sub' }, `@${u.username} · ${u.online ? t('common.online') : t('common.offline')}`)
                  ),
                  h(
                    'div',
                    { class: 'person-actions' },
                    h('button', { class: 'btn btn-primary btn-sm', type: 'button', onClick: () => startDm(u.username) }, icon('chat', 16), t('friends.message')),
                    h(
                      'button',
                      {
                        class: 'btn-icon btn-icon-danger', type: 'button', title: t('friends.remove'), 'aria-label': t('friends.remove'),
                        onClick: async () => {
                          if (!(await confirmDialog(t('confirm.unfriend', { name: u.displayName }), { confirmLabel: t('friends.remove'), danger: true }))) return;
                          try {
                            await api.del(`/friends/${encodeURIComponent(u.username)}`);
                            loadLists();
                          } catch (err) {
                            toast(errText(err), 'error');
                          }
                        },
                      },
                      icon('x', 16)
                    )
                  )
                )
              )
            )
          : h('div', { class: 'empty-inline' }, h('p', null, t('friends.empty'))),
        data.friends.length ? newGroup : null
      )
    );
    refreshRequests();
    refreshChats();
  }

  const onFriends = debounce(() => {
    loadLists();
    if (search.value.trim().length >= 2) runSearch();
  }, 150);
  window.addEventListener('kadro:friends', onFriends);
  ctx.onCleanup(() => window.removeEventListener('kadro:friends', onFriends));

  el.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', { class: 'page-title' }, t('friends.title')), h('p', { class: 'page-sub' }, t('friends.sub')))),
    h('section', { class: 'card add-card' }, h('h2', null, icon('user-plus', 18), t('friends.add.title')), h('p', { class: 'help' }, t('friends.add.help', { me: state.user.username })), search, results),
    listsBox
  );
  await loadLists();
}
