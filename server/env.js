'use strict';

// Küçük, bağımlılıksız .env okuyucu: proje klasöründeki .env dosyasındaki KEY=VALUE satırlarını ortam değişkeni yapar.
// Zaten tanımlı (sistemden/Docker'dan gelen) değişkenlerin üzerine YAZMAZ. Yalnızca `node server/index.js` ile
// doğrudan başlatıldığında çağrılır; testlerde ve içe aktarmada çalışmaz. Kapatmak için KADRO_NO_ENV=1.

const fs = require('node:fs');
const path = require('node:path');

/** .env metnini { ANAHTAR: değer } nesnesine çevirir. Tek/çift tırnak, "export " öneki ve # yorumları desteklenir. */
function parse(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2];
    const q = v[0];
    if ((q === "'" || q === '"') && v.lastIndexOf(q) > 0) {
      v = v.slice(1, v.lastIndexOf(q));
    } else {
      v = v.replace(/\s+#.*$/, '').trim(); // tırnaksız değerde satır sonu yorumunu at
    }
    out[m[1]] = v;
  }
  return out;
}

/** Dosya varsa okur ve tanımsız değişkenleri ayarlar. Ayarlanan anahtar sayısını döndürür. */
function load(file = path.join(__dirname, '..', '.env')) {
  if (process.env.KADRO_NO_ENV === '1') return 0;
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return 0;
  }
  let n = 0;
  for (const [k, v] of Object.entries(parse(text))) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
      n++;
    }
  }
  return n;
}

module.exports = { parse, load };
