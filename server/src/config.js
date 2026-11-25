import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

export function loadConfig() {
  return {
    port: Number(process.env.PORT) || 4000,
    mongoUri: process.env.MONGODB_URI || '',
    jwtSecret: process.env.JWT_SECRET || '',
    clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
