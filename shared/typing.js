// Frontend va backend birga ishlatadigan yozish mantiqi.
// Bu yerdagi hisob-kitob server tomonda reyting uchun ham qo'llanadi.

// O'zbek klaviaturalarida o‘, g‘ va tutuq belgisi uchun uchraydigan barcha variantlar
const APOSTROPHE_CHARS = ["'", '`', '‘', '’', 'ʻ', 'ʼ', '´', 'ˈ', '′'];
const APOSTROPHE_SET = new Set(APOSTROPHE_CHARS);
const APOSTROPHE_RE = new RegExp(`[${APOSTROPHE_CHARS.join('')}]`, 'g');

export const LANGS = ['uz', 'en'];
export const TIME_OPTIONS = [15, 30, 60, 120];
export const WORD_OPTIONS = [10, 25, 50, 100];
export const MAX_CUSTOM_CHARS = 5000;
export const MAX_WPM = 300;

export function normalizeChar(c) {
  return APOSTROPHE_SET.has(c) ? "'" : c;
}

export function normalizeText(s) {
  return String(s ?? '').normalize('NFC').replace(APOSTROPHE_RE, "'");
}

export function charsEqual(a, b) {
  return normalizeChar(a) === normalizeChar(b);
}

/** Foydalanuvchi matnini kiritilgan tartibda so'zlarga ajratadi. */
export function splitWords(text) {
  return String(text ?? '')
    .normalize('NFC')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Natijani hisoblash.
 * @param {object} p
 * @param {string[]} p.words   test so'zlari
 * @param {string[]} p.typed   yozilgan so'zlar (oxirgisi chala bo'lishi mumkin)
 * @param {number}   p.durationMs  test davomiyligi
 * @param {number}   p.keystrokes  barcha belgi bosishlar soni (tuzatilganlari ham)
 * @param {number}   p.errors      xato bosishlar soni (keyin tuzatilganlari ham)
 */
export function computeStats({ words, typed, durationMs, keystrokes = 0, errors = 0 }) {
  const list = Array.isArray(typed) ? typed.slice(0, words.length).map((t) => String(t ?? '')) : [];
  let correctChars = 0;
  let typedChars = 0;
  let correctWords = 0;
  let wrongPresent = 0; // hozir ham noto'g'ri turgan belgilar

  for (let i = 0; i < list.length; i++) {
    const t = normalizeText(list[i]);
    const w = normalizeText(words[i]);
    const isLast = i === list.length - 1;
    typedChars += t.length + (isLast ? 0 : 1);
    if (t === w) {
      correctWords++;
      correctChars += w.length + (isLast ? 0 : 1); // to'g'ri so'zdan keyingi bo'shliq ham hisoblanadi
    } else if (isLast && w.startsWith(t)) {
      correctChars += t.length; // chala, lekin hozircha to'g'ri yozilayotgan so'z
    }
    for (let j = 0; j < t.length; j++) if (t[j] !== w[j]) wrongPresent++;
  }

  const minutes = Math.max(durationMs, 1) / 60000;
  const ks = Math.max(Number(keystrokes) || 0, typedChars);
  const errs = Math.min(Math.max(Number(errors) || 0, wrongPresent), ks);
  const accuracy = ks > 0 ? ((ks - errs) / ks) * 100 : 0;

  return {
    wpm: round2(correctChars / 5 / minutes),
    raw: round2(typedChars / 5 / minutes),
    accuracy: round2(accuracy),
    errors: errs,
    keystrokes: ks,
    correctChars,
    correctWords,
    wordsTyped: list.length,
    durationMs: Math.round(durationMs),
    completed: list.length === words.length && normalizeText(list.at(-1)) === normalizeText(words.at(-1)),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
