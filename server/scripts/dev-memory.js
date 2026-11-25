// Atlas'siz sinab ko'rish uchun: vaqtinchalik MongoDB (ma'lumotlar server to'xtaganda o'chadi).
// Haqiqiy ishlatish uchun `npm run dev` va server/.env dagi MONGODB_URI dan foydalaning.
import crypto from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';

console.log('[dev:memory] Vaqtinchalik MongoDB ishga tushirilmoqda (birinchi marta yuklab olinishi mumkin)...');
const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('typinggo');
process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex');
console.log('[dev:memory] ⚠ Ma’lumotlar faqat xotirada — server to‘xtasa o‘chadi.');

const stop = async () => {
  await mongod.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await import('../src/index.js');
