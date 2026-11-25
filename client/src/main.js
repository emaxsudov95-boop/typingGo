import './style.css';
import { auth } from './api.js';
import { esc } from './ui.js';
import { testView } from './views/test.js';
import { roomsView, roomView } from './views/rooms.js';
import { leaderboardView } from './views/leaderboard.js';
import { profileView } from './views/profile.js';

const app = document.getElementById('app');
app.innerHTML = `
  <div class="mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-8">
    <header class="flex flex-wrap items-center gap-x-6 gap-y-2 py-6">
      <a href="/" data-link class="flex items-center gap-2 text-2xl font-bold text-text">
        <span class="inline-block h-7 w-1.5 rounded bg-main"></span>TypingGo
      </a>
      <nav class="flex flex-wrap gap-1 text-sm sm:text-base" id="nav">
        <a href="/" data-link data-nav="test" class="nav-link">Test</a>
        <a href="/rooms" data-link data-nav="rooms" class="nav-link">Xonalar</a>
        <a href="/leaderboard" data-link data-nav="leaderboard" class="nav-link">Reyting</a>
        <a href="/profile" data-link data-nav="profile" class="nav-link">Profil</a>
      </nav>
      <div class="ml-auto text-sm text-sub" id="who"></div>
    </header>
    <main id="view" class="flex-1 pb-12"></main>
    <footer class="py-6 text-center text-xs text-sub">
      <kbd class="rounded bg-panel px-1.5 py-0.5">Tab</kbd> — yangi test
    </footer>
  </div>`;

const view = document.getElementById('view');
let cleanup = null;

const routes = [
  [/^\/$/, 'test', () => testView],
  [/^\/rooms\/?$/, 'rooms', () => roomsView],
  [/^\/room\/([A-Za-z0-9]{4,10})\/?$/, 'rooms', () => roomView],
  [/^\/leaderboard\/?$/, 'leaderboard', () => leaderboardView],
  [/^\/profile\/?$/, 'profile', () => profileView],
  [/^\/u\/([A-Za-z0-9_]{3,20})\/?$/, 'leaderboard', () => profileView],
];

function render() {
  const path = location.pathname;
  let match = null, nav = 'test', viewFn = testView;
  for (const [re, n, fn] of routes) {
    const m = path.match(re);
    if (m) {
      match = m;
      nav = n;
      viewFn = fn();
      break;
    }
  }
  if (!match) {
    history.replaceState(null, '', '/');
  }
  try {
    cleanup?.();
  } catch (e) {
    console.error(e);
  }
  cleanup = null;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
  view.innerHTML = '';
  cleanup = viewFn(view, { params: match ? match.slice(1) : [], navigate }) || null;
  window.scrollTo(0, 0);
}

export function navigate(to, { replace = false } = {}) {
  if (to === location.pathname + location.search) return render();
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  render();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey || a.target === '_blank') return;
  e.preventDefault();
  navigate(a.getAttribute('href'));
});
window.addEventListener('popstate', render);

function renderWho() {
  const who = document.getElementById('who');
  who.innerHTML = auth.user
    ? `<a href="/profile" data-link class="hover:text-text">👤 ${esc(auth.user.username)}</a>`
    : `<a href="/profile" data-link class="hover:text-text">Kirish / Ro‘yxatdan o‘tish</a>`;
}
auth.onChange(renderWho);
renderWho();
render();
