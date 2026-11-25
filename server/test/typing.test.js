import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, splitWords, charsEqual, normalizeText } from '../../shared/typing.js';

test('o‘z matni kiritilgan tartibda so‘zlarga ajratiladi', () => {
  assert.deepEqual(splitWords('Bugun tez yozishni mashq qilaman'), ['Bugun', 'tez', 'yozishni', 'mashq', 'qilaman']);
  assert.deepEqual(splitWords('  bir\n\nikki\tuch  '), ['bir', 'ikki', 'uch']);
});

test('o‘ va g‘ uchun apostrof variantlari teng', () => {
  for (const c of ["'", '`', '‘', '’', 'ʻ', 'ʼ']) assert.ok(charsEqual(c, '‘'), `${c} teng bo‘lishi kerak`);
  assert.equal(normalizeText("o'zbek"), normalizeText('o‘zbek'));
  assert.equal(normalizeText('gʻisht'), normalizeText('g`isht'));
  const s = computeStats({ words: ['o‘zbek', 'tog‘'], typed: ["o'zbek", 'tog`'], durationMs: 60000, keystrokes: 11, errors: 0 });
  assert.equal(s.correctWords, 2);
  assert.equal(s.accuracy, 100);
});

test('WPM: 5 ta to‘g‘ri belgi = 1 so‘z', () => {
  // "hello world" = 11 belgi (bo'shliq bilan) → 60 soniyada 2.2 wpm
  const s = computeStats({ words: ['hello', 'world'], typed: ['hello', 'world'], durationMs: 60000, keystrokes: 11, errors: 0 });
  assert.equal(s.correctChars, 11);
  assert.equal(s.wpm, 2.2);
  assert.ok(s.completed);
});

test('aniqlik tuzatilgan xatolarni ham hisobga oladi', () => {
  // 10 ta bosish, ulardan 2 tasi xato bo'lib keyin tuzatilgan — yakuniy matn to'g'ri
  const s = computeStats({ words: ['salom', 'dunyo'], typed: ['salom', 'dunyo'], durationMs: 30000, keystrokes: 13, errors: 2 });
  assert.equal(s.errors, 2);
  assert.equal(s.accuracy, Math.round((11 / 13) * 10000) / 100);
});

test('mijoz xatolarni kam ko‘rsatsa ham hozirgi xato belgilar hisoblanadi', () => {
  const s = computeStats({ words: ['salom'], typed: ['salxm'], durationMs: 10000, keystrokes: 5, errors: 0 });
  assert.equal(s.errors, 1);
  assert.equal(s.correctChars, 0);
});
