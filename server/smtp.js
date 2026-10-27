'use strict';

// Küçük, bağımlılıksız SMTP istemcisi (yalnızca e-posta GÖNDERİR).
// Gmail (smtp.gmail.com:465 + "uygulama şifresi"), Brevo, Mailjet vb. her SMTP sağlayıcısıyla çalışır.
//  - secure 'tls'      : bağlantı baştan TLS (port 465)
//  - secure 'starttls' : düz bağlanıp STARTTLS ile TLS'e geçer (port 587)
//  - secure 'none'     : şifresiz; YALNIZCA localhost'a izin verilir (geliştirme/test)
// Kimlik bilgileri şifresiz bağlantıda ASLA gönderilmez.

const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');
const os = require('node:os');

const TIMEOUT_MS = 20_000;
const isLocalHost = (h) => ['localhost', '127.0.0.1', '::1'].includes(String(h).toLowerCase());

/** "Kadro <noreply@x.com>" ya da "noreply@x.com" -> { name, address } */
function parseAddress(s) {
  const str = String(s || '').trim();
  const m = str.match(/^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>$/);
  const address = (m ? m[2] : str).trim();
  const name = m ? m[1].trim().replace(/^"|"$/g, '') : '';
  if (!/^[^@\s<>",;:\\]+@[^@\s<>",;:\\]+\.[^@\s<>",;:\\]+$/.test(address)) throw new Error('Geçersiz e-posta adresi');
  return { name, address };
}

const noCrlf = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();
const b64lines = (buf) => (Buffer.from(buf).toString('base64').match(/.{1,76}/g) || ['']).join('\r\n');
/** ASCII dışı karakter varsa RFC 2047 ile kodla (başlıklar için). */
const encodeWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);

function buildMessage({ from, to, subject, text, html, domain }) {
  const f = parseAddress(from);
  const t = parseAddress(to);
  const boundary = `kadro_${crypto.randomBytes(12).toString('hex')}`;
  const fromHeader = f.name ? `${encodeWord(noCrlf(f.name)).replace(/"/g, '')} <${f.address}>` : f.address;
  const headers = [
    `From: ${fromHeader}`,
    `To: ${t.address}`,
    `Subject: ${encodeWord(noCrlf(subject))}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomBytes(12).toString('hex')}@${domain || f.address.split('@')[1]}>`,
    'MIME-Version: 1.0',
    'Auto-Submitted: auto-generated',
  ];
  const part = (type, body) => `Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64lines(body)}`;
  let body;
  if (html) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = `--${boundary}\r\n${part('text/plain', text || '')}\r\n--${boundary}\r\n${part('text/html', html)}\r\n--${boundary}--`;
  } else {
    headers.push('Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64');
    body = b64lines(text || '');
  }
  return { raw: `${headers.join('\r\n')}\r\n\r\n${body}\r\n`, from: f.address, to: t.address };
}

