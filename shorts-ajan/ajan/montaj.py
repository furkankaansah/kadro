"""Kurgu: sahneleri 1080x1920 dikey videoya keser, kelime kelime vurgulu altyazı, vurgu yazıları,
ilerleme çubuğu, müzik (konuşmada otomatik kısılır), YouTube ses seviyesi (-14 LUFS) ve kapak resmi."""
import random
import subprocess
from pathlib import Path

from . import ayarlar
from .ses import Parca

G, Y, FPS = ayarlar.GENISLIK, ayarlar.YUKSEKLIK, ayarlar.FPS
RENKLER = [("0x0f2027", "0x2c5364"), ("0x41295a", "0x2F0743"), ("0x000428", "0x004e92"),
           ("0x1f1c2c", "0x928DAB"), ("0x200122", "0x6f0000"), ("0x093028", "0x237A57")]


def _ff(*args, cwd=None):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args], check=True, cwd=cwd)


def _buyuk(metin: str) -> str:
    if ayarlar.DIL == "tr":
        metin = metin.replace("i", "İ").replace("ı", "I")
    return metin.upper()


# ---------- sahne videoları ----------

def sahne_videosu(klip: Path | None, sure: float, hedef: Path, i: int) -> None:
    kod = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-an"]
    if klip and klip.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
        fotograf_videosu(klip, sure, hedef, i, kod)
    elif klip:
        # hafif kaydırma (Ken Burns benzeri) + okunabilirlik için hafif karartma
        pw, ph = int(G * 1.08) // 2 * 2, int(Y * 1.08) // 2 * 2
        yon = "(iw-ow)*t/{d}" if i % 2 == 0 else "(iw-ow)*(1-t/{d})"
        vf = (f"scale={pw}:{ph}:force_original_aspect_ratio=increase,crop={pw}:{ph},"
              f"crop={G}:{Y}:x='{yon.format(d=max(sure, 0.1))}':y='(ih-oh)/2',"
              f"setsar=1,fps={FPS},eq=brightness=-0.05:saturation=1.12")
        _ff("-stream_loop", "-1", "-i", str(klip), "-t", f"{sure:.3f}", "-vf", vf, *kod, str(hedef))
    else:
        c0, c1 = RENKLER[i % len(RENKLER)]
        _ff("-f", "lavfi", "-i", f"gradients=s={G}x{Y}:c0={c0}:c1={c1}:x0=0:y0=0:x1={G}:y1={Y}:speed=0.015:rate={FPS}",
            "-t", f"{sure:.3f}", "-vf", "setsar=1", *kod, str(hedef))


def fotograf_videosu(foto: Path, sure: float, hedef: Path, i: int, kod: list[str]) -> None:
    """Fotoğraftan dikey video: bulanık arka plan + ortada yavaşça yakınlaşan (ya da uzaklaşan) fotoğraf."""
    from PIL import Image

    w, h = Image.open(foto).size
    kare = max(int(sure * FPS), 1)
    if h / w >= 1.3:  # zaten dikey: tam ekran
        fw, fh, oy = G, Y, 0
    else:
        fw = G
        fh = min(int(G * h / w) // 2 * 2, Y)
        oy = -90  # altyazıya yer kalsın diye biraz yukarıda
    z = f"1+0.10*on/{kare}" if i % 2 == 0 else f"1.10-0.10*on/{kare}"
    filtre = (
        f"[0:v]scale={G}:{Y}:force_original_aspect_ratio=increase,crop={G}:{Y},boxblur=40:4,"
        f"eq=brightness=-0.22:saturation=1.2,setsar=1[bg];"
        f"[0:v]scale={fw * 2}:{fh * 2}:force_original_aspect_ratio=increase,crop={fw * 2}:{fh * 2},"
        f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={fw}x{fh}:fps={FPS},setsar=1[fg];"
        f"[bg][fg]overlay=x=(W-w)/2:y=(H-h)/2+{oy},fps={FPS},eq=saturation=1.08[v]"
    )
    _ff("-loop", "1", "-framerate", str(FPS), "-i", str(foto), "-filter_complex", filtre,
        "-map", "[v]", "-frames:v", str(kare), *kod, str(hedef))


# ---------- altyazı (ASS) ----------

def _ts(t: float) -> str:
    t = max(t, 0)
    s = int(t)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}.{int((t - s) * 100):02d}"


def _temiz(m: str) -> str:
    return m.replace("{", "(").replace("}", ")").replace("\\", "")


