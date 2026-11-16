"""Ajanın beyni: Claude ile trend araştırması (web araması) + senaryo/metadata yazımı."""
import json
from datetime import date

import anthropic
from pydantic import BaseModel, Field

from . import ayarlar

BETAS = ["server-side-fallback-2026-07-01"]
DIL_ADI = {"tr": "Turkish", "en": "English"}


class Sahne(BaseModel):
    metin: str = Field(description="Narration for this scene, spoken aloud. 1-2 short sentences.")
    gorsel_arama: str = Field(
        description="2-4 word ENGLISH stock-footage search query that visually matches this scene "
        "(e.g. 'city night traffic', 'scientist microscope'). Generic, no brand or person names."
    )
    vurgu: str = Field(description="Optional 1-3 word on-screen emphasis (big text), or empty string.")


class ShortPlani(BaseModel):
    konu: str
    neden_trend: str = Field(description="Why this is trending right now, with evidence.")
    kanca: str = Field(description="The very first spoken sentence (<= 12 words). Must stop the scroll.")
    sahneler: list[Sahne] = Field(description="5-9 scenes after the hook, in order.")
    kapanis: str = Field(description="Last spoken line; ideally loops back into the hook. No 'subscribe' begging.")
    baslik: str = Field(description="YouTube title, max 70 characters, curiosity-driven, no clickbait lies, no hashtags.")
    aciklama: str = Field(description="YouTube description, 2-4 lines, natural keywords.")
    hashtagler: list[str] = Field(description="3-5 hashtags without '#', most relevant first; 'shorts' is added automatically.")
    etiketler: list[str] = Field(description="10-15 YouTube tags (keywords).")
    kapak_yazisi: str = Field(description="2-5 word thumbnail text, punchy.")
    kaynaklar: list[str] = Field(description="Source URLs backing every factual claim.")
    dogruluk_notu: str = Field(description="Which claims the creator should double-check before posting, or 'none'.")
    en_iyi_yayin_saati: str = Field(description="Suggested local posting time window with one-line reason.")


def _istemci() -> anthropic.Anthropic:
    if not ayarlar.al("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY yok. .env dosyasına Claude API anahtarını yaz.")
    return anthropic.Anthropic()


ARASTIRMA_SISTEM = """You are the trend researcher of a faceless YouTube Shorts channel.
Your job: find topics that will get views AS A SHORT this week, verified with web search.

A good Shorts topic:
- has rising search/social interest right now (news, viral moments, releases, events, seasonal, a fact everyone is suddenly curious about),
- can be told in 40 seconds with a strong curiosity hook,
- can be illustrated with generic stock footage (no need for copyrighted clips, logos or a specific person's face),
- has verifiable facts.

Avoid: tragedies/deaths/disasters as entertainment, politics flame wars, medical or financial advice,
rumours you can't verify, anything requiring copyrighted footage or music, content about private people.

Use web search to confirm what is actually trending today and to collect concrete, surprising,
verified facts (numbers, dates, comparisons) with their source URLs."""


def arastir(tohumlar: dict[str, list[str]], adet: int, gecmis: list[str], konu: str | None) -> str:
    """Web aramalı araştırma. Sıralı konu listesi + her konu için doğrulanmış bilgiler döner (metin)."""
    istemci = _istemci()
    tohum_metni = "\n".join(
        f"## {kaynak}\n" + "\n".join(f"- {b}" for b in basliklar) for kaynak, basliklar in tohumlar.items()
    ) or "(No seed lists could be fetched; rely on web search.)"

    if konu:
        gorev = f"The creator wants a Short about: {konu!r}. Research it deeply (latest angle, best facts)."
        adet = 1
    else:
        gorev = (
            f"Pick the {adet} best DIFFERENT topics for Shorts right now for an audience in country "
            f"{ayarlar.ULKE} (language: {DIL_ADI.get(ayarlar.DIL, ayarlar.DIL)})."
        )
    nis = f"Channel niche: {ayarlar.NIS}. Stay inside it.\n" if ayarlar.NIS else "Channel niche: any (general interest).\n"
    eski = ("Do NOT repeat these already-made topics:\n" + "\n".join(f"- {g}" for g in gecmis[-40:]) + "\n") if gecmis else ""

    mesajlar = [{
        "role": "user",
        "content": (
            f"Today is {date.today().isoformat()}.\n{nis}{eski}\n"
            f"Trend seed lists scraped a minute ago:\n{tohum_metni}\n\n"
            f"{gorev}\n\n"
            "Output, for each topic: TOPIC NAME, why it's trending (evidence), the angle/hook idea, "
            "6-10 verified facts each with its source URL, and a virality score 1-10 with reason. "
            "Rank best first."
        ),
    }]
    araclar = [{"type": "web_search_20260209", "name": "web_search", "max_uses": 12}]

    for _ in range(6):  # pause_turn olursa devam ettir
        with istemci.beta.messages.stream(
            model=ayarlar.MODEL,
            max_tokens=32000,
            betas=BETAS,
            fallbacks="default",
            system=ARASTIRMA_SISTEM,
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
            tools=araclar,
            messages=mesajlar,
        ) as akis:
            yanit = akis.get_final_message()
        if yanit.stop_reason == "pause_turn":
            mesajlar.append({"role": "assistant", "content": yanit.content})
            continue
        if yanit.stop_reason == "refusal":
            raise RuntimeError("Claude bu araştırmayı reddetti; farklı bir konu/niş dene.")
        return "\n".join(b.text for b in yanit.content if b.type == "text")
    raise RuntimeError("Araştırma tamamlanamadı (çok fazla duraklama).")


SENARYO_SISTEM = """You are a top YouTube Shorts scriptwriter and editor for a faceless channel.
Write in {dil}. Rules:
- Total spoken length 35-50 seconds: roughly 95-130 words in total (hook + scenes + closing).
- The hook is spoken in the first 1.5 seconds. Open with the most surprising fact, a bold claim or a direct question. Never 'Hi guys', never introduce the channel.
- Short, punchy, conversational sentences. One idea per scene. Build curiosity, pay it off before the end.
- Every factual claim must come from the research notes. Do not invent numbers.
- The closing line should loop naturally back into the hook so the video rewatches.
- Write numbers the way they are spoken (the voice is text-to-speech).
- Title: curious, honest, under 70 characters, in {dil}."""


def senaryo_yaz(arastirma: str, sira: int) -> ShortPlani:
    istemci = _istemci()
    dil = DIL_ADI.get(ayarlar.DIL, ayarlar.DIL)
    yanit = istemci.beta.messages.parse(
        model=ayarlar.MODEL,
        max_tokens=16000,
        betas=BETAS,
        fallbacks="default",
        system=SENARYO_SISTEM.format(dil=dil),
        thinking={"type": "adaptive"},
        output_config={"effort": "high"},
        messages=[{
            "role": "user",
            "content": f"Research notes:\n\n{arastirma}\n\n"
            f"Write the complete Short for topic #{sira} in the ranked list "
            f"(if there are fewer topics, use the best unused one).",
        }],
        output_format=ShortPlani,
    )
    if yanit.stop_reason == "refusal" or yanit.parsed_output is None:
        raise RuntimeError("Senaryo üretilemedi.")
    return yanit.parsed_output


def plan_kaydet(plan: ShortPlani, yol) -> None:
    yol.write_text(json.dumps(plan.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8")


def plan_yukle(yol) -> ShortPlani:
    return ShortPlani.model_validate_json(yol.read_text(encoding="utf-8"))
