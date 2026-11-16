@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist client_secret.json (
  echo client_secret.json yok. Once kanal\YOUTUBE_BAGLANTI.md rehberindeki 1-3. adimlari yap.
  pause & exit /b
)
python -m pip install -q -r requirements.txt
python ajan.py --youtube-baglan
pause
