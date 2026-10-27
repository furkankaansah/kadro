// Ortak arayüz parçaları: oyun rozeti, grup kartı, arkadaşlık düğmeleri, formlar, giriş penceresi.

import { h, icon, avatar, avatarStack, toast, errText, openDialog, confirmDialog, copyText } from './ui.js';
import { t, getLang } from './i18n.js';
import { state, gameOf, emit } from './state.js';
import { api } from './api.js';
import * as rt from './realtime.js';
import { refreshChats, refreshRequests } from './chats.js';

// ---------- Form parçaları ----------

export function select({ value = '', options, onChange, label, name, id }) {
  return h(
    'select',
    { class: 'select', value, name, id, 'aria-label': label, onChange: onChange && ((e) => onChange(e.target.value)) },
    options.map(([v, text]) => h('option', { value: v }, text))
  );
}

export function field(label, control, help) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, help && h('span', { class: 'help' }, help));
}

/** Şifre kutusu + yanında göster/gizle (göz) düğmesi. */
export function passwordBox(input) {
  const btn = h('button', { class: 'pw-toggle', type: 'button' });
  const draw = (shown) => {
    input.type = shown ? 'text' : 'password';
    const label = shown ? t('auth.password.hide') : t('auth.password.show');
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(shown));
    btn.title = label;
    btn.replaceChildren(icon(shown ? 'eye-off' : 'eye', 18));
  };
  btn.addEventListener('click', () => {
    draw(input.type === 'password');
    input.focus();
  });
  draw(false);
  return h('div', { class: 'pw-box' }, input, btn);
}

// ---------- Küçük parçalar ----------

/** Yazı rengi arka plana göre siyah ya da beyaz (açık renkli oyunlarda okunurluk için). */
function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#14172b' : '#fff';
}

/** Oyunun renkli kısa kod kutusu. */
export function gameBadge(gameId, size = 44) {
  const g = gameOf(gameId);
  return h(
    'span',
    { class: 'game-badge', style: { '--size': size + 'px', '--game': g.color, '--ink': inkFor(g.color) }, 'aria-hidden': 'true' },
    g.short
  );
}

/** Sohbet listesinde ve başlıkta kullanılan simge: oyun grubu → oyun rozeti, arkadaş grubu → grup simgesi, dm → avatar. */
export function chatAvatar(chat, size = 44) {
  if (chat.kind === 'lfg') return gameBadge(chat.gameId, size);
  if (chat.kind === 'community') {
    return h('span', { class: 'group-badge', style: { '--size': size + 'px' }, 'aria-hidden': 'true' }, icon('users', Math.round(size * 0.46)));
  }
  return avatar(chat.peer || { displayName: '?' }, size);
}

export function emptyState(title, text, action) {
  return h('div', { class: 'empty' }, h('h3', null, title), text && h('p', null, text), action);
}

export const chatTitle = (c) => (c.kind === 'dm' ? (c.peer ? c.peer.displayName : '…') : c.title);

// ---------- Gezinme ----------

/** Aynı adrese gidiliyorsa hashchange tetiklenmez; o durumda sayfayı yeniden çiz. */
export function goTo(hash) {
  if (location.hash === hash) emit('kadro:reload');
  else location.hash = hash;
}

// ---------- Giriş gereksinimi ----------

export function requireLogin(fn) {
  if (state.user) return fn();
  toast(t('auth.required'), 'info');
  openAuth('login', fn);
}

/** Yasaklı hesap girişinde gösterilecek metin (varsa nedenini de ekler). */
export function bannedText(err) {
  const reason = err && err.data && err.data.reason;
  return t('err.banned') + (reason ? ' ' + t('err.banned.reason', { reason }) : '');
}

