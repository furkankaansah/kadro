#!/usr/bin/env python3
"""Frame renderer: archival stills -> 1080x1920 cinematic B&W film look + titles/subtitles.
Writes raw RGB frames to stdout (pipe into ffmpeg)."""
import json, math, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H, FPS, DUR = 1080, 1920, 30, 60.0
N = int(FPS * DUR)
FONT = lambda f, s: ImageFont.truetype(os.path.join(ROOT, "fonts", f), s)
RED = (227, 10, 23)
rng = np.random.default_rng(1938)

cfg = json.load(open(os.path.join(ROOT, os.environ.get("TL", "timeline.json"))))
ONLY = None
if len(sys.argv) > 1:  # preview: list of frame numbers
    ONLY = [int(x) for x in sys.argv[1].split(",")]

def smooth(x):
    x = min(1.0, max(0.0, x)); return x * x * (3 - 2 * x)

def ease_io(x):
    x = min(1.0, max(0.0, x)); return 0.5 - 0.5 * math.cos(math.pi * x)

# ---------------------------------------------------------------- images
_cache = {}
def load(name, crop=None):
    key = (name, tuple(crop) if crop else None)
    if key in _cache: return _cache[key]
    p = os.path.join(ROOT, "dl", name)
    im = Image.open(p)
    if crop:
        iw, ih = im.size; im = im.crop((int(crop[0]*iw), int(crop[1]*ih), int(crop[2]*iw), int(crop[3]*ih)))
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA"); bg = Image.new("RGBA", im.size, (255, 255, 255, 255)); bg.alpha_composite(im); im = bg
    g = im.convert("L")
    a = np.asarray(g).astype(np.float32) / 255.0
    lo, hi = np.percentile(a, 0.5), np.percentile(a, 99.6)
    a = np.clip((a - lo) / max(1e-3, hi - lo), 0, 1)
    _cache[key] = Image.fromarray((a * 255).astype(np.uint8))
    return _cache[key]

def cover_crop(img, cx, cy, zoom, jitter=(0, 0)):
    """Crop a 9:16 window centred at (cx,cy) (normalised), zoom>=1 relative to max cover window."""
    iw, ih = img.size
    ch = ih if iw / ih > W / H else iw * H / W  # largest 9:16 window
    ch /= zoom; cw = ch * W / H
    x0 = cx * iw - cw / 2; y0 = cy * ih - ch / 2
    x0 = min(max(0, x0), iw - cw); y0 = min(max(0, y0), ih - ch)
    x0 += jitter[0] * cw / W; y0 += jitter[1] * ch / H
    return img.transform((W, H), Image.Transform.EXTENT, (x0, y0, x0 + cw, y0 + ch), Image.Resampling.BICUBIC)

_bgcache = {}
def fit_frame(img, name, zoom, cy_out, pan, jitter=(0, 0)):
    """Landscape image: blurred cover background + full-width foreground with slow zoom/pan."""
    if name not in _bgcache:
        bg = cover_crop(img, 0.5, 0.5, 1.0).filter(ImageFilter.GaussianBlur(28))
        bga = np.asarray(bg).astype(np.float32) * 0.42
        _bgcache[name] = Image.fromarray(bga.astype(np.uint8))
    frame = _bgcache[name].copy()
    iw, ih = img.size
    fw = W * zoom; fh = fw * ih / iw
    # source window so that foreground is W wide (crop sides when zoom>1)
    sw = iw / zoom; sx0 = (iw - sw) * pan
    fg = img.transform((W, int(round(fh / zoom * zoom))), Image.Transform.EXTENT,
                       (sx0 + jitter[0], 0, sx0 + sw + jitter[0], ih), Image.Resampling.BICUBIC)
    fg = fg.resize((W, int(fh)), Image.Resampling.BICUBIC) if fg.size[1] != int(fh) else fg
    y = int(H * cy_out - fh / 2 + jitter[1])
    # soft vertical feather
    mask = Image.new("L", fg.size, 255)
    md = np.asarray(mask).astype(np.float32)
    f = max(1, int(fg.size[1] * 0.12))
    ramp = np.linspace(0, 1, f)[:, None]
    md[:f] *= ramp; md[-f:] *= ramp[::-1]
    frame.paste(fg, (0, y), Image.fromarray(md.astype(np.uint8)))
    return frame

