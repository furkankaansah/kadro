'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { db, prep } = require('./db');
const C = require('./constants');
const auth = require('./auth');
const mailer = require('./mailer');
const maintenance = require('./maintenance');
const { router } = require('./routes');
const { HttpError, HANDLED, bad, sendJson, readBody } = require('./http');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

// ---------- Güvenlik başlıkları ----------

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'microphone=(), camera=(), geolocation=()');
  // HTTPS'li yayında (COOKIE_SECURE=1) tarayıcıya 6 ay boyunca yalnızca HTTPS kullanmasını söyle.
  if (process.env.COOKIE_SECURE === '1') res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
}

// ---------- Basit hız sınırı (IP başına, bellekte) ----------

const hits = new Map(); // anahtar -> [zamanlar]
// RATE_LIMIT_SCALE: tüm IP sınırlarını çarpar (varsayılan 1). Yalnızca testlerde ve yük denemelerinde büyütülür.
const RATE_SCALE = Math.max(1, Number(process.env.RATE_LIMIT_SCALE) || 1);
function rateLimited(key, limit, windowMs) {
  const t = Date.now();
  const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
  arr.push(t);
  hits.set(key, arr);
  return arr.length > limit * RATE_SCALE;
}
setInterval(() => {
  const t = Date.now();
  for (const [k, arr] of hits) {
    if (!arr.length || t - arr[arr.length - 1] > 15 * 60_000) hits.delete(k);
  }
}, 5 * 60_000).unref();

function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// ---------- API ----------

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // aynı origin'den gelen bazı istekler Origin göndermez
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function handleApi(req, res, url) {
  const apiPath = url.pathname.slice(4) || '/'; // "/api" önekini at
  const ip = clientIp(req);
  const mutating = req.method !== 'GET' && req.method !== 'HEAD';

  if (mutating && !sameOrigin(req)) throw bad('forbidden', 403);
  if (rateLimited(`api:${ip}`, 600, 5 * 60_000)) throw bad('rate_limited', 429);
  if (apiPath === '/auth/login' || apiPath === '/auth/register') {
    if (rateLimited(`auth:${ip}`, 20, 10 * 60_000)) throw bad('rate_limited', 429);
  }
  // Doğrulama kodu/bağlantısı denemeleri: tahmin yürütmeyi yavaşlat.
  if (apiPath === '/auth/verify' || apiPath === '/auth/change-email' || apiPath === '/auth/resend-verification') {
    if (rateLimited(`verify:${ip}`, 30, 10 * 60_000)) throw bad('rate_limited', 429);
  }
  if (apiPath === '/auth/forgot') {
    if (rateLimited(`forgot:${ip}`, 10, 10 * 60_000)) throw bad('rate_limited', 429);
  }
  if (apiPath === '/auth/reset' || apiPath === '/auth/change-password') {
    if (rateLimited(`reset:${ip}`, 20, 10 * 60_000)) throw bad('rate_limited', 429);
  }

  const { route, params, methodNotAllowed } = router.match(req.method, apiPath);
  if (!route) throw bad(methodNotAllowed ? 'method_not_allowed' : 'not_found', methodNotAllowed ? 405 : 404);

  const user = auth.userFromRequest(req);
  if (route.opts.auth && !user) throw bad('unauthorized', 401);

  const ctx = {
    req,
    res,
    params,
    query: Object.fromEntries(url.searchParams),
    body: mutating ? await readBody(req) : {},
    user,
    clientId: typeof req.headers['x-client-id'] === 'string' ? req.headers['x-client-id'] : '',
    status: 200,
  };
  const result = await route.handler(ctx);
  if (result === HANDLED) return;
  sendJson(res, ctx.status, result === undefined ? { ok: true } : result);
}

