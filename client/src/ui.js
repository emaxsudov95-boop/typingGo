// Kichik yordamchi funksiyalar

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
export function fmtDate(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.getDate()}-${MONTHS[x.getMonth()]}, ${x.getFullYear()}`;
}

export function fmtDateTime(d) {
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(x.getDate())}.${p(x.getMonth() + 1)}.${x.getFullYear()} ${p(x.getHours())}:${p(x.getMinutes())}`;
}

export function fmtDuration(ms) {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} daq ${Math.round(s % 60)} s`;
}

export const LANG_NAMES = { uz: 'o‘zbekcha', en: 'english', custom: 'o‘z matni' };

export function modeLabel(mode, amount) {
  if (mode === 'time') return `${amount} soniya`;
  if (mode === 'words') return `${amount} so‘z`;
  return `o‘z matni (${amount} so‘z)`;
}

let toastTimer;
export function toast(msg, kind = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg transition-opacity';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = kind === 'error' ? 'var(--color-err)' : 'var(--color-main)';
  el.style.color = 'var(--color-bg)';
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.style.opacity = '0'), 2600);
}

/** WPM o'zgarish grafigi (SVG) */
export function wpmChart(points) {
  if (points.length < 2) {
    return `<div class="flex h-48 items-center justify-center text-sm text-sub">Grafik uchun kamida 2 ta test kerak</div>`;
  }
  const W = 800, H = 220, P = { l: 40, r: 12, t: 12, b: 24 };
  const max = Math.max(10, ...points.map((p) => p.wpm));
  const top = Math.ceil(max / 20) * 20;
  const x = (i) => P.l + (i / (points.length - 1)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - v / top) * (H - P.t - P.b);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.wpm).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const v = Math.round(top * f);
      return `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--color-sub)" stroke-opacity=".2"/>
        <text x="${P.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--color-sub)">${v}</text>`;
    })
    .join('');
  const dots = points
    .map((p, i) => `<circle cx="${x(i)}" cy="${y(p.wpm)}" r="3" fill="var(--color-main)"><title>${p.wpm} wpm · ${p.accuracy}% · ${fmtDateTime(p.createdAt)}</title></circle>`)
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="h-auto w-full" role="img" aria-label="WPM o‘zgarish grafigi">
    ${grid}
    <path d="${area}" fill="var(--color-main)" fill-opacity=".08"/>
    <path d="${line}" fill="none" stroke="var(--color-main)" stroke-width="2" vector-effect="non-scaling-stroke"/>
    ${dots}
    <text x="${W - P.r}" y="${H - 6}" text-anchor="end" font-size="11" fill="var(--color-sub)">oxirgi ${points.length} ta test</text>
  </svg>`;
}