export function openAuth(mode = 'login', onDone) {
  const isLogin = mode === 'login';
  openDialog(isLogin ? t('auth.login') : t('auth.register'), (close) => {
    const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const username = h('input', {
      class: 'input', name: 'username', autocomplete: 'username', required: true, maxlength: 20, autocapitalize: 'none', spellcheck: 'false',
    });
    const password = h('input', {
      class: 'input', name: 'password', type: 'password', required: true, maxlength: 100,
      autocomplete: isLogin ? 'current-password' : 'new-password',
    });
    const password2 = h('input', {
      class: 'input', name: 'passwordConfirm', type: 'password', required: true, maxlength: 100, autocomplete: 'new-password',
    });
    const display = h('input', { class: 'input', name: 'displayName', maxlength: 30, autocomplete: 'nickname' });
    const email = h('input', {
      class: 'input', name: 'email', type: 'email', inputmode: 'email', autocomplete: 'email', required: true, maxlength: 120, autocapitalize: 'none', spellcheck: 'false',
    });
    const terms = h('input', { type: 'checkbox', name: 'acceptTerms', required: true });
    const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, isLogin ? t('auth.login') : t('auth.register'));

    const form = h(
      'form',
      {
        class: 'form',
        onSubmit: async (e) => {
          e.preventDefault();
          error.hidden = true;
          if (!isLogin && !terms.checked) {
            error.textContent = t('err.terms_required');
            error.hidden = false;
            terms.focus();
            return;
          }
          if (!isLogin && password.value !== password2.value) {
            error.textContent = t('err.password_mismatch');
            error.hidden = false;
            password2.focus();
            return;
          }
          submit.disabled = true;
          try {
            const body = { username: username.value.trim(), password: password.value };
            if (!isLogin) {
              body.passwordConfirm = password2.value;
              body.displayName = display.value.trim();
              body.email = email.value.trim();
              body.acceptTerms = true;
              body.lang = getLang();
            }
            const data = await api.post(isLogin ? '/auth/login' : '/auth/register', body);
            state.user = data.user;
            rt.connect();
            emit('kadro:auth');
            toast(t('auth.welcome', { name: data.user.displayName }), 'success');
            close();
            // Yeni hesap önce e-postasını doğrulamalı; kaldığı işe doğrulamadan sonra devam edilir.
            if (data.verify) openVerify({ onDone });
            else if (onDone) onDone();
          } catch (err) {
            error.textContent = err.code === 'banned' ? bannedText(err) : errText(err);
            error.hidden = false;
          } finally {
            submit.disabled = false;
          }
        },
      },
      !isLogin && field(t('auth.email'), email, t('auth.email.help')),
      field(t('auth.username'), username, isLogin ? null : t('auth.username.help')),
      !isLogin && field(t('auth.displayName'), display),
      field(t('auth.password'), passwordBox(password), isLogin ? null : t('auth.password.help')),
      !isLogin && field(t('auth.password2'), passwordBox(password2)),
      !isLogin &&
        h(
          'label',
          { class: 'check-row' },
          terms,
          h(
            'span',
            null,
            t('auth.terms.a'),
            h('a', { href: '#/legal/terms', target: '_blank', rel: 'noopener' }, t('legal.terms.short')),
            t('auth.terms.b'),
            h('a', { href: '#/legal/privacy', target: '_blank', rel: 'noopener' }, t('legal.privacy.short')),
            t('auth.terms.c')
          )
        ),
      isLogin &&
        h(
          'button',
          {
            class: 'link-btn',
            type: 'button',
            onClick: () => {
              close();
              openForgot();
            },
          },
          t('auth.forgot')
        ),
      error,
      h(
        'div',
        { class: 'modal-actions modal-actions-split' },
        h(
          'button',
          {
            class: 'link-btn',
            type: 'button',
            onClick: () => {
              close();
              openAuth(isLogin ? 'register' : 'login', onDone);
            },
          },
          isLogin ? t('auth.switch.toRegister') : t('auth.switch.toLogin')
        ),
        submit
      )
    );
    setTimeout(() => (isLogin ? username : email).focus(), 30);
    return form;
  });
}

// ---------- Şifre sıfırlama ----------

