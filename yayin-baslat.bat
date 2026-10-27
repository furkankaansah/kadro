@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Kadro - herkese acik yayin
echo.
echo  ===== Kadro: herkese acik yayin (bu bilgisayardan) =====
echo.
echo  Bu pencere acik ve bilgisayar acik oldugu surece site herkese acik kalir.
echo.

where node >nul 2>nul
if errorlevel 1 goto nonode

set "TS="
where tailscale >nul 2>nul && set "TS=tailscale"
if not defined TS if exist "%ProgramFiles%\Tailscale\tailscale.exe" set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
if not defined TS goto nots

"%TS%" status >nul 2>nul
if errorlevel 1 goto tslogin

if exist ".env" goto havenv
echo  Ilk kurulum: birkac soru soracagim (isletici adi, e-posta, Gmail sifresi...).
echo.
node scripts\setup-env.js
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
echo.

:havenv
echo  Tailscale Funnel aciliyor (siteyi internete aciyor)...
"%TS%" funnel --bg 3000
if errorlevel 1 goto funnelfail
echo.

set "URL="
for /f "tokens=2 delims='" %%a in ('findstr /b "PUBLIC_URL=" .env') do set "URL=%%a"
if defined URL (
  echo  Site adresi: %URL%
  echo  Arkadaslarina bu adresi gonderebilirsin.
) else (
  echo  UYARI: .env icinde PUBLIC_URL bos. Tailscale giris yaptiktan sonra .env dosyasini silip bu dosyayi tekrar calistir.
)
echo.
echo  ONEMLI: Bu pencereyi KAPATMA ve bilgisayari uyku moduna alma. Kapanirsa site durur.
echo  (Windows Ayarlar ^> Sistem ^> Guc ve uyku ^> "Uyku" secenegini "Hicbir zaman" yap.)
echo.
node --disable-warning=ExperimentalWarning server\index.js
echo.
echo  Kadro durdu. Tekrar acmak icin yayin-baslat.bat dosyasina cift tikla.
pause
exit /b 0

:funnelfail
echo.
echo  Funnel acilamadi. Yukaridaki yaziyi oku: genelde bir baglanti (login.tailscale.com...) verir.
echo  O baglantiyi tarayicida ac, "Enable" / "Etkinlestir" de, sonra bu dosyayi tekrar calistir.
echo.
pause
exit /b 1

:tslogin
echo  Tailscale kurulu ama giris yapilmamis (ya da kapali).
echo  Saat yanindaki (sag alt) Tailscale simgesine tikla, "Log in" de, Google ile giris yap.
echo  Giris bitince bu dosyayi tekrar calistir.
echo.
pause
exit /b 1

:nots
echo  Bu bilgisayarda Tailscale yok. Siteyi internete acmak icin gerekli (ucretsiz).
echo.
where winget >nul 2>nul
if errorlevel 1 goto tsmanual
choice /c EH /n /m "  Simdi otomatik kurulsun mu? [E=Evet, H=Hayir] "
if errorlevel 2 goto tsmanual
echo.
winget install -e --id Tailscale.Tailscale --accept-package-agreements --accept-source-agreements
echo.
echo  Kurulum bitti. Saat yanindaki Tailscale simgesinden "Log in" de ve Google ile giris yap.
echo  Sonra bu pencereyi KAPAT ve yayin-baslat.bat dosyasina TEKRAR cift tikla.
echo.
pause
exit /b 0

:tsmanual
echo  1) Acilan sayfadan Windows surumunu indirip kur.
echo  2) Kurulumdan sonra Tailscale'e Google ile giris yap.
echo  3) Bu pencereyi kapat ve yayin-baslat.bat dosyasina TEKRAR cift tikla.
echo.
start https://tailscale.com/download
pause
exit /b 0

:nonode
echo  Bu bilgisayarda Node.js yok. Kadro'nun calismasi icin gerekli (ucretsiz).
echo.
where winget >nul 2>nul
if errorlevel 1 goto nodemanual
choice /c EH /n /m "  Simdi otomatik kurulsun mu? [E=Evet, H=Hayir] "
if errorlevel 2 goto nodemanual
echo.
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
echo.
echo  Kurulum bitti. Bu pencereyi KAPAT, sonra yayin-baslat.bat dosyasina TEKRAR cift tikla.
echo.
pause
exit /b 0

:nodemanual
echo  1) Acilan sayfadan yesil "LTS" dugmesiyle Node.js'i indirip kur.
echo  2) Kurulum bitince bu pencereyi kapat ve yayin-baslat.bat dosyasina TEKRAR cift tikla.
echo.
start https://nodejs.org
pause
exit /b 0
