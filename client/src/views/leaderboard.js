import { api, auth, storage, errMsg } from '../api.js';
import { esc, fmtDate, LANG_NAMES } from '../ui.js';
import { TIME_OPTIONS } from '../../../shared/typing.js';

export function leaderboardView(root) {
  const f = { lang: 'uz', duration: 30, ...storage.get('tg_lb', {}) };
  let seq = 0;
  let alive = true;

  root.innerHTML = `
    <section class="mx-auto max-w-4xl">
      <div class="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <h1 class="text-2xl text-text">Dunyo reytingi</h1>
          <p class="text-sm text-sub">Vaqtli standart testlar · har bir foydalanuvchining eng yaxshi natijasi</p>
        </div>
        <button id="mine" class="btn ml-auto hidden">Mening o‘rnim</button>
      </div>
      <div id="filters" class="mb-4 flex flex-wrap items-center gap-2 text-sm"></div>
      <div id="meBox" class="mb-4 hidden"></div>
      <div id="table"></div>
    </section>`;
  const $ = (s) => root.querySelector(s);

  function renderFilters() {
    const chip = (g, v, label, on) => `<button class="chip ${on ? 'on' : ''}" data-g="${g}" data-v="${v}">${label}</button>`;
    $('#filters').innerHTML =
      ['uz', 'en'].map((l) => chip('lang', l, LANG_NAMES[l], f.lang === l)).join('') +
      '<span class="mx-2 h-4 w-px bg-sub/40"></span>' +
      TIME_OPTIONS.map((d) => chip('duration', d, `${d} soniya`, f.duration === d)).join('');
  }

  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    f[b.dataset.g] = b.dataset.g === 'duration' ? Number(b.dataset.v) : b.dataset.v;
    storage.set('tg_lb', f);
    renderFilters();
    load();
  });

  async function load() {
    const s = ++seq;
    $('#table').innerHTML = `<p class="py-10 text-center text-sub">Yuklanmoqda…</p>`;
    try {
      const { data } = await api.get('/leaderboard', { params: { lang: f.lang, duration: f.duration } });
      if (s !== seq || !alive) return;
      render(data);
    } catch (err) {
      if (s !== seq || !alive) return;
      $('#table').innerHTML = `<p class="py-10 text-center text-err">${esc(errMsg(err))}</p>`;
    }
  }

  function render(data) {
    const myId = auth.user?.id;
    const meBox = $('#meBox');
    const mineBtn = $('#mine');
    if (data.me) {
      meBox.classList.remove('hidden');
      meBox.innerHTML = `<div class="card flex flex-wrap items-center gap-4 text-sm">
        <span class="text-sub">Sizning o‘rningiz:</span>
        <span class="text-2xl text-main">#${data.me.rank}</span>
        <span>${Math.round(data.me.wpm)} wpm · ${Math.round(data.me.accuracy)}%</span>
        <span class="text-sub">jami ${data.total} kishi</span></div>`;
    } else if (auth.user) {
      meBox.classList.remove('hidden');
      meBox.innerHTML = `<div class="card text-sm text-sub">Bu toifada hali natijangiz yo‘q. ${f.duration} soniyalik test topshiring.</div>`;
    } else meBox.classList.add('hidden');
    mineBtn.classList.toggle('hidden', !data.me || data.me.rank > data.rows.length);

    if (!data.rows.length) {
      $('#table').innerHTML = `
        <div class="card py-12 text-center" data-testid="lb-empty">
          <div class="text-xl text-main">Birinchi natijani siz qo‘ying</div>
          <p class="mt-2 text-sm text-sub">${LANG_NAMES[f.lang]} · ${f.duration} soniya toifasida hali natija yo‘q.</p>
          <a href="/" data-link class="btn btn-main mt-6">Testni boshlash</a>
        </div>`;
      return;
    }
    $('#table').innerHTML = `
      <div class="overflow-x-auto">
      <table class="tbl" data-testid="lb-table">
        <thead><tr><th class="w-16">O‘rin</th><th>Username</th><th>WPM</th><th>Aniqlik</th><th class="hidden sm:table-cell">Sana</th></tr></thead>
        <tbody>${data.rows
          .map(
            (r) => `
          <tr id="${r.userId === myId ? 'myRow' : ''}" class="${r.userId === myId ? 'text-main outline outline-1 outline-main/50' : ''}">
            <td>${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</td>
            <td><a href="/u/${encodeURIComponent(r.username)}" data-link class="hover:underline">${esc(r.username)}</a></td>
            <td class="font-bold">${r.wpm.toFixed(1)}</td>
            <td>${r.accuracy.toFixed(1)}%</td>
            <td class="hidden text-sub sm:table-cell">${fmtDate(r.createdAt)}</td>
          </tr>`
          )
          .join('')}</tbody>
      </table></div>`;
  }

  $('#mine').addEventListener('click', () => root.querySelector('#myRow')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));

  renderFilters();
  load();
  return () => {
    alive = false;
  };
}
