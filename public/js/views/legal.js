import { h } from '../ui.js';
import { api } from '../api.js';
import { t, getLang } from '../i18n.js';
import { LEGAL, UPDATED } from '../legal-text.js';

// Gizlilik politikası ve kullanım şartları. İşleten kişi / iletişim adresi /api/config'ten gelir.

let cfgPromise = null;
export function siteConfig() {
  if (!cfgPromise) {
    cfgPromise = api.get('/config').catch(() => {
      cfgPromise = null;
      return {};
    });
  }
  return cfgPromise;
}

export default async function legal(el, ctx) {
  const doc = ctx.params.doc === 'terms' ? 'terms' : 'privacy';
  const cfg = await siteConfig();
  const lang = getLang();
  const src = LEGAL[lang][doc];
  const fill = (s) =>
    s
      .replaceAll('{site}', cfg.siteName || 'Kadro')
      .replaceAll('{operator}', cfg.operator || t('legal.operator.missing'))
      .replaceAll('{email}', cfg.contactEmail || t('legal.email.missing'));

  document.title = `${src.title} · ${cfg.siteName || 'Kadro'}`;
  const date = new Date(UPDATED).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const other = doc === 'privacy' ? 'terms' : 'privacy';

  el.append(
    h(
      'article',
      { class: 'card legal' },
      h('h1', { class: 'page-title' }, src.title),
      h('p', { class: 'help' }, t('legal.updated', { date })),
      !cfg.operator || !cfg.contactEmail ? h('p', { class: 'notice', role: 'status' }, t('legal.unconfigured')) : null,
      h('p', { class: 'legal-intro' }, fill(src.intro)),
      ...src.sections.map((s) =>
        h(
          'section',
          { class: 'legal-sec' },
          h('h2', null, s.h),
          ...(s.p || []).map((p) => h('p', null, fill(p))),
          s.ul && h('ul', null, ...s.ul.map((li) => h('li', null, fill(li))))
        )
      ),
      h('p', { class: 'legal-other' }, h('a', { href: `#/legal/${other}` }, LEGAL[lang][other].title))
    )
  );
}
