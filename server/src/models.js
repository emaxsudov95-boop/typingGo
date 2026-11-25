import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true },
    usernameLower: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

// Server yaratgan test (reyting uchun asos). 12 soatdan keyin avtomatik o'chadi.
const testSessionSchema = new Schema({
  lang: { type: String, required: true },
  mode: { type: String, enum: ['time', 'words'], required: true },
  amount: { type: Number, required: true },
  words: { type: [String], required: true },
  submitted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 12 },
});

const resultSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Takroriy yuborishdan himoya: server testi uchun testId, o'z matni uchun mijoz identifikatori
    submissionId: { type: String, required: true, unique: true },
    lang: { type: String, required: true },
    mode: { type: String, enum: ['time', 'words', 'custom'], required: true },
    amount: { type: Number, default: 0 },
    wpm: { type: Number, required: true },
    raw: { type: Number, default: 0 },
    accuracy: { type: Number, required: true },
    errorCount: { type: Number, default: 0 }, // 'errors' mongoose'da band nom
    correctChars: { type: Number, default: 0 },
    durationMs: { type: Number, required: true },
    leaderboard: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
resultSchema.index({ leaderboard: 1, lang: 1, amount: 1, wpm: -1 });
resultSchema.index({ user: 1, createdAt: -1 });

export const User = model('User', userSchema);
export const TestSession = model('TestSession', testSessionSchema);
export const Result = model('Result', resultSchema);