def altyazi_yaz(parcalar: list[Parca], vurgular: list[str], hedef: Path) -> None:
    f = ayarlar.FONT
    satirlar = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {G}", f"PlayResY: {Y}", "WrapStyle: 0", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Alt,{f},96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,1,0,1,7,4,2,70,70,640,1",
        f"Style: Vurgu,{f},120,&H0000D4FF,&H0000D4FF,&H00000000,&H96000000,-1,0,0,0,100,100,2,0,1,8,5,8,60,60,330,1",
        f"Style: Imza,{f},44,&H60FFFFFF,&H60FFFFFF,&H90000000,&H00000000,-1,0,0,0,100,100,1,0,1,3,0,2,60,60,520,1",
        "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    tum = [k for p in parcalar for k in p.kelimeler]

    # 1-3 kelimelik gruplar; noktalama işaretinde grup biter
    # her cümle/sahne kendi içinde gruplanır; bir grup asla iki sahneye taşmaz
    gruplar = []
    for p in parcalar:
        grup = []
        for k in p.kelimeler:
            grup.append(k)
            if len(grup) == 3 or k.metin[-1:] in ".,!?;:" or sum(len(x.metin) for x in grup) > 16:
                gruplar.append(grup)
                grup = []
        if grup:
            gruplar.append(grup)

    for gi, grp in enumerate(gruplar):
        sonraki = gruplar[gi + 1][0].bas if gi + 1 < len(gruplar) else grp[-1].son + 0.4
        grup_son = min(sonraki, grp[-1].son + 0.35)
        for wi, k in enumerate(grp):
            bas = k.bas
            son = grp[wi + 1].bas if wi + 1 < len(grp) else grup_son
            parcalar_metin = []
            for wj, w in enumerate(grp):
                yazi = _temiz(_buyuk(w.metin))
                if wj == wi:
                    yazi = r"{\c&H0000D4FF&\fscx112\fscy112}" + yazi + r"{\c&H00FFFFFF&\fscx100\fscy100}"
                parcalar_metin.append(yazi)
            pop = r"{\fad(40,0)}" if wi == 0 else ""
            satirlar.append(f"Dialogue: 0,{_ts(bas)},{_ts(son)},Alt,,0,0,0,,{pop}{' '.join(parcalar_metin)}")

    for p, v in zip(parcalar, vurgular):
        if v.strip():
            satirlar.append(
                f"Dialogue: 1,{_ts(p.bas)},{_ts(p.sonraki)},Vurgu,,0,0,0,,"
                r"{\fad(120,120)\t(0,180,\fscx115\fscy115)\t(180,320,\fscx100\fscy100)}" + _temiz(_buyuk(v)))
    imza = ayarlar.KANAL_KULLANICI or ayarlar.KANAL_ADI
    if imza and tum:
        satirlar.append(f"Dialogue: 2,{_ts(0)},{_ts(tum[-1].son + 1)},Imza,,0,0,0,,{_temiz(imza)}")
    hedef.write_text("\n".join(satirlar) + "\n", encoding="utf-8")


# ---------- son montaj ----------

# Yapay zekâ sesini "stüdyo kaydı" gibi yapan zincir: gürültü/uğultu kesme, çamur azaltma,
# netlik (presence) artırma, hafif sıkıştırma ve çok hafif oda yansıması.
VOKAL = ("highpass=f=75,equalizer=f=220:t=q:w=1:g=-2.5,equalizer=f=3200:t=q:w=1.2:g=2.5,"
         "equalizer=f=9500:t=q:w=1:g=1.5,"
         "acompressor=threshold=0.125:ratio=3:attack=5:release=150:makeup=1.5,"
         "aecho=0.9:0.5:22|37:0.10|0.06")


def ambiyans(klasor: Path, sure: float) -> Path:
    """Müzik klasörü boşsa: telifsiz, yavaş nefes alan sentetik bir 'pad' (La minör) üretir."""
    ifade = ("0.06*sin(2*PI*110*t)*(0.7+0.3*sin(2*PI*0.07*t))"
             "+0.045*sin(2*PI*164.81*t)*(0.7+0.3*sin(2*PI*0.11*t+1))"
             "+0.035*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*0.05*t+2))"
             "+0.025*sin(2*PI*261.63*t)*(0.5+0.5*sin(2*PI*0.09*t+3))"
             "+0.015*sin(2*PI*329.63*t)*(0.5+0.5*sin(2*PI*0.13*t))")
    hedef = klasor / "ambiyans.wav"
    _ff("-f", "lavfi", "-i", f"aevalsrc={ifade}:s=48000:d={sure + 1:.2f}",
        "-af", f"lowpass=f=1800,aecho=0.8:0.85:300|600|900:0.35|0.25|0.15,"
               f"afade=t=in:d=1.5,afade=t=out:st={max(sure - 1.2, 0):.2f}:d=1.5", str(hedef))
    return hedef


def whoosh(klasor: Path) -> Path:
    """Sahne geçişleri için kısa, yumuşak 'hışırtı' efekti."""
    hedef = klasor / "whoosh.wav"
    _ff("-f", "lavfi", "-i", "anoisesrc=d=0.7:c=pink:r=48000:a=0.5",
        "-af", "highpass=f=500,lowpass=f=5000,afade=t=in:d=0.45:curve=exp,afade=t=out:st=0.45:d=0.25",
        str(hedef))
    return hedef