/** 1. adım: e-posta adresini yaz, kod + bağlantı gelsin. Hesap olsun olmasın aynı yanıt verilir. */
export function openForgot(prefill = '') {
  return openDialog(t('forgot.title'), (close) => {
    const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const email = h('input', {
      class: 'input', name: 'email', type: 'email', inputmode: 'email', autocomplete: 'email', required: true, maxlength: 120, autocapitalize: 'none', spellcheck: 'false', value: prefill,
    });
    const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, t('forgot.send'));
    const form = h(
      'form',
      {
        class: 'form',
        onSubmit: async (e) => {
          e.preventDefault();
          error.hidden = true;
          submit.disabled = true;
          try {
            await api.post('/auth/forgot', { email: email.value.trim(), lang: getLang() });
            close();
            toast(t('forgot.sent'), 'info');
            openReset({ email: email.value.trim() });
          } catch (err) {
            error.textContent = errText(err);
            error.hidden = false;
          } finally {
            submit.disabled = false;
          }
        },
      },
      h('p', { class: 'help' }, t('forgot.intro')),
      field(t('auth.email'), email),
      error,
      h('div', { class: 'modal-actions' }, submit)
    );
    setTimeout(() => email.focus(), 30);
    return form;
  });
}

/** 2. adım: e-postadaki bağlantıdan gelen token ile (token verilir) ya da e-posta + 6 haneli kodla yeni şifre belirle. */
export function openReset({ token, email: presetEmail = '' } = {}) {
  return openDialog(t('reset.title'), (close) => {
    const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const email = h('input', {
      class: 'input', name: 'email', type: 'email', inputmode: 'email', autocomplete: 'email', required: true, maxlength: 120, autocapitalize: 'none', spellcheck: 'false', value: presetEmail,
    });
    const code = h('input', {
      class: 'input verify-input', name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, placeholder: '······', required: true,
    });
    const pw = h('input', { class: 'input', name: 'password', type: 'password', required: true, maxlength: 100, autocomplete: 'new-password' });
    const pw2 = h('input', { class: 'input', name: 'passwordConfirm', type: 'password', required: true, maxlength: 100, autocomplete: 'new-password' });
    const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, t('reset.submit'));
    const form = h(
      'form',
      {
        class: 'form',
        onSubmit: async (e) => {
          e.preventDefault();
          error.hidden = true;
          if (pw.value !== pw2.value) {
            error.textContent = t('err.password_mismatch');
            error.hidden = false;
            pw2.focus();
            return;
          }
          submit.disabled = true;
          try {
            const body = { password: pw.value, passwordConfirm: pw2.value };
            if (token) body.token = token;
            else Object.assign(body, { email: email.value.trim(), code: code.value.trim() });
            const res = await api.post('/auth/reset', body);
            state.user = res.user;
            state.chats = [];
            state.chatsLoaded = false;
            rt.connect();
            emit('kadro:auth');
            toast(t('reset.done'), 'success');
            close();
          } catch (err) {
            error.textContent = errText(err);
            error.hidden = false;
          } finally {
            submit.disabled = false;
          }
        },
      },
      h('p', { class: 'help' }, token ? t('reset.intro.link') : t('reset.intro.code')),
      !token && field(t('auth.email'), email),
      !token && field(t('reset.code'), code),
      field(t('reset.newpass'), passwordBox(pw), t('auth.password.help')),
      field(t('auth.password2'), passwordBox(pw2)),
      error,
      h(
        'div',
        { class: 'modal-actions modal-actions-split' },
        token
          ? h('span')
          : h('button', { class: 'link-btn', type: 'button', onClick: () => { close(); openForgot(email.value.trim()); } }, t('reset.nocode')),
        submit
      )
    );
    setTimeout(() => (token ? pw : presetEmail ? code : email).focus(), 30);
    return form;
  });
}

// ---------- E-posta doğrulama ----------

