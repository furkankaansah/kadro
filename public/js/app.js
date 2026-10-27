import { h, icon, clear, toast, errText, avatar } from './ui.js';
import { api } from './api.js';
import { state, setGames, emit, unreadTotal } from './state.js';
import { t, getLang, setLang } from './i18n.js';
import * as rt from './realtime.js';
import { openAuth, openVerify, openReset, emptyState } from './components.js';
import { refreshChats, refreshRequests, startChatEvents } from './chats.js';
import { siteConfig } from './views/legal.js';

// ---------- Yönlendirme (hash tabanlı: #/game/valorant, #/chat/12) ----------

const ROUTES = [
  { re: /^\/?$/, load: () => import('./views/home.js'), nav: 'games' },
  { re: /^\/game\/([a-z0-9]+)$/, keys: ['id'], load: () => import('./views/game.js'), nav: 'games' },
  { re: /^\/chats$/, load: () => import('./views/chats.js'), nav: 'chats' },
  { re: /^\/chat\/(\d+)$/, keys: ['id'], load: () => import('./views/chats.js'), nav: 'chats', chat: true },
  { re: /^\/friends$/, load: () => import('./views/friends.js'), nav: 'friends' },
  { re: /^\/profile$/, load: () => import('./views/profile.js'), nav: 'profile' },
  { re: /^\/u\/([^/]+)$/, keys: ['username'], load: () => import('./views/user.js'), nav: 'friends' },
  { re: /^\/legal\/(privacy|terms)$/, keys: ['doc'], load: () => import('./views/legal.js'), nav: '' },
  { re: /^\/admin$/, load: () => import('./views/admin.js'), nav: 'profile' },
];

const main = document.getElementById('view');
let current = null;
let renderToken = 0;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(query)) };
}

function setNav(name) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function errorPanel(err) {
  return emptyState(
    t('common.error.title'),
    errText(err),
    h('button', { class: 'btn btn-primary', type: 'button', onClick: () => render() }, t('common.retry'))
  );
}

async function render() {
  const token = ++renderToken;
  if (current) {
    current.dead = true;
    for (const fn of current.cleanups.splice(0)) {
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    }
  }
  // Açık kalmış pencereler (grup bilgisi vb.) sayfa değişince kapansın.
  document.querySelectorAll('dialog.modal[open]').forEach((d) => d.close());

  const { path, query } = parseHash();
  const route = ROUTES.find((r) => r.re.test(path));
  const ctx = {
    query,
    params: {},
    dead: false,
    cleanups: [],
    onCleanup(fn) {
      if (ctx.dead) fn();
      else ctx.cleanups.push(fn);
    },
    reload: () => render(),
  };
  current = ctx;
  document.title = `Kadro — ${t('brand.tagline')}`;
  document.body.classList.toggle('in-chat', !!(route && route.chat));
  window.scrollTo(0, 0);

  const container = h('div', { class: 'view' + (route && route.nav === 'chats' ? ' view-chats' : '') });
  main.replaceChildren(container);

  if (!route) {
    container.append(emptyState(t('common.notFound.title'), t('common.notFound.text'), h('a', { class: 'btn btn-primary', href: '#/' }, t('common.home'))));
    setNav('');
    return;
  }
  const m = route.re.exec(path);
  (route.keys || []).forEach((key, i) => {
    try {
      ctx.params[key] = decodeURIComponent(m[i + 1]);
    } catch {
      ctx.params[key] = m[i + 1];
    }
  });
  setNav(route.nav);

  // Hızlı sayfalarda yükleniyor yazısı hiç görünmesin diye gecikmeli göster.
  const loading = h('p', { class: 'muted loading' }, t('common.loading'));
  const loadingTimer = setTimeout(() => {
    if (token === renderToken && !container.firstChild) container.append(loading);
  }, 300);

  try {
    const mod = await route.load();
    await mod.default(container, ctx);
  } catch (err) {
    if (token === renderToken) {
      console.error(err);
      container.replaceChildren(errorPanel(err));
    }
  } finally {
    clearTimeout(loadingTimer);
    loading.remove();
  }
}

