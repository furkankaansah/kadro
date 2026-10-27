import { h, put, avatar, icon, toast, errText, copyText, openDialog, clear } from '../ui.js';
import { api } from '../api.js';
import { state, emit } from '../state.js';
import { t } from '../i18n.js';
import { emptyState, field, openAuth, openVerify, passwordBox } from '../components.js';
import { unblockUser } from '../moderation.js';
import * as rt from '../realtime.js';

const maskEmail = (e) => {
  const [name, host] = String(e || '').split('@');
  if (!host) return '';
  return name.slice(0, 1) + '•••@' + host;
};

/** Hesabı kalıcı olarak silme (KVKK: silme hakkı). Şifre istenir. */
function openDeleteAccount() {
  openDialog(t('delete.title'), (close) => {
    const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const pw = h('input', { class: 'input', type: 'password', required: true, maxlength: 100, autocomplete: 'current-password' });
    const submit = h('button', { class: 'btn btn-danger', type: 'submit' }, t('delete.do'));
    setTimeout(() => pw.focus(), 30);
    return h(
      'form',
      {
        class: 'form',
        onSubmit: async (e) => {
          e.preventDefault();
          error.hidden = true;
          submit.disabled = true;
          try {
            await api.post('/me/delete', { password: pw.value });
            close();
            rt.disconnect();
            state.user = null;
            state.chats = [];
            state.requests = 0;
            emit('kadro:auth');
            toast(t('delete.done'), 'info');
            location.hash = '#/';
          } catch (err) {
            error.textContent = err && err.code === 'bad_credentials' ? t('profile.pass.wrong') : errText(err);
            error.hidden = false;
          } finally {
            submit.disabled = false;
          }
        },
      },
      h('p', { class: 'confirm-text' }, t('delete.text')),
      field(t('delete.password'), passwordBox(pw)),
      error,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onClick: close }, t('common.cancel')), submit)
    );
  });
}