/** E-postaya giden 6 haneli kodu girme penceresi (e-postadaki bağlantıya tıklamak da aynı işi görür). */
export function openVerify({ onDone } = {}) {
  return openDialog(t('verify.title'), (close) => {
    const intro = h('p', { class: 'help' }, t('verify.intro', { email: (state.user && state.user.email) || '' }));
    const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const showError = (err) => {
      error.textContent = errText(err);
      error.hidden = false;
    };
    const input = h('input', {
      class: 'input verify-input', name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, placeholder: '······', required: true,
    });
    const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, t('verify.submit'));
    const resend = h('button', { class: 'link-btn', type: 'button' }, t('verify.resend'));
    resend.addEventListener('click', async () => {
      error.hidden = true;
      resend.disabled = true;
      try {
        await api.post('/auth/resend-verification', { lang: getLang() });
        toast(t('verify.resent'), 'info');
      } catch (err) {
        showError(err);
      } finally {
        resend.disabled = false;
      }
    });

    // Yanlış yazılmış e-postayı düzeltme
    const newEmail = h('input', { class: 'input', type: 'email', inputmode: 'email', autocomplete: 'email', maxlength: 120, placeholder: t('verify.change.ph'), 'aria-label': t('verify.change.ph') });
    const changeBtn = h('button', { class: 'btn btn-soft btn-sm', type: 'button' }, t('verify.change.save'));
    const changeBox = h('div', { class: 'verify-change', hidden: true }, newEmail, changeBtn);
    const changeToggle = h('button', {
      class: 'link-btn', type: 'button',
      onClick: () => {
        changeBox.hidden = !changeBox.hidden;
        if (!changeBox.hidden) newEmail.focus();
      },
    }, t('verify.change'));
    changeBtn.addEventListener('click', async () => {
      error.hidden = true;
      changeBtn.disabled = true;
      try {
        const res = await api.post('/auth/change-email', { email: newEmail.value.trim(), lang: getLang() });
        state.user = res.user;
        emit('kadro:auth-soft');
        intro.textContent = t('verify.intro', { email: res.user.email });
        changeBox.hidden = true;
        input.value = '';
        toast(t('verify.resent'), 'info');
      } catch (err) {
        showError(err);
      } finally {
        changeBtn.disabled = false;
      }
    });

    const form = h(
      'form',
      {
        class: 'form',
        onSubmit: async (e) => {
          e.preventDefault();
          error.hidden = true;
          submit.disabled = true;
          try {
            const res = await api.post('/auth/verify', { code: input.value.trim() });
            state.user = res.user;
            emit('kadro:auth-soft');
            toast(t('verify.done'), 'success');
            close();
            if (onDone) onDone();
          } catch (err) {
            showError(err);
          } finally {
            submit.disabled = false;
          }
        },
      },
      intro,
      h('p', { class: 'help' }, t('verify.spam')),
      field(t('verify.input'), input),
      error,
      h('div', { class: 'verify-links' }, changeToggle, changeBox),
      h('div', { class: 'modal-actions modal-actions-split' }, resend, submit)
    );
    setTimeout(() => input.focus(), 30);
    return form;
  });
}

// ---------- Katılma / mesajlaşma ----------

export function joinGroup(g, code) {
  return requireLogin(async () => {
    try {
      await api.post(`/groups/${g.id}/join`, code ? { code } : {});
      toast(t('toast.joined'), 'success');
      await refreshChats();
      goTo(`#/chat/${g.id}`);
    } catch (err) {
      toast(errText(err), 'error');
    }
  });
}

export function startDm(username) {
  return requireLogin(async () => {
    try {
      const { groupId } = await api.post(`/dm/${encodeURIComponent(username)}`, {});
      await refreshChats();
      goTo(`#/chat/${groupId}`);
    } catch (err) {
      toast(errText(err), 'error');
    }
  });
}

// ---------- Arkadaşlık düğmeleri ----------

/**
 * Bir kişiyle ilişkiye göre doğru düğmeleri üretir.
 * relation: none | outgoing | incoming | friend | self. Değişince onChange(yeniİlişki) çağrılır.
 */
