// Local-first data store. Everything lives in localStorage on this device.
import { uid, todayISO, shiftISO, daysBetween } from './util.js';

const KEY = 'checkpoint.v1';

export const CLIENT_COLORS = ['#2F74B5', '#2E8F86', '#B8487A', '#C65E3B', '#7159B0', '#8A6D1F', '#3E8A4F', '#56627F'];

const empty = () => ({
  version: 1,
  settings: { name: '', theme: 'system', onboarded: false },
  clients: [],
  projects: [],
  entries: [],
});

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return normalize(JSON.parse(raw));
  } catch {
    return empty();
  }
}

function normalize(data) {
  const base = empty();
  if (!data || typeof data !== 'object') return base;
  return {
    version: 1,
    settings: { ...base.settings, ...(data.settings || {}) },
    clients: Array.isArray(data.clients) ? data.clients : [],
    projects: Array.isArray(data.projects) ? data.projects : [],
    entries: Array.isArray(data.entries) ? data.entries : [],
  };
}

function commit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Could not save', e);
  }
  listeners.forEach((fn) => fn(state));
}

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const getState = () => state;

// Keep tabs in sync.
window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    state = load();
    listeners.forEach((fn) => fn(state));
  }
});

/* ---------- settings ---------- */
export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  commit();
}

/* ---------- clients ---------- */
export const getClient = (id) => state.clients.find((c) => c.id === id);

export function ensureClient(name, color) {
  const clean = String(name || '').trim() || 'Independent';
  let c = state.clients.find((x) => x.name.toLowerCase() === clean.toLowerCase());
  if (!c) {
    const used = new Set(state.clients.map((x) => x.color));
    const pick = color || CLIENT_COLORS.find((col) => !used.has(col)) || CLIENT_COLORS[state.clients.length % CLIENT_COLORS.length];
    c = { id: uid(), name: clean, color: pick };
    state.clients.push(c);
  } else if (color && c.color !== color) {
    c.color = color;
  }
  return c;
}

function pruneClients() {
  const used = new Set(state.projects.map((p) => p.clientId));
  state.clients = state.clients.filter((c) => used.has(c.id));
}

/* ---------- projects ---------- */
export const getProject = (id) => state.projects.find((p) => p.id === id);

export function saveProject({ id, name, clientName, clientColor, contact, shortcut, status, startedAt }) {
  const client = ensureClient(clientName, clientColor);
  let p = id && getProject(id);
  if (p) {
    Object.assign(p, {
      name: name.trim(),
      clientId: client.id,
      contact: (contact || '').trim(),
      shortcut: (shortcut || '').trim().toLowerCase(),
      status: status || p.status,
      startedAt: startedAt || p.startedAt,
    });
  } else {
    p = {
      id: uid(),
      name: name.trim(),
      clientId: client.id,
      contact: (contact || '').trim(),
      shortcut: (shortcut || '').trim().toLowerCase(),
      status: status || 'active',
      startedAt: startedAt || todayISO(),
      createdAt: Date.now(),
    };
    state.projects.push(p);
  }
  pruneClients();
  commit();
  return p;
}

export function deleteProject(id) {
  state.projects = state.projects.filter((p) => p.id !== id);
  state.entries = state.entries.filter((e) => e.projectId !== id);
  pruneClients();
  commit();
}

/* ---------- entries ---------- */
export const getEntry = (id) => state.entries.find((e) => e.id === id);

export function saveEntry({ id, projectId, type, text, date, from, tone }) {
  let e = id && getEntry(id);
  const data = {
    projectId,
    type: type === 'feedback' ? 'feedback' : 'progress',
    text: String(text || '').trim(),
    date: date || todayISO(),
    from: type === 'feedback' ? (from || '').trim() : '',
    tone: type === 'feedback' ? tone || 'note' : '',
  };
  if (e) Object.assign(e, data);
  else {
    e = { id: uid(), createdAt: Date.now(), ...data };
    state.entries.push(e);
  }
  commit();
  return e;
}

export function deleteEntry(id) {
  state.entries = state.entries.filter((e) => e.id !== id);
  commit();
}

const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0));

export const entriesFor = (pid) => state.entries.filter((e) => e.projectId === pid).sort(byDateDesc);
export const allEntries = () => [...state.entries].sort(byDateDesc);