def shot_frame(s, t):
    img = load(s["img"], s.get("crop"))
    u = (t - s["t0"]) / (s["t1"] - s["t0"])
    k = ease_io(u) if s.get("ease", True) else u
    jit = (rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6))
    if s.get("mode", "cover") == "fit":
        z = s["z0"] + (s["z1"] - s["z0"]) * k
        pan = s.get("p0", 0.5) + (s.get("p1", 0.5) - s.get("p0", 0.5)) * k
        fr = fit_frame(img, s["img"] + str(s.get("crop")), z, s.get("cy", 0.5), pan, jit)
    else:
        cx = s["c0"][0] + (s["c1"][0] - s["c0"][0]) * k
        cy = s["c0"][1] + (s["c1"][1] - s["c0"][1]) * k
        z = s["z0"] * (s["z1"] / s["z0"]) ** k
        fr = cover_crop(img, cx, cy, z, jit)
    a = np.asarray(fr).astype(np.float32) / 255.0
    # per-shot exposure + fades to/from black
    b = s.get("gain", 1.0)
    if "black_in" in s: b *= smooth((t - s["t0"]) / s["black_in"])
    if "black_out" in s: b *= smooth((s["t1"] - t) / s["black_out"])
    if "dim" in s:  # [t_start, t_end, level]: gradual darkening
        d0, d1, lv = s["dim"]; b *= 1 - (1 - lv) * smooth((t - d0) / (d1 - d0))
    return a * b

