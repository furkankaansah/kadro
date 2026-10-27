'use strict';

// E-posta gönderimi (bağımlılık yok). Üç mod (bu sırayla):
//  1) RESEND_API_KEY + MAIL_FROM ayarlıysa Resend (resend.com) HTTP API'si ile gönderir (kendi alan adın gerekir).
//  2) SMTP_HOST + SMTP_USER + SMTP_PASS ayarlıysa SMTP ile gönderir (örn. Gmail "uygulama şifresi"; alan adı gerekmez).
//  3) Hiçbiri yoksa e-postayı data/outbox/ klasörüne dosya olarak yazar (geliştirme için); kimseye gitmez.

const fs = require('node:fs');
const path = require('node:path');
const { dataDir } = require('./db');
const { sendSmtp } = require('./smtp');

const API_KEY = process.env.RESEND_API_KEY || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SITE = process.env.SITE_NAME || 'Kadro';
// Gmail gibi sağlayıcılar gönderen adresi hesabın kendi adresi olmaya zorlar; MAIL_FROM boşsa kullanıcı adından üretilir.
const FROM = process.env.MAIL_FROM || (SMTP_USER.includes('@') ? `${SITE} <${SMTP_USER}>` : '');
const resendOn = !!(API_KEY && FROM);
const smtpOn = !resendOn && !!(SMTP_HOST && FROM && ((SMTP_USER && SMTP_PASS) || ['localhost', '127.0.0.1', '::1'].includes(SMTP_HOST)));
const configured = resendOn || smtpOn;
const mode = resendOn ? 'resend' : smtpOn ? 'smtp' : 'outbox';
const outDir = path.join(dataDir, 'outbox');

/** Bağlantılarda kullanılacak site adresi. Ayarlıysa PUBLIC_URL, değilse null. */
const publicUrl = () => (process.env.PUBLIC_URL || '').replace(/\/+$/, '') || null;

async function send({ to, subject, text, html }) {
  if (smtpOn) {
    await sendSmtp(
      { host: SMTP_HOST, port: process.env.SMTP_PORT, secure: process.env.SMTP_SECURE, user: SMTP_USER, pass: SMTP_PASS },
      { from: FROM, to, subject, text, html }
    );
    return { mode: 'smtp' };
  }
  if (resendOn) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      throw new Error(`Resend ${res.status}: ${detail}`);
    }
    return { mode: 'resend' };
  }
  fs.mkdirSync(outDir, { recursive: true });
  const safe = String(to).replace(/[^a-z0-9@._-]/gi, '_').slice(0, 80);
  const file = path.join(outDir, `${Date.now()}-${safe}.txt`);
  fs.writeFileSync(file, `To: ${to}\nSubject: ${subject}\n\n${text}\n`, { mode: 0o600 });
  console.log(`[posta] Gönderici ayarlı değil, e-posta dosyaya yazıldı (kimseye gitmedi): ${file}`);
  return { mode: 'outbox', file };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const COPY = {
  tr: {
    subject: 'Kadro: e-posta adresini doğrula',
    hi: (n) => `Merhaba ${n},`,
    intro: 'Kadro hesabını doğrulamak için kodun:',
    link: 'Ya da tek tıkla doğrula:',
    button: 'E-postamı doğrula',
    ttl: 'Kod 24 saat geçerli.',
    ignore: 'Bu hesabı sen açmadıysan bu e-postayı yok sayabilirsin.',
  },
  en: {
    subject: 'Kadro: verify your email address',
    hi: (n) => `Hi ${n},`,
    intro: 'Your Kadro verification code is:',
    link: 'Or verify with one click:',
    button: 'Verify my email',
    ttl: 'The code is valid for 24 hours.',
    ignore: "If you didn't create this account, you can ignore this email.",
  },
};

/** Doğrulama e-postası içeriği. link yoksa (PUBLIC_URL ayarlı değil) sadece kod gönderilir. */
function verificationMail({ lang, name, code, link }) {
  const c = COPY[lang] || COPY.tr;
  const text = [c.hi(name), '', c.intro, code, ...(link ? ['', c.link, link] : []), '', c.ttl, c.ignore].join('\n');
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#14172b">
<p>${esc(c.hi(name))}</p>
<p>${esc(c.intro)}</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:12px 0">${esc(code)}</p>
${link ? `<p>${esc(c.link)}</p><p><a href="${esc(link)}" style="display:inline-block;padding:10px 18px;border-radius:10px;background:#5b5bf0;color:#fff;text-decoration:none;font-weight:600">${esc(c.button)}</a></p>` : ''}
<p style="color:#667;font-size:13px">${esc(c.ttl)} ${esc(c.ignore)}</p>
</div>`;
  return { subject: c.subject, text, html };
}

const RESET_COPY = {
  tr: {
    subject: 'Kadro: şifreni sıfırla',
    hi: (n) => `Merhaba ${n},`,
    intro: 'Şifreni sıfırlamak için kodun:',
    link: 'Ya da bu bağlantıyla yeni şifreni belirle:',
    button: 'Şifremi sıfırla',
    ttl: 'Kod 1 saat geçerli.',
    ignore: 'Bunu sen istemediysen e-postayı yok say; şifren değişmez.',
  },
  en: {
    subject: 'Kadro: reset your password',
    hi: (n) => `Hi ${n},`,
    intro: 'Your password reset code is:',
    link: 'Or set a new password with this link:',
    button: 'Reset my password',
    ttl: 'The code is valid for 1 hour.',
    ignore: "If you didn't ask for this, ignore this email; your password stays the same.",
  },
};

function resetMail({ lang, name, code, link }) {
  const c = RESET_COPY[lang] || RESET_COPY.tr;
  const text = [c.hi(name), '', c.intro, code, ...(link ? ['', c.link, link] : []), '', c.ttl, c.ignore].join('\n');
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#14172b">
<p>${esc(c.hi(name))}</p>
<p>${esc(c.intro)}</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:12px 0">${esc(code)}</p>
${link ? `<p>${esc(c.link)}</p><p><a href="${esc(link)}" style="display:inline-block;padding:10px 18px;border-radius:10px;background:#5b5bf0;color:#fff;text-decoration:none;font-weight:600">${esc(c.button)}</a></p>` : ''}
<p style="color:#667;font-size:13px">${esc(c.ttl)} ${esc(c.ignore)}</p>
</div>`;
  return { subject: c.subject, text, html };
}

module.exports = { send, verificationMail, resetMail, publicUrl, configured, mode, outDir };
