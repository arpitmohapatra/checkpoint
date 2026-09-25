import {
  $, $$, esc, todayISO, fromISO, shiftISO, daysBetween, toISO, addDays, weekStart,
  fmtShort, fmtDow, fmtLongToday, fmtRelative, agoLabel, greeting, initials, plural, tint,
  copyText, prefersReducedMotion, MONTHS, MONTHS_LONG, DOW, DOW_LONG,
} from './util.js';
import {
  getState, subscribe, updateSettings, getProject, getClient, saveProject, deleteProject,
  getEntry, saveEntry, deleteEntry, entriesFor, allEntries, projectInfo, projectsSorted,
  STATUS_LABEL, CLIENT_COLORS, exportData, importData, eraseAll, loadSample,
} from './store.js';
import { parseQuick, detectTone } from './parse.js';
import { icons, logo } from './icons.js';

const view = $('#view');
const layer = $('#layer');

const ui = {
  clientFilter: null,
  logFilter: 'all',
  ledgerQuery: '',
  ledgerClient: null,
  wallFilter: 'all',
};

let installPrompt = null;

/* =========================================================
   Routing
   ========================================================= */
function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, id] = h.split('/');
  return { name: name || 'home', id: id ? decodeURIComponent(id) : null };
}

const go = (path) => {
  if (location.hash === '#' + path) render();
  else location.hash = path;
};

let lastRouteKey = '';
function render() {
  const r = currentRoute();
  const key = r.name + '/' + (r.id || '');
  const sameRoute = key === lastRouteKey;
  const scroll = window.scrollY;
  lastRouteKey = key;

  renderChrome(r);
  document.body.dataset.route = r.name;

  switch (r.name) {
    case 'project': viewProject(r.id); break;
    case 'timeline': viewTimeline(); break;
    case 'wall': viewWall(); break;
    case 'settings': viewSettings(); break;
    case 'recap': viewHome(); openRecap(); break;
    default: viewHome();
  }
  if (sameRoute) window.scrollTo(0, scroll);
  else {
    window.scrollTo(0, 0);
  }
}

/* =========================================================
   Chrome: sidebar, tab bar, FAB
   ========================================================= */
function renderChrome(r) {
  const s = getState();
  const active = (n) => (r.name === n ? ' aria-current="page"' : '');
  const home = r.name === 'home' || r.name === 'project' ? ' aria-current="page"' : '';

  const clients = s.clients
    .map((c) => ({ c, n: s.projects.filter((p) => p.clientId === c.id && p.status !== 'done').length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => a.c.name.localeCompare(b.c.name));

  $('#side').innerHTML = `
    <a class="brand" href="#/">${logo()}<span>checkpoint</span></a>
    <div class="side-links">
      <a href="#/"${home}>${icons.grid(18)}Overview</a>
      <a href="#/timeline"${active('timeline')}>${icons.ledger(18)}Timeline</a>
      <a href="#/wall"${active('wall')}>${icons.bubble(18)}Feedback wall</a>
      <a href="#/recap"${active('recap')}>${icons.play(18)}Weekly recap</a>
    </div>
    ${clients.length ? `
    <div class="side-clients">
      <div class="eyebrow">Clients</div>
      ${clients.map(({ c, n }) => `
        <button type="button" class="side-client${ui.clientFilter === c.id ? ' on' : ''}" data-client="${c.id}" aria-pressed="${ui.clientFilter === c.id}">
          <span class="sw" style="background:${c.color}"></span><span class="nm">${esc(c.name)}</span><span class="ct">${n}</span>
        </button>`).join('')}
    </div>` : ''}
    <div class="side-foot">
      <p>Everything lives on this device. Export a backup anytime from <a href="#/settings">Settings</a>.</p>
      <div class="side-foot-row">
        <a href="#/settings"${active('settings')} class="side-settings">${icons.gear(18)}Settings</a>
        <button type="button" class="kbd-btn" data-action="palette" aria-label="Open command palette"><kbd>⌘K</kbd></button>
      </div>
    </div>`;

  $('#tabbar').innerHTML = `
    <a href="#/"${home}>${icons.grid()}<span>Projects</span></a>
    <a href="#/timeline"${active('timeline')}>${icons.ledger()}<span>Timeline</span></a>
    <a href="#/wall"${active('wall')}>${icons.bubble()}<span>Feedback</span></a>
    <a href="#/recap"${active('recap')}>${icons.play()}<span>Recap</span></a>`;

  const fab = $('#fab');
  fab.innerHTML = `${icons.plus()}<span>Log</span>`;
  fab.hidden = !s.projects.length;
}

document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-client]');
  if (c && c.closest('#side')) {
    const id = c.dataset.client;
    ui.clientFilter = ui.clientFilter === id ? null : id;
    go('/');
    return;
  }
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const act = a.dataset.action;
  if (act === 'palette') openPalette();
  else if (act === 'log') openLogSheet({ projectId: a.dataset.project || currentProjectId() });
  else if (act === 'log-feedback') openLogSheet({ projectId: currentProjectId(), type: 'feedback' });
  else if (act === 'new-project') openProjectSheet();
  else if (act === 'recap') go('/recap');
});

$('#fab').addEventListener('click', () => openLogSheet({ projectId: currentProjectId() }));

const currentProjectId = () => {
  const r = currentRoute();
  return r.name === 'project' ? r.id : null;
};

/* =========================================================
   Shared bits
   ========================================================= */
const pill = (status) => `<span class="pill st-${status}">${STATUS_LABEL[status] || status}</span>`;
const avatar = (name, color, size = '') =>
  `<span class="avatar ${size}" style="--c:${color};--ct:${tint(color, 0.84)}">${esc(initials(name))}</span>`;
const toneLabel = { praise: 'Praise', change: 'Change', note: 'Note' };

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function monthStats() {
  const s = getState();
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = s.entries.filter((e) => e.date.startsWith(prefix));
  return {
    flags: month.filter((e) => e.type === 'progress').length,
    notes: month.filter((e) => e.type === 'feedback').length,
  };
}

/* =========================================================
   Home / Overview
   ========================================================= */
function viewHome() {
  const s = getState();
  if (!s.settings.onboarded && !s.projects.length) return viewWelcome();

  const list = projectsSorted();
  const filtered = ui.clientFilter ? list.filter((x) => x.p.clientId === ui.clientFilter) : list;
  const ms = monthStats();
  const done = s.projects.filter((p) => p.status === 'done').length;
  const name = s.settings.name;
  const clientChips = [...new Map(list.map((x) => [x.info.client.id, x.info.client])).values()];

  view.innerHTML = `
  <div class="page home">
    <header class="home-head">
      <div class="home-hello">
        <div class="home-top">
          <span class="eyebrow">${esc(fmtLongToday())}</span>
          <span class="m-only home-top-actions">
            <a href="#/recap" class="week-pill"><span class="donut"></span>Your week</a>
            <a href="#/settings" class="icon-btn" aria-label="Settings">${icons.gear()}</a>
          </span>
        </div>
        <h1 class="display">${esc(greeting())}${name ? `, <br class="m-only"><em>${esc(name)}</em>` : ''}.</h1>
        <p class="lede">${list.length
          ? `<span>${plural(list.length, 'active project')}</span> · ${plural(ms.flags, 'flag')} and ${plural(ms.notes, 'note')} this month.`
          : 'No active projects. Start one and plant your first flag.'}</p>
      </div>
      <button type="button" class="btn primary d-only" data-action="log">${icons.plus()}Log checkpoint</button>
    </header>

    ${list.length ? `
    <form class="capture" id="capture" autocomplete="off">
      <label class="capture-field">
        ${icons.arrow()}
        <span class="sr">Quick capture</span>
        <input id="capture-input" type="text" enterkeyhint="done" placeholder="Quick capture — try “${esc(sampleAlias(list))}: completed theming” or “fb ${esc(sampleAlias(list))}: great job”">
        <button type="button" class="kbd d-only" data-action="palette" aria-label="Open command palette">⌘K</button>
      </label>
      <div class="capture-hint" id="capture-hint" aria-live="polite"></div>
    </form>` : ''}

    ${clientChips.length > 1 ? `
    <div class="chips m-only" role="group" aria-label="Filter by client">
      <button type="button" class="chip${!ui.clientFilter ? ' on' : ''}" data-filter-client="">Active</button>
      ${clientChips.map((c) => `<button type="button" class="chip${ui.clientFilter === c.id ? ' on' : ''}" data-filter-client="${c.id}"><span class="sw" style="background:${c.color}"></span>${esc(c.name)}</button>`).join('')}
    </div>` : ''}

    ${ui.clientFilter && getClient(ui.clientFilter) ? `
      <div class="filter-note d-only">Showing <strong>${esc(getClient(ui.clientFilter).name)}</strong> · <button type="button" class="link" data-filter-client="">Show all</button></div>` : ''}

    <div class="cards">
      ${filtered.map(({ p, info }, i) => projectCard(p, info, i)).join('')}
      <button type="button" class="pcard pcard-new" data-action="new-project">
        ${icons.plus(20)}<span>New project</span>
      </button>
    </div>
    ${done ? `<p class="muted small">${plural(done, 'finished project')} tucked away · <a href="#/timeline">see them in the ledger</a></p>` : ''}

    ${s.entries.length ? momentum() : ''}
  </div>`;

  bindCapture();
  $$('[data-filter-client]', view).forEach((b) =>
    b.addEventListener('click', () => {
      ui.clientFilter = b.dataset.filterClient || null;
      render();
    }),
  );
}

