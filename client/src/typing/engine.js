import { charsEqual, normalizeText, computeStats } from '../../../shared/typing.js';

const MAX_EXTRA = 12;

/**
 * Yozish maydoni: so'zlarni chizadi, klaviaturani o'qiydi, statistikani yuritadi.
 *
 * opts:
 *  - mode: 'time' | 'words' | 'custom'
 *  - timeLimit: soniya (faqat 'time')
 *  - startAt: umumiy boshlanish vaqti (ms, mahalliy soat) — poygalar uchun. Bo'lmasa birinchi harfda boshlanadi.
 *  - onStart, onTick(state), onProgress(state), onFinish(result)
 */
export class TypingTest {
  constructor(root, opts = {}) {
    this.root = root;
    this.opts = opts;
    this.words = [];
    this.typed = [''];
    this.cur = 0;
    this.keystrokes = 0;
    this.errors = 0;
    this.startedAt = 0;
    this.finished = false;
    this.timer = null;
    this.progressTimer = null;
    this.wordEls = [];
    this.build();
  }

  build() {
    this.root.innerHTML = `
      <div class="tt" data-testid="typing">
        <div class="mb-2 flex h-8 items-end justify-between text-2xl text-main">
          <span class="tt-counter"></span>
          <span class="tt-live text-base text-sub"></span>
        </div>
        <div class="relative">
          <div class="tt-box">
            <div class="tt-words"></div>
          </div>
          <div class="tt-blur">Yozishni boshlash uchun shu yerni bosing</div>
          <textarea class="tt-input" rows="1" autocomplete="off" autocapitalize="off" autocorrect="off"
            spellcheck="false" inputmode="text" enterkeyhint="next" aria-label="Yozish maydoni"></textarea>
        </div>
      </div>`;
    this.el = this.root.querySelector('.tt');
    this.box = this.root.querySelector('.tt-box');
    this.wordsEl = this.root.querySelector('.tt-words');
    this.input = this.root.querySelector('.tt-input');
    this.counterEl = this.root.querySelector('.tt-counter');
    this.liveEl = this.root.querySelector('.tt-live');
    this.caret = document.createElement('div');
    this.caret.className = 'tt-caret blink';

    this.onInput = this.onInput.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.input.addEventListener('input', this.onInput);
    this.input.addEventListener('keydown', this.onKeyDown);
    this.input.addEventListener('focus', () => this.el.classList.add('focused'));
    this.input.addEventListener('blur', () => this.el.classList.remove('focused'));
    this.input.addEventListener('paste', (e) => e.preventDefault());
    this.resizeObs = new ResizeObserver(() => this.updateCaret(false));
    this.resizeObs.observe(this.box);
  }

  /** Yangi matnni yuklash */
  load(words, opts = {}) {
    Object.assign(this.opts, opts);
    this.stopTimers();
    this.words = words.slice();
    this.typed = [''];
    this.cur = 0;
    this.keystrokes = 0;
    this.errors = 0;
    this.startedAt = this.opts.startAt || 0;
    this.finished = false;
    this.input.value = '';
    this.renderAll();
    this.updateCounter();
    this.el.classList.toggle('locked', !!this.opts.startAt);
    if (this.opts.startAt) this.startTimers();
  }

  /** Poygada sahifa yangilanganda avvalgi holatni tiklash */
  restore({ typed = [], keystrokes = 0, errors = 0 }) {
    if (!typed.length) return;
    this.typed = typed.slice(0, this.words.length);
    this.cur = this.typed.length - 1;
    this.keystrokes = keystrokes;
    this.errors = errors;
    this.typed.forEach((_, i) => this.renderWord(i));
    this.input.value = this.typed[this.cur];
    this.updateCaret(false);
    this.updateCounter();
  }

  focus() {
    this.input.focus({ preventScroll: true });
  }

  destroy() {
    this.stopTimers();
    this.resizeObs.disconnect();
    this.root.innerHTML = '';
  }

