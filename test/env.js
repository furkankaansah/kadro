'use strict';

// .env okuyucu testi
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parse, load } = require('../server/env');

const p = parse(`# yorum
A=basit
B='tek tırnak $degil # kalır'
C="çift tırnak"
export D=export_li
E=değer # satır sonu yorumu
  F = boşluklu
G=
H=a=b=c
geçersiz satır
`);
assert.deepEqual(p, { A: 'basit', B: 'tek tırnak $degil # kalır', C: 'çift tırnak', D: 'export_li', E: 'değer', F: 'boşluklu', G: '', H: 'a=b=c' });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-env-'));
const f = path.join(dir, '.env');
fs.writeFileSync(f, "KADRO_T1='bir'\nKADRO_T2=iki\nKADRO_T3=üç\r\n");
process.env.KADRO_T2 = 'sistemden';
delete process.env.KADRO_NO_ENV;
assert.equal(load(f), 2, 'yalnızca tanımsız olanlar ayarlanmalı');
assert.equal(process.env.KADRO_T1, 'bir');
assert.equal(process.env.KADRO_T2, 'sistemden', 'sistem değişkeni ezilmemeli');
assert.equal(process.env.KADRO_T3, 'üç');
assert.equal(load(path.join(dir, 'yok.env')), 0, 'dosya yoksa sessizce 0');
process.env.KADRO_NO_ENV = '1';
delete process.env.KADRO_T1;
assert.equal(load(f), 0, 'KADRO_NO_ENV=1 iken okumamalı');
assert.equal(process.env.KADRO_T1, undefined);
fs.rmSync(dir, { recursive: true, force: true });
console.log('  ✓ .env okuyucu: tırnaklar, yorumlar, sistem değişkenini ezmeme, KADRO_NO_ENV');
