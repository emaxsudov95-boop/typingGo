import { loadConfig } from './config.js';
import { connectDb, StartupError } from './db.js';
import { createServer } from './app.js';

const config = loadConfig();

async function main() {
  if (!config.jwtSecret || config.jwtSecret.length < 16) {
    throw new StartupError(
      'JWT_SECRET topilmadi yoki juda qisqa (kamida 16 belgi). server/.env fayliga uzun tasodifiy qator yozing.'
    );
  }
  console.log('[server] MongoDB ga ulanilmoqda...');
  await connectDb(config.mongoUri);
  console.log('[server] MongoDB ulandi ✓');

  const { server } = createServer(config);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[server] ${config.port}-port band. Boshqa dastur ishlatmoqda yoki server allaqachon ishga tushgan.\n`);
    } else console.error('[server]', err.message);
    process.exit(1);
  });
  server.listen(config.port, () => {
    console.log(`[server] TypingGo API: http://localhost:${config.port}`);
    console.log(`[server] Ruxsat etilgan frontend: ${config.clientOrigins.join(', ')}`);
  });
}

main().catch((err) => {
  if (err instanceof StartupError) {
    console.error(`\n[server] ✗ Ishga tushmadi: ${err.message}\n`);
  } else {
    console.error('\n[server] ✗ Kutilmagan xato:', err?.message || err, '\n');
  }
  process.exit(1);
});
