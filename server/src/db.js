import mongoose from 'mongoose';

export class StartupError extends Error {}

/** MongoDB ga ulanadi. Xatoda maxfiy qiymatlarsiz tushunarli sabab qaytaradi. */
export async function connectDb(uri) {
  if (!uri) {
    throw new StartupError(
      "MONGODB_URI topilmadi. server/.env faylini yarating (.env.example dan nusxa oling) va MongoDB Atlas ulanish manzilini yozing."
    );
  }
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
    throw new StartupError("MONGODB_URI noto‘g‘ri ko‘rinishda. U 'mongodb+srv://' yoki 'mongodb://' bilan boshlanishi kerak.");
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  } catch (err) {
    throw new StartupError(explainMongoError(err));
  }
}

function explainMongoError(err) {
  const msg = String(err?.message || '');
  const code = err?.code ? ` [kod: ${err.code}]` : '';
  if (/bad auth|authentication failed/i.test(msg)) {
    return `MongoDB login yoki paroli noto‘g‘ri${code}. Atlas → Database Access bo‘limida foydalanuvchini tekshiring. Parolda maxsus belgilar bo‘lsa, ularni URL-kodlang (masalan @ → %40).`;
  }
  if (/ENOTFOUND|querySrv|EREFUSED|ECONNREFUSED.*_mongodb/i.test(msg)) {
    return `MongoDB klaster manzili topilmadi${code}. URI dagi host nomini va internet ulanishini tekshiring.`;
  }
  if (/timed out|whitelist|ReplicaSetNoPrimary|ETIMEDOUT|ECONNREFUSED|Could not connect/i.test(msg)) {
    return `MongoDB serveriga ulanib bo‘lmadi${code}. Atlas → Network Access bo‘limida IP manzilingizni qo‘shing (yoki 0.0.0.0/0) va internetni tekshiring.`;
  }
  return `MongoDB ga ulanishda xato: ${err?.name || 'Error'}${code}.`;
}
