@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Shorts Ajani

where python >nul 2>nul || (
  echo Python yok. Kuruluyor... ^(kurulumdan sonra bu dosyaya tekrar cift tikla^)
  winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
  pause & exit /b
)
where ffmpeg >nul 2>nul || (
  echo ffmpeg yok. Kuruluyor... ^(kurulumdan sonra bu dosyaya tekrar cift tikla^)
  winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
  pause & exit /b
)
if not exist .env (
  copy .env.example .env >nul
  echo .env dosyasi olusturuldu. Icine ANTHROPIC_API_KEY ve PEXELS_API_KEY yaz, kaydet, sonra tekrar calistir.
  notepad .env
  pause & exit /b
)
python -m pip install -q -r requirements.txt

echo.
set /p ADET="Kac short uretilsin? [1]: "
if "%ADET%"=="" set ADET=1
set /p KONU="Belirli bir konu? (bos birak = trendlerden ajan secsin): "
if "%KONU%"=="" (
  python ajan.py --adet %ADET%
) else (
  python ajan.py --konu "%KONU%"
)
start "" cikti
pause
