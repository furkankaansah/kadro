@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Kadro
echo.
echo  ===== Kadro =====
echo.

where node >nul 2>nul
if errorlevel 1 goto nonode

if exist "data\kadro.db" goto start
echo  Ilk acilis. Sitede ornek oyuncular, gruplar ve mesajlar olsun mu?
echo  (Denemek icin onerilir. Ornek hesap: efe / sifre: demo12345)
echo.
choice /c EH /n /m "  Ornek veri eklensin mi? [E=Evet, H=Hayir] "
if errorlevel 2 goto start
node --disable-warning=ExperimentalWarning scripts\seed-demo.js
echo.

:start
echo  Site aciliyor. Tarayici birazdan kendiliginden acilacak.
echo  Acilmazsa tarayiciya su adresi yaz: http://localhost:3000
echo.
echo  ONEMLI: Bu pencereyi KAPATMA. Kapatirsan site durur.
echo.
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"
node --disable-warning=ExperimentalWarning server\index.js
echo.
echo  Kadro durdu. Tekrar acmak icin baslat.bat dosyasina cift tikla.
pause
exit /b 0

:nonode
echo  Bu bilgisayarda Node.js yok. Kadro'nun calismasi icin gerekli (ucretsiz).
echo.
where winget >nul 2>nul
if errorlevel 1 goto manual
choice /c EH /n /m "  Simdi otomatik kurulsun mu? [E=Evet, H=Hayir] "
if errorlevel 2 goto manual
echo.
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
echo.
echo  Kurulum bitti. Bu pencereyi KAPAT, sonra baslat.bat dosyasina TEKRAR cift tikla.
echo.
pause
exit /b 0

:manual
echo  1) Acilan sayfadan yesil "LTS" dugmesiyle Node.js'i indirip kur.
echo  2) Kurulum bitince bu pencereyi kapat ve baslat.bat dosyasina TEKRAR cift tikla.
echo.
start https://nodejs.org
pause
exit /b 0