// ---------- Üst çubuk ve alt sekme çubuğu ----------

function badge(kind) {
  return h('span', { class: 'badge nav-badge', 'data-badge': kind, hidden: true });
}

function updateBadges() {
  const counts = { chats: unreadTotal(), friends: state.requests };
  document.querySelectorAll('[data-badge]').forEach((b) => {
    const n = counts[b.dataset.badge] || 0;
    b.hidden = !n || !state.user;
    b.textContent = n > 99 ? '99+' : String(n);
  });
}

async function logout() {
  try {
    await api.post('/auth/logout', {});
  } catch {
    /* çıkış yine de yapılsın */
  }
  rt.disconnect();
  state.user = null;
  state.chats = [];
  state.requests = 0;
  emit('kadro:auth');
  toast(t('auth.loggedOut'), 'info');
  location.hash = '#/';
}

function renderTopbar() {
  const bar = document.getElementById('topbar');
  const user = state.user;
  const lang = getLang();

  const langToggle = h(
    'div',
    { class: 'lang-toggle', role: 'group', 'aria-label': t('nav.langSwitch') },
    ['tr', 'en'].map((code) =>
      h('button', { type: 'button', 'aria-pressed': String(lang === code), lang: code, onClick: () => setLang(code) }, code.toUpperCase())
    )
  );

  const link = (name, href, label, withBadge) =>
    h('a', { class: 'nav-link', href, 'data-nav': name }, label, withBadge && badge(withBadge));

  clear(bar);
  bar.append(
    h(
      'div',
      { class: 'topbar-inner' },
      h('a', { class: 'brand', href: '#/', 'aria-label': 'Kadro' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('gamepad', 18)), h('span', { class: 'brand-name' }, 'Kadro')),
      h(
        'nav',
        { class: 'nav', 'aria-label': t('nav.main') },
        link('games', '#/', t('nav.games')),
        link('chats', '#/chats', t('nav.chats'), 'chats'),
        link('friends', '#/friends', t('nav.friends'), 'friends')
      ),
      h(
        'div',
        { class: 'topbar-end' },
        langToggle,
        user
          ? [
              h('a', { class: 'user-chip', href: '#/profile', 'data-nav': 'profile', title: t('nav.profile') }, avatar(user, 28), h('span', null, user.displayName)),
              h('button', { class: 'btn-icon hide-mobile', type: 'button', title: t('nav.logout'), 'aria-label': t('nav.logout'), onClick: logout }, icon('logout', 18)),
            ]
          : [
              h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openAuth('login') }, t('nav.login')),
              h('button', { class: 'btn btn-primary btn-sm hide-mobile', type: 'button', onClick: () => openAuth('register') }, t('nav.register')),
            ]
      )
    )
  );

  const tabs = document.getElementById('tabbar');
  clear(tabs);
  const tab = (name, href, ico, label, withBadge) =>
    h('a', { class: 'tab', href, 'data-nav': name }, h('span', { class: 'tab-icon' }, icon(ico, 22), withBadge && badge(withBadge)), h('span', { class: 'tab-label' }, label));
  tabs.append(
    tab('games', '#/', 'gamepad', t('nav.games')),
    tab('chats', '#/chats', 'chat', t('nav.chats'), 'chats'),
    tab('friends', '#/friends', 'users', t('nav.friends'), 'friends'),
    tab('profile', '#/profile', 'user', t('nav.profile'))
  );

  const skip = document.querySelector('.skip');
  if (skip) skip.textContent = t('common.skip');
  setNav(ROUTES.find((r) => r.re.test(parseHash().path))?.nav ?? '');
  updateBadges();
  syncVerifyBar();
  renderFooter();
}

