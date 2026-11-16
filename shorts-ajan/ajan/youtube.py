"""YouTube'a otomatik yükleme (resmi YouTube Data API v3).
Bir kez `python ajan.py --youtube-baglan` ile izin verilir; sonrasında token dosyasıyla sessizce çalışır."""
import json
import time
from datetime import datetime, timedelta
from pathlib import Path

from . import ayarlar

SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"]
SIR = ayarlar.KOK / "client_secret.json"
TOKEN = ayarlar.KOK / "youtube_token.json"
TAKVIM = ayarlar.CIKTI / "takvim.json"
KATEGORI_EGITIM = "27"


def _kimlik(etkilesimli: bool = True):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    kimlik = Credentials.from_authorized_user_file(str(TOKEN), SCOPES) if TOKEN.exists() else None
    if kimlik and kimlik.valid:
        return kimlik
    if kimlik and kimlik.expired and kimlik.refresh_token:
        try:
            kimlik.refresh(Request())
            TOKEN.write_text(kimlik.to_json(), encoding="utf-8")
            return kimlik
        except Exception:
            kimlik = None
    if not etkilesimli:
        raise RuntimeError("YouTube bağlantısı yok/süresi dolmuş. Bir kez çalıştır: python ajan.py --youtube-baglan")
    if not SIR.exists():
        raise SystemExit(
            "client_secret.json bulunamadı. kanal/YOUTUBE_BAGLANTI.md rehberindeki adımları izleyip "
            "indirdiğin dosyayı bu klasöre client_secret.json adıyla koy.")
    from google_auth_oauthlib.flow import InstalledAppFlow

    akis = InstalledAppFlow.from_client_secrets_file(str(SIR), SCOPES)
    kimlik = akis.run_local_server(port=0, open_browser=True,
                                   authorization_prompt_message="Tarayıcıda Merakmetre kanalının hesabını seç: {url}",
                                   success_message="Bağlantı tamam, bu sekmeyi kapatabilirsin.")
    TOKEN.write_text(kimlik.to_json(), encoding="utf-8")
    return kimlik


def _servis(etkilesimli: bool = True):
    from googleapiclient.discovery import build

    return build("youtube", "v3", credentials=_kimlik(etkilesimli), cache_discovery=False)


def baglan() -> str:
    """İzin akışını çalıştırır, bağlanılan kanal adını döner."""
    yt = _servis(etkilesimli=True)
    kanallar = yt.channels().list(part="snippet", mine=True).execute().get("items", [])
    return kanallar[0]["snippet"]["title"] if kanallar else "(kanal bulunamadı)"


# ---------- yayın takvimi ----------

def _takvim_oku() -> list[str]:
    try:
        return json.loads(TAKVIM.read_text(encoding="utf-8"))
    except Exception:
        return []


def siradaki_yayin_zamani() -> datetime | None:
    """YAYIN_SAATLERI (ör. '12:30,19:30') doluysa, henüz kullanılmamış ilk gelecek saati döner."""
    saatler = [s.strip() for s in ayarlar.al("YAYIN_SAATLERI").split(",") if s.strip()]
    if not saatler:
        return None
    dolu = set(_takvim_oku())
    simdi = datetime.now().astimezone()
    for gun in range(0, 60):
        tarih = (simdi + timedelta(days=gun)).date()
        for s in sorted(saatler):
            sa, dk = (int(x) for x in s.split(":"))
            aday = datetime(tarih.year, tarih.month, tarih.day, sa, dk, tzinfo=simdi.tzinfo)
            if aday > simdi + timedelta(minutes=20) and aday.isoformat() not in dolu:
                return aday
    return None


def _takvime_ekle(zaman: datetime) -> None:
    t = _takvim_oku() + [zaman.isoformat()]
    TAKVIM.parent.mkdir(parents=True, exist_ok=True)
    TAKVIM.write_text(json.dumps(t[-500:], indent=1), encoding="utf-8")


# ---------- yükleme ----------

def _temizle(metin: str, sinir: int) -> str:
    return metin.replace("<", "‹").replace(">", "›").strip()[:sinir]


def yukle(video: Path, baslik: str, aciklama: str, etiketler: list[str], etkilesimli: bool = False) -> dict:
    from googleapiclient.errors import HttpError
    from googleapiclient.http import MediaFileUpload

    yt = _servis(etkilesimli)

    # etiketlerin toplamı 500 karakteri geçemez
    secili, toplam = [], 0
    for e in etiketler:
        e = _temizle(e, 100)
        if e and toplam + len(e) + 1 <= 480:
            secili.append(e)
            toplam += len(e) + 1

    gizlilik = ayarlar.al("YUKLEME_GIZLILIK", "public")
    zaman = siradaki_yayin_zamani()
    durum = {
        "privacyStatus": "private" if zaman else gizlilik,
        "selfDeclaredMadeForKids": False,
        "containsSyntheticMedia": False,  # gerçek kişi/olay taklidi yok: TTS + stok görüntü
        "embeddable": True,
    }
    if zaman:
        durum["publishAt"] = zaman.isoformat()

    govde = {
        "snippet": {
            "title": _temizle(baslik, 100),
            "description": _temizle(aciklama, 4900),
            "tags": secili,
            "categoryId": KATEGORI_EGITIM,
            "defaultLanguage": ayarlar.DIL,
            "defaultAudioLanguage": ayarlar.DIL,
        },
        "status": durum,
    }
    medya = MediaFileUpload(str(video), mimetype="video/mp4", chunksize=8 * 1024 * 1024, resumable=True)
    istek = yt.videos().insert(part="snippet,status", body=govde, media_body=medya)

    yanit, deneme = None, 0
    while yanit is None:
        try:
            ilerleme, yanit = istek.next_chunk()
            if ilerleme:
                print(f"     ⬆ %{int(ilerleme.progress() * 100)}")
        except HttpError as e:
            if e.resp.status in (500, 502, 503, 504) and deneme < 5:
                deneme += 1
                time.sleep(2 ** deneme)
                continue
            if e.resp.status == 403 and b"quota" in e.content:
                raise RuntimeError("Günlük YouTube API kotası doldu (≈6 video/gün). Yarın tekrar dene.") from e
            raise

    if zaman:
        _takvime_ekle(zaman)
    sonuc = {
        "video_id": yanit["id"],
        "url": f"https://youtube.com/shorts/{yanit['id']}",
        "gizlilik": yanit.get("status", {}).get("privacyStatus"),
        "yayin_zamani": zaman.isoformat() if zaman else "hemen",
        "yuklenme": datetime.now().isoformat(timespec="seconds"),
    }
    return sonuc
