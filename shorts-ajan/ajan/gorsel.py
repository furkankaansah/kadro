"""Görüntü: Pexels'ten telifsiz dikey stok video bulur ve indirir (Pexels lisansı ticari kullanıma izin verir)."""
import json
import urllib.parse
import urllib.request
from pathlib import Path

from . import ayarlar


def _ara(sorgu: str) -> list[dict]:
    url = "https://api.pexels.com/videos/search?" + urllib.parse.urlencode(
        {"query": sorgu, "orientation": "portrait", "size": "medium", "per_page": 15})
    req = urllib.request.Request(url, headers={"Authorization": ayarlar.PEXELS_KEY, "User-Agent": "shorts-ajan"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read()).get("videos", [])


def _en_iyi_dosya(video: dict) -> dict | None:
    adaylar = [f for f in video.get("video_files", [])
               if f.get("height") and f.get("width") and f["height"] > f["width"] and f["height"] >= 1280]
    if not adaylar:
        return None
    return min(adaylar, key=lambda f: abs(f["height"] - 1920))


def klip_bul(sorgu: str, gereken_sure: float, kullanilan: set[int]) -> tuple[Path, str] | None:
    """Uygun bir klip indirir. Dönüş: (dosya, kaynak-url) ya da None (anahtar yok/bulunamadı)."""
    if not ayarlar.PEXELS_KEY:
        return None
    sorgular = [sorgu, " ".join(sorgu.split()[:2]), sorgu.split()[0]]
    for s in dict.fromkeys(sorgular):
        try:
            videolar = _ara(s)
        except Exception as e:
            print(f"    Pexels araması başarısız ({type(e).__name__})")
            return None
        # önce yeterince uzun ve kullanılmamış olanlar
        videolar.sort(key=lambda v: (v["id"] in kullanilan, v.get("duration", 0) < gereken_sure))
        for v in videolar:
            if v["id"] in kullanilan:
                continue
            dosya = _en_iyi_dosya(v)
            if not dosya:
                continue
            hedef = ayarlar.ONBELLEK / "pexels" / f"{v['id']}.mp4"
            hedef.parent.mkdir(parents=True, exist_ok=True)
            if not hedef.exists():
                req = urllib.request.Request(dosya["link"], headers={"User-Agent": "shorts-ajan"})
                with urllib.request.urlopen(req, timeout=120) as r, open(hedef, "wb") as f:
                    f.write(r.read())
            kullanilan.add(v["id"])
            return hedef, v.get("url", "")
    return None
