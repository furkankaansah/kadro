"""Bir senaryodaki görsellerin küçük resimlerini tek sayfada gösterir (kontrol için).
Kullanım: python3 onizleme.py ../senaryolar/001_nikola_tesla.txt cikti.jpg"""
import hashlib, os, sys
from PIL import Image, ImageDraw, ImageFont
from uret import senaryo_oku, liste, ONB

meta, sahneler = senaryo_oku(sys.argv[1])
adlar = liste(meta.get("giris_gorseller")) + [g for s in sahneler for g in s["gorsel"]] + [meta.get("kapak_gorsel", "")]
adlar = [a for a in dict.fromkeys(adlar) if a]
tw, th, cols = 320, 180, 5
rows = (len(adlar) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * (th + 30)), (30, 30, 30))
d = ImageDraw.Draw(sheet); f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
for i, a in enumerate(adlar):
    k = os.path.join(ONB, "img", hashlib.md5(a.encode()).hexdigest() + "_k.jpg")
    x, y = (i % cols) * tw, (i // cols) * (th + 30)
    if os.path.exists(k):
        im = Image.open(k); im.thumbnail((tw, th)); sheet.paste(im, (x, y))
    d.text((x + 3, y + th + 4), a[:48], font=f, fill=(230, 230, 230))
sheet.save(sys.argv[2], quality=85)
print(sys.argv[2], len(adlar))
