"""Merakmetre kanal görselleri: profil fotoğrafı, kanal kapağı, video filigranı.
Çalıştır: python kanal/olustur.py  (Pillow gerekir)"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

KLASOR = Path(__file__).resolve().parent
SARI, SIYAH, KOYU, BEYAZ = (255, 212, 0), (17, 17, 17), (14, 14, 18), (255, 255, 255)
SS = 4  # kenar yumuşatma için büyük çizip küçültme katsayısı


def font(boyut):
    for yol in ["C:/Windows/Fonts/ariblk.ttf", "/System/Library/Fonts/Supplemental/Arial Black.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "C:/Windows/Fonts/arialbd.ttf"]:
        if Path(yol).exists():
            return ImageFont.truetype(yol, boyut)
    return ImageFont.load_default(size=boyut)


def gosterge(d: ImageDraw.ImageDraw, cx, cy, r, renk, ibre_renk=None, kalinlik=None):
    """Merak ölçer: yarım daire kadran + çentikler + en yükseğe yakın ibre + soru işareti göbeği."""
    k = kalinlik or max(int(r * 0.16), 2)
    d.arc([cx - r, cy - r, cx + r, cy + r], 180, 360, fill=renk, width=k)
    for i in range(1, 6):  # çentikler
        a = math.radians(180 + i * 30)
        r1, r2 = r * 0.62, r * 0.78
        d.line([cx + r1 * math.cos(a), cy + r1 * math.sin(a), cx + r2 * math.cos(a), cy + r2 * math.sin(a)],
               fill=renk, width=max(k // 2, 2))
    a = math.radians(180 + 150)  # ibre: "çok meraklı" bölgede
    uc = (cx + r * 0.82 * math.cos(a), cy + r * 0.82 * math.sin(a))
    d.line([cx, cy, *uc], fill=ibre_renk or renk, width=int(k * 0.9))
    g = r * 0.2
    d.ellipse([cx - g, cy - g, cx + g, cy + g], fill=ibre_renk or renk)


def yazi_ortala(d, metin, f, y, genislik, renk, x0=0, kontur=0):
    w = d.textlength(metin, font=f)
    d.text((x0 + (genislik - w) / 2, y), metin, font=f, fill=renk,
           stroke_width=kontur, stroke_fill=SIYAH)


def profil():
    n = 800 * SS
    img = Image.new("RGB", (n, n), SARI)
    d = ImageDraw.Draw(img)
    gosterge(d, n / 2, n * 0.70, n * 0.34, SIYAH)
    f = font(int(n * 0.24))
    kutu = d.textbbox((0, 0), "?", font=f)
    d.text(((n - (kutu[2] - kutu[0])) / 2 - kutu[0], n * 0.05 - kutu[1]), "?", font=f, fill=SIYAH)
    img.resize((800, 800), Image.LANCZOS).save(KLASOR / "profil.png")


def kapak():
    G, Y = 2560, 1440
    img = Image.new("RGB", (G * SS // 2, Y * SS // 2), KOYU)  # 2x çiz
    s = SS // 2
    d = ImageDraw.Draw(img)
    # arka planda soluk büyük kadranlar
    for cx, cy, r in [(300, 1250, 700), (2300, 250, 520)]:
        gosterge(d, cx * s, cy * s, r * s, (32, 32, 38), kalinlik=40 * s)
    # güvenli alan: ortadaki 1546x423 her cihazda görünür
    gx, gy, gw, gh = (G - 1546) // 2, (Y - 423) // 2, 1546, 423
    gosterge(d, (gx + 170) * s, (gy + 280) * s, 150 * s, SARI)
    f1, f2 = font(150 * s), font(52 * s)
    d.text(((gx + 360) * s, (gy + 70) * s), "MERAKMETRE", font=f1, fill=BEYAZ)
    d.text(((gx + 365) * s, (gy + 275) * s), "Gündem 60 saniyede.", font=f2, fill=SARI)
    d.text(((gx + 365) * s, (gy + 340) * s), "Her gün yeni Shorts.", font=f2, fill=(200, 200, 200))
    d.rectangle([0, (Y - 18) * s, G * s, Y * s], fill=SARI)
    img.resize((G, Y), Image.LANCZOS).save(KLASOR / "kanal-kapagi.png")


def filigran():
    n = 150 * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([0, 0, n - 1, n - 1], fill=SARI + (255,))
    gosterge(d, n / 2, n * 0.64, n * 0.32, SIYAH)
    img.resize((150, 150), Image.LANCZOS).save(KLASOR / "filigran.png")


if __name__ == "__main__":
    profil()
    kapak()
    filigran()
    print("Hazır: profil.png, kanal-kapagi.png, filigran.png")