function sampleAlias(list) {
  const p = list[0] && list[0].p;
  if (!p) return 'dosa';
  return p.shortcut || (getClient(p.clientId)?.name || p.name).split(/\s+/)[0].toLowerCase().slice(0, 5);
}

function projectCard(p, info, i) {
  const c = info.client;
  const { lastProgress: lp, lastFeedback: lf, waiting } = info;
  let middle;
  if (lf && (!waiting)) {
    middle = `<blockquote class="quote"><span>“${esc(lf.text)}”</span><footer>— ${esc((lf.from || p.contact || 'Client').toUpperCase())} · ${esc(fmtShort(lf.date).toUpperCase())}</footer></blockquote>`;
  } else if (waiting) {
    middle = `<div class="dashed">Waiting on feedback · ${waiting.days <= 0 ? 'since today' : plural(waiting.days, 'day')}</div>`;
  } else {
    middle = `<div class="dashed">No checkpoints yet — plant the first one.</div>`;
  }
  return `
  <a class="pcard" href="#/project/${p.id}" style="--c:${c.color};--ct:${tint(c.color, 0.84)};animation-delay:${Math.min(i, 6) * 0.06}s">
    <div class="pcard-top">
      <span class="eyebrow client">${esc(c.name)}</span>
      ${p.contact ? `<span class="who">${avatar(p.contact, c.color)}${esc(p.contact)}</span>` : ''}
    </div>
    <h2 class="pcard-title">${esc(p.name)}</h2>
    ${lp ? `<div class="latest"><span class="mk-sq"></span><div><span class="t">${esc(lp.text)}</span><span class="d">${esc(fmtShort(lp.date))}</span></div></div>` : ''}
    ${middle}
    <div class="pcard-foot"><span>${plural(info.progress.length, 'checkpoint')} · ${info.feedback.length} feedback</span>${pill(info.status)}</div>
  </a>`;
}

function momentum() {
  const s = getState();
  const weeks = 20;
  const start = addDays(weekStart(), -7 * (weeks - 1));
  const buckets = Array.from({ length: weeks }, (_, i) => ({ start: addDays(start, i * 7), p: 0, f: 0 }));
  for (const e of s.entries) {
    const d = fromISO(e.date);
    const idx = Math.floor((d - start) / (7 * 864e5));
    if (idx >= 0 && idx < weeks) buckets[idx][e.type === 'feedback' ? 'f' : 'p']++;
  }
  const lvl = (n) => (n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4);
  return `
  <section class="momentum" aria-label="Momentum">
    <div class="sec-head">
      <h3 class="h3">Momentum</h3>
      <span class="legend">Last 20 weeks · <span class="lg-sq"></span> checkpoint <span class="lg-dot"></span> feedback</span>
    </div>
    <div class="heat">
      ${buckets.map((b, i) => `
        <div class="cell l${lvl(b.p)}${i === weeks - 1 ? ' now' : ''}" title="Week of ${fmtShort(toISO(b.start))}: ${plural(b.p, 'checkpoint')}, ${b.f} feedback">
          ${b.f ? '<span class="fdot"></span>' : ''}
        </div>`).join('')}
    </div>
  </section>`;
}

function bindCapture() {
  const form = $('#capture');
  if (!form) return;
  const input = $('#capture-input');
  const hint = $('#capture-hint');
  const update = () => {
    const q = parseQuick(input.value, getState().projects);
    if (!input.value.trim()) {
      hint.innerHTML = '';
      return;
    }
    hint.innerHTML = q.ok ? previewLine(q) : `<span class="muted">${esc(q.hint)}</span>`;
  };
  input.addEventListener('input', update);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = parseQuick(input.value, getState().projects);
    if (!q.ok) {
      hint.innerHTML = `<span class="warn">${esc(q.hint || 'Try “project: what you did”')}</span>`;
      input.focus();
      return;
    }
    commitQuick(q);
  });
}

function previewLine(q) {
  const c = getClient(q.project.clientId);
  const type = q.type === 'feedback'
    ? `<span class="tag fb">FEEDBACK</span>`
    : `<span class="tag pg">PROGRESS</span>`;
  const extra = q.type === 'feedback'
    ? ` · from ${esc(q.from || 'client')} · reads as ${toneLabel[q.tone].toLowerCase()}`
    : '';
  return `${type} → <span class="sw" style="background:${c ? c.color : '#2F74B5'}"></span><strong>${esc(q.project.name)}</strong> · ${esc(fmtRelative(q.date))}${extra} <span class="muted">· ↵ to log</span>`;
}

function commitQuick(q) {
  const e = saveEntry({
    projectId: q.project.id, type: q.type, text: q.text, date: q.date, from: q.from, tone: q.tone,
  });
  celebrate(e);
  const ci = $('#capture-input');
  if (ci) ci.focus({ preventScroll: true });
}

function viewWelcome() {
  const s = getState();
  view.innerHTML = `
  <div class="page welcome">
    <div class="welcome-card">
      ${logo(48)}
      <span class="eyebrow">Welcome to checkpoint</span>
      <h1 class="display">Plant a flag for every step. <em>Keep every kind word.</em></h1>
      <p class="lede">A tiny, private log for freelance work. Note what you finished, save what clients said, and get a weekly recap. Nothing leaves this device.</p>
      <form id="welcome-form" class="welcome-form">
        <label class="field">
          <span>What should we call you?</span>
          <input name="uname" type="text" autocomplete="given-name" placeholder="Your first name" value="${esc(s.settings.name)}" required>
        </label>
        <div class="row gap">
          <button type="submit" class="btn primary" name="mode" value="fresh">Start fresh</button>
          <button type="submit" class="btn ghost" name="mode" value="sample">Explore with sample data</button>
        </div>
      </form>
    </div>
  </div>`;
  const form = $('#welcome-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const mode = e.submitter ? e.submitter.value : 'fresh';
    const name = form.uname.value.trim();
    if (mode === 'sample') loadSample(name || 'Karthik');
    else {
      updateSettings({ name, onboarded: true });
      openProjectSheet();
    }
  });
}

/* =========================================================
   Project page
   ========================================================= */
