# TypingGo — tez yozish platformasi

Yakka testlar (vaqt / so‘zlar / o‘z matnim), 15 kishilik jonli xonalar, dunyo reytingi va shaxsiy profil.

- **Frontend:** Vite, vanilla JavaScript, Tailwind CSS, Axios, socket.io-client — `client/`
- **Backend:** Node.js, Express, MongoDB (Mongoose), Socket.IO, bcryptjs, JWT — `server/`
- **Umumiy mantiq:** so‘zlar ro‘yxati va WPM/aniqlik hisobi — `shared/` (frontend ham, server ham bir xil hisoblaydi)

## 1. Kerakli dasturlar (Windows 11)

1. **Node.js 20 yoki yangiroq** — https://nodejs.org (LTS). Tekshirish:
   ```powershell
   node -v
   npm -v
   ```
2. **MongoDB Atlas** akkaunti (bepul M0 klaster yetarli) — https://www.mongodb.com/atlas

## 2. O‘rnatish

PowerShell'da loyiha papkasiga o‘ting va bitta buyruq bilan hammasini o‘rnating (ildiz, `server/` va `client/` paketlari):

```powershell
cd "$env:USERPROFILE\OneDrive\Desktop\typingGo"
```
```powershell
npm install
```

## 3. `.env` faylini to‘ldirish

```powershell
Copy-Item server\.env.example server\.env
```
```powershell
notepad server\.env
```

| O‘zgaruvchi | Nima yoziladi |
|---|---|
| `MONGODB_URI` | Atlas → **Connect → Drivers** dan olingan manzil. Parolni o‘zingizniki bilan almashtiring, oxiriga baza nomini qo‘shing: `...mongodb.net/typinggo?retryWrites=true&w=majority` |
| `JWT_SECRET` | Uzun tasodifiy qator. Yaratish: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CLIENT_ORIGIN` | Frontend manzili. Lokal ishlatishda: `http://localhost:5173` |
| `PORT` | Backend porti (standart `4000`) |

Atlas'da yana ikki narsa kerak:
- **Database Access** — login/parolli foydalanuvchi yarating.
- **Network Access** — IP manzilingizni qo‘shing (yoki sinov uchun `0.0.0.0/0`).

Ulanish ishlamasa, server terminalda sababini maxfiy qiymatlarsiz yozadi (masalan, “login yoki parol noto‘g‘ri”, “IP ruxsat etilmagan”).

## 4. Ishga tushirish

Frontend va backend birga:

```powershell
npm run dev
```

So‘ng brauzerda oching: **http://localhost:5173**

Alohida ishga tushirish kerak bo‘lsa (ikki terminalda):

```powershell
npm --prefix server run dev
```
```powershell
npm --prefix client run dev
```

### Atlas'siz tez sinab ko‘rish

Vaqtinchalik (xotiradagi) MongoDB bilan — ma’lumotlar server to‘xtaganda o‘chadi. Birinchi marta MongoDB 5.0 binari (~370 MB) bir marta yuklab olinadi; `npm test` ham shundan foydalanadi:

```powershell
npm run dev:memory
```

## 5. Test va build

```powershell
npm test
```
```powershell
npm run build
```

`npm run build` dan keyin bitta server frontendni ham beradi (production):

```powershell
npm start
```
→ http://localhost:4000

Avtomatik testlar (`server/test/`):
- 15 kishilik xonaga bir vaqtda 16+ kishi kirganda faqat 15 tasi sig‘ishi, qolganlarga “Xona to‘lgan”;
- sahifani yangilagan o‘yinchi o‘z joyiga qaytishi (ikki marta sanalmaydi);
- ikki o‘yinchi: tayyor → umumiy start (bir xil matn va vaqt) → jonli natija → yakuniy jadval;
- natija saqlanishi, takroriy yuborish rad etilishi, profil va tegishli reytingda ko‘rinishi;
- “O‘z matnim” natijasi faqat shaxsiy tarixga tushishi; o‘/g‘ apostrof variantlarining tengligi; WPM va aniqlik hisobi.

## Qanday ishlaydi

- **Yakka test** birinchi harf bosilganda boshlanadi. `Tab` — yangi test. Backspace bilan xatoni tuzatish mumkin (oldingi so‘zga faqat u xato bo‘lsa qaytiladi).
- **WPM** = (to‘g‘ri belgilar ÷ 5) ÷ daqiqa. **Aniqlik** keyin tuzatilgan xato bosishlarni ham hisobga oladi.
- **O‘zbekcha** testda `'`, `` ` ``, `‘`, `’`, `ʻ`, `ʼ` belgilari teng: `o'zbek` = `o‘zbek`.
- **Reyting** faqat server yaratgan vaqtli testlardan (15/30/60/120 s) tuziladi. Server matnni o‘zi beradi, vaqtni o‘zi tekshiradi va WPM’ni o‘zi hisoblaydi; bitta test natijasi faqat bir marta qabul qilinadi. Har bir toifada foydalanuvchining eng yaxshi natijasi bir marta chiqadi.
- **Xonalar** server xotirasida saqlanadi (server qayta ishga tushsa xonalar yo‘qoladi). Qo‘shilish tekshiruvi atom bajariladi, shuning uchun bir vaqtda kelganlar ham limitdan oshmaydi. Uzilgan o‘yinchining joyi 60 soniya saqlanadi.
- **Mehmon** darhol test topshira oladi; natijalar saqlanishi va reytingga chiqishi uchun akkaunt kerak.

## Tuzilma

```
typingGo/
├─ package.json        # npm run dev / build / test
├─ shared/             # so'zlar va hisob-kitob (client + server)
├─ server/
│  ├─ .env.example
│  ├─ src/             # index, app, api, rooms, models, db, auth
│  ├─ scripts/dev-memory.js
│  └─ test/
└─ client/
   ├─ index.html, vite.config.js
   └─ src/             # main, api, ui, typing/engine, views/*
```
