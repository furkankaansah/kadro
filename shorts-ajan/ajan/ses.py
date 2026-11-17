"""Seslendirme: edge-tts (ücretsiz Microsoft neural sesler) + kelime kelime zamanlama (altyazı için).

Gerçekçilik için:
- Telaffuz sözlüğü: altyazıda doğru yazım ("Voyager"), seste Türkçe okunuş ("Voyacır").
- Tonlama: kanca daha enerjik/hızlı, kapanış daha sakin; parçalar arası doğal duraklar.
"""
import asyncio
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from . import ayarlar

BOSLUK = 0.12  # varsayılan parçalar arası nefes payı (sn)


@dataclass
class Kelime:
    metin: str
    bas: float
    son: float


@dataclass
class Parca:
    bas: float
    son: float
    kelimeler: list[Kelime]
    sonraki: float = 0.0  # bir sonraki parçanın başladığı an (duraklama dahil)


@dataclass
class Ton:
    hiz: str = ""          # "" = ayarlar.SES_HIZI
    perde: str = "+0Hz"
    sonra_bosluk: float = BOSLUK


@dataclass
class Telaffuz:
    """'Yazılış=Okunuş' kuralları. Ek/çekim korunur: Voyager'ın -> Voyacır'ın."""
    kurallar: dict[str, str] = field(default_factory=dict)

    @classmethod
    def yukle(cls, ek: list[str] | None = None) -> "Telaffuz":
        satirlar = []
        dosya = ayarlar.KOK / "telaffuz.txt"
        if dosya.exists():
            satirlar += dosya.read_text(encoding="utf-8").splitlines()
        satirlar += ek or []
        kurallar = {}
        for s in satirlar:
            s = s.strip()
            if s and not s.startswith("#") and "=" in s:
                yazi, okunus = (x.strip() for x in s.split("=", 1))
                if yazi and okunus:
                    kurallar[yazi] = okunus
        return cls(kurallar)

    def kelime(self, w: str) -> str:
        # en uzun eşleşen kural; kelimenin başından eşleşir, kalan ek korunur
        for yazi in sorted(self.kurallar, key=len, reverse=True):
            if w.lower().startswith(yazi.lower()):
                kalan = w[len(yazi):]
                if not kalan or not kalan[0].isalnum() or kalan[0] in "'’":
                    return self.kurallar[yazi] + kalan
        return w


def sure(yol: Path) -> float:
    cikti = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(yol)],
        capture_output=True, text=True, check=True,
    ).stdout
    return float(cikti.strip())


async def _edge(metin: str, hedef: Path, ton: Ton) -> list[Kelime]:
    import edge_tts

    # Kurumsal ağ/proxy arkasında: sistemin CA dosyası verildiyse onu kullan
    ca = ayarlar.al("SSL_CERT_FILE")
    if ca:
        import ssl

        import edge_tts.communicate as _c
        _c._SSL_CTX = ssl.create_default_context(cafile=ca)

    iletisim = edge_tts.Communicate(metin, ayarlar.SES, rate=ton.hiz or ayarlar.SES_HIZI,
                                    pitch=ton.perde, boundary="WordBoundary")
    kelimeler = []
    with open(hedef, "wb") as f:
        async for parca in iletisim.stream():
            if parca["type"] == "audio":
                f.write(parca["data"])
            elif parca["type"] == "WordBoundary":
                bas = parca["offset"] / 1e7
                kelimeler.append(Kelime(parca["text"], bas, bas + parca["duration"] / 1e7))
    return kelimeler


def _deneme_sesi(metin: str, hedef: Path) -> list[Kelime]:
    """Ağ olmadan montajı denemek için: konuşma yerine sessizlik, tahmini kelime süreleri."""
    kelimeler, t = [], 0.05
    for k in metin.split():
        d = 0.08 + 0.055 * len(k)
        kelimeler.append(Kelime(k, t, t + d))
        t += d + 0.04
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
         "-t", f"{t + 0.1:.2f}", "-c:a", "libmp3lame", str(hedef)], check=True)
    return kelimeler


def _sade(w: str) -> str:
    return re.sub(r"[^\w]", "", w.lower())


def _altyaziya_esle(gorunen: str, okunus_kelimeleri: list[list[str]], sinirlar: list[Kelime]) -> list[Kelime]:
    """Ses motorunun kelime zamanlarını, altyazıda görünecek ORİJİNAL kelimelere eşler."""
    gorunen_kelimeler = gorunen.split()
    toplam = sum(len(o) for o in okunus_kelimeleri)
    # noktalama-only sınırları at
    sinirlar = [s for s in sinirlar if _sade(s.metin)]
    if len(sinirlar) != toplam or len(gorunen_kelimeler) != len(okunus_kelimeleri):
        return sinirlar  # eşleşmiyorsa güvenli yol: motorun kelimeleri
    sonuc, i = [], 0
    for g, okunus in zip(gorunen_kelimeler, okunus_kelimeleri):
        n = max(len(okunus), 1)
        parca = sinirlar[i:i + n]
        i += n
        if parca:
            sonuc.append(Kelime(g, parca[0].bas, parca[-1].son))
    return sonuc


def seslendir(metinler: list[str], klasor: Path, tonlar: list[Ton] | None = None,
              telaffuz: Telaffuz | None = None) -> tuple[Path, list[Parca]]:
    """Her metni ayrı seslendirir, birleştirir. Dönüş: tek ses dosyası + her parçanın zaman aralığı."""
    klasor.mkdir(parents=True, exist_ok=True)
    deneme = ayarlar.al("SES_MOTORU") == "deneme"
    telaffuz = telaffuz or Telaffuz.yukle()
    tonlar = tonlar or [Ton() for _ in metinler]
    parcalar, dosyalar, t = [], [], 0.0
    for i, (metin, ton) in enumerate(zip(metinler, tonlar)):
        okunus_kelimeleri = [telaffuz.kelime(w).split() for w in metin.split()]
        okunacak = " ".join(" ".join(o) for o in okunus_kelimeleri)
        yol = klasor / f"p{i:02d}.mp3"
        sinirlar = _deneme_sesi(okunacak, yol) if deneme else asyncio.run(_edge(okunacak, yol, ton))
        kelimeler = _altyaziya_esle(metin, okunus_kelimeleri, sinirlar)
        d = sure(yol)
        parcalar.append(Parca(t, t + d, [Kelime(k.metin, k.bas + t, k.son + t) for k in kelimeler],
                              sonraki=t + d + ton.sonra_bosluk))
        dosyalar.append((yol, ton.sonra_bosluk))
        t += d + ton.sonra_bosluk

    # birleştir (araya duraklama)
    girdiler, filtre = [], []
    for i, (yol, bosluk) in enumerate(dosyalar):
        girdiler += ["-i", str(yol)]
        filtre.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=mono,apad=pad_dur={bosluk}[a{i}]")
    birlesik = "".join(f"[a{i}]" for i in range(len(dosyalar)))
    filtre.append(f"{birlesik}concat=n={len(dosyalar)}:v=0:a=1[out]")
    son = klasor / "seslendirme.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", *girdiler, "-filter_complex", ";".join(filtre),
         "-map", "[out]", str(son)], check=True)
    return son, parcalar
