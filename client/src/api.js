import axios from 'axios';
import { io } from 'socket.io-client';

// ---------- Brauzer xotirasi (xavfsiz) ----------
export const storage = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* xotira yopiq bo'lishi mumkin */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* */
    }
  },
};

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Har bir brauzer varag'i uchun alohida o'yinchi identifikatori (yangilanganda saqlanadi)
export function playerId() {
  try {
    let id = sessionStorage.getItem('tg_player');
    if (!id) {
      id = uid();
      sessionStorage.setItem('tg_player', id);
    }
    return id;
  } catch {
    return (window.__tgPlayer ||= uid());
  }
}

// ---------- Akkaunt holati ----------
const listeners = new Set();
export const auth = {
  token: storage.get('tg_token'),
  user: storage.get('tg_user'),
  set(token, user) {
    this.token = token;
    this.user = user;
    storage.set('tg_token', token);
    storage.set('tg_user', user);
    if (socket?.connected) socket.disconnect().connect(); // yangi token bilan qayta ulanish
    listeners.forEach((fn) => fn());
  },
  logout() {
    this.set(null, null);
    storage.remove('tg_token');
    storage.remove('tg_user');
  },
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

// ---------- REST ----------
export const api = axios.create({ baseURL: '/api', timeout: 10000 });
api.interceptors.request.use((cfg) => {
  if (auth.token) cfg.headers.Authorization = `Bearer ${auth.token}`;
  return cfg;
});
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && auth.token && !err.config.url.startsWith('/auth/login')) auth.logout();
    return Promise.reject(err);
  }
);

export function errMsg(err, fallback = 'Serverga ulanib bo‘lmadi') {
  return err?.response?.data?.error || fallback;
}

// ---------- Socket.IO ----------
let socket = null;
export function getSocket() {
  if (!socket) {
    socket = io({ autoConnect: true, auth: (cb) => cb({ token: auth.token }) });
  }
  return socket;
}
export function emitAck(event, data) {
  const s = getSocket();
  return new Promise((resolve) => {
    s.timeout(8000).emit(event, data, (err, res) => resolve(err ? { ok: false, message: 'Server javob bermadi' } : res));
  });
}