function viewProject(id) {
  const p = getProject(id);
  if (!p) {
    view.innerHTML = `<div class="page"><p class="lede">That project doesn't exist anymore. <a href="#/">Back to overview</a></p></div>`;
    return;
  }
  const info = projectInfo(p);
  const c = info.client;
  const days = Math.max(0, daysBetween(p.startedAt, todayISO()));
  const praise = info.feedback.filter((f) => f.tone === 'praise').length;
  const change = info.feedback.filter((f) => f.tone === 'change').length;

  view.innerHTML = `
  <div class="page project" style="--c:${c.color};--ct:${tint(c.color, 0.84)}">
    <a href="#/" class="back">${icons.back()}Overview</a>
    <header class="proj-head">
      <div class="proj-title">
        <span class="eyebrow client">${esc(c.name)}</span>
        <h1 class="display">${esc(p.name)}</h1>
        <div class="proj-meta">${p.contact ? `${avatar(p.contact, c.color, 'lg')}${esc(p.contact)}` : ''}${pill(info.status)}</div>
      </div>
      <div class="proj-actions">
        <button type="button" class="btn ghost" id="copy-update">${icons.copy()}Copy update</button>
        <button type="button" class="btn ghost" id="edit-project">${icons.edit()}Edit</button>
        <button type="button" class="btn primary d-only" data-action="log" data-project="${p.id}">${icons.plus()}Plant a checkpoint</button>
      </div>
    </header>

    ${trail(p, info, days)}

    <div class="proj-grid">
      <section class="panel log" aria-label="Log">
        <div class="sec-head">
          <h2 class="h3">Log</h2>
          <div class="seg" role="group" aria-label="Filter entries">
            ${['all', 'progress', 'feedback'].map((f) => `<button type="button" data-logf="${f}" aria-pressed="${ui.logFilter === f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}
          </div>
        </div>
        <div id="log-list">${logList(p, info)}</div>
      </section>
      <aside class="proj-side">
        <div class="panel stats">
          <div class="stat"><span class="eyebrow">Checkpoints</span><span class="num">${info.progress.length}</span></div>
          <div class="stat"><span class="eyebrow">Feedback</span><span class="num">${info.feedback.length}</span></div>
          <div class="stat mood">
            <span class="eyebrow">Mood of the room</span>
            <div class="moodbar"><span class="pr" style="flex-grow:${praise}"></span><span class="ch" style="flex-grow:${change}"></span>${!praise && !change ? '<span class="nn" style="flex-grow:1"></span>' : ''}</div>
            <span class="muted small">${plural(praise, 'praise', 'praise')} · ${plural(change, 'change request')}</span>
          </div>
        </div>
        <div class="panel waiting${info.waiting ? ' on' : ''}">
          <span class="eyebrow">${info.waiting ? 'Waiting on' : 'All caught up'}</span>
          ${info.waiting
            ? `<span class="w-t">${esc(p.contact ? p.contact + '’s' : 'The client’s')} take on “${esc(info.waiting.entry.text)}”</span>
               <span class="muted small">Logged ${info.waiting.days <= 0 ? 'today' : agoLabel(info.waiting.entry.date) + ' ago'}</span>`
            : `<span class="w-t">${info.entries.length ? 'Nothing pending. Nice.' : 'Plant your first checkpoint to start the trail.'}</span>`}
        </div>
      </aside>
    </div>
  </div>`;

  $$('[data-logf]', view).forEach((b) =>
    b.addEventListener('click', () => {
      ui.logFilter = b.dataset.logf;
      $$('[data-logf]', view).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('#log-list').innerHTML = logList(p, projectInfo(p));
    }),
  );
  $('#edit-project').addEventListener('click', () => openProjectSheet(p.id));
  $('#copy-update').addEventListener('click', async () => {
    const ok = await copyText(updateText(p, projectInfo(p)));
    toast(ok ? 'Update copied — paste it anywhere.' : 'Could not copy.');
  });
  view.addEventListener('click', onEntryEdit);
}

function onEntryEdit(e) {
  const b = e.target.closest('[data-edit-entry]');
  if (!b) return;
  e.preventDefault();
  const en = getEntry(b.dataset.editEntry);
  if (en) openLogSheet({ entry: en });
}

function logList(p, info) {
  const items = info.entries.filter((e) => ui.logFilter === 'all' || e.type === ui.logFilter);
  if (!items.length) {
    return `<div class="empty"><p>${info.entries.length ? 'Nothing in this filter yet.' : 'No entries yet.'}</p>
      <button type="button" class="btn ghost sm" data-action="log" data-project="${p.id}">${icons.plus()}Plant a checkpoint</button></div>`;
  }
  return `<ol class="entries">${items.map((e, i) => entryRow(e, i === items.length - 1)).join('')}
    <li class="entry start"><div class="rail"><span class="mk-start"></span></div><div class="body muted">Project started · ${esc(fmtShort(p.startedAt))}</div></li>
  </ol>`;
}

function entryRow(e) {
  const fb = e.type === 'feedback';
  return `
  <li class="entry ${fb ? 'fb' : 'pg'}">
    <div class="rail"><span class="${fb ? 'mk-dot' : 'mk-sq'}"></span><span class="line"></span></div>
    <div class="body">
      <div class="meta"><span class="tag ${fb ? 'fb' : 'pg'}">${fb ? 'FEEDBACK' : 'PROGRESS'}</span><span class="d">· ${esc(fmtDow(e.date))}</span>
        <button type="button" class="icon-btn sm" data-edit-entry="${e.id}" aria-label="Edit entry">${icons.edit(15)}</button></div>
      ${fb
        ? `<blockquote class="quote big">“${esc(e.text)}”</blockquote>
           <div class="by">— ${esc(e.from || 'Client')} <span class="pill tone-${e.tone}">${toneLabel[e.tone] || 'Note'}</span></div>`
        : `<div class="t">${esc(e.text)}</div>`}
    </div>
  </li>`;
}

function updateText(p, info) {
  const c = info.client;
  const lines = [`${p.name} (${c.name}) — update, ${fmtShort(todayISO())}`, ''];
  const recent = info.progress.slice(0, 6).reverse();
  if (recent.length) {
    lines.push('Done so far:');
    recent.forEach((e) => lines.push(`✓ ${fmtShort(e.date)} — ${e.text}`));
  } else lines.push('Kicking off — first checkpoint coming soon.');
  const fb = info.feedback.slice(0, 2);
  if (fb.length) {
    lines.push('', 'What we heard:');
    fb.forEach((f) => lines.push(`“${f.text}” — ${f.from || p.contact || 'client'}, ${fmtShort(f.date)}`));
  }
  if (info.waiting) lines.push('', `Next: would love your thoughts on “${info.waiting.entry.text}”.`);
  return lines.join('\n');
}

function trailY(x) {
  return 180 - 95 * Math.sin((x / 1000) * Math.PI * 1.25 - 0.55) + 12 * Math.sin(x / 62);
}

function trail(p, info, days) {
  const W = 1000, H = 340;
  const today = todayISO();
  const earliest = info.entries.length ? info.entries[info.entries.length - 1].date : p.startedAt;
  const start = earliest < p.startedAt ? earliest : p.startedAt;
  const latest = info.entries.length && info.entries[0].date > today ? info.entries[0].date : today;
  const span = Math.max(daysBetween(start, latest), 1);
  const x0 = 50, xNow = 760;
  const X = (iso) => x0 + (Math.max(0, daysBetween(start, iso)) / span) * (xNow - x0);
  const pts = (a, b) => {
    const out = [];
    for (let x = a; x <= b; x += 8) out.push(`${x.toFixed(0)},${trailY(x).toFixed(1)}`);
    out.push(`${b.toFixed(0)},${trailY(b).toFixed(1)}`);
    return 'M' + out.join(' L');
  };
  const full = pts(10, 1010);
  const done = pts(x0 - 30, xNow);
  const progress = [...info.progress].reverse();
  const feedback = [...info.feedback].reverse();

  const flags = progress.map((e, i) => {
    const x = X(e.date), y = trailY(x);
    return `<g class="flag" style="animation-delay:${0.9 + i * 0.12}s"><line x1="${x}" y1="${y}" x2="${x}" y2="${y - 40}" stroke="#fff" stroke-width="2"/><path d="M${x} ${y - 40} l22 8 -22 8z" fill="#fff"/><circle cx="${x}" cy="${y}" r="5" fill="#fff"/></g>`;
  }).join('');
  const dots = feedback.map((e) => {
    const x = X(e.date), y = trailY(x);
    return `<circle cx="${x}" cy="${y}" r="9" fill="${e.tone === 'change' ? '#F3C969' : '#F08A62'}" style="stroke:var(--trail)" stroke-width="3"><title>${esc(e.from || 'Client')}: ${esc(e.text)}</title></circle>`;
  }).join('');

  // Label the most recent flags, skipping ones that would collide.
  const labels = [];
  let lastX = Infinity;
  for (let i = progress.length - 1; i >= 0 && labels.length < 3; i--) {
    const e = progress[i];
    const x = X(e.date);
    if (e.date <= start) continue;
    if (lastX - x < 150 && labels.length) continue;
    lastX = x;
    labels.push({ e, x, y: trailY(x) });
  }

  const nx = 930, ny = trailY(nx);
  const yNow = trailY(xNow);
  const lf = info.lastFeedback;
  const pct = (v, t) => `${((v / t) * 100).toFixed(2)}%`;

  return `
  <section class="trail" aria-label="Project trail">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g stroke="rgba(255,255,255,.16)" stroke-width="1.4" fill="none">
        <path d="M-60 330 C 150 300 260 360 420 320 S 760 250 1100 300"/>
        <path d="M-60 296 C 140 266 280 326 430 286 S 760 206 1100 256"/>
        <path d="M-60 60 C 200 90 360 30 560 50 S 900 110 1100 70"/>
        <path d="M-60 20 C 200 50 380 -10 580 10 S 900 70 1100 30"/>
        <ellipse cx="640" cy="120" rx="120" ry="46"/><ellipse cx="640" cy="120" rx="80" ry="28"/><ellipse cx="640" cy="120" rx="38" ry="12"/>
      </g>
      <path d="${full}" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round" fill="none"/>
      <path class="trail-done" d="${done}" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      ${flags}${dots}
      <circle class="ping" cx="${xNow}" cy="${yNow}" r="8" fill="none" stroke="#fff" stroke-width="2"/>
      <circle cx="${xNow}" cy="${yNow}" r="7" style="fill:var(--trail)" stroke="#fff" stroke-width="3"/>
      <g opacity=".6"><line x1="${nx}" y1="${ny}" x2="${nx}" y2="${ny - 40}" stroke="#DCE8F5" stroke-width="2" stroke-dasharray="3 4"/><path d="M${nx} ${ny - 40} l22 8 -22 8z" stroke="#DCE8F5" stroke-width="1.5" stroke-dasharray="3 3" fill="none"/></g>
    </svg>
    <div class="trail-hl">
      <span class="eyebrow">The trail · ${plural(days, 'day')} in</span>
      <span class="trail-sum">${plural(info.progress.length, 'flag')} planted, ${plural(info.feedback.length, 'note')} heard</span>
    </div>
    <div class="lbl kick" style="left:${pct(x0, W)};top:${pct(trailY(x0) + 18, H)}">${esc(fmtShort(p.startedAt).toUpperCase())} · Kickoff</div>
    ${labels.map((l) => {
      const below = l.x < 460 && l.y - 84 < 78;
      return `<div class="lbl flagl${below ? ' below' : ''}" style="left:${pct(l.x + (below ? 8 : 0), W)};top:${pct(below ? l.y + 14 : l.y - 44, H)}"><span>${esc(fmtShort(l.e.date).toUpperCase())}</span>${esc(l.e.text)}</div>`;
    }).join('')}
    <div class="lbl here" style="left:${pct(xNow, W)};top:${pct(yNow + 16, H)}">You are here</div>
    <button type="button" class="lbl next" data-action="log" data-project="${p.id}" style="left:${pct(nx, W)};top:${pct(ny - 44, H)}">Next checkpoint<span class="d-only">press P to plant</span></button>
    ${lf ? `<figure class="trail-quote"><blockquote>“${esc(lf.text)}”</blockquote><figcaption>— ${esc((lf.from || 'Client').toUpperCase())} · ${esc(fmtShort(lf.date).toUpperCase())}</figcaption></figure>` : ''}
  </section>`;
}

/* =========================================================
   Timeline ledger
   ========================================================= */
function viewTimeline() {
  const s = getState();
  const clients = [...s.clients].sort((a, b) => a.name.localeCompare(b.name));
  view.innerHTML = `
  <div class="page ledger">
    <header class="page-head">
      <div>
        <span class="eyebrow">Everything, newest first</span>
        <h1 class="display">The ledger</h1>
      </div>
      <label class="search">
        ${icons.search()}
        <span class="sr">Search</span>
        <input type="search" id="ledger-q" placeholder="Search notes, people, projects" value="${esc(ui.ledgerQuery)}">
      </label>
    </header>
    ${clients.length > 1 ? `
    <div class="chips" role="group" aria-label="Filter by client">
      <button type="button" class="chip${!ui.ledgerClient ? ' on' : ''}" data-lc="">All clients</button>
      ${clients.map((c) => `<button type="button" class="chip${ui.ledgerClient === c.id ? ' on' : ''}" data-lc="${c.id}"><span class="sw" style="background:${c.color}"></span>${esc(c.name)}</button>`).join('')}
    </div>` : ''}
    <section id="ledger-list" aria-label="Entries">${ledgerList()}</section>
  </div>`;
  const q = $('#ledger-q');
  q.addEventListener('input', () => {
    ui.ledgerQuery = q.value;
    $('#ledger-list').innerHTML = ledgerList();
  });
  $$('[data-lc]', view).forEach((b) =>
    b.addEventListener('click', () => {
      ui.ledgerClient = b.dataset.lc || null;
      $$('[data-lc]', view).forEach((x) => x.classList.toggle('on', x === b));
      $('#ledger-list').innerHTML = ledgerList();
    }),
  );
  view.addEventListener('click', onEntryEdit);
}

function ledgerList() {
  const s = getState();
  const q = ui.ledgerQuery.trim().toLowerCase();
  const items = allEntries().filter((e) => {
    const p = getProject(e.projectId);
    if (!p) return false;
    if (ui.ledgerClient && p.clientId !== ui.ledgerClient) return false;
    if (!q) return true;
    const c = getClient(p.clientId);
    return [e.text, e.from, p.name, p.contact, c && c.name].some((v) => v && v.toLowerCase().includes(q));
  });
  if (!s.entries.length) {
    return `<div class="empty big"><p>Your ledger is empty. Every checkpoint and every bit of feedback lands here.</p>
      ${s.projects.length ? `<button type="button" class="btn primary" data-action="log">${icons.plus()}Log the first one</button>` : `<button type="button" class="btn primary" data-action="new-project">${icons.plus()}Start a project</button>`}</div>`;
  }
  if (!items.length) return `<div class="empty"><p>Nothing matches that.</p></div>`;
  const groups = [];
  for (const e of items) {
    const key = e.date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) groups.push((g = { key, items: [] }));
    g.items.push(e);
  }
  return groups.map((g) => {
    const [y, m] = g.key.split('-').map(Number);
    const pc = g.items.filter((e) => e.type === 'progress').length;
    const fc = g.items.length - pc;
    const sameYear = y === new Date().getFullYear();
    return `
    <div class="month">
      <div class="month-head"><span class="h3">${MONTHS_LONG[m - 1]}${sameYear ? '' : ' ' + y}</span><span class="muted small">${plural(pc, 'checkpoint')} · ${fc} feedback</span></div>
      ${g.items.map((e, i) => ledgerRow(e, i)).join('')}
    </div>`;
  }).join('');
}

function ledgerRow(e, i) {
  const p = getProject(e.projectId);
  const c = getClient(p.clientId) || { color: CLIENT_COLORS[0] };
  const d = fromISO(e.date);
  const fb = e.type === 'feedback';
  return `
  <article class="lrow" style="animation-delay:${Math.min(i, 8) * 0.04}s">
    <div class="lday"><span class="n">${d.getDate()}</span><span class="w">${DOW[d.getDay()].toUpperCase()}</span></div>
    <span class="${fb ? 'mk-dot' : 'mk-sq'}"></span>
    <div class="lbody">
      <span class="tag ${fb ? 'fb' : 'pg'}">${fb ? `FEEDBACK · ${esc((e.from || 'CLIENT').toUpperCase())}` : 'PROGRESS'}</span>
      ${fb ? `<blockquote class="quote big">“${esc(e.text)}”</blockquote>` : `<span class="t">${esc(e.text)}</span>`}
    </div>
    <div class="lproj">
      <a href="#/project/${p.id}"><span class="sw" style="background:${c.color}"></span>${esc(p.name)}</a>
      <button type="button" class="icon-btn sm" data-edit-entry="${e.id}" aria-label="Edit entry">${icons.edit(15)}</button>
    </div>
  </article>`;
}

/* =========================================================
   Feedback wall
   ========================================================= */
function viewWall() {
  const all = allEntries().filter((e) => e.type === 'feedback');
  const praise = all.filter((e) => e.tone === 'praise');
  view.innerHTML = `
  <div class="page wall">
    <header class="page-head">
      <div>
        <span class="eyebrow">What people said</span>
        <h1 class="display">The wall of <em>kind words</em>.</h1>
      </div>
      <div class="seg" role="group" aria-label="Filter feedback">
        ${[['all', 'All'], ['praise', 'Praise'], ['change', 'Changes'], ['note', 'Notes']].map(([k, l]) => `<button type="button" data-wf="${k}" aria-pressed="${ui.wallFilter === k}">${l}</button>`).join('')}
      </div>
    </header>
    ${praise.length ? tickerHTML(praise) : ''}
    <section id="wall-notes" class="notes" aria-label="Feedback notes">${wallNotes(all)}</section>
  </div>`;
  $$('[data-wf]', view).forEach((b) =>
    b.addEventListener('click', () => {
      ui.wallFilter = b.dataset.wf;
      $$('[data-wf]', view).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('#wall-notes').innerHTML = wallNotes(all);
    }),
  );
  view.addEventListener('click', onEntryEdit);
}

function tickerHTML(praise) {
  const items = praise.slice(0, 8).map((e) => `<span>“${esc(shorten(e.text, 60))}”</span><span class="star">✦</span>`).join('');
  return `<div class="ticker-wrap" aria-hidden="true"><div class="ticker">${items}${items}${praise.length < 3 ? items + items : ''}</div></div>`;
}

const shorten = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

function wallNotes(all) {
  const items = all.filter((e) => ui.wallFilter === 'all' || e.tone === ui.wallFilter);
  if (!all.length) {
    const s = getState();
    const alias = s.projects.length ? sampleAlias(projectsSorted()) : 'dosa';
    return `<div class="empty big"><p>No feedback yet. When a client says something, log it with <code>fb</code> — like <code>fb ${esc(alias)}: love the colors</code>.</p>
      ${s.projects.length ? `<button type="button" class="btn primary" data-action="log-feedback">${icons.plus()}Log feedback</button>` : ''}</div>`;
  }
  if (!items.length) return `<div class="empty"><p>Nothing here yet.</p></div>`;
  const styles = ['n-paper', 'n-peach', 'n-blue'];
  const rot = [-2, 1.6, -0.8, 1.2, -1.4, 0.6];
  return items.map((e, i) => {
    const p = getProject(e.projectId);
    const c = p && getClient(p.clientId);
    return `
    <figure class="note ${styles[i % 3]}" style="--r:${rot[i % rot.length]}deg;animation-delay:${Math.min(i, 8) * 0.08}s">
      <span class="pin"></span>
      <blockquote>“${esc(e.text)}”</blockquote>
      <figcaption>
        <span class="who">${avatar(e.from || 'Client', c ? c.color : CLIENT_COLORS[0])}${esc(e.from || 'Client')} · ${esc(c ? c.name.split(' ')[0] : '')}</span>
        <span class="pill tone-${e.tone}">${toneLabel[e.tone] || 'Note'}</span>
      </figcaption>
      <button type="button" class="icon-btn sm note-edit" data-edit-entry="${e.id}" aria-label="Edit feedback">${icons.edit(15)}</button>
    </figure>`;
  }).join('');
}

/* =========================================================
   Settings
   ========================================================= */
function viewSettings() {
  const s = getState();
  const stats = `${plural(s.projects.length, 'project')} · ${plural(s.entries.length, 'entry', 'entries')}`;
  view.innerHTML = `
  <div class="page settings">
    <header class="page-head"><div><span class="eyebrow">${esc(stats)}</span><h1 class="display">Settings</h1></div></header>

    <section class="panel set">
      <h2 class="h3">You</h2>
      <label class="field"><span>Your name</span><input id="set-name" type="text" value="${esc(s.settings.name)}" placeholder="Your first name"></label>
      <div class="field"><span>Appearance</span>
        <div class="seg" role="group" aria-label="Appearance">
          ${['system', 'light', 'dark'].map((t) => `<button type="button" data-theme-set="${t}" aria-pressed="${s.settings.theme === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
        </div>
      </div>
      ${installPrompt ? `<button type="button" class="btn primary" id="install">${icons.install()}Install Checkpoint</button>` : ''}
    </section>

    <section class="panel set">
      <h2 class="h3">Backup</h2>
      <p class="muted">Your data only lives in this browser. Export a backup now and then — and to move to another device.</p>
      <div class="row gap wrap">
        <button type="button" class="btn ghost" id="export">${icons.download()}Export backup</button>
        <label class="btn ghost file">${icons.upload()}Import backup<input type="file" id="import" accept="application/json,.json"></label>
      </div>
    </section>

    <section class="panel set">
      <h2 class="h3">Quick capture</h2>
      <p class="muted">Type these in the box on the overview or in the palette (<kbd>⌘K</kbd> / <kbd>Ctrl K</kbd>).</p>
      <dl class="cheats">
        <dt><code>dosa: completed theming</code></dt><dd>A checkpoint on the project matching “dosa” (its shortcut, name or client).</dd>
        <dt><code>fb dosa: love the colors</code></dt><dd>Feedback from the project’s contact. Praise or change requests are detected for you.</dd>
        <dt><code>… @yesterday</code></dt><dd>Also <code>@mon</code>, <code>@3d</code>, <code>@sep 20</code>, <code>@2026-09-20</code>.</dd>
        <dt><code>fb dosa: tweak the logo from Asha</code></dt><dd>Feedback from someone else.</dd>
      </dl>
      <p class="muted small">Keys: <kbd>L</kbd> log · <kbd>P</kbd> plant on this project · <kbd>R</kbd> recap · <kbd>D</kbd> dark mode · <kbd>⇧N</kbd> new project</p>
    </section>

    <section class="panel set danger">
      <h2 class="h3">Start over</h2>
      <div class="row gap wrap">
        <button type="button" class="btn ghost" id="sample">Replace with sample data</button>
        <button type="button" class="btn danger" id="erase">${icons.trash()}Erase everything</button>
      </div>
    </section>
  </div>`;

  const nameI = $('#set-name');
  nameI.addEventListener('change', () => updateSettings({ name: nameI.value.trim() }));
  $$('[data-theme-set]', view).forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeSet)));
  $('#export').addEventListener('click', downloadBackup);
  $('#import').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      importData(await f.text());
      toast('Backup restored.');
    } catch (err) {
      toast(err.message || 'Could not read that file.');
    }
  });
  $('#sample').addEventListener('click', () => {
    if (confirm('Replace everything with sample data? Your current data will be lost.')) {
      loadSample(getState().settings.name);
      go('/');
    }
  });
  $('#erase').addEventListener('click', () => {
    if (confirm('Erase all projects, checkpoints and feedback on this device? This cannot be undone.')) {
      eraseAll();
      go('/');
    }
  });
  const inst = $('#install');
  if (inst) inst.addEventListener('click', promptInstall);
}

