'use strict';

// Oyun listesi (server/games.json): id (adreste kullanılır), ad, vurgu rengi, kutucukta görünen kısa kod.
// Listeyi scripts/build-games.mjs üretir; yeni oyun için o dosyaya bir satır ekleyip `node scripts/build-games.mjs` çalıştır.
const GAMES = require('./games.json');

module.exports = {
  GAMES,
  // Oyun grupları geçicidir: bu süre boyunca hiç mesaj yazılmazsa listeden kalkar.
  GROUP_IDLE_MS: 12 * 60 * 60 * 1000,
  // Listeden kalktıktan sonra bu kadar süre daha bekleyip tamamen silinir.
  GROUP_DELETE_MS: 3 * 24 * 60 * 60 * 1000,
  GAME_GROUP_MAX: 10, // oyun grubunda en fazla kişi
  FRIEND_GROUP_MAX: 50, // arkadaş grubunda en fazla kişi
  OWNED_GAME_GROUPS: 3, // aynı anda açabileceğin aktif oyun grubu
  OWNED_FRIEND_GROUPS: 5, // sahibi olabileceğin arkadaş grubu
  MAX_PENDING_REQUESTS: 50,
};