  // ---------- Chizish ----------
  renderAll() {
    const frag = document.createDocumentFragment();
    this.wordEls = this.words.map((w) => {
      const el = document.createElement('div');
      el.className = 'tt-word';
      for (const ch of w) {
        const s = document.createElement('span');
        s.className = 'tt-l';
        s.textContent = ch;
        el.appendChild(s);
      }
      frag.appendChild(el);
      return el;
    });
    this.wordsEl.replaceChildren(frag, this.caret);
    this.wordsEl.style.transform = 'translateY(0)';
    requestAnimationFrame(() => this.updateCaret(false));
  }

  renderWord(i) {
    const el = this.wordEls[i];
    if (!el) return;
    const w = this.words[i];
    const t = this.typed[i] ?? '';
    const wChars = [...w];
    const tChars = [...t];
    const letters = el.children;
    // Ortiqcha harflarni olib tashlab, qaytadan qo'shamiz
    while (letters.length > wChars.length) el.removeChild(el.lastChild);
    for (let j = 0; j < wChars.length; j++) {
      const s = letters[j];
      s.className = j < tChars.length ? (charsEqual(tChars[j], wChars[j]) ? 'tt-l ok' : 'tt-l bad') : 'tt-l';
    }
    for (let j = wChars.length; j < tChars.length; j++) {
      const s = document.createElement('span');
      s.className = 'tt-l extra';
      s.textContent = tChars[j];
      el.appendChild(s);
    }
    const committed = i < this.cur;
    el.classList.toggle('err', committed && normalizeText(t) !== normalizeText(w));
  }

  updateCaret(animate = true) {
    const word = this.wordEls[this.cur];
    if (!word) return;
    const idx = [...(this.typed[this.cur] ?? '')].length;
    const letters = word.children;
    // Harflarning offsetParent'i ham .tt-words (position: relative), shuning uchun to'g'ridan-to'g'ri olinadi
    let left;
    if (idx < letters.length) left = letters[idx].offsetLeft;
    else if (letters.length) {
      const last = letters[letters.length - 1];
      left = last.offsetLeft + last.offsetWidth;
    } else left = word.offsetLeft;
    const top = word.offsetTop;
    this.caret.style.transition = animate ? '' : 'none';
    this.caret.style.left = `${left}px`;
    this.caret.style.top = `${top}px`;

    // Joriy qator har doim ikkinchi qatorda turadi — matn silliq yuqoriga siljiydi
    const lineH = word.offsetHeight || 1;
    const line = Math.round(top / lineH);
    this.wordsEl.style.transform = `translateY(${-Math.max(0, line - 1) * lineH}px)`;
  }

  // ---------- Kiritish ----------
  canType() {
    if (this.finished || !this.words.length) return false;
    if (this.opts.startAt && Date.now() < this.opts.startAt) return false;
    return true;
  }

