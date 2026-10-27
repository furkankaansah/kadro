// Kadro service worker: uygulamayı ana ekrana eklenebilir yapar ve statik dosyaları (kabuk) önbelleğe alır.
// /api isteklerine HİÇ dokunmaz: sohbet, giriş ve canlı akış her zaman doğrudan sunucuya gider.
// Strateji: önce ağ, ağ yoksa önbellek. Böylece yeni sürüm yayınlanınca kullanıcı eski dosyada kalmaz.

const CACHE = 'kadro-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/css/style.css', '/js/app.js', '/favicon.svg'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/healthz') return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/') : Response.error())))
  );
});