export function relationActions(user, relation, onChange, { compact = false } = {}) {
  const call = async (fn, next) => {
    try {
      const res = await fn();
      await refreshRequests();
      if (next === 'friend') refreshChats();
      onChange(res && res.relation ? res.relation : next);
    } catch (err) {
      toast(errText(err), 'error');
      onChange(relation); // yeniden çiz (hatadan sonra düğmeler açılsın)
    }
  };
  const u = encodeURIComponent(user.username);
  const sm = compact ? ' btn-sm' : '';

  if (relation === 'self') return [];
  if (relation === 'friend') {
    return [
      h('button', { class: (compact ? 'btn btn-soft' : 'btn btn-primary') + sm, type: 'button', onClick: () => startDm(user.username) }, icon('chat', 16), t('friends.message')),
      !compact &&
        h(
          'button',
          {
            class: 'btn btn-ghost btn-danger-text' + sm,
            type: 'button',
            onClick: async () => {
              if (await confirmDialog(t('confirm.unfriend', { name: user.displayName }), { confirmLabel: t('friends.remove'), danger: true })) {
                call(() => api.del(`/friends/${u}`), 'none');
              }
            },
          },
          t('friends.remove')
        ),
    ];
  }
  if (relation === 'incoming') {
    return [
      h('button', { class: 'btn btn-primary' + sm, type: 'button', onClick: () => call(() => api.post(`/friends/${u}/accept`, {}), 'friend') }, icon('check', 16), t('friends.accept')),
      h('button', { class: 'btn btn-ghost' + sm, type: 'button', onClick: () => call(() => api.post(`/friends/${u}/decline`, {}), 'none') }, t('friends.decline')),
    ];
  }
  if (relation === 'outgoing') {
    return [
      h('button', { class: 'btn btn-ghost' + sm, type: 'button', onClick: () => call(() => api.del(`/friends/${u}`), 'none') }, icon('check', 16), t('friends.sent')),
    ];
  }
  return [
    h(
      'button',
      {
        class: 'btn btn-soft' + sm,
        type: 'button',
        onClick: () => requireLogin(() => call(() => api.post('/friends', { username: user.username }), 'outgoing')),
      },
      icon('user-plus', 16),
      t('friends.add')
    ),
  ];
}

// ---------- Grup kartı (oyun sayfasındaki liste) ----------

export function groupCard(g) {
  let action;
  if (g.isMember) action = h('a', { class: 'btn btn-ghost btn-sm', href: `#/chat/${g.id}` }, t('group.open'));
  else if (g.full) action = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: true }, t('group.full'));
  else action = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onClick: () => joinGroup(g) }, t('group.join'));

  return h(
    'article',
    { class: 'group-card' },
    h('h3', { class: 'group-title' }, h('a', { href: `#/chat/${g.id}` }, g.title)),
    g.description ? h('p', { class: 'group-desc' }, g.description) : h('p', { class: 'group-desc muted' }, t('group.noDesc')),
    h(
      'div',
      { class: 'group-foot' },
      h(
        'div',
        { class: 'group-people' },
        avatarStack(g.members || []),
        h('span', { class: 'group-count' + (g.full ? ' is-full' : '') }, `${g.memberCount}/${g.maxMembers}`),
        h('span', { class: 'group-owner' }, t('group.by', { name: g.owner.displayName }))
      ),
      action
    )
  );
}

// ---------- Grup kurma / düzenleme ----------

