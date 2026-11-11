"""Wikipedia / Wikimedia Commons yardımcıları (görsel listesi, indirme, lisans bilgisi)."""
import json, os, re, ssl, time, urllib.parse, urllib.request

UA = "BiyografiVideoUretici/1.0 (educational documentary video tool; low-volume thumbnail downloads)"
_CA = "/root/.ccr/ca-bundle.crt"
_CTX = ssl.create_default_context(cafile=_CA) if os.path.exists(_CA) else ssl.create_default_context()


_last = [0.0]


def get(url, binary=False, tries=10):
    for i in range(tries):
        wait = 3.0 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, context=_CTX, timeout=60) as r:
                data = r.read()
            return data if binary else data.decode("utf-8")
        except Exception as e:  # noqa
            if i == tries - 1:
                raise
            ra = getattr(e, "headers", None) and e.headers.get("Retry-After")
            time.sleep(min(int(ra), 900) if ra and ra.isdigit() else min(10 * 2 ** i, 300))


def api(host, **params):
    params.setdefault("format", "json")
    return json.loads(get(f"https://{host}/w/api.php?" + urllib.parse.urlencode(params)))


def category_files(cat, limit=200):
    """Commons kategorisindeki görsel dosyaları."""
    d = api("commons.wikimedia.org", action="query", list="categorymembers", cmtitle="Category:" + cat,
            cmtype="file", cmlimit=limit)
    return [x["title"].split(":", 1)[1] for x in d["query"]["categorymembers"]
            if not x["title"].lower().endswith((".svg", ".ogg", ".oga", ".webm", ".ogv", ".pdf", ".djvu", ".tif", ".tiff", ".mp3", ".wav", ".flac"))]


def subcats(cat):
    d = api("commons.wikimedia.org", action="query", list="categorymembers", cmtitle="Category:" + cat,
            cmtype="subcat", cmlimit=200)
    return [x["title"].split(":", 1)[1] for x in d["query"]["categorymembers"]]


def article_images(title, lang="en"):
    """Makaledeki görselleri makaledeki SIRASIYLA döndürür."""
    d = api(f"{lang}.wikipedia.org", action="parse", page=title, prop="text", redirects=1)
    html = d["parse"]["text"]["*"]
    names = []
    for m in re.finditer(r'href="/wiki/(?:File|Dosya):([^"]+)"', html):
        n = urllib.parse.unquote(m.group(1)).replace("_", " ")
        if n not in names and not n.lower().endswith((".svg", ".ogg", ".oga", ".webm", ".ogv")):
            names.append(n)
    return names


STD_W = [3840, 2560, 1920, 1280, 960, 500, 330, 250]


def thumb_url(orig, w, want=1920):
    """upload.wikimedia.org üzerinden standart boyutlu küçük resim adresi (orijinaller hız sınırına takılıyor)."""
    orig = orig.split("?")[0]
    sizes = [x for x in STD_W if x < w and x <= max(want, 500)]
    if not sizes or "/commons/" not in orig:
        return orig
    tw = sizes[0]
    head, fname = orig.rsplit("/", 1)
    t = head.replace("/wikipedia/commons/", "/wikipedia/commons/thumb/") + "/" + fname + f"/{tw}px-" + fname
    if fname.lower().endswith((".tif", ".tiff")):
        t += ".jpg"
    return t


def file_info(names, width=1920):
    """Commons/yerel dosyalar için url + lisans + yazar bilgisi."""
    out = {}
    for i in range(0, len(names), 40):
        chunk = names[i:i + 40]
        for host in ("commons.wikimedia.org",):
            d = api(host, action="query", titles="|".join("File:" + n for n in chunk), prop="imageinfo",
                    iiprop="url|size|extmetadata", iiurlwidth=width,
                    iiextmetadatafilter="LicenseShortName|Artist|ImageDescription|Credit")
            norm = {x["to"]: x["from"] for x in d["query"].get("normalized", [])}
            for p in d["query"]["pages"].values():
                if "imageinfo" not in p:
                    continue
                ii = p["imageinfo"][0]
                m = ii.get("extmetadata", {})
                strip = lambda s: re.sub(r"<[^>]+>", "", s or "").strip()
                name = p["title"].split(":", 1)[1]
                out[name] = {
                    "url": thumb_url(ii["url"], ii["width"], width),
                    "page": ii.get("descriptionurl"),
                    "w": ii["width"], "h": ii["height"],
                    "license": strip(m.get("LicenseShortName", {}).get("value")),
                    "artist": strip(m.get("Artist", {}).get("value"))[:120],
                    "desc": strip(m.get("ImageDescription", {}).get("value"))[:160],
                }
    return out


def search_files(query, limit=10):
    d = api("commons.wikimedia.org", action="query", list="search", srnamespace=6,
            srsearch=query + " filetype:bitmap", srlimit=limit)
    return [x["title"].split(":", 1)[1] for x in d["query"]["search"]]


OK_LICENSE = re.compile(r"public domain|^pd|cc0|cc by|cc-by|attribution|no restrictions|fal", re.I)
