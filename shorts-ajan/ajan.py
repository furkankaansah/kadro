"""YouTube Shorts Ajanı
Trendleri araştırır -> en iyi konuyu seçer -> senaryo yazar -> seslendirir -> telifsiz görüntü bulur
-> kurgular (altyazı, vurgu, müzik, ses seviyesi) -> yüklemeye hazır klasör teslim eder.

Kullanım:
  python ajan.py                    # trendlerden 1 short
  python ajan.py --adet 3           # 3 farklı konu, 3 short
  python ajan.py --konu "Mars'ta su" # konuyu sen ver, ajan araştırıp yapsın
  python ajan.py --plan cikti/.../plan.json   # senaryoyu elle düzelttikten sonra yeniden kurgula
  python ajan.py --deneme           # internet/API olmadan montajı dene
  python ajan.py --youtube-baglan   # kanala bir kez izin ver (otomatik yükleme için)
  python ajan.py --yukle cikti/...  # hazır videoyu yükle  (--yukle hepsi = yüklenmemiş tümü)
"""
import argparse
import json
import re
import shutil
import sys
import time
import unicodedata
from datetime import datetime
from pathlib import Path

from ajan import ayarlar, beyin, gorsel, montaj, ses, trendler

GECMIS = ayarlar.CIKTI / "gecmis.json"


def _kisa(metin: str) -> str:
    m = unicodedata.normalize("NFKD", metin.replace("ı", "i").replace("İ", "I"))
    m = re.sub(r"[^a-zA-Z0-9]+", "-", m.encode("ascii", "ignore").decode()).strip("-").lower()
    return m[:40] or "short"


def _gecmis_oku() -> list[str]:
    try:
        return json.loads(GECMIS.read_text(encoding="utf-8"))
    except Exception:
        return []


def _gecmis_ekle(konu: str) -> None:
    g = _gecmis_oku() + [konu]
    GECMIS.parent.mkdir(parents=True, exist_ok=True)
    GECMIS.write_text(json.dumps(g[-200:], ensure_ascii=False, indent=1), encoding="utf-8")


def yayin_bilgisi(plan: beyin.ShortPlani) -> tuple[str, str, list[str]]:
    """YouTube'a gidecek başlık, açıklama (hashtag'li) ve etiketler."""
    etiketler = [h.lstrip("#").replace(" ", "") for h in plan.hashtagler if h.strip()]
    if "shorts" not in [e.lower() for e in etiketler]:
        etiketler.append("shorts")
    hashtag = " ".join(f"#{h}" for h in etiketler[:5])
    imza = ""
    if ayarlar.KANAL_ADI:
        imza = f"\n\n🔔 {ayarlar.KANAL_ADI}: gündem 60 saniyede. Her gün yeni Shorts için abone ol."
    aciklama = f"{plan.aciklama.strip()}{imza}\n\n{hashtag}"
    if plan.kaynaklar:
        aciklama += "\n\nKaynaklar:\n" + "\n".join(plan.kaynaklar[:5])
    tags = list(dict.fromkeys(([ayarlar.KANAL_ADI] if ayarlar.KANAL_ADI else []) + plan.etiketler))
    return plan.baslik.strip(), aciklama, tags


def yukleme_notu(plan: beyin.ShortPlani, sure: float, klip_kaynaklari: list[str]) -> str:
    _, aciklama, _ = yayin_bilgisi(plan)
    kaynak = "\n".join(f"- {k}" for k in plan.kaynaklar) or "- (yok)"
    klipler = "\n".join(f"- {k}" for k in dict.fromkeys(klip_kaynaklari) if k) or "- (animasyonlu arka plan kullanıldı)"
    return f"""# YÜKLEMEYE HAZIR ✅

**Video:** `video.mp4` (1080x1920, {sure:.0f} sn, H.264 + AAC, -14 LUFS)
**Kapak:** `kapak.jpg`

---

## Başlık (kopyala)
```
{plan.baslik.strip()}
```

## Açıklama (kopyala)
```
{aciklama}
```

## Etiketler (kopyala)
```
{", ".join(plan.etiketler)}
```

---

## Yükleme adımları (YouTube uygulaması veya studio.youtube.com)
1. **Oluştur (+) → Short yükle** → `video.mp4` seç.
2. Başlığı ve açıklamayı yapıştır. (Uygulamada etiket alanı yok; Studio'da "Daha fazla göster → Etiketler".)
3. **Çocuklar için mi?** → Hayır.
4. **Değiştirilmiş/yapay içerik** sorusu: video gerçek bir kişiyi/olayı gerçekçi şekilde taklit etmiyor,
   sadece yapay zekâ seslendirmesi + stok görüntü → genelde **Hayır**. Emin değilsen "Evet" demek zarar vermez.
5. Kapak: Shorts'ta kapak videodaki bir kareden seçilir; `kapak.jpg` topluluk gönderisi/diğer platformlar içindir.
6. Önerilen yayın saati: **{plan.en_iyi_yayin_saati}**

## Yayından önce 30 saniyelik kontrol
- [ ] Videoyu bir kez izle (ses, altyazı, görüntü uyumu).
- [ ] Doğruluk notu: {plan.dogruluk_notu}

---

**Konu:** {plan.konu}
**Neden trend:** {plan.neden_trend}

### Bilgi kaynakları
{kaynak}

### Kullanılan stok görüntüler (Pexels, ücretsiz lisans)
{klipler}

### Senaryo
**Kanca:** {plan.kanca}
""" + "\n".join(f"{i + 1}. {s.metin}" for i, s in enumerate(plan.sahneler)) + f"\n\n**Kapanış:** {plan.kapanis}\n"


