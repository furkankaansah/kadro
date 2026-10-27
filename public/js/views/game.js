import { h, icon, clear, toast, errText } from '../ui.js';
import { api, qs } from '../api.js';
import { state, gameOf } from '../state.js';
import { t } from '../i18n.js';
import { gameBadge, groupCard, emptyState, openGroupForm, requireLogin } from '../components.js';

// Bir oyunun açık grupları + "Grup aç".
export default async function game(el, ctx) {
  const id = ctx.params.id;
  if (!state.gamesById[id]) {
    el.append(emptyState(t('common.notFound.title'), t('common.notFound.text'), h('a', { class: 'btn btn-primary', href: '#/' }, t('common.home'))));
    return;
  }
  const g = gameOf(id);
  document.title = `${g.name} · Kadro`;

  const list = h('div', { class: 'group-grid', 'aria-live': 'polite' });
  const count = h('p', { class: 'page-sub' });
  let loadId = 0;

  async function load() {
    const mine = ++loadId;
    try {
      const data = await api.get('/groups' + qs({ game: id }));
      if (mine !== loadId) return;
      clear(list);
      count.textContent = data.groups.length === 1 ? t('home.group.one') : data.groups.length ? t('home.groups', { n: data.groups.length }) : t('home.noGroups');
      if (!data.groups.length) {
        list.append(
          emptyState(
            t('game.empty.title'),
            t('game.empty.text', { game: g.name }),
            h('button', { class: 'btn btn-primary', type: 'button', onClick: openForm }, icon('plus', 16), t('game.new'))
          )
        );
        return;
      }
      data.groups.forEach((x) => list.append(groupCard(x)));
    } catch (err) {
      toast(errText(err), 'error');
    }
  }

  const openForm = () => requireLogin(() => openGroupForm('lfg', { gameId: id }));

  // Oyunlar arası hızlı geçiş: en popüler 16 oyun ve açık olan oyun
  const switchGames = () => {
    const top = state.games.slice(0, 16);
    return top.some((x) => x.id === id) ? top : [...top, g];
  };
  const switcher = h(
    'nav',
    { class: 'game-switch', 'aria-label': t('home.title') },
    switchGames().map((x) =>
      h('a', { class: 'switch-chip' + (x.id === id ? ' active' : ''), href: `#/game/${x.id}`, style: { '--game': x.color } }, x.short)
    )
  );

  el.append(
    h('a', { class: 'back-link', href: '#/' }, icon('arrow-left', 16), t('game.all')),
    h(
      'div',
      { class: 'page-head' },
      h('div', { class: 'page-head-main' }, gameBadge(id, 56), h('div', null, h('h1', { class: 'page-title' }, g.name), count)),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: openForm }, icon('plus', 16), t('game.new'))
    ),
    switcher,
    list
  );

  // Başka sekmeden dönünce liste güncel olsun.
  const onFocus = () => load();
  window.addEventListener('focus', onFocus);
  ctx.onCleanup(() => window.removeEventListener('focus', onFocus));

  await load();
  const active = switcher.querySelector('.active');
  if (active && active.scrollIntoView) active.scrollIntoView({ inline: 'center', block: 'nearest' });
}
