import { auth, storage, playerId, getSocket, emitAck } from '../api.js';
import { TypingTest } from '../typing/engine.js';
import { esc, LANG_NAMES, modeLabel, toast } from '../ui.js';
import { TIME_OPTIONS, WORD_OPTIONS, MAX_CUSTOM_CHARS, splitWords } from '../../../shared/typing.js';

function guestName() {
  return storage.get('tg_name', '') || '';
}

// ---------- /rooms : yaratish yoki kod bilan kirish ----------
export function roomsView(root, { navigate }) {
  root.innerHTML = `
    <section class="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
      <div class="sm:col-span-2">
        <h1 class="text-2xl text-text">Jonli xonalar</h1>
        <p class="mt-1 text-sm text-sub">Do‘stlaringiz bilan 15 kishigacha birga poyga qiling.</p>
      </div>
      ${auth.user ? '' : `
      <div class="sm:col-span-2">
        <label class="label mb-1 block" for="name">Ismingiz (mehmon sifatida)</label>
        <input id="name" class="field" maxlength="20" placeholder="Masalan: Aziz" />
      </div>`}
      <div class="card">
        <h2 class="mb-2 text-lg">Xona yaratish</h2>
        <p class="mb-4 text-sm text-sub">Taklif havolasi va qisqa kod olasiz.</p>
        <button id="create" class="btn btn-main w-full">Xona yaratish</button>
      </div>
      <form id="joinForm" class="card">
        <h2 class="mb-2 text-lg">Kod bilan kirish</h2>
        <input id="code" class="field mb-3 uppercase tracking-widest" maxlength="6" placeholder="ABC123" autocomplete="off" />
        <button class="btn w-full">Kirish</button>
      </form>
      <p id="msg" class="text-sm text-err sm:col-span-2"></p>
    </section>`;
  const nameEl = root.querySelector('#name');
  if (nameEl) {
    nameEl.value = guestName();
    nameEl.addEventListener('input', () => storage.set('tg_name', nameEl.value.trim()));
  }
  const msg = root.querySelector('#msg');

  const createBtn = root.querySelector('#create');
  createBtn.addEventListener('click', async () => {
    createBtn.disabled = true;
    const res = await emitAck('room:create', { playerId: playerId(), name: guestName() });
    createBtn.disabled = false;
    if (!res?.ok) return (msg.textContent = res?.message || 'Xona yaratib bo‘lmadi');
    navigate(`/room/${res.room.code}`);
  });
  root.querySelector('#joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = root.querySelector('#code').value.trim().toUpperCase();
    if (code.length < 4) return (msg.textContent = 'Xona kodini kiriting');
    navigate(`/room/${code}`);
  });
}

