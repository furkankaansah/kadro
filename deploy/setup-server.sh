#!/usr/bin/env bash
# Kadro'yu boş bir Ubuntu/Debian sunucuda (Oracle Cloud, Hetzner, DigitalOcean… hepsi olur) tek komutla kurar:
#   Docker'ı kurar -> .env dosyasını sorularla hazırlar -> Kadro + Caddy (otomatik HTTPS) başlatır -> siteyi kontrol eder.
#
# Kullanım (projenin klasöründe):   sudo bash deploy/setup-server.sh
# Soruları atlamak için değerleri önceden verebilirsin (şifreler hariç her zaman sorulur):
#   sudo DOMAIN=kadro.ornek.com OPERATOR_NAME="Ad Soyad" CONTACT_EMAIL=ben@ornek.com ADMIN_USERNAMES=ben bash deploy/setup-server.sh
# Deneme çalıştırması (hiçbir şey kurmaz/başlatmaz, yalnızca .env üretir):  KADRO_DRY_RUN=1 bash deploy/setup-server.sh

set -euo pipefail

cd "$(dirname "$0")/.."
DRY="${KADRO_DRY_RUN:-0}"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
run()  { if [ "$DRY" = "1" ]; then echo "  [deneme] $*"; else "$@"; fi; }

[ -f docker-compose.yml ] && [ -f Dockerfile ] || die "Bu betik Kadro klasörünün içinden çalıştırılmalı (docker-compose.yml bulunamadı)."
if [ "$DRY" != "1" ] && [ "$(id -u)" != "0" ]; then die "Root yetkisi gerekli. Şöyle çalıştır:  sudo bash deploy/setup-server.sh"; fi

# Tek tırnak .env'de değeri olduğu gibi korur; kullanıcı girdisinden tırnak, satır sonu ve $ işaretlerini temizle.
clean() { printf '%s' "$1" | tr -d "'\r\n\`\\\\" | sed 's/\$//g'; }
# ask DEĞİŞKEN "soru" ["varsayılan"]  — değişken ortamda doluysa sormaz.
ask() {
  local var="$1" q="$2" def="${3:-}" val
  if [ -n "${!var:-}" ]; then return; fi
  if [ -n "$def" ]; then read -r -p "$q [$def]: " val || true; val="${val:-$def}"; else read -r -p "$q: " val || true; fi
  printf -v "$var" '%s' "$(clean "$val")"
}
ask_secret() {
  local var="$1" q="$2" val
  read -r -s -p "$q (yazarken görünmez): " val || true; echo
  printf -v "$var" '%s' "$(clean "$val")"
}

say "1/5  Docker"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ok "Docker ve Docker Compose zaten kurulu"
else
  command -v apt-get >/dev/null 2>&1 || die "Bu betik Ubuntu/Debian içindir. Başka bir sistemde Docker'ı kendin kurup 'docker compose up -d --build' çalıştır (README)."
  run apt-get update -y
  run apt-get install -y curl ca-certificates openssl
  if [ "$DRY" = "1" ]; then echo "  [deneme] curl -fsSL https://get.docker.com | sh"; else curl -fsSL https://get.docker.com | sh; fi
  run systemctl enable --now docker
  ok "Docker kuruldu"
fi

# Küçük sunucularda (1 GB RAM) derleme sırasında bellek taşmasını önlemek için 1 GB takas alanı ekle.
MEM_KB="$(awk '/^MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 99999999)"
if [ "$MEM_KB" -lt 1800000 ] && [ -z "$(swapon --show --noheadings 2>/dev/null)" ] && [ ! -e /swapfile ]; then
  run fallocate -l 1G /swapfile
  run chmod 600 /swapfile
  run mkswap /swapfile
  run swapon /swapfile
  if [ "$DRY" != "1" ]; then echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
  ok "1 GB takas alanı eklendi (RAM az olduğu için)"
fi

say "2/5  Güvenlik duvarı (80 ve 443 portları)"
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  run ufw allow 80/tcp; run ufw allow 443/tcp; run ufw allow 443/udp
  ok "ufw'de 80/443 açıldı"
