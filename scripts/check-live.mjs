// Yayındaki siteyi dışarıdan kontrol eder. Hesap açmaz, veri yazmaz; yalnızca okur.
// Kullanım:  node scripts/check-live.mjs https://kadro.ornek.com
// Çıkış kodu: tüm zorunlu kontroller geçerse 0, aksi halde 1.

const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('Kullanım: node scripts/check-live.mjs https://kadro.ornek.com');
  process.exit(2);
}
const url = new URL(base);
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost');

let failed = 0;
let warned = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m, hint) => {
  failed++;
  console.log(`  ✗ ${m}${hint ? `\n      → ${hint}` : ''}`);
};
const warn = (m, hint) => {
  warned++;
  console.log(`  ! ${m}${hint ? `\n      → ${hint}` : ''}`);
};
const check = (cond, pass, fail, hint) => (cond ? ok(pass) : bad(fail, hint));

async function get(path, opts = {}) {
  const res = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(20000), ...opts });
  return res;
}

console.log(`\nKadro canlı kontrol: ${base}\n`);

// 1) Sağlık
console.log('Sunucu');
try {
  const t0 = Date.now();
  const r = await get('/healthz');
  const body = await r.json().catch(() => ({}));
  check(r.status === 200 && body.ok === true, `/healthz çalışıyor (${Date.now() - t0} ms)`, `/healthz beklenen yanıtı vermedi (HTTP ${r.status})`, 'Sunucu kapalı ya da veritabanına ulaşamıyor olabilir; barındırma günlüklerine bak.');
} catch (e) {
  bad(`Siteye ulaşılamadı: ${e.cause?.code || e.message}`, 'Adres doğru mu? DNS yayıldı mı (birkaç dakika–birkaç saat sürebilir)?');
  console.log('\nSite açılmıyor; diğer kontroller atlandı.\n');
  process.exit(1);
}

// 2) HTTPS
console.log('\nGüvenli bağlantı');
if (isLocal) {
  warn('Yerel adres: HTTPS kontrolleri atlandı', 'Yayında https:// adresiyle tekrar çalıştır.');
} else {
  check(url.protocol === 'https:', 'Adres https ile açılıyor', 'Adres https değil', 'PUBLIC_URL ve bağlantılar https:// olmalı.');
  try {
    const r = await fetch(`http://${url.host}/`, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const loc = r.headers.get('location') || '';
    check(r.status >= 300 && r.status < 400 && loc.startsWith('https://'), 'http:// adresi https://\'e yönleniyor', `http:// adresi https'e yönlenmiyor (HTTP ${r.status})`, 'Sağlayıcı/Caddy genelde bunu kendisi yapar; panel ayarını kontrol et.');
  } catch {
    warn('http:// adresine ulaşılamadı (yalnızca 443 açık olabilir)');
  }
}

// 3) Ana sayfa ve güvenlik başlıkları
console.log('\nAna sayfa');
{
  const r = await get('/');
  const html = await r.text();
  check(r.status === 200 && /<title>/i.test(html), 'Ana sayfa açılıyor', `Ana sayfa açılmadı (HTTP ${r.status})`);
  check(/frame-ancestors/.test(r.headers.get('content-security-policy') || ''), 'İçerik güvenlik politikası (CSP) var', 'CSP başlığı yok');
  check(r.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options var', 'X-Content-Type-Options yok');
  if (!isLocal) check(/max-age=\d+/.test(r.headers.get('strict-transport-security') || ''), 'HSTS var', 'HSTS başlığı yok', 'TRUST_PROXY/COOKIE_SECURE ayarlarını ve vekilin başlıkları aktardığını kontrol et.');
  check(/<meta[^>]+og:image[^>]+>/i.test(html), 'Paylaşım görseli etiketi var', 'og:image etiketi yok');
  check(!html.includes('__PUBLIC_URL__'), 'Paylaşım adresleri (PUBLIC_URL) doldurulmuş', 'Sayfada __PUBLIC_URL__ yer tutucusu duruyor', 'PUBLIC_URL ayarlı değil; paylaşım önizlemeleri bozuk çıkar.');
  if (!isLocal) {
    const u = (html.match(/property="og:image"\s+content="([^"]+)"/) || [])[1] || '';
    check(u.startsWith(base), 'Paylaşım görseli doğru alan adını gösteriyor', `og:image adresi site adresiyle uyuşmuyor (${u})`, 'PUBLIC_URL, sitenin gerçek adresi olmalı.');
  }
}

// 4) Yapılandırma
console.log('\nYapılandırma (/api/config)');
let cfg = {};
try {
  const r = await get('/api/config');
  cfg = await r.json();
} catch {
  /* aşağıda başarısız sayılır */
}
check(cfg.mailConfigured === true, 'E-posta gönderimi açık', 'E-posta gönderimi KAPALI: kimse kayıt olup devam edemez', 'RESEND_API_KEY ve MAIL_FROM değerlerini gir; Resend\'de alan adını doğrula.');
check(!!cfg.operator, `İşleten adı dolu (${cfg.operator || ''})`.trim(), 'OPERATOR_NAME boş', 'Gizlilik/şartlar sayfaları işleteni göstermeli.');
check(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cfg.contactEmail || ''), `İletişim e-postası dolu (${cfg.contactEmail || ''})`.trim(), 'CONTACT_EMAIL boş ya da geçersiz', 'KVKK başvuruları için ulaşılabilir bir adres şart.');

// 5) Veri ve statik dosyalar
console.log('\nİçerik');
try {
  const r = await get('/api/games');
  const g = (await r.json()).games || [];
  check(g.length >= 100, `${g.length} oyun tanımlı`, `Oyun listesi eksik (${g.length})`);
} catch {
  bad('/api/games okunamadı');
}
for (const [p, type] of [
  ['/manifest.webmanifest', 'manifest'],
  ['/robots.txt', 'text/plain'],
  ['/favicon.svg', 'svg'],
  ['/icon-192.png', 'png'],
  ['/og-image.jpg', 'jpeg'],
  ['/sw.js', 'javascript'],
]) {
  const r = await get(p);
  check(r.status === 200 && (r.headers.get('content-type') || '').includes(type), `${p} sunuluyor`, `${p} sunulamadı (HTTP ${r.status})`);
}

// 6) Oturum gerektiren uçlar kapalı mı?
console.log('\nYetki');
{
  const r = await get('/api/me');
  const me = await r.json().catch(() => ({}));
  check(r.status === 200 && me.user === null, 'Giriş yapmadan oturum bilgisi boş dönüyor', `/api/me beklenmedik yanıt verdi (HTTP ${r.status})`);
  const a = await get('/api/admin/reports');
  check(a.status === 401 || a.status === 403, 'Yönetici uçları girişsiz kapalı', `Yönetici ucu girişsiz açık görünüyor (HTTP ${a.status})`, 'ACİL: sunucu sürümünü ve ADMIN_USERNAMES ayarını kontrol et.');
}

console.log(`\n${failed ? `✗ ${failed} sorun var` : '✓ Zorunlu kontroller geçti'}${warned ? `, ${warned} uyarı` : ''}.`);
console.log('Bu betik kayıt/e-posta akışını denemez: yayın sonrası gerçek bir e-postayla kendin kayıt olup dene.\n');
process.exit(failed ? 1 : 0);