// ---------- /room/:code ----------
export function roomView(root, { params, navigate }) {
  const code = params[0].toUpperCase();
  const me = playerId();
  const socket = getSocket();
  let room = null;
  let test = null;
  let raceKey = null; // joriy poyga (startAt) — qayta chizmaslik uchun
  let progress = [];
  let results = null;
  let countdownTimer = null;
  let clockOffset = 0; // server vaqti - mahalliy vaqt
  let alive = true;

  root.innerHTML = `
    <section class="mx-auto max-w-5xl" data-testid="room">
      <div id="head" class="mb-6"></div>
      <div id="body"></div>
    </section>`;
  const head = root.querySelector('#head');
  const body = root.querySelector('#body');

  const isOwner = () => room && room.ownerId === me;

  function showError(text) {
    head.innerHTML = '';
    body.innerHTML = `
      <div class="card mx-auto max-w-md text-center" data-testid="room-error">
        <div class="mb-4 text-xl text-err">${esc(text)}</div>
        <a href="/rooms" data-link class="btn">Xonalar sahifasiga qaytish</a>
      </div>`;
  }

  async function join() {
    const res = await emitAck('room:join', { code, playerId: me, name: guestName() });
    if (!alive) return;
    if (!res?.ok) return showError(res?.message || 'Xonaga kirib bo‘lmadi');
    clockOffset = res.serverNow - Date.now();
    room = res.room;
    results = res.results;
    progress = res.progress || [];
    renderHead();
    if (res.race) startRace(res.race, res.mine);
    else renderBody();
  }

  // ---------- Sarlavha: kod, havola, soni ----------
  function renderHead() {
    const link = `${location.origin}/room/${room.code}`;
    head.innerHTML = `
      <div class="flex flex-wrap items-center gap-4">
        <div>
          <div class="label">xona kodi</div>
          <div class="text-3xl font-bold tracking-widest text-main" data-testid="room-code">${esc(room.code)}</div>
        </div>
        <div class="min-w-0 flex-1">
          <div class="label">taklif havolasi</div>
          <div class="flex gap-2">
            <input class="field truncate py-1 text-sm" readonly value="${esc(link)}" id="link" />
            <button class="btn py-1" id="copy">Nusxa</button>
          </div>
        </div>
        <div class="text-right">
          <div class="label">ishtirokchilar</div>
          <div class="text-3xl text-text" data-testid="room-count">${room.count}/${room.max}</div>
        </div>
      </div>`;
    head.querySelector('#copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link);
        toast('Havola nusxalandi');
      } catch {
        head.querySelector('#link').select();
      }
    });
  }

  // ---------- Kutish zali / natijalar ----------
  function renderBody() {
    if (!room) return;
    if (room.state === 'countdown' || room.state === 'racing') return; // poyga ko'rinishi alohida
    stopTest();
    const s = room.settings;
    const mePlayer = room.players.find((p) => p.id === me);
    const others = room.players.filter((p) => p.connected && p.id !== room.ownerId);
    const allReady = others.every((p) => p.ready);

    const players = room.players
      .map(
        (p) => `
        <li class="flex items-center gap-3 rounded-lg bg-panel px-3 py-2 ${p.connected ? '' : 'opacity-40'}">
          <span class="flex-1 truncate">${p.id === room.ownerId ? '👑 ' : ''}${esc(p.name)}${p.id === me ? ' <span class="text-sub">(siz)</span>' : ''}</span>
          <span class="text-xs ${p.id === room.ownerId || p.ready ? 'text-main' : 'text-sub'}">
            ${!p.connected ? 'uzildi' : p.id === room.ownerId ? 'xona egasi' : p.ready ? 'tayyor ✓' : 'kutilmoqda'}</span>
        </li>`
      )
      .join('');

    const settingsHtml = isOwner() ? ownerSettings(s) : `
      <div class="card text-sm">
        <div class="label mb-1">poyga sozlamalari</div>
        <div>${s.mode === 'custom' ? modeLabel('custom', s.amount) : `${modeLabel(s.mode, s.amount)} · ${LANG_NAMES[s.lang]}`}</div>
        ${s.mode === 'custom' ? `<div class="mt-2 max-h-24 overflow-auto text-xs text-sub">${esc(s.customText)}</div>` : ''}
      </div>`;

    const action = isOwner()
      ? `<button id="start" class="btn btn-main w-full py-3 text-base" ${allReady ? '' : 'disabled'}>Poygani boshlash</button>
         ${allReady ? '' : `<p class="mt-2 text-center text-xs text-sub">Hamma “Tayyorman”ni bosishi kutilmoqda</p>`}`
      : `<button id="ready" class="btn ${mePlayer?.ready ? '' : 'btn-main'} w-full py-3 text-base" data-testid="ready">
           ${mePlayer?.ready ? 'Tayyor emasman' : 'Tayyorman'}</button>
         <p class="mt-2 text-center text-xs text-sub">Poygani xona egasi boshlaydi</p>`;

    body.innerHTML = `
      ${results ? resultsTable(results) : ''}
      <div class="grid gap-6 md:grid-cols-[1fr_320px]">
        <div class="space-y-4">${settingsHtml}<div>${action}</div></div>
        <div>
          <div class="label mb-2">ishtirokchilar (${room.count}/${room.max})</div>
          <ul class="space-y-1.5" data-testid="players">${players}</ul>
          <button id="leave" class="mt-4 text-xs text-sub hover:text-err">Xonadan chiqish</button>
        </div>
      </div>`;

    body.querySelector('#start')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      const r = await emitAck('room:start');
      if (!r?.ok) {
        toast(r?.message || 'Boshlab bo‘lmadi', 'error');
        renderBody();
      }
    });
    body.querySelector('#ready')?.addEventListener('click', () => emitAck('room:ready', { ready: !mePlayer?.ready }));
    body.querySelector('#leave').addEventListener('click', async () => {
      await emitAck('room:leave');
      navigate('/rooms');
    });
    body.querySelector('#reset')?.addEventListener('click', () => emitAck('room:reset'));
    if (isOwner()) bindOwnerSettings(s);
  }

  function ownerSettings(s) {
    const chip = (g, v, label, on) => `<button class="chip ${on ? 'on' : ''}" data-g="${g}" data-v="${v}">${label}</button>`;
    return `
      <div class="card space-y-3 text-sm" id="ownerCfg">
        <div class="label">poyga sozlamalari (siz xona egasisiz)</div>
        <div class="flex flex-wrap gap-1">
          ${chip('mode', 'time', 'vaqt', s.mode === 'time')}${chip('mode', 'words', 'so‘zlar', s.mode === 'words')}${chip('mode', 'custom', 'o‘z matnim', s.mode === 'custom')}
        </div>
        ${s.mode === 'custom'
          ? `<textarea id="rcText" class="field min-h-24" maxlength="${MAX_CUSTOM_CHARS}" placeholder="Poyga matnini yozing yoki qo‘ying">${esc(s.customText)}</textarea>
             <div class="flex items-center gap-2"><button id="rcSave" class="btn py-1">Matnni saqlash</button><span class="text-xs text-sub">${s.amount ? `${s.amount} ta so‘z` : 'Matn kiritilmagan'}</span></div>`
          : `<div class="flex flex-wrap gap-1">${['uz', 'en'].map((l) => chip('lang', l, LANG_NAMES[l], s.lang === l)).join('')}</div>
             <div class="flex flex-wrap gap-1">${(s.mode === 'time' ? TIME_OPTIONS : WORD_OPTIONS)
               .map((n) => chip('amount', n, s.mode === 'time' ? `${n}s` : n, s.amount === n))
               .join('')}</div>`}
      </div>`;
  }

  function bindOwnerSettings(s) {
    const box = body.querySelector('#ownerCfg');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-g]');
      if (!b) return;
      const next = { ...s };
      if (b.dataset.g === 'mode') {
        next.mode = b.dataset.v;
        next.amount = next.mode === 'time' ? 30 : 25;
      } else if (b.dataset.g === 'lang') next.lang = b.dataset.v;
      else next.amount = Number(b.dataset.v);
      emitAck('room:settings', next);
    });
    box.querySelector('#rcSave')?.addEventListener('click', async () => {
      const text = box.querySelector('#rcText').value;
      if (!splitWords(text).length) return toast('Avval matn kiriting', 'error');
      const r = await emitAck('room:settings', { ...s, mode: 'custom', customText: text });
      if (r?.ok) toast('Matn saqlandi');
    });
  }

  function resultsTable(list) {
    const rows = list
      .map(
        (r) => `
        <tr class="${r.id === me ? 'text-main' : ''}">
          <td>${r.place}</td><td class="truncate">${esc(r.name)}${r.id === me ? ' (siz)' : ''}</td>
          <td>${Math.round(r.wpm)}</td><td>${Math.round(r.accuracy)}%</td>
          <td class="text-sub">${r.completed ? '' : 'tugatmadi'}</td>
        </tr>`
      )
      .join('');
    return `
      <div class="mb-8" data-testid="race-results">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-xl text-main">Poyga natijalari</h2>
          ${isOwner() ? '<button id="reset" class="btn">Yangi poyga</button>' : ''}
        </div>
        <table class="tbl"><thead><tr><th>O‘rin</th><th>Ism</th><th>WPM</th><th>Aniqlik</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      </div>`;
  }

  // ---------- Poyga ----------
  function startRace(race, mine = null) {
    if (raceKey === race.startAt && test) return;
    raceKey = race.startAt;
    results = null;
    const localStart = race.startAt - clockOffset;
    body.innerHTML = `
      <div class="relative">
        <div id="cd" class="countdown"></div>
        <div id="raceTyping"></div>
      </div>
      <div class="mt-10">
        <div class="label mb-2">raqiblar</div>
        <ul id="opp" class="space-y-1.5" data-testid="opponents"></ul>
      </div>`;
    test = new TypingTest(body.querySelector('#raceTyping'), {
      onProgress: (st) => socket.emit('race:progress', st),
      onFinish: (res) => {
        socket.emit('race:finish', { typed: res.typed, keystrokes: res.keystrokes, errors: res.errors });
        const cd = body.querySelector('#cd');
        if (cd) {
          cd.classList.replace('text-7xl', 'text-2xl');
          cd.textContent = `Tugatdingiz: ${Math.round(res.stats.wpm)} wpm · ${Math.round(res.stats.accuracy)}%. Boshqalar kutilmoqda…`;
        }
      },
    });
    const s = race.settings;
    test.load(race.words, { mode: s.mode === 'time' ? 'time' : 'words', timeLimit: s.mode === 'time' ? s.amount : 0, startAt: localStart });
    if (mine?.typed?.length) test.restore(mine);
    if (mine?.finished) test.finish();
    renderOpponents();

    const cd = body.querySelector('#cd');
    clearInterval(countdownTimer);
    const tickCd = () => {
      const left = localStart - Date.now();
      if (left > 0) cd.textContent = String(Math.ceil(left / 1000));
      else if (left > -700) {
        cd.textContent = 'Boshla!';
        test.focus();
      } else {
        if (!test?.finished) cd.textContent = '';
        clearInterval(countdownTimer);
        test.focus();
      }
    };
    tickCd();
    countdownTimer = setInterval(tickCd, 100);
  }

  function renderOpponents() {
    const ul = body.querySelector('#opp');
    if (!ul || !room) return;
    const byId = new Map(progress.map((p) => [p.id, p]));
    const list = room.players.map((p) => ({ ...p, ...(byId.get(p.id) || { wordsTyped: 0, wpm: 0, progress: 0 }) }));
    ul.innerHTML = list
      .map(
        (p) => `
        <li class="rounded-lg bg-panel px-3 py-2 ${p.connected ? '' : 'opacity-40'}" data-player="${esc(p.id)}">
          <div class="flex items-center gap-3 text-sm">
            <span class="flex-1 truncate ${p.id === me ? 'text-main' : ''}">${esc(p.name)}${p.id === me ? ' (siz)' : ''}${p.finished ? ' ✓' : ''}</span>
            <span class="text-sub"><span data-k="words">${p.wordsTyped}</span> so‘z</span>
            <span class="w-20 text-right"><span data-k="wpm">${p.wpm}</span> wpm</span>
          </div>
          <div class="mt-1.5 h-1 overflow-hidden rounded bg-bg"><div class="h-full rounded bg-main transition-all" style="width:${Math.round(p.progress * 100)}%"></div></div>
        </li>`
      )
      .join('');
  }

  function stopTest() {
    clearInterval(countdownTimer);
    test?.destroy();
    test = null;
    raceKey = null;
  }

  // ---------- Socket hodisalari ----------
  const onState = (st) => {
    if (st.code !== code) return;
    const prevState = room?.state;
    room = st;
    renderHead();
    if (st.state === 'lobby' || st.state === 'finished') {
      if (st.state === 'lobby') results = null;
      renderBody();
    } else if (prevState === st.state) renderOpponents();
  };
  const onStart = (race) => {
    clockOffset = race.serverNow - Date.now();
    startRace(race);
  };
  const onProgress = (list) => {
    progress = list;
    renderOpponents();
  };
  const onResults = (list) => {
    results = list;
    if (test && !test.finished) test.finish();
  };
  const onReconnect = () => join(); // tarmoq uzilib qayta ulanganda o'z joyiga qaytish

  socket.on('room:state', onState);
  socket.on('race:start', onStart);
  socket.on('race:progress', onProgress);
  socket.on('race:results', onResults);
  socket.on('connect', onReconnect);
  join();

  return () => {
    alive = false;
    stopTest();
    socket.off('room:state', onState);
    socket.off('race:start', onStart);
    socket.off('race:progress', onProgress);
    socket.off('race:results', onResults);
    socket.off('connect', onReconnect);
    if (room) socket.emit('room:leave'); // sayt ichida boshqa sahifaga o'tildi
  };
}
