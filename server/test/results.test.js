import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { TestSession } from '../src/models.js';
import { startTestServer } from './helpers.js';

let srv;
before(async () => {
  srv = await startTestServer();
});
after(async () => {
  await srv?.close();
});

// Vaqtli testni kutmaslik uchun test yaratilgan vaqtni orqaga suramiz
const backdate = (testId, seconds) =>
  TestSession.updateOne({ _id: testId }, { $set: { createdAt: new Date(Date.now() - seconds * 1000) } });

test('akkaunt, natija saqlash, profil va reyting', async () => {
  // Bo'sh reyting
  const empty = await srv.request('GET', '/leaderboard?lang=uz&duration=15');
  assert.equal(empty.status, 200);
  assert.equal(empty.data.rows.length, 0);

  const reg = await srv.request('POST', '/auth/register', { username: 'aziz_01', email: 'Aziz@Example.com', password: 'parol123' });
  assert.equal(reg.status, 201);
  const token = reg.data.token;
  assert.equal(reg.data.user.email, 'aziz@example.com');

  const dup = await srv.request('POST', '/auth/register', { username: 'AZIZ_01', email: 'b@example.com', password: 'parol123' });
  assert.equal(dup.status, 409);

  const badLogin = await srv.request('POST', '/auth/login', { login: 'aziz_01', password: 'xato' });
  assert.equal(badLogin.status, 401);
  const login = await srv.request('POST', '/auth/login', { login: 'aziz@example.com', password: 'parol123' });
  assert.equal(login.status, 200);

  // Server yaratgan 15 soniyalik test
  const t = await srv.request('POST', '/tests', { lang: 'uz', mode: 'time', amount: 15 }, token);
  assert.equal(t.status, 201);
  assert.ok(t.data.words.length >= 75);

  // Vaqt tugamasdan yuborib bo'lmaydi
  const tooEarly = await srv.request('POST', '/results', { testId: t.data.testId, typed: t.data.words.slice(0, 3), keystrokes: 20, errors: 0 }, token);
  assert.equal(tooEarly.status, 400);

  await backdate(t.data.testId, 16);
  const typed = t.data.words.slice(0, 20);
  const chars = typed.join(' ').length;
  const body = { testId: t.data.testId, typed, keystrokes: chars + 3, errors: 3 };
  const sub = await srv.request('POST', '/results', body, token);
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  assert.equal(sub.data.saved, true);
  assert.equal(sub.data.leaderboard, true);
  const expectedWpm = Math.round((chars / 5 / 0.25) * 100) / 100;
  assert.equal(sub.data.stats.wpm, expectedWpm, 'WPM serverda test matni va vaqt asosida hisoblanadi');

  // Takroriy yuborish natijani ikkinchi marta yozmaydi
  const again = await srv.request('POST', '/results', body, token);
  assert.equal(again.status, 409);

  // Profil
  const prof = await srv.request('GET', '/profile/me', null, token);
  assert.equal(prof.status, 200);
  assert.equal(prof.data.stats.tests, 1);
  assert.equal(prof.data.stats.bestWpm, expectedWpm);
  assert.equal(prof.data.user.email, 'aziz@example.com');
  assert.equal(prof.data.recent.length, 1);
  assert.ok(prof.data.personalBests.some((p) => p.mode === 'time' && p.amount === 15 && p.wpm === expectedWpm));

  // Ommaviy profilda email ko'rinmaydi
  const pub = await srv.request('GET', '/profile/aziz_01');
  assert.equal(pub.status, 200);
  assert.equal(pub.data.user.email, undefined);

  // Reyting: tegishli toifada bor, boshqasida yo'q
  const lb = await srv.request('GET', '/leaderboard?lang=uz&duration=15', null, token);
  assert.equal(lb.data.rows.length, 1);
  assert.equal(lb.data.rows[0].username, 'aziz_01');
  assert.equal(lb.data.rows[0].wpm, expectedWpm);
  assert.equal(lb.data.me.rank, 1);
  const other = await srv.request('GET', '/leaderboard?lang=en&duration=15');
  assert.equal(other.data.rows.length, 0);

  // Ikkinchi, yomonroq natija — reytingda baribir bitta qator (eng yaxshisi)
  const t2 = await srv.request('POST', '/tests', { lang: 'uz', mode: 'time', amount: 15 }, token);
  await backdate(t2.data.testId, 16);
  await srv.request('POST', '/results', { testId: t2.data.testId, typed: t2.data.words.slice(0, 5), keystrokes: 40, errors: 1 }, token);
  const lb2 = await srv.request('GET', '/leaderboard?lang=uz&duration=15');
  assert.equal(lb2.data.rows.length, 1);
  assert.equal(lb2.data.rows[0].wpm, expectedWpm);
});

test('o‘z matnim natijasi shaxsiy tarixga tushadi, reytingga emas', async () => {
  const reg = await srv.request('POST', '/auth/register', { username: 'malika', email: 'malika@example.com', password: 'parol123' });
  const token = reg.data.token;
  const text = 'Bugun tez yozishni mashq qilaman';
  const body = { text, typed: text.split(' '), keystrokes: text.length, errors: 0, durationMs: 8000, clientId: 'abcdef12-3456' };
  const r = await srv.request('POST', '/results/custom', body, token);
  assert.equal(r.status, 200);
  assert.equal(r.data.saved, true);
  assert.equal(r.data.stats.accuracy, 100);
  assert.equal((await srv.request('POST', '/results/custom', body, token)).status, 409);

  const prof = await srv.request('GET', '/profile/me', null, token);
  assert.equal(prof.data.stats.tests, 1);
  assert.equal(prof.data.recent[0].mode, 'custom');
  for (const d of [15, 30, 60, 120]) {
    const lb = await srv.request('GET', `/leaderboard?lang=uz&duration=${d}`);
    assert.ok(!lb.data.rows.some((x) => x.username === 'malika'));
  }
});

test('mehmon testni topshira oladi, lekin natija saqlanmaydi', async () => {
  const t = await srv.request('POST', '/tests', { lang: 'en', mode: 'words', amount: 10 });
  await backdate(t.data.testId, 5);
  const r = await srv.request('POST', '/results', { testId: t.data.testId, typed: t.data.words, keystrokes: 60, errors: 0, durationMs: 4000 });
  assert.equal(r.status, 200);
  assert.equal(r.data.saved, false);
  assert.ok(r.data.stats.wpm > 0);
});
