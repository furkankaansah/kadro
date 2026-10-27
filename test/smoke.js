'use strict';

// Uçtan uca duman testi: gerçek HTTP sunucusu + SSE ile kayıt, arkadaşlık, oyun grupları, sohbet, DM, arkadaş grupları, yetkiler.
// Çalıştırma: npm test

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-test-'));
process.env.ADMIN_USERNAMES = 'boss';
process.env.RATE_LIMIT_SCALE = '100'; // test çok sayıda hesap açıp giriş yapar
const { server } = require('../server/index.js');

let base = '';
let passed = 0;
const step = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err && err.stack ? err.stack : err}`);
    process.exitCode = 1;
    throw err;
  }
};

class Session {
  constructor(name) {
    this.name = name;
    this.cookie = '';
    this.clientId = '';
    this.events = [];
    this.waiters = [];
    this.abort = null;
  }

  async call(method, url, body, { expect } = {}) {
    const headers = { cookie: this.cookie };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.clientId) headers['x-client-id'] = this.clientId;
    const res = await fetch(base + '/api' + url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie?.() || [];
    const tok = set.find((c) => c.startsWith('kadro_token='));
    if (tok) this.cookie = tok.split(';')[0];
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* gövde yok */
    }
    if (expect !== undefined) assert.equal(res.status, expect, `${method} ${url} -> ${res.status} ${JSON.stringify(data)}`);
    return { status: res.status, data, headers: res.headers };
  }

  async openEvents() {
    this.abort = new AbortController();
    const res = await fetch(base + '/api/events', { headers: { cookie: this.cookie }, signal: this.abort.signal });
    assert.equal(res.status, 200);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            let event = 'message';
            let data = '';
            for (const line of block.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            if (!data) continue;
            const evt = { event, data: JSON.parse(data) };
            const w = this.waiters.findIndex((x) => x.name === event && x.pred(evt.data));
            if (w >= 0) this.waiters.splice(w, 1)[0].resolve(evt.data);
            else this.events.push(evt);
          }
        }
      } catch {
        /* bağlantı kapandı */
      }
    })();
    const hello = await this.waitFor('hello');
    this.clientId = hello.clientId;
  }

  waitFor(name, pred = () => true, timeout = 2500) {
    const idx = this.events.findIndex((e) => e.event === name && pred(e.data));
    if (idx >= 0) return Promise.resolve(this.events.splice(idx, 1)[0].data);
    return new Promise((resolve, reject) => {
      const entry = { name, pred, resolve };
      this.waiters.push(entry);
      setTimeout(() => {
        const i = this.waiters.indexOf(entry);
        if (i >= 0) {
          this.waiters.splice(i, 1);
          reject(new Error(`[${this.name}] "${name}" olayı ${timeout}ms içinde gelmedi`));
        }
      }, timeout).unref();
    });
  }

  close() {
    this.abort?.abort();
  }
}

function rawGet(pathname) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method: 'GET' }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

// E-posta gönderici ayarlı olmadığından doğrulama e-postaları DATA_DIR/outbox içine düşer; kodu oradan okuruz.
function outboxMail(email) {
  const dir = path.join(process.env.DATA_DIR, 'outbox');
  const tail = `-${email.replace(/[^a-z0-9@._-]/gi, '_')}.txt`;
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(tail)).sort() : [];
  assert.ok(files.length, `${email} için e-posta bulunamadı`);
  const text = fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8');
  return {
    text,
    code: (/^(\d{6})$/m.exec(text) || [])[1],
    token: (/(?:token|reset)=([A-Za-z0-9_-]+)/.exec(text) || [])[1],
    count: files.length,
  };
}
/** Kayıt olur, e-postadaki kodla doğrular. */
async function signUp(session, username, extra = {}) {
  const email = `${username}@example.com`;
  const r = await session.call('POST', '/auth/register', { username, password: 'password123', email, acceptTerms: true, ...extra }, { expect: 201 });
  await session.call('POST', '/auth/verify', { code: outboxMail(email).code }, { expect: 200 });
  return r;
}

async function main() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  console.log(`Test sunucusu: ${base}`);

  const { prep } = require('../server/db');
  const alice = new Session('alice');
  const bob = new Session('bob');
  const carol = new Session('carol');
  const dan = new Session('dan');
  let game; // alice'in Valorant grubu
  let dmId;

  await step('oyun listesi ve istatistikler', async () => {
    const g = await alice.call('GET', '/games', undefined, { expect: 200 });
    assert.ok(g.data.games.length >= 15);
    assert.ok(g.data.games.find((x) => x.id === 'valorant' && x.short));
    const s = await alice.call('GET', '/stats', undefined, { expect: 200 });
    assert.equal(s.data.openGroups, 0);
    // sesli oda ve eşleşme kaldırıldı
    await alice.call('GET', '/match', undefined, { expect: 404 });
    await alice.call('POST', '/voice/join', {}, { expect: 404 });
  });

  await step('kayıt, giriş ve doğrulamalar', async () => {
    const mail = 'x@example.com';
    await alice.call('POST', '/auth/register', { username: 'ab', password: 'longenough1', email: mail, acceptTerms: true }, { expect: 400 });
    await alice.call('POST', '/auth/register', { username: 'alice', password: 'short', email: mail, acceptTerms: true }, { expect: 400 });
    const r = await signUp(alice, 'alice', { displayName: 'Alice' });
    assert.equal(r.data.user.username, 'alice');
    assert.equal(r.data.user.emailVerified, false, 'kayıt anında doğrulanmamış');
    assert.ok(alice.cookie.startsWith('kadro_token='));
    await signUp(bob, 'bob');
    await signUp(carol, 'carol');
    await signUp(dan, 'dan');
    await alice.call('POST', '/auth/register', { username: 'ALICE', password: 'password123', email: 'baska@example.com', acceptTerms: true }, { expect: 409 });
    const anon = new Session('anon');
    await anon.call('POST', '/auth/login', { username: 'alice', password: 'wrong-password' }, { expect: 401 });
    const me = await alice.call('GET', '/me', undefined, { expect: 200 });
    assert.equal(me.data.user.displayName, 'Alice');
    assert.equal(me.data.user.email, 'alice@example.com');
    assert.equal(me.data.user.emailVerified, true);
    assert.equal((await anon.call('GET', '/me', undefined, { expect: 200 })).data.user, null);
    await anon.call('GET', '/chats', undefined, { expect: 401 });
    await anon.call('GET', '/friends', undefined, { expect: 401 });
    await alice.call('PATCH', '/me', { bio: 'Akşamları oynarım', displayName: '   ' }, { expect: 400 });
    const p = await alice.call('PATCH', '/me', { bio: 'Akşamları oynarım' }, { expect: 200 });
    assert.equal(p.data.user.bio, 'Akşamları oynarım');
  });

  await step('e-posta doğrulama: zorunlu e-posta, kod, bağlantı, kısıtlar', async () => {
    const anon = new Session('anon');
    // e-posta zorunlu ve geçerli olmalı, benzersiz olmalı (büyük/küçük harf fark etmez)
    await anon.call('POST', '/auth/register', { username: 'frank', password: 'password123', acceptTerms: true }, { expect: 400 });
    await anon.call('POST', '/auth/register', { username: 'frank', password: 'password123', email: 'yanlis', acceptTerms: true }, { expect: 400 });
    await anon.call('POST', '/auth/register', { username: 'frank', password: 'password123', email: 'a@b', acceptTerms: true }, { expect: 400 });
    // şifre tekrarı uyuşmalı
    const mis = await anon.call('POST', '/auth/register', { username: 'frank', password: 'password123', passwordConfirm: 'password124', email: 'frank@example.com', acceptTerms: true }, { expect: 400 });
    assert.equal(mis.data.error, 'password_mismatch');
    const dup = await anon.call('POST', '/auth/register', { username: 'frank', password: 'password123', email: 'ALICE@Example.com', acceptTerms: true }, { expect: 409 });
    assert.equal(dup.data.error || dup.data.code, 'email_taken');

    // yeni hesap: doğrulanana kadar yazma işlemleri kapalı, okuma açık
    const frank = new Session('frank');
    const reg = await frank.call('POST', '/auth/register', { username: 'frank', password: 'password123', email: 'Frank@Example.com', lang: 'en', acceptTerms: true }, { expect: 201 });
    assert.equal(reg.data.user.emailVerified, false);
    assert.equal(reg.data.user.email, 'frank@example.com', 'e-posta küçük harfe çevrilir');
    assert.ok(!JSON.stringify(reg.data).includes('hash'), 'özetler yanıtta olmamalı');
    const m1 = outboxMail('frank@example.com');
    assert.match(m1.text, /verify your email/i, 'Accept: lang=en ise İngilizce e-posta');
    assert.ok(m1.code && m1.token, 'e-postada kod ve bağlantı anahtarı var');
    assert.match(m1.text, /\/api\/auth\/verify\?token=/);
    await frank.call('GET', '/games', undefined, { expect: 200 });
    await frank.call('GET', '/chats', undefined, { expect: 200 });
    for (const [method, url, body] of [
      ['POST', '/groups', { kind: 'lfg', gameId: 'valorant', title: 'Deneme grubu', maxMembers: 4 }],
      ['POST', '/friends', { username: 'alice' }],
      ['POST', '/dm/alice', {}],
      ['POST', '/groups/join-by-code', { code: 'abcdef0123' }],
      ['POST', '/groups/1/join', {}],
      ['POST', '/groups/1/messages', { body: 'selam' }],
    ]) {
      const res = await frank.call(method, url, body, { expect: 403 });
      assert.equal(res.data.error || res.data.code, 'email_unverified', `${method} ${url}`);
    }

    // yanlış kod 5 kez: kilitlenir, doğru kod bile geçmez; yeni kod ancak yeni gönderimle gelir
    const wrong = m1.code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) await frank.call('POST', '/auth/verify', { code: wrong }, { expect: 400 });
    await frank.call('POST', '/auth/verify', { code: wrong }, { expect: 429 });
    await frank.call('POST', '/auth/verify', { code: m1.code }, { expect: 429 });
    // hemen yeniden gönderme (1 dk aralık) reddedilir
    await frank.call('POST', '/auth/resend-verification', {}, { expect: 429 });
    // yanlış yazılmış e-posta düzeltilir: yeni adrese yeni kod gider, eskisi geçersiz olur
    await frank.call('POST', '/auth/change-email', { email: 'bozuk' }, { expect: 400 });
    await frank.call('POST', '/auth/change-email', { email: 'alice@example.com' }, { expect: 409 });
    const ch = await frank.call('POST', '/auth/change-email', { email: 'frank2@example.com' }, { expect: 200 });
    assert.equal(ch.data.user.email, 'frank2@example.com');
    const m2 = outboxMail('frank2@example.com');
    assert.notEqual(m2.code, m1.code);
    await frank.call('POST', '/auth/verify', { code: wrong }, { expect: 400 });
    await frank.call('POST', '/auth/verify', { code: m2.code }, { expect: 200 });
    const after = await frank.call('GET', '/me', undefined, { expect: 200 });
    assert.equal(after.data.user.emailVerified, true);
    await frank.call('POST', '/auth/change-email', { email: 'x@example.com' }, { expect: 409 }); // doğrulanmış hesapta değişmez
    await frank.call('POST', '/groups', { kind: 'lfg', gameId: 'valorant', title: 'Frank grubu', maxMembers: 4 }, { expect: 201 });

    // e-postadaki bağlantı (tek tıkla): doğrular ve ana sayfaya yönlendirir; tek kullanımlık
    const gina = new Session('gina');
    await gina.call('POST', '/auth/register', { username: 'gina', password: 'password123', email: 'gina@example.com', acceptTerms: true }, { expect: 201 });
    const link = outboxMail('gina@example.com');
    const bogus = await fetch(base + '/api/auth/verify?token=' + 'x'.repeat(32), { redirect: 'manual' });
    assert.equal(bogus.status, 302);
    assert.equal(bogus.headers.get('location'), '/?verified=0');
    const okRes = await fetch(base + '/api/auth/verify?token=' + link.token, { redirect: 'manual' });
    assert.equal(okRes.status, 302);
    assert.equal(okRes.headers.get('location'), '/?verified=1');
    assert.equal((await gina.call('GET', '/me')).data.user.emailVerified, true);
    const again = await fetch(base + '/api/auth/verify?token=' + link.token, { redirect: 'manual' });
    assert.equal(again.headers.get('location'), '/?verified=0', 'bağlantı ikinci kez çalışmaz');

    // başkalarının e-postası hiçbir yerde görünmez; e-postasız eski hesaplar kısıtlanmaz
    const pub = await anon.call('GET', '/users/frank', undefined, { expect: 200 });
    assert.equal(pub.data.user.email, undefined);
    const found = await alice.call('GET', '/users/search?q=frank', undefined, { expect: 200 });
    assert.ok(!JSON.stringify(found.data).includes('@example.com'));
    prep("UPDATE users SET email = NULL, email_verified = 1 WHERE username = 'gina'").run();
    assert.equal((await gina.call('GET', '/me')).data.user.emailVerified, true);
    prep("DELETE FROM users WHERE username IN ('frank', 'gina')").run();
  });

  await step('şifre sıfırlama ve şifre değiştirme', async () => {
    const anon = new Session('anon');
    const rita = new Session('rita');
    await signUp(rita, 'rita');
    const oldCookie = rita.cookie;
    // adres kayıtlı olsun olmasın aynı yanıt; e-posta sadece kayıtlıya gider
    await anon.call('POST', '/auth/forgot', { email: 'yanlis' }, { expect: 400 });
    const none = await anon.call('POST', '/auth/forgot', { email: 'yok@example.com' }, { expect: 200 });
    assert.deepEqual(none.data, { ok: true });
    assert.ok(!fs.existsSync(path.join(process.env.DATA_DIR, 'outbox')) || !fs.readdirSync(path.join(process.env.DATA_DIR, 'outbox')).some((f) => f.includes('yok@example.com')), 'kayıtsız adrese e-posta gitmemeli');
    const known = await anon.call('POST', '/auth/forgot', { email: 'RITA@example.com', lang: 'en' }, { expect: 200 });
    assert.deepEqual(known.data, none.data, 'kayıtlı ve kayıtsız adreste yanıt aynı');
    const m = outboxMail('rita@example.com');
    assert.match(m.text, /reset code/i);
    assert.match(m.text, /\/\?reset=/);
    const filesBefore = m.count;
    await anon.call('POST', '/auth/forgot', { email: 'rita@example.com' }, { expect: 200 }); // 1 dk içinde ikinci istek: yanıt aynı, yeni e-posta yok
    assert.equal(outboxMail('rita@example.com').count, filesBefore, 'hız sınırı: ikinci e-posta gitmemeli');

    // geçersiz şifre/uyuşmayan tekrar kodu harcatmaz; yanlış kod reddedilir
    await anon.call('POST', '/auth/reset', { email: 'rita@example.com', code: m.code, password: 'kisa' }, { expect: 400 });
    await anon.call('POST', '/auth/reset', { email: 'rita@example.com', code: m.code, password: 'yeni-sifre-1', passwordConfirm: 'yeni-sifre-2' }, { expect: 400 });
    const wrong = m.code === '000000' ? '111111' : '000000';
    await anon.call('POST', '/auth/reset', { email: 'rita@example.com', code: wrong, password: 'yeni-sifre-1' }, { expect: 400 });
    await anon.call('POST', '/auth/reset', { email: 'yok@example.com', code: wrong, password: 'yeni-sifre-1' }, { expect: 400 });
    const ok = await anon.call('POST', '/auth/reset', { email: 'rita@example.com', code: m.code, password: 'yeni-sifre-1', passwordConfirm: 'yeni-sifre-1' }, { expect: 200 });
    assert.equal(ok.data.user.username, 'rita');
    assert.ok(anon.cookie.startsWith('kadro_token='), 'sıfırlayınca giriş yapılır');
    // eski şifre geçmez, yenisi geçer; eski oturum çerezi düşer
    await anon.call('POST', '/auth/login', { username: 'rita', password: 'password123' }, { expect: 401 });
    await anon.call('POST', '/auth/login', { username: 'rita', password: 'yeni-sifre-1' }, { expect: 200 });
    const stale = await fetch(base + '/api/me', { headers: { cookie: oldCookie } });
    assert.equal((await stale.json()).user, null, 'şifre değişince eski oturum kapanır');
    // kod tek kullanımlık
    await anon.call('POST', '/auth/reset', { email: 'rita@example.com', code: m.code, password: 'baska-sifre-1' }, { expect: 400 });

    // bağlantı anahtarıyla sıfırlama (tek kullanımlık)
    const sam = new Session('sam');
    await signUp(sam, 'sam');
    prep("UPDATE users SET reset_sent_at = 0 WHERE username = 'sam'").run();
    await anon.call('POST', '/auth/forgot', { email: 'sam@example.com' }, { expect: 200 });
    const ms = outboxMail('sam@example.com');
    assert.ok(ms.token && ms.token.length > 20);
    await anon.call('POST', '/auth/reset', { token: 'x'.repeat(30), password: 'yeni-sifre-1' }, { expect: 400 });
    const viaLink = new Session('sam2');
    await viaLink.call('POST', '/auth/reset', { token: ms.token, password: 'yeni-sifre-1', passwordConfirm: 'yeni-sifre-1' }, { expect: 200 });
    await anon.call('POST', '/auth/reset', { token: ms.token, password: 'baska-sifre-1' }, { expect: 400 });
    await viaLink.call('POST', '/auth/login', { username: 'sam', password: 'yeni-sifre-1' }, { expect: 200 });

    // 5 yanlış kod: kilitlenir
    prep("UPDATE users SET reset_sent_at = 0 WHERE username = 'sam'").run();
    await anon.call('POST', '/auth/forgot', { email: 'sam@example.com' }, { expect: 200 });
    const m3 = outboxMail('sam@example.com');
    const w3 = m3.code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) await anon.call('POST', '/auth/reset', { email: 'sam@example.com', code: w3, password: 'yeni-sifre-2' }, { expect: 400 });
    await anon.call('POST', '/auth/reset', { email: 'sam@example.com', code: w3, password: 'yeni-sifre-2' }, { expect: 429 });
    await anon.call('POST', '/auth/reset', { email: 'sam@example.com', code: m3.code, password: 'yeni-sifre-2' }, { expect: 429 });

    // giriş yapmışken şifre değiştirme: mevcut şifre şart, diğer oturumlar kapanır
    const ritaB = new Session('rita2');
    await ritaB.call('POST', '/auth/login', { username: 'rita', password: 'yeni-sifre-1' }, { expect: 200 });
    const bCookie = ritaB.cookie;
    await new Session('nobody').call('POST', '/auth/change-password', { current: 'x', password: 'bambaska-1' }, { expect: 401 });
    await ritaB.call('POST', '/auth/change-password', { current: 'yanlis-mevcut', password: 'bambaska-1' }, { expect: 403 });
    await ritaB.call('POST', '/auth/change-password', { current: 'yeni-sifre-1', password: 'kisa' }, { expect: 400 });
    await ritaB.call('POST', '/auth/change-password', { current: 'yeni-sifre-1', password: 'bambaska-1', passwordConfirm: 'bambaska-1' }, { expect: 200 });
    assert.notEqual(ritaB.cookie, bCookie, 'yeni çerez verilir');
    assert.equal((await ritaB.call('GET', '/me')).data.user.username, 'rita', 'değiştiren oturum açık kalır');
    await anon.call('POST', '/auth/login', { username: 'rita', password: 'yeni-sifre-1' }, { expect: 401 });
    await anon.call('POST', '/auth/login', { username: 'rita', password: 'bambaska-1' }, { expect: 200 });
    prep("DELETE FROM users WHERE username IN ('rita', 'sam')").run();
  });

  await step('moderasyon: şartlar, engelleme, şikâyet, yasaklama, yönetici, hesap silme', async () => {
    const anon = new Session('anon');
    await anon.call('POST', '/auth/register', { username: 'nouser', password: 'password123', email: 'nouser@example.com' }, { expect: 400 }).then((r) => assert.equal(r.data.error, 'terms_required'));
    const boss = new Session('boss');
    const vic1 = new Session('vic1');
    const vic2 = new Session('vic2');
    const spam = new Session('spam');
    for (const [s2, n] of [[boss, 'boss'], [vic1, 'vic1'], [vic2, 'vic2'], [spam, 'spam']]) await signUp(s2, n);
    assert.equal((await boss.call('GET', '/me')).data.user.isAdmin, true);
    assert.equal((await vic1.call('GET', '/me')).data.user.isAdmin, false);
    await vic1.call('GET', '/admin/summary', undefined, { expect: 403 });
    await vic1.call('GET', '/admin/reports', undefined, { expect: 403 });
    await vic1.call('POST', '/admin/users/spam/ban', { reason: 'x' }, { expect: 403 });
    await anon.call('GET', '/admin/summary', undefined, { expect: 401 });
    assert.ok((await boss.call('GET', '/admin/summary', undefined, { expect: 200 })).data.users >= 4);

    const befriend = async (a, an, b, bn) => {
      await a.call('POST', '/friends', { username: bn }, { expect: 201 });
      await b.call('POST', `/friends/${an}/accept`, {}, { expect: 200 });
    };
    await befriend(spam, 'spam', vic1, 'vic1');
    await befriend(vic2, 'vic2', vic1, 'vic1');

    // ortak grup: spam ve vic1 konuşur
    const grp = (await vic2.call('POST', '/groups', { kind: 'lfg', gameId: 'valorant', title: 'Moderasyon grubu', maxMembers: 6 }, { expect: 201 })).data.group;
    await spam.call('POST', `/groups/${grp.id}/join`, {}, { expect: 200 });
    await vic1.call('POST', `/groups/${grp.id}/join`, {}, { expect: 200 });
    const spamMsg = (await spam.call('POST', `/groups/${grp.id}/messages`, { body: 'ucuz item satıyorum linke tıkla' }, { expect: 201 })).data.message;
    await vic2.call('POST', `/groups/${grp.id}/messages`, { body: 'selam' }, { expect: 201 });
    assert.equal((await vic1.call('GET', `/groups/${grp.id}/messages`)).data.messages.length, 2);

    // şikâyetler (engellemeden önce, kanıt kaydedilsin)
    await vic1.call('POST', '/reports', { kind: 'user', username: 'spam', reason: 'uydurma' }, { expect: 400 });
    await vic1.call('POST', '/reports', { kind: 'user', username: 'vic1', reason: 'spam' }, { expect: 400 }); // kendini şikâyet
    await vic1.call('POST', '/reports', { kind: 'user', username: 'spam', reason: 'spam', details: 'reklam yapıyor' }, { expect: 201 });
    await vic1.call('POST', '/reports', { kind: 'user', username: 'spam', reason: 'spam' }, { expect: 409 }); // aynı şikâyet tekrar edilmez
    await vic1.call('POST', '/reports', { kind: 'message', messageId: spamMsg.id, reason: 'spam' }, { expect: 201 });
    await vic1.call('POST', '/reports', { kind: 'group', groupId: grp.id, reason: 'inappropriate' }, { expect: 201 });
    await new Session('x').call('POST', '/reports', { kind: 'user', username: 'spam', reason: 'spam' }, { expect: 401 });
    await boss.call('POST', '/reports', { kind: 'message', messageId: spamMsg.id, reason: 'spam' }, { expect: 403 }); // grup üyesi olmayan mesaj şikâyet edemez

    // engelleme
    await vic1.call('POST', '/blocks', { username: 'vic1' }, { expect: 400 });
    const blk = await vic1.call('POST', '/blocks', { username: 'spam' }, { expect: 200 });
    assert.equal(blk.data.blocked.length, 1);
    assert.equal((await vic1.call('GET', '/friends')).data.friends.filter((f) => f.username === 'spam').length, 0, 'engelleyince arkadaşlık biter');
    await spam.call('POST', '/friends', { username: 'vic1' }, { expect: 404 });
    await spam.call('GET', '/users/vic1', undefined, { expect: 404 });
    assert.equal((await spam.call('GET', '/users/search?q=vic1')).data.users.length, 0, 'engelleyen aramada görünmez');
    assert.equal((await vic1.call('GET', '/users/search?q=spam')).data.users.length, 0);
    assert.equal((await vic1.call('GET', '/users/spam')).data.user.blocked, true);
    await spam.call('POST', '/dm/vic1', {}, { expect: 403 });
    // grup sohbetinde engellenenin mesajı engelleyene görünmez, diğerlerine görünür
    const seen = (await vic1.call('GET', `/groups/${grp.id}/messages`)).data.messages.map((m) => m.username);
    assert.deepEqual(seen, ['vic2']);
    assert.equal((await vic2.call('GET', `/groups/${grp.id}/messages`)).data.messages.length, 2);
    const chats = (await vic1.call('GET', '/chats')).data.chats.find((c) => c.id === grp.id);
    assert.equal(chats.last.displayName, 'vic2', 'son mesaj önizlemesinde engelli yok');
    assert.equal((await vic1.call('GET', '/blocks')).data.users[0].username, 'spam');
    // engeli kaldır
    const ub = await vic1.call('DELETE', '/blocks/spam', undefined, { expect: 200 });
    assert.equal(ub.data.blocked.length, 0);
    assert.equal((await vic1.call('GET', `/groups/${grp.id}/messages`)).data.messages.length, 2);
    await vic1.call('POST', '/blocks', { username: 'spam' }, { expect: 200 }); // tekrar engelle (sonraki testler için)
    await vic1.call('POST', '/blocks', { username: 'spam' }, { expect: 200 }); // tekrar engellemek hata vermez

    // yönetici paneli
    const open = (await boss.call('GET', '/admin/reports?status=open', undefined, { expect: 200 })).data.reports;
    assert.equal(open.length, 3);
    const msgRep = open.find((r) => r.kind === 'message');
    assert.equal(msgRep.snapshot.message.body, 'ucuz item satıyorum linke tıkla');
    assert.ok(Array.isArray(msgRep.snapshot.context));
    assert.equal(msgRep.targetUsername, 'spam');
    assert.equal(msgRep.targetReportCount, 2); // spam hakkında: kullanıcı + mesaj şikâyeti
    const found = (await boss.call('GET', '/admin/users?q=spam')).data.users.find((u) => u.username === 'spam');
    assert.equal(found.email, 'spam@example.com');
    assert.equal(found.reportCount, 2);
    // mesajı sil
    await boss.call('POST', `/admin/reports/${msgRep.id}/resolve`, { action: 'delete_message', note: 'reklam' }, { expect: 200 });
    assert.equal((await vic2.call('GET', `/groups/${grp.id}/messages`)).data.messages.length, 1);
    // yasakla: diğer açık şikâyetler de kapanır, oturum düşer, giriş reddedilir (sebep söylenir)
    const userRep = open.find((r) => r.kind === 'user');
    await boss.call('POST', `/admin/reports/${userRep.id}/resolve`, { action: 'ban', note: 'reklam spamı' }, { expect: 200 });
    assert.equal((await boss.call('GET', '/admin/reports?status=open')).data.reports.length, 1, 'yasaklayınca aynı kişinin açık şikâyetleri kapandı');
    assert.equal((await spam.call('GET', '/me')).data.user, null, 'yasaklının oturumu anında düşer');
    const bl = await new Session('x').call('POST', '/auth/login', { username: 'spam', password: 'password123' }, { expect: 403 });
    assert.equal(bl.data.error, 'banned');
    assert.equal(bl.data.reason, 'reklam spamı');
    await new Session('x').call('POST', '/auth/login', { username: 'spam', password: 'yanlis' }, { expect: 401 }); // yanlış şifre yasak bilgisini sızdırmaz
    assert.equal((await vic1.call('GET', '/blocks')).data.users.length, 1, 'engel listesi yasaklı olsa da görünür (kaldırılabilsin)');
    assert.equal((await anon.call('GET', '/users/spam')).status, 404, 'yasaklının profili herkese kapalı');
    // yönetici kendini / başka yöneticiyi yasaklayamaz
    await boss.call('POST', '/admin/users/boss/ban', { reason: 'x' }, { expect: 403 });
    // yasağı kaldır
    await boss.call('POST', '/admin/users/spam/unban', {}, { expect: 200 });
    await spam.call('POST', '/auth/login', { username: 'spam', password: 'password123' }, { expect: 200 });
    // grubu sil
    const grpRep = (await boss.call('GET', '/admin/reports?status=open')).data.reports[0];
    assert.equal(grpRep.kind, 'group');
    await boss.call('POST', `/admin/reports/${grpRep.id}/resolve`, { action: 'delete_group' }, { expect: 200 });
    await vic2.call('GET', `/groups/${grp.id}`, undefined, { expect: 404 });
    await boss.call('POST', `/admin/reports/${grpRep.id}/resolve`, { action: 'nope' }, { expect: 400 });
    assert.ok((await boss.call('GET', '/admin/log')).data.log.length >= 4, 'yönetici işlemleri kayıtta');
    assert.equal((await boss.call('GET', '/admin/reports?status=closed')).data.reports.length, 3);

    // hesabı silme: şifre ister, sahibi olduğu arkadaş grubu diğer üyeye geçer, birebir mesajlaşma silinir
    const fg = (await vic2.call('POST', '/groups', { kind: 'community', title: 'Kalıcı ekip', maxMembers: 5 }, { expect: 201 })).data.group;
    await vic2.call('POST', `/groups/${fg.id}/members`, { username: 'vic1' }, { expect: 200 });
    const dm = (await vic2.call('POST', '/dm/vic1', {}, { expect: 200 })).data.groupId;
    await vic2.call('POST', `/groups/${fg.id}/messages`, { body: 'silinecek mesaj' }, { expect: 201 });
    await vic2.call('POST', '/me/delete', { password: 'yanlis' }, { expect: 403 });
    await boss.call('POST', '/me/delete', { password: 'password123' }, { expect: 403 }); // yönetici önce yetkisini bırakmalı
    const del = await vic2.call('POST', '/me/delete', { password: 'password123' }, { expect: 200 });
    assert.match(del.headers.get('set-cookie') || '', /Max-Age=0/);
    assert.equal(prep("SELECT COUNT(*) AS c FROM users WHERE username = 'vic2'").get().c, 0);
    await new Session('x').call('POST', '/auth/login', { username: 'vic2', password: 'password123' }, { expect: 401 });
    const g2 = (await vic1.call('GET', `/groups/${fg.id}`, undefined, { expect: 200 })).data;
    assert.equal(g2.group.owner.username, 'vic1', 'sahiplik kalan üyeye geçti');
    assert.equal(g2.group.memberCount, 1);
    await vic1.call('GET', `/groups/${dm}/messages`, undefined, { expect: 403 }); // birebir mesajlaşma silindi
    assert.equal(prep("SELECT COUNT(*) AS c FROM messages WHERE body = 'silinecek mesaj'").get().c, 0, 'silinen kullanıcının mesajları da silinir');
    assert.equal(prep('SELECT COUNT(*) AS c FROM reports WHERE target_username = ?').get('spam').c, 2, 'şikâyet kayıtları kalır');
    prep("DELETE FROM users WHERE username IN ('boss', 'vic1', 'spam')").run();
  });

  await step('kullanıcı arama ve profil', async () => {
    const anon = new Session('anon');
    await anon.call('GET', '/users/search?q=bo', undefined, { expect: 401 });
    assert.deepEqual((await alice.call('GET', '/users/search?q=b', undefined, { expect: 200 })).data.users, []);
    const s = await alice.call('GET', '/users/search?q=bo', undefined, { expect: 200 });
    assert.equal(s.data.users.length, 1);
    assert.equal(s.data.users[0].username, 'bob');
    assert.equal(s.data.users[0].relation, 'none');
    assert.equal(s.data.users[0].password_hash, undefined);
    const self = await alice.call('GET', '/users/search?q=alice');
    assert.equal(self.data.users.length, 0, 'kendini aramada görmemeli');
    const pub = await anon.call('GET', '/users/alice', undefined, { expect: 200 });
    assert.equal(pub.data.user.bio, 'Akşamları oynarım');
    assert.equal(pub.data.user.relation, undefined);
    assert.equal((await bob.call('GET', '/users/alice')).data.user.relation, 'none');
    await anon.call('GET', '/users/yokkimse', undefined, { expect: 404 });
  });

  await step('canlı bağlantılar açılır', async () => {
    for (const s of [alice, bob, carol, dan]) await s.openEvents();
  });

  await step('arkadaşlık: istek, kabul, red, geri çekme, çıkarma', async () => {
    await alice.call('POST', '/friends', { username: 'alice' }, { expect: 400 });
    await alice.call('POST', '/friends', { username: 'yokkimse' }, { expect: 404 });
    await alice.call('POST', '/friends', { username: 'bob' }, { expect: 201 });
    const req = await bob.waitFor('friend:request');
    assert.equal(req.user.username, 'alice');
    await alice.call('POST', '/friends', { username: 'bob' }, { expect: 409 });
    assert.equal((await alice.call('GET', '/users/bob')).data.user.relation, 'outgoing');
    assert.equal((await bob.call('GET', '/users/alice')).data.user.relation, 'incoming');
    const bl = await bob.call('GET', '/friends', undefined, { expect: 200 });
    assert.equal(bl.data.incoming.length, 1);
    const al = await alice.call('GET', '/friends');
    assert.equal(al.data.outgoing.length, 1);
    // yanlış taraf kabul edemez
    await alice.call('POST', '/friends/bob/accept', {}, { expect: 404 });
    await bob.call('POST', '/friends/alice/accept', {}, { expect: 200 });
    const acc = await alice.waitFor('friend:accepted');
    assert.equal(acc.user.username, 'bob');
    assert.equal(acc.user.online, true);
    await alice.call('POST', '/friends', { username: 'bob' }, { expect: 409 });
    assert.equal((await alice.call('GET', '/friends')).data.friends[0].username, 'bob');
    // carol -> alice isteği reddedilir; dan -> alice geri çekilir
    await carol.call('POST', '/friends', { username: 'alice' }, { expect: 201 });
    await alice.waitFor('friend:request');
    await alice.call('POST', '/friends/carol/decline', {}, { expect: 200 });
    assert.equal((await carol.call('GET', '/users/alice')).data.user.relation, 'none');
    await dan.call('POST', '/friends', { username: 'alice' }, { expect: 201 });
    await alice.waitFor('friend:request');
    await dan.call('DELETE', '/friends/alice', undefined, { expect: 200 });
    assert.equal((await alice.call('GET', '/friends')).data.incoming.length, 0);
    // karşılıklı istek direkt arkadaşlık olur
    await alice.call('POST', '/friends', { username: 'carol' }, { expect: 201 });
    await carol.call('POST', '/friends', { username: 'alice' }, { expect: 200 });
    assert.equal((await alice.call('GET', '/users/carol')).data.user.relation, 'friend');
    // çevrimiçi durumu arkadaşlara yayılır
    const bobId = (await alice.call('GET', '/friends')).data.friends.find((f) => f.username === 'bob').id;
    bob.close();
    const off = await alice.waitFor('presence', (d) => d.userId === bobId && d.online === false);
    assert.equal(off.online, false);
    await bob.openEvents();
    const on = await alice.waitFor('presence', (d) => d.userId === bobId && d.online === true);
    assert.equal(on.online, true);
  });

  await step('oyun grubu: açma, listeleme, doğrulamalar', async () => {
    await alice.call('POST', '/groups', { title: 'x', gameId: 'valorant' }, { expect: 400 });
    await alice.call('POST', '/groups', { title: 'Rank atacak takım', gameId: 'nope' }, { expect: 400 });
    await alice.call('POST', '/groups', { title: 'Rank atacak takım' }, { expect: 400 });
    const r = await alice.call('POST', '/groups', { gameId: 'valorant', title: 'Gold takım arıyoruz', description: 'Sakin kafa', maxMembers: 3 }, { expect: 201 });
    game = r.data.group;
    assert.equal(game.kind, 'lfg');
    assert.equal(game.memberCount, 1);
    assert.equal(game.isMember, true);
    assert.equal(game.inviteCode, undefined, 'oyun grubunda davet kodu gösterilmez');
    const list = await bob.call('GET', '/groups?game=valorant', undefined, { expect: 200 });
    assert.equal(list.data.groups.length, 1);
    assert.equal(list.data.groups[0].isMember, false);
    assert.equal(list.data.groups[0].members[0].username, 'alice');
    assert.equal((await bob.call('GET', '/groups?game=cs2')).data.groups.length, 0);
    assert.equal((await bob.call('GET', '/groups?game=valorant&q=gold')).data.groups.length, 1);
    assert.equal((await bob.call('GET', '/groups?game=valorant&q=yokyok')).data.groups.length, 0);
    const stats = await bob.call('GET', '/stats');
    assert.equal(stats.data.openGroups, 1);
    assert.equal(stats.data.byGame.valorant, 1);
    // sınır: aynı anda en fazla 3 aktif oyun grubu
    await alice.call('POST', '/groups', { gameId: 'cs2', title: 'CS grup bir' }, { expect: 201 });
    await alice.call('POST', '/groups', { gameId: 'cs2', title: 'CS grup iki' }, { expect: 201 });
    await alice.call('POST', '/groups', { gameId: 'cs2', title: 'CS grup üç' }, { expect: 429 });
  });

  await step('katılma, doluluk ve canlı üye olayları', async () => {
    await bob.call('POST', '/groups/' + game.id + '/join', {}, { expect: 200 });
    const joined = await alice.waitFor('member:joined', (d) => d.user.username === 'bob');
    assert.equal(joined.roomId, game.id);
    await carol.call('POST', '/groups/' + game.id + '/join', {}, { expect: 200 });
    await dan.call('POST', '/groups/' + game.id + '/join', {}, { expect: 409 });
    const detail = await dan.call('GET', '/groups/' + game.id, undefined, { expect: 200 });
    assert.equal(detail.data.group.full, true);
    assert.equal(detail.data.members.length, 3);
    const anon = new Session('anon');
    await anon.call('GET', '/groups/' + game.id, undefined, { expect: 200 });
    await anon.call('POST', '/groups/' + game.id + '/join', {}, { expect: 401 });
  });

  await step('yazılı sohbet: gönderme, yayın, geçmiş, yetki', async () => {
    await bob.call('POST', '/groups/' + game.id + '/messages', { body: '   ' }, { expect: 400 });
    const sent = await bob.call('POST', '/groups/' + game.id + '/messages', { body: 'Selam <b>herkese</b>' }, { expect: 201 });
    const got = await alice.waitFor('chat:message', (d) => d.id === sent.data.message.id);
    assert.equal(got.body, 'Selam <b>herkese</b>');
    assert.equal(got.username, 'bob');
    assert.equal(got.kind, 'lfg');
    const hist = await alice.call('GET', '/groups/' + game.id + '/messages', undefined, { expect: 200 });
    assert.equal(hist.data.messages.length, 1);
    await dan.call('POST', '/groups/' + game.id + '/messages', { body: 'içeri girdim' }, { expect: 403 });
    await dan.call('GET', '/groups/' + game.id + '/messages', undefined, { expect: 403 });
    await bob.call('POST', '/groups/' + game.id + '/typing', {}, { expect: 200 });
    assert.equal((await alice.waitFor('chat:typing')).displayName, 'bob');
    await dan.call('POST', '/groups/' + game.id + '/typing', {}, { expect: 403 });
  });

  await step('okunmamış mesaj sayısı ve sohbet listesi', async () => {
    const before = await alice.call('GET', '/chats', undefined, { expect: 200 });
    const c = before.data.chats.find((x) => x.id === game.id);
    assert.equal(c.unread, 1, 'bob\'un mesajı alice için okunmamış');
    assert.equal(c.last.body, 'Selam <b>herkese</b>');
    assert.equal(c.last.mine, false);
    // gönderen kendi mesajını okunmamış saymaz
    assert.equal((await bob.call('GET', '/chats')).data.chats.find((x) => x.id === game.id).unread, 0);
    await alice.call('POST', '/groups/' + game.id + '/read', {}, { expect: 200 });
    await alice.waitFor('chat:read', (d) => d.roomId === game.id);
    assert.equal((await alice.call('GET', '/chats')).data.chats.find((x) => x.id === game.id).unread, 0);
    await dan.call('POST', '/groups/' + game.id + '/read', {}, { expect: 403 });
    // carol mesaj gelmeden önce katılmıştı, o yüzden onun için okunmamış
    assert.equal((await carol.call('GET', '/chats')).data.chats.find((x) => x.id === game.id).unread, 1);
    // son mesaja göre sıralama
    const sorted = (await alice.call('GET', '/chats')).data.chats;
    assert.equal(sorted[0].id, game.id);
  });

  await step('oyun grubu sahibi: devir, kick, kapatma, silme', async () => {
    await alice.call('POST', '/groups/' + game.id + '/kick', { userId: 999 }, { expect: 404 });
    await bob.call('POST', '/groups/' + game.id + '/kick', { userId: 1 }, { expect: 403 });
    await bob.call('PATCH', '/groups/' + game.id, { title: 'Ele geçirildi' }, { expect: 403 });
    const carolId = (await alice.call('GET', '/groups/' + game.id)).data.members.find((m) => m.username === 'carol').id;
    await alice.call('POST', '/groups/' + game.id + '/kick', { userId: carolId }, { expect: 200 });
    assert.equal((await carol.waitFor('room:kicked')).roomId, game.id);
    await carol.call('POST', '/groups/' + game.id + '/messages', { body: 'hala buradayım' }, { expect: 403 });
    // oyun grubuna arkadaş ekleme yok (herkese açık)
    await alice.call('POST', '/groups/' + game.id + '/members', { username: 'carol' }, { expect: 404 });
    await alice.call('PATCH', '/groups/' + game.id, { status: 'closed' }, { expect: 200 });
    assert.equal((await dan.call('GET', '/groups?game=valorant')).data.groups.length, 0, 'kapatılan grup listeden kalkar');
    await alice.call('PATCH', '/groups/' + game.id, { status: 'open', maxMembers: 4 }, { expect: 200 });
    // sahip ayrılırsa en eski üyeye devredilir
    await alice.call('POST', '/groups/' + game.id + '/leave', {}, { expect: 200 });
    const d = await bob.call('GET', '/groups/' + game.id, undefined, { expect: 200 });
    assert.equal(d.data.group.owner.username, 'bob');
    await bob.call('DELETE', '/groups/' + game.id, undefined, { expect: 200 });
    await bob.call('GET', '/groups/' + game.id, undefined, { expect: 404 });
  });

  await step('hareketsiz oyun grubu listeden kalkar ve temizlenir', async () => {
    const r = await alice.call('POST', '/groups', { gameId: 'lol', title: 'Eski grup' }, { expect: 201 });
    const id = r.data.group.id;
    assert.equal((await bob.call('GET', '/groups?game=lol')).data.groups.length, 1);
    prep('UPDATE rooms SET created_at = ? WHERE id = ?').run(Date.now() - 13 * 3600_000, id);
    assert.equal((await bob.call('GET', '/groups?game=lol')).data.groups.length, 0, '12 saat hareketsiz grup görünmemeli');
    await bob.call('POST', '/groups/' + id + '/join', {}, { expect: 410 });
    // yeni mesaj yazılırsa tekrar canlanır
    await alice.call('POST', '/groups/' + id + '/messages', { body: 'hâlâ buradayım' }, { expect: 201 });
    assert.equal((await bob.call('GET', '/groups?game=lol')).data.groups.length, 1);
    // sonradan katılan, eski mesajları okunmamış saymaz
    await bob.call('POST', '/groups/' + id + '/join', {}, { expect: 200 });
    assert.equal((await bob.call('GET', '/chats')).data.chats.find((x) => x.id === id).unread, 0);
    await alice.call('DELETE', '/groups/' + id, undefined, { expect: 200 });
  });

  await step('birebir mesaj: sadece arkadaşlar, iki yönlü, bildirim', async () => {
    await alice.call('POST', '/dm/dan', {}, { expect: 403 });
    await alice.call('POST', '/dm/alice', {}, { expect: 400 });
    await alice.call('POST', '/dm/yokkimse', {}, { expect: 404 });
    const r = await alice.call('POST', '/dm/bob', {}, { expect: 200 });
    dmId = r.data.groupId;
    assert.equal((await bob.waitFor('room:added')).roomId, dmId);
    assert.equal((await bob.call('POST', '/dm/alice', {}, { expect: 200 })).data.groupId, dmId, 'iki yönde aynı DM odası');
    await alice.call('POST', '/groups/' + dmId + '/messages', { body: 'Maça var mısın?' }, { expect: 201 });
    const note = await bob.waitFor('chat:message', (d) => d.roomId === dmId);
    assert.equal(note.roomId, dmId);
    assert.equal(note.kind, 'dm');
    assert.equal(note.username, 'alice');
    const chats = await bob.call('GET', '/chats');
    const dm = chats.data.chats.find((x) => x.id === dmId);
    assert.equal(dm.kind, 'dm');
    assert.equal(dm.peer.username, 'alice');
    assert.equal(dm.peer.online, true);
    assert.equal(dm.unread, 1);
    await carol.call('GET', '/groups/' + dmId, undefined, { expect: 404 });
    await carol.call('POST', '/groups/' + dmId + '/join', {}, { expect: 404 });
    await carol.call('POST', '/groups/' + dmId + '/messages', { body: 'dinleyen var' }, { expect: 403 });
    await alice.call('POST', '/groups/' + dmId + '/leave', {}, { expect: 400 });
  });

  await step('arkadaşlıktan çıkınca eski DM okunur ama yazılamaz', async () => {
    await alice.call('DELETE', '/friends/bob', undefined, { expect: 200 });
    assert.equal((await bob.waitFor('friend:removed')).userId, (await alice.call('GET', '/me')).data.user.id);
    await alice.call('POST', '/groups/' + dmId + '/messages', { body: 'hâlâ orada mısın' }, { expect: 403 });
    assert.equal((await alice.call('GET', '/groups/' + dmId + '/messages', undefined, { expect: 200 })).data.messages.length, 1);
    await alice.call('POST', '/dm/bob', {}, { expect: 403 });
    // tekrar arkadaş olunca konuşma devam eder
    await bob.call('POST', '/friends', { username: 'alice' }, { expect: 201 });
    await alice.call('POST', '/friends/bob/accept', {}, { expect: 200 });
    assert.equal((await alice.call('POST', '/dm/bob', {}, { expect: 200 })).data.groupId, dmId);
    await alice.call('POST', '/groups/' + dmId + '/messages', { body: 'barıştık' }, { expect: 201 });
  });

  let fg;
  await step('kalıcı arkadaş grubu: kurma, ekleme, davet kodu, yetkiler', async () => {
    // alice'in arkadaşları: bob, carol. dan arkadaş değil.
    await alice.call('POST', '/groups', { kind: 'community', title: 'Gece Kuşları', members: ['bob', 'dan'] }, { expect: 403 });
    const r = await alice.call('POST', '/groups', { kind: 'community', title: 'Gece Kuşları', description: 'Geceleri oynayanlar', members: ['bob', 'carol'], maxMembers: 4 }, { expect: 201 });
    fg = r.data.group;
    assert.equal(fg.kind, 'community');
    assert.equal(fg.isPublic, false);
    assert.equal(fg.memberCount, 3);
    assert.ok(fg.inviteCode);
    assert.equal((await bob.waitFor('room:added')).title, 'Gece Kuşları');
    assert.equal((await carol.waitFor('room:added')).roomId, fg.id);
    // herkese açık listede ve oyun listelerinde görünmez; yabancı göremez
    assert.ok(!(await dan.call('GET', '/groups')).data.groups.some((x) => x.kind === 'community'), 'arkadaş grubu herkese açık listede olmamalı');
    await dan.call('GET', '/groups/' + fg.id, undefined, { expect: 404 });
    await dan.call('POST', '/groups/' + fg.id + '/join', {}, { expect: 403 });
    await dan.call('POST', '/groups/join-by-code', { code: 'yanlis' }, { expect: 404 });
    // üye, kendi arkadaşını ekleyebilir; arkadaşı olmayanı ekleyemez
    await bob.call('POST', '/groups/' + fg.id + '/members', { username: 'dan' }, { expect: 403 });
    await dan.call('POST', '/friends', { username: 'bob' }, { expect: 201 });
    await bob.call('POST', '/friends/dan/accept', {}, { expect: 200 });
    await bob.call('POST', '/groups/' + fg.id + '/members', { username: 'carol' }, { expect: 403 }); // bob ile carol arkadaş değil
    await alice.call('POST', '/groups/' + fg.id + '/members', { username: 'bob' }, { expect: 409 }); // zaten üye
    const added = await bob.call('POST', '/groups/' + fg.id + '/members', { username: 'dan' }, { expect: 200 });
    assert.equal(added.data.members.length, 4);
    assert.equal((await dan.waitFor('room:added')).by.username, 'bob');
    // dolu
    const eve = new Session('eve');
    await signUp(eve, 'eve');
    await eve.call('POST', '/groups/join-by-code', { code: fg.inviteCode }, { expect: 409 });
    await alice.call('PATCH', '/groups/' + fg.id, { maxMembers: 5 }, { expect: 200 });
    await eve.call('POST', '/groups/join-by-code', { code: fg.inviteCode.toUpperCase() }, { expect: 200 });
    assert.equal((await eve.call('GET', '/groups/' + fg.id)).data.members.length, 5);
    // yetkiler
    await bob.call('PATCH', '/groups/' + fg.id, { title: 'Ele geçirildi' }, { expect: 403 });
    await bob.call('POST', '/groups/' + fg.id + '/kick', { userId: 1 }, { expect: 403 });
    await bob.call('DELETE', '/groups/' + fg.id, undefined, { expect: 403 });
    // sohbet herkese gider
    await dan.call('POST', '/groups/' + fg.id + '/messages', { body: 'selam gece kuşları' }, { expect: 201 });
    assert.equal((await alice.waitFor('chat:message', (d) => d.roomId === fg.id)).kind, 'community');
    assert.equal((await carol.call('GET', '/chats')).data.chats.find((x) => x.id === fg.id).unread, 1);
    // aynı kişi iki kez grup kuramaz sınırını aşmaz: 5 grup sınırı
    for (let i = 0; i < 4; i++) await alice.call('POST', '/groups', { kind: 'community', title: 'Grup ' + i }, { expect: 201 });
    await alice.call('POST', '/groups', { kind: 'community', title: 'Grup fazla' }, { expect: 429 });
    eve.close();
  });

  await step('arkadaş grubu kalıcıdır; sahip ayrılınca devir, son kişi çıkınca silinir', async () => {
    // hareketsizlik temizliği arkadaş grubuna dokunmaz
    prep('UPDATE rooms SET created_at = ? WHERE id = ?').run(Date.now() - 30 * 86400_000, fg.id);
    prep('UPDATE messages SET created_at = ? WHERE room_id = ?').run(Date.now() - 30 * 86400_000, fg.id);
    assert.ok((await bob.call('GET', '/chats')).data.chats.find((x) => x.id === fg.id));
    await alice.call('POST', '/groups/' + fg.id + '/leave', {}, { expect: 200 });
    const d = await bob.call('GET', '/groups/' + fg.id, undefined, { expect: 200 });
    assert.equal(d.data.group.owner.username, 'bob', 'sahiplik en eski üyeye geçmeli');
    assert.equal((await alice.call('GET', '/chats')).data.chats.find((x) => x.id === fg.id), undefined);
    await alice.call('GET', '/groups/' + fg.id, undefined, { expect: 404 });
    await bob.call('DELETE', '/groups/' + fg.id, undefined, { expect: 200 });
    assert.equal((await carol.waitFor('room:deleted', (x) => x.roomId === fg.id)).roomId, fg.id);
    await carol.call('GET', '/groups/' + fg.id, undefined, { expect: 404 });
  });

  await step('güvenlik: yetkisiz erişim, yabancı origin, yol gezinmesi, başlıklar', async () => {
    const anon = new Session('anon');
    await anon.call('POST', '/groups', { title: 'abc', gameId: 'cs2' }, { expect: 401 });
    await anon.call('POST', '/friends', { username: 'alice' }, { expect: 401 });
    const res = await fetch(base + '/api/groups/join-by-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: alice.cookie, origin: 'https://evil.example' },
      body: JSON.stringify({ code: 'x' }),
    });
    assert.equal(res.status, 403, "başka origin'den gelen POST reddedilmeli");
    const form = await fetch(base + '/api/groups/join-by-code', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', cookie: alice.cookie },
      body: '{"code":"x"}',
    });
    assert.equal(form.status, 415, 'JSON olmayan gövde reddedilmeli');
    // %2e%2e URL ayrıştırıcıda ".." gibi çözülür (404), "..%2f" ise çözülüp dizin dışına çıkmaya çalışır (403).
    for (const p of ['/%2e%2e/server/db.js', '/..%2fpackage.json', '/..%2f..%2fetc/passwd', '/%2e%2e%2fserver%2fdb.js']) {
      const code = await rawGet(p);
      assert.ok(code === 403 || code === 404, `${p} dizin dışına çıkmamalı (dönen: ${code})`);
    }
    const h = await fetch(base + '/api/games');
    assert.match(h.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(h.headers.get('x-content-type-options'), 'nosniff');
    // başkasının şifre özeti ya da e-postası hiçbir yanıtta yok
    const all = JSON.stringify([(await alice.call('GET', '/friends')).data, (await alice.call('GET', '/users/bob')).data, (await alice.call('GET', '/chats')).data]);
    assert.ok(!/password|hash|salt/i.test(all), 'yanıtlarda hassas alan olmamalı');
    assert.ok(!/@example\.com/.test(all), 'başkalarının e-postası yanıtlarda olmamalı');
    const sc = (await bob.call('POST', '/auth/logout', {}, { expect: 200 })).headers.get('set-cookie');
    assert.match(sc, /Max-Age=0/);
  });

  await step('yayın hazırlığı: sağlık kontrolü, PWA/SEO dosyaları, yedek, süresi dolan kayıtlar', async () => {
    const get = (u) => fetch(base + u);
    const hz = await get('/healthz');
    assert.equal(hz.status, 200);
    assert.deepEqual(await hz.json(), { ok: true });

    const idx = await get('/');
    const html = await idx.text();
    assert.equal(idx.status, 200);
    assert.ok(html.includes('rel="manifest"') && !html.includes('__PUBLIC_URL__'), 'index.html yer tutucusu doldurulmalı');
    assert.ok(!/googleapis|gstatic/.test(html + (idx.headers.get('content-security-policy') || '')), 'harici yazı tipi servisi olmamalı');
    assert.match(idx.headers.get('content-security-policy'), /font-src 'self'/);

    const mf = await get('/manifest.webmanifest');
    assert.match(mf.headers.get('content-type'), /manifest\+json/);
    const manifest = await mf.json();
    assert.equal(manifest.short_name, 'Kadro');
    for (const icon of manifest.icons) assert.equal((await get(icon.src)).status, 200, `${icon.src} bulunamadı`);
    assert.match(await (await get('/robots.txt')).text(), /Disallow: \/api\//);
    assert.equal((await get('/sw.js')).status, 200);
    assert.equal((await get('/og-image.jpg')).status, 200);
    const font = await get('/fonts/Inter-Regular.woff');
    assert.equal(font.status, 200);
    assert.match(font.headers.get('content-type'), /font\/woff/);

    // PUBLIC_URL doluyken paylaşım görseli mutlak adres olur
    process.env.PUBLIC_URL = 'https://kadro.example/';
    fs.utimesSync(path.join(__dirname, '..', 'public', 'index.html'), new Date(), new Date(Date.now() + 1000)); // önbelleği geçersiz kıl
    const withUrl = await (await get('/')).text();
    assert.ok(withUrl.includes('content="https://kadro.example/og-image.jpg"'));
    delete process.env.PUBLIC_URL;
    fs.utimesSync(path.join(__dirname, '..', 'public', 'index.html'), new Date(), new Date(Date.now() + 2000));

    // Yedek: tutarlı bir kopya, sonra eski kayıtların temizliği
    const maint = require('../server/maintenance.js');
    const { prep } = require('../server/db.js');
    const file = maint.backupNow();
    assert.ok(fs.statSync(file).size > 0);
    const { DatabaseSync } = require('node:sqlite');
    const copy = new DatabaseSync(file, { readOnly: true });
    const live = prep('SELECT COUNT(*) AS c FROM users').get().c;
    assert.equal(copy.prepare('SELECT COUNT(*) AS c FROM users').get().c, live, 'yedekteki kullanıcı sayısı canlı veritabanıyla aynı olmalı');
    copy.close();
    assert.equal(maint.backupNow(), file, 'aynı dakikada ikinci yedek aynı dosyayı kullanır');

    const old = Date.now() - 400 * 86_400_000;
    prep("INSERT INTO reports (kind, target_username, reason, status, created_at, resolved_at) VALUES ('user', 'x', 'spam', 'resolved', ?, ?)").run(old, old);
    prep("INSERT INTO reports (kind, target_username, reason, status, created_at) VALUES ('user', 'y', 'spam', 'open', ?)").run(old);
    prep("INSERT INTO admin_log (admin_username, action, created_at) VALUES ('boss', 'old', ?)").run(old);
    prep(
      "INSERT INTO users (username, display_name, password_hash, email, email_verified, created_at, last_seen) VALUES ('ghost', 'Ghost', 'x', 'ghost@example.com', 0, ?, ?)"
    ).run(old, old);
    const purged = maint.purge();
    assert.deepEqual(purged, { reports: 1, logs: 1, users: 1 });
    assert.equal(prep("SELECT COUNT(*) AS c FROM reports WHERE target_username = 'y'").get().c, 1, 'açık şikâyet silinmemeli');
    assert.equal(prep("SELECT COUNT(*) AS c FROM users WHERE username = 'ghost'").get().c, 0);
    assert.deepEqual(maint.launchWarnings(), [], 'geliştirme ortamında uyarı basılmaz');
  });

  [alice, bob, carol, dan].forEach((s) => s.close());
  console.log(`\n${passed} test grubu geçti.`);
}

main()
  .catch(() => {
    process.exitCode = 1;
  })
  .finally(() => {
    server.close();
    server.closeAllConnections?.();
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  });
