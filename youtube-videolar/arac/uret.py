"""Biyografi videosu üretici.

Kullanım:
    python3 uret.py ../senaryolar/001_nikola_tesla.txt      # tek kişi
    python3 uret.py --hepsi                                  # senaryolar/ içindeki herkes
Seçenekler:
    --ses tr-TR-AhmetNeural | tr-TR-EmelNeural   (varsayılan Ahmet)
    --sadece-metin   (video üretmeden açıklama/etiket/senaryo dosyalarını yaz)

Kendi sesini kullanmak için: videolar/<klasör>/kendi_sesim/ içine
  00.mp3 (açılış), 01.mp3, 02.mp3 ... (bölümler) ve fragman.mp3 koy, komutu yeniden çalıştır.
  (.wav / .m4a da olur.) Hangi dosyada hangi metnin okunacağı seslendirme_metni.txt içinde yazar.
"""
import argparse, asyncio, hashlib, json, os, re, shutil, ssl, subprocess, sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

sys.path.insert(0, os.path.dirname(__file__))
import wiki  # noqa: E402

KOK = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ONB = os.path.join(KOK, ".onbellek")
W, H, FPS = 1280, 720, 25


def _font_bul(*adaylar):
    for a in adaylar:
        if os.path.exists(a):
            return a
    raise SystemExit("Uygun yazı tipi bulunamadı: " + adaylar[0])


_WF = os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts")
FONT_B = _font_bul("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", os.path.join(_WF, "arialbd.ttf"),
                   "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf")
FONT_R = _font_bul("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", os.path.join(_WF, "arial.ttf"),
                   "/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf")
FONT_S = _font_bul("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", os.path.join(_WF, "georgiab.ttf"),
                   "/System/Library/Fonts/Supplemental/Georgia Bold.ttf", FONT_B)
CEVRIMDISI = False  # True: Wikimedia'ya bağlanma, önbellek + tasarım sahneleri kullan
SAHNE_ARASI = 0.7  # bölümler arası sessizlik (sn)
HIZ = "+3%"  # konuşma hızı


# ---------------------------------------------------------------- senaryo okuma
def senaryo_oku(yol):
    meta, sahneler, cur, key = {}, [], None, None
    for raw in open(yol, encoding="utf-8").read().splitlines():
        line = raw.rstrip()
        if line.startswith("==="):
            cur = {"baslik": line[3:].strip(), "gorsel": [], "metin": []}
            sahneler.append(cur); key = None
            continue
        if cur is not None and re.match(r"^@\w+:", line):
            cur = None
        if cur is not None:
            if line.startswith("# gorsel:"):
                cur["gorsel"] += [x.strip() for x in line.split(":", 1)[1].split(";") if x.strip()]
            elif not line.startswith("//"):
                cur["metin"].append(line)
            continue
        m = re.match(r"^@(\w+):\s*(.*)$", line)
        if m:
            key = m.group(1); meta[key] = m.group(2)
        elif key:
            meta[key] = (meta[key] + "\n" + line) if meta[key] else line
    for s in sahneler:
        s["metin"] = re.sub(r"\n{3,}", "\n\n", "\n".join(s["metin"]).strip())
    for k in list(meta):
        meta[k] = meta[k].strip()
    return meta, sahneler


def liste(s):
    return [x.strip() for x in re.split(r"[;\n]", s or "") if x.strip()]


# ---------------------------------------------------------------- görseller
def gorsel_indir(ad, bilgi_cache):
    os.makedirs(os.path.join(ONB, "img"), exist_ok=True)
    if ad not in bilgi_cache:
        bilgi_cache.update(wiki.file_info([ad], width=1920))
    info = bilgi_cache.get(ad)
    if not info:
        raise SystemExit(f"Görsel Commons'ta bulunamadı: {ad}")
    yol = os.path.join(ONB, "img", hashlib.md5(ad.encode()).hexdigest() + os.path.splitext(info["url"].split("?")[0])[1].lower())
    if not os.path.exists(yol):
        data = wiki.get(info["url"], binary=True)
        if len(data) < 1000:
            raise SystemExit(f"Görsel indirilemedi: {ad}")
        open(yol + ".part", "wb").write(data); os.replace(yol + ".part", yol)
    return yol, info


