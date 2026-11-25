// Kundalik, qisqa va ko'p ishlatiladigan so'zlar to'plami.
// O‘zbekcha so'zlarda o‘/g‘ uchun ‘ (U+2018), tutuq belgisi uchun ’ (U+2019) ishlatilgan.
// Yozishda ' ` ‘ ’ ʻ ʼ variantlarining barchasi teng hisoblanadi (shared/typing.js).

export const WORDS = {
  uz: `men sen u biz siz ular bu shu o‘sha va bilan uchun ham lekin yoki emas bor yo‘q kerak mumkin
bir ikki uch to‘rt besh olti yetti sakkiz to‘qqiz o‘n yuz ming kun tun yil oy hafta soat vaqt bugun
ertaga kecha hozir keyin oldin doim har hamma ko‘p oz katta kichik yangi eski yaxshi yomon chiroyli
tez sekin uzoq yaqin issiq sovuq oq qora qizil yashil ko‘k sariq uy maktab ish shahar qishloq yo‘l
suv non choy ota ona aka uka opa singil do‘st bola odam xalq til so‘z gap kitob daftar qalam savol
javob ilm bilim dars keldi ketdi bordi qildi dedi oldi berdi ko‘rdi bildi o‘qidi yozdi ishladi kel
ket qil ol ber ko‘r o‘qi yoz ayt tur o‘tir yur qara eshit sev yasha o‘yla boshla tugat mashq qo‘l
ko‘z bosh yurak tog‘ bog‘ dala daryo dengiz osmon quyosh yulduz shamol yomg‘ir qor gul daraxt olma
uzum go‘sht ovqat pul bozor do‘kon mashina telefon dastur o‘yin sport musiqa rasm kino oila mehmon
sovg‘a bayram tinch baxt quvonch sog‘lik hayot dunyo vatan qanday qachon qayerda nima kim nega
qancha juda endi yana faqat albatta balki chunki agar ammo deb kabi qadar ichida ustida oldida
yonida ma’lumot ta’lim san’at a’lo ma’no she’r tong kechqurun nonushta tushlik ish xona eshik deraza
stol kursi ko‘cha bekat qo‘shiq ovoz rang yorug‘ qorong‘i baland past keng tor oson qiyin to‘g‘ri
xato birga yolg‘iz yordam rahmat salom xayr iltimos marhamat sabr mehr hurmat orzu reja maqsad`
    .split(/\s+/)
    .filter(Boolean),

  en: `the be of and a to in he have it that for they with as not on she at by this we you do but from
or which one would all will there say who make when can more if no man out other so what time up go
about than into could state only new year some take come these know see use get like then first any
work now may such give over think most even find day also after way many must look before great
back through long where much should well people down own just because good each those feel seem
how high too place little world very still nation hand old life tell write become here show house
both between need mean call develop under last right move thing general school never same another
begin while number part turn real leave might want point form off child few small since against
ask late home interest large person end open public follow during present without again hold
around possible head consider word program problem however lead system set order eye plan run
keep face fact group play stand increase early course change help line city water food friend
story light night money book music game road tree sun cold warm fast slow happy`
    .split(/\s+/)
    .filter(Boolean),
};

/** Tasodifiy so'zlar ro'yxati (ketma-ket bir xil so'z takrorlanmaydi). */
export function generateWords(lang, count, rng = Math.random) {
  const list = WORDS[lang] || WORDS.en;
  const out = [];
  for (let i = 0; i < count; i++) {
    let w;
    do {
      w = list[Math.floor(rng() * list.length)];
    } while (out.length && w === out[out.length - 1]);
    out.push(w);
  }
  return out;
}

/** Vaqtli test uchun yetarli so'z soni (300 WPM gacha yetadi). */
export function wordsForDuration(seconds) {
  return Math.ceil((seconds / 60) * 300) + 10;
}