// Profilim: görünen ad ve kısa tanıtım. Kullanıcı adın arkadaşların seni ararken kullandığı şey.
export default async function profile(el) {
  if (!state.user) {
    el.append(emptyState(t('profile.login.title'), t('profile.login.text'), h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openAuth('login') }, t('nav.login'))));
    return;
  }
  const u = state.user;
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const name = h('input', { class: 'input', maxlength: 30, required: true, value: u.displayName });
  const bio = h('textarea', { class: 'textarea', maxlength: 200, rows: 3, placeholder: t('profile.bio.ph') });
  bio.value = u.bio || '';
  const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, t('common.save'));

  const form = h(
    'form',
    {
      class: 'form',
      onSubmit: async (e) => {
        e.preventDefault();
        error.hidden = true;
        submit.disabled = true;
        try {
          const res = await api.patch('/me', { displayName: name.value.trim(), bio: bio.value.trim() });
          state.user = res.user;
          emit('kadro:auth-soft'); // üst çubuktaki adı yenile
          toast(t('profile.saved'), 'success');
        } catch (err) {
          error.textContent = errText(err);
          error.hidden = false;
        } finally {
          submit.disabled = false;
        }
      },
    },
    field(t('profile.name'), name),
    field(t('profile.bio'), bio),
    error,
    h('div', { class: 'modal-actions' }, submit)
  );

  // Şifre değiştirme
  const pwError = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const cur = h('input', { class: 'input', type: 'password', required: true, maxlength: 100, autocomplete: 'current-password' });
  const np = h('input', { class: 'input', type: 'password', required: true, maxlength: 100, autocomplete: 'new-password' });
  const np2 = h('input', { class: 'input', type: 'password', required: true, maxlength: 100, autocomplete: 'new-password' });
  const pwSubmit = h('button', { class: 'btn btn-soft', type: 'submit' }, t('profile.pass.submit'));
  const pwForm = h(
    'form',
    {
      class: 'form',
      onSubmit: async (e) => {
        e.preventDefault();
        pwError.hidden = true;
        if (np.value !== np2.value) {
          pwError.textContent = t('err.password_mismatch');
          pwError.hidden = false;
          return;
        }
        pwSubmit.disabled = true;
        try {
          await api.post('/auth/change-password', { current: cur.value, password: np.value, passwordConfirm: np2.value });
          cur.value = np.value = np2.value = '';
          toast(t('profile.pass.saved'), 'success');
        } catch (err) {
          pwError.textContent = err && err.code === 'bad_credentials' ? t('profile.pass.wrong') : errText(err);
          pwError.hidden = false;
        } finally {
          pwSubmit.disabled = false;
        }
      },
    },
    field(t('profile.pass.current'), passwordBox(cur)),
    field(t('reset.newpass'), passwordBox(np), t('auth.password.help')),
    field(t('auth.password2'), passwordBox(np2)),
    pwError,
    h('div', { class: 'modal-actions' }, pwSubmit)
  );

  // Engellediklerim (liste boşsa kart hiç görünmez)
  const blockedList = h('ul', { class: 'member-list' });
  const blockedCard = h('section', { class: 'card profile-card', hidden: true }, h('h2', { class: 'card-title' }, t('block.list.title')), h('p', { class: 'help' }, t('block.list.help')), blockedList);
  function drawBlocked(users) {
    clear(blockedList);
    blockedCard.hidden = !users.length;
    for (const b of users) {
      blockedList.append(
        h(
          'li',
          { class: 'member-row' },
          avatar(b, 32),
          h('span', { class: 'member-name' }, b.displayName, h('em', null, ` @${b.username}`)),
          h(
            'button',
            {
              class: 'btn btn-soft btn-sm',
              type: 'button',
              onClick: async () => {
                if (await unblockUser(b)) drawBlocked(users.filter((x) => x.id !== b.id));
              },
            },
            t('block.undo')
          )
        )
      );
    }
  }
  api.get('/blocks').then((r) => drawBlocked(r.users), () => {});

  put(
    el,
    h('div', { class: 'page-head' }, h('div', null, h('h1', { class: 'page-title' }, t('profile.title')))),
    h(
      'section',
      { class: 'card profile-card' },
      h(
        'div',
        { class: 'profile-top' },
        avatar(u, 72),
        h(
          'div',
          null,
          h('p', { class: 'profile-handle' }, '@' + u.username),
          h('button', { class: 'link-btn', type: 'button', onClick: () => copyText(u.username) }, icon('copy', 14), ' ', t('profile.copyUsername')),
          h('p', { class: 'help' }, t('profile.handle.help'))
        )
      ),
      u.email &&
        h(
          'div',
          { class: 'email-row' },
          h('span', { class: 'field-label' }, t('profile.email')),
          h('span', { class: 'email-addr' }, maskEmail(u.email)),
          u.emailVerified === false
            ? [
                h('span', { class: 'mail-pill mail-pill-warn' }, t('profile.email.unverified')),
                h('button', { class: 'btn btn-soft btn-sm', type: 'button', onClick: () => openVerify({ onDone: () => emit('kadro:reload') }) }, t('verify.banner.btn')),
              ]
            : h('span', { class: 'mail-pill mail-pill-ok' }, icon('check', 12), t('profile.email.verified'))
        ),
      form
    ),
    h('section', { class: 'card profile-card' }, h('h2', { class: 'card-title' }, t('profile.pass.title')), pwForm),
    blockedCard,
    u.isAdmin &&
      h(
        'section',
        { class: 'card profile-card' },
        h('h2', { class: 'card-title' }, t('admin.title')),
        h('p', { class: 'help' }, t('admin.entry.help')),
        h('a', { class: 'btn btn-soft', href: '#/admin' }, icon('shield', 16), t('admin.open'))
      ),
    h(
      'section',
      { class: 'card profile-card danger-card' },
      h('h2', { class: 'card-title' }, t('delete.title')),
      h('p', { class: 'help' }, t('delete.help')),
      h('button', { class: 'btn btn-ghost btn-danger-text', type: 'button', onClick: openDeleteAccount }, icon('trash', 16), t('delete.do'))
    ),
    h(
      'div',
      { class: 'profile-foot' },
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => emit('kadro:logout') }, icon('logout', 16), t('nav.logout')),
      h('a', { class: 'link-btn', href: '#/legal/privacy' }, t('legal.privacy.short')),
      h('a', { class: 'link-btn', href: '#/legal/terms' }, t('legal.terms.short'))
    )
  );
}
