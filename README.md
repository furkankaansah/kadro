# Kadro

Oyuncular için sade bir **grup bulma ve arkadaşlık** sitesi: oyunu seç, o oyunda açılan grupları gör, katıl ya da kendi grubunu kur. Arkadaşlarınla birebir yaz, kalıcı arkadaş grupları kur.
Arayüz Türkçe ve İngilizce (sağ üstteki TR/EN düğmesi), açık/koyu tema cihaz ayarına göre otomatik, mobilde alt sekme çubuğu.

## Nasıl çalışıyor?

0. **Kayıt ol:** e-posta adresi + kullanıcı adı + şifre (iki kez) + kullanım şartları/gizlilik onayı. Adresine 6 haneli bir kod ve tek tıkla doğrulama bağlantısı gelir; doğrulayana kadar siteye bakabilirsin ama grup kuramaz/katılamaz, mesaj yazamaz, arkadaş ekleyemezsin. Kullanıcı adın sitede görünen adındır, arkadaşların seni onunla bulur. Şifreni unutursan "Şifremi unuttum" ile e-postana kod/bağlantı gelir.
1. **Oyun seç:** ana sayfada Steam/PC'deki 168 popüler oyun (+ "Diğer"); en çok açık grubu olanlar başta gelir, arama kutusu ve "Tüm oyunları göster" ile hepsine ulaşılır. Mobil oyun yok. Her kutuda o an kaç açık grup olduğu yazar.
2. **Grupları gör:** oyunun sayfasında o oyun için açılmış gruplar (üyeler, kaç kişi/kaç kişilik, kuran kişi). **Katıl**'a basınca grup sohbetine girersin.
3. **Grup kur:** "Grup kur" → başlık, açıklama, kaç kişilik olacağı (2–10). Kurar kurmaz sohbet açılır.
4. **Mesajlaş:** canlı yazılı sohbet (yeni mesaj sayfayı yenilemeden gelir), okunmamış sayıları, "yazıyor…" göstergesi.
5. **Arkadaş ol:** kullanıcı adıyla ara, istek yolla / kabul et. Arkadaşlarınla **birebir** mesajlaşırsın (birebir mesaj sadece arkadaşlar arasında).
6. **Kalıcı arkadaş grubu:** arkadaşlarını seçip özel bir grup kur (en fazla 50 kişi). Davet kodu / bağlantısı ile başkaları da katılabilir. Bu gruplar **hiçbir zaman kendiliğinden silinmez**.

### Oyun grupları geçicidir, arkadaş grupları kalıcıdır

| | Oyun grubu | Arkadaş grubu |
| --- | --- | --- |
| Kim görür? | Oyunun sayfasında herkes | Sadece üyeler (kod/bağlantı ile katılınır) |
| Kişi sınırı | 2–10 | 2–50 |
| Ömrü | 12 saat hiç mesaj yazılmazsa listeden kalkar, 3 gün sonra tamamen silinir | Kalıcı |
| Sahibi ayrılırsa | Sahiplik sıradaki üyeye geçer, son kişi çıkınca grup silinir | Aynı |
| Bir kişinin açabileceği | Aynı anda en fazla 3 aktif oyun grubu | En fazla 5 arkadaş grubu |

Grup sahibi grubu düzenleyebilir, yeni üye almaya kapatıp tekrar açabilir, üye çıkarabilir, silebilir.

### Güvenlik ve moderasyon (herkese açık site için şart)

- **Şikâyet:** kullanıcı sayfasından, sohbetteki her mesajın yanındaki bayraktan ve grup bilgisinden; 7 neden + not. Aynı şeyi iki kez şikâyet edemezsin; saatte en fazla 10 şikâyet.
- **Engelleme:** arkadaşlık biter, birbirinizi arama sonuçlarında göremez, mesaj atamazsınız; gruplarda engellediğin kişinin mesajları sana görünmez. Profilden engelleri yönetirsin.
- **Yönetici paneli** (`#/admin`): özet sayıları, şikâyet kutusu (kanıt olarak şikâyet anındaki mesaj + öncesindeki 4 mesaj saklanır; reddet / çözüldü / mesajı sil / grubu sil / yasakla), kullanıcı arama ve yasaklama, işlem kaydı. Yönetici olmak için kullanıcı adını `ADMIN_USERNAMES` ortam değişkenine yaz (e-postası doğrulanmış olmalı). Yasaklanan kullanıcının oturumu hemen düşer, açtığı oyun grupları kapanır, girişte nedeni görür.
- **Hesabı silme** (KVKK silme hakkı): Profil > "Hesabımı sil" (şifre ister). Mesajlar, arkadaşlıklar ve birebir sohbetler silinir; sahibi olduğu gruplar üyelere devredilir.
- **Gizlilik politikası ve kullanım şartları** (`#/legal/privacy`, `#/legal/terms`, TR/EN): işleten kişi ve iletişim adresi `OPERATOR_NAME` / `CONTACT_EMAIL` ile gelir. **Bu metinler bir şablondur; yayına almadan önce kendi durumuna göre gözden geçir, mümkünse bir avukata okut** (yaş sınırı 13, kullanılan hizmetler Resend + barındırma sağlayıcısı, saklama süreleri vb.).