/* ---------- derived ---------- */
export function projectInfo(p) {
  const entries = entriesFor(p.id);
  const progress = entries.filter((e) => e.type === 'progress');
  const feedback = entries.filter((e) => e.type === 'feedback');
  const lastProgress = progress[0];
  const lastFeedback = feedback[0];
  const last = entries[0];
  let status = p.status || 'active';
  if (status === 'active' && lastFeedback && lastFeedback.tone === 'change' &&
      (!lastProgress || lastFeedback.date >= lastProgress.date)) {
    status = 'changes';
  }
  const waiting = status !== 'done' && lastProgress && (!lastFeedback || lastFeedback.date < lastProgress.date)
    ? { entry: lastProgress, days: daysBetween(lastProgress.date, todayISO()) }
    : null;
  return {
    entries, progress, feedback, lastProgress, lastFeedback, status, waiting,
    lastActivity: last ? last.date : p.startedAt,
    client: getClient(p.clientId) || { name: 'Independent', color: CLIENT_COLORS[0] },
  };
}

export const STATUS_LABEL = { active: 'Active', changes: 'Needs changes', paused: 'Paused', done: 'Done' };

export function projectsSorted({ includeDone = false } = {}) {
  return state.projects
    .filter((p) => includeDone || p.status !== 'done')
    .map((p) => ({ p, info: projectInfo(p) }))
    .sort((a, b) => (a.info.lastActivity < b.info.lastActivity ? 1 : a.info.lastActivity > b.info.lastActivity ? -1 : 0));
}

/* ---------- backup ---------- */
export const exportData = () => JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);

export function importData(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || !Array.isArray(data.projects) || !Array.isArray(data.entries)) {
    throw new Error('That file does not look like a Checkpoint backup.');
  }
  state = normalize(data);
  state.settings.onboarded = true;
  commit();
}

export function eraseAll() {
  state = empty();
  commit();
}

/* ---------- sample data ---------- */
export function loadSample(name) {
  const t = todayISO();
  const d = (n) => shiftISO(t, -n);
  state = empty();
  state.settings = { ...state.settings, name: name || state.settings.name || 'Karthik', onboarded: true };
  const dosa = ensureClient('Dosapoint', CLIENT_COLORS[0]);
  const north = ensureClient('Northwind Co', CLIENT_COLORS[1]);
  const halc = ensureClient('Halcyon Studio', CLIENT_COLORS[2]);
  const mk = (name, client, contact, shortcut, startedAt, status = 'active') => {
    const p = { id: uid(), name, clientId: client.id, contact, shortcut, status, startedAt, createdAt: Date.now() };
    state.projects.push(p);
    return p;
  };
  const web = mk('Dosapoint Website', dosa, 'Shreesh', 'dosa', d(12));
  const brand = mk('Brand Refresh', north, 'Priya', 'north', d(110));
  const app = mk('Mobile App', halc, 'Marco', 'halc', d(130));
  let k = 0;
  const e = (p, type, text, date, from = '', tone = '') =>
    state.entries.push({ id: uid(), createdAt: Date.now() + k++, projectId: p.id, type, text, date, from, tone });

  e(web, 'progress', 'Kickoff call and sitemap', d(12));
  e(web, 'progress', 'Moodboard shared', d(7));
  e(web, 'progress', 'Completed Theming', d(0));
  e(web, 'feedback', 'Great work on choosing the theme based on the curry leaf pattern. Great job.', d(1), 'Shreesh', 'praise');

  e(brand, 'progress', 'Discovery workshop', d(108));
  e(brand, 'progress', 'Competitor audit', d(94));
  e(brand, 'progress', 'Logo sketches, round 1', d(73));
  e(brand, 'feedback', 'Love where this is going. Keep the serif.', d(70), 'Priya', 'praise');
  e(brand, 'progress', 'Type pairings', d(52));
  e(brand, 'progress', 'Moodboard round 1', d(24));
  e(brand, 'feedback', 'Loved the moodboard direction.', d(20), 'Priya', 'praise');
  e(brand, 'progress', 'Moodboard round 2 shared', d(2));

  e(app, 'progress', 'User interviews synthesized', d(126));
  e(app, 'progress', 'Information architecture', d(100));
  e(app, 'feedback', 'The onboarding finally feels calm.', d(84), 'Marco', 'praise');
  e(app, 'progress', 'Design system tokens', d(60));
  e(app, 'progress', 'Home screen hi-fi', d(38));
  e(app, 'progress', 'Settings screens', d(31));
  e(app, 'progress', 'Onboarding flow wireframes', d(6));
  e(app, 'feedback', 'Can we cut step three? Feels long on small screens.', d(5), 'Marco', 'change');
  commit();
}