/** kind: 'lfg' (oyun grubu) | 'community' (kalıcı arkadaş grubu) */
export function openGroupForm(kind, preset = {}) {
  const isGame = kind === 'lfg';
  return openDialog(isGame ? t('form.game.title') : t('form.friends.title'), (close) => {
    const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const game = select({
      value: preset.gameId || '',
      options: [
        ['', t('form.game.pick')],
        ...[...state.games].sort((a, b) => (a.id === 'other') - (b.id === 'other') || a.name.localeCompare(b.name)).map((g) => [g.id, g.name]),
      ],
    });
    game.required = true;
    const title = h('input', {
      class: 'input', maxlength: 60, minlength: 3, required: true,
      placeholder: isGame ? t('form.title.ph.game') : t('form.title.ph.friends'),
    });
    const desc = h('textarea', { class: 'textarea', maxlength: 300, rows: 3, placeholder: t('form.desc.ph') });
    const max = h('input', { class: 'input', type: 'number', min: 2, max: isGame ? 10 : 50, value: isGame ? 5 : 20 });
    const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, t('form.create'));

    // Arkadaş grubunda başlangıç üyeleri: arkadaş listesinden seçilir.
    const picked = new Set();
    const friendsBox = h('div', { class: 'pick-list' }, h('p', { class: 'muted' }, t('common.loading')));
    if (!isGame) {
      api
        .get('/friends')
        .then(({ friends }) => {
          friendsBox.replaceChildren();
          if (!friends.length) {
            friendsBox.append(h('p', { class: 'muted' }, t('form.friends.none')));
            return;
          }
          for (const f of friends) {
            const cb = h('input', {
              type: 'checkbox',
              onChange: () => (cb.checked ? picked.add(f.username) : picked.delete(f.username)),
            });
            friendsBox.append(h('label', { class: 'pick-row' }, cb, avatar(f, 28), h('span', null, f.displayName), h('small', null, '@' + f.username)));
          }
        })
        .catch(() => friendsBox.replaceChildren(h('p', { class: 'muted' }, t('err.default'))));
    }

    const form = h(
      'form',
      {
        class: 'form',
        onSubmit: async (e) => {
          e.preventDefault();
          error.hidden = true;
          submit.disabled = true;
          try {
            const body = {
              kind,
              title: title.value.trim(),
              description: desc.value.trim(),
              maxMembers: Number(max.value),
            };
            if (isGame) body.gameId = game.value;
            else body.members = [...picked];
            const { group } = await api.post('/groups', body);
            close();
            toast(t('toast.created'), 'success');
            await refreshChats();
            goTo(`#/chat/${group.id}`);
          } catch (err) {
            error.textContent = errText(err);
            error.hidden = false;
          } finally {
            submit.disabled = false;
          }
        },
      },
      isGame && field(t('form.game'), game),
      field(isGame ? t('form.game.name') : t('form.friends.name'), title),
      field(t('form.desc'), desc),
      isGame && field(t('form.game.slots'), max),
      !isGame && h('div', { class: 'field' }, h('span', { class: 'field-label' }, t('form.friends.pick')), friendsBox),
      error,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onClick: close }, t('common.cancel')), submit)
    );
    setTimeout(() => (isGame && !game.value ? game : title).focus(), 30);
    return form;
  });
}

export function openEditForm(group, onSaved) {
  return openDialog(t('chat.edit'), (close) => {
    const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const title = h('input', { class: 'input', maxlength: 60, minlength: 3, required: true, value: group.title });
    const desc = h('textarea', { class: 'textarea', maxlength: 300, rows: 3 });
    desc.value = group.description || '';
    const max = h('input', {
      class: 'input', type: 'number', min: Math.max(2, group.memberCount), max: group.kind === 'lfg' ? 10 : 50, value: group.maxMembers,
    });
    return h(
      'form',
      {
        class: 'form',
        onSubmit: async (e) => {
          e.preventDefault();
          error.hidden = true;
          try {
            const data = await api.patch(`/groups/${group.id}`, {
              title: title.value.trim(),
              description: desc.value.trim(),
              maxMembers: Number(max.value),
            });
            close();
            onSaved(data.group);
          } catch (err) {
            error.textContent = errText(err);
            error.hidden = false;
          }
        },
      },
      field(t('form.game.name'), title),
      field(t('form.desc'), desc),
      field(t('form.maxMembers'), max),
      error,
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: close }, t('common.cancel')),
        h('button', { class: 'btn btn-primary', type: 'submit' }, t('common.save'))
      )
    );
  });
}

/** "Kodla katıl" penceresi: arkadaş grubunun davet kodunu girince gruba girilir. */
export function openJoinByCode() {
  return requireLogin(() =>
    openDialog(t('code.title'), (close) => {
      const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
      const code = h('input', {
        class: 'input', required: true, maxlength: 40, autocapitalize: 'none', spellcheck: 'false', placeholder: t('code.ph'),
      });
      const form = h(
        'form',
        {
          class: 'form',
          onSubmit: async (e) => {
            e.preventDefault();
            error.hidden = true;
            try {
              const { group } = await api.post('/groups/join-by-code', { code: code.value.trim() });
              close();
              toast(t('toast.joined'), 'success');
              await refreshChats();
              goTo(`#/chat/${group.id}`);
            } catch (err) {
              error.textContent = errText(err);
              error.hidden = false;
            }
          },
        },
        h('p', { class: 'help' }, t('code.help')),
        field(t('code.label'), code),
        error,
        h(
          'div',
          { class: 'modal-actions' },
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: close }, t('common.cancel')),
          h('button', { class: 'btn btn-primary', type: 'submit' }, t('code.go'))
        )
      );
      setTimeout(() => code.focus(), 30);
      return form;
    })
  );
}

export { copyText };
