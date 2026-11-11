@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
echo ==== Biyografi videolari uretiliyor ====
where python >nul 2>nul || (echo Python bulunamadi. https://www.python.org/downloads/ adresinden kur ^(kurulumda "Add to PATH" kutusunu isaretle^). & pause & exit /b 1)
where ffmpeg >nul 2>nul || (echo ffmpeg bulunamadi. Komut isteminde su komutu calistir: winget install Gyan.FFmpeg   ^(sonra bu pencereyi kapatip yeniden ac^) & pause & exit /b 1)
python -m pip install --quiet --upgrade pillow edge-tts
cd arac
python uret.py --hepsi %*
echo.
echo Bitti. Videolar "videolar" klasorunde.
pause