# ---------------------------------------------------------------- film look
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
r = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.60)) ** 2)
VIGNETTE = np.clip(1.0 - 0.62 * r ** 2.2, 0.18, 1.0)
_yn = (yy / H)
VIGNETTE *= (1 - 0.45 * np.clip((0.26 - _yn) / 0.26, 0, 1) ** 1.5) * (1 - 0.35 * np.clip((_yn - 0.62) / 0.38, 0, 1) ** 1.5)
GRAIN = [np.asarray(Image.fromarray(((rng.standard_normal((H // 2, W // 2)) * 0.5 + 0.5).clip(0, 1) * 255).astype(np.uint8))
                    .resize((W, H), Image.Resampling.BILINEAR)).astype(np.float32) / 255.0 - 0.5 for _ in range(8)]
scratches = []  # (start_frame, length, x, strength)
for f in range(N):
    if rng.random() < cfg.get("scratch_p", 0.035):
        scratches.append((f, int(rng.integers(3, 12)), float(rng.uniform(80, W - 80)), float(rng.uniform(-0.18, 0.22))))

def film(a, f):
    a = 0.035 + 0.94 * a  # lift blacks, soften whites
    a = a ** 1.08
    a = a * (1 + 0.022 * math.sin(f * 1.7) * rng.uniform(0.4, 1.0) + rng.uniform(-0.012, 0.012))
    g = GRAIN[f % 8]; g = np.roll(g, (int(rng.integers(0, 64)), int(rng.integers(0, 64))), (0, 1))
    a = a + g * cfg.get("grain", 0.085) * (0.55 + 0.45 * a)
    a = a * VIGNETTE
    for (f0, ln, x, st) in scratches:
        if f0 <= f < f0 + ln:
            xi = int(x + (f - f0) * 0.7); w = 2
            a[:, max(0, xi - w):xi + w] += st * 0.5
    if rng.random() < cfg.get("dust_p", 0.25):  # dust specks
        for _ in range(int(rng.integers(1, 4))):
            x, y, rr = int(rng.integers(0, W)), int(rng.integers(0, H)), int(rng.integers(2, 6))
            a[max(0, y - rr):y + rr, max(0, x - rr):x + rr] *= rng.uniform(0.2, 1.6)
    return np.clip(a, 0, 1)

RAIN = None
def rain_layer(f):
    global RAIN
    if RAIN is None:
        r2 = np.random.default_rng(5); n = 260
        RAIN = dict(x=r2.uniform(-200, W, n), y=r2.uniform(0, H, n), v=r2.uniform(55, 95, n), l=r2.uniform(40, 110, n), a=r2.uniform(25, 70, n))
    im = Image.new("L", (W, H), 0); d = ImageDraw.Draw(im)
    ys = (RAIN["y"] + RAIN["v"] * f) % (H + 200) - 100
    xs = RAIN["x"] + ys * 0.12
    for x, y, l, al in zip(xs, ys, RAIN["l"], RAIN["a"]):
        d.line([(x, y), (x + l * 0.12, y + l)], fill=int(al), width=2)
    return np.asarray(im.filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255.0

def tone_rgb(a):
    # subtle warm silver tone
    if cfg.get("grade") == "blue":
        return np.stack([a * 0.84 + 0.004, a * 0.93 + 0.010, a * 1.04 + 0.030], -1).clip(0, 1)
    return np.stack([a * 1.00 + 0.010, a * 0.975 + 0.006, a * 0.93], -1).clip(0, 1)

# ---------------------------------------------------------------- flag
FLAG = None
def flag_layer(t, t0, t1, alpha_max):
    """Real Turkish flag image (Commons SVG render) with a soft waving displacement."""
    global FLAG
    if FLAG is None:
        fl = Image.open(os.path.join(ROOT, "dl", cfg["flag"])).convert("RGB")
        fh = int(H * cfg.get("flag_h", 0.2)); fw = int(fh * fl.size[0] / fl.size[1])
        FLAG = np.asarray(fl.resize((fw, fh), Image.Resampling.LANCZOS)).astype(np.float32) / 255.0
    fh, fw, _ = FLAG.shape
    yy_, xx_ = np.mgrid[0:fh, 0:fw].astype(np.float32)
    ph = t * 2.4
    dy = 9 * np.sin(xx_ / fw * 2 * math.pi * 1.3 - ph) * (xx_ / fw)
    dx = 4 * np.sin(yy_ / fh * 2 * math.pi * 0.8 - ph * 0.7) * (xx_ / fw)
    sy = np.clip(yy_ + dy, 0, fh - 1).astype(np.int32); sx = np.clip(xx_ + dx, 0, fw - 1).astype(np.int32)
    img = FLAG[sy, sx]
    shade = 1 + 0.16 * np.cos(xx_ / fw * 2 * math.pi * 1.3 - ph) * (xx_ / fw)
    img = (img * shade[..., None]).clip(0, 1)
    al = alpha_max * smooth((t - t0) / (t1 - t0))
    return img, al

# ---------------------------------------------------------------- text
def text_img(lines, font, fill=(255, 255, 255), spacing=1.18, track=0, shadow=True, maxw=W - 140):
    """lines: list of list of (text, is_red). Returns RGBA."""
    rendered = []
    inf = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", int(font.size * 0.9))
    for ln in lines:
        wsum = 0; parts = []
        for txt0, red in ln:
            if txt0 == "\U0001f940":
                ww = font.size * 1.1; parts.append(("EMOJI", red, ww, None)); wsum += ww; continue
            for j, txt in enumerate(txt0.split("\u221e")):
                if j > 0:
                    ww = inf.getlength("\u221e"); parts.append(("\u221e", red, ww, inf)); wsum += ww
                if not txt: continue
                ww = font.getlength(txt) + track * len(txt)
                parts.append((txt, red, ww, font)); wsum += ww
        rendered.append((parts, wsum))
    asc, desc = font.getmetrics(); lh = int((asc + desc) * spacing)
    tw = int(max(w for _, w in rendered)) + 80; th = lh * len(rendered) + 80
    im = Image.new("RGBA", (tw, th), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for i, (parts, wsum) in enumerate(rendered):
        x = (tw - wsum) / 2; y = 40 + i * lh
        for txt, red, ww, fnt in parts:
            col = RED if red else fill
            if fnt is None:
                em = Image.open(os.path.join(ROOT, "mg", "rose.png")).convert("RGBA").resize((int(font.size), int(font.size)), Image.Resampling.LANCZOS)
                im.paste(em, (int(x + font.size * 0.1), int(y + font.size * 0.12)), em); x += ww; continue
            if fnt is not font:
                d.text((x, y + font.size * 0.08), txt, font=fnt, fill=col + (255,)); x += ww; continue
            if track:
                for ch in txt:
                    d.text((x, y), ch, font=font, fill=col + (255,), stroke_width=0)
                    x += font.getlength(ch) + track
            else:
                d.text((x, y), txt, font=font, fill=col + (255,), stroke_width=3, stroke_fill=(0, 0, 0, 255))
                x += ww
    if shadow:
        sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
        sh.putalpha(im.getchannel("A").filter(ImageFilter.GaussianBlur(10)).point(lambda v: min(255, int(v * 1.6))))
        base = Image.new("RGBA", im.size, (0, 0, 0, 0)); base.alpha_composite(sh); base.alpha_composite(im)
        im = base
    return im

def parse_marked(s):
    """'a *b* c' -> [(a,False),(b,True),(c,False)] per line split by |"""
    out = []
    for line in s.split("|"):
        segs = []; red = False
        for i, piece in enumerate(line.split("*")):
            for k2, sub in enumerate(piece.split("\U0001f940")):
                if k2: segs.append(("\U0001f940", red))
                if sub: segs.append((sub, red))
            red = not red
        out.append(segs)
    return out

def wrap_marked(s, font, maxw):
    """Greedy wrap keeping *red* markers; returns '|' joined."""
    words = s.replace("|", " ").split(" ")
    lines, cur, red = [], [], False
    def width(ws):
        return font.getlength(" ".join(w.replace("*", "") for w in ws))
    for w in words:
        if cur and width(cur + [w]) > maxw:
            lines.append(cur); cur = [w]
        else: cur.append(w)
    lines.append(cur)
    # re-balance markers so each line has matched * pairs
    out = []; open_red = False
    for ln in lines:
        txt = " ".join(ln)
        if open_red: txt = "*" + txt
        open_red = (txt.count("*") % 2 == 1)
        if open_red: txt += "*"
        out.append(txt)
    return "|".join(out)

SUBFONT = FONT("Montserrat_700Bold.ttf", 64)
TEXTS = []
for c in cfg["subs"]:
    s = wrap_marked(c["text"], SUBFONT, 880)
    TEXTS.append(dict(t0=c["t0"], t1=c["t1"], img=text_img(parse_marked(s), SUBFONT), y=c.get("y", cfg["sub_y"]), kind="sub"))
for c in cfg["titles"]:
    f = FONT(c["font"], c["size"])
    TEXTS.append(dict(t0=c["t0"], t1=c["t1"], img=text_img(parse_marked(c["text"]), f, track=c.get("track", 0),
                                                              spacing=c.get("spacing", 1.18)),
                      y=c["y"], kind=c.get("anim", "fade"), fin=c.get("fade_in", 0.5), fout=c.get("fade_out", 0.5)))

def overlay(rgb, t):
    im = None
    for tx in TEXTS:
        if not (tx["t0"] - 0.01 <= t <= tx["t1"]): continue
        if tx["kind"] == "sub":
            fi, fo = 0.12, 0.15
        else:
            fi, fo = tx["fin"], tx["fout"]
        al = smooth((t - tx["t0"]) / fi) * smooth((tx["t1"] - t) / fo)
        if al <= 0: continue
        if im is None: im = Image.fromarray((rgb * 255).astype(np.uint8)).convert("RGBA")
        timg = tx["img"]
        scale = 1.0
        if tx["kind"] == "slowgrow":
            scale = 0.94 + 0.08 * smooth((t - tx["t0"]) / (tx["t1"] - tx["t0"]))
        elif tx["kind"] == "sub":
            scale = 0.97 + 0.03 * smooth((t - tx["t0"]) / 0.18)
        if scale != 1.0:
            timg = timg.resize((int(timg.width * scale), int(timg.height * scale)), Image.Resampling.BICUBIC)
        if al < 1:
            a = timg.getchannel("A").point(lambda v, al=al: int(v * al)); timg = timg.copy(); timg.putalpha(a)
        x = (W - timg.width) // 2; y = int(tx["y"] - timg.height / 2)
        im.alpha_composite(timg, (x, y))
    if im is None: return rgb
    return np.asarray(im.convert("RGB")).astype(np.float32) / 255.0

# ---------------------------------------------------------------- main loop
shots = cfg["shots"]
out = sys.stdout.buffer
frames = ONLY if ONLY is not None else range(N)
for f in frames:
    t = f / FPS
    acc = np.zeros((H, W), np.float32); wsum = 0.0
    for s in shots:
        if s["t0"] - 1e-6 <= t <= s["t1"] + 1e-6:
            xf_in = s.get("xin", 0.0); xf_out = s.get("xout", 0.0)
            w = 1.0
            if xf_in: w *= smooth((t - s["t0"]) / xf_in)
            if xf_out: w *= smooth((s["t1"] - t) / xf_out)
            if w <= 0: continue
            acc += shot_frame(s, t) * w; wsum += w
    a = acc / max(1.0, wsum) if wsum > 1 else acc
    a = film(a, f)
    rl = cfg.get("rain")
    if rl:
        k = float(np.interp(t, rl[0], rl[1]))
        if k > 0: a = np.clip(a + rain_layer(f) * k, 0, 1)
    rgb = tone_rgb(a)
    fl = cfg.get("flag_on")
    if fl and fl[0] <= t:
        img, al = flag_layer(t, fl[0], fl[1], fl[2])
        fh, fw, _ = img.shape
        y0 = int(fl[3] * H - fh / 2); x0 = (W - fw) // 2
        reg = rgb[y0:y0 + fh, max(0, x0):x0 + fw]
        src = img[:, max(0, -x0):max(0, -x0) + reg.shape[1]]
        # feathered edges
        fy = np.minimum(1, np.minimum(np.arange(fh), fh - 1 - np.arange(fh)) / (fh * 0.18))[:, None]
        fx = np.minimum(1, np.minimum(np.arange(reg.shape[1]), reg.shape[1] - 1 - np.arange(reg.shape[1])) / (reg.shape[1] * 0.12))[None, :]
        m = (fy * fx * al)[..., None]
        rgb[y0:y0 + fh, max(0, x0):x0 + fw] = reg * (1 - m) + src * m * (0.9 + 0.1 * reg.mean())
    rgb = overlay(rgb, t)
    fade = cfg.get("global_fade", [])
    for (a0, a1, mode) in fade:
        if a0 <= t <= a1:
            k = smooth((t - a0) / (a1 - a0)); rgb = rgb * (1 - k if mode == "out" else k)
    frame = (np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)
    if ONLY is not None:
        Image.fromarray(frame).save(os.path.join(ROOT, "work", f"prev_{f:04d}.jpg"), quality=88)
    else:
        out.write(frame.tobytes())
