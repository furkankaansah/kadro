#!/bin/bash
cd "$(dirname "$0")"
command -v ffmpeg >/dev/null || { echo "ffmpeg yok: Terminal'de 'brew install ffmpeg' çalıştır."; read -r; exit 1; }
command -v python3 >/dev/null || { echo "Python yok: python.org'dan kur."; read -r; exit 1; }
if [ ! -f .env ]; then cp .env.example .env; echo ".env oluşturuldu: içine API anahtarlarını yaz, kaydet, tekrar çalıştır."; open -e .env; read -r; exit 0; fi
python3 -m pip install -q -r requirements.txt
read -r -p "Kaç short üretilsin? [1]: " ADET; ADET=${ADET:-1}
read -r -p "Belirli bir konu? (boş = trendlerden ajan seçsin): " KONU
if [ -z "$KONU" ]; then python3 ajan.py --adet "$ADET"; else python3 ajan.py --konu "$KONU"; fi
open cikti
read -r -p "Bitti. Kapatmak için Enter."