def uret(plan: beyin.ShortPlani, klasor: Path) -> Path:
    gecici = klasor / "gecici"
    gecici.mkdir(parents=True, exist_ok=True)
    beyin.plan_kaydet(plan, klasor / "plan.json")

    metinler = [plan.kanca] + [s.metin for s in plan.sahneler] + [plan.kapanis]
    sorgular = [plan.sahneler[0].gorsel_arama] + [s.gorsel_arama for s in plan.sahneler] + [plan.sahneler[-1].gorsel_arama]
    vurgular = [""] + [s.vurgu for s in plan.sahneler] + [""]

    print("  🎙  Seslendiriliyor…")
    # tonlama: kanca enerjik, kapanış sakin; kancadan sonra ve kapanıştan önce kısa dramatik durak
    tonlar = ([ses.Ton(hiz="+14%", perde="+2Hz", sonra_bosluk=0.30)]
              + [ses.Ton(sonra_bosluk=0.16) for _ in plan.sahneler[:-1]]
              + [ses.Ton(sonra_bosluk=0.32)]
              + [ses.Ton(hiz="+2%", perde="-2Hz", sonra_bosluk=0.12)])
    telaffuz = ses.Telaffuz.yukle(plan.telaffuz)
    ses_dosyasi, parcalar = ses.seslendir(metinler, gecici, tonlar, telaffuz)

    print("  🎬 Görüntüler bulunuyor ve kesiliyor…")
    kullanilan, sahne_dosyalari, kaynaklar = set(), [], []
    for i, (p, sorgu) in enumerate(zip(parcalar, sorgular)):
        sure = p.sonraki - p.bas + (0.3 if i == len(parcalar) - 1 else 0)
        bulunan = gorsel.klip_bul(sorgu, sure, kullanilan)
        klip = bulunan[0] if bulunan else None
        if bulunan:
            kaynaklar.append(bulunan[1])
        hedef = gecici / f"sahne{i:02d}.mp4"
        montaj.sahne_videosu(klip, sure, hedef, i)
        sahne_dosyalari.append(hedef)
        print(f"     {i + 1}/{len(parcalar)} {'📹 ' + sorgu if klip else '🎨 animasyonlu arka plan'}")

    print("  ✍️  Altyazılar ve son montaj…")
    ass = gecici / "altyazi.ass"
    montaj.altyazi_yaz(parcalar, vurgular, ass)
    video = klasor / "video.mp4"
    kesimler = [p.bas for p in parcalar[1:]]
    toplam = montaj.birlestir(sahne_dosyalari, ses_dosyasi, ass, gecici, video, kesimler)
    montaj.kapak(gecici / "ham.mp4", plan.kapak_yazisi, klasor / "kapak.jpg")

    (klasor / "YUKLEME.md").write_text(yukleme_notu(plan, toplam, kaynaklar), encoding="utf-8")
    shutil.rmtree(gecici, ignore_errors=True)
    return video


def klasor_yukle(klasor: Path, etkilesimli: bool = False) -> bool:
    """Bir çıktı klasörünü YouTube'a yükler. Zaten yüklendiyse atlar."""
    from ajan import youtube

    kayit = klasor / "yuklendi.json"
    if kayit.exists():
        print(f"  – Zaten yüklendi: {json.loads(kayit.read_text(encoding='utf-8'))['url']}")
        return False
    video, plan_dosyasi = klasor / "video.mp4", klasor / "plan.json"
    if not video.exists() or not plan_dosyasi.exists():
        print(f"  ✗ {klasor.name}: video.mp4 veya plan.json yok")
        return False
    baslik, aciklama, etiketler = yayin_bilgisi(beyin.plan_yukle(plan_dosyasi))
    print(f"  📤 YouTube'a yükleniyor: {baslik}")
    sonuc = youtube.yukle(video, baslik, aciklama, etiketler, etkilesimli=etkilesimli)
    kayit.write_text(json.dumps(sonuc, ensure_ascii=False, indent=2), encoding="utf-8")
    zaman = "hemen yayında" if sonuc["yayin_zamani"] == "hemen" else f"yayın zamanı {sonuc['yayin_zamani'][:16]}"
    print(f"  ✅ {sonuc['url']}  ({sonuc['gizlilik']}, {zaman})")
    return True


