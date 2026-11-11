#!/bin/bash
# Mac / Linux: çift tıkla veya terminalde ./VIDEOLARI_URET.command
cd "$(dirname "$0")"
command -v python3 >/dev/null || { echo "Python 3 bulunamadı: https://www.python.org/downloads/"; read; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg bulunamadı. Mac'te: brew install ffmpeg"; read; exit 1; }
python3 -m pip install --quiet --upgrade pillow edge-tts
cd arac && python3 uret.py --hepsi "$@"
echo; echo "Bitti. Videolar 'videolar' klasöründe."; read -p "Kapatmak için Enter..."