def kare_hazirla(src, dst, olcek=2):
    """Görseli 16:9 kareye oturt: bulanık arka plan + ortada görsel."""
    if os.path.exists(dst):
        return dst
    im = Image.open(src)
    im.seek(0) if getattr(im, "is_animated", False) else None
    im = ImageOps.exif_transpose(im.convert("RGB"))
    TW, TH = W * olcek, H * olcek
    bg = ImageOps.fit(im, (TW, TH)).filter(ImageFilter.GaussianBlur(40))
    bg = Image.blend(bg, Image.new("RGB", bg.size, (0, 0, 0)), 0.55)
    fg = im.copy(); fg.thumbnail((TW, TH), Image.LANCZOS)
    if fg.width < TW * 0.6 and fg.height < TH * 0.6:  # küçükse büyüt
        r = min(TW / fg.width, TH / fg.height); fg = fg.resize((int(fg.width * r), int(fg.height * r)), Image.LANCZOS)
    bg.paste(fg, ((TW - fg.width) // 2, (TH - fg.height) // 2))
    bg.save(dst, quality=92)
    return dst


def gorselleri_coz(meta, sahneler, kayit):
    """'ara: sorgu' biçimindeki görsel girdilerini Commons aramasıyla dosya adına çevirir.
    Seçimler kaydedilir; aynı sonuç tekrar kullanılır (değiştirmek için json'u düzenle/sil)."""
    secim = json.load(open(kayit, encoding="utf-8")) if os.path.exists(kayit) else {}
    kullanilan = set(secim.values())
    for s in sahneler:
        kullanilan.update(g for g in s["gorsel"] if not g.startswith("ara:"))

    def coz(g):
        if not g.startswith("ara:"):
            return g
        if g in secim:
            return secim[g]
        q = g[4:].strip()
        adaylar = wiki.search_files(q, 12)
        inf = wiki.file_info(adaylar) if adaylar else {}
        for n in adaylar:
            i = inf.get(n)
            if i and n not in kullanilan and min(i["w"], i["h"]) >= 600 and wiki.OK_LICENSE.search(i["license"] or ""):
                secim[g] = n; kullanilan.add(n)
                json.dump(secim, open(kayit, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
                print(f"  görsel: '{q}' → {n}")
                return n
        print(f"  UYARI: '{q}' için uygun görsel bulunamadı, atlandı")
        return None

    for s in sahneler:
        s["gorsel"] = [x for x in (coz(g) for g in s["gorsel"]) if x]
        if not s["gorsel"]:
            raise SystemExit(f"'{s['baslik']}' bölümü için hiç görsel yok")
    ilkler = [s["gorsel"][0] for s in sahneler]
    for k in ("giris_gorseller", "fragman_gorseller"):
        meta[k] = "; ".join(x for x in (coz(g) for g in liste(meta.get(k))) if x)
    if not meta.get("giris_gorseller"):
        meta["giris_gorseller"] = "; ".join(ilkler[:3])
    if not meta.get("fragman_gorseller"):
        meta["fragman_gorseller"] = "; ".join(ilkler[:11])
    meta["kapak_gorsel"] = coz(meta.get("kapak_gorsel") or "") or ilkler[0]


# ---------------------------------------------------------------- yazı kartları
def font(p, s):
    return ImageFont.truetype(p, s)


def buyuk(t):
    """Türkçe kurallarına uygun büyük harf (i→İ, ı→I)."""
    return t.replace("i", "İ").replace("ı", "I").upper()


def sigdir(d, t, p, boy, maxw):
    f = font(p, boy)
    while d.textlength(t, font=f) > maxw and boy > 20:
        boy -= 2; f = font(p, boy)
    return f


def sar(draw, metin, f, maxw):
    satirlar, s = [], ""
    for w in metin.split():
        t = (s + " " + w).strip()
        if draw.textlength(t, font=f) <= maxw:
            s = t
        else:
            satirlar.append(s); s = w
    if s:
        satirlar.append(s)
    return satirlar


def alt_bant(dst, ust, alt):
    """Bölüm başlığı için şeffaf alt bant PNG."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    f1, f2 = font(FONT_B, 22), font(FONT_S, 40)
    w = max(d.textlength(ust, font=f1), d.textlength(alt, font=f2)) + 60
    d.rectangle([0, H - 170, w, H - 60], fill=(10, 10, 10, 200))
    d.rectangle([0, H - 170, 8, H - 60], fill=(232, 180, 40, 255))
    d.text((30, H - 160), ust, font=f1, fill=(232, 180, 40, 255))
    d.text((30, H - 125), alt, font=f2, fill=(255, 255, 255, 255))
    im.save(dst)


def baslik_karti(dst, ad, yillar, alt):
    im = Image.new("RGB", (W, H), (12, 12, 14)); d = ImageDraw.Draw(im)
    for y in range(H):
        c = int(12 + 18 * (y / H)); d.line([(0, y), (W, y)], fill=(c, c, c + 2))
    f1, f2, f3 = sigdir(d, buyuk(ad), FONT_S, 78, W - 100), sigdir(d, yillar, FONT_B, 34, W - 100), font(FONT_R, 28)
    for i, (t, f, col, y) in enumerate([(buyuk(ad), f1, (255, 255, 255), 250), (yillar, f2, (232, 180, 40), 360)]):
        d.text(((W - d.textlength(t, font=f)) / 2, y), t, font=f, fill=col)
    d.line([(W / 2 - 120, 345), (W / 2 + 120, 345)], fill=(232, 180, 40), width=3)
    for i, l in enumerate(sar(d, alt, f3, 1000)):
        d.text(((W - d.textlength(l, font=f3)) / 2, 430 + i * 40), l, font=f3, fill=(200, 200, 200))
    im.save(dst, quality=95)


PALETLER = [((18, 24, 38), (52, 38, 24)), ((24, 18, 30), (60, 30, 30)), ((14, 28, 30), (40, 46, 24)),
            ((30, 24, 16), (20, 34, 52)), ((26, 16, 16), (46, 40, 60))]


def yil_bul(t):
    m = re.findall(r"\b(1[0-9]{3}|20[0-2][0-9])\b", t)
    return m[0] if m else ""


def grafik_kart(dst, ad, baslik, cumle, yil, tohum):
    """Fotoğraf yerine kullanılan tasarım sahnesi (2560x1440, Ken Burns için kenar payı bırakır)."""
    if os.path.exists(dst):
        return dst
    import random
    rnd = random.Random(tohum)
    TW, TH = W * 2, H * 2
    c1, c2 = PALETLER[rnd.randrange(len(PALETLER))]
    im = Image.new("RGB", (TW, TH)); d = ImageDraw.Draw(im)
    for y in range(TH):
        k = y / TH
        d.line([(0, y), (TW, y)], fill=tuple(int(c1[i] * (1 - k) + c2[i] * k) for i in range(3)))
    # yumuşak ışık lekeleri
    leke = Image.new("L", (TW, TH), 0); ld = ImageDraw.Draw(leke)
    for _ in range(5):
        x, y, r = rnd.randrange(TW), rnd.randrange(TH), rnd.randrange(300, 800)
        ld.ellipse([x - r, y - r, x + r, y + r], fill=rnd.randrange(25, 60))
    leke = leke.filter(ImageFilter.GaussianBlur(160))
    im = Image.composite(Image.new("RGB", (TW, TH), (200, 160, 90)), im, leke)
    # vinyet
    v = Image.new("L", (TW, TH), 0); ImageDraw.Draw(v).ellipse([-TW * .2, -TH * .3, TW * 1.2, TH * 1.3], fill=255)
    v = v.filter(ImageFilter.GaussianBlur(250))
    im = Image.composite(im, Image.new("RGB", (TW, TH), (5, 5, 8)), v)
    if yil:
        kat = Image.new("RGBA", (TW, TH), (0, 0, 0, 0)); kd = ImageDraw.Draw(kat)
        f = font(FONT_S, 420)
        kd.text((TW * 0.88 - kd.textlength(yil, font=f), TH * 0.52), yil, font=f, fill=(232, 180, 40, 34))
        im = Image.alpha_composite(im.convert("RGBA"), kat).convert("RGB")
    d = ImageDraw.Draw(im)
    x0, maxw = TW * 0.16, TW * 0.64
    f1 = font(FONT_B, 46)
    d.rectangle([x0, TH * 0.30, x0 + 120, TH * 0.30 + 8], fill=(232, 180, 40))
    d.text((x0, TH * 0.30 + 30), buyuk(baslik), font=f1, fill=(232, 180, 40))
    boy = 92 if len(cumle) < 90 else 78 if len(cumle) < 150 else 64
    f2 = font(FONT_S, boy)
    y = TH * 0.30 + 120
    for l in sar(d, cumle, f2, maxw)[:5]:
        d.text((x0, y), l, font=f2, fill=(245, 240, 230)); y += boy * 1.3
    f3 = font(FONT_R, 40)
    d.text((x0, TH * 0.80), buyuk(ad), font=f3, fill=(190, 190, 190))
    im.save(dst + ".part.jpg", quality=90); os.replace(dst + ".part.jpg", dst)
    return dst


_ZAYIF = re.compile(r"^(Bu|Burada|Bunu|Bunun|Bunlar|Bundan|O |Onu|Onun|Ona|Ama|Ancak|Böylece|Aynı|Ardından|Sonra|Yine|İşte|Ve |Fakat|Üstelik|Hatta|Kısa|Yıllar)")


def iyi_cumleler(metin, n):
    cs = [c for c in cumlele(metin) if 30 < len(c) < 190] or cumlele(metin)
    def puan(c):
        p = 0
        if yil_bul(c): p += 3
        if re.search(r"\s[A-ZÇĞİÖŞÜ][a-zçğıöşü]+", c): p += 1
        if _ZAYIF.match(c): p -= 4
        if '"' in c: p += 1
        return p
    sirali = sorted(range(len(cs)), key=lambda i: -puan(cs[i]))[:max(n, 1)]
    secilen = [cs[i] for i in sorted(sirali)]
    while len(secilen) < n:
        secilen.append(secilen[len(secilen) % max(1, len(secilen))] if secilen else metin[:150])
    return secilen


def onbellek_gorsel(ad):
    h = hashlib.md5(ad.encode()).hexdigest()
    d = os.path.join(ONB, "img")
    if not os.path.isdir(d):
        return None
    for f in os.listdir(d):
        if f.startswith(h) and not f.endswith("_k.jpg") and not f.endswith(".part"):
            return os.path.join(d, f)
    return None


def kapak(dst, gorsel, yazi, ad):
    im = Image.open(gorsel).convert("RGB")
    im = ImageOps.exif_transpose(im)
    bg = Image.new("RGB", (W, H), (8, 8, 10))
    por = ImageOps.fit(im, (int(W * 0.55), H), centering=(0.5, 0.25))
    bg.paste(por, (W - por.width, 0))
    grad = Image.new("L", (W, H), 0); gd = ImageDraw.Draw(grad)
    for x in range(W):
        a = 255 if x < W * 0.42 else max(0, int(255 * (1 - (x - W * 0.42) / (W * 0.2))))
        gd.line([(x, 0), (x, H)], fill=a)
    bg.paste(Image.new("RGB", (W, H), (8, 8, 10)), (0, 0), grad)
    d = ImageDraw.Draw(bg)
    satirlar = [s.strip() for s in yazi.split("|") if s.strip()]
    y = 90
    for i, s in enumerate(satirlar):
        f = font(FONT_B, 96 if len(s) < 12 else 80 if len(s) < 18 else 64)
        for l in sar(d, buyuk(s), f, W * 0.58):
            col = (255, 214, 0) if i == 0 else (255, 255, 255)
            d.text((50, y), l, font=f, fill=col, stroke_width=4, stroke_fill=(0, 0, 0))
            y += f.size + 12
        y += 14
    f = sigdir(d, buyuk(ad), FONT_S, 44, W * 0.5)
    d.rectangle([40, H - 120, 60 + d.textlength(buyuk(ad), font=f), H - 50], fill=(200, 30, 30))
    d.text((50, H - 115), buyuk(ad), font=f, fill=(255, 255, 255))
    bg.save(dst, quality=92)


# ---------------------------------------------------------------- ses
def _ssl_fix():
    import edge_tts.communicate as c
    ca = "/root/.ccr/ca-bundle.crt"
    if os.path.exists(ca):
        c._SSL_CTX = ssl.create_default_context(cafile=ca)


async def _tts(metin, ses, mp3, js):
    import edge_tts
    com = edge_tts.Communicate(metin, ses, rate=HIZ)
    cumleler = []
    with open(mp3, "wb") as f:
        async for ch in com.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] in ("SentenceBoundary", "WordBoundary"):
                cumleler.append({"t": ch["offset"] / 1e7, "d": ch["duration"] / 1e7, "metin": ch["text"]})
    json.dump(cumleler, open(js, "w", encoding="utf-8"), ensure_ascii=False)


def tts(metin, ses):
    os.makedirs(os.path.join(ONB, "ses"), exist_ok=True)
    h = hashlib.md5((ses + "|" + HIZ + "|" + metin).encode()).hexdigest()
    mp3, js = os.path.join(ONB, "ses", h + ".mp3"), os.path.join(ONB, "ses", h + ".json")
    if not os.path.exists(mp3) or not os.path.exists(js):
        _ssl_fix()
        for i in range(4):
            try:
                asyncio.run(_tts(metin, ses, mp3, js)); break
            except Exception as e:
                if i == 3:
                    raise
                print("  TTS yeniden deneniyor:", e)
    return mp3, json.load(open(js, encoding="utf-8"))


def sure(dosya):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dosya],
                         capture_output=True, text=True).stdout
    return float(out.strip())


def ses_sec(klasor, ad, metin, sesadi):
    """Kendi kaydın varsa onu, yoksa yapay sesi döndürür. (yol, cümle zamanları, kendi_mi)"""
    for ext in (".mp3", ".wav", ".m4a", ".ogg", ".flac"):
        p = os.path.join(klasor, "kendi_sesim", ad + ext)
        if os.path.exists(p):
            # Kendi kaydında altyazı zamanlaması: cümleleri süreye orantılı dağıt
            d = sure(p); cs = cumlele(metin); toplam = sum(len(c) for c in cs) or 1; t = 0; z = []
            for c in cs:
                dd = d * len(c) / toplam; z.append({"t": t, "d": dd, "metin": c}); t += dd
            return p, z, True
    mp3, z = tts(metin, sesadi)
    return mp3, z, False


def cumlele(m):
    return [c.strip() for c in re.split(r"(?<=[.!?…])\s+", m.replace("\n", " ")) if c.strip()]


# ---------------------------------------------------------------- video
def ffyol(p):
    return os.path.abspath(p).replace("\\", "/").replace("'", "'\\''")


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(" ".join(cmd)); print(r.stderr[-3000:]); raise SystemExit("ffmpeg hatası")


def kenburns(kare, dur, idx, cikis):
    n = max(1, int(round(dur * FPS)))
    z0, z1 = (1.0, 1.12) if idx % 2 == 0 else (1.12, 1.0)
    zexpr = f"{z0}+({z1}-{z0})*on/{n}"
    pans = [("iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),
            ("(iw-iw/zoom)*on/{n}".format(n=n), "ih/2-(ih/zoom/2)"),
            ("(iw-iw/zoom)*(1-on/{n})".format(n=n), "ih/2-(ih/zoom/2)"),
            ("iw/2-(iw/zoom/2)", "(ih-ih/zoom)*on/{n}".format(n=n))]
    x, y = pans[idx % len(pans)]
    vf = f"zoompan=z='{zexpr}':x='{x}':y='{y}':d={n}:s={W}x{H}:fps={FPS},format=yuv420p"
    run(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-framerate", str(FPS), "-i", kare, "-vf", vf,
         "-frames:v", str(n), "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-r", str(FPS), cikis])


def segment(goruntuler, ses, dur, cikis, bant=None, gecici="."):
    """goruntuler: hazırlanmış kare yolları; ses: mp3 (dur'a kadar sessizlikle uzatılır)."""
    parcalar = []
    per = dur / len(goruntuler)
    for i, k in enumerate(goruntuler):
        p = os.path.join(gecici, f"kb_{os.path.basename(cikis)}_{i}.mp4")
        kenburns(k, per, hash(k) % 4 + i, p); parcalar.append(p)
    lst = os.path.join(gecici, os.path.basename(cikis) + ".lst")
    open(lst, "w").write("".join(f"file '{ffyol(p)}'\n" for p in parcalar))
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst]
    if ses:
        cmd += ["-i", ses]
    else:
        cmd += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]
    fc = []
    vin = "[0:v]"
    if bant:
        cmd += ["-loop", "1", "-i", bant]
        fc.append(f"[2:v]format=rgba,fade=t=in:st=0.4:d=0.6:alpha=1,fade=t=out:st=5:d=0.6:alpha=1[b];{vin}[b]overlay=0:0:shortest=1[v0]")
        vin = "[v0]"
    fc.append(f"{vin}fade=t=in:st=0:d=0.4,fade=t=out:st={max(0, dur - 0.4):.2f}:d=0.4[v]")
    fc.append(f"[1:a]aresample=44100,aformat=channel_layouts=stereo,apad,atrim=0:{dur:.3f}[a]")
    cmd += ["-filter_complex", ";".join(fc), "-map", "[v]", "-map", "[a]", "-t", f"{dur:.3f}",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-r", str(FPS), "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-ar", "44100", cikis]
    run(cmd)
    for p in parcalar:
        os.remove(p)


def birlestir(parcalar, cikis, gecici):
    lst = os.path.join(gecici, "hepsi.lst")
    open(lst, "w").write("".join(f"file '{ffyol(p)}'\n" for p in parcalar))
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy",
         "-movflags", "+faststart", cikis])


def zt(t, srt=False):
    h, r = divmod(t, 3600); m, s = divmod(r, 60)
    if srt:
        return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int((s % 1) * 1000):03d}"
    return f"{int(h)}:{int(m):02d}:{int(s):02d}" if h else f"{int(m)}:{int(s):02d}"


# ---------------------------------------------------------------- ana akış
def uret(yol, sesadi, sadece_metin=False):
    meta, sahneler = senaryo_oku(yol)
    ad = meta["ad"]; klasor = os.path.join(KOK, "videolar", meta["klasor"])
    os.makedirs(klasor, exist_ok=True)
    gecici = os.path.join(ONB, "tmp", meta["klasor"]); os.makedirs(gecici, exist_ok=True)
    print(f"\n=== {ad} → {klasor}")
    bilgi = {}
    if not sadece_metin and not CEVRIMDISI:
        gorselleri_coz(meta, sahneler, os.path.join(klasor, "secilen_gorseller.json"))
    tum_gorseller = []
    for s in sahneler:
        tum_gorseller += s["gorsel"]
    tum_gorseller += liste(meta.get("fragman_gorseller")) + [meta.get("kapak_gorsel", "")]
    tum_gorseller = [g for g in dict.fromkeys(tum_gorseller) if g]
    tum_gorseller = [g for g in tum_gorseller if not g.startswith("ara:")]
    for i in range(0, len(tum_gorseller), 40):
        if sadece_metin or CEVRIMDISI:
            break
        bilgi.update(wiki.file_info(tum_gorseller[i:i + 40], width=1920))
    eksik = [g for g in tum_gorseller if g not in bilgi]
    if eksik and not sadece_metin and not CEVRIMDISI:
        raise SystemExit("Commons'ta bulunamayan görseller: " + "; ".join(eksik))

    # açılış metni = @giris, sonra bölümler
    bolumler = [{"baslik": "Giriş", "gorsel": liste(meta.get("giris_gorseller")), "metin": meta["giris"], "giris": True}] + sahneler

    # seslendirme metni dosyası (kendi sesinle okumak için)
    with open(os.path.join(klasor, "seslendirme_metni.txt"), "w", encoding="utf-8") as f:
        f.write(f"{ad} — SESLENDİRME METNİ\nHer bölümü ayrı dosya olarak kaydet ve kendi_sesim/ klasörüne koy.\n\n")
        for i, b in enumerate(bolumler):
            f.write(f"──── Dosya adı: {i:02d}.mp3  —  {b['baslik']}\n\n{b['metin']}\n\n")
        f.write(f"──── Dosya adı: fragman.mp3  —  1 dakikalık fragman\n\n{meta['fragman']}\n")
    os.makedirs(os.path.join(klasor, "kendi_sesim"), exist_ok=True)

    # sesler ve zamanlama
    zaman, t, srt, kendi = [], 4.0, [], False  # 4 sn başlık kartı
    for i, b in enumerate(bolumler):
        p, cz, k = ses_sec(klasor, f"{i:02d}", b["metin"], sesadi); kendi |= k
        d = sure(p) + SAHNE_ARASI
        b.update(ses=p, sure=d, bas=t)
        for c in cz:
            srt.append((t + c["t"], t + c["t"] + max(c["d"], 0.8), c["metin"]))
        zaman.append((t, b["baslik"])); t += d
    toplam = t + 6
    print(f"  süre: {zt(toplam)}  ({'kendi sesin' if kendi else 'yapay ses: ' + sesadi})")

    # altyazı
    with open(os.path.join(klasor, "altyazi_tr.srt"), "w", encoding="utf-8") as f:
        for n, (a, b_, m) in enumerate(srt, 1):
            f.write(f"{n}\n{zt(a, True)} --> {zt(b_, True)}\n{m}\n\n")

    # metin dosyaları
    bolum_listesi = "\n".join(f"{zt(0 if i == 0 else z)} {b}" for i, (z, b) in enumerate(zaman))
    bolum_listesi = "0:00 Başlangıç\n" + "\n".join(f"{zt(z)} {b}" for z, b in zaman[1:])
    kredi = []
    for g in tum_gorseller:
        if g not in bilgi:
            kredi.append(f"- {g} (lisans bilgisi video üretilirken doldurulur)"); continue
        i = bilgi[g]
        kredi.append(f"- {g} — {i['artist'] or 'bilinmiyor'} — {i['license']} — {i['page']}")
    aciklama = (meta["aciklama"].strip() + "\n\n⏱ BÖLÜMLER\n" + bolum_listesi +
                "\n\n📚 KAYNAKLAR\n" + meta.get("kaynaklar", "").strip() +
                "\n\n🖼 Görseller: Wikimedia Commons (kamu malı ve Creative Commons lisanslı). "
                "Tam görsel/lisans listesi sabit yorumda.\n\n" +
                " ".join("#" + re.sub(r"\W", "", h.title()) for h in liste(meta.get("hashtag"))))
    open(os.path.join(klasor, "youtube_baslik.txt"), "w", encoding="utf-8").write(meta["baslik"] + "\n")
    open(os.path.join(klasor, "youtube_aciklama.txt"), "w", encoding="utf-8").write(aciklama + "\n")
    etiket = ", ".join(liste(meta["etiketler"].replace(",", ";")))
    open(os.path.join(klasor, "youtube_etiketler.txt"), "w", encoding="utf-8").write(etiket + "\n")
    open(os.path.join(klasor, "sabit_yorum_gorsel_lisanslari.txt"), "w", encoding="utf-8").write(
        "Bu videoda kullanılan görseller ve lisansları (Wikimedia Commons):\n" + "\n".join(kredi) + "\n")
    frag_ac = meta.get("fragman_aciklama", "").strip()
    open(os.path.join(klasor, "fragman_youtube.txt"), "w", encoding="utf-8").write(
        f"BAŞLIK:\n{meta.get('fragman_baslik', ad + ' | Fragman')}\n\nAÇIKLAMA:\n{frag_ac}\n\nETİKETLER:\n{etiket}\n")
    with open(os.path.join(klasor, "senaryo.md"), "w", encoding="utf-8") as f:
        f.write(f"# {meta['baslik']}\n\n## Giriş\n\n{meta['giris']}\n\n")
        for z, b in zip(zaman[1:], sahneler):
            f.write(f"## [{zt(z[0])}] {b['baslik']}\n\n{b['metin']}\n\n")
        f.write(f"## Fragman\n\n{meta['fragman']}\n")
    if sadece_metin:
        return

    # görselleri hazırla (çevrimdışıysa: önbellekteki fotoğraf ya da tasarım sahnesi)
    hazir, kullanilan_foto = {}, []
    kartdir = os.path.join(ONB, "kart", meta["klasor"]); os.makedirs(kartdir, exist_ok=True)

    def kare(g, b, j):
        src = onbellek_gorsel(g) if not g.startswith("ara:") else None
        if src is None and not CEVRIMDISI and not g.startswith("ara:"):
            src = gorsel_indir(g, bilgi)[0]
        if src:
            kullanilan_foto.append(g)
            return kare_hazirla(src, os.path.join(ONB, "img", hashlib.md5(g.encode()).hexdigest() + "_k.jpg"))
        c = iyi_cumleler(b["metin"], j + 1)[j]
        return grafik_kart(os.path.join(kartdir, hashlib.md5((b["baslik"] + str(j)).encode()).hexdigest() + ".jpg"),
                           ad, b["baslik"], c, yil_bul(c) or yil_bul(b["metin"]), b["baslik"] + str(j))

    for b in bolumler:
        gl = b["gorsel"] or ["ara: yok"]
        n = max(len(gl), int(b["sure"] // 25) if not any(onbellek_gorsel(g) for g in gl) else len(gl))
        n = min(n, 4)
        b["kareler"] = [kare(gl[j % len(gl)] if j < len(gl) else "ara: ek", b, j) for j in range(n)]

    # kapak
    kg = onbellek_gorsel(meta.get("kapak_gorsel", "")) if meta.get("kapak_gorsel") else None
    if kg is None and not CEVRIMDISI:
        kg = gorsel_indir(meta["kapak_gorsel"], bilgi)[0]
    if kg is None:
        kg = bolumler[1]["kareler"][0] if len(bolumler) > 1 else bolumler[0]["kareler"][0]
    kapak(os.path.join(klasor, "kapak_thumbnail.jpg"), kg, meta["kapak_yazi"], ad)
    kredi_foto = [k for k in kredi if any(k.startswith("- " + g + " ") for g in set(kullanilan_foto))]
    if CEVRIMDISI:
        open(os.path.join(klasor, "sabit_yorum_gorsel_lisanslari.txt"), "w", encoding="utf-8").write(
            ("Bu videoda kullanılan fotoğraflar (Wikimedia Commons):\n" + "\n".join(kredi_foto) + "\n") if kredi_foto
            else "Bu videoda fotoğraf kullanılmamıştır; görseller özgün tasarım sahneleridir.\n")

    # ANA VİDEO
    parcalar = []
    bk = os.path.join(gecici, "baslik.jpg"); baslik_karti(bk, ad, meta.get("yillar", ""), meta.get("alt_baslik", ""))
    p = os.path.join(gecici, "s_000.mp4"); segment([bk], None, 4.0, p, gecici=gecici); parcalar.append(p)
    for i, b in enumerate(bolumler):
        print(f"  bölüm {i}/{len(bolumler) - 1}: {b['baslik']} ({b['sure']:.0f} sn)")
        bant = None
        if not b.get("giris"):
            bant = os.path.join(gecici, f"bant_{i}.png"); alt_bant(bant, f"BÖLÜM {i}", b["baslik"])
        p = os.path.join(gecici, f"s_{i + 1:03d}.mp4")
        segment(b["kareler"], b["ses"], b["sure"], p, bant, gecici); parcalar.append(p)
    son = os.path.join(gecici, "son.jpg")
    baslik_karti(son, "İzlediğiniz için teşekkürler", "Abone olun • Beğenin • Yorum yazın",
                 meta.get("son_soz", "Bir sonraki hayat hikâyesinde görüşmek üzere."))
    p = os.path.join(gecici, "s_999.mp4"); segment([son], None, 6.0, p, gecici=gecici); parcalar.append(p)
    video = os.path.join(klasor, f"{meta['klasor']}.mp4")
    birlestir(parcalar, video, gecici)

    # FRAGMAN (~1 dk)
    fp, _, _ = ses_sec(klasor, "fragman", meta["fragman"], sesadi)
    fd = sure(fp) + 0.8
    fg = [b["kareler"][0] for b in bolumler[1:]][:11] or bolumler[0]["kareler"]
    p1 = os.path.join(gecici, "f_1.mp4"); segment(fg, fp, fd, p1, gecici=gecici)
    fk = os.path.join(gecici, "f_son.jpg")
    baslik_karti(fk, ad, meta.get("yillar", ""), "Hayat hikâyesinin tamamı kanalımızda. Kaçırmamak için abone olun!")
    p2 = os.path.join(gecici, "f_2.mp4"); segment([fk], None, 4.0, p2, gecici=gecici)
    birlestir([p1, p2], os.path.join(klasor, f"{meta['klasor']}_FRAGMAN.mp4"), gecici)
    shutil.rmtree(gecici, ignore_errors=True)
    print(f"  bitti: video {zt(sure(video))}, fragman {zt(fd + 4)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("senaryo", nargs="*")
    ap.add_argument("--hepsi", action="store_true")
    ap.add_argument("--ses", default="tr-TR-AhmetNeural")
    ap.add_argument("--sadece-metin", action="store_true")
    ap.add_argument("--cevrimdisi", action="store_true", help="Wikimedia'ya bağlanmadan üret (tasarım sahneleri)")
    ap.add_argument("--yeniden", action="store_true", help="--hepsi ile: hazır videoları da yeniden üret")
    a = ap.parse_args()
    CEVRIMDISI = a.cevrimdisi
    yollar = a.senaryo
    if a.hepsi:
        d = os.path.join(KOK, "senaryolar")
        yollar = sorted(os.path.join(d, f) for f in os.listdir(d) if f.endswith(".txt"))
    for y in yollar:
        if a.hepsi and not a.yeniden:
            m, _ = senaryo_oku(y)
            if os.path.exists(os.path.join(KOK, "videolar", m["klasor"], m["klasor"] + "_FRAGMAN.mp4")):
                print(f"zaten hazır: {m['klasor']}"); continue
        uret(y, a.ses, a.sadece_metin)