function downloadBackup() {
  const blob = new Blob([exportData()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `checkpoint-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup downloaded.');
}

/* =========================================================
   Theme
   ========================================================= */
function applyTheme() {
  const t = getState().settings.theme;
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
const isDark = () => {
  const t = document.documentElement.dataset.theme;
  if (t) return t === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};
function setTheme(t) {
  updateSettings({ theme: t });
}
const toggleTheme = () => setTheme(isDark() ? 'light' : 'dark');

/* =========================================================
   Modal plumbing
   ========================================================= */
let openCount = 0;
function openModal(cls, html, { onClose, label } = {}) {
  const prev = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = `modal ${cls}`;
  wrap.innerHTML = `<div class="scrim" data-close></div><div class="modal-box" role="dialog" aria-modal="true" aria-label="${esc(label || '')}">${html}</div>`;
  layer.appendChild(wrap);
  openCount++;
  document.body.classList.add('modal-open');
  const close = () => {
    if (!wrap.isConnected) return;
    wrap.classList.add('out');
    const done = () => {
      wrap.remove();
      openCount = Math.max(0, openCount - 1);
      if (!openCount) document.body.classList.remove('modal-open');
      if (prev && prev.focus) prev.focus({ preventScroll: true });
      if (onClose) onClose();
    };
    if (prefersReducedMotion()) done();
    else setTimeout(done, 160);
  };
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
    if (e.key === 'Tab') trapFocus(e, wrap);
  });
  wrap.close = close;
  return wrap;
}

function trapFocus(e, root) {
  const f = $$('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])', root)
    .filter((el) => !el.disabled && el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

const closeAllModals = () => $$('.modal', layer).forEach((m) => m.close && m.close());

/* =========================================================
   Log sheet (plant a checkpoint / add feedback)
   ========================================================= */
function openLogSheet({ projectId, entry, type } = {}) {
  const s = getState();
  if (!s.projects.length) return openProjectSheet();
  const list = projectsSorted();
  const editing = Boolean(entry);
  const st = {
    type: entry ? entry.type : type || 'progress',
    projectId: entry ? entry.projectId : projectId || (list[0] && list[0].p.id),
    date: entry ? entry.date : todayISO(),
    tone: entry ? entry.tone || 'note' : 'note',
    toneTouched: Boolean(entry),
  };
  if (!getProject(st.projectId)) st.projectId = list[0] && list[0].p.id;
  const extra = entry && !list.some((x) => x.p.id === entry.projectId) ? [{ p: getProject(entry.projectId) }] : [];
  const projects = [...list, ...extra].filter((x) => x.p);

  const m = openModal('sheet', `
    <form class="log-form" id="log-form" autocomplete="off">
      <span class="grip" aria-hidden="true"></span>
      <div class="sheet-head"><h2 class="h2">${editing ? 'Edit entry' : 'Plant a checkpoint'}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icons.close()}</button></div>
      <div class="seg big" role="group" aria-label="Entry type">
        <button type="button" data-type="progress"><span class="mk-sq"></span>Progress</button>
        <button type="button" data-type="feedback"><span class="mk-dot"></span>Feedback</button>
      </div>
      <div class="chips scroll" role="group" aria-label="Project">
        ${projects.map(({ p }) => {
          const c = getClient(p.clientId) || { color: CLIENT_COLORS[0] };
          return `<button type="button" class="chip proj" data-pid="${p.id}" style="--c:${c.color};--ct:${tint(c.color, 0.84)}"><span class="sw" style="background:${c.color}"></span>${esc(p.name)}</button>`;
        }).join('')}
      </div>
      <label class="field"><span id="text-label">What did you get done?</span>
        <textarea name="text" rows="3" required>${esc(entry ? entry.text : '')}</textarea></label>
      <div class="fb-only">
        <label class="field"><span>From</span><input name="from" type="text" value="${esc(entry ? entry.from : '')}"></label>
        <div class="field"><span>Reads as</span>
          <div class="chips" role="group" aria-label="Tone">
            ${['praise', 'change', 'note'].map((t) => `<button type="button" class="chip" data-tone="${t}">${toneLabel[t]}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="chips dates" role="group" aria-label="Date">
        <button type="button" class="chip sm" data-date="${todayISO()}">Today</button>
        <button type="button" class="chip sm" data-date="${shiftISO(todayISO(), -1)}">Yesterday</button>
        <label class="chip sm pick"><span>Pick date</span><input type="date" name="date" value="${st.date}" max="${shiftISO(todayISO(), 365)}"></label>
      </div>
      <div class="row gap">
        ${editing ? `<button type="button" class="btn danger" id="del-entry">${icons.trash()}Delete</button>` : ''}
        <button type="submit" class="btn primary block">${editing ? 'Save' : 'Plant it'}</button>
      </div>
    </form>`, { label: editing ? 'Edit entry' : 'Plant a checkpoint' });

  const form = $('#log-form', m);
  const ta = form.text;
  const sync = () => {
    $$('[data-type]', form).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === st.type)));
    $$('[data-pid]', form).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pid === st.projectId)));
    $$('[data-tone]', form).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tone === st.tone)));
    $$('[data-date]', form).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.date === st.date)));
    const custom = !$$('[data-date]', form).some((b) => b.dataset.date === st.date);
    $('.pick', form).classList.toggle('on', custom);
    $('.pick span', form).textContent = custom ? fmtShort(st.date) : 'Pick date';
    form.classList.toggle('is-fb', st.type === 'feedback');
    $('#text-label', form).textContent = st.type === 'feedback' ? 'What did they say?' : 'What did you get done?';
    if (st.type === 'feedback' && !form.from.value && !editing) {
      const p = getProject(st.projectId);
      form.from.placeholder = (p && p.contact) || 'Client name';
    }
    $('[type=submit]', form).textContent = editing ? 'Save' : st.type === 'feedback' ? 'Keep it' : 'Plant it';
  };
  form.addEventListener('click', (e) => {
    const t = e.target.closest('[data-type],[data-pid],[data-tone],[data-date]');
    if (!t) return;
    if (t.dataset.type) st.type = t.dataset.type;
    if (t.dataset.pid) {
      st.projectId = t.dataset.pid;
      if (st.type === 'feedback' && !editing) form.from.value = '';
    }
    if (t.dataset.tone) { st.tone = t.dataset.tone; st.toneTouched = true; }
    if (t.dataset.date) { st.date = t.dataset.date; form.date.value = st.date; }
    sync();
  });
  form.date.addEventListener('change', () => { if (form.date.value) { st.date = form.date.value; sync(); } });
  ta.addEventListener('input', () => {
    if (st.type === 'feedback' && !st.toneTouched) {
      st.tone = detectTone(ta.value);
      sync();
    }
  });
  const del = $('#del-entry', form);
  if (del) del.addEventListener('click', () => {
    if (confirm('Delete this entry?')) {
      deleteEntry(entry.id);
      m.close();
      toast('Entry deleted.');
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    const p = getProject(st.projectId);
    const saved = saveEntry({
      id: entry && entry.id,
      projectId: st.projectId,
      type: st.type,
      text,
      date: st.date,
      from: form.from.value.trim() || (p && p.contact) || '',
      tone: st.type === 'feedback' ? (st.toneTouched ? st.tone : detectTone(text)) : '',
    });
    if (editing) {
      m.close();
      toast('Saved.');
    } else {
      celebrate(saved, m);
    }
  });
  sync();
  setTimeout(() => ta.focus(), 60);
}

