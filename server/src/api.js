import express from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, TestSession, Result } from './models.js';
import { generateWords, wordsForDuration } from '../../shared/words.js';
import {
  computeStats,
  splitWords,
  LANGS,
  TIME_OPTIONS,
  WORD_OPTIONS,
  MAX_CUSTOM_CHARS,
  MAX_WPM,
} from '../../shared/typing.js';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_TYPED_WORDS = 1000;

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function publicUser(u, { withEmail = false } = {}) {
  const out = { id: String(u._id), username: u.username, createdAt: u.createdAt };
  if (withEmail) out.email = u.email;
  return out;
}

function publicResult(r) {
  return {
    id: String(r._id),
    lang: r.lang,
    mode: r.mode,
    amount: r.amount,
    wpm: r.wpm,
    raw: r.raw,
    accuracy: r.accuracy,
    errors: r.errorCount,
    durationMs: r.durationMs,
    leaderboard: r.leaderboard,
    createdAt: r.createdAt,
  };
}

function sanitizeTyped(typed) {
  if (!Array.isArray(typed)) return null;
  return typed.slice(0, MAX_TYPED_WORDS).map((t) => String(t ?? '').slice(0, 60));
}

function toInt(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function createApiRouter(auth) {
  const r = express.Router();

  r.get('/health', (_req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 });
  });

  // ---------- Akkaunt ----------
  r.post(
    '/auth/register',
    wrap(async (req, res) => {
      const username = String(req.body?.username || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      if (!USERNAME_RE.test(username))
        return res.status(400).json({ error: 'Username 3–20 ta lotin harfi, raqam yoki _ dan iborat bo‘lsin' });
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email noto‘g‘ri' });
      if (password.length < 6) return res.status(400).json({ error: 'Parol kamida 6 ta belgidan iborat bo‘lsin' });

      if (await User.exists({ usernameLower: username.toLowerCase() }))
        return res.status(409).json({ error: 'Bu username band' });
      if (await User.exists({ email })) return res.status(409).json({ error: 'Bu email bilan akkaunt mavjud' });

      const passwordHash = await bcrypt.hash(password, 10);
      try {
        const user = await User.create({ username, usernameLower: username.toLowerCase(), email, passwordHash });
        res.status(201).json({ token: auth.sign(user), user: publicUser(user, { withEmail: true }) });
      } catch (err) {
        if (err?.code === 11000) return res.status(409).json({ error: 'Username yoki email band' });
        throw err;
      }
    })
  );

  r.post(
    '/auth/login',
    wrap(async (req, res) => {
      const login = String(req.body?.login || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const user = await User.findOne(login.includes('@') ? { email: login } : { usernameLower: login });
      if (!user || !(await bcrypt.compare(password, user.passwordHash)))
        return res.status(401).json({ error: 'Login yoki parol noto‘g‘ri' });
      res.json({ token: auth.sign(user), user: publicUser(user, { withEmail: true }) });
    })
  );

  r.get(
    '/auth/me',
    auth.requireAuth,
    wrap(async (req, res) => {
      const user = await User.findById(req.user.id);
      if (!user) return res.status(401).json({ error: 'Akkaunt topilmadi' });
      res.json({ user: publicUser(user, { withEmail: true }) });
    })
  );

  // ---------- Testlar ----------
  r.post(
    '/tests',
    wrap(async (req, res) => {
      const lang = LANGS.includes(req.body?.lang) ? req.body.lang : 'uz';
      const mode = req.body?.mode === 'words' ? 'words' : 'time';
      const amount = Number(req.body?.amount);
      const allowed = mode === 'time' ? TIME_OPTIONS : WORD_OPTIONS;
      if (!allowed.includes(amount)) return res.status(400).json({ error: 'Test parametri noto‘g‘ri' });
      const words = generateWords(lang, mode === 'time' ? wordsForDuration(amount) : amount);
      const s = await TestSession.create({ lang, mode, amount, words });
      res.status(201).json({ testId: String(s._id), lang, mode, amount, words });
    })
  );

  // Server yaratgan testni topshirish (vaqt va so'z rejimlari)
  r.post(
    '/results',
    auth.optionalAuth,
    wrap(async (req, res) => {
      const { testId } = req.body || {};
      const typed = sanitizeTyped(req.body?.typed);
      if (!mongoose.isValidObjectId(testId) || !typed) return res.status(400).json({ error: 'Ma’lumot noto‘g‘ri' });

      const existing = await TestSession.findById(testId).lean();
      if (!existing) return res.status(404).json({ error: 'Test topilmadi yoki muddati o‘tgan' });

      const elapsedMs = Date.now() - new Date(existing.createdAt).getTime();
      let durationMs;
      if (existing.mode === 'time') {
        durationMs = existing.amount * 1000;
        if (elapsedMs < durationMs - 1000) return res.status(400).json({ error: 'Test hali tugamagan' });
      } else {
        durationMs = Number(req.body?.durationMs);
        if (!Number.isFinite(durationMs) || durationMs < 500 || durationMs > elapsedMs + 1000)
          return res.status(400).json({ error: 'Test vaqti noto‘g‘ri' });
      }

      // Atom holatda "topshirildi" deb belgilaymiz: bitta test faqat bir marta qabul qilinadi
      const session = await TestSession.findOneAndUpdate(
        { _id: testId, submitted: false },
        { $set: { submitted: true } },
        { returnDocument: 'after' }
      ).lean();
      if (!session) return res.status(409).json({ error: 'Bu test natijasi allaqachon yuborilgan', duplicate: true });

      const stats = computeStats({
        words: session.words,
        typed,
        durationMs,
        keystrokes: toInt(req.body?.keystrokes),
        errors: toInt(req.body?.errors),
      });

      let saved = false;
      let leaderboard = false;
      if (req.user) {
        leaderboard = session.mode === 'time' && stats.wpm <= MAX_WPM && stats.wordsTyped > 0;
        try {
          await Result.create({
            user: req.user.id,
            submissionId: `test:${testId}`,
            lang: session.lang,
            mode: session.mode,
            amount: session.amount,
            wpm: stats.wpm,
            raw: stats.raw,
            accuracy: stats.accuracy,
            errorCount: stats.errors,
            correctChars: stats.correctChars,
            durationMs: stats.durationMs,
            leaderboard,
          });
          saved = true;
        } catch (err) {
          if (err?.code === 11000) return res.status(409).json({ error: 'Natija allaqachon saqlangan', duplicate: true });
          throw err;
        }
      }
      res.json({ stats, saved, leaderboard });
    })
  );

  // O'z matnim natijasi — faqat shaxsiy tarixga
  r.post(
    '/results/custom',
    auth.optionalAuth,
    wrap(async (req, res) => {
      const text = String(req.body?.text || '').slice(0, MAX_CUSTOM_CHARS);
      const words = splitWords(text);
      const typed = sanitizeTyped(req.body?.typed);
      const durationMs = Number(req.body?.durationMs);
      const clientId = String(req.body?.clientId || '');
      if (!words.length || !typed || !/^[a-zA-Z0-9-]{8,64}$/.test(clientId))
        return res.status(400).json({ error: 'Ma’lumot noto‘g‘ri' });
      if (!Number.isFinite(durationMs) || durationMs < 300 || durationMs > 60 * 60 * 1000)
        return res.status(400).json({ error: 'Test vaqti noto‘g‘ri' });

      const stats = computeStats({
        words,
        typed,
        durationMs,
        keystrokes: toInt(req.body?.keystrokes),
        errors: toInt(req.body?.errors),
      });
      if (!req.user) return res.json({ stats, saved: false });
      try {
        await Result.create({
          user: req.user.id,
          submissionId: `custom:${req.user.id}:${clientId}`,
          lang: 'custom',
          mode: 'custom',
          amount: words.length,
          wpm: stats.wpm,
          raw: stats.raw,
          accuracy: stats.accuracy,
          errorCount: stats.errors,
          correctChars: stats.correctChars,
          durationMs: stats.durationMs,
          leaderboard: false,
        });
      } catch (err) {
        if (err?.code === 11000) return res.status(409).json({ error: 'Natija allaqachon saqlangan', duplicate: true });
        throw err;
      }
      res.json({ stats, saved: true });
    })
  );

  // ---------- Reyting ----------
  r.get(
    '/leaderboard',
    auth.optionalAuth,
    wrap(async (req, res) => {
      const lang = LANGS.includes(req.query.lang) ? req.query.lang : 'uz';
      const duration = TIME_OPTIONS.includes(Number(req.query.duration)) ? Number(req.query.duration) : 30;

      // Har bir foydalanuvchining eng yaxshi natijasi (WPM, keyin aniqlik, keyin vaqt bo'yicha)
      const best = await Result.aggregate([
        { $match: { leaderboard: true, lang, mode: 'time', amount: duration } },
        { $sort: { wpm: -1, accuracy: -1, createdAt: 1 } },
        {
          $group: {
            _id: '$user',
            wpm: { $first: '$wpm' },
            accuracy: { $first: '$accuracy' },
            createdAt: { $first: '$createdAt' },
          },
        },
        { $sort: { wpm: -1, accuracy: -1, createdAt: 1 } },
      ]);

      const top = best.slice(0, 100);
      const users = await User.find({ _id: { $in: top.map((b) => b._id) } }, { username: 1 }).lean();
      const names = new Map(users.map((u) => [String(u._id), u.username]));
      const rows = top.map((b, i) => ({
        rank: i + 1,
        userId: String(b._id),
        username: names.get(String(b._id)) || '—',
        wpm: b.wpm,
        accuracy: b.accuracy,
        createdAt: b.createdAt,
      }));

      let me = null;
      if (req.user) {
        const idx = best.findIndex((b) => String(b._id) === req.user.id);
        if (idx >= 0) me = { rank: idx + 1, wpm: best[idx].wpm, accuracy: best[idx].accuracy };
      }
      res.json({ lang, duration, total: best.length, rows, me });
    })
  );

  // ---------- Profil ----------
  const profileHandler = (own) =>
    wrap(async (req, res) => {
      const user = own
        ? await User.findById(req.user.id)
        : await User.findOne({ usernameLower: String(req.params.username || '').toLowerCase() });
      if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

      const results = await Result.find({ user: user._id }).sort({ createdAt: -1 }).limit(1000).lean();
      const count = results.length;
      const sum = (f) => results.reduce((a, x) => a + f(x), 0);
      const stats = {
        tests: count,
        bestWpm: count ? Math.max(...results.map((x) => x.wpm)) : 0,
        avgWpm: count ? round2(sum((x) => x.wpm) / count) : 0,
        avgAccuracy: count ? round2(sum((x) => x.accuracy) / count) : 0,
        totalTimeMs: sum((x) => x.durationMs),
      };

      // Shaxsiy rekordlar: rejim + miqdor + til bo'yicha eng yaxshisi
      const pbMap = new Map();
      for (const x of results) {
        if (x.mode === 'custom') continue;
        const key = `${x.mode}:${x.amount}:${x.lang}`;
        const cur = pbMap.get(key);
        if (!cur || x.wpm > cur.wpm || (x.wpm === cur.wpm && x.accuracy > cur.accuracy)) pbMap.set(key, x);
      }
      const personalBests = [...pbMap.values()].map((x) => ({
        mode: x.mode,
        amount: x.amount,
        lang: x.lang,
        wpm: x.wpm,
        accuracy: x.accuracy,
        createdAt: x.createdAt,
      }));

      res.json({
        user: publicUser(user, { withEmail: own }),
        stats,
        personalBests,
        recent: results.slice(0, 25).map(publicResult),
        history: results
          .slice(0, 100)
          .reverse()
          .map((x) => ({ wpm: x.wpm, accuracy: x.accuracy, mode: x.mode, amount: x.amount, createdAt: x.createdAt })),
      });
    });

  r.get('/profile/me', auth.requireAuth, profileHandler(true));
  r.get('/profile/:username', profileHandler(false));

  return r;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
