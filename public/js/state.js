// Uygulama genelinde paylaşılan durum. Başka modüllere bağımlılığı yok (döngüsel import olmasın diye).

export const state = {
  user: null,
  games: [],
  gamesById: {},
  clientId: '', // canlı bağlantının (SSE) kimliği
  chats: [], // benim sohbetlerim (grup + birebir), son harekete göre sıralı
  chatsLoaded: false,
  requests: 0, // bekleyen (gelen) arkadaşlık isteği sayısı
};

export function setGames(list) {
  state.games = list;
  state.gamesById = Object.fromEntries(list.map((g) => [g.id, g]));
}

export const gameOf = (id) => state.gamesById[id] || { id, name: id || '—', color: '#8A91A8', short: '?' };

export const unreadTotal = () => state.chats.reduce((n, c) => n + (c.unread || 0), 0);

/** Pencere üzerinden basit olay yayını: kadro:auth, kadro:lang, kadro:chats, kadro:friends ... */
export function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