/* A little stamp moment after planting. */
function celebrate(entry, sheet) {
  const p = getProject(entry.projectId);
  const c = getClient(p.clientId) || { name: '' };
  const n = entriesFor(p.id).filter((e) => e.type === entry.type).length;
  const fb = entry.type === 'feedback';
  if (prefersReducedMotion()) {
    if (sheet) sheet.close();
    toast(fb ? `Feedback kept on ${p.name}.` : `Checkpoint No. ${String(n).padStart(2, '0')} planted on ${p.name}.`);
    return;
  }
  const leaves = [
    ['-120px', '-70px', '-160deg', '#6FA8DE', 0],
    ['110px', '-80px', '200deg', '#A9CBEE', 0.08],
    ['60px', '90px', '120deg', '#2F74B5', 0.05],
    ['-80px', '80px', '-90deg', '#F08A62', 0.12],
    ['140px', '20px', '90deg', '#6FA8DE', 0.1],
    ['-150px', '10px', '-120deg', '#F3C969', 0.03],
  ];
  const el = document.createElement('div');
  el.className = 'stamp-layer';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="stamp${fb ? ' fb' : ''}">
      <span class="s1">${fb ? 'FEEDBACK' : 'CHECKPOINT'}</span>
      <span class="s2">No. ${String(n).padStart(2, '0')}</span>
      <span class="s3">${esc(fmtShort(entry.date).toUpperCase())} · ${esc(c.name.toUpperCase())}</span>
    </div>
    ${leaves.map(([dx, dy, r, col, dl]) => `<svg class="leaf" style="--dx:${dx};--dy:${dy};--r:${r};animation-delay:${0.45 + dl}s" width="16" height="22" viewBox="0 0 16 22"><path d="M8 1C2 7 2 15 8 21c6-6 6-14 0-20Z" fill="${col}"/></svg>`).join('')}`;
  document.body.appendChild(el);
  if (sheet) sheet.classList.add('stamped');
  if (navigator.vibrate) try { navigator.vibrate(18); } catch { /* ignore */ }
  setTimeout(() => { if (sheet) sheet.close(); }, 900);
  setTimeout(() => el.classList.add('out'), 1500);
  setTimeout(() => el.remove(), 1900);
  toast(fb ? `Kept on ${p.name}.` : `Planted on ${p.name}.`);
}

/* =========================================================
   Project sheet
   ========================================================= */
function openProjectSheet(id) {
  const s = getState();
  const p = id && getProject(id);
  const client = p ? getClient(p.clientId) : null;
  const usedColors = new Set(s.clients.map((c) => c.color));
  let color = client ? client.color : CLIENT_COLORS.find((c) => !usedColors.has(c)) || CLIENT_COLORS[0];

  const m = openModal('sheet', `
    <form class="proj-form" id="proj-form" autocomplete="off">
      <span class="grip" aria-hidden="true"></span>
      <div class="sheet-head"><h2 class="h2">${p ? 'Edit project' : 'New project'}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icons.close()}</button></div>
      <label class="field"><span>Project name</span><input name="pname" required placeholder="Dosapoint Website" value="${esc(p ? p.name : '')}"></label>
      <div class="grid2">
        <label class="field"><span>Client</span><input name="client" list="client-list" required placeholder="Dosapoint" value="${esc(client ? client.name : '')}"></label>
        <label class="field"><span>Point of contact</span><input name="contact" placeholder="Shreesh" value="${esc(p ? p.contact : '')}"></label>
      </div>
      <datalist id="client-list">${s.clients.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>
      <div class="field"><span>Client color</span>
        <div class="swatches" role="radiogroup" aria-label="Client color">
          ${CLIENT_COLORS.map((c) => `<button type="button" role="radio" class="swatch" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}
        </div>
      </div>
      <div class="grid2">
        <label class="field"><span>Quick-capture shortcut</span><input name="shortcut" placeholder="dosa" value="${esc(p ? p.shortcut || '' : '')}" pattern="[A-Za-z0-9_-]*" title="Letters and numbers only"></label>
        <label class="field"><span>Started</span><input name="startedAt" type="date" value="${p ? p.startedAt : todayISO()}"></label>
      </div>
      ${p ? `<div class="field"><span>Status</span>
        <div class="seg" role="group" aria-label="Status">
          ${['active', 'paused', 'done'].map((t) => `<button type="button" data-status="${t}" aria-pressed="${(p.status || 'active') === t}">${STATUS_LABEL[t]}</button>`).join('')}
        </div></div>` : ''}
      <div class="row gap">
        ${p ? `<button type="button" class="btn danger" id="del-proj">${icons.trash()}Delete</button>` : ''}
        <button type="submit" class="btn primary block">${p ? 'Save' : 'Create project'}</button>
      </div>
    </form>`, { label: p ? 'Edit project' : 'New project' });

  const form = $('#proj-form', m);
  let status = p ? p.status || 'active' : 'active';
  const syncSw = () => $$('[data-color]', form).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.color === color)));
  form.addEventListener('click', (e) => {
    const sw = e.target.closest('[data-color]');
    if (sw) { color = sw.dataset.color; syncSw(); }
    const stb = e.target.closest('[data-status]');
    if (stb) {
      status = stb.dataset.status;
      $$('[data-status]', form).forEach((b) => b.setAttribute('aria-pressed', String(b === stb)));
    }
  });
  form.client.addEventListener('change', () => {
    const ex = s.clients.find((c) => c.name.toLowerCase() === form.client.value.trim().toLowerCase());
    if (ex) { color = ex.color; syncSw(); }
  });
  form.pname.addEventListener('input', () => {
    if (!p && !form.shortcut.dataset.touched) {
      form.shortcut.value = (form.client.value || form.pname.value).trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
    }
  });
  form.client.addEventListener('input', () => {
    if (!p && !form.shortcut.dataset.touched) {
      form.shortcut.value = (form.client.value || form.pname.value).trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
    }
  });
  form.shortcut.addEventListener('input', () => { form.shortcut.dataset.touched = '1'; });
  const del = $('#del-proj', form);
  if (del) del.addEventListener('click', () => {
    if (confirm(`Delete “${p.name}” and all of its entries?`)) {
      deleteProject(p.id);
      m.close();
      go('/');
      toast('Project deleted.');
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const saved = saveProject({
      id: p && p.id,
      name: form.pname.value,
      clientName: form.client.value,
      clientColor: color,
      contact: form.contact.value,
      shortcut: form.shortcut.value,
      status,
      startedAt: form.startedAt.value || todayISO(),
    });
    m.close();
    if (!p) {
      go('/project/' + saved.id);
      toast('Project created. Press P to plant a checkpoint.');
    } else toast('Saved.');
  });
  syncSw();
  setTimeout(() => form.pname.focus(), 60);
}

