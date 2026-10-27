'use strict';

// Düzenli bakım: otomatik yedek (SQLite VACUUM INTO), süresi dolan kayıtların temizliği ve yayın öncesi uyarılar.

const fs = require('node:fs');
const path = require('node:path');
const { db, prep, dataDir } = require('./db');
const mailer = require('./mailer');

const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(dataDir, 'backups');
const BACKUP_KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 14); // en son bu kadar yedek tutulur
const BACKUP_EVERY_MS = Math.max(1, Number(process.env.BACKUP_EVERY_HOURS) || 24) * 3600_000;
const BACKUP_ON = process.env.BACKUP !== '0';

const DAY = 86_400_000;
const REPORT_KEEP_MS = 180 * DAY; // kapatılan şikâyetler (gizlilik politikasında yazıyor)
const ADMIN_LOG_KEEP_MS = 365 * DAY; // yönetici işlem kaydı (gizlilik politikasında yazıyor)
const UNVERIFIED_KEEP_MS = 30 * DAY; // e-postasını hiç doğrulamayan hesaplar (gizlilik politikasında yazıyor)

// ---------- Yedek ----------

const listBackups = () => {
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => /^kadro-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.db$/.test(f))
      .sort();
  } catch {
    return [];
  }
};

/** Veritabanının tutarlı bir kopyasını alır (site çalışırken güvenle). Dosya yolunu döndürür. */
function backupNow() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  const file = path.join(BACKUP_DIR, `kadro-${stamp}.db`);
  if (fs.existsSync(file)) return file;
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* Windows'ta yok sayılır */
  }
  const all = listBackups();
  for (const old of all.slice(0, Math.max(0, all.length - BACKUP_KEEP))) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, old));
    } catch {
      /* yoksay */
    }
  }
  return file;
}

function backupIfDue() {
  if (!BACKUP_ON) return;
  const last = listBackups().pop();
  if (last) {
    try {
      if (Date.now() - fs.statSync(path.join(BACKUP_DIR, last)).mtimeMs < BACKUP_EVERY_MS) return;
    } catch {
      /* yeniden yedekle */
    }
  }
  try {
    const f = backupNow();
    console.log(`[yedek] ${path.basename(f)} (en fazla ${BACKUP_KEEP} yedek tutulur)`);
  } catch (err) {
    console.error('[yedek] alınamadı:', err.message);
  }
}

// ---------- Süresi dolan kayıtlar ----------

function purge() {
  const now = Date.now();
  const q = (sql, ...p) => prep(sql).run(...p).changes;
  const reports = q("DELETE FROM reports WHERE status != 'open' AND COALESCE(resolved_at, created_at) < ?", now - REPORT_KEEP_MS);
  const logs = q('DELETE FROM admin_log WHERE created_at < ?', now - ADMIN_LOG_KEEP_MS);
  const users = q('DELETE FROM users WHERE email IS NOT NULL AND email_verified = 0 AND created_at < ?', now - UNVERIFIED_KEEP_MS);
  // Karşı tarafı silinen birebir sohbetler yetim kalmasın.
  if (users) q("DELETE FROM rooms WHERE kind = 'dm' AND (SELECT COUNT(*) FROM room_members m WHERE m.room_id = rooms.id) < 2");
  const total = reports + logs + users;
  if (total) console.log(`[temizlik] ${reports} şikâyet, ${logs} yönetici kaydı, ${users} doğrulanmamış hesap silindi`);
  return { reports, logs, users };
}

// ---------- Yayın öncesi uyarılar ----------

/** NODE_ENV=production iken eksik/riskli ayarları döndürür. */
function launchWarnings() {
  if (process.env.NODE_ENV !== 'production') return [];
  const env = process.env;
  const out = [];
  if (env.COOKIE_SECURE !== '1') out.push('COOKIE_SECURE=1 değil: oturum çerezi HTTPS zorunlu olmadan gönderilir.');
  if (!env.PUBLIC_URL) out.push('PUBLIC_URL yok: e-postalardaki bağlantılar ve paylaşım görseli çalışmaz.');
  if (!mailer.configured) out.push('E-posta gönderici ayarlı değil (RESEND_API_KEY + MAIL_FROM ya da SMTP_HOST + SMTP_USER + SMTP_PASS): doğrulama e-postası KİMSEYE gitmez, kimse kayıt olup devam edemez.');
  if (!env.ADMIN_USERNAMES) out.push('ADMIN_USERNAMES boş: şikâyetleri inceleyecek yönetici yok.');
  if (!env.CONTACT_EMAIL || !env.OPERATOR_NAME) out.push('CONTACT_EMAIL / OPERATOR_NAME yok: gizlilik ve şartlar sayfalarında iletişim bilgisi boş kalır.');
  if (env.TRUST_PROXY !== '1') out.push('TRUST_PROXY=1 değil: bir proxy/CDN arkasındaysan herkes aynı IP görünür ve hız sınırı hepsini birden kısıtlar.');
  if (!env.KADRO_SECRET) out.push('KADRO_SECRET yok: gizli anahtar data/.secret dosyasından okunur; bu klasörün kalıcı diskte olduğundan emin ol.');
  if (!BACKUP_ON) out.push('BACKUP=0: otomatik yedek kapalı.');
  return out;
}

function start() {
  purge();
  setInterval(purge, 6 * 3600_000).unref();
  setTimeout(backupIfDue, 15_000).unref(); // açılışı yavaşlatmasın
  setInterval(backupIfDue, 3600_000).unref();
}

module.exports = { start, backupNow, purge, launchWarnings, BACKUP_DIR };
