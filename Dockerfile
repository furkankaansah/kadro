# Kadro: tek süreç, bağımlılık yok (Node'un yerleşik node:sqlite modülü). Veriler /data klasöründe, kalıcı diske bağlanmalı.
FROM node:22-slim

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/data

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
COPY scripts ./scripts
COPY docker-entrypoint.sh ./

# Süreç yetkisiz "node" kullanıcısıyla çalışır (entrypoint disk izinlerini düzeltip root'tan düşer).
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
