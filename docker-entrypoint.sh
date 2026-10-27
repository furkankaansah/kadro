#!/bin/sh
# Kalıcı disk bazı sağlayıcılarda root sahipli bağlanır; önce yazılabilir yap, sonra yetkisiz kullanıcıya geç.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${DATA_DIR:-/data}"
  chown -R node:node "${DATA_DIR:-/data}" 2>/dev/null || true
  if command -v setpriv >/dev/null 2>&1 && id node >/dev/null 2>&1; then
    exec setpriv --reuid=node --regid=node --init-groups "$@"
  fi
fi
exec "$@"