fi
if command -v iptables >/dev/null 2>&1; then
  # Oracle Cloud'un Ubuntu imajlarında INPUT zincirinde REJECT kuralı vardır; kuralları en başa ekle ve kalıcı yap.
  for spec in "tcp 80" "tcp 443" "udp 443"; do
    set -- $spec
    if ! iptables -C INPUT -p "$1" --dport "$2" -j ACCEPT 2>/dev/null; then run iptables -I INPUT 1 -p "$1" --dport "$2" -j ACCEPT; fi
  done
  if command -v netfilter-persistent >/dev/null 2>&1; then run netfilter-persistent save >/dev/null 2>&1 || true; fi
  ok "iptables'ta 80/443 açıldı"
fi
warn "Bulut sağlayıcının KENDİ güvenlik ayarında da (Oracle: VCN > Security List; AWS/Azure: güvenlik grubu) 80 ve 443 gelen trafiğe izin verilmiş olmalı."

say "3/5  Ayarlar (.env)"
if [ -f .env ]; then
  ok ".env zaten var; değiştirmeden kullanıyorum (sıfırdan kurmak için önce 'rm .env')"
else
  PUBIP=""
  if [ "$DRY" != "1" ]; then PUBIP="$(curl -4 -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)"; fi
  [ -n "$PUBIP" ] || PUBIP="${KADRO_FAKE_IP:-}"
  DEFAULT_DOMAIN=""
  if [[ "$PUBIP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then DEFAULT_DOMAIN="${PUBIP//./-}.sslip.io"; fi

  echo "  Sitenin adresi: kendi alan adın varsa yaz (A kaydı bu sunucunun IP'sini göstermeli: ${PUBIP:-bilinmiyor})."
  echo "  Yoksa boş bırak: ücretsiz geçici adres kullanılır${DEFAULT_DOMAIN:+ ($DEFAULT_DOMAIN)}."
  ask DOMAIN "Alan adı" "$DEFAULT_DOMAIN"
  DOMAIN="$(printf '%s' "$DOMAIN" | tr 'A-Z' 'a-z' | sed 's#^https\?://##; s#/.*$##')"
  [[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]] || die "Geçerli bir alan adı gerekli (örn. kadro.ornek.com). Aldığım değer: '$DOMAIN'"

  if [ -n "$PUBIP" ] && command -v getent >/dev/null 2>&1 && ! printf '%s' "$DOMAIN" | grep -q 'sslip.io$'; then
    RES="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1; exit}')"
    if [ "$RES" = "$PUBIP" ]; then ok "$DOMAIN bu sunucunun IP'sini gösteriyor"; else warn "$DOMAIN şu an '${RES:-hiçbir yeri}' adresini gösteriyor, bu sunucunun IP'si $PUBIP. A kaydını düzelt (yayılması birkaç dakika-saat sürebilir); aksi halde HTTPS sertifikası alınamaz."; fi
  fi

  ask OPERATOR_NAME "Sitenin işleticisi (gizlilik sayfasında görünür: adın soyadın ya da şirket/marka unvanı)"
  [ -n "${OPERATOR_NAME:-}" ] || die "İşleten adı boş olamaz (gizlilik ve şartlar sayfaları için gerekli)."
  ask CONTACT_EMAIL "İletişim e-postası (kullanıcıların sana yazacağı adres, KVKK başvuruları için)"
  [[ "${CONTACT_EMAIL:-}" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "Geçerli bir iletişim e-postası gerekli."
  ask ADMIN_USERNAMES "Yönetici kullanıcı adın (sitede bu adla kayıt olacaksın; harf, rakam, _ ; 3-20 karakter)"
  [[ "${ADMIN_USERNAMES:-}" =~ ^[A-Za-z0-9_]{3,20}(,[A-Za-z0-9_]{3,20})*$ ]] || die "Yönetici kullanıcı adı geçersiz (3-20 harf/rakam/_ ; birden fazlaysa virgülle)."

  MAILKIND="${MAILKIND:-}"
  if [ -z "$MAILKIND" ]; then
    echo
    echo "  Doğrulama e-postaları nasıl gönderilsin?"
    echo "    1) Gmail ile (alan adı gerekmez, ücretsiz; ayrı bir Gmail hesabı + 'uygulama şifresi' gerekir)"
    echo "    2) Resend ile (kendi alan adın ve Resend API anahtarın varsa)"
    read -r -p "  Seçim [1]: " MAILKIND || true
    MAILKIND="${MAILKIND:-1}"
  fi
  MAIL_LINES=""
  if [ "$MAILKIND" = "2" ]; then
    ask_secret RESEND_API_KEY "Resend API anahtarı (re_ ile başlar)"
    [ -n "$RESEND_API_KEY" ] || die "Resend API anahtarı boş."
    ask MAIL_FROM "Gönderen adres" "Kadro <noreply@${DOMAIN}>"
    MAIL_LINES="RESEND_API_KEY='$RESEND_API_KEY'
MAIL_FROM='$MAIL_FROM'"
  else
    ask SMTP_USER "Gmail adresi (e-postaları gönderecek hesap)"
    [[ "${SMTP_USER:-}" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "Geçerli bir Gmail adresi gerekli."
    echo "  Gmail 'uygulama şifresi': Google Hesabı > Güvenlik > 2 Adımlı Doğrulama (açık olmalı) > Uygulama şifreleri. 16 harfli şifreyi buraya yapıştır."
    ask_secret SMTP_PASS "Uygulama şifresi"
    SMTP_PASS="${SMTP_PASS// /}"
    [ "${#SMTP_PASS}" -ge 8 ] || die "Uygulama şifresi çok kısa/boş. Normal Gmail şifreni değil, 16 haneli 'uygulama şifresini' yaz."
    MAIL_LINES="SMTP_HOST='${SMTP_HOST:-smtp.gmail.com}'
SMTP_PORT='${SMTP_PORT:-465}'
SMTP_SECURE='${SMTP_SECURE:-tls}'
SMTP_USER='$SMTP_USER'
SMTP_PASS='$SMTP_PASS'"
  fi

  SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  umask 077
  cat > .env <<EOF
# deploy/setup-server.sh tarafından üretildi. Bu dosya gizli bilgi içerir; kimseyle paylaşma, depoya yükleme.
DOMAIN='$DOMAIN'
PUBLIC_URL='https://$DOMAIN'
OPERATOR_NAME='$OPERATOR_NAME'
CONTACT_EMAIL='$CONTACT_EMAIL'
ADMIN_USERNAMES='$ADMIN_USERNAMES'
KADRO_SECRET='$SECRET'
$MAIL_LINES
EOF
  chmod 600 .env
  ok ".env hazırlandı (izinler: yalnızca sahibi okuyabilir)"
fi

if [ "$DRY" = "1" ]; then
  say "Deneme çalıştırması bitti: Docker kurulmadı, hiçbir şey başlatılmadı."
  sed -E "s/(KADRO_SECRET|SMTP_PASS|RESEND_API_KEY)='.*'/\1='***gizli***'/" .env 2>/dev/null || true
  exit 0
fi

say "4/5  Başlatma (ilk seferde derleme birkaç dakika sürebilir)"
docker compose up -d --build
ok "Kadro ve Caddy başlatıldı"

say "5/5  Kontrol"
# shellcheck disable=SC1091
set -a; . ./.env; set +a
printf '  Sertifika alınıyor ve site açılıyor'
UP=0
for _ in $(seq 1 45); do
  if curl -fsS --max-time 5 "https://$DOMAIN/healthz" >/dev/null 2>&1; then UP=1; break; fi
  printf '.'; sleep 4
done
echo
if [ "$UP" = "1" ]; then
  ok "https://$DOMAIN açılıyor"
  docker compose exec -T kadro node scripts/check-live.mjs "https://$DOMAIN" || true
  say "Hazır!  Adres:  https://$DOMAIN"
  echo "  Şimdi: siteyi aç, '${ADMIN_USERNAMES%%,*}' kullanıcı adıyla gerçek bir e-postayla kayıt ol, e-postana gelen kodu gir."
  echo "  Profilinde 'Yönetici paneli' görünüyorsa her şey tamam."
else
  warn "Site henüz https üzerinden açılmadı. En sık nedenler:"
  echo "    - Bulut sağlayıcının güvenlik ayarında 80 ve 443 portları kapalı"
  echo "    - Alan adının A kaydı bu sunucunun IP'sini (${PUBIP:-?}) göstermiyor ya da henüz yayılmadı"
  echo "    - Geçici adres (sslip.io) için Let's Encrypt sınırına takılmış olabilirsin; birkaç saat sonra tekrar dene ya da kendi alan adını kullan"
  echo "  Ayrıntı için:  docker compose logs caddy --tail 50     ve     docker compose logs kadro --tail 50"
  exit 1
fi
