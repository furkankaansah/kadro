import { h, put, avatar, icon, clear, fmtDate } from '../ui.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { t } from '../i18n.js';
import { emptyState, relationActions } from '../components.js';
import { openReport, blockUser, unblockUser } from '../moderation.js';

// Başka bir oyuncunun sayfası: kısa tanıtım ve arkadaşlık düğmeleri.
export default async function user(el, ctx) {
  let data;
  try {
    data = await api.get(`/users/${encodeURIComponent(ctx.params.username)}`);
  } catch (err) {
    if (err.status === 404) {
      el.append(emptyState(t('common.notFound.title'), t('common.notFound.text'), h('a', { class: 'btn btn-primary', href: '#/' }, t('common.home'))));
      return;
    }
    throw err;
  }
  const u = data.user;
  document.title = `${u.displayName} · Kadro`;
  let relation = u.relation || 'none';
  let blocked = !!u.blocked;
  const actions = h('div', { class: 'profile-actions' });

  function draw() {
    clear(actions);
    if (relation === 'self') {
      actions.append(h('a', { class: 'btn btn-ghost', href: '#/profile' }, icon('edit', 16), t('profile.edit')));
      return;
    }
    if (blocked) {
      actions.append(
        h('span', { class: 'mail-pill mail-pill-warn' }, icon('ban', 12), t('block.blocked')),
        h(
          'button',
          {
            class: 'btn btn-soft btn-sm',
            type: 'button',
            onClick: async () => {
              if (await unblockUser(u)) {
                blocked = false;
                relation = 'none';
                draw();
              }
            },
          },
          t('block.undo')
        )
      );
    } else {
      actions.append(
        ...relationActions(u, relation, (next) => {
          relation = next;
          draw();
        })
      );
    }
    // Giriş yapmış kişi başkasını şikâyet edebilir / engelleyebilir.
    if (state.user) {
      put(
        actions,
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openReport({ kind: 'user', username: u.username }) }, icon('flag', 14), t('report.user')),
        !blocked &&
          h(
            'button',
            {
              class: 'btn btn-ghost btn-sm btn-danger-text',
              type: 'button',
              onClick: async () => {
                if (await blockUser(u)) {
                  blocked = true;
                  relation = 'none';
                  draw();
                }
              },
            },
            icon('ban', 14),
            t('block.do')
          )
      );
    }
  }
  draw();

  el.append(
    h('a', { class: 'back-link', href: state.user ? '#/friends' : '#/' }, icon('arrow-left', 16), t('common.back')),
    h(
      'section',
      { class: 'card profile-card' },
      h(
        'div',
        { class: 'profile-top' },
        h('span', { class: 'avatar-wrap' }, avatar(u, 84), u.online && h('i', { class: 'online-dot big' })),
        h(
          'div',
          null,
          h('h1', { class: 'page-title' }, u.displayName),
          h('p', { class: 'profile-handle' }, '@' + u.username),
          h('p', { class: 'help' }, `${u.online ? t('common.online') : t('common.offline')} · ${t('user.joined', { date: fmtDate(u.createdAt) })}`)
        )
      ),
      u.bio ? h('p', { class: 'profile-bio' }, u.bio) : h('p', { class: 'profile-bio muted' }, t('user.noBio')),
      actions
    )
  );
}
