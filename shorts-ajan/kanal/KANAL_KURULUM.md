# Merakmetre: Kanal Kurulumu (≈15 dk)

Bu klasördeki dosyalar:

| Dosya | Nereye |
|---|---|
| `profil.png` (800x800) | Profil fotoğrafı |
| `kanal-kapagi.png` (2560x1440) | Banner / kanal kapağı |
| `filigran.png` (150x150) | Video filigranı (abone ol düğmesi) |

Hepsi bilgisayardan **studio.youtube.com** adresinde yapılır (telefon uygulamasında bazı ayarlar yok).

---

## 1. Kanalı oluştur
1. youtube.com → sağ üst profil → **Kanal oluştur**.
2. Ad: `Merakmetre`, kullanıcı adı: `@merakmetre`.
   Alınmışsa sırayla şunları dene: `@merakmetre.tr`, `@merakmetretv`, `@merakmetre60`.
   Farklı bir ad aldıysan `.env` dosyasındaki `KANAL_KULLANICI` satırını da değiştir.

## 2. Studio → Özelleştirme → **Profil**
- **Resim:** `profil.png` → Yükle → kırpmayı olduğu gibi bırak → Bitti.
- **Banner resmi:** `kanal-kapagi.png` → Yükle → Bitti (yazılar her cihazda görünen güvenli alanda).
- **Video filigranı:** `filigran.png` → Görünme zamanı: **Videonun tamamında**.

## 3. Studio → Özelleştirme → **Temel bilgiler**
**Açıklama** (kopyala):
```
Gündemde ne konuşuluyorsa, en merak edilen hâliyle 60 saniyede burada. ⚡

Her gün Türkiye'nin ve dünyanın en çok aranan konularını araştırıyor, şaşırtıcı ve doğrulanmış bilgilerle kısa videolara dönüştürüyoruz. Bilim, teknoloji, uzay, doğa, spor, internet olayları… Kaydırmadan önce "bunu bilmiyordum" dedirten her şey.

📌 Her gün yeni Shorts
✅ Bilgiler kaynaklı, kaynaklar video açıklamasında
🔔 Abone ol, gündemi 60 saniyede yakala
```
- **Bağlantılar:** Instagram / TikTok hesaplarını açtıysan ekle.
- **İletişim bilgileri:** iş birliği için ayrı bir e-posta (ör. merakmetre.iletisim@gmail.com açabilirsin).
- **Yayınla**'ya bas.

## 4. Studio → Ayarlar (sol alttaki dişli)
- **Kanal → Temel bilgiler**
  - Ülke: **Türkiye**
  - Anahtar kelimeler (kopyala):
    ```
    merakmetre, gündem, ilginç bilgiler, bunları biliyor muydunuz, trend, bilim, teknoloji, uzay, shorts, merak
    ```
- **Kanal → Gelişmiş ayarlar** → Kitle: **Hayır, çocuklara özel değil.**
- **Yükleme varsayılanları** (her videoya otomatik uygulanır):
  - Açıklama: `🔔 Merakmetre: gündem 60 saniyede. Her gün yeni Shorts için abone ol.`
  - Etiketler: `merakmetre, gündem, ilginç bilgiler, shorts`
  - Kategori: **Eğitim**, video dili: **Türkçe**
  - Yorumlar: **Uygunsuz olabilecek yorumları incelemek üzere tut**
- **Topluluk → Varsayılanlar:** engellenen kelimelere hakaret ve spam kelimeleri ekle.

## 5. Hesap doğrulama (önemli)
youtube.com/verify → telefon numaranla doğrula. Böylece 15 dakikadan uzun video yükleme, özel küçük resim ve canlı yayın açılır.

## 6. Aynı adı diğer platformlarda kap
Instagram ve TikTok'ta `@merakmetre` (aynı profil fotoğrafıyla). Ajanın videoları ikisine de doğrudan yüklenebilir.

---

## İlk 2 hafta planı
- **Her gün 1–2 short.** Ajanı günde bir kez `--adet 2` ile çalıştır, iyi olanı/olanları yükle.
- **Saat:** 12:00–13:00 veya 19:00–22:00 (her `YUKLEME.md` kendi önerisini de yazar).
- **İlk 10 videodan sonra** Studio → Analytics → "İzlenme süresi yüzdesi" ve "Kaydırıp geçme" oranına bak. En çok izlenen konuların türünü `.env`'deki `KANAL_NISI`'ye yaz, ajan o yöne odaklansın.
- Yorumlara ilk saatte cevap vermek etkileşimi artırır.

## Para kazanma (YPP) eşiği
1.000 abone + son 90 günde 10 milyon geçerli Shorts izlenmesi (ya da 4.000 saat uzun video izlenmesi).
"Tekrarlayan / toplu üretilmiş içerik" sayılmamak için: tek niş, her videoda gerçekten yeni bilgi, aynı kalıbı birebir tekrar etmeyen başlıklar.