def birlestir(sahneler: list[Path], ses: Path, ass: Path, klasor: Path, hedef: Path,
              kesimler: list[float] | None = None) -> float:
    liste = klasor / "sahneler.txt"
    liste.write_text("".join(f"file '{s.name}'\n" for s in sahneler), encoding="utf-8")
    ham = klasor / "ham.mp4"
    _ff("-f", "concat", "-safe", "0", "-i", liste.name, "-c", "copy", ham.name, cwd=klasor)

    from .ses import sure as _sure
    toplam = _sure(ses) + 0.3

    muzikler = sorted(ayarlar.MUZIK.glob("*.mp3")) if ayarlar.MUZIK.exists() else []
    girdiler = ["-i", ham.name, "-i", str(ses.resolve())]
    v = (f"[0:v]ass={ass.name}[s];color=c=0xFFD400:s={G}x12:r={FPS}:d={toplam:.3f}[bar];"
         f"[s][bar]overlay=x='-w+w*t/{toplam:.3f}':y=0:shortest=1[v]")

    a = [f"[1:a]aresample=48000,{VOKAL},asplit=2[ses][yan]"]
    karisim = ["[ses]"]
    # arka plan: senin müziğin ya da sentetik ambiyans (konuşurken otomatik kısılır)
    if muzikler:
        girdiler += ["-stream_loop", "-1", "-i", str(random.choice(muzikler).resolve())]
        a.append("[2:a]aresample=48000,volume=0.22[m]")
    elif ayarlar.al("AMBIYANS", "evet").lower() not in ("hayir", "hayır", "0", "no"):
        girdiler += ["-i", str(ambiyans(klasor, toplam).resolve())]
        a.append("[2:a]aresample=48000,volume=0.55[m]")
    if girdiler.count("-i") > 2:
        a.append("[m][yan]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=500[md]")
        karisim.append("[md]")
    else:
        a.append("[yan]anullsink")
    # sahne geçişlerinde whoosh
    kesimler = [k for k in (kesimler or []) if 0.5 < k < toplam - 0.3]
    if kesimler:
        wi = girdiler.count("-i")
        girdiler += ["-i", str(whoosh(klasor).resolve())]
        a.append(f"[{wi}:a]aresample=48000,volume=0.22,asplit={len(kesimler)}" +
                 "".join(f"[w{j}]" for j in range(len(kesimler))))
        for j, k in enumerate(kesimler):
            ms = max(int((k - 0.45) * 1000), 0)
            a.append(f"[w{j}]adelay={ms}|{ms}[wd{j}]")
            karisim.append(f"[wd{j}]")
    a.append("".join(karisim) + f"amix=inputs={len(karisim)}:duration=first:normalize=0,"
             "loudnorm=I=-14:TP=-1.5:LRA=11,aformat=channel_layouts=stereo[a]")
    _ff(*girdiler, "-filter_complex", f"{v};" + ";".join(a), "-map", "[v]", "-map", "[a]",
        "-t", f"{toplam:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-maxrate", "12M", "-bufsize", "24M", "-profile:v", "high",
        "-pix_fmt", "yuv420p", "-r", str(FPS), "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-movflags", "+faststart", str(hedef.resolve()), cwd=klasor)
    return toplam


# ---------- kapak ----------

def _font(boyut: int):
    from PIL import ImageFont
    for yol in ["C:/Windows/Fonts/ariblk.ttf", "C:/Windows/Fonts/arialbd.ttf",
                "/System/Library/Fonts/Supplemental/Arial Black.ttf", "/Library/Fonts/Arial Black.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]:
        if Path(yol).exists():
            return ImageFont.truetype(yol, boyut)
    return ImageFont.load_default(size=boyut)


def kapak(ham_video: Path, yazi: str, hedef: Path) -> None:
    from PIL import Image, ImageDraw, ImageEnhance

    kare = hedef.with_suffix(".kare.png")
    _ff("-ss", "1.2", "-i", str(ham_video), "-frames:v", "1", str(kare))
    img = ImageEnhance.Brightness(Image.open(kare).convert("RGB")).enhance(0.75)
    d = ImageDraw.Draw(img)
    kelimeler, satirlar, satir = _buyuk(yazi).split(), [], ""
    font = _font(150)
    for k in kelimeler:
        dene = f"{satir} {k}".strip()
        if d.textlength(dene, font=font) > G - 140 and satir:
            satirlar.append(satir)
            satir = k
        else:
            satir = dene
    satirlar.append(satir)
    y = Y // 2 - len(satirlar) * 90
    for i, s in enumerate(satirlar):
        w = d.textlength(s, font=font)
        renk = (255, 212, 0) if i % 2 == 0 else (255, 255, 255)
        d.text(((G - w) / 2, y), s, font=font, fill=renk, stroke_width=10, stroke_fill=(0, 0, 0))
        y += 180
    img.save(hedef, quality=92)
    kare.unlink(missing_ok=True)
