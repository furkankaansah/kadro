"""Trend tohumları: Google Trends, Reddit, YouTube. Her kaynak hata verirse sessizce atlanır.
Asıl araştırmayı Claude web aramasıyla yapar; bunlar ona 'şu an ne konuşuluyor' ipucu verir."""
import json
import urllib.request
import xml.etree.ElementTree as ET

from . import ayarlar

UA = {"User-Agent": "Mozilla/5.0 (shorts-ajan)"}


def _get(url: str, timeout: int = 15) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def google_trends(ulke: str) -> list[str]:
    veri = _get(f"https://trends.google.com/trending/rss?geo={ulke}")
    kok = ET.fromstring(veri)
    ns = {"ht": "https://trends.google.com/trending/rss"}
    sonuc = []
    for item in kok.iter("item"):
        baslik = item.findtext("title", "")
        trafik = item.findtext("ht:approx_traffic", "", ns)
        haber = item.findtext("ht:news_item/ht:news_item_title", "", ns)
        sonuc.append(f"{baslik} ({trafik} arama) — {haber}".strip(" —"))
    return sonuc[:25]


def reddit_populer() -> list[str]:
    veri = json.loads(_get("https://www.reddit.com/r/popular/top.json?t=day&limit=25"))
    return [
        f"{c['data']['title']} (r/{c['data']['subreddit']}, {c['data']['ups']} oy)"
        for c in veri["data"]["children"]
    ]


def youtube_trend(ulke: str) -> list[str]:
    if not ayarlar.YOUTUBE_KEY:
        return []
    url = (
        "https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics"
        f"&chart=mostPopular&maxResults=25&regionCode={ulke}&key={ayarlar.YOUTUBE_KEY}"
    )
    veri = json.loads(_get(url))
    return [
        f"{v['snippet']['title']} ({v['statistics'].get('viewCount', '?')} izlenme)"
        for v in veri.get("items", [])
    ]


def topla() -> dict[str, list[str]]:
    kaynaklar = {
        f"Google Trends {ayarlar.ULKE}": lambda: google_trends(ayarlar.ULKE),
        "Google Trends US (global)": lambda: google_trends("US"),
        "Reddit popüler (bugün)": reddit_populer,
        f"YouTube trend {ayarlar.ULKE}": lambda: youtube_trend(ayarlar.ULKE),
    }
    sonuc = {}
    for ad, fn in kaynaklar.items():
        try:
            liste = fn()
            if liste:
                sonuc[ad] = liste
                print(f"  ✓ {ad}: {len(liste)} başlık")
        except Exception as e:  # ağ yok, rate limit vb.
            print(f"  – {ad} atlandı ({type(e).__name__})")
    return sonuc
