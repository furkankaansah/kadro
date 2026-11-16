# Shorts Ajanı 🎬

Tek komutla: **trendleri araştırır → en iyi konuyu seçer → senaryo yazar → seslendirir → telifsiz görüntü bulur → kurgular → yüklemeye hazır teslim eder.**

```
cikti/2026-11-16_1930_01_bu-hayvanin-3-kalbi-var/
├── video.mp4      ← 1080x1920, 35-50 sn, altyazılı, müzikli, YouTube ses seviyesinde
├── kapak.jpg      ← büyük yazılı kapak görseli
├── YUKLEME.md     ← kopyala-yapıştır başlık, açıklama, hashtag, etiket + yükleme adımları
├── plan.json      ← senaryo (istersen düzelt, yeniden kurgula)
└── arastirma.md   ← ajanın bulduğu trendler, bilgiler ve kaynak linkleri
```

## Ajan ne yapıyor?

| Adım | Nasıl |
|---|---|
| 1. Trend tarama | Google Trends (Türkiye + global), Reddit'te günün en popülerleri, (anahtar varsa) YouTube trendleri |
| 2. Araştırma | Claude (Opus 5.5) web'de arama yapıp **gerçekten şu an trend olanı** doğrular, bilgileri kaynaklarıyla toplar, viral olma puanı verir. Felaket/ölüm haberleri, siyasi kavga, doğrulanamayan söylenti, telifli içerik gerektiren konular elenir. Daha önce yaptığın konular tekrar edilmez. |
| 3. Senaryo | İlk 1,5 saniyede kanca, kısa cümleler, merak boşluğu, başa dönen kapanış (tekrar izlenme için). Sadece araştırmadaki doğrulanmış bilgiler. |
| 4. Seslendirme | Microsoft neural ses (ücretsiz, edge-tts): Türkçe erkek/kadın ses seçilebilir |
| 5. Görüntü | Pexels'ten her sahneye uygun **telifsiz dikey** stok video (anahtar yoksa animasyonlu renkli arka plan) |
| 6. Kurgu | Dikey kırpma + hafif kaydırma, kelime kelime sarı vurgulu büyük altyazı, sahne vurgu yazıları, üstte ilerleme çubuğu, müzik (konuşmada otomatik kısılır), -14 LUFS ses |
| 7. Teslim | `video.mp4` + `kapak.jpg` + `YUKLEME.md` |

## Kurulum (bir kez, ~5 dk)

1. **API anahtarları** (ikisi de birkaç dakika):
   - **Claude** (zorunlu): <https://console.anthropic.com> → API Keys. Tahmini maliyet: bir çalıştırma ≈ 0,2–0,6 $ (web araması dahil; konsoldan harcama limiti koyabilirsin).
   - **Pexels** (ücretsiz, şiddetle önerilir): <https://www.pexels.com/api/> → kayıt ol → anahtarı kopyala.
2. **Windows:** `baslat.bat`'a çift tıkla. Python/ffmpeg yoksa kendisi kurar; `.env` dosyasını açar → anahtarları yapıştır, kaydet, tekrar çift tıkla.
   **Mac:** `brew install ffmpeg`, sonra `baslat.command`'a çift tıkla.
3. Sorular: "Kaç short?" → Enter. "Konu?" → boş bırak (ajan seçsin) ya da bir konu yaz.
4. Bitince `cikti` klasörü açılır. `YUKLEME.md`'yi aç, adımları izle, yükle. ✅

### Komut satırından

```bash
pip install -r requirements.txt
```

```bash
python ajan.py --adet 3
```

```bash
python ajan.py --konu "James Webb'in yeni fotoğrafı"
```

```bash
python ajan.py --plan "cikti/<klasör>/plan.json"
```
(Senaryoyu `plan.json` içinde düzelttikten sonra aynı videoyu yeniden kurgular, API harcamaz.)

```bash
python ajan.py --deneme
```
(İnternet/API olmadan kurgu motorunu dener.)

## Ayarlar (`.env`)

| Ayar | Ne işe yarar |
|---|---|
| `KANAL_NISI` | Kanalın konusu, ör. `teknoloji ve bilim`, `ilginç bilgiler`, `futbol`. **Tek nişte kalan kanallar çok daha hızlı büyür** — doldurman önerilir. |
| `KANAL_DILI` / `ULKE` | `tr`/`TR` veya `en`/`US` (İngilizce kanal için `SES=en-US-AndrewNeural`) |
| `SES` | `tr-TR-AhmetNeural` (erkek) / `tr-TR-EmelNeural` (kadın) |
| `SES_HIZI` | `+8%` varsayılan; Shorts'ta hafif hızlı konuşma tutar |
| `ALTYAZI_FONT` | Bilgisayarında yüklü kalın bir yazı tipi (Windows: `Arial Black`) |
| `muzik/` klasörü | Telifsiz `.mp3` koyarsan rastgele biri arka plana eklenir (YouTube Ses Kitaplığı önerilir) |

## Her gün otomatik

- **Windows:** Görev Zamanlayıcı → Temel Görev → Günlük → Program: `python`, Bağımsız değişkenler: `ajan.py --adet 2`, Başlangıç: bu klasör.
- **Mac/Linux:** `crontab -e` → `0 9 * * * cd /yol/shorts-ajan && python3 ajan.py --adet 2`

## Dürüst notlar

- Ajan videoyu **yüklemeye hazır** teslim eder ama yayınlamaz: yüklemeden önce bir kez izle (30 sn). Trend haberlerde bilgi hızlı değişir; `YUKLEME.md`'deki **doğruluk notu** ve kaynaklar bunun için var.
- Görüntüler Pexels lisanslı (ticari kullanım serbest), ses Microsoft neural TTS, müzik senin koyduğun telifsiz dosyalar → telif hakkı ihlali riski düşük.
- YouTube "tekrarlayan/toplu üretilmiş içerik"i para kazanmadan (YPP) çıkarabilir. Bir niş seç, haftada birkaç kaliteli video yeterli; günde 10 alakasız video **değil**.
