'use strict';

// Kendi bilgisayarında (Windows/Mac/Linux) yayın yaparken .env dosyasını sorularla hazırlar.
// Docker'sız kullanım içindir (Docker'lı kurulum için deploy/setup-server.sh var).
// Kullanım: node scripts/setup-env.js            (yayin-baslat.bat bunu kendisi çağırır)
// Şifre yazarken ekranda görünmez. Çıktı: proje klasöründe .env (yalnızca sahibi okuyabilir).

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ENV_FILE = path.join(__dirname, '..', '.env');
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const say = (s = '') => console.log(s);

// ---- girdi: TTY'de gerçek etkileşim, boru (test) durumunda satır satır ----
let piped = null;
if (!process.stdin.isTTY) {
  piped = fs.readFileSync(0, 'utf8').split(/\r?\n/);
}
const clean = (s) => String(s).replace(/['"`\\$\r\n]/g, '').trim();

function ask(q, def = '') {
  if (piped) return Promise.resolve(clean(piped.shift() ?? '') || def);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  ${q}${def ? ` [${def}]` : ''}: `, (a) => {
      rl.close();
      resolve(clean(a) || def);
    });
  });
}

function askHidden(q) {
  if (piped) return Promise.resolve(clean(piped.shift() ?? ''));
  return new Promise((resolve) => {
    process.stdout.write(`  ${q} (yazarken görünmez, yapıştırabilirsin): `);
    let buf = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          return resolve(clean(buf));
        }
        if (ch === '\u0003') process.exit(130); // Ctrl+C
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1);
        else buf += ch;
      }
    };
    process.stdin.on('data', onData);
  });
}

/** Tailscale kuruluysa bu bilgisayarın https adresini (ör. https://pc.tail1234.ts.net) bulur. */
function detectTailscaleUrl() {
  const candidates = ['tailscale', 'C:\\Program Files\\Tailscale\\tailscale.exe', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];
  for (const bin of candidates) {
    try {
      const out = execFileSync(bin, ['status', '--json'], { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] });
      const dns = (JSON.parse(out).Self || {}).DNSName || '';
      const host = dns.replace(/\.$/, '');
      if (host.includes('.')) return `https://${host}`;
    } catch {
      /* sıradaki adayı dene */
    }
  }
  return '';
}

(async () => {
  say();
  say('  ===== Kadro yayın ayarları =====');
  say();
  if (fs.existsSync(ENV_FILE) && !process.argv.includes('--force')) {
    say('  .env zaten var; değiştirmiyorum. Sıfırdan yapmak için .env dosyasını sil ya da --force ver.');
    return;
  }

  say('  Birkaç soru soracağım. Cevapları sonradan .env dosyasından değiştirebilirsin.');
  say();
  const operator = await ask('Sitenin işleticisi (gizlilik sayfasında görünür: adın soyadın)');
  if (!operator) throw new Error('İşleten adı boş olamaz.');
  const contact = await ask('İletişim e-postası (kullanıcılar ve KVKK başvuruları için)');
  if (!EMAIL_RE.test(contact)) throw new Error('Geçerli bir iletişim e-postası gerekli.');
  const admin = await ask('Yönetici kullanıcı adın (sitede bu adla kayıt olacaksın; harf/rakam/_ ; 3-20 karakter)');
  if (!/^[A-Za-z0-9_]{3,20}$/.test(admin)) throw new Error('Yönetici kullanıcı adı geçersiz (3-20 harf/rakam/_).');

  say();
  say('  Doğrulama e-postalarını gönderecek Gmail hesabı:');
  const gmail = await ask('Gmail adresi');
  if (!EMAIL_RE.test(gmail)) throw new Error('Geçerli bir Gmail adresi gerekli.');
  const pass = (await askHidden('Gmail uygulama şifresi (16 harf)')).replace(/\s+/g, '');
  if (pass.length < 8) throw new Error('Uygulama şifresi çok kısa/boş. Normal Gmail şifreni değil, 16 harfli uygulama şifresini yaz.');

  say();
  let url = detectTailscaleUrl();
  if (url) say(`  Sitenin adresi (Tailscale'den bulundu): ${url}`);
  else {
    say('  Tailscale adresi otomatik bulunamadı. Tailscale kurulu ve giriş yapılmış olmalı.');
    url = await ask('Sitenin https adresi (ör. https://bilgisayarim.tailXXXX.ts.net), bilmiyorsan boş bırak', '');
  }
  if (url && !/^https:\/\/[^\s/]+$/.test(url)) throw new Error('Adres https:// ile başlamalı ve sonunda / olmamalı.');

  const lines = [
    '# scripts/setup-env.js tarafından üretildi. Bu dosya gizli bilgi içerir; kimseyle paylaşma.',
    "NODE_ENV='production'",
    "PORT='3000'",
    "HOST='127.0.0.1'",
    "COOKIE_SECURE='1'",
    "TRUST_PROXY='1'",
    `PUBLIC_URL='${url}'`,
    `OPERATOR_NAME='${operator}'`,
    `CONTACT_EMAIL='${contact}'`,
    `ADMIN_USERNAMES='${admin}'`,
    `KADRO_SECRET='${crypto.randomBytes(32).toString('hex')}'`,
    "SMTP_HOST='smtp.gmail.com'",
    "SMTP_PORT='465'",
    "SMTP_SECURE='tls'",
    `SMTP_USER='${gmail}'`,
    `SMTP_PASS='${pass}'`,
    '',
  ];
  fs.writeFileSync(ENV_FILE, lines.join('\n'), { mode: 0o600 });
  say();
  say('  ✓ .env hazırlandı.');
})().catch((e) => {
  console.error(`\n  ✗ ${e.message}\n  Tekrar denemek için betiği yeniden çalıştır.`);
  process.exit(1);
});
