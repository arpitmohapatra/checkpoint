// Inline stroke icons. All inherit currentColor.
const svg = (size, body, vb = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const logo = (size = 28) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="1" y="1" width="26" height="26" rx="8" fill="#2F74B5"/><path d="M9 20V8l10 4-10 4" stroke="#ECECEE" stroke-width="2" stroke-linejoin="round"/></svg>`;

export const icons = {
  plus: (s = 16) => svg(s, '<path d="M10 4v12M4 10h12" stroke-width="2"/>'),
  back: (s = 18) => svg(s, '<path d="M12.5 4.5 7 10l5.5 5.5" stroke-width="2"/>'),
  next: (s = 18) => svg(s, '<path d="M7.5 4.5 13 10l-5.5 5.5" stroke-width="2"/>'),
  close: (s = 18) => svg(s, '<path d="M5 5l10 10M15 5 5 15" stroke-width="2"/>'),
  arrow: (s = 18) => svg(s, '<path d="M3 10h13M10 4l6 6-6 6"/>'),
  search: (s = 16) => svg(s, '<circle cx="9" cy="9" r="5.5" stroke-width="2"/><path d="m13 13 3.5 3.5" stroke-width="2"/>'),
  grid: (s = 22) => svg(s, '<rect x="3" y="3" width="6" height="6" rx="1.6"/><rect x="11" y="3" width="6" height="6" rx="1.6"/><rect x="3" y="11" width="6" height="6" rx="1.6"/><rect x="11" y="11" width="6" height="6" rx="1.6"/>'),
  ledger: (s = 22) => svg(s, '<path d="M5 3.5v13M5 6h10M5 10.5h7.5M5 15h9"/>'),
  bubble: (s = 22) => svg(s, '<path d="M3.5 4.5h13v9h-8l-5 3.5V4.5Z"/>'),
  play: (s = 22) => svg(s, '<circle cx="10" cy="10" r="7"/><path d="M8.5 7.2v5.6l4.4-2.8-4.4-2.8Z" fill="currentColor" stroke-width="1.2"/>'),
  gear: (s = 20) => svg(s, '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7"/>'),
  edit: (s = 16) => svg(s, '<path d="M4 16h3l8.5-8.5-3-3L4 13v3Z"/><path d="m11 6 3 3"/>'),
  copy: (s = 16) => svg(s, '<rect x="7" y="7" width="9" height="9" rx="2"/><path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 4 5v6.5A1.5 1.5 0 0 0 5.5 13H7"/>'),
  flag: (s = 18) => svg(s, '<path d="M5 17.5V3.5l10 4-10 4"/>'),
  moon: (s = 18) => svg(s, '<path d="M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5Z"/>'),
  sun: (s = 18) => svg(s, '<circle cx="10" cy="10" r="3.2"/><path d="M10 2.5v1.8M10 15.7v1.8M17.5 10h-1.8M4.3 10H2.5M15.3 4.7 14 6M6 14l-1.3 1.3M15.3 15.3 14 14M6 6 4.7 4.7"/>'),
  download: (s = 18) => svg(s, '<path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M4 16.5h12"/>'),
  upload: (s = 18) => svg(s, '<path d="M10 13V3M5.5 7.5 10 3l4.5 4.5M4 16.5h12"/>'),
  trash: (s = 16) => svg(s, '<path d="M4 6h12M8 6V4h4v2M5.5 6l.8 10h7.4l.8-10"/>'),
  install: (s = 18) => svg(s, '<rect x="5" y="2.5" width="10" height="15" rx="2.4"/><path d="M10 6.5v6M7.5 10 10 12.5l2.5-2.5"/>'),
};
