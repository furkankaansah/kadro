import { h, toast, errText, openDialog, confirmDialog } from './ui.js';
import { api } from './api.js';
import { state, emit } from './state.js';
import { t } from './i18n.js';
import { field } from './components.js';
import { refreshChats, refreshRequests } from './chats.js';

// Şikâyet ve engelleme: kullanıcı sayfası, sohbet ve profilde ortak kullanılır.

export const REASONS = ['spam', 'harassment', 'hate', 'cheating', 'inappropriate', 'underage', 'other'];

export const isBlocked = (userId) => !!state.user && (state.user.blocked || []).includes(userId);

/**
 * Şikâyet penceresi.
 * target: { kind: 'user', username } | { kind: 'message', messageId } | { kind: 'group', groupId }
 */
export function openReport(target) {
  const titles = { user: 'report.title.user', message: 'report.title.message', group: 'report.title.group' };
  return openDialog(t(titles[target.kind] || 'report.title.user'), (close) => {
    const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const details = h('textarea', { class: 'textarea', maxlength: 500, rows: 3, placeholder: t('report.details.ph') });
    const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, t('report.send'));
    const name = 'reason-' + Math.random().toString(36).slice(2, 7);
    const radios = REASONS.map((r, i) =>
      h(
        'label',
        { class: 'choice' },
        h('input', { type: 'radio', name, value: r, checked: i === 0 }),
        h('span', null, t('report.reason.' + r))
      )
    );
    return h(
      'form',
      {
        class: 'form',
        onSubmit: async (e) => {
          e.preventDefault();
          error.hidden = true;
          submit.disabled = true;
          try {
            const reason = radios.map((l) => l.firstChild).find((i) => i.checked).value;
            await api.post('/reports', { ...target, reason, details: details.value.trim() });
            close();
            toast(t('report.sent'), 'success');
          } catch (err) {
            error.textContent = errText(err);
            error.hidden = false;
          } finally {
            submit.disabled = false;
          }
        },
      },
      h('p', { class: 'help' }, t('report.help')),
      h('div', { class: 'choices', role: 'radiogroup', 'aria-label': t('report.reason') }, ...radios),
      field(t('report.details'), details),
      error,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onClick: close }, t('common.cancel')), submit)
    );
  });
}

/** Kişiyi engeller (onay sonrası). Arkadaşlık biter, sohbet listesi yenilenir. */
export async function blockUser(user) {
  if (!(await confirmDialog(t('block.confirm', { name: user.displayName || '@' + user.username }), { confirmLabel: t('block.do'), danger: true }))) return false;
  try {
    const res = await api.post('/blocks', { username: user.username });
    state.user.blocked = res.blocked;
    toast(t('block.done', { name: user.displayName || '@' + user.username }), 'info');
    refreshChats();
    refreshRequests();
    emit('kadro:friends');
    return true;
  } catch (err) {
    toast(errText(err), 'error');
    return false;
  }
}

export async function unblockUser(user) {
  try {
    const res = await api.del(`/blocks/${encodeURIComponent(user.username)}`);
    state.user.blocked = res.blocked;
    toast(t('block.undone', { name: user.displayName || '@' + user.username }), 'info');
    refreshChats();
    return true;
  } catch (err) {
    toast(errText(err), 'error');
    return false;
  }
}
