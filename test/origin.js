'use strict';

// Origin denetimi: PUBLIC_URL ayarlıyken vekilin Host başlığını değiştirdiği durumda site kendi adresinden gelen isteği kabul eder, yabancıyı reddeder.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-origin-'));
process.env.PUBLIC_URL = 'https://pc.tail1234.ts.net';
const { server } = require('../server/index.js');

const post = (port, origin, host) =>
  new Promise((resolve, reject) => {
    const body = JSON.stringify({ username: 'yok_boyle_biri', password: 'yanlis-sifre-1' });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    if (origin) headers.Origin = origin;
    if (host) headers.Host = host;
    const req = http.request({ host: '127.0.0.1', port, path: '/api/auth/login', method: 'POST', headers }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end(body);
  });

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  try {
    assert.equal(await post(port, `http://127.0.0.1:${port}`), 401, 'normal aynı origin');
    assert.equal(await post(port, 'https://pc.tail1234.ts.net', '127.0.0.1:3000'), 401, 'vekil Host\'u değiştirse de PUBLIC_URL origin\'i kabul');
    assert.equal(await post(port, 'https://evil.example.com', '127.0.0.1:3000'), 403, 'yabancı origin reddedilmeli');
    assert.equal(await post(port, 'https://pc.tail1234.ts.net.evil.com', '127.0.0.1:3000'), 403, 'benzer görünen alan adı reddedilmeli');
    console.log('  ✓ origin denetimi: PUBLIC_URL origin\'i kabul, yabancı ve benzer alan adları reddedildi');
    server.close();
    process.exit(0);
  } catch (e) {
    console.error('  ✗', e.message);
    process.exit(1);
  }
});
