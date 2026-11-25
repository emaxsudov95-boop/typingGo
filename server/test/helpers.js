import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io as ioClient } from 'socket.io-client';
import { connectDb } from '../src/db.js';
import { createServer } from '../src/app.js';

export async function startTestServer() {
  const mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri('typinggo_test'));
  const { server, io } = createServer({ jwtSecret: 'test-secret-0123456789abcdef', clientOrigins: ['http://localhost:5173'] });
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;

  const sockets = [];
  return {
    url,
    async request(method, path, body, token) {
      const res = await fetch(url + '/api' + path, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, data: await res.json() };
    },
    async client(token) {
      const s = ioClient(url, { transports: ['websocket'], forceNew: true, auth: token ? { token } : {} });
      sockets.push(s);
      await new Promise((r, j) => {
        s.once('connect', r);
        s.once('connect_error', j);
      });
      return s;
    },
    async close() {
      sockets.forEach((s) => s.disconnect());
      io.close();
      await new Promise((r) => server.close(r));
      await mongoose.disconnect();
      await mongod.stop();
    },
  };
}

export const ack = (socket, event, data) => new Promise((r) => socket.emit(event, data, r));
export const once = (socket, event) => new Promise((r) => socket.once(event, r));
export const pid = (n) => `player-${String(n).padStart(4, '0')}-test`;
