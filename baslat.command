#!/bin/bash
# Kadro başlatıcı (macOS / Linux). Mac'te çift tıklayarak çalıştırabilirsin.
cd "$(dirname "$0")" || exit 1
clear
echo
echo "  ===== Kadro ====="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "  Bu bilgisayarda Node.js yok. Kadro'nun çalışması için gerekli (ücretsiz)."
  echo
  if command -v brew >/dev/null 2>&1; then
    read -r -p "  Homebrew ile şimdi kurulsun mu? [e/H] " ans
    if [[ "$ans" =~ ^[eE] ]]; then
      brew install node || true
    fi
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo
    echo "  1) Açılan sayfadan yeşil \"LTS\" düğmesiyle Node.js'i indirip kur."
    echo "  2) Kurulum bitince bu pencereyi kapat ve baslat.command dosyasına TEKRAR çift tıkla."
    (open https://nodejs.org || xdg-open https://nodejs.org) >/dev/null 2>&1
    read -r -p "  Kapatmak için Enter'a bas..." _
    exit 0
  fi
fi

if [ ! -f data/kadro.db ]; then
  echo "  İlk açılış. Sitede örnek oyuncular, gruplar ve mesajlar olsun mu?"
  echo "  (Denemek için önerilir. Örnek hesap: efe / şifre: demo12345)"
  echo
  read -r -p "  Örnek veri eklensin mi? [E/h] " ans
  if [[ ! "$ans" =~ ^[hH] ]]; then
    node --disable-warning=ExperimentalWarning scripts/seed-demo.js
    echo
  fi
fi

PORT_TO_OPEN="${PORT:-3000}"
echo "  Site açılıyor. Tarayıcı birazdan kendiliğinden açılacak."
echo "  Açılmazsa tarayıcıya şu adresi yaz: http://localhost:${PORT_TO_OPEN}"
echo
echo "  ÖNEMLİ: Bu pencereyi KAPATMA. Kapatırsan site durur."
( sleep 2; (open "http://localhost:${PORT_TO_OPEN}" || xdg-open "http://localhost:${PORT_TO_OPEN}") >/dev/null 2>&1 ) &
node --disable-warning=ExperimentalWarning server/index.js
echo
read -r -p "  Kadro durdu. Kapatmak için Enter'a bas..." _
