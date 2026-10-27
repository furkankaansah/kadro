import { h, clear } from '../ui.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { t } from '../i18n.js';
import { gameBadge } from '../components.js';

// Ana sayfa: oyun seç. Her kutucukta o oyunda kaç açık grup olduğu görünür.
export default async function home(el) {
  let stats = { byGame: {}, online: 0, players: 0 };
  try {
    stats = await api.get('/stats');
  } catch {
    /* sayı gösterilemese de oyunlar listelensin */
  }

  const grid = h('div', { class: 'game-grid' });
  const search = h('input', {
    class: 'input input-lg', type: 'search', placeholder: t('home.search'), 'aria-label': t('home.search'), autocomplete: 'off',
  });

  const FIRST = 24; // arama yokken ilk gösterilen oyun sayısı (liste popülerlik sırasındadır)
  let showAll = false;
  const more = h('div', { class: 'more-row' });

  function tile(g) {
    const n = stats.byGame[g.id] || 0;
    return h(
      'a',
      { class: 'game-tile', href: `#/game/${g.id}`, style: { '--game': g.color } },
      gameBadge(g.id, 52),
      h('span', { class: 'game-name' }, g.name),
      h('span', { class: 'game-meta' + (n ? ' has' : '') }, n === 0 ? t('home.noGroups') : n === 1 ? t('home.group.one') : t('home.groups', { n }))
    );
  }

  function draw() {
    const q = search.value.trim().toLowerCase();
    clear(grid);
    clear(more);
    const matches = state.games.filter((g) => !q || g.name.toLowerCase().includes(q) || g.short.toLowerCase().includes(q));
    if (!matches.length) grid.append(h('p', { class: 'muted' }, t('home.noGame')));
    // Açık grubu olan oyunlar öne çıkar; gerisi popülerlik sırasında kalır. "Diğer" hep sonda.
    const rest = matches.filter((g) => g.id !== 'other').sort((a, b) => (stats.byGame[b.id] || 0) - (stats.byGame[a.id] || 0));
    const other = matches.filter((g) => g.id === 'other');
    const shown = q || showAll ? rest : rest.slice(0, FIRST);
    for (const g of [...shown, ...other]) grid.append(tile(g));
    if (!q && rest.length > FIRST) {
      more.append(
        h(
          'button',
          { class: 'btn btn-soft', type: 'button', onClick: () => ((showAll = !showAll), draw()) },
          showAll ? t('home.showLess') : t('home.showAll', { n: rest.length })
        )
      );
    }
  }
  search.addEventListener('input', draw);

  el.append(
    h(
      'section',
      { class: 'hero' },
      stats.online > 0 && h('p', { class: 'pill' }, h('i', { class: 'online-dot static' }), t('home.online', { n: stats.online })),
      h('h1', { class: 'hero-title' }, t('home.title')),
      h('p', { class: 'hero-sub' }, t('home.sub')),
      search
    ),
    grid,
    more
  );
  draw();
}
