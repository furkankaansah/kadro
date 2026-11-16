"""Ayarlar: .env dosyasını okur (ek paket gerektirmez)."""
import os
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent


def _env_yukle() -> None:
    dosya = KOK / ".env"
    if not dosya.exists():
        return
    for satir in dosya.read_text(encoding="utf-8").splitlines():
        satir = satir.strip()
        if not satir or satir.startswith("#") or "=" not in satir:
            continue
        anahtar, deger = satir.split("=", 1)
        anahtar, deger = anahtar.strip(), deger.strip().strip('"').strip("'")
        if deger and not os.environ.get(anahtar):
            os.environ[anahtar] = deger


_env_yukle()


def al(anahtar: str, varsayilan: str = "") -> str:
    return os.environ.get(anahtar, "").strip() or varsayilan


MODEL = "claude-opus-5-5"
DIL = al("KANAL_DILI", "tr")
ULKE = al("ULKE", "TR")
NIS = al("KANAL_NISI")
KANAL_ADI = al("KANAL_ADI")
KANAL_KULLANICI = al("KANAL_KULLANICI")
SES = al("SES", "tr-TR-AhmetNeural" if DIL == "tr" else "en-US-AndrewNeural")
SES_HIZI = al("SES_HIZI", "+8%")
FONT = al("ALTYAZI_FONT", "Arial Black")
PEXELS_KEY = al("PEXELS_API_KEY")
YOUTUBE_KEY = al("YOUTUBE_API_KEY")

GENISLIK, YUKSEKLIK, FPS = 1080, 1920, 30
CIKTI = KOK / "cikti"
MUZIK = KOK / "muzik"
ONBELLEK = KOK / ".cache"