## Çalıştırma

Gereken tek şey **Node.js 22.13 veya üstü** (ücretsiz, nodejs.org). `npm install` gerekmez: hiçbir dış paket kullanılmıyor (veritabanı için Node'un yerleşik `node:sqlite` modülü kullanılıyor).

### En kolay yol: çift tıkla

- **Windows:** zip'i klasöre çıkar, içindeki **`baslat.bat`** dosyasına çift tıkla. (Windows "bilgisayarınızı korudu" uyarısı çıkarsa **Ek bilgi → Yine de çalıştır**.) Node.js yoksa dosya sana kurmayı önerir; kurulumdan sonra `baslat.bat`'a bir kez daha çift tıkla.
- **Mac:** zip'i çıkar, **`baslat.command`** dosyasına çift tıkla. İlk seferde "açılamıyor" derse dosyaya sağ tıkla → **Aç**.
- İlk açılışta "örnek veri eklensin mi?" diye sorar (denemek için **E**vet de). Tarayıcı kendiliğinden `http://localhost:3000` adresinde açılır.
- Açılan siyah pencere **site çalıştığı sürece açık kalmalı**; kapatırsan site durur. Başlarken pencerede telefon için **aynı Wi-Fi adresi** de yazar (ör. `http://192.168.1.23:3000`).

### Komut satırıyla

```bash
cd kadro
npm start              # http://localhost:3000
```

İlk açılışta site boş görünmesin istersen demo veriyi ekle (sunucu açıkken ya da kapalıyken fark etmez):

```bash
npm run seed
```

Demo hesapların hepsinin şifresi `demo12345`. En dolu hesap **`efe`**: arkadaşları, bekleyen istekleri, iki arkadaş grubu ve birebir yazışmaları var. Diğerleri: `zeynep`, `kaan`, `derya`, `mert`, `ayse`, `can`, `selin`, `burak`, `alex_en`, `maria_de`.
Canlı mesajlaşmayı denemek için iki farklı tarayıcı (ya da bir normal, bir gizli pencere) açıp iki farklı demo hesapla gir.

Diğer komutlar:

```bash
npm run dev            # dosya değişince sunucuyu yeniden başlatır
npm test               # sunucu testleri (20 grup: e-posta doğrulama, şifre sıfırlama, moderasyon, arkadaşlık, gruplar, süre dolumu, DM kuralları, güvenlik, yedek…)
```

## Ayarlar (ortam değişkenleri)

Hepsi isteğe bağlı. `.env.example` dosyasında örnekler var (dosya otomatik okunmaz; değişkenleri terminalde ya da servis tanımında ver).

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `PORT` | `3000` | Dinlenecek port |
| `HOST` | `0.0.0.0` | Dinlenecek adres (`127.0.0.1` yaparsan sadece bu bilgisayardan erişilir) |
| `DATA_DIR` | `./data` | Veritabanı ve gizli anahtarın tutulduğu klasör |
| `DB_FILE` | `DATA_DIR/kadro.db` | Veritabanı dosyası |
| `KADRO_SECRET` | otomatik (`data/.secret`) | Oturum çerezlerini imzalayan anahtar. Birden fazla sunucu çalıştırırsan hepsinde aynı olmalı |
| `COOKIE_SECURE` | — | `1` yaparsan çerez sadece HTTPS'te gönderilir (HTTPS arkasında önerilir) |
| `TRUST_PROXY` | — | `1` yaparsan istemci IP'si `X-Forwarded-For` başlığından alınır (nginx/Caddy arkasında şart, yoksa hız sınırları herkes için tek IP sayar) |
| `RESEND_API_KEY` | — | E-posta göndermek için [Resend](https://resend.com) API anahtarı (aşağıdaki "E-posta doğrulama" bölümü) |
| `MAIL_FROM` | — | Gönderen adres, örn. `Kadro <noreply@kadro.ornek.com>` (Resend'de doğruladığın alan adından olmalı). SMTP'de boşsa `SMTP_USER`'dan üretilir |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` | — | Resend yerine SMTP ile gönderim (örn. Gmail uygulama şifresiyle; alan adı gerekmez). `SMTP_SECURE`: `tls` (465, varsayılan) ya da `starttls` (587) |
| `PUBLIC_URL` | — | Sitenin açık adresi, örn. `https://kadro.ornek.com`. E-postadaki bağlantılar ve paylaşım görseli bununla oluşur; boşsa e-postada sadece kod olur |
| `ADMIN_USERNAMES` | — | Yönetici kullanıcı adları, virgülle (örn. `efe,zeynep`). Yönetici paneli bu hesaplara açılır |
| `OPERATOR_NAME` | — | Sitenin işleticisi (adın/soyadın ya da şirket unvanı); gizlilik ve şartlar sayfalarında görünür |
| `CONTACT_EMAIL` | — | Yasal sayfalarda ve alt bilgide görünen iletişim adresi |
| `SITE_NAME` | `Kadro` | Yasal metinlerdeki site adı |
| `NODE_ENV` | — | `production` yaparsan açılışta eksik/riskli ayarlar için uyarı listesi basılır |
| `BACKUP_DIR` / `BACKUP_KEEP` / `BACKUP_EVERY_HOURS` / `BACKUP` | `DATA_DIR/backups` / `14` / `24` / açık | Otomatik yedek (aşağıda). `BACKUP=0` kapatır |
| `RATE_LIMIT_SCALE` | `1` | IP hız sınırlarını çarpar; yalnızca testlerde/yük denemesinde büyüt |

Süreler ve sınırlar (oyun grubu 12 saat, 3 aktif grup, 10/50 kişi…) `server/constants.js` içinde.

### Oyun listesi

Oyunlar `scripts/build-games.mjs` içindeki tabloda tutulur (`id | ad | kısa ad | renk`). Yeni oyun eklemek için tabloya bir satır yaz, sonra `node scripts/build-games.mjs` çalıştır; `server/games.json` yeniden üretilir ve sunucu açılışta veritabanına işler. Liste Steam'in en çok oynanan oyunları ve popüler PC çok oyunculuları (Valorant, LoL, Fortnite, Knight Online gibi Steam dışı PC oyunları dahil) ile hazırlandı; mobil ve tek kişilik oyunlar bilerek yok.

## E-posta doğrulama

Kayıtta e-posta zorunludur (aynı adresle ikinci hesap açılamaz; büyük/küçük harf fark etmez). Sunucu 6 haneli bir kod ve tek kullanımlık bir bağlantı üretir, ikisini de veritabanında yalnızca özet (HMAC) olarak saklar. Kod 24 saat geçerlidir, 5 yanlış denemede kilitlenir (yeni kod istenir), yeniden gönderme için en az 1 dakika ve saatte en fazla 5 gönderim sınırı vardır. Yanlış yazılan adres doğrulamadan önce arayüzden düzeltilebilir. Eski (e-postasız) hesaplar ve `npm run seed` demo hesapları doğrulanmış sayılır. **Şifre sıfırlama** aynı altyapıyla çalışır: "Şifremi unuttum" e-postaya 6 haneli kod + bağlantı gönderir (1 saat geçerli, 5 yanlış denemede kilitlenir); adres kayıtlı olsun olmasın aynı yanıt verilir (hesap var mı diye yoklanamaz) ve şifre değişince açık tüm oturumlar kapanır.

**E-posta gönderici ayarlı değilken** (varsayılan) hiçbir şey internete çıkmaz: e-postalar `data/outbox/` klasörüne metin dosyası olarak yazılır; kodu oradan okursun. Yerelde denemek için yeterli, ama gerçek kullanıcılar e-posta alamaz.

**Gerçek e-posta göndermek için** (siteyi başkalarına açacaksan şart) iki yol var:

- **Yol 1: Resend** (kendi alan adın varsa; teslim edilebilirlik en iyisi). Aşağıdaki 1–3 adım.
- **Yol 2: Gmail/SMTP** (alan adı gerekmez, ücretsiz). Ayrı bir Gmail hesabı aç, "2 adımlı doğrulama"yı etkinleştir, Google Hesabı > Güvenlik > **Uygulama şifreleri**'nden 16 haneli bir şifre üret ve şunları ver: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=<gmail adresi>`, `SMTP_PASS=<uygulama şifresi>`. Gönderen adres o Gmail adresi olur. Sınır: Gmail günde yaklaşık 500 ileti; çok büyürsen Yol 1'e geç. Dikkat: bazı barındırma sağlayıcıları SMTP portlarını kapatır (Render'ın ücretsiz planı ve Google Cloud 25/465/587'yi engeller; çoğu VPS'te 465/587 açıktır, ama kendi sağlayıcında dene). Açılışta "E-posta: SMTP ile gönderiliyor" yazısını görmelisin; yine de kayıt olup e-postanın gerçekten geldiğini kendin denemeden yayına çıkma.

Resend adımları:

1. [resend.com](https://resend.com) üzerinde hesap aç (ücretsiz katman küçük bir site için yeter).
2. Kendi alan adını ekle ve Resend'in verdiği DNS kayıtlarını (SPF/DKIM) alan adı sağlayıcında tanımla. Alan adı doğrulanmadan başkalarına e-posta gitmez, gidenler de spam'e düşer.
3. API anahtarı oluştur ve sunucuyu şöyle başlat:
   ```
   RESEND_API_KEY=re_xxx MAIL_FROM="Kadro <noreply@kadro.ornek.com>" PUBLIC_URL=https://kadro.ornek.com npm start
   ```
   Açılışta "E-posta: Resend ile gönderiliyor" yazısını görmelisin. Başka bir sağlayıcı (Brevo, Mailgun, SES…) kullanmak istersen yalnızca `server/mailer.js` içindeki `send` fonksiyonu değişir.

## Yayına alma rehberi

Kısa yol: **alan adı al → e-posta gönderimini (Resend) kur → siteyi bir sunucuya koy → ayarları gir → kendin dene**. Aşağıdaki "Yayın öncesi kontrol listesi"ni bitirmeden siteyi duyurma.

### 1) Gerekenler (bunları yalnızca sen yapabilirsin)

| Ne | Neden | Not |
| --- | --- | --- |
| **Alan adı** (örn. `kadro.com.tr`) | Sitenin adresi ve e-posta göndermek için | Alan adı satan herhangi bir firmadan alınır |
| **Resend hesabı** + alan adı doğrulaması | Doğrulama/şifre sıfırlama e-postası gitsin | Aşağıda "E-posta doğrulama" bölümü. Alan adın yoksa e-posta çalışmaz |
| **Sunucu** | Sitenin çalışacağı yer; **kalıcı disk** şart (veritabanı dosyası orada durur) | Seçenekler aşağıda. Ücretsiz katmanlar (örn. Render Free) kalıcı disk vermez ve boşta uyur; Kadro'nun veritabanı ve canlı mesaj bağlantıları için **uygun değildir** |
| **Gizlilik/şartlar gözden geçirme** | KVKK ve kullanıcı güveni | `public/js/legal-text.js` şablon metinlerdir |

### Yaklaşık maliyet (Ekim 2026'da kontrol edilen kamuya açık fiyatlar; yayına almadan önce sağlayıcıların sayfalarından teyit et)

| Kalem | Tutar | Not |
| --- | --- | --- |
| Alan adı | firmaya göre değişir, yılda genelde birkaç yüz TL ile birkaç dolar arası | `.com.tr` için ek belge istenebilir |
| Render Starter web servisi | ≈ 7 $/ay | Free plan kalıcı disk vermez ve ~15 dk hareketsizlikte uyur |
| Render kalıcı disk (1 GB) | ≈ 0,25 $/GB/ay | `render.yaml` 1 GB ister; büyütmek kolaydır |
| Resend (e-posta) | Ücretsiz katman: ayda 3.000, günde 100 e-posta, 1 doğrulanmış alan adı | Günde 100 sınırı = günde en fazla ~100 doğrulama/sıfırlama e-postası. Büyürsen ücretli plana geç |
| VPS (Seçenek B) | birkaç $/ay (örn. 1–2 GB RAM'li en küçük sunucular) | Kadro çok hafiftir; yedekleri ve güncellemeleri sen yönetirsin |

### 2) Seçenek A: Render.com (en az uğraşla, Docker bilmen gerekmez)

1. Projeyi bir GitHub deposuna yükle (Render depodan dağıtır).
2. Render > **New > Blueprint** > depoyu seç. `render.yaml` her şeyi (Docker, 1 GB kalıcı disk, sağlık kontrolü, HTTPS) ayarlar. Kalıcı disk ücretli plan ister.
3. Sorulan ayarları doldur: `PUBLIC_URL`, `RESEND_API_KEY`, `MAIL_FROM`, `ADMIN_USERNAMES`, `CONTACT_EMAIL`, `OPERATOR_NAME` (`KADRO_SECRET`'i Render kendisi üretir).
4. Render panelinde **Custom Domain** ekle ve alan adının DNS'inde gösterilen kaydı tanımla.
5. **Tek örnek (instance)** çalıştır; birden fazlasına çıkarma (aşağıda "Sınırlar").
6. Yayına çıkınca kontrol et: `node scripts/check-live.mjs https://kadro.ornek.com` (hesap açmaz, yalnızca okur; eksik ayarları ve HTTPS/başlık sorunlarını listeler).

### 3) Seçenek B: kendi sunucun (VPS) + Docker Compose (en ucuz, tek komut)

**En kolay yol: kurulum betiği.** Boş bir Ubuntu/Debian sunucuda (Oracle Cloud'un ücretsiz "Always Free" sunucusu, Hetzner, DigitalOcean… hepsi olur) projeyi indirip tek komut çalıştır:

```bash
git clone <depon> kadro && cd kadro && sudo bash deploy/setup-server.sh
```

Betik Docker'ı kurar, sana işleten adı / iletişim e-postası / yönetici kullanıcı adı / e-posta yolu (Gmail ya da Resend) sorularını sorup `.env` dosyasını (izinleri `600`) üretir, Kadro + Caddy'yi başlatır, https adresi açılınca `scripts/check-live.mjs` ile siteyi kontrol eder. **Alan adın yoksa** boş geç: sunucunun IP'sinden ücretsiz bir `…sslip.io` adresi üretir ve HTTPS sertifikasını Caddy kendisi alır (geçici çözümdür: adres uzun ve markasızdır, ortak bir alan adı olduğu için Let's Encrypt sınırlarına takılabilir; ciddi yayın için kendi alan adını al ve `.env`'de `DOMAIN`/`PUBLIC_URL`'u değiştirip `docker compose up -d` çalıştır). Deneme için: `KADRO_DRY_RUN=1 bash deploy/setup-server.sh` hiçbir şey kurmadan yalnızca `.env` üretir. Bulut sağlayıcının kendi güvenlik ayarında 80 ve 443 portlarını açmayı unutma.

Elle kurmak istersen: Ubuntu gibi bir Linux sunucuda Docker kurulu olsun; alan adının A kaydı sunucunun IP'sini göstersin.

```bash
git clone <depon> kadro && cd kadro      # ya da zip'i sunucuya kopyalayıp çıkar
cp .env.example .env && nano .env         # DOMAIN, PUBLIC_URL, RESEND_API_KEY, MAIL_FROM, ADMIN_USERNAMES, OPERATOR_NAME, CONTACT_EMAIL, KADRO_SECRET
docker compose up -d --build
```

`KADRO_SECRET` için `npm run secret` (ya da `openssl rand -hex 32`) çıktısını kullan. Sunucu ayağa kalkınca bilgisayarından `node scripts/check-live.mjs https://kadro.ornek.com` ile kontrol et. Caddy HTTPS sertifikasını kendisi alır ve yeniler. Güncelleme: `git pull && docker compose up -d --build`. Veriler `kadro-data` birimindedir; `docker compose down` onu silmez (`down -v` siler, dikkat).

### 4) Seçenek C: VPS, Docker'sız (systemd + Caddy)

`deploy/kadro.service` (systemd) ve `deploy/Caddyfile` örneklerine bak: Node 22.13+ kur, projeyi `/opt/kadro`'ya koy, gizli değerleri `/etc/kadro.env` dosyasına yaz (`chmod 600`), `sudo systemctl enable --now kadro`.

> **Not:** Bu depodaki Dockerfile/compose/render/systemd dosyaları, hazırlandığı ortamda Docker çalıştırılamadığı için **ilk kez senin sunucunda denenecek**. Mantıkları standarttır ama ilk dağıtımda küçük bir düzeltme gerekirse şaşırma; sorun olursa hata mesajını bana yapıştır.

### 5) Yayın öncesi kontrol listesi

Açılışta (`NODE_ENV=production` iken) sunucu eksik ayarları kırmızı uyarı olarak listeler. Hepsi temizlenmeli:

- [ ] Site **HTTPS** üzerinden açılıyor; `COOKIE_SECURE=1`, `TRUST_PROXY=1`
- [ ] `PUBLIC_URL` doğru adres
- [ ] **Gerçek bir e-postayla kayıt oldun**, doğrulama e-postası gelen kutuna (spam'e düşmeden) geldi, kod ve bağlantı çalıştı; "Şifremi unuttum" da denendi
- [ ] `ADMIN_USERNAMES` = senin kullanıcı adın; kayıt olup e-postanı doğruladıktan sonra Profil'de "Yönetici paneli" görünüyor; ikinci bir hesapla kendini şikâyet edip panelde gördün
- [ ] `OPERATOR_NAME`, `CONTACT_EMAIL` dolu; gizlilik ve şartlar sayfalarını baştan sona okudun / okuttun
- [ ] `KADRO_SECRET` ayarlı ve **kalıcı diskte** `DATA_DIR`
- [ ] Yedeklerin (`DATA_DIR/backups`) **sunucu dışına** da kopyalandığını biliyorsun (aşağıda)
- [ ] Telefonda açıp denedin (kayıt, grup kur, mesaj, ana ekrana ekle)
- [ ] Sağlayıcının sağlık kontrolü `/healthz` adresine bakıyor
- [ ] `node scripts/check-live.mjs https://kadro.ornek.com` hiç ✗ göstermiyor

### 6) Yedekleme

Sunucu **her 24 saatte bir** veritabanının tutarlı bir kopyasını `DATA_DIR/backups/kadro-YYYY-AA-GG-SS-DD.db` olarak alır (site çalışırken güvenle, SQLite `VACUUM INTO`) ve en son 14 tanesini tutar. Önemli:

- Yedekler **aynı diskte** durur; disk bozulursa onlar da gider. Düzenli olarak sunucu dışına kopyala (örn. `scp`/`rsync` ile kendi bilgisayarına ya da bir bulut deposuna).
- Yedekler **kişisel veri içerir** (e-posta adresleri, mesajlar). Güvenli sakla.
- Geri yükleme: siteyi durdur, yedek dosyasını `DATA_DIR/kadro.db` olarak koy (yanındaki `kadro.db-wal` / `kadro.db-shm` dosyalarını sil), siteyi başlat. `KADRO_SECRET` aynı kalmalı (yoksa herkes çıkış yapmış olur, başka sorun olmaz).
- Gizlilik metnindeki "yedeklerde en fazla 14 gün" cümlesi bu varsayılana göre yazıldı; ayarı değiştirirsen metni de güncelle.

### 7) Otomatik temizlik (gizlilik metniyle uyumlu)

Her 6 saatte: kapatılan şikâyetler 180 gün, yönetici işlem kaydı 1 yıl sonra silinir; e-postasını 30 gün içinde doğrulamayan hesaplar silinir. Oyun grupları 12 saat hareketsizse listeden kalkar, 3 gün sonra silinir. Bu süreleri değiştirirsen `public/js/legal-text.js` içindeki metni de güncelle.

## Bilmen gerekenler / sınırlar

- **Sesli oda yok** (bilerek kaldırıldı). Konuşmak isteyenler grupta Discord vb. bağlantısı paylaşabilir.
- **Birebir mesaj sadece arkadaşlara:** arkadaşlıktan çıkarılınca eski yazışma okunabilir ama yeni mesaj yazılamaz.
- **Tarayıcı başına 6 canlı bağlantı sınırı:** HTTP/1.1 üzerinde tarayıcılar aynı siteye en fazla 6 bağlantı açabilir; her sekme bir canlı bağlantı kullanır. Aynı tarayıcıda 6'dan fazla sekme açılırsa sonuncular takılabilir. HTTP/2 arkasında (Caddy/nginx ile HTTPS) bu sorun olmaz.
- **Steam ile giriş yok:** hesaplar e-posta + kullanıcı adı + şifre ile; Steam bağlantısı (OpenID) eklenmedi.
- **Moderasyon elle yapılır:** şikâyetleri bir insan (yönetici) panelden inceler; otomatik küfür/spam filtresi yok. Site büyürse yönetici sayısını artır (`ADMIN_USERNAMES`), gerekirse otomatik filtre ekle.
- **Tek sunucu:** canlı bağlantılar bellekte tutulur; birden fazla örnek çalıştırma. Ağırlıklı kullanım gelirse veritabanı (SQLite) ve canlı katman (Redis vb.) değişmeli.
- **Sunucu dışı yedek senin işin:** otomatik yedekler aynı diskte durur (yukarıda).
- **Güvenlik:** şifreler scrypt ile saklanır; oturum çerezi HttpOnly + SameSite=Lax; mutasyon isteklerinde Origin kontrolü; giriş ve API için IP başına hız sınırı; sohbette 10 saniyede en fazla 10 mesaj sınırı; sıkı Content-Security-Policy; sohbet metni hiçbir yerde HTML olarak yorumlanmaz; özel gruplar üye olmayanlara "yok" gibi davranır.
- Yazı tipi (Inter, SIL Open Font License) kendi sunucumuzdan sunulur (`public/fonts`); sayfalar hiçbir harici servise istek atmaz.
- **Ana ekrana ekle (PWA):** telefon/bilgisayarda "Ana ekrana ekle" ile uygulama gibi açılır. Çevrimdışıyken sohbet çalışmaz; sadece açılış kabuğu önbelleğe alınır.

## Proje yapısı

```
server/
  index.js      HTTP sunucusu, güvenlik başlıkları, hız sınırı, statik dosyalar, süresi dolan grupların temizliği
  check-node.js Eski Node sürümünde anlaşılır uyarı verir
  routes.js     Tüm API uçları (oyunlar, gruplar, sohbet, arkadaşlık, profil)
  live.js       Canlı bağlantılar (SSE), kullanıcıya özel olay dağıtımı, çevrimiçi durumu
  auth.js       Şifre özetleme, oturum belirteci
  mailer.js     E-posta gönderimi (Resend ya da data/outbox dosyaları) ve e-posta şablonları
  verification.js  Doğrulama / şifre sıfırlama kodu ve bağlantısı üretme, kontrol, gönderim sınırları
  moderation.js Engelleme, şikâyet, yönetici uçları, yasaklama, hesabı silme
  maintenance.js Otomatik yedek, süresi dolan kayıtların temizliği, yayın öncesi uyarılar
  games.json    Oyun listesi (scripts/build-games.mjs üretir)
  db.js         SQLite şeması
  http.js       Küçük yönlendirici ve yardımcılar
  constants.js  Oyun listesi, süreler ve sınırlar
public/
  index.html, css/style.css
  js/app.js          Yönlendirici, üst çubuk, alt sekme çubuğu
  js/chats.js        Sohbet listesi / okunmamış sayıları / arkadaşlık bildirimleri (canlı durum)
  js/components.js   Ortak parçalar: giriş, grup formu, grup kartı, arkadaşlık düğmeleri
  js/i18n.js         Türkçe / İngilizce metinler
  js/moderation.js   Şikâyet penceresi, engelle/engeli kaldır
  js/legal-text.js   Gizlilik politikası ve kullanım şartları metinleri (TR/EN) — şablon, gözden geçir
  js/views/*.js      Sayfalar: ana sayfa (oyun seç), oyun, sohbetler, arkadaşlar, profil, kullanıcı, admin, legal
  fonts/, manifest.webmanifest, sw.js, icon-*.png, og-image.jpg, robots.txt   Yazı tipi, PWA ve paylaşım dosyaları
scripts/seed-demo.js   Demo veri
scripts/build-games.mjs  Oyun tablosundan server/games.json üretir
baslat.bat / baslat.command   Çift tıkla başlatıcılar (Windows / Mac)
Dockerfile, docker-compose.yml, docker-entrypoint.sh, render.yaml, deploy/   Yayın dosyaları (Docker, Caddy, Render, systemd)
test/smoke.js          Sunucu testleri
```

## Sonraki adımlar (fikirler)

- Discord ya da Steam ile giriş
- Otomatik spam/küfür filtresi, yeni hesaplar için mesaj sınırı
- İki adımlı doğrulama, yönetici işlemleri için ayrı yetki seviyeleri
- Grup içinde "şu saatte oynuyoruz" gibi etkinlik/zaman önerisi
- Web push bildirimi (sekme kapalıyken mesaj gelince haber ver)