/* =========================================================
   Command palette
   ========================================================= */
function openPalette() {
  if ($('.modal.palette', layer)) return;
  const m = openModal('palette', `
    <div class="pal">
      <label class="pal-input">
        ${icons.arrow(20)}
        <span class="sr">Type a command or quick log</span>
        <input type="text" id="pal-q" placeholder="Jump to a project, run a command, or log — “fb dosa: loved it @yesterday”" autocomplete="off" spellcheck="false">
      </label>
      <div class="pal-list" id="pal-list" role="listbox" aria-label="Results"></div>
      <div class="pal-foot"><span>↑↓ move</span><span>↵ run</span><span>fb … feedback</span><span>@date</span><span class="r">esc close</span></div>
    </div>`, { label: 'Command palette' });
  const q = $('#pal-q', m);
  const listEl = $('#pal-list', m);
  let items = [];
  let sel = 0;

  const actions = () => [
    { group: 'Actions', label: 'Play this week’s recap', key: 'R', run: () => go('/recap') },
    { group: 'Actions', label: 'Plant a checkpoint', key: 'L', run: () => openLogSheet({ projectId: currentProjectId() }) },
    { group: 'Actions', label: 'Log feedback', key: '', run: () => openLogSheet({ projectId: currentProjectId(), type: 'feedback' }) },
    { group: 'Actions', label: 'New project', key: '⇧N', run: () => openProjectSheet() },
    { group: 'Actions', label: isDark() ? 'Switch to light mode' : 'Switch to dark mode', key: 'D', run: toggleTheme },
    { group: 'Actions', label: 'Open the ledger', key: '', run: () => go('/timeline') },
    { group: 'Actions', label: 'Open the feedback wall', key: '', run: () => go('/wall') },
    { group: 'Actions', label: 'Export backup', key: '', run: downloadBackup },
    { group: 'Actions', label: 'Settings', key: '', run: () => go('/settings') },
    ...(installPrompt ? [{ group: 'Actions', label: 'Install Checkpoint as an app', key: '', run: promptInstall }] : []),
  ];

  const build = () => {
    const v = q.value.trim();
    const lv = v.toLowerCase();
    const out = [];
    const parsed = parseQuick(v, getState().projects);
    if (parsed.ok) {
      out.push({ group: 'log', parsed, run: () => commitQuick(parsed) });
    }
    const projs = projectsSorted({ includeDone: true })
      .filter(({ p, info }) => !lv || parsed.ok || [p.name, p.contact, info.client.name, p.shortcut].some((x) => x && x.toLowerCase().includes(lv)))
      .slice(0, parsed.ok ? 2 : 6);
    projs.forEach(({ p, info }) => out.push({
      group: 'Jump to', label: p.name, sub: `${info.client.name}${p.contact ? ' · ' + p.contact : ''}`, color: info.client.color,
      run: () => go('/project/' + p.id),
    }));
    actions().filter((a) => !lv || parsed.ok || a.label.toLowerCase().includes(lv)).forEach((a) => out.push(a));
    if (v && !parsed.ok && !out.length) out.push({ group: 'hint', label: parsed.hint || 'Nothing found' });
    return out;
  };

  const draw = () => {
    items = build();
    sel = Math.min(sel, Math.max(0, items.length - 1));
    let lastGroup = '';
    listEl.innerHTML = items.map((it, i) => {
      let head = '';
      if (it.group !== lastGroup && it.group !== 'log' && it.group !== 'hint') head = `<div class="pal-group">${esc(it.group.toUpperCase())}</div>`;
      lastGroup = it.group;
      const on = i === sel ? ' on' : '';
      if (it.group === 'log') {
        const pq = it.parsed;
        const fb = pq.type === 'feedback';
        return `<div class="pal-log${on}" role="option" aria-selected="${i === sel}" data-i="${i}">
          <span class="pal-log-ic ${fb ? 'fb' : ''}">${fb ? icons.bubble(18) : icons.flag(18)}</span>
          <div><span class="t">${fb ? '“' + esc(pq.text) + '”' : esc(pq.text)}</span>
          <span class="s">${fb ? 'FEEDBACK' : 'PROGRESS'} → ${esc(pq.project.name)}${fb ? ' · from ' + esc(pq.from || 'client') : ''} · ${esc(fmtRelative(pq.date))}${fb ? ' · reads as ' + toneLabel[pq.tone].toLowerCase() : ''}</span></div>
          <span class="kbd">↵ Log</span></div>`;
      }
      if (it.group === 'hint') return `<div class="pal-hint">${esc(it.label)}</div>`;
      return `${head}<div class="pal-item${on}" role="option" aria-selected="${i === sel}" data-i="${i}">
        ${it.color ? `<span class="sw" style="background:${it.color}"></span>` : ''}<span class="l">${esc(it.label)}</span>${it.sub ? `<span class="s">${esc(it.sub)}</span>` : ''}${it.key ? `<span class="k">${esc(it.key)}</span>` : ''}</div>`;
    }).join('');
    const cur = $('.on', listEl);
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  };

  const run = (i) => {
    const it = items[i];
    if (!it || !it.run) return;
    m.close();
    setTimeout(() => it.run(), 10);
  };

  q.addEventListener('input', () => { sel = 0; draw(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
  });
  listEl.addEventListener('click', (e) => {
    const el = e.target.closest('[data-i]');
    if (el) run(Number(el.dataset.i));
  });
  listEl.addEventListener('mousemove', (e) => {
    const el = e.target.closest('[data-i]');
    if (el && Number(el.dataset.i) !== sel) { sel = Number(el.dataset.i); draw(); }
  });
  draw();
  setTimeout(() => q.focus(), 20);
}

/* =========================================================
   Weekly recap (story)
   ========================================================= */
function weekData(offset = 0) {
  const start = addDays(weekStart(), offset * 7);
  const end = addDays(start, 6);
  const a = toISO(start), b = toISO(end);
  const es = getState().entries.filter((e) => e.date >= a && e.date <= b && getProject(e.projectId));
  const flags = es.filter((e) => e.type === 'progress');
  const notes = es.filter((e) => e.type === 'feedback');
  const perProject = new Map();
  flags.forEach((e) => perProject.set(e.projectId, (perProject.get(e.projectId) || 0) + 1));
  const bars = [...perProject.entries()].map(([id, n]) => ({ p: getProject(id), n })).sort((x, y) => y.n - x.n);
  const perDay = Array(7).fill(0);
  flags.forEach((e) => { perDay[(fromISO(e.date).getDay() + 6) % 7]++; });
  const maxDay = Math.max(...perDay);
  const busiest = maxDay ? DOW_LONG[(perDay.indexOf(maxDay) + 1) % 7] : null;
  const praise = notes.filter((n) => n.tone === 'praise').sort((x, y) => y.text.length - x.text.length);
  const changes = notes.filter((n) => n.tone === 'change');
  const waiting = projectsSorted().filter((x) => x.info.waiting);
  const label = `${fmtShort(a).toUpperCase()} – ${start.getMonth() === end.getMonth() ? end.getDate() : fmtShort(b).toUpperCase()}`;
  return { a, b, label, flags, notes, bars, perDay, busiest, praise, changes, waiting, offset };
}

function recapSlides(w) {
  const name = getState().settings.name;
  const slides = [];
  const projCount = w.bars.length;
  slides.push({
    kind: 'count',
    html: `<div class="rs rs-count">
      <span class="rs-pre">${w.offset ? 'That week you planted' : 'This week you planted'}</span>
      <span class="rs-num">${w.flags.length}</span>
      <span class="rs-pre">${w.flags.length === 1 ? 'flag' : 'flags'}${projCount ? ` across <em>${plural(projCount, 'project')}</em>` : ''}.</span>
      <span class="rs-sub">${w.flags.length
        ? `Your busiest day was ${w.busiest}. ${esc(w.bars[0].p.name)} moved the most.`
        : `A quiet week${name ? ', ' + esc(name) : ''}. Even one small flag counts — plant one when you’re ready.`}</span>
    </div>`,
    text: `This week I planted ${plural(w.flags.length, 'flag')}${projCount ? ` across ${plural(projCount, 'project')}` : ''}.`,
  });
  const max = Math.max(1, ...w.bars.map((b) => b.n));
  slides.push({
    kind: 'bars',
    html: `<div class="rs rs-bars">
      <span class="eyebrow">02 / 05 · The week in flags</span>
      ${w.bars.length ? `<div class="rs-barlist">${w.bars.map((b) => `
        <div class="rs-bar"><div class="rs-bar-l"><span>${esc(b.p.name)}</span><span>${b.n}</span></div><div class="rs-track"><div class="bar" style="width:${(b.n / max) * 100}%"></div></div></div>`).join('')}</div>`
        : `<p class="rs-big">No flags this week.</p>`}
      <div class="rs-days">${w.perDay.map((n, i) => `<div class="rs-day"><div class="rs-col" style="height:${n ? 16 + (n / Math.max(1, ...w.perDay)) * 84 : 4}%"></div><span>${'MTWTFSS'[i]}</span></div>`).join('')}</div>
    </div>`,
    text: w.bars.map((b) => `• ${b.p.name}: ${plural(b.n, 'flag')}`).join('\n'),
  });
  const top = w.praise[0];
  slides.push({
    kind: 'praise',
    html: `<div class="rs rs-quote">
      <span class="eyebrow">03 / 05 · The loudest praise</span>
      ${top ? `<blockquote class="big">“${esc(top.text)}”</blockquote>
        <span class="rs-sub">— ${esc(top.from || 'Client')}, on <strong>${esc(getProject(top.projectId).name)}</strong> · ${esc(DOW_LONG[fromISO(top.date).getDay()])}</span>`
        : `<blockquote class="big">No praise logged this week.</blockquote><span class="rs-sub">When someone says something nice, keep it with <code>fb</code>. Future you will want it.</span>`}
    </div>`,
    text: top ? `Loudest praise: “${top.text}” — ${top.from || 'client'}` : '',
  });
  slides.push({
    kind: 'changes',
    html: `<div class="rs rs-list">
      <span class="eyebrow">04 / 05 · What to change</span>
      ${w.changes.length ? `<ul>${w.changes.slice(0, 4).map((c) => `<li><span class="q">“${esc(c.text)}”</span><span class="rs-sub">${esc(c.from || 'Client')} · ${esc(getProject(c.projectId).name)}</span></li>`).join('')}</ul>`
        : `<p class="rs-big">Nothing to fix.<br>A clean week.</p>`}
    </div>`,
    text: w.changes.length ? `To change:\n${w.changes.map((c) => `• “${c.text}” — ${c.from || 'client'}`).join('\n')}` : '',
  });
  slides.push({
    kind: 'next',
    html: `<div class="rs rs-list">
      <span class="eyebrow">05 / 05 · Next up</span>
      ${w.waiting.length ? `<p class="rs-mid">Waiting to hear back on</p><ul>${w.waiting.slice(0, 4).map(({ p, info }) => `<li><span class="q">${esc(info.waiting.entry.text)}</span><span class="rs-sub">${esc(p.name)}${p.contact ? ' · ' + esc(p.contact) : ''} · ${info.waiting.days <= 0 ? 'today' : plural(info.waiting.days, 'day')}</span></li>`).join('')}</ul>`
        : `<p class="rs-big">Nobody owes you an answer.<br>Rest well.</p>`}
    </div>`,
    text: w.waiting.length ? `Waiting on: ${w.waiting.map(({ p }) => p.name).join(', ')}` : '',
  });
  return slides;
}

function openRecap() {
  if ($('.modal.recap', layer)) return;
  let offset = 0;
  let idx = 0;
  let timer = null;
  let w = weekData(0);
  let slides = recapSlides(w);
  const DUR = 6500;

  const m = openModal('recap', `
    <div class="recap-stage">
      <svg class="grain" aria-hidden="true" width="100%" height="100%"><filter id="rg"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#rg)"/></svg>
      <svg class="recap-trail" aria-hidden="true" viewBox="0 0 1440 960" preserveAspectRatio="xMidYMid slice" fill="none"><path d="M-40 820 C 200 760 360 880 560 800 S 900 640 1500 700" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/><path d="M300 800 v-34 l18 7 -18 7" stroke="#fff" stroke-width="2" fill="#fff" opacity=".7"/><path d="M620 780 v-34 l18 7 -18 7" stroke="#fff" stroke-width="2" fill="#fff" opacity=".7"/><path d="M980 690 v-34 l18 7 -18 7" stroke="#fff" stroke-width="2" fill="#fff" opacity=".7"/></svg>
      <div class="segs" id="rc-segs"></div>
      <div class="recap-top">
        <div class="wk">
          <button type="button" class="icon-btn sm" id="rc-prevwk" aria-label="Previous week">${icons.back(14)}</button>
          <span class="eyebrow" id="rc-label"></span>
          <button type="button" class="icon-btn sm" id="rc-nextwk" aria-label="Next week">${icons.next(14)}</button>
        </div>
        <button type="button" class="icon-btn" data-close aria-label="Close recap">${icons.close()}</button>
      </div>
      <div class="tap tap-l" id="rc-tapl" aria-hidden="true"></div>
      <div class="tap tap-r" id="rc-tapr" aria-hidden="true"></div>
      <div class="recap-body" id="rc-body" aria-live="polite"></div>
      <div class="recap-ctrl">
        <button type="button" class="round" id="rc-prev" aria-label="Previous">${icons.back()}</button>
        <button type="button" class="round" id="rc-next" aria-label="Next">${icons.next()}<span class="m-only">Next</span></button>
        <button type="button" class="pillbtn" id="rc-copy">Copy recap</button>
      </div>
    </div>`, {
    label: 'Weekly recap',
    onClose: () => {
      clearTimeout(timer);
      if (currentRoute().name === 'recap') location.replace('#/');
    },
  });

  const segs = $('#rc-segs', m);
  const body = $('#rc-body', m);
  const show = () => {
    clearTimeout(timer);
    $('#rc-label', m).textContent = `${offset === 0 ? 'YOUR WEEK' : offset === -1 ? 'LAST WEEK' : 'WEEK OF'} · ${w.label}`;
    $('#rc-nextwk', m).disabled = offset >= 0;
    segs.innerHTML = slides.map((_, i) => `<span class="seg-t"><span class="seg-fill ${i < idx ? 'full' : i === idx ? 'run' : ''}" style="animation-duration:${DUR}ms"></span></span>`).join('');
    body.innerHTML = slides[idx].html;
    $('#rc-next', m).setAttribute('aria-label', idx === slides.length - 1 ? 'Finish' : 'Next');
    if (!prefersReducedMotion()) timer = setTimeout(() => (idx < slides.length - 1 ? step(1) : null), DUR);
  };
  const step = (d) => {
    const n = idx + d;
    if (n < 0) return;
    if (n >= slides.length) { m.close(); return; }
    idx = n;
    show();
  };
  const setWeek = (o) => {
    offset = o;
    w = weekData(offset);
    slides = recapSlides(w);
    idx = 0;
    show();
  };
  $('#rc-prev', m).addEventListener('click', () => step(-1));
  $('#rc-next', m).addEventListener('click', () => step(1));
  $('#rc-tapl', m).addEventListener('click', () => step(-1));
  $('#rc-tapr', m).addEventListener('click', () => step(1));
  $('#rc-prevwk', m).addEventListener('click', () => setWeek(offset - 1));
  $('#rc-nextwk', m).addEventListener('click', () => setWeek(Math.min(0, offset + 1)));
  $('#rc-copy', m).addEventListener('click', async () => {
    const txt = [`My week · ${w.label}`, ...slides.map((s) => s.text).filter(Boolean)].join('\n\n');
    toast((await copyText(txt)) ? 'Recap copied.' : 'Could not copy.');
  });
  m.onKey = (e) => {
    if (e.key === 'ArrowRight' || (e.key === ' ' && !e.target.closest('button'))) { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  };
  m.addEventListener('keydown', m.onKey);
  show();
  setTimeout(() => $('#rc-next', m).focus(), 30);
}

/* =========================================================
   Keyboard
   ========================================================= */
document.addEventListener('keydown', (e) => {
  const k = e.key;
  if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'k') {
    e.preventDefault();
    if ($('.modal.palette', layer)) $('.modal.palette', layer).close();
    else { closeAllModals(); openPalette(); }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  const top = $$('.modal', layer).pop();
  if (top) {
    if (!top.contains(t)) {
      if (k === 'Escape') top.close();
      else if (top.onKey) top.onKey(e);
    }
    return;
  }
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (!getState().projects.length && k.toLowerCase() !== 'd') return;
  if (k === '/') { e.preventDefault(); openPalette(); }
  else if (k === 'l' || k === 'p') { e.preventDefault(); openLogSheet({ projectId: currentProjectId() }); }
  else if (k === 'f') { e.preventDefault(); openLogSheet({ projectId: currentProjectId(), type: 'feedback' }); }
  else if (k === 'r') go('/recap');
  else if (k === 'd') toggleTheme();
  else if (k === 'N') { e.preventDefault(); openProjectSheet(); }
});

/* =========================================================
   PWA: install + service worker
   ========================================================= */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (currentRoute().name === 'settings') render();
});
window.addEventListener('appinstalled', () => { installPrompt = null; toast('Installed. Find Checkpoint on your home screen.'); });

async function promptInstall() {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => null);
  installPrompt = null;
  if (currentRoute().name === 'settings') render();
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}

/* =========================================================
   Boot
   ========================================================= */
subscribe(() => {
  applyTheme();
  // Don't clobber a view while someone is typing in it.
  const a = document.activeElement;
  if (a && view.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.id !== 'capture-input') return;
  render();
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
window.addEventListener('hashchange', () => {
  if (currentRoute().name !== 'recap') {
    const rc = $('.modal.recap', layer);
    if (rc) rc.remove();
    openCount = $$('.modal', layer).length;
    if (!openCount) document.body.classList.remove('modal-open');
  }
  render();
});
applyTheme();
render();
if (new URLSearchParams(location.search).has('log')) {
  history.replaceState(null, '', location.pathname + location.hash);
  if (getState().projects.length) openLogSheet({});
}
