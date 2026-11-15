# Atatürk'ün Son Sözü (60 saniyelik YouTube Shorts)

**Dosya:** `ataturk-son-sozu-shorts.mp4`
1080×1920 (9:16) · 30 fps · tam 60,0 sn · H.264 High + AAC 256 kbps / 48 kHz · ses yüksekliği -14 LUFS (YouTube standardı) · filigran yok.

`onizleme.jpg`: videodan 5 saniyede bir alınmış kareler.

## Sahne akışı

| Zaman | Görsel | Ekran yazısı |
|---|---|---|
| 00:00–00:07 | 1932 portresi, gözlere doğru yavaş yakınlaşma | ATATÜRK'ÜN **SON SÖZÜ** NEYDİ? |
| 00:07–00:19 | Dolmabahçe Sarayı: 1924 (Agence Rol) ve 1890'lar (LOC) fotoğrafları, saat tıkırtısı | 8 KASIM 1938 — DOLMABAHÇE |
| 00:19–00:32 | Adana ziyareti (1938) ve geç dönem portresi, giderek kararır; müzik yükselir | — |
| 00:32–00:44 | Portre karanlığa gömülür; 1,8 sn sessizlik, ardından | **ALEYKÜMSELÂM** |
| 00:44–00:54 | Dolmabahçe; Kasım 1938'de Dolmabahçe önünde yas tutanlar; Türk bayrağına sarılı tabut (19 Kasım 1938) | 10 KASIM 1938 · 09.05 |
| 00:54–01:00 | Kalpaklı portre, üstte yavaşça beliren dalgalanan Türk bayrağı | 1881 ∞ 1938 · SONSUZA DEK ATATÜRK |

Altyazılar seslendirmeyle cümle cümle eşlenmiştir (beyaz, önemli kelimeler kırmızı).

## Görsel kaynakları (hepsi Wikimedia Commons, gerçek arşiv fotoğrafları)

| Dosya | Tarih / kaynak | Lisans |
|---|---|---|
| Ataturk1930s.jpg | 29 Mart 1932 | PD-TR |
| Atatürk Kemal.jpg | 1930'lar | PD-Turkey |
| Dolma Bagtche … (CNews) - btv1b53131462n.jpg | 1924, Agence Rol / BnF Gallica | PD-France / PD-US-expired |
| Dolmabahçe Palace, Constantinople, Turkey LOC 4210464767.jpg | ~1890, Library of Congress | No known copyright restrictions |
| Ataturk visited Adana.jpg | 1938, Cumhurbaşkanlığı arşivi | PD-TR |
| Ataturk-1938-funeral-public.jpg | Kasım 1938, MEB "Fotoğraflarla Atatürk" | PD-Turkey |
| Atatürk's Funeral, November 19, 1938. (16221077935).jpg | 19 Kasım 1938, SALT Araştırma | No known copyright restrictions |
| Mustafa Kemal Atatürk (white balance).png | 1923 (yalnızca beyaz ayarı düzeltilmiş) | PD-US-expired |
| Flag of Turkey.svg | Resmî ölçülerde Türk bayrağı | Kamu malı |

Yapay zekâyla üretilmiş ya da "restore edilmiş" hiçbir görsel kullanılmadı. Görüntülere yalnızca siyah-beyaz film dokusu, kırpma, kamera hareketi ve geçiş eklendi.

## Ses

- **Seslendirme:** Microsoft'un Türkçe nöral sesi `tr-TR-AhmetNeural`, `edge-tts` ile üretildi. Her cümle bütün halinde, sesin kendi doğal perdesi ve tonlamasıyla okundu (yapay pitch değişikliği yok). Dramatik duraksamalar sonradan, kelime zaman damgaları kullanılarak kelime aralarına eklendi. "Aleykümselâm"dan önce 1,7 sn sessizlik var; kelime hafifçe yavaşlatılıp kısıldı. Atatürk'ün sesi taklit edilmedi; videoda gerçek olmayan bir ses kaydı da yok.
- **Müzik:** `uretim/music.py` ile kodla sentezlenmiş, tamamen özgün piyano ve yaylı çalgı müziği (La minör). Telif ya da Content ID riski yok. Başta hafif, 30. saniyeden sonra yükseliyor, son 10 saniyede sönüyor. Konuşma sırasında müzik otomatik olarak 7 dB kısılıyor.

> **Para kazanma notu:** Edge "sesli okuma" uç noktası Microsoft'un ticari bir lisansı değildir. Kanal para kazanıyorsa aynı sesi kendi Azure Speech aboneliğinizle üretin (aynı `tr-TR-AhmetNeural`, ses birebir aynı çıkar) ya da metni gerçek bir seslendirmeni okutup `uretim/` içindeki akışla yeniden derleyin.

## Tarihî not

"Aleykümselâm" sözü, son günlerinde Atatürk'ün yanında bulunanların hatıralarına dayanır. Kaynaklarda farklı aktarımlar da vardır. Bu yüzden videoda söz "Tanıklıklara göre…" ifadesiyle, bir aktarım olarak sunuluyor. Diğer bilgiler (8 Kasım 1938'deki ikinci koma, ölümün 10 Kasım 1938 saat 09.05'te Dolmabahçe'de gerçekleşmesi) genel kabul görmüş tarihî bilgilerdir.

## YouTube için önerilen metin

**Başlık:** Atatürk'ün Son Sözü Neydi? 🇹🇷 #10Kasım

**Açıklama:**
```
8 Kasım 1938, Dolmabahçe Sarayı… Tanıklıklara göre Mustafa Kemal Atatürk'ün komaya girmeden önce söylediği son söz: "Aleykümselâm."
Saygıyla, özlemle ve minnetle anıyoruz. 1881 ∞ 1938

Görseller: Wikimedia Commons (kamu malı arşiv fotoğrafları: BnF Gallica / Agence Rol 1924, Library of Congress, SALT Araştırma, T.C. Cumhurbaşkanlığı ve MEB arşivleri).
Müzik: özgün beste.

#Atatürk #10Kasım #Dolmabahçe #tarih #shorts
```

## Yeniden üretme

`uretim/` klasöründe: `tts2.py` (seslendirme, duraksamalar ve altyazı zamanları) → `music.py` (müzik) → `build.sh` (zaman çizelgesi, miks, -14 LUFS normalizasyon, render, MP4). Görseller `dl/`, yazı tipleri `fonts/` klasöründe beklenir: Cinzel, Playfair Display ve Montserrat (SIL OFL, npm `@expo-google-fonts/*` paketlerinden). Sahne kurgusu `images.json`, metin ve zamanlamalar `make_timeline.py` içindedir.
