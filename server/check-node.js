'use strict';

// Kadro, Node'un yerleşik SQLite modülünü kullanır; bu modül Node 22.13 ve üstünde sorunsuz çalışır.
// Eski sürümde anlaşılmaz bir hata yerine açık bir mesaj verelim.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(
    `\nBu bilgisayardaki Node.js sürümü (v${process.versions.node}) çok eski.\n` +
      'Kadro için Node.js 22.13 veya daha yenisi gerekiyor.\n' +
      'https://nodejs.org adresinden "LTS" sürümünü kurup tekrar dene.\n'
  );
  process.exit(1);
}
