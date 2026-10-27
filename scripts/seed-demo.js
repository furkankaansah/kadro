'use strict';

// Demo verisi: birkaç oyuncu, arkadaşlık, oyun grubu, arkadaş grubu ve mesaj ekler ki site ilk açılışta boş görünmesin.
// Çalıştırma: npm run seed   (tekrar çalıştırırsan mevcut demo hesapları ve grupları atlar.)
// Tüm demo hesapların şifresi: demo12345

const crypto = require('node:crypto');
const { prep, tx } = require('../server/db');
const { hashPassword } = require('../server/auth');

const PASSWORD = 'demo12345';
const now = Date.now();
const min = (n) => n * 60_000;

const USERS = [
  { u: 'efe', d: 'Efe', bio: 'Valorant main. Akşamları rank basarım.' },
  { u: 'zeynep', d: 'Zeynep', bio: 'Rahat oynarım, kazanmak şart değil.' },
  { u: 'kaan', d: 'Kaan', bio: 'CS2 rekabetçi. Takım içi iletişim şart.' },
  { u: 'derya', d: 'Derya', bio: 'Fortnite ve Apex. Duo ya da trio ararım.' },
  { u: 'mert', d: 'Mert', bio: 'PUBG Mobile, hafta sonu turnuva takımı kuruyorum.' },
  { u: 'ayse', d: 'Ayşe', bio: 'FC ve Rocket League. Sakin maçlar.' },
  { u: 'can', d: 'Can', bio: 'Dota 2 ve LoL. 5 kişilik tam takım arıyorum.' },
  { u: 'selin', d: 'Selin', bio: 'Valorant ve Overwatch. Yeni takım arkadaşları arıyorum.' },
  { u: 'burak', d: 'Burak', bio: 'Knight Online eski oyuncusu. Klan arıyorum.' },
  { u: 'alex_en', d: 'Alex', bio: 'English speaker living in Istanbul. Chill Valorant and CS2.' },
  { u: 'maria_de', d: 'Maria', bio: 'Spiele Overwatch und Minecraft. Deutsch / English.' },
];

// [a, b, istek yollayan] — accepted: karşılıklı arkadaş, pending: bekleyen istek
const FRIENDS = [
  ['efe', 'kaan', 'accepted'],
  ['efe', 'selin', 'accepted'],
  ['efe', 'can', 'accepted'],
  ['kaan', 'can', 'accepted'],
  ['selin', 'can', 'accepted'],
  ['derya', 'efe', 'pending'], // derya -> efe
  ['mert', 'efe', 'pending'], // mert -> efe
  ['efe', 'ayse', 'pending'], // efe -> ayse
];

// start: kaç dakika önce açıldı
const GAME_GROUPS = [
  { owner: 'efe', game: 'valorant', title: 'Gold takım arıyoruz, ciddi rank', desc: 'Akşam 21:00 sonrası, 2 saat oynarız.', max: 5, ago: 20, members: ['selin', 'kaan'] },
  { owner: 'kaan', game: 'cs2', title: 'Premier için 5. kişi lazım', desc: 'Rekabetçi. Sakin kafa.', max: 5, ago: 45, members: ['efe', 'alex_en', 'can'] },
  { owner: 'zeynep', game: 'minecraft', title: 'Hardcore dünya, rahat takılanlar', desc: 'Sunucu bende, herkes gelebilir.', max: 6, ago: 90, members: ['ayse'] },
  { owner: 'derya', game: 'apex', title: 'Trio arıyorum, ranked değil', desc: '', max: 3, ago: 15, members: [] },
  { owner: 'mert', game: 'pubg', title: 'Hafta sonu turnuva takımı', desc: 'Cumartesi 20:00. 4 kişilik takım.', max: 4, ago: 120, members: ['burak'] },
  { owner: 'can', game: 'dota2', title: '5 kişilik party, MMR fark etmez', desc: 'Eğlenceli maçlar.', max: 5, ago: 60, members: ['efe'] },
  { owner: 'alex_en', game: 'valorant', title: 'English-speaking Valorant squad', desc: 'Looking for 2 more chill players.', max: 4, ago: 30, members: ['selin'] },
  { owner: 'ayse', game: 'eafc', title: 'Pro Clubs için kaleci ve defans', desc: 'Haftada 3 gün akşam maçları.', max: 6, ago: 10, members: [] },
  { owner: 'maria_de', game: 'overwatch2', title: 'Support main sucht Tank', desc: 'Deutsch oder English. Gold+.', max: 5, ago: 75, members: ['selin', 'alex_en', 'efe', 'can'] },
];

const FRIEND_GROUPS = [
  { owner: 'efe', title: 'Gece Kuşları', desc: 'Geceleri oynayan ekip. Oyun fark etmez.', max: 20, members: ['kaan', 'can', 'selin'] },
  { owner: 'efe', title: 'Kapalı Devre', desc: 'Sabit Valorant takımı.', max: 6, members: ['selin'] },
];

