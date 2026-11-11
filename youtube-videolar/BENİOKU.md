# Ünlülerin Hayat Hikâyeleri: YouTube Belgesel Seti

Her kişinin kendi klasörü var: `videolar/<NNN_Ad_Soyad>/`

| Dosya | Ne işe yarar |
|---|---|
| `NNN_Ad_Soyad.mp4` | Ana video (10–15 dk, 1280×720, Türkçe seslendirme, bölüm başlıkları, Ken Burns efektli görseller) |
| `NNN_Ad_Soyad_FRAGMAN.mp4` | Yaklaşık 1 dakikalık fragman |
| `kapak_thumbnail.jpg` | YouTube kapak görseli (1280×720) |
| `youtube_baslik.txt` | Video başlığı |
| `youtube_aciklama.txt` | Açıklama: özet, **zaman damgalı bölümler**, kaynaklar, hashtag'ler |
| `youtube_etiketler.txt` | Etiketler (virgülle ayrılmış, doğrudan YouTube'a yapıştırılır) |
| `fragman_youtube.txt` | Fragmanın başlığı, açıklaması ve etiketleri |
| `altyazi_tr.srt` | Türkçe altyazı (YouTube > Altyazılar > Dosya yükle) |
| `sabit_yorum_gorsel_lisanslari.txt` | Görsellerin yazar/lisans listesi. Sabit yorum olarak ekle (CC BY-SA görseller için atıf zorunlu) |
| `senaryo.md` | Bölüm bölüm tam metin |
| `seslendirme_metni.txt` | Kendi sesinle okumak için bölüm bölüm metin |
| `kendi_sesim/` | Kendi kayıtlarını buraya koyarsın (aşağıya bak) |

## Kendi sesinle (gerçek insan sesi) yeniden üretme
1. `seslendirme_metni.txt` dosyasını aç. Her bölüm için ayrı bir kayıt yap: `00.mp3`, `01.mp3`, … ve `fragman.mp3`.
   (.wav ve .m4a da olur.)
2. Kayıtları o kişinin `kendi_sesim/` klasörüne koy.
3. Şu komutu çalıştır (bilgisayarında Python 3, ffmpeg ve `pip install pillow edge-tts` gerekli):
   ```
   cd youtube-videolar/arac
   python3 uret.py ../senaryolar/001_nikola_tesla.txt
   ```
   Kaydı olan bölümler senin sesinle, olmayanlar yapay sesle üretilir. Videonun süresi ve bölüm zaman damgaları kayıtlarına göre kendiliğinden ayarlanır.

## Yeni kişi ekleme
`senaryolar/` klasörüne mevcut dosyalardaki biçimde yeni bir `.txt` ekle, sonra `python3 uret.py --hepsi` komutunu çalıştır.
Görseller Wikimedia Commons'tan dosya adıyla çekilir (`arac/gorsel_listele.py "Kategori Adı"` komutuyla listelenir).

## Doğruluk ve telif notları
- Metinler yerleşik kaynaklara (açıklamalarda listelenen biyografiler, resmî kurum siteleri) dayanır. Yalnızca hatıraya
  dayanan ya da tartışmalı anlatımlar videoda "anlatılana göre" ve "efsaneye göre" gibi ifadelerle ayrıca belirtilmiştir.
  Yayından önce kendin de gözden geçirmeni öneririm.
- Görsellerin hepsi Wikimedia Commons'tan, kamu malı veya Creative Commons lisanslıdır. CC BY / CC BY-SA görseller için
  `sabit_yorum_gorsel_lisanslari.txt` içindeki atıfları yayımlaman gerekir.
- Seslendirme yapay sestir (Microsoft Edge "tr-TR-AhmetNeural"). YouTube, gerçekçi yapay içerik için "değiştirilmiş veya sentetik içerik" beyanı isteyebilir. Yükleme sırasında bu soruyu kontrol et.
- Video arka plan müziği içermez. İstersen YouTube Studio'daki Ses Kitaplığı'ndan telifsiz müzik ekleyebilirsin.

Sıradaki kişiler: `SIRADAKI_KISILER.txt`
