import { api, auth, errMsg } from '../api.js';
import { esc, fmtDate, fmtDateTime, fmtDuration, LANG_NAMES, modeLabel, wpmChart } from '../ui.js';
import { TIME_OPTIONS, WORD_OPTIONS } from '../../../shared/typing.js';

export function profileView(root, { params, navigate }) {
  const username = params[0] || null; // /u/:username — ommaviy profil
  let alive = true;

  if (!username && !auth.user) {
    authForms(root, () => navigate('/profile', { replace: true }));
    return () => (alive = false);
  }

  root.innerHTML = `<p class="py-10 text-center text-sub">Yuklanmoqda…</p>`;
  const own = !username || username.toLowerCase() === auth.user?.username?.toLowerCase();
  (own ? api.get('/profile/me') : api.get(`/profile/${encodeURIComponent(username)}`))
    .then(({ data }) => alive && renderProfile(root, data, own, navigate))
    .catch((err) => {
      if (!alive) return;
      if (err.response?.status === 401) return navigate('/profile', { replace: true });
      root.innerHTML = `<p class="py-10 text-center text-err">${esc(errMsg(err))}</p>`;
    });
  return () => (alive = false);
}

function renderProfile(root, data, own, navigate) {
  const { user, stats, personalBests, recent, history } = data;
  const card = (label, value) => `<div class="card"><div class="label">${label}</div><div class="mt-1 text-3xl text-main">${value}</div></div>`;

  const pb = (mode, amount) => {
    const list = personalBests.filter((p) => p.mode === mode && p.amount === amount).sort((a, b) => b.wpm - a.wpm);
    const best = list[0];
    return `
      <div class="card text-center">
        <div class="label">${mode === 'time' ? `${amount} soniya` : `${amount} so‘z`}</div>
        <div class="mt-1 text-2xl ${best ? 'text-main' : 'text-sub'}">${best ? Math.round(best.wpm) : '—'}</div>
        <div class="text-xs text-sub">${best ? `${Math.round(best.accuracy)}% · ${LANG_NAMES[best.lang]}` : 'natija yo‘q'}</div>
      </div>`;
  };

  root.innerHTML = `
    <section class="mx-auto max-w-5xl space-y-8" data-testid="profile">
      <div class="card flex flex-wrap items-center gap-4">
        <div class="flex h-16 w-16 items-center justify-center rounded-full bg-bg text-2xl text-main">${esc(user.username[0].toUpperCase())}</div>
        <div class="flex-1">
          <div class="text-2xl text-text" data-testid="profile-username">${esc(user.username)}</div>
          <div class="text-sm text-sub">Qo‘shilgan: ${fmtDate(user.createdAt)}${own && user.email ? ` · ${esc(user.email)}` : ''}</div>
        </div>
        ${own ? '<button id="logout" class="btn">Chiqish</button>' : ''}
      </div>

      <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        ${card('eng yaxshi wpm', Math.round(stats.bestWpm))}
        ${card('o‘rtacha wpm', Math.round(stats.avgWpm))}
        ${card('o‘rtacha aniqlik', `${Math.round(stats.avgAccuracy)}%`)}
        ${card('tugatilgan testlar', stats.tests)}
      </div>

      <div>
        <h2 class="mb-3 text-lg">Shaxsiy rekordlar — vaqt</h2>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-4">${TIME_OPTIONS.map((n) => pb('time', n)).join('')}</div>
        <h2 class="mb-3 mt-6 text-lg">Shaxsiy rekordlar — so‘zlar</h2>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-4">${WORD_OPTIONS.map((n) => pb('words', n)).join('')}</div>
      </div>

      <div class="card">
        <h2 class="mb-3 text-lg">WPM o‘zgarishi</h2>
        ${wpmChart(history)}
      </div>

      <div>
        <h2 class="mb-3 text-lg">Oxirgi testlar</h2>
        ${recent.length
          ? `<div class="overflow-x-auto"><table class="tbl" data-testid="recent">
              <thead><tr><th>WPM</th><th>Aniqlik</th><th>Xato</th><th>Test</th><th class="hidden sm:table-cell">Davomiylik</th><th>Sana</th></tr></thead>
              <tbody>${recent
                .map(
                  (r) => `<tr>
                    <td class="font-bold text-main">${r.wpm.toFixed(1)}</td><td>${r.accuracy.toFixed(1)}%</td><td>${r.errors}</td>
                    <td>${esc(modeLabel(r.mode, r.amount))}${r.mode !== 'custom' ? ` · ${LANG_NAMES[r.lang]}` : ''}</td>
                    <td class="hidden sm:table-cell">${fmtDuration(r.durationMs)}</td>
                    <td class="text-sub">${fmtDateTime(r.createdAt)}</td></tr>`
                )
                .join('')}</tbody></table></div>`
          : `<div class="card py-8 text-center text-sub">Hali testlar yo‘q. <a href="/" data-link class="text-main underline">Birinchi testni topshiring</a></div>`}
      </div>
    </section>`;

  root.querySelector('#logout')?.addEventListener('click', () => {
    auth.logout();
    navigate('/profile', { replace: true });
  });
}

function authForms(root, done) {
  root.innerHTML = `
    <section class="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
      <form id="login" class="card space-y-3" novalidate>
        <h2 class="text-lg">Kirish</h2>
        <input name="login" class="field" placeholder="username yoki email" autocomplete="username" required />
        <input name="password" type="password" class="field" placeholder="parol" autocomplete="current-password" required />
        <button class="btn btn-main w-full">Kirish</button>
        <p class="msg text-sm text-err"></p>
      </form>
      <form id="register" class="card space-y-3" novalidate>
        <h2 class="text-lg">Ro‘yxatdan o‘tish</h2>
        <input name="username" class="field" placeholder="username (3–20, a-z 0-9 _)" autocomplete="username" maxlength="20" required />
        <input name="email" type="email" class="field" placeholder="email" autocomplete="email" required />
        <input name="password" type="password" class="field" placeholder="parol (kamida 6 belgi)" autocomplete="new-password" minlength="6" required />
        <button class="btn btn-main w-full">Akkaunt yaratish</button>
        <p class="msg text-sm text-err"></p>
      </form>
      <p class="text-center text-xs text-sub md:col-span-2">Akkauntsiz ham test topshirish mumkin — kirsangiz natijalar saqlanadi va reytingga chiqadi.</p>
    </section>`;

  const bind = (id, url) => {
    const form = root.querySelector(`#${id}`);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button');
      const msg = form.querySelector('.msg');
      msg.textContent = '';
      btn.disabled = true;
      try {
        const { data } = await api.post(url, Object.fromEntries(new FormData(form)));
        auth.set(data.token, data.user);
        done();
      } catch (err) {
        msg.textContent = errMsg(err);
      } finally {
        btn.disabled = false;
      }
    });
  };
  bind('login', '/auth/login');
  bind('register', '/auth/register');
}