// [kimden, mesaj] — sondan geriye doğru 5'er dakika arayla yerleştirilir
const MESSAGES = {
  'Gold takım arıyoruz, ciddi rank': [
    ['efe', 'Selam! 21:00 gibi başlıyoruz, hazır mısınız?'],
    ['selin', 'Hazırım, Sage veya Jett oynayabilirim.'],
    ['kaan', 'Ben yarım saat geç katılırım, olur mu?'],
    ['efe', 'Olur, ilk maçı ısınma sayarız.'],
  ],
  'Premier için 5. kişi lazım': [
    ['kaan', 'Mikrofonu olan biri varsa katılsın.'],
    ['alex_en', 'I can join, my Turkish is limited but I follow callouts.'],
    ['kaan', 'Sorun değil, callout\'lar İngilizce olsun.'],
  ],
  'Gece Kuşları': [
    ['kaan', 'Bu akşam kim var?'],
    ['can', 'Ben 22:00 gibi boşum.'],
    ['selin', 'Ben de varım, Valorant mı oynayalım?'],
    ['efe', 'Olur, 22:00\'de toplanalım 🎮'],
    ['kaan', 'Tamamdır, ben CS de atabilirim istersen'],
  ],
  'Kapalı Devre': [
    ['efe', 'Cumartesi scrim var, unutmayın.'],
    ['selin', 'Not aldım!'],
  ],
};

const DMS = [
  ['kaan', 'efe', [['kaan', 'Akşam Premier var mı?'], ['efe', 'Varım, 21:30 gibi gireyim.'], ['kaan', 'Süper, 5. kişiyi de ben bulurum.']]],
  ['selin', 'efe', [['selin', 'Dünkü maç çok iyiydi 😄'], ['selin', 'Bu hafta yine oynayalım mı?']]],
];

const userId = new Map();
const created = { users: 0, friends: 0, gameGroups: 0, friendGroups: 0, messages: 0 };

tx(() => {
  for (const u of USERS) {
    const existing = prep('SELECT id FROM users WHERE username = ?').get(u.u);
    if (existing) {
      userId.set(u.u, existing.id);
      continue;
    }
    const info = prep(
      'INSERT INTO users (username, display_name, password_hash, bio, langs, hours, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(u.u, u.d, hashPassword(PASSWORD), u.bio, 'tr', '', now - Math.floor(Math.random() * 7 * 86_400_000), now);
    userId.set(u.u, Number(info.lastInsertRowid));
    created.users++;
  }

  for (const [a, b, status] of FRIENDS) {
    const ia = userId.get(a);
    const ib = userId.get(b);
    const [x, y] = ia < ib ? [ia, ib] : [ib, ia];
    const res = prep(
      'INSERT OR IGNORE INTO friendships (user_a, user_b, requester_id, status, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(x, y, ia, status, now - 86_400_000);
    created.friends += Number(res.changes);
  }

  const addMember = (roomId, username, role = 'member') =>
    prep('INSERT OR IGNORE INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(
      roomId, userId.get(username), role, now - 60_000
    );
  const addRoom = (kind, game, title, desc, owner, isPublic, max, createdAt) =>
    Number(
      prep(
        `INSERT INTO rooms (kind, game_id, title, description, owner_id, is_public, invite_code, max_members, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
      ).run(kind, game, title, desc, userId.get(owner), isPublic, crypto.randomBytes(5).toString('hex'), max, createdAt).lastInsertRowid
    );
  const addMessages = (roomId, msgs) => {
    msgs.forEach(([who, body], i) => {
      prep('INSERT INTO messages (room_id, user_id, body, created_at) VALUES (?, ?, ?, ?)').run(
        roomId, userId.get(who), body, now - min((msgs.length - i) * 5)
      );
      created.messages++;
    });
  };

  for (const g of GAME_GROUPS) {
    if (prep("SELECT 1 AS x FROM rooms WHERE kind = 'lfg' AND title = ?").get(g.title)) continue;
    const id = addRoom('lfg', g.game, g.title, g.desc, g.owner, 1, g.max, now - min(g.ago));
    addMember(id, g.owner, 'owner');
    g.members.forEach((m) => addMember(id, m));
    if (MESSAGES[g.title]) addMessages(id, MESSAGES[g.title]);
    created.gameGroups++;
  }

  for (const g of FRIEND_GROUPS) {
    if (prep("SELECT 1 AS x FROM rooms WHERE kind = 'community' AND title = ?").get(g.title)) continue;
    const id = addRoom('community', null, g.title, g.desc, g.owner, 0, g.max, now - 86_400_000);
    addMember(id, g.owner, 'owner');
    g.members.forEach((m) => addMember(id, m));
    addMessages(id, MESSAGES[g.title] || []);
    created.friendGroups++;
  }

  for (const [a, b, msgs] of DMS) {
    const ia = userId.get(a);
    const ib = userId.get(b);
    const exists = prep(
      `SELECT 1 AS x FROM rooms r WHERE r.kind = 'dm'
         AND EXISTS (SELECT 1 FROM room_members m WHERE m.room_id = r.id AND m.user_id = ?)
         AND EXISTS (SELECT 1 FROM room_members m WHERE m.room_id = r.id AND m.user_id = ?)`
    ).get(ia, ib);
    if (exists) continue;
    const id = addRoom('dm', null, '', '', a, 0, 2, now - 3_600_000);
    addMember(id, a, 'owner');
    addMember(id, b);
    addMessages(id, msgs);
  }
});

console.log(
  `Demo verisi eklendi: ${created.users} oyuncu, ${created.friends} arkadaşlık kaydı, ${created.gameGroups} oyun grubu, ${created.friendGroups} arkadaş grubu, ${created.messages} mesaj.`
);
console.log(`Giriş için herhangi bir demo hesabı kullanabilirsin (örn. kullanıcı adı: efe, şifre: ${PASSWORD}).`);