  onKeyDown(e) {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      if (e.key === 'Enter' && this.canType()) this.space();
      return;
    }
    if (e.key === 'Backspace' && this.input.value === '' && this.cur > 0 && this.canType()) {
      // Oldingi so'zga faqat u xato bo'lsa qaytish mumkin
      const prev = this.cur - 1;
      if (normalizeText(this.typed[prev]) !== normalizeText(this.words[prev])) {
        e.preventDefault();
        this.typed.pop();
        this.cur = prev;
        const t = e.ctrlKey || e.altKey ? '' : this.typed[prev];
        this.typed[prev] = t;
        this.input.value = t;
        this.renderWord(prev);
        this.renderWord(prev + 1);
        this.updateCaret();
        this.emitProgress();
      }
    }
  }

  onInput() {
    if (!this.canType()) {
      this.input.value = this.typed[this.cur] ?? '';
      return;
    }
    const prev = this.typed[this.cur];
    const v = this.input.value;
    let p = 0;
    while (p < prev.length && p < v.length && prev[p] === v[p]) p++;
    // O'chirilgan qism (Backspace / Ctrl+Backspace)
    if (p < prev.length) {
      this.typed[this.cur] = prev.slice(0, p);
      this.renderWord(this.cur);
    }
    // Qo'shilgan belgilar
    for (const ch of v.slice(p)) {
      if (this.finished) break;
      if (/\s/.test(ch)) this.space();
      else this.addChar(ch);
    }
    if (!this.finished) this.input.value = this.typed[this.cur];
    this.updateCaret();
    this.updateCounter();
  }

  ensureStarted() {
    if (this.startedAt) return;
    this.startedAt = Date.now();
    this.startTimers();
    this.opts.onStart?.();
  }

  addChar(ch) {
    const w = [...this.words[this.cur]];
    const t = this.typed[this.cur];
    const pos = [...t].length;
    if (pos >= w.length + MAX_EXTRA) return;
    this.ensureStarted();
    this.keystrokes++;
    if (pos >= w.length || !charsEqual(ch, w[pos])) this.errors++;
    this.typed[this.cur] = t + ch;
    this.renderWord(this.cur);
    this.caret.classList.remove('blink');
    // So'z/o'z matni rejimida oxirgi so'z to'g'ri yozilsa test tugaydi
    const last = this.cur === this.words.length - 1;
    if (last && this.opts.mode !== 'time' && normalizeText(this.typed[this.cur]) === normalizeText(this.words[this.cur])) {
      this.finish();
    }
  }

  space() {
    const t = this.typed[this.cur];
    if (!t) return; // bo'sh so'zda bo'shliq e'tiborsiz
    this.ensureStarted();
    this.keystrokes++;
    if ([...t].length < [...this.words[this.cur]].length) this.errors++; // tashlab ketilgan harflar
    if (this.cur === this.words.length - 1) {
      this.finish();
      return;
    }
    this.cur++;
    this.typed.push('');
    this.renderWord(this.cur - 1);
    this.emitProgress();
  }

  // ---------- Vaqt va natija ----------
  elapsed() {
    return this.startedAt ? Math.max(0, Date.now() - this.startedAt) : 0;
  }

  startTimers() {
    this.stopTimers();
    this.timer = setInterval(() => this.tick(), 100);
    this.progressTimer = setInterval(() => this.emitProgress(), 600);
  }

  stopTimers() {
    clearInterval(this.timer);
    clearInterval(this.progressTimer);
    this.timer = this.progressTimer = null;
  }

  tick() {
    if (this.finished) return;
    const locked = this.opts.startAt && Date.now() < this.opts.startAt;
    this.el.classList.toggle('locked', !!locked);
    if (!locked && this.opts.startAt && document.activeElement !== this.input) this.focus();
    if (this.opts.mode === 'time' && this.elapsed() >= this.opts.timeLimit * 1000) {
      this.finish();
      return;
    }
    this.updateCounter();
  }

  updateCounter() {
    if (this.opts.mode === 'time') {
      const left = this.startedAt ? Math.max(0, Math.ceil(this.opts.timeLimit - this.elapsed() / 1000)) : this.opts.timeLimit;
      this.counterEl.textContent = String(left);
    } else {
      const done = Math.min(this.cur, this.words.length);
      this.counterEl.textContent = `${done}/${this.words.length}`;
    }
    if (this.startedAt && Date.now() >= this.startedAt && !this.finished) {
      this.liveEl.textContent = `${Math.round(this.stats().wpm)} wpm`;
    } else this.liveEl.textContent = '';
  }

  typedList() {
    const list = this.typed.slice(0, this.cur + 1);
    while (list.length && list[list.length - 1] === '') list.pop();
    return list;
  }

  stats() {
    let durationMs = this.elapsed();
    if (this.opts.mode === 'time') durationMs = Math.min(durationMs, this.opts.timeLimit * 1000);
    return computeStats({
      words: this.words,
      typed: this.typedList(),
      durationMs: Math.max(durationMs, 1),
      keystrokes: this.keystrokes,
      errors: this.errors,
    });
  }

  state() {
    return { typed: this.typedList(), keystrokes: this.keystrokes, errors: this.errors };
  }

  emitProgress() {
    if (!this.startedAt || this.finished) return;
    this.opts.onProgress?.({ ...this.state(), stats: this.stats() });
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.stopTimers();
    this.input.blur();
    const stats = this.stats();
    this.renderWord(this.cur);
    this.updateCounter();
    this.opts.onFinish?.({ ...this.state(), durationMs: stats.durationMs, stats });
  }
}
