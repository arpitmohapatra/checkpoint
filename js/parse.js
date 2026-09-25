// Quick-capture grammar:
//   dosa: completed theming
//   fb dosa: great job on the curry leaf pattern @yesterday
//   feedback north: can we try a warmer blue? @mon
import { todayISO, toISO, addDays, fromISO, MONTHS, DOW } from './util.js';
import { getClient } from './store.js';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export function matchProject(alias, projects) {
  const a = norm(alias);
  if (!a) return null;
  let best = null;
  let bestScore = 0;
  for (const p of projects) {
    const client = getClient(p.clientId);
    const names = [p.shortcut, p.name, client && client.name].filter(Boolean);
    const words = names.flatMap((n) => String(n).split(/\s+/));
    let score = 0;
    for (const n of names) {
      const nn = norm(n);
      if (nn === a) score = Math.max(score, 10);
      else if (nn.startsWith(a)) score = Math.max(score, 6);
      else if (nn.includes(a)) score = Math.max(score, 3);
    }
    for (const w of words) if (norm(w).startsWith(a)) score = Math.max(score, 4);
    if (p.status === 'done') score -= 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore > 0 ? best : null;
}

export function parseDate(token, today = new Date()) {
  const t = String(token || '').toLowerCase().trim();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!t || t === 'today' || t === 'tod') return toISO(base);
  if (t === 'yesterday' || t === 'yday' || t === 'yest') return toISO(addDays(base, -1));
  let m = t.match(/^(\d+)d$/);
  if (m) return toISO(addDays(base, -Number(m[1])));
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return toISO(new Date(+m[1], +m[2] - 1, +m[3]));
  const dow = DOW.findIndex((d) => t.startsWith(d.toLowerCase()));
  if (dow >= 0 && /^[a-z]+$/.test(t)) {
    const back = (base.getDay() - dow + 7) % 7;
    return toISO(addDays(base, -back));
  }
  const mon = (s) => MONTHS.findIndex((x) => s.startsWith(x.toLowerCase()));
  m = t.match(/^([a-z]+)\s*(\d{1,2})$/) || t.match(/^(\d{1,2})\s*([a-z]+)$/);
  if (m) {
    const [a, b] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
    const mi = mon(a);
    if (mi >= 0) {
      let d = new Date(base.getFullYear(), mi, +b);
      if (d > addDays(base, 31)) d = new Date(base.getFullYear() - 1, mi, +b);
      return toISO(d);
    }
  }
  m = t.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    let d = new Date(base.getFullYear(), +m[1] - 1, +m[2]);
    if (d > addDays(base, 31)) d = new Date(base.getFullYear() - 1, +m[1] - 1, +m[2]);
    return toISO(d);
  }
  return null;
}

const PRAISE = /\b(great|love|loved|lovely|nice|awesome|amazing|perfect|excellent|brilliant|beautiful|fantastic|good job|well done|thank|thanks|superb|wonderful|calm|clean|impressed|spot on|nailed)\b/i;
const CHANGE = /\b(can we|could we|could you|can you|change|cut|remove|instead|fix|should|please|don't|dont|not sure|too|tweak|revise|rework|swap|try|less|more|why|feels long|confusing|hard to)\b|\?/i;

export function detectTone(text) {
  const t = String(text || '');
  const praise = PRAISE.test(t);
  const change = CHANGE.test(t);
  if (change && !praise) return 'change';
  if (praise && !change) return 'praise';
  if (praise && change) return /\?|\b(can we|could we|please)\b/i.test(t) ? 'change' : 'praise';
  return 'note';
}

export function parseQuick(input, projects) {
  let s = String(input || '').trim();
  const out = { raw: s, type: 'progress', project: null, alias: '', text: '', date: todayISO(), from: '', tone: '', ok: false, hint: '' };
  if (!s) return out;

  // @date (the last one wins); allows "@sep 20"
  const dm = s.match(/\s@([a-z]+\s\d{1,2}|\d{1,2}\s[a-z]+|[^\s]+)\s*$/i) || s.match(/\s@([^\s]+)/i);
  if (dm) {
    const d = parseDate(dm[1]);
    if (d) {
      out.date = d;
      s = (s.slice(0, dm.index) + s.slice(dm.index + dm[0].length)).trim();
    }
  }

  const fb = s.match(/^(fb|feedback|note)\b[:\s]+/i);
  if (fb) {
    out.type = 'feedback';
    s = s.slice(fb[0].length).trim();
  }

  const colon = s.indexOf(':');
  if (colon > 0 && colon < 40) {
    out.alias = s.slice(0, colon).trim();
    out.text = s.slice(colon + 1).trim();
    out.project = matchProject(out.alias, projects);
  } else {
    out.text = s;
  }

  // "from Name" at the end of feedback overrides the contact.
  if (out.type === 'feedback') {
    const fm = out.text.match(/\s+(?:—|--|-|from)\s+([A-Z][\w'-]*(?:\s[A-Z][\w'-]*)?)\s*$/);
    if (fm) {
      out.from = fm[1];
      out.text = out.text.slice(0, fm.index).trim();
    }
    out.text = out.text.replace(/^["“]|["”]$/g, '').trim();
    if (!out.from && out.project) out.from = out.project.contact || '';
    out.tone = detectTone(out.text);
  }

  if (!out.alias) out.hint = 'Start with a project, like “dosa: …”';
  else if (!out.project) out.hint = `No project matches “${out.alias}”`;
  else if (!out.text) out.hint = 'Now say what happened';
  out.ok = Boolean(out.project && out.text);
  return out;
}

export const isFuture = (iso) => fromISO(iso) > new Date();