/** Sayfa altı: yasal sayfalara ve iletişim adresine bağlantılar. */
async function renderFooter() {
  const foot = document.getElementById('site-footer');
  if (!foot) return;
  const cfg = await siteConfig();
  clear(foot);
  foot.append(
    h(
      'div',
      { class: 'site-footer-inner' },
      h('span', null, `© ${new Date().getFullYear()} ${cfg.siteName || 'Kadro'}`),
      h('a', { href: '#/legal/privacy' }, t('legal.privacy.short')),
      h('a', { href: '#/legal/terms' }, t('legal.terms.short')),
      cfg.contactEmail && h('a', { href: `mailto:${cfg.contactEmail}` }, t('legal.contact'))
    )
  );
}

/** E-postası doğrulanmamış hesaplara üstte hatırlatma şeridi gösterir. */
let verifyBar = null;
function syncVerifyBar() {
  const need = !!state.user && state.user.emailVerified === false;
  if (!need) {
    if (verifyBar) verifyBar.remove();
    verifyBar = null;
    return;
  }
  if (!verifyBar) {
    verifyBar = h('p', { class: 'verify-bar', role: 'status' });
    main.before(verifyBar);
  }
  verifyBar.replaceChildren(
    h('span', null, t('verify.banner')),
    h('button', { class: 'btn btn-primary btn-sm', type: 'button', onClick: () => openVerify() }, t('verify.banner.btn'))
  );
}

// ---------- Başlangıç ----------

async function boot() {
  try {
    const [me, games] = await Promise.all([api.get('/me'), api.get('/games')]);
    state.user = me.user;
    setGames(games.games);
  } catch (err) {
    main.replaceChildren(
      h('div', { class: 'view' }, emptyState(t('common.error.title'), errText(err), h('button', { class: 'btn btn-primary', type: 'button', onClick: () => location.reload() }, t('common.retry'))))
    );
    return;
  }

  startChatEvents();
  const syncAccount = () => {
    refreshChats();
    refreshRequests();
  };
  if (state.user) {
    rt.connect();
    syncAccount();
  }

  window.addEventListener('hashchange', () => render());
  window.addEventListener('kadro:reload', () => render());
  window.addEventListener('kadro:auth', () => {
    renderTopbar();
    if (state.user) syncAccount();
    render();
  });
  window.addEventListener('kadro:auth-soft', renderTopbar);
  window.addEventListener('kadro:logout', logout);
  window.addEventListener('kadro:lang', () => {
    renderTopbar();
    render();
  });
  window.addEventListener('kadro:chats', updateBadges);
  // E-postadaki bağlantı başka sekmede açıldıysa, bu sekmeye dönünce şerit kalksın.
  window.addEventListener('focus', async () => {
    if (!state.user || state.user.emailVerified !== false) return;
    try {
      const me = await api.get('/me');
      if (me.user && me.user.emailVerified) {
        state.user = me.user;
        renderTopbar();
        toast(t('verify.done'), 'success');
      }
    } catch {
      /* ağ yoksa şerit kalır */
    }
  });
  // Canlı bağlantı yeniden kurulunca kaçırdığımız mesajları yakala.
  window.addEventListener('kadro:rt-open', () => {
    if (state.user) syncAccount();
  });

  renderTopbar();
  await render();

  // Şifre sıfırlama e-postasındaki bağlantı: /?reset=<anahtar>
  const resetToken = new URLSearchParams(location.search).get('reset');
  if (resetToken) {
    history.replaceState(null, '', location.pathname + location.hash);
    openReset({ token: resetToken });
  }

  // E-postadaki bağlantıdan dönüldü: /?verified=1 (başarılı) ya da /?verified=0 (geçersiz/süresi dolmuş).
  const verified = new URLSearchParams(location.search).get('verified');
  if (verified !== null) {
    history.replaceState(null, '', location.pathname + location.hash);
    if (verified === '1') toast(t('verify.done'), 'success');
    else toast(t('verify.link.bad'), 'error');
  }
}

boot();

// Ana ekrana eklenebilir uygulama (PWA): yalnızca HTTPS'te kaydolur. /api isteklerine karışmaz.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
