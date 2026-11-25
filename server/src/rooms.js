import crypto from 'node:crypto';
import { generateWords, wordsForDuration } from '../../shared/words.js';
import {
  computeStats,
  splitWords,
  LANGS,
  TIME_OPTIONS,
  WORD_OPTIONS,
  MAX_CUSTOM_CHARS,
} from '../../shared/typing.js';

export const MAX_PLAYERS = 15;
const COUNTDOWN_MS = 3000;
const DISCONNECT_GRACE_MS = 60_000;
const WORDS_RACE_MAX_MS = 10 * 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return s;
}

function cleanName(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return n || `Mehmon-${crypto.randomInt(1000, 9999)}`;
}

function validPlayerId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(id);
}

/**
 * Jonli xonalar. Holat server xotirasida saqlanadi.
 * Qo'shilish tekshiruvi va yozish bitta sinxron qadamda bajariladi,
 * shu sabab bir vaqtda kelgan so'rovlar ham 15 kishilik limitdan oshirolmaydi.
 */
export function attachRooms(io, auth) {
  const rooms = new Map();

  const snapshot = (room) => ({
    code: room.code,
    ownerId: room.ownerId,
    state: room.state,
    settings: room.settings,
    max: MAX_PLAYERS,
    count: room.players.size,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      connected: p.connected,
      registered: !!p.userId,
    })),
  });

  const raceInfo = (room) =>
    room.state === 'countdown' || room.state === 'racing'
      ? { words: room.words, startAt: room.startAt, settings: room.settings }
      : null;

  const broadcastState = (room) => io.to(room.code).emit('room:state', snapshot(room));

  const liveStats = (room, p, now = Date.now()) => {
    const elapsed =
      room.settings.mode === 'time'
        ? Math.min(now - room.startAt, room.settings.amount * 1000)
        : p.finishedAt
          ? p.finishedAt - room.startAt
          : now - room.startAt;
    return computeStats({
      words: room.words,
      typed: p.typed,
      durationMs: Math.max(elapsed, 1000),
      keystrokes: p.keystrokes,
      errors: p.errors,
    });
  };

  const progressPayload = (room) =>
    [...room.players.values()].map((p) => {
      const s = room.startAt && Date.now() >= room.startAt ? liveStats(room, p) : null;
      return {
        id: p.id,
        name: p.name,
        wordsTyped: s ? s.correctWords : 0,
        wpm: s ? Math.round(s.wpm) : 0,
        progress: room.words.length ? Math.min(1, (s ? s.correctWords : 0) / room.words.length) : 0,
        finished: !!p.finishedAt,
        connected: p.connected,
      };
    });

  const scheduleProgress = (room) => {
    if (room.progressTimer) return;
    room.progressTimer = setTimeout(() => {
      room.progressTimer = null;
      if (room.state === 'racing') io.to(room.code).emit('race:progress', progressPayload(room));
    }, 250);
  };

  const finishRace = (room) => {
    if (room.state !== 'racing' && room.state !== 'countdown') return;
    clearTimeout(room.endTimer);
    clearTimeout(room.progressTimer);
    room.progressTimer = null;
    room.state = 'finished';
    const now = Date.now();
    const results = [...room.players.values()]
      .map((p) => {
        const s = liveStats(room, p, p.finishedAt || now);
        return {
          id: p.id,
          name: p.name,
          wpm: s.wpm,
          accuracy: s.accuracy,
          errors: s.errors,
          wordsTyped: s.correctWords,
          completed: room.settings.mode === 'time' ? true : s.completed,
          durationMs: s.durationMs,
        };
      })
      .sort((a, b) => Number(b.completed) - Number(a.completed) || b.wpm - a.wpm || b.accuracy - a.accuracy)
      .map((r, i) => ({ ...r, place: i + 1 }));
    room.results = results;
    io.to(room.code).emit('race:results', results);
    broadcastState(room);
  };

  const maybeFinish = (room) => {
    if (room.state !== 'racing') return;
    const active = [...room.players.values()].filter((p) => p.connected);
    if (active.length && active.every((p) => p.finishedAt)) finishRace(room);
  };

  const removePlayer = (room, playerId) => {
    const p = room.players.get(playerId);
    if (!p) return;
    clearTimeout(p.leaveTimer);
    room.players.delete(playerId);
    if (!room.players.size) {
      clearTimeout(room.endTimer);
      clearTimeout(room.progressTimer);
      rooms.delete(room.code);
      return;
    }
    if (room.ownerId === playerId) {
      const next = [...room.players.values()].find((x) => x.connected) || room.players.values().next().value;
      room.ownerId = next.id;
    }
    maybeFinish(room);
    broadcastState(room);
  };

  const joinRoom = (socket, room, { playerId, name }) => {
    let p = room.players.get(playerId);
    if (!p) {
      // Limit tekshiruvi va qo'shish orasida await yo'q — bu atom amal
      if (room.players.size >= MAX_PLAYERS) return { ok: false, error: 'full', message: 'Xona to‘lgan' };
      p = {
        id: playerId,
        name: socket.data.user?.username || cleanName(name),
        userId: socket.data.user?.id || null,
        ready: false,
        connected: true,
        socketId: socket.id,
        typed: [],
        keystrokes: 0,
        errors: 0,
        finishedAt: null,
        leaveTimer: null,
      };
      room.players.set(playerId, p);
    } else {
      // Sahifani yangilagan o'yinchi o'z joyiga qaytadi
      clearTimeout(p.leaveTimer);
      p.leaveTimer = null;
      p.connected = true;
      p.socketId = socket.id;
      if (socket.data.user?.username) p.name = socket.data.user.username;
    }

    if (socket.data.code && socket.data.code !== room.code) leaveCurrent(socket);
    socket.data.code = room.code;
    socket.data.playerId = playerId;
    socket.join(room.code);
    broadcastState(room);

    return {
      ok: true,
      room: snapshot(room),
      you: playerId,
      race: raceInfo(room),
      mine: room.state === 'racing' || room.state === 'countdown'
        ? { typed: p.typed, keystrokes: p.keystrokes, errors: p.errors, finished: !!p.finishedAt }
        : null,
      results: room.state === 'finished' ? room.results : null,
      progress: room.state === 'racing' ? progressPayload(room) : null,
      serverNow: Date.now(),
    };
  };

  const leaveCurrent = (socket) => {
    const room = rooms.get(socket.data.code);
    if (room) removePlayer(room, socket.data.playerId);
    socket.leave(socket.data.code);
    socket.data.code = null;
  };

  const ctx = (socket) => {
    const room = rooms.get(socket.data.code);
    const p = room?.players.get(socket.data.playerId);
    return room && p && p.socketId === socket.id ? { room, p } : null;
  };

  const reply = (ack, payload) => typeof ack === 'function' && ack(payload);

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    socket.data.user = token ? auth.verify(token) : null;
    next();
  });

  io.on('connection', (socket) => {
    socket.on('room:create', (data = {}, ack) => {
      if (!validPlayerId(data.playerId)) return reply(ack, { ok: false, error: 'bad', message: 'Noto‘g‘ri so‘rov' });
      let code;
      do code = makeCode();
      while (rooms.has(code));
      const room = {
        code,
        ownerId: data.playerId,
        state: 'lobby',
        settings: { lang: 'uz', mode: 'time', amount: 30, customText: '' },
        players: new Map(),
        words: [],
        startAt: 0,
        results: null,
        endTimer: null,
        progressTimer: null,
        createdAt: Date.now(),
      };
      rooms.set(code, room);
      reply(ack, joinRoom(socket, room, data));
    });

    socket.on('room:join', (data = {}, ack) => {
      if (!validPlayerId(data.playerId)) return reply(ack, { ok: false, error: 'bad', message: 'Noto‘g‘ri so‘rov' });
      const room = rooms.get(String(data.code || '').toUpperCase());
      if (!room) return reply(ack, { ok: false, error: 'notfound', message: 'Xona topilmadi' });
      reply(ack, joinRoom(socket, room, data));
    });

    socket.on('room:leave', (_d, ack) => {
      if (socket.data.code) leaveCurrent(socket);
      reply(ack, { ok: true });
    });

    socket.on('room:settings', (data = {}, ack) => {
      const c = ctx(socket);
      if (!c || c.room.ownerId !== c.p.id) return reply(ack, { ok: false, message: 'Faqat xona egasi o‘zgartira oladi' });
      if (c.room.state !== 'lobby' && c.room.state !== 'finished')
        return reply(ack, { ok: false, message: 'Poyga davomida o‘zgartirib bo‘lmaydi' });
      const s = { ...c.room.settings };
      if (data.mode === 'custom') {
        s.mode = 'custom';
        s.customText = String(data.customText || '').slice(0, MAX_CUSTOM_CHARS);
        s.amount = splitWords(s.customText).length;
      } else {
        s.mode = data.mode === 'words' ? 'words' : 'time';
        const allowed = s.mode === 'time' ? TIME_OPTIONS : WORD_OPTIONS;
        s.amount = allowed.includes(Number(data.amount)) ? Number(data.amount) : allowed[1];
        s.customText = '';
      }
      if (LANGS.includes(data.lang)) s.lang = data.lang;
      c.room.settings = s;
      broadcastState(c.room);
      reply(ack, { ok: true });
    });

    socket.on('room:ready', (data = {}, ack) => {
      const c = ctx(socket);
      if (!c) return reply(ack, { ok: false });
      c.p.ready = !!data.ready;
      broadcastState(c.room);
      reply(ack, { ok: true });
    });

    socket.on('room:start', (_d, ack) => {
      const c = ctx(socket);
      if (!c || c.room.ownerId !== c.p.id) return reply(ack, { ok: false, message: 'Faqat xona egasi boshlay oladi' });
      const { room } = c;
      if (room.state !== 'lobby' && room.state !== 'finished') return reply(ack, { ok: false, message: 'Poyga allaqachon boshlangan' });
      const notReady = [...room.players.values()].filter((p) => p.connected && p.id !== room.ownerId && !p.ready);
      if (notReady.length) return reply(ack, { ok: false, message: `Hamma tayyor emas (${notReady.length} kishi)` });

      const s = room.settings;
      let words;
      if (s.mode === 'custom') {
        words = splitWords(s.customText);
        if (!words.length) return reply(ack, { ok: false, message: 'Avval matn kiriting' });
      } else {
        words = generateWords(s.lang, s.mode === 'time' ? wordsForDuration(s.amount) : s.amount);
      }
      room.words = words;
      room.state = 'countdown';
      room.results = null;
      room.startAt = Date.now() + COUNTDOWN_MS;
      for (const p of room.players.values()) {
        p.typed = [];
        p.keystrokes = 0;
        p.errors = 0;
        p.finishedAt = null;
      }
      // Barchaga bir xil matn va umumiy boshlanish vaqti
      io.to(room.code).emit('race:start', { words, startAt: room.startAt, serverNow: Date.now(), settings: s });
      broadcastState(room);

      clearTimeout(room.endTimer);
      room.endTimer = setTimeout(() => {
        room.state = 'racing';
        broadcastState(room);
        const limit = s.mode === 'time' ? s.amount * 1000 + 1500 : WORDS_RACE_MAX_MS;
        room.endTimer = setTimeout(() => finishRace(room), limit);
        room.endTimer.unref?.();
      }, COUNTDOWN_MS);
      room.endTimer.unref?.();
      reply(ack, { ok: true });
    });

    socket.on('race:progress', (data = {}) => {
      const c = ctx(socket);
      if (!c || c.room.state !== 'racing' || c.p.finishedAt) return;
      const typed = Array.isArray(data.typed) ? data.typed.slice(0, c.room.words.length).map((t) => String(t ?? '').slice(0, 60)) : null;
      if (!typed) return;
      c.p.typed = typed;
      c.p.keystrokes = Math.max(0, Math.floor(Number(data.keystrokes) || 0));
      c.p.errors = Math.max(0, Math.floor(Number(data.errors) || 0));
      scheduleProgress(c.room);
    });

    socket.on('race:finish', (data = {}, ack) => {
      const c = ctx(socket);
      if (!c || c.room.state !== 'racing' || c.p.finishedAt) return reply(ack, { ok: false });
      if (Array.isArray(data.typed)) c.p.typed = data.typed.slice(0, c.room.words.length).map((t) => String(t ?? '').slice(0, 60));
      c.p.keystrokes = Math.max(0, Math.floor(Number(data.keystrokes) || 0));
      c.p.errors = Math.max(0, Math.floor(Number(data.errors) || 0));
      const limitAt = c.room.settings.mode === 'time' ? c.room.startAt + c.room.settings.amount * 1000 : Infinity;
      c.p.finishedAt = Math.min(Date.now(), limitAt);
      io.to(c.room.code).emit('race:progress', progressPayload(c.room));
      maybeFinish(c.room);
      reply(ack, { ok: true });
    });

    socket.on('room:reset', (_d, ack) => {
      const c = ctx(socket);
      if (!c || c.room.ownerId !== c.p.id) return reply(ack, { ok: false });
      if (c.room.state !== 'finished') return reply(ack, { ok: false });
      c.room.state = 'lobby';
      c.room.results = null;
      for (const p of c.room.players.values()) p.ready = false;
      broadcastState(c.room);
      reply(ack, { ok: true });
    });

    socket.on('disconnect', () => {
      const room = rooms.get(socket.data.code);
      const p = room?.players.get(socket.data.playerId);
      if (!room || !p || p.socketId !== socket.id) return;
      p.connected = false;
      // Joy biroz vaqt saqlanadi — sahifani yangilagan o'yinchi qaytib keladi
      p.leaveTimer = setTimeout(() => removePlayer(room, p.id), DISCONNECT_GRACE_MS);
      p.leaveTimer.unref?.();
      maybeFinish(room);
      broadcastState(room);
    });
  });

  return { rooms };
}
