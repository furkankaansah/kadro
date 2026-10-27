import { t, getLang } from './i18n.js';

// ---------- DOM kurucu ----------

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}

/** Mevcut bir elemana h() gibi çocuk ekler: null/undefined/false atlanır (el.append(false) "false" yazısı basar). */
export function put(el, ...kids) {
  append(el, kids);
  return el;
}

/**
 * h('div', { class: 'x', onClick: fn, style: { '--c': 'red' } }, 'metin', childEl)
 * Metinler her zaman textContent olarak eklenir; HTML olarak yorumlanmaz (XSS güvenli).
 */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  let value;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [p, val] of Object.entries(v)) {
          if (p.startsWith('--')) el.style.setProperty(p, val);
          else el.style[p] = val;
        }
      } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') value = v;
      else if (['checked', 'disabled', 'selected', 'required', 'hidden', 'open'].includes(k)) el[k] = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, kids);
  if (value !== undefined) el.value = value; // <select> için seçenekler eklendikten sonra
  return el;
}

export const clear = (el) => el.replaceChildren();

// ---------- İkonlar (sabit SVG yolları) ----------

const PATHS = {
  gamepad:
    '<rect x="2" y="7" width="20" height="11" rx="5.5"/><path d="M7 10.5v4M5 12.5h4"/><path d="M15.5 11.5h.01M18 13.5h.01"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  users:
    '<path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  'user-plus':
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  'user-check':
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M16 11l2 2 4-4"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M17.94 17.94A10.1 10.1 0 0112 19c-6.5 0-10-7-10-7a18.5 18.5 0 015.06-5.94M9.9 4.24A9.1 9.1 0 0112 4c6.5 0 10 7 10 7a18.5 18.5 0 01-2.16 3.19M14.12 14.12a3 3 0 11-4.24-4.24"/><path d="M1 1l22 22"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'arrow-left': '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  flag: '<path d="M4 22V4M4 4h13l-2.5 4L17 12H4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
};

export function icon(name, size = 18) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  // PATHS sabit, kod içinde tanımlı; kullanıcı verisi içermez.
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
  return span;
}

// ---------- Avatar ----------

const AVATAR_GRADIENTS = [
  ['#6366F1', '#8B5CF6'],
  ['#EC4899', '#F43F5E'],
  ['#14B8A6', '#22C55E'],
  ['#F59E0B', '#EF4444'],
  ['#0EA5E9', '#6366F1'],
  ['#A855F7', '#EC4899'],
  ['#10B981', '#0EA5E9'],
];

export function avatar(user, size = 40) {
  const name = (user && (user.displayName || user.username)) || '?';
  const seed = (user && user.username) || name;
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  const [a, b] = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
  const initials = [...name.trim()].slice(0, 2).join('').toUpperCase();
  return h(
    'span',
    { class: 'avatar', style: { '--size': size + 'px', '--a': a, '--b': b }, 'aria-hidden': 'true' },
    initials
  );
}

/** Avatar + çevrimiçi noktası. */
export function avatarWithDot(user, size = 40) {
  return h('span', { class: 'avatar-wrap' }, avatar(user, size), user && user.online && h('i', { class: 'online-dot', title: t('common.online') }));
}

/** Üst üste binen avatarlar (grup kartlarında üye önizlemesi). */
export function avatarStack(users, size = 28) {
  return h('span', { class: 'avatar-stack' }, users.slice(0, 4).map((u) => avatar(u, size)));
}

// ---------- Bildirimler (toast) ----------

export function toast(message, kind = 'info', opts = {}) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = h(
    'div',
    { class: `toast toast-${kind}`, role: 'status' },
    h('span', { class: 'toast-text' }, message),
    opts.href && h('a', { class: 'toast-link', href: opts.href, onClick: () => el.remove() }, opts.hrefLabel || t('common.open')),
    h('button', { class: 'toast-x', type: 'button', 'aria-label': t('common.close'), onClick: () => el.remove() }, icon('x', 14))
  );
  box.append(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => el.remove(), opts.duration || 4500);
}

/** Hata nesnesinden kullanıcıya gösterilecek metin. */
export function errText(err) {
  const key = 'err.' + ((err && err.code) || 'default');
  const s = t(key);
  return s === key ? t('err.default') : s;
}

// ---------- Diyalog ----------

/** Modal pencere açar. build(close) bir DOM düğümü döndürür. */
export function openDialog(title, build) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal';
  const close = () => {
    if (dlg.open) dlg.close();
  };
  const titleId = 'dlg-' + Math.random().toString(36).slice(2, 8);
  dlg.setAttribute('aria-labelledby', titleId);
  dlg.append(
    h(
      'div',
      { class: 'modal-inner' },
      h(
        'div',
        { class: 'modal-head' },
        h('h2', { id: titleId }, title),
        h('button', { class: 'btn-icon', type: 'button', 'aria-label': t('common.close'), onClick: close }, icon('x'))
      ),
      h('div', { class: 'modal-body' }, build(close))
    )
  );
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close();
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return { el: dlg, close };
}

export function confirmDialog(message, { confirmLabel, danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    const { el } = openDialog(t('common.confirm'), (close) =>
      h(
        'div',
        null,
        h('p', { class: 'confirm-text' }, message),
        h(
          'div',
          { class: 'modal-actions' },
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: close }, t('common.cancel')),
          h(
            'button',
            {
              class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'),
              type: 'button',
              onClick: () => {
                answer = true;
                close();
              },
            },
            confirmLabel || t('common.confirm')
          )
        )
      )
    );
    el.addEventListener('close', () => resolve(answer));
  });
}

// ---------- Küçük yardımcılar ----------

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      /* yoksay */
    }
    ta.remove();
  }
  toast(t('common.copied'), 'success', { duration: 1800 });
}

const loc = () => (getLang() === 'tr' ? 'tr-TR' : 'en-GB');

export const fmtClock = (ms) => new Date(ms).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
export const fmtDate = (ms) => new Date(ms).toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric' });

/** Sohbet listesi için: bugün -> saat, dün -> "Dün", bu hafta -> gün adı, daha eski -> 12.03 */
export function fmtShort(ms) {
  const d = new Date(ms);
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (days <= 0) return fmtClock(ms);
  if (days === 1) return t('common.yesterday');
  if (days < 7) return d.toLocaleDateString(loc(), { weekday: 'short' });
  return d.toLocaleDateString(loc(), { day: '2-digit', month: '2-digit' });
}

/** Gün ayracı: "Bugün", "Dün" ya da "12 Kasım" */
export function fmtDay(ms) {
  const d = new Date(ms);
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (days <= 0) return t('common.today');
  if (days === 1) return t('common.yesterday');
  return d.toLocaleDateString(loc(), { day: 'numeric', month: 'long' });
}