def ornek_plan() -> beyin.ShortPlani:
    S = beyin.Sahne
    return beyin.ShortPlani(
        konu="Deneme: Ahtapotların üç kalbi", neden_trend="Deneme modu",
        kanca="Bu hayvanın tam üç kalbi var.",
        sahneler=[
            S(metin="Ahtapotun iki kalbi solungaçlara kan pompalar.", gorsel_arama="octopus underwater", vurgu="2 KALP"),
            S(metin="Üçüncüsü ise bütün vücuda.", gorsel_arama="ocean reef", vurgu="+1"),
            S(metin="Ve kanları kırmızı değil, mavi.", gorsel_arama="blue water", vurgu="MAVİ KAN"),
            S(metin="Çünkü bakır bazlı bir protein taşıyor.", gorsel_arama="laboratory", vurgu=""),
            S(metin="Yüzerken ana kalp duruyor, o yüzden sürünmeyi tercih ediyorlar.", gorsel_arama="octopus crawling", vurgu=""),
        ],
        kapanis="Peki sence hangi hayvanın kaç kalbi var?",
        baslik="Bu hayvanın 3 kalbi ve mavi kanı var", aciklama="Ahtapotlar hakkında şaşırtıcı bir bilgi.",
        hashtagler=["ahtapot", "bilgi", "doğa"], etiketler=["ahtapot", "ilginç bilgiler"],
        kapak_yazisi="3 KALP MAVİ KAN", kaynaklar=[], dogruluk_notu="Deneme videosu.",
        en_iyi_yayin_saati="19:00-21:00",
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="YouTube Shorts Ajanı")
    ap.add_argument("--adet", type=int, default=1, help="kaç short üretilsin (varsayılan 1)")
    ap.add_argument("--konu", help="belirli bir konu (boş = trendlerden seç)")
    ap.add_argument("--plan", help="var olan plan.json'dan yeniden kurgula")
    ap.add_argument("--deneme", action="store_true", help="API/internet olmadan montaj denemesi")
    ap.add_argument("--yukle", metavar="KLASOR", help="hazır bir klasörü YouTube'a yükle ('hepsi' = yüklenmemiş tümü)")
    ap.add_argument("--youtube-baglan", action="store_true", help="YouTube kanalına bir kez izin ver")
    a = ap.parse_args()

    if a.youtube_baglan:
        from ajan import youtube
        print(f"✅ Bağlandı: {youtube.baglan()}  (artık videolar otomatik yüklenebilir)")
        return
    if a.yukle:
        hedefler = (sorted(k for k in ayarlar.CIKTI.iterdir() if (k / "video.mp4").exists())
                    if a.yukle == "hepsi" else [Path(a.yukle)])
        for k in hedefler:
            try:
                klasor_yukle(k, etkilesimli=True)
            except Exception as e:
                print(f"  ✗ {k.name}: {e}")
        return

    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg bulunamadı. Kurulum: Windows 'winget install ffmpeg', Mac 'brew install ffmpeg'.")

    damga = datetime.now().strftime("%Y-%m-%d_%H%M")
    baslangic = time.time()

    if a.deneme or a.plan:
        if a.deneme:
            import os
            os.environ.setdefault("SES_MOTORU", "deneme")
        plan = beyin.plan_yukle(Path(a.plan)) if a.plan else ornek_plan()
        klasor = ayarlar.CIKTI / f"{damga}_{_kisa(plan.baslik)}"
        print(f"▶ {plan.baslik}")
        print(f"✅ Hazır: {uret(plan, klasor).parent}")
        return

    print("🔎 1/3 Trend kaynakları taranıyor…")
    tohumlar = trendler.topla()
    print("🧠 2/3 Claude web'de araştırıyor ve en iyi konuları seçiyor (1-3 dk)…")
    arastirma = beyin.arastir(tohumlar, a.adet, _gecmis_oku(), a.konu)
    adet = 1 if a.konu else a.adet

    print(f"🎞  3/3 {adet} short üretiliyor…")
    otomatik = ayarlar.al("OTOMATIK_YUKLE").lower() in ("evet", "1", "true", "yes")
    teslim = []
    for i in range(1, adet + 1):
        try:
            plan = beyin.senaryo_yaz(arastirma, i)
            klasor = ayarlar.CIKTI / f"{damga}_{i:02d}_{_kisa(plan.baslik)}"
            klasor.mkdir(parents=True, exist_ok=True)
            (klasor / "arastirma.md").write_text(arastirma, encoding="utf-8")
            print(f"\n▶ [{i}/{adet}] {plan.baslik}")
            uret(plan, klasor)
            _gecmis_ekle(plan.konu)
            teslim.append(klasor)
            if otomatik:
                try:
                    klasor_yukle(klasor)
                except Exception as e:
                    print(f"  ⚠ Video hazır ama yüklenemedi: {e}\n    Sonra dene: python ajan.py --yukle \"{klasor}\"")
        except Exception as e:
            print(f"  ✗ Short {i} üretilemedi: {e}")

    print(f"\n{'=' * 60}\n✅ {len(teslim)} short hazır ({(time.time() - baslangic) / 60:.1f} dk):")
    for k in teslim:
        print(f"   📁 {k}\n      → video.mp4 + kapak.jpg + YUKLEME.md (başlık/açıklama/etiketler)")


if __name__ == "__main__":
    main()
