"""Seslendirme: edge-tts (ücretsiz Microsoft neural sesler) + kelime kelime zamanlama (altyazı için)."""
import asyncio
import subprocess
from dataclasses import dataclass
from pathlib import Path

from . import ayarlar

BOSLUK = 0.12  # parçalar arası nefes payı (sn)


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


def sure(yol: Path) -> float:
    cikti = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(yol)],
        capture_output=True, text=True, check=True,
    ).stdout
    return float(cikti.strip())


async def _edge(metin: str, hedef: Path) -> list[Kelime]:
    import edge_tts

    iletisim = edge_tts.Communicate(metin, ayarlar.SES, rate=ayarlar.SES_HIZI, boundary="WordBoundary")
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


def seslendir(metinler: list[str], klasor: Path) -> tuple[Path, list[Parca]]:
    """Her metni ayrı seslendirir, birleştirir. Dönüş: tek ses dosyası + her parçanın zaman aralığı."""
    klasor.mkdir(parents=True, exist_ok=True)
    deneme = ayarlar.al("SES_MOTORU") == "deneme"
    parcalar, dosyalar, t = [], [], 0.0
    for i, metin in enumerate(metinler):
        yol = klasor / f"p{i:02d}.mp3"
        kelimeler = _deneme_sesi(metin, yol) if deneme else asyncio.run(_edge(metin, yol))
        d = sure(yol)
        parcalar.append(Parca(t, t + d, [Kelime(k.metin, k.bas + t, k.son + t) for k in kelimeler]))
        dosyalar.append(yol)
        t += d + BOSLUK

    # birleştir (araya kısa sessizlik)
    girdiler, filtre = [], []
    for i, yol in enumerate(dosyalar):
        girdiler += ["-i", str(yol)]
        filtre.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=mono,apad=pad_dur={BOSLUK}[a{i}]")
    birlesik = "".join(f"[a{i}]" for i in range(len(dosyalar)))
    filtre.append(f"{birlesik}concat=n={len(dosyalar)}:v=0:a=1[out]")
    son = klasor / "seslendirme.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", *girdiler, "-filter_complex", ";".join(filtre),
         "-map", "[out]", str(son)], check=True)
    return son, parcalar