/** Tek bir e-postayı SMTP ile gönderir. opts: { host, port, secure, user, pass, tlsOptions? } */
function sendSmtp(opts, mail) {
  const host = opts.host;
  const port = Number(opts.port) || (opts.secure === 'starttls' ? 587 : 465);
  const secure = opts.secure || (port === 587 ? 'starttls' : 'tls');
  if (secure === 'none' && !isLocalHost(host)) {
    return Promise.reject(new Error('Şifresiz SMTP yalnızca localhost için izinli (SMTP_SECURE=tls ya da starttls kullan)'));
  }
  const msg = buildMessage({ ...mail, from: mail.from, domain: opts.heloDomain });

  return new Promise((resolve, reject) => {
    let sock;
    let buf = '';
    let waiter = null;
    let done = false;
    let encrypted = secure === 'tls';

    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        sock && sock.destroy();
      } catch {
        /* yoksay */
      }
      err ? reject(err) : resolve();
    };
    const timer = setTimeout(() => finish(new Error('SMTP zaman aşımı')), TIMEOUT_MS);

    // Yanıtlar çok satırlı olabilir: "250-..." devam, "250 ..." son satır.
    const tryDeliver = () => {
      if (!waiter) return;
      const lines = buf.split('\r\n');
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i]) || /^\d{3}$/.test(lines[i])) {
          const reply = lines.slice(0, i + 1);
          buf = lines.slice(i + 1).join('\r\n');
          const w = waiter;
          waiter = null;
          return w({ code: Number(reply[i].slice(0, 3)), lines: reply });
        }
      }
    };
    const onData = (d) => {
      buf += d.toString('utf8');
      if (buf.length > 64 * 1024) return finish(new Error('SMTP yanıtı çok büyük'));
      tryDeliver();
    };
    const read = () =>
      new Promise((res) => {
        waiter = res;
        tryDeliver();
      });
    const write = (line) => sock.write(`${line}\r\n`);
    const expect = async (okCodes, what) => {
      const r = await read();
      if (!okCodes.includes(r.code)) throw new Error(`SMTP ${what}: ${r.lines[r.lines.length - 1].slice(0, 160)}`);
      return r;
    };
    const cmd = async (line, okCodes, what) => {
      write(line);
      return expect(okCodes, what);
    };

    const run = async () => {
      await expect([220], 'karşılama');
      const helo = opts.heloDomain || os.hostname().replace(/[^a-z0-9.-]/gi, '') || 'localhost';
      let ehlo = await cmd(`EHLO ${helo}`, [250], 'EHLO');

      if (secure === 'starttls') {
        await cmd('STARTTLS', [220], 'STARTTLS');
        sock.removeListener('data', onData);
        sock = tls.connect({ socket: sock, servername: net.isIP(host) ? undefined : host, ...(opts.tlsOptions || {}) });
        sock.on('data', onData);
        sock.on('error', finish);
        await new Promise((res, rej) => {
          sock.once('secureConnect', res);
          sock.once('error', rej);
        });
        encrypted = true;
        buf = '';
        ehlo = await cmd(`EHLO ${helo}`, [250], 'EHLO (TLS sonrası)');
      }

      if (opts.user) {
        if (!encrypted) throw new Error('Şifresiz bağlantıda oturum açılmaz');
        const adv = ehlo.lines.join(' ').toUpperCase();
        if (adv.includes('AUTH') && adv.includes('PLAIN') || !adv.includes('LOGIN')) {
          await cmd(`AUTH PLAIN ${Buffer.from(`\0${opts.user}\0${opts.pass || ''}`).toString('base64')}`, [235], 'oturum açma');
        } else {
          await cmd('AUTH LOGIN', [334], 'oturum açma');
          await cmd(Buffer.from(opts.user).toString('base64'), [334], 'oturum açma');
          await cmd(Buffer.from(opts.pass || '').toString('base64'), [235], 'oturum açma');
        }
      }

      await cmd(`MAIL FROM:<${msg.from}>`, [250], 'MAIL FROM');
      await cmd(`RCPT TO:<${msg.to}>`, [250, 251], 'RCPT TO');
      await cmd('DATA', [354], 'DATA');
      // Nokta doldurma: satır başındaki "." ikiye katlanır.
      sock.write(msg.raw.replace(/^\./gm, '..') + '.\r\n');
      await expect([250], 'gönderim');
      // Düzgün kapanış: QUIT gönder, kısa süre yanıtı bekle (yanıt gelmese de e-posta zaten kabul edildi).
      try {
        write('QUIT');
        await Promise.race([read(), new Promise((r) => setTimeout(r, 1500))]);
      } catch {
        /* yoksay */
      }
    };

    const start = () => {
      sock.on('data', onData);
      run().then(() => finish(), finish);
    };
    const sni = net.isIP(host) ? undefined : host; // IP adreslerine SNI gönderilmez (RFC 6066)
    sock = secure === 'tls' ? tls.connect({ host, port, servername: sni, ...(opts.tlsOptions || {}) }, start) : net.connect({ host, port }, start);
    // Hata/kapanma dinleyicileri bağlantı kurulmadan önce de (sertifika hatası gibi) yakalanmalı.
    sock.on('error', finish);
    sock.on('close', () => finish(new Error('SMTP bağlantısı beklenmedik şekilde kapandı')));
    sock.setTimeout(TIMEOUT_MS, () => finish(new Error('SMTP zaman aşımı')));
  });
}

module.exports = { sendSmtp, buildMessage, parseAddress };
