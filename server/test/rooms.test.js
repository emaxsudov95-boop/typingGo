import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, ack, once, pid } from './helpers.js';

let srv;
before(async () => {
  srv = await startTestServer();
});
after(async () => {
  await srv?.close();
});

test('15 kishilik xonaga 16-kishi qo‘shila olmaydi (bir vaqtda kelganda ham)', async () => {
  const owner = await srv.client();
  const created = await ack(owner, 'room:create', { playerId: pid(1), name: 'Ega' });
  assert.ok(created.ok);
  const code = created.room.code;
  assert.match(code, /^[A-Z0-9]{6}$/);
  assert.equal(created.room.count, 1);
  assert.equal(created.room.max, 15);

  // Yana 16 kishi bir vaqtning o'zida qo'shilishga urinadi — faqat 14 tasi sig'adi
  const clients = await Promise.all(Array.from({ length: 16 }, () => srv.client()));
  const results = await Promise.all(clients.map((c, i) => ack(c, 'room:join', { code, playerId: pid(i + 2), name: `O‘yinchi ${i + 2}` })));
  const ok = results.filter((r) => r.ok);
  const full = results.filter((r) => !r.ok);
  assert.equal(ok.length, 14);
  assert.equal(full.length, 2);
  for (const r of full) {
    assert.equal(r.error, 'full');
    assert.equal(r.message, 'Xona to‘lgan');
  }
  const last = ok.reduce((a, b) => (a.room.count >= b.room.count ? a : b));
  assert.equal(last.room.count, 15);

  // Yana bitta (16-) kishi alohida urinsa ham — "Xona to‘lgan"
  const late = await srv.client();
  const r16 = await ack(late, 'room:join', { code, playerId: pid(99), name: 'Kechikkan' });
  assert.equal(r16.ok, false);
  assert.equal(r16.message, 'Xona to‘lgan');

  // Sahifani yangilagan o'yinchi (o'sha playerId, yangi ulanish) o'z joyiga qaytadi va ikki marta sanalmaydi
  const joinedIdx = results.findIndex((r) => r.ok);
  clients[joinedIdx].disconnect();
  const refreshed = await srv.client();
  const back = await ack(refreshed, 'room:join', { code, playerId: pid(joinedIdx + 2), name: 'Qaytgan' });
  assert.ok(back.ok, 'qaytgan o‘yinchi kira olishi kerak');
  assert.equal(back.room.count, 15);
  assert.equal(back.room.players.filter((p) => p.id === pid(joinedIdx + 2)).length, 1);
});

test('ikki o‘yinchi: tayyor, umumiy start, jonli natija va yakuniy jadval', async () => {
  const a = await srv.client();
  const b = await srv.client();
  const created = await ack(a, 'room:create', { playerId: pid(201), name: 'Ali' });
  const code = created.room.code;
  const joined = await ack(b, 'room:join', { code, playerId: pid(202), name: 'Vali' });
  assert.ok(joined.ok);
  assert.equal(joined.room.count, 2);

  // Egasi o'z matnini qo'yadi
  const text = 'Bugun tez yozishni mashq qilaman';
  assert.ok((await ack(a, 'room:settings', { mode: 'custom', customText: text, lang: 'uz' })).ok);

  // Vali tayyor bo'lmaguncha start bo'lmaydi
  const early = await ack(a, 'room:start');
  assert.equal(early.ok, false);
  assert.ok((await ack(b, 'room:ready', { ready: true })).ok);

  const startA = once(a, 'race:start');
  const startB = once(b, 'race:start');
  assert.ok((await ack(a, 'room:start')).ok);
  const [ra, rb] = await Promise.all([startA, startB]);
  assert.deepEqual(ra.words, ['Bugun', 'tez', 'yozishni', 'mashq', 'qilaman']);
  assert.deepEqual(ra.words, rb.words, 'hammaga bir xil matn');
  assert.equal(ra.startAt, rb.startAt, 'umumiy boshlanish vaqti');
  assert.ok(ra.startAt - ra.serverNow >= 2900, '3–2–1 sanoq uchun vaqt');

  // Start vaqtigacha kutamiz
  await new Promise((r) => setTimeout(r, ra.startAt - ra.serverNow + 400));

  // Ali yozmoqda — Vali jonli natijani ko'radi
  const prog = once(b, 'race:progress');
  a.emit('race:progress', { typed: ['Bugun', 'tez', 'yo'], keystrokes: 12, errors: 0 });
  const live = await prog;
  const ali = live.find((p) => p.id === pid(201));
  assert.equal(ali.name, 'Ali');
  assert.equal(ali.wordsTyped, 2);
  assert.ok(ali.wpm > 0);

  const resultsB = once(b, 'race:results');
  await ack(a, 'race:finish', { typed: ra.words, keystrokes: 32, errors: 0 });
  await ack(b, 'race:finish', { typed: ['Bugun', 'tez', 'yozishni', 'mashk'], keystrokes: 30, errors: 2 });
  const final = await resultsB;
  assert.equal(final.length, 2);
  assert.equal(final[0].place, 1);
  assert.equal(final[0].name, 'Ali');
  assert.equal(final[0].accuracy, 100);
  assert.equal(final[1].place, 2);
  assert.ok(final[1].accuracy < 100);
});

test('mavjud bo‘lmagan xona', async () => {
  const c = await srv.client();
  const r = await ack(c, 'room:join', { code: 'ZZZZZZ', playerId: pid(300), name: 'x' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'notfound');
});
