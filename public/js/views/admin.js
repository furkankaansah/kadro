import { h, put, icon, clear, toast, errText, confirmDialog, openDialog, fmtShort, debounce } from '../ui.js';
import { api, qs } from '../api.js';
import { state } from '../state.js';
import { t } from '../i18n.js';
import { emptyState, field } from '../components.js';

// Yönetici paneli: özet, şikâyetler, kullanıcılar, işlem kaydı.
// Yetkiyi sunucu denetler (ADMIN_USERNAMES); bu sayfa yalnızca arayüzdür.

let activeTab = 'reports';
let reportFilter = 'open';

export default async function admin(el, ctx) {
  if (!state.user || !state.user.isAdmin) {
    el.append(emptyState(t('admin.denied.title'), t('admin.denied.text'), h('a', { class: 'btn btn-primary', href: '#/' }, t('common.home'))));
    return;
  }
  document.title = `${t('admin.title')} · Kadro`;

  const body = h('div', { class: 'admin-body' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const TABS = [
    ['overview', 'admin.tab.overview', drawOverview],
    ['reports', 'admin.tab.reports', drawReports],
    ['users', 'admin.tab.users', drawUsers],
    ['log', 'admin.tab.log', drawLog],
  ];

  function drawTabs() {
    clear(tabs);
    for (const [id, label] of TABS) {
      tabs.append(
        h(
          'button',
          {
            class: 'tab-btn',
            type: 'button',
            role: 'tab',
            'aria-selected': String(id === activeTab),
            onClick: () => {
              activeTab = id;
              show();
            },
          },
          t(label)
        )
      );
    }
  }

  async function show() {
    drawTabs();
    clear(body);
    body.append(h('p', { class: 'muted loading' }, t('common.loading')));
    const draw = TABS.find((x) => x[0] === activeTab)[2];
    try {
      const node = await draw();
      if (ctx.dead) return;
      body.replaceChildren(node);
    } catch (err) {
      console.error(err);
      body.replaceChildren(h('p', { class: 'form-error' }, errText(err)));
    }
  }

  el.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', { class: 'page-title' }, t('admin.title')), h('p', { class: 'help' }, t('admin.help')))),
    tabs,
    body
  );
  await show();

  // ---------- Özet ----------

  async function drawOverview() {
    const s = await api.get('/admin/summary');
    const cell = (key, value) => h('div', { class: 'stat' }, h('strong', null, String(value)), h('span', null, t('admin.stat.' + key)));
    return h(
      'div',
      { class: 'stat-grid' },
      cell('users', s.users),
      cell('newUsers24h', s.newUsers24h),
      cell('groups', s.groups),
      cell('messages24h', s.messages24h),
      cell('openReports', s.openReports),
      cell('banned', s.banned)
    );
  }

  // ---------- Şikâyetler ----------

  async function drawReports() {
    const wrap = h('div', { class: 'admin-section' });
    const list = h('div', { class: 'report-list' });
    const filter = h(
      'div',
      { class: 'seg', role: 'group', 'aria-label': t('admin.filter') },
      ['open', 'closed', 'all'].map((f) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(reportFilter === f),
            onClick: () => {
              reportFilter = f;
              show();
            },
          },
          t('admin.filter.' + f)
        )
      )
    );
    const { reports } = await api.get('/admin/reports' + qs({ status: reportFilter }));
    if (!reports.length) list.append(h('p', { class: 'muted' }, t('admin.reports.empty')));
    for (const r of reports) list.append(reportCard(r));
    wrap.append(filter, list);
    return wrap;
  }

  function snapshotView(r) {
    const s = r.snapshot || {};
    const box = h('div', { class: 'report-snap' });
    if (r.kind === 'message' && s.message) {
      for (const c of s.context || []) box.append(h('p', { class: 'snap-line muted' }, h('b', null, c.username + ': '), c.body));
      box.append(h('p', { class: 'snap-line flagged' }, h('b', null, s.message.username + ': '), s.message.body));
      if (s.room && s.room.title) box.append(h('p', { class: 'help' }, s.room.title));
    } else if (r.kind === 'group') {
      put(box, h('p', { class: 'snap-line' }, h('b', null, s.title || '—')), s.description && h('p', { class: 'snap-line muted' }, s.description));
    } else if (r.kind === 'user') {
      put(box, h('p', { class: 'snap-line' }, h('b', null, s.displayName || r.targetUsername || '—')), s.bio ? h('p', { class: 'snap-line muted' }, s.bio) : null);
    }
    return box;
  }

  function reportCard(r) {
    const note = h('input', { class: 'input', maxlength: 300, placeholder: t('admin.note.ph'), 'aria-label': t('admin.note.ph') });
    const act = async (action, confirmKey) => {
      if (confirmKey && !(await confirmDialog(t(confirmKey), { confirmLabel: t('admin.act.' + action), danger: true }))) return;
      try {
        await api.post(`/admin/reports/${r.id}/resolve`, { action, note: note.value.trim() });
        toast(t('admin.done'), 'success');
        show();
      } catch (err) {
        toast(errText(err), 'error');
      }
    };
    const open = r.status === 'open';
    return h(
      'article',
      { class: 'card report-card' },
      h(
        'div',
        { class: 'report-head' },
        h('span', { class: 'mail-pill mail-pill-warn' }, t('report.kind.' + r.kind)),
        h('strong', null, t('report.reason.' + r.reason)),
        h('span', { class: 'help' }, fmtShort(r.createdAt)),
        !open && h('span', { class: 'mail-pill' }, t('admin.status.' + r.status))
      ),
      h(
        'p',
        { class: 'help' },
        t('admin.reports.by', { name: r.reporter || '—' }),
        ' → ',
        r.targetUsername ? h('a', { href: `#/u/${encodeURIComponent(r.targetUsername)}` }, '@' + r.targetUsername) : '—',
        r.targetReportCount > 1 && ` · ${t('admin.reports.count', { n: r.targetReportCount })}`,
        r.targetBanned && ` · ${t('admin.reports.banned')}`
      ),
      r.details && h('p', { class: 'report-details' }, r.details),
      snapshotView(r),
      open
        ? h(
            'div',
            { class: 'report-actions' },
            note,
            h(
              'div',
              { class: 'btn-row' },
              h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => act('dismiss') }, t('admin.act.dismiss')),
              h('button', { class: 'btn btn-soft btn-sm', type: 'button', onClick: () => act('resolve') }, t('admin.act.resolve')),
              r.messageId && h('button', { class: 'btn btn-ghost btn-sm btn-danger-text', type: 'button', onClick: () => act('delete_message', 'admin.confirm.message') }, icon('trash', 14), t('admin.act.delete_message')),
              r.kind === 'group' && r.roomId && h('button', { class: 'btn btn-ghost btn-sm btn-danger-text', type: 'button', onClick: () => act('delete_group', 'admin.confirm.group') }, icon('trash', 14), t('admin.act.delete_group')),
              r.targetUsername && !r.targetBanned && h('button', { class: 'btn btn-danger btn-sm', type: 'button', onClick: () => act('ban', 'admin.confirm.ban') }, icon('ban', 14), t('admin.act.ban'))
            )
          )
        : r.note && h('p', { class: 'help' }, `${t('admin.note')}: ${r.note}`)
    );
  }

  // ---------- Kullanıcılar ----------

  async function drawUsers() {
    const wrap = h('div', { class: 'admin-section' });
    const list = h('ul', { class: 'member-list admin-users' });
    const q = h('input', { class: 'input', type: 'search', placeholder: t('admin.users.search'), 'aria-label': t('admin.users.search'), maxlength: 40 });
    const only = h('input', { type: 'checkbox' });

    async function load() {
      try {
        const { users } = await api.get('/admin/users' + qs({ q: q.value.trim(), banned: only.checked }));
        clear(list);
        if (!users.length) list.append(h('li', { class: 'muted' }, t('admin.users.empty')));
        for (const u of users) list.append(userRow(u));
      } catch (err) {
        toast(errText(err), 'error');
      }
    }

    function userRow(u) {
      return h(
        'li',
        { class: 'member-row admin-user' },
        h(
          'div',
          { class: 'admin-user-main' },
          h('a', { class: 'member-name', href: `#/u/${encodeURIComponent(u.username)}` }, u.displayName, h('em', null, ` @${u.username}`)),
          h(
            'span',
            { class: 'help' },
            u.email || '—',
            ' · ',
            u.emailVerified ? t('profile.email.verified') : t('profile.email.unverified'),
            ' · ',
            t('admin.users.joined', { date: fmtShort(u.createdAt) }),
            u.reportCount > 0 && ` · ${t('admin.reports.count', { n: u.reportCount })}`,
            u.banned && ` · ${t('admin.reports.banned')}${u.banReason ? ': ' + u.banReason : ''}`
          )
        ),
        u.isAdmin
          ? h('span', { class: 'mail-pill mail-pill-ok' }, icon('shield', 12), t('admin.role'))
          : u.banned
            ? h(
                'button',
                {
                  class: 'btn btn-soft btn-sm',
                  type: 'button',
                  onClick: async () => {
                    try {
                      await api.post(`/admin/users/${encodeURIComponent(u.username)}/unban`, {});
                      toast(t('admin.done'), 'success');
                      load();
                    } catch (err) {
                      toast(errText(err), 'error');
                    }
                  },
                },
                t('admin.act.unban')
              )
            : h('button', { class: 'btn btn-ghost btn-sm btn-danger-text', type: 'button', onClick: () => banDialog(u, load) }, icon('ban', 14), t('admin.act.ban'))
      );
    }

    q.addEventListener('input', debounce(load, 250));
    only.addEventListener('change', load);
    wrap.append(h('div', { class: 'inline-form' }, q, h('label', { class: 'check-row' }, only, h('span', null, t('admin.users.onlyBanned')))), list);
    await load();
    return wrap;
  }

  function banDialog(u, after) {
    openDialog(t('admin.ban.title', { name: '@' + u.username }), (close) => {
      const reason = h('input', { class: 'input', maxlength: 200, placeholder: t('admin.ban.reason.ph') });
      const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
      setTimeout(() => reason.focus(), 30);
      return h(
        'form',
        {
          class: 'form',
          onSubmit: async (e) => {
            e.preventDefault();
            try {
              await api.post(`/admin/users/${encodeURIComponent(u.username)}/ban`, { reason: reason.value.trim() });
              close();
              toast(t('admin.done'), 'success');
              after();
            } catch (err) {
              error.textContent = errText(err);
              error.hidden = false;
            }
          },
        },
        h('p', { class: 'help' }, t('admin.ban.help')),
        field(t('admin.ban.reason'), reason),
        error,
        h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onClick: close }, t('common.cancel')), h('button', { class: 'btn btn-danger', type: 'submit' }, t('admin.act.ban')))
      );
    });
  }

  // ---------- Kayıt ----------

  async function drawLog() {
    const { log } = await api.get('/admin/log');
    if (!log.length) return h('p', { class: 'muted' }, t('admin.log.empty'));
    return h(
      'ul',
      { class: 'log-list' },
      log.map((l) => h('li', null, h('span', { class: 'help' }, fmtShort(l.createdAt)), h('b', null, ` ${l.admin} `), `${l.action} `, l.target && h('code', null, l.target), l.detail && ` — ${l.detail}`))
    );
  }
}