// ---------- Statik dosyalar ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// index.html içindeki __PUBLIC_URL__ yer tutucusu (paylaşım görseli, kanonik adres) PUBLIC_URL ile doldurulur.
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');
let indexCache = { mtime: 0, html: '', etag: '' };
function renderIndex() {
  const stat = fs.statSync(INDEX_FILE);
  if (indexCache.mtime !== stat.mtimeMs) {
    const base = String(process.env.PUBLIC_URL || '').replace(/\/+$/, '');
    const html = fs.readFileSync(INDEX_FILE, 'utf8').replaceAll('__PUBLIC_URL__', base);
    indexCache = { mtime: stat.mtimeMs, html, etag: `W/"i${html.length.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"` };
  }
  return indexCache;
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (rel.includes('\0')) {
    res.writeHead(400);
    return res.end();
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  if (file === INDEX_FILE) {
    const page = renderIndex();
    const headers = { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache', ETag: page.etag };
    if (req.headers['if-none-match'] === page.etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    res.writeHead(200, headers);
    return res.end(req.method === 'HEAD' ? undefined : page.html);
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Bulunamadı / Not found');
    }
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ETag: etag,
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// ---------- Sunucu ----------

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') {
      // Barındırma sağlayıcısının sağlık kontrolü için: veritabanına ulaşılıyor mu?
      prep('SELECT 1 AS ok').get();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('{"ok":true}');
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url.pathname);
    }
  } catch (err) {
    if (res.headersSent) {
      try {
        res.end();
      } catch {
        /* yoksay */
      }
      return;
    }
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.code, ...(err.extra || {}) });
    console.error('[hata]', err);
    sendJson(res, 500, { error: 'server_error' });
  }
});
server.keepAliveTimeout = 65_000;

// Uzun süredir hareketsiz oyun gruplarını (son mesajdan itibaren 3 gün) sil; sohbet ve üyelikleri de birlikte silinir.
// Arkadaş grupları ve birebir mesajlar kalıcıdır, dokunulmaz.
function cleanup() {
  const cutoff = Date.now() - C.GROUP_DELETE_MS;
  const res = prep(
    `DELETE FROM rooms WHERE kind = 'lfg'
       AND MAX(created_at, COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE m.room_id = rooms.id), 0)) < ?`
  ).run(cutoff);
  if (res.changes) console.log(`[temizlik] ${res.changes} eski oyun grubu silindi`);
}
cleanup();
setInterval(cleanup, 3600_000).unref();
if (require.main === module) maintenance.start(); // yedek ve süresi dolan kayıt temizliği (testlerde çalışmaz)

function shutdown() {
  console.log('\nKapatılıyor…');
  server.close(() => {
    try {
      db.close();
    } catch {
      /* yoksay */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
  }
  return out;
}

if (require.main === module) {
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n${PORT} numaralı port başka bir program tarafından kullanılıyor.`);
      console.error('Kadro zaten açık olabilir: tarayıcıda http://localhost:' + PORT + ' adresine bak.');
      console.error('Değilse farklı port dene (örn. Windows: set PORT=3001 && npm start).\n');
    } else if (err.code === 'EACCES') {
      console.error(`\n${PORT} numaralı port için izin yok. 1024'ten büyük bir port dene (örn. PORT=3000).\n`);
    } else {
      console.error('[sunucu hatası]', err);
    }
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    console.log('\n  Kadro çalışıyor');
    console.log(`  Bu bilgisayarda : http://localhost:${PORT}`);
    if (HOST === '0.0.0.0' || HOST === '::') {
      for (const ip of lanAddresses()) console.log(`  Aynı Wi-Fi'deki telefon/bilgisayar: http://${ip}:${PORT}`);
    }
    console.log(`  (${C.GAMES.length} oyun tanımlı. Demo veri için: npm run seed)`);
    if (mailer.configured) {
      console.log(`  E-posta: ${mailer.mode === 'smtp' ? 'SMTP ile' : 'Resend ile'} gönderiliyor` + (mailer.publicUrl() ? '' : ' (PUBLIC_URL ayarlı değil: e-postada sadece kod olur, bağlantı olmaz)'));
    } else {
      console.log(`  E-posta: gönderici ayarlı değil. Doğrulama e-postaları ${mailer.outDir} klasörüne yazılır.`);
    }
    const warns = maintenance.launchWarnings();
    if (warns.length) {
      console.log('\n  ⚠ YAYIN ÖNCESİ UYARILAR:');
      for (const w of warns) console.log('   - ' + w);
    }
    console.log('  Durdurmak için: Ctrl+C\n');
  });
}

module.exports = { server };
