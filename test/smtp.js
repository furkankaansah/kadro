'use strict';

// SMTP istemcisi testi: sahte bir SMTP sunucusuyla (düz, TLS, STARTTLS) protokolü doğrular.
const assert = require('node:assert/strict');
const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { sendSmtp, buildMessage, parseAddress } = require('../server/smtp');

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// Sahte sunucu: gelen komutları ve ileti gövdesini kaydeder.
function fakeServer({ mode, user = 'kadro@gmail.com', pass = 'abcdabcdabcdabcd', creds, authReply, advertise = 'AUTH PLAIN LOGIN' }) {
  const log = { cmds: [], data: '', auth: null, starttls: false };
  const handle = (sock) => {
    let state = 'cmd';
    let buf = '';
    let current = sock;
    const send = (s) => current.write(`${s}\r\n`);
    const onData = (d) => {
      buf += d.toString('utf8');
      for (;;) {
        if (state === 'data') {
          const end = buf.indexOf('\r\n.\r\n');
          if (end === -1) return;
          log.data = buf.slice(0, end + 2);
          buf = buf.slice(end + 5);
          state = 'cmd';
          send('250 2.0.0 OK queued');
          continue;
        }
        const i = buf.indexOf('\r\n');
        if (i === -1) return;
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        log.cmds.push(line.startsWith('AUTH PLAIN') ? 'AUTH PLAIN <gizli>' : line);
        if (/^EHLO/.test(line)) {
          const secureNow = mode === 'tls' || (mode === 'starttls' && log.starttls) || mode === 'none';
          send('250-fake.local');
          if (mode === 'starttls' && !log.starttls) send('250-STARTTLS');
          if (secureNow && advertise) send(`250-${advertise}`);
          send('250 8BITMIME');
        } else if (/^STARTTLS/.test(line)) {
          send('220 2.0.0 Ready to start TLS');
          log.starttls = true;
          const t = new tls.TLSSocket(sock, { isServer: true, key: KEY, cert: CERT });
          sock.removeAllListeners('data');
          t.on('data', onData);
          t.on('error', () => {});
          current = t;
          buf = '';
          return;
        } else if (/^AUTH PLAIN /.test(line)) {
          const [, u, p] = Buffer.from(line.slice(11), 'base64').toString().split('\0');
          log.auth = { u, p };
          const good = creds ? creds(u, p) : u === user && p === pass;
          send(good ? '235 2.7.0 Accepted' : authReply || '535 5.7.8 Username and Password not accepted');
        } else if (/^MAIL FROM:/.test(line)) send('250 2.1.0 OK');
        else if (/^RCPT TO:/.test(line)) send('250 2.1.5 OK');
        else if (/^DATA/.test(line)) {
          send('354 Go ahead');
          state = 'data';
        } else if (/^QUIT/.test(line)) {
          send('221 Bye');
        } else send('502 5.5.1 Unrecognized command');
      }
    };
    sock.on('data', onData);
    sock.on('error', () => {});
    send('220 fake.local ESMTP ready');
  };
  const server = mode === 'tls' ? tls.createServer({ key: KEY, cert: CERT }, handle) : net.createServer(handle);
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port, log })));
}

// Test için geçici, kendinden imzalı sertifika.
let KEY;
let CERT;
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-smtp-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' });
  KEY = fs.readFileSync(path.join(dir, 'k.pem'));
  CERT = fs.readFileSync(path.join(dir, 'c.pem'));
  fs.rmSync(dir, { recursive: true, force: true });
}

const mail = {
  from: 'Kadro <kadro@gmail.com>',
  to: 'oyuncu@example.com',
  subject: 'Kadro: e-posta adresini doğrula',
  text: 'Merhaba Çağrı,\n\nKodun: 123456\n.noktayla başlayan satır\nŞİŞ ğüşiöç',
  html: '<p>Merhaba Çağrı</p><p>123456</p>',
};
const unsafe = { rejectUnauthorized: false };

function parseSent(data) {
  const [head, ...rest] = data.split('\r\n\r\n');
  const headers = Object.fromEntries(head.split('\r\n').map((l) => [l.slice(0, l.indexOf(':')).toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]));
  const body = rest.join('\r\n\r\n');
  const parts = [...body.matchAll(/Content-Type: (text\/\w+); charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/g)].map((m) => [m[1], Buffer.from(m[2].replace(/\s+/g, ''), 'base64').toString('utf8')]);
  return { headers, parts };
}

