# Otomatik yükleme: YouTube bağlantısı (bir kez, ≈10 dk)

Ajan videoları YouTube'un **resmi API'si** ile yükler. Şifreni hiçbir yere yazmazsın: Google'da kendi küçük "uygulamanı" oluşturup ona bir kez izin verirsin.

## 1. Google Cloud projesi
1. <https://console.cloud.google.com> → Merakmetre kanalının bağlı olduğu Google hesabıyla gir.
2. Üstteki proje seçici → **Yeni proje** → ad: `merakmetre` → Oluştur.
3. Sol menü → **API'ler ve Hizmetler → Kitaplık** → `YouTube Data API v3` ara → **Etkinleştir**.

## 2. İzin ekranı (OAuth)
1. Sol menü → **Google Auth Platform** (ya da "OAuth izin ekranı") → **Başlayın**.
2. Uygulama adı: `Merakmetre Yükleyici`, destek e-postası: kendi Gmail'in.
3. Kitle: **Harici (External)**. İletişim e-postası: kendi Gmail'in → Oluştur.
4. **Kitle** sekmesi → **Uygulamayı yayınla** → Onayla.
   (Bunu yapmazsan izin 7 günde bir düşer. Google doğrulaması **gerekmez**; sadece giriş sırasında bir uyarı görürsün.)

## 3. İstemci kimliği
1. **İstemciler** (Clients) → **İstemci oluştur** → Uygulama türü: **Masaüstü uygulaması** → ad: `ajan` → Oluştur.
2. **JSON'u indir** → dosyanın adını `client_secret.json` yap → `shorts-ajan` klasörüne koy (`ajan.py` ile yan yana).
   ⚠️ Bu dosyayı kimseyle paylaşma (repoya gitmez, `.gitignore`'da).

## 4. Bağlan
- **Windows:** `youtube-baglan.bat`'a çift tıkla. **Mac:** Terminal'de:
  ```
  python3 ajan.py --youtube-baglan
  ```
- Tarayıcı açılır → hesabını seç → **Merakmetre kanalını** seç (birden fazla kanal varsa) →
  "Google bu uygulamayı doğrulamadı" → **Gelişmiş → Merakmetre Yükleyici'ye git** → izinleri onayla.
- Pencerede `✅ Bağlandı: Merakmetre` yazar.

## 5. Otomatiği aç (`.env`)
```
OTOMATIK_YUKLE=evet
YUKLEME_GIZLILIK=public
YAYIN_SAATLERI=12:30,19:30
```
- `YAYIN_SAATLERI` doluysa videolar sırayla bu saatlere **zamanlanır** (ör. 3 video ürettin → yarın 12:30, yarın 19:30, öbür gün 12:30). Boş bırakırsan hemen yayınlanır.
- Her yüklenen klasöre `yuklendi.json` yazılır (link ve yayın zamanı); aynı video iki kez yüklenmez.

Elle yüklemek istersen (önce izleyip sonra yüklemek):
```
python ajan.py --yukle "cikti/<klasör>"
python ajan.py --yukle hepsi
```

---

## ⚠️ Bilmen gereken tek önemli kısıt: "gizli" kilidi
YouTube, **denetimden (audit) geçmemiş** API projelerinden yüklenen videoları otomatik olarak **Gizli (Private)** yapar. Ayarda `public` yazsa bile böyle olur.

**İki yol var:**
1. **Hemen başla (önerilen):** Ajan yükler, sen YouTube Studio uygulamasında videoya dokunup **Herkese açık** yaparsın (video başı 5 saniye).
2. **Tam otomatik:** Google'a ücretsiz denetim başvurusu yap: <https://support.google.com/youtube/contact/yt_api_form>
   - Form: "API Services Audit and Quota Extension". Kullanım amacı: *"Kendi kanalıma (Merakmetre) kendi ürettiğim videoları yüklemek için kişisel otomasyon aracı."*
   - Onay genelde birkaç gün-birkaç hafta sürer. Onaydan sonra videolar doğrudan herkese açık/zamanlanmış yayınlanır, başka bir şey değiştirmen gerekmez.

## Diğer sınırlar
- Günlük kota: ücretsiz ≈ **6 yükleme/gün** (Shorts için fazlasıyla yeterli).
- Shorts'ta kapak resmi API ile ayarlanamaz; YouTube videodan bir kare seçer.

## Her gün tamamen otomatik
**Windows Görev Zamanlayıcı** → Temel Görev Oluştur → Ad: `Merakmetre` → **Günlük**, saat 09:00 →
Program başlat → Program: `python` → Bağımsız değişkenler: `ajan.py --adet 2` → Başlangıç yeri: `shorts-ajan` klasörünün yolu.
Bilgisayar o saatte açık olmalı. Ajan her sabah 2 video üretir, yükler ve 12:30 / 19:30'a zamanlar.
