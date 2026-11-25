import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { createAuth } from './auth.js';
import { createApiRouter } from './api.js';
import { attachRooms } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

/** Express + Socket.IO serverini yaratadi (testlarda ham ishlatiladi). */
export function createServer({ jwtSecret, clientOrigins }) {
  const auth = createAuth(jwtSecret);
  const app = express();
  const corsOptions = { origin: clientOrigins, credentials: true };

  app.disable('x-powered-by');
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '200kb' }));
  app.use('/api', createApiRouter(auth));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Topilmadi' }));

  // Production: tayyor frontendni shu serverning o'zi beradi
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON noto‘g‘ri' });
    console.error('[server] Xato:', err?.message || err);
    res.status(500).json({ error: 'Serverda xato yuz berdi' });
  });

  const server = http.createServer(app);
  const io = new Server(server, { cors: corsOptions });
  const rooms = attachRooms(io, auth);
  return { app, server, io, rooms };
}