test('düz bağlantı (yalnızca localhost): gönderir, gövde ve başlıklar doğru çözülür', async () => {
  const s = await fakeServer({ mode: 'none' });
  await sendSmtp({ host: '127.0.0.1', port: s.port, secure: 'none' }, mail);
  s.server.close();
  assert.ok(s.log.cmds.some((c) => c === 'MAIL FROM:<kadro@gmail.com>'));
  assert.ok(s.log.cmds.some((c) => c === 'RCPT TO:<oyuncu@example.com>'));
  const { headers, parts } = parseSent(s.log.data);
  assert.equal(headers.to, 'oyuncu@example.com');
  assert.match(headers.from, /^Kadro <kadro@gmail.com>$/);
  assert.equal(Buffer.from(headers.subject.replace(/^=\?UTF-8\?B\?|\?=$/g, ''), 'base64').toString(), mail.subject);
  assert.deepEqual(parts.map((p) => p[0]), ['text/plain', 'text/html']);
  assert.equal(parts[0][1], mail.text, 'Türkçe karakterler ve "." ile başlayan satır bozulmamalı');
  assert.equal(parts[1][1], mail.html);
});

test('TLS (465) + AUTH PLAIN: doğru kimlikle gönderir, kimlik bilgisi sunucuya ulaşır', async () => {
  const s = await fakeServer({ mode: 'tls' });
  await sendSmtp({ host: '127.0.0.1', port: s.port, secure: 'tls', user: 'kadro@gmail.com', pass: 'abcdabcdabcdabcd', tlsOptions: unsafe }, mail);
  s.server.close();
  assert.deepEqual(s.log.auth, { u: 'kadro@gmail.com', p: 'abcdabcdabcdabcd' });
  assert.ok(s.log.data.includes('Subject:'));
});

test('STARTTLS (587): TLS\'e geçtikten sonra oturum açar', async () => {
  const s = await fakeServer({ mode: 'starttls' });
  await sendSmtp({ host: '127.0.0.1', port: s.port, secure: 'starttls', user: 'kadro@gmail.com', pass: 'abcdabcdabcdabcd', tlsOptions: unsafe }, mail);
  s.server.close();
  assert.equal(s.log.starttls, true);
  const iEhlo2 = s.log.cmds.filter((c) => c.startsWith('EHLO')).length;
  assert.equal(iEhlo2, 2, 'TLS sonrası EHLO tekrarlanmalı');
  assert.ok(s.log.cmds.indexOf('STARTTLS') < s.log.cmds.indexOf('AUTH PLAIN <gizli>'), 'oturum açma STARTTLS\'ten sonra olmalı');
  assert.ok(s.log.data.length > 50);
});

test('yanlış şifre: anlaşılır hata, e-posta gönderilmez', async () => {
  const s = await fakeServer({ mode: 'tls' });
  await assert.rejects(
    sendSmtp({ host: '127.0.0.1', port: s.port, secure: 'tls', user: 'kadro@gmail.com', pass: 'yanlis', tlsOptions: unsafe }, mail),
    /oturum açma: 535/
  );
  s.server.close();
  assert.equal(s.log.data, '');
});

test('sertifika doğrulaması açık: kendinden imzalı sertifikaya güvenilmez', async () => {
  const s = await fakeServer({ mode: 'tls' });
  await assert.rejects(sendSmtp({ host: '127.0.0.1', port: s.port, secure: 'tls', user: 'u@x.com', pass: 'p' }, mail), /self.signed|certificate|unable to verify|IP/i);
  s.server.close();
});

test('şifresiz bağlantı localhost dışında ve kimlik bilgisiyle reddedilir', async () => {
  await assert.rejects(sendSmtp({ host: 'smtp.example.com', port: 25, secure: 'none' }, mail), /yalnızca localhost/);
  const s = await fakeServer({ mode: 'none' });
  await assert.rejects(sendSmtp({ host: '127.0.0.1', port: s.port, secure: 'none', user: 'u', pass: 'p' }, mail), /Şifresiz bağlantıda oturum açılmaz/);
  s.server.close();
  assert.equal(s.log.auth, null, 'şifre düz bağlantıda sunucuya gönderilmemeli');
});

test('başlık enjeksiyonu: satır sonu içeren adres/konu zarar veremez', async () => {
  assert.throws(() => parseAddress('a@b.com\r\nBcc: x@y.com'), /Geçersiz/);
  assert.throws(() => buildMessage({ from: 'k@x.com', to: 'a@b.com>\r\nRCPT TO:<x@y.com', subject: 's', text: 't' }), /Geçersiz/);
  const m = buildMessage({ from: 'Kadro <k@x.com>', to: 'a@b.com', subject: 'Selam\r\nBcc: kurban@x.com', text: 't' });
  const headerBlock = m.raw.split('\r\n\r\n')[0];
  assert.ok(!/^Bcc:/im.test(headerBlock), 'konudan yeni başlık üretilememeli');
});

test('zaman aşımı/bağlantı hatası temiz hata verir', async () => {
  await assert.rejects(sendSmtp({ host: '127.0.0.1', port: 1, secure: 'none' }, mail), /ECONNREFUSED|connect/i);
});

(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      console.error(`  ✗ ${name}\n${e.stack || e}`);
      process.exit(1);
    }
  }
  console.log(`\n${passed} SMTP testi geçti.`);
})();
