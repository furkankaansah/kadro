'use strict';

// Dış paket olmadan küçük bir HTTP yardımcı seti: hata sınıfı, JSON gönderme, gövde okuma, yönlendirici.

class HttpError extends Error {
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra; // yanıta eklenecek ek alanlar (ör. yasak sebebi)
  }
}
const bad = (code, status = 400, extra) => new HttpError(status, code, extra);

/** Bir route işleyicisi bunu döndürürse yanıtı kendisi yönetmiş demektir (ör. SSE). */
const HANDLED = Symbol('handled');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* bozuk çerezi yok say */
    }
  }
  return out;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 50_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(bad('payload_too_large', 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!size) return resolve({});
      const type = req.headers['content-type'] || '';
      if (!type.includes('application/json')) return reject(bad('unsupported_media_type', 415));
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(value && typeof value === 'object' && !Array.isArray(value) ? value : {});
      } catch {
        reject(bad('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

class Router {
  constructor() {
    this.routes = [];
  }

  /** add('GET', '/groups/:id', { auth: true }, handler) — opts isteğe bağlı. */
  add(method, pattern, opts, handler) {
    if (typeof opts === 'function') {
      handler = opts;
      opts = {};
    }
    const keys = [];
    const source = pattern.replace(/:([A-Za-z]+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    });
    this.routes.push({ method, regex: new RegExp(`^${source}$`), keys, opts, handler });
  }

  get(p, o, h) { this.add('GET', p, o, h); }
  post(p, o, h) { this.add('POST', p, o, h); }
  put(p, o, h) { this.add('PUT', p, o, h); }
  patch(p, o, h) { this.add('PATCH', p, o, h); }
  delete(p, o, h) { this.add('DELETE', p, o, h); }

  match(method, pathname) {
    let pathMatched = false;
    for (const route of this.routes) {
      const m = route.regex.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params = {};
      route.keys.forEach((key, i) => {
        try {
          params[key] = decodeURIComponent(m[i + 1]);
        } catch {
          params[key] = m[i + 1];
        }
      });
      return { route, params };
    }
    return { route: null, params: {}, methodNotAllowed: pathMatched };
  }
}

module.exports = { HttpError, bad, HANDLED, parseCookies, sendJson, readBody, Router };
