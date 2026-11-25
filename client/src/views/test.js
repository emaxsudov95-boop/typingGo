import { api, auth, storage, uid, errMsg } from '../api.js';
import { TypingTest } from '../typing/engine.js';
import { esc, fmtDuration, LANG_NAMES, modeLabel } from '../ui.js';
import { generateWords, wordsForDuration } from '../../../shared/words.js';
import { splitWords, TIME_OPTIONS, WORD_OPTIONS, MAX_CUSTOM_CHARS } from '../../../shared/typing.js';

const DEFAULTS = { lang: 'uz', mode: 'time', time: 30, words: 25 };

export function testView(root) {
  const cfg = { ...DEFAULTS, ...storage.get('tg_cfg', {}) };
  let customText = storage.get('tg_custom', '');
  let current = null; // { testId, words, mode, amount, lang, text }
  let loadSeq = 0;

  root.innerHTML = `
    <section class="mx-auto max-w-5xl">
      <div id="cfg" class="mb-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl bg-panel/60 px-4 py-2 text-sm"></div>
      <div id="custom" class="mx-auto mb-8 hidden max-w-3xl">
        <label class="label mb-2 block" for="customText">O‘z so‘zlaringiz yoki matningizni yozing / nusxalab qo‘ying</label>
        <textarea id="customText" class="field min-h-32 font-mono" maxlength="${MAX_CUSTOM_CHARS}"
          placeholder="Masalan: Bugun tez yozishni mashq qilaman"></textarea>
        <div class="mt-3 flex items-center gap-3">
          <button id="customStart" class="btn btn-main">Boshlash</button>
          <span id="customInfo" class="text-xs text-sub"></span>
        </div>
      </div>
      <div id="testWrap">
        <div id="typing"></div>
        <div class="mt-6 flex justify-center">
          <button id="restart" class="btn bg-transparent text-sub" title="Yangi test (Tab)" aria-label="Yangi test">↻ qayta boshlash</button>
        </div>
      </div>
      <div id="result" class="hidden"></div>
      <p id="note" class="mt-6 text-center text-xs text-sub"></p>
    </section>`;

  const $ = (s) => root.querySelector(s);
  const cfgEl = $('#cfg');
  const customBox = $('#custom');
  const customTa = $('#customText');
  const testWrap = $('#testWrap');
  const resultEl = $('#result');
  const noteEl = $('#note');
  customTa.value = customText;

  const test = new TypingTest($('#typing'), { onFinish: handleFinish });

  function save() {
    storage.set('tg_cfg', cfg);
  }

  function renderCfg() {
    const chip = (group, value, label, on) =>
      `<button class="chip ${on ? 'on' : ''}" data-g="${group}" data-v="${value}">${label}</button>`;
    const sep = `<span class="h-4 w-px bg-sub/40"></span>`;
    let html = '';
    if (cfg.mode !== 'custom') {
      html += ['uz', 'en'].map((l) => chip('lang', l, LANG_NAMES[l], cfg.lang === l)).join('') + sep;
    }
    html +=
      chip('mode', 'time', '⏱ vaqt', cfg.mode === 'time') +
      chip('mode', 'words', 'Aa so‘zlar', cfg.mode === 'words') +
      chip('mode', 'custom', '✎ o‘z matnim', cfg.mode === 'custom');
    if (cfg.mode === 'time') html += sep + TIME_OPTIONS.map((n) => chip('time', n, n, cfg.time === n)).join('');
    if (cfg.mode === 'words') html += sep + WORD_OPTIONS.map((n) => chip('words', n, n, cfg.words === n)).join('');
    cfgEl.innerHTML = html;
  }

  cfgEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    const { g, v } = b.dataset;
    if (g === 'lang' || g === 'mode') cfg[g] = v;
    else cfg[g] = Number(v);
    save();
    renderCfg();
    if (cfg.mode === 'custom') showCustomEditor();
    else newTest();
  });

  function showCustomEditor() {
    customBox.classList.remove('hidden');
    testWrap.classList.add('hidden');
    resultEl.classList.add('hidden');
    noteEl.textContent = '';
    updateCustomInfo();
    customTa.focus();
  }

  function updateCustomInfo() {
    const n = splitWords(customTa.value).length;
    $('#customInfo').textContent = n ? `${n} ta so‘z` : '';
  }
  customTa.addEventListener('input', updateCustomInfo);

  $('#customStart').addEventListener('click', () => {
    const words = splitWords(customTa.value);
    if (!words.length) {
      customTa.focus();
      $('#customInfo').textContent = 'Avval matn kiriting';
      return;
    }
    customText = customTa.value;
    storage.set('tg_custom', customText);
    startCustom();
  });

  function startCustom() {
    const words = splitWords(customText);
    current = { testId: null, words, mode: 'custom', amount: words.length, lang: 'custom', text: customText };
    customBox.classList.add('hidden');
    begin();
  }

  async function newTest() {
    if (cfg.mode === 'custom') {
      if (splitWords(customText).length) startCustom();
      else showCustomEditor();
      return;
    }
    customBox.classList.add('hidden');
    const seq = ++loadSeq;
    const amount = cfg.mode === 'time' ? cfg.time : cfg.words;
    const req = { lang: cfg.lang, mode: cfg.mode, amount };
    let t;
    try {
      const { data } = await api.post('/tests', req, { timeout: 5000 });
      t = { testId: data.testId, words: data.words, mode: data.mode, amount: data.amount, lang: data.lang };
    } catch {
      // Server ishlamasa ham mashq qilish mumkin (natija saqlanmaydi)
      const words = generateWords(cfg.lang, cfg.mode === 'time' ? wordsForDuration(amount) : amount);
      t = { testId: null, offline: true, words, ...req };
    }
    if (seq !== loadSeq) return;
    current = t;
    begin();
  }

  function begin() {
    resultEl.classList.add('hidden');
    testWrap.classList.remove('hidden');
    noteEl.textContent = current.offline ? 'Server bilan aloqa yo‘q — natija saqlanmaydi.' : '';
    test.load(current.words, {
      mode: current.mode,
      timeLimit: current.mode === 'time' ? current.amount : 0,
      startAt: 0,
    });
    test.focus();
  }

  function restartSame() {
    begin();
  }

  async function handleFinish(res) {
    const t = current;
    showResult(res.stats, t, { pending: true });
    if (t.offline) return showResult(res.stats, t, { note: 'Server bilan aloqa yo‘q — natija saqlanmadi.' });
    try {
      let data;
      if (t.mode === 'custom') {
        ({ data } = await api.post('/results/custom', {
          text: t.text,
          typed: res.typed,
          keystrokes: res.keystrokes,
          errors: res.errors,
          durationMs: res.durationMs,
          clientId: uid(),
        }));
      } else {
        ({ data } = await api.post('/results', {
          testId: t.testId,
          typed: res.typed,
          keystrokes: res.keystrokes,
          errors: res.errors,
          durationMs: res.durationMs,
        }));
      }
      if (current !== t) return;
      let note;
      if (!data.saved) note = 'Natijani saqlash va reytingga chiqish uchun akkauntga kiring.';
      else if (data.leaderboard) note = 'Natija saqlandi va reytingga qo‘shildi ✓';
      else note = 'Natija shaxsiy tarixga saqlandi ✓';
      showResult(data.stats, t, { note, guest: !data.saved });
    } catch (err) {
      if (current !== t) return;
      showResult(res.stats, t, { note: errMsg(err, 'Natijani yuborib bo‘lmadi'), error: true });
    }
  }

  function showResult(s, t, { pending = false, note = '', guest = false, error = false } = {}) {
    testWrap.classList.add('hidden');
    resultEl.classList.remove('hidden');
    const big = (label, value, sub = '') => `
      <div>
        <div class="label">${label}</div>
        <div class="text-5xl font-bold text-main sm:text-6xl">${value}</div>
        ${sub ? `<div class="text-xs text-sub">${sub}</div>` : ''}
      </div>`;
    const small = (label, value) => `<div><div class="label">${label}</div><div class="text-2xl text-text">${value}</div></div>`;
    resultEl.innerHTML = `
      <div class="mx-auto max-w-3xl" data-testid="result">
        <div class="flex flex-wrap items-end gap-10">
          ${big('wpm', Math.round(s.wpm))}
          ${big('aniqlik', `${Math.round(s.accuracy)}%`)}
        </div>
        <div class="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
          ${small('xatolar', s.errors)}
          ${small('davomiylik', fmtDuration(s.durationMs))}
          ${small('xom wpm', Math.round(s.raw))}
          ${small('test', esc(t.mode === 'custom' ? modeLabel('custom', t.amount) : `${modeLabel(t.mode, t.amount)} · ${LANG_NAMES[t.lang]}`))}
        </div>
        <p class="mt-6 text-sm ${error ? 'text-err' : 'text-sub'}">${pending ? 'Natija tekshirilmoqda…' : esc(note)}
          ${guest && !auth.user ? ' <a href="/profile" data-link class="text-main underline">Kirish</a>' : ''}</p>
        <div class="mt-8 flex flex-wrap gap-3">
          <button id="next" class="btn btn-main">Keyingi test <span class="opacity-60">(Tab)</span></button>
          ${t.mode === 'custom' ? '<button id="again" class="btn">Shu matnni qayta yozish</button><button id="edit" class="btn">Matnni o‘zgartirish</button>' : ''}
        </div>
      </div>`;
    resultEl.querySelector('#next').addEventListener('click', () => (t.mode === 'custom' ? showCustomEditor() : newTest()));
    resultEl.querySelector('#again')?.addEventListener('click', restartSame);
    resultEl.querySelector('#edit')?.addEventListener('click', showCustomEditor);
    resultEl.querySelector('#next').focus();
  }

  $('#restart').addEventListener('click', () => (cfg.mode === 'custom' ? restartSame() : newTest()));

  const onKey = (e) => {
    if (e.key === 'Tab') {
      if (document.activeElement === customTa) return;
      e.preventDefault();
      if (cfg.mode === 'custom' && current?.mode === 'custom') restartSame();
      else newTest();
      return;
    }
    // Istalgan tugma bosilsa yozish maydoniga fokus
    const tag = document.activeElement?.tagName;
    if (!testWrap.classList.contains('hidden') && tag !== 'INPUT' && tag !== 'TEXTAREA' && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      test.focus();
    }
  };
  document.addEventListener('keydown', onKey);

  renderCfg();
  if (cfg.mode === 'custom') showCustomEditor();
  else newTest();

  return () => {
    loadSeq++;
    document.removeEventListener('keydown', onKey);
    test.destroy();
  };
}
