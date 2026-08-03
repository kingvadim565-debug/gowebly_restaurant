/* ============================================================
   Miasto 88 — serwer aplikacji
   Node.js, ZERO zależności zewnętrznych (nie trzeba nic instalować).
   Uruchomienie:  node server.js      albo dwuklik na start.bat
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const SESSION_TTL = 1000 * 60 * 60 * 8;      // 8 godzin
const MAX_JSON_BODY = 8 * 1024 * 1024;       // 8 MB (zdjęcia lecą jako base64)

/* ============================================================
   1. BAZA DANYCH — plik JSON
   ============================================================ */

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return { salt: s, hash };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return stored.length === check.length && crypto.timingSafeEqual(stored, check);
}

function uid(prefix) {
  return (prefix || '') + crypto.randomBytes(6).toString('hex');
}

/** Nazwy kolumn cenowych — z tablicy albo z tekstu „30 cm, 40 cm, 50 cm". */
function parseVariants(input) {
  let list = input;
  if (typeof input === 'string') { list = input.split(','); }
  if (!Array.isArray(list)) { return []; }
  return list
    .map(function (x) { return String(x).trim().slice(0, 20); })
    .filter(Boolean)
    .slice(0, 4);
}

/** Ceny wariantów — puste pole oznacza „niedostępne" i zapisuje się jako null. */
function parsePrices(input) {
  if (!Array.isArray(input)) { return []; }
  return input.slice(0, 4).map(function (x) {
    if (x === null || x === undefined || String(x).trim() === '') { return null; }
    const n = Number(x);
    return isNaN(n) || n < 0 ? null : n;
  });
}

const PIZZA_SIZES = ['30 cm', '40 cm', '50 cm'];

function seedDb() {
  const admin = hashPassword('miasto88');
  return {
    settings: {
      name: 'Miasto 88',
      tagline: 'Restauracja · Mogilno',
      phone: '514 318 457',
      phoneRaw: '+48514318457',
      email: '',
      street: 'ul. Wodna',
      city: '88-300 Mogilno',
      facebook: 'https://www.facebook.com/search/top?q=Miasto%2088%20Mogilno',
      mapsQuery: 'Miasto 88, Wodna, 88-300 Mogilno',
      heroKicker: 'Restauracja w sercu Mogilna',
      heroTitle: 'Smaki, które łączą',
      heroTitleAccent: 'miasto przy stole',
      heroLead: 'Pizza prosto z pieca w trzech rozmiarach, burgery w zestawie z frytkami, pad thai i placek po zbójnicku. Na miejscu, na wynos i z dowozem.',
      aboutTitle: 'Gotujemy dla Mogilna',
      aboutText: 'Miasto 88 to miejsce, w którym spotyka się cała okolica — na szybki lunch, rodzinny obiad, urodziny czy piątkowy wieczór z przyjaciółmi.\nGotujemy z produktów, które sami chcielibyśmy zjeść: ciasto na pizzę wyrasta powoli, mięso pochodzi od zaufanych dostawców, a sosy i desery robimy na miejscu.',
      featureTitle: 'Placek po zbójnicku',
      featureText: 'Chrupiący placek ziemniaczany z mięsem wieprzowym, papryką, cebulą i pieczarkami, podany z kwaśną śmietaną i natką pietruszki. Klasyk, po który wracacie najczęściej.',
      menuNote: 'Dowóz na terenie Mogilna 5,00 zł, poza Mogilnem 2,50 zł/km. Minimalna kwota zamówienia 25,00 zł. Opakowanie na wynos 2,00 zł, pojemnik do sosu 1,00 zł.',
      rating: 4.1,
      reviewsCount: 478,
      followers: 5900,
      // system rezerwacji
      slotMinutes: 90,          // ile czasu blokuje jedna rezerwacja
      seats: 40,                // ile miejsc ma sala
      maxPeoplePerBooking: 12,  // powyżej — prosimy o telefon
      leadMinutes: 60,          // najbliższa możliwa rezerwacja za X minut
      maxDaysAhead: 90,
      passwordChanged: false
    },
    hours: {
      0: { closed: false, open: '11:00', close: '24:00' },
      1: { closed: false, open: '11:00', close: '24:00' },
      2: { closed: false, open: '11:00', close: '24:00' },
      3: { closed: false, open: '11:00', close: '24:00' },
      4: { closed: false, open: '11:00', close: '24:00' },
      5: { closed: false, open: '11:00', close: '24:00' },
      6: { closed: false, open: '11:00', close: '24:00' }
    },
    categories: [
      c('c-pizza',   'Pizza',                  '',                        'pizza',   1, PIZZA_SIZES),
      c('c-addpizza','Dodatki do pizzy',       '',                        'pizza',   2, PIZZA_SIZES),
      c('c-burger',  'Burgery',                'w zestawie z frytkami 180 g', 'burger', 3),
      c('c-rollo',   'Rollo',                  '',                        'noodles', 4),
      c('c-main',    'Dania główne',           '',                        'meat',    5),
      c('c-various', 'Dania różne',            '',                        'bowl',    6),
      c('c-salad',   'Sałatki',                'z chlebkiem czosnkowym',  'bowl',    7),
      c('c-soup',    'Zupy',                   '',                        'bowl',    8),
      c('c-sweet',   'Desery',                 '',                        'cake',    9),
      c('c-sauce',   'Sosy i dodatki',         '',                        'bowl',   10),
      c('c-shake',   'Koktajle i lemoniady',   '',                        'cup',    11),
      c('c-cold',    'Napoje zimne',           '',                        'cup',    12),
      c('c-hot',     'Kawy i herbaty',         '',                        'cup',    13),
      c('c-beer',    'Piwa',                   '',                        'cup',    14)
    ],
    dishes: [
      /* ── PIZZA (30 / 40 / 50 cm) ── */
      p('01. Margherita', 'sos pomidorowy, ser mozzarella', [27, 36, 49], 'wege', 1),
      p('02. Funghi', 'sos pomidorowy, ser mozzarella, pieczarki', [29, 39, 52], 'wege', 2),
      p('03. Chorizo', 'sos pomidorowy, ser mozzarella, chorizo', [33, 41, 53], '', 3),
      p('04. Capriciosa', 'sos pomidorowy, ser mozzarella, pieczarki, szynka', [34, 43, 55], '', 4),
      p('05. Havai', 'sos pomidorowy, ser mozzarella, ananas, szynka', [34, 43, 55], '', 5),
      p('06. Vege', 'sos pomidorowy, ser mozzarella, pieczarki, papryka, oliwki czarne, cebula, rukola', [34, 45, 55], 'wege', 6),
      p('07. Diablo', 'sos pomidorowy, ser mozzarella, pieczarki, szynka, jalapeno', [36, 45, 56], '', 7),
      p('08. Tonno', 'sos pomidorowy, ser mozzarella, tuńczyk, cebula, oliwki czarne', [36, 47, 59], '', 8),
      p('09. Con Pollo', 'sos śmietanowy, ser mozzarella, pieczarki, cebula, kurczak', [38, 48, 62], '', 9),
      p('10. Oregano', 'sos pomidorowy, ser mozzarella, boczek, kurczak, szynka, chorizo', [42, 52, 65], '', 10),
      p('11. Di Parma', 'sos pomidorowy, ser mozzarella, szynka, prosciutto, oliwki czarne, suszone pomidory, rukola, parmezan', [42, 52, 65], '', 11),
      p('12. Quattro Formaggi', 'sos pomidorowy, ser mozzarella, ser gorgonzola, ser kozi, parmezan', [42, 55, 68], 'wege', 12),
      p('13. Texas', 'sos pomidorowy, ser mozzarella, szarpana wieprzowina, czerwona cebula, kukurydza, prażony słonecznik', [43, 55, 68], '', 13),
      p('14. Stella', 'brzegi wypełnione serem mozzarella · sos pomidorowy, ser mozzarella, pomidorki koktajlowe, bazylia, tarty parmezan', [null, 48, null], 'wege', 14),
      p('15. Ricotta', 'brzegi wypełnione serem ricotta · ser ricotta, ser mozzarella, prosciutto cotto, rukola, parmezan, oliwa', [41, 51, 63], '', 15),
      p('16. Di Bufala', 'sos pomidorowy, mozzarella di bufala, oregano, oliwa chili, liście bazylii, grana padano', [32, 42, 53], '', 16),
      p('17. Jajko', 'sos pomidorowy, mozzarella, jajko, boczek, szynka, szczypiorek', [36, 46, 58], '', 17),
      p('18. Zielone Pesto', 'brzegi wypełnione serem ricotta · pesto bazyliowe, mozzarella di bufala, pomidorki koktajlowe, prosciutto, parmezan, rukola', [41, 52, 68], '', 18),
      p('19. Salami Piccante', 'brzegi wypełnione serem ricotta · sos pomidorowy, mozzarella di bufala, parmezan, salami piccante, oliwa chilli, grana padano', [42, 52, 65], '', 19),
      p('20. La Mafia', 'sos pomidorowy, ser mozzarella, chorizo, boczek, szynka, papryczka peperoni, pieczarki, oregano', [42, 52, 68], '', 20),
      p('21. Calzone', 'sos pomidorowy, ser mozzarella + 6 dodatków', [null, 59, null], '', 21),
      p('22. Bianco', 'ser ricotta, parmezan, marynowany rozmaryn, boczek, gotowane ziemniaki', [40, 44, 56], '', 22),
      p('23. Frutti di Mare', 'sos pomidorowy, ser mozzarella, mix owoców morza, tuńczyk', [37, 49, 60], '', 23),
      p('24. Własna', 'sos pomidorowy, ser mozzarella + 6 dodatków', [50, 60, 75], '', 24),

      /* ── DODATKI DO PIZZY ── */
      dv('c-addpizza', 'Warzywa i owoce', 'pieczarki, cebula, papryka, kukurydza, pomidorki koktajlowe, rukola, szpinak, prażony słonecznik, oliwki czarne, jalapeno, ananas', [4, 5, 7], '', 1),
      dv('c-addpizza', 'Mięso i ser', 'szynka, chorizo, kurczak, boczek, ser', [5, 8, 10], '', 2),
      dv('c-addpizza', 'Dodatki premium', 'prosciutto, szarpana wieprzowina, gorgonzola, parmezan', [6, 9, 12], '', 3),

      /* ── BURGERY ── */
      d('c-burger', 'Klasyk', 'mięso wołowe 180 g, sałata, pomidor, ogórek konserwowy, cebula, sos klasyczny lub BBQ', 36, '', 1),
      d('c-burger', 'Diablo', 'mięso wołowe 180 g, sałata, pomidor, ogórek konserwowy, cebula, habanero', 38, 'ostry', 2),
      d('c-burger', 'Orwal', 'mięso wołowe 180 g, ser panierowany 100 g, 2× ser cheddar, bekon, sałata, pomidor, ogórek konserwowy, sos BBQ', 42, '', 3),
      d('c-burger', 'Kurczak', 'mięso drobiowe 150 g, sałata, pomidor, ogórek konserwowy, cebula, sos koktajlowy', 34, '', 4),
      d('c-burger', 'Pulled Pork', 'szarpana wieprzowina, krążki cebulowe, surówka coleslaw, sos BBQ', 38, '', 5),
      d('c-burger', 'Pork Delux', 'szarpana wieprzowina, 2× ser cheddar, czerwona cebula, rukola, pomidor, jalapeno, bekon, frytki, sos mayo, sos jogurtowo-miętowy', 40, '', 6),
      d('c-burger', 'Onion', 'mięso wołowe 180 g, karmelizowana cebula, ogórek, rukola, jajko, pomidor, prażona cebula, kiełki rzodkiewki, sos bekonowy', 39, '', 7),
      d('c-burger', 'Grubas', 'mięso wołowe 180 g, panierowany camembert, chrupiący boczek, duszone pieczarki, cheddar, rukola, prażona cebula, sos BBQ', 42, 'hit', 8),
      d('c-burger', 'Góral', 'mięso wołowe 180 g, rukola, prażona cebula, karmelizowana cebula, 2× oscypek grillowany, żurawina, pomidor, sos majonezowo-musztardowy', 42, '', 9),
      d('c-burger', 'Kompozycja własna', 'mięso do wyboru (kurczak, wieprzowina, wołowina) + 7 dodatków', 45, '', 10),

      /* ── ROLLO ── */
      d('c-rollo', 'Klasyk', 'sos bekonowy, kurczak 150 g, pomidor, ogórek, surówka, cebula', 28, '', 1),
      d('c-rollo', 'Delux', 'sos bekonowy, kurczak 150 g, ser cheddar, pomidor, ogórek, surówka, bekon, cebula', 29, '', 2),
      d('c-rollo', 'Fryto', 'sos mayo, kurczak 150 g, frytki, ser cheddar, pomidor, ogórek, czerwona cebula, ser bałkański, kukurydza', 32, '', 3),
      d('c-rollo', 'Pork', 'sos BBQ, szarpana wieprzowina 150 g, czerwona cebula, ogórek, kukurydza, słonecznik, czerwona kapusta', 30, '', 4),
      d('c-rollo', 'Vege', 'sos jogurtowo-miętowy, sos mayo, tofu 150 g, pomidor, papryka, ogórek, czerwona cebula, biała kapusta, grana padano, kiełki fasoli mung', 28, 'wege', 5),

      /* ── DANIA GŁÓWNE ── */
      d('c-main', 'Pad Thai z kurczakiem', 'kurczak, marchew, pietruszka, pieczarki, cebula, czosnek, chili, orzechy ziemne, jajko, kiełki fasoli mung, szczypiorek', 44, '', 1),
      d('c-main', 'Pad Thai z krewetkami', 'krewetki, marchew, pietruszka, pieczarki, cebula, czosnek, chili, orzechy ziemne, jajko, kiełki fasoli mung, szczypiorek', 48, '', 2),
      d('c-main', 'Tagliatelle szpinak w chlebie', 'sos śmietanowo-serowy, szpinak, cebula, czosnek, parmezan', 39, 'wege', 3),
      d('c-main', 'Tagliatelle suszone pomidory', 'sos śmietanowy, kurczak, suszone pomidory, cebula, czosnek, oliwa truflowa', 37, '', 4),
      d('c-main', 'Udon teriyaki', 'sos teriyaki, kurczak, marchew, pietruszka, pieczarki, szalotka, szczypiorek, sezam', 40, '', 5),
      d('c-main', 'Pierś panierowana', 'frytki, surówka, sos czosnkowy', 37, '', 6),
      d('c-main', 'Pierś z mozzarellą', 'frytki, surówka, sos czosnkowy', 37, '', 7),
      d('c-main', 'Tagliatelle Alfredo', 'kurczak, szpinak baby, pieczarki, czosnek, grana padano, masło', 39, '', 8),
      d('c-main', 'Placek po zbójnicku', 'chrupiący placek ziemniaczany, mięso wieprzowe, papryka, cebula, pieczarki, kwaśna śmietana, natka pietruszki', 37, 'hit', 9),
      d('c-main', 'Pierś grillowana z ananasem i serem', 'surówka, frytki, sos do wyboru', 37, '', 10),
      d('c-main', 'Gnocchi w sosie śmietanowo-grzybowym w chlebie', 'gnocchi, czosnek, śmietana, grzyby, białe wino, cebula', 39, '', 11),

      /* ── DANIA RÓŻNE ── */
      d('c-various', 'Krążki cebulowe', '9 sztuk', 10, '', 1),
      d('c-various', 'Frytki', '250 g', 10, '', 2),
      d('c-various', 'Frytki z batatów', '250 g', 15, '', 3),
      d('c-various', 'Stripsy', '3 sztuki', 14, '', 4),
      d('c-various', 'Qurito', '4 sztuki · tortilla, grillowany kurczak, czerwona cebula, ser cheddar, kukurydza, sos BBQ', 28, '', 5),
      dv('c-various', 'Bułka szefa — kurczak', 'kurczak grillowany 120 g / 200 g, kapusta, ogórek, pomidor, czerwona cebula, ser cheddar, sos do wyboru', [25, 32], '', 6),
      dv('c-various', 'Bułka szefa — wieprzowina', 'szarpana wieprzowina 120 g / 200 g, kapusta, pomidor, czerwona cebula, kukurydza, słonecznik, sos do wyboru', [28, 36], '', 7),

      /* ── SAŁATKI ── */
      d('c-salad', 'Gruszka', 'karmelizowana gruszka, gorgonzola, szpinak, pomidorki koktajlowe, ogórek, słonecznik, krem balsamiczny, chlebek czosnkowy', 32, '', 1),
      d('c-salad', 'Kurczak', 'kawałki kurczaka, mix sałat, pomidorki koktajlowe, ogórek, papryka, prażony słonecznik, ser ziołowo-parmezanowy, kiełki, chlebek czosnkowy', 32, '', 2),
      d('c-salad', 'Prosciutto', 'szynka prosciutto, ser bałkański, mix sałat, czerwona cebula, ogórek, pomidor, oliwki zielone i czarne, orzechy włoskie, grana padano, sos vinegrette, chlebek czosnkowy', 34, '', 3),

      /* ── ZUPY ── */
      d('c-soup', 'Krem z pomidorów', 'mozzarella rwana, bazylia', 16, 'wege', 1),
      d('c-soup', 'Żurek na zakwasie w chlebie', '', 24, '', 2),

      /* ── DESERY ── */
      d('c-sweet', 'Ciasto dnia', 'zapytaj obsługę, co dziś upiekliśmy', 18, '', 1),
      d('c-sweet', 'Lody', 'lody, owoce, bita śmietana', 18, '', 2),

      /* ── SOSY I DODATKI ── */
      d('c-sauce', 'Sosy', 'czosnek, ostry, koktajlowy, ketchup, BBQ', 2, '', 1),
      d('c-sauce', 'Oliwa', '', 3, '', 2),
      d('c-sauce', 'Bekon', 'dodatek do burgera', 2, '', 3),
      d('c-sauce', 'Ser cheddar', 'dodatek do burgera', 2, '', 4),
      d('c-sauce', 'Jajko sadzone', 'dodatek do burgera', 2, '', 5),

      /* ── KOKTAJLE I LEMONIADY ── */
      d('c-shake', 'Koktajl truskawka', '', 12, '', 1),
      d('c-shake', 'Koktajl owoce leśne', '', 12, '', 2),
      d('c-shake', 'Lemoniada cytryna', '', 11, '', 3),
      d('c-shake', 'Lemoniada truskawka', '', 12, '', 4),
      d('c-shake', 'Lemoniada zielone jabłko', '', 12, '', 5),

      /* ── NAPOJE ZIMNE ── */
      d('c-cold', 'Pepsi / Pepsi Max', '0,2 l', 6, '', 1),
      d('c-cold', 'Mirinda', '0,2 l', 6, '', 2),
      d('c-cold', '7UP', '0,2 l', 6, '', 3),
      d('c-cold', 'Tonic', '0,2 l', 6, '', 4),
      d('c-cold', 'Lipton Ice Tea', '0,2 l', 6, '', 5),
      d('c-cold', 'Red Bull', '0,25 l', 10, '', 6),
      d('c-cold', 'Woda niegazowana', '0,3 l', 6, '', 7),
      d('c-cold', 'Perlage gazowana', '0,3 l', 6, '', 8),

      /* ── KAWY I HERBATY ── */
      d('c-hot', 'Espresso', '', 7, '', 1),
      d('c-hot', 'Doppio', '', 9, '', 2),
      d('c-hot', 'Americano', '', 8, '', 3),
      d('c-hot', 'Cappuccino', '', 9, '', 4),
      d('c-hot', 'Latte Macchiato', '', 12, '', 5),
      d('c-hot', 'Herbata Earl Grey', 'dzbanek', 12, '', 6),
      d('c-hot', 'Herbata zielona', 'dzbanek', 12, '', 7),
      d('c-hot', 'Herbata owocowa', 'dzbanek', 12, '', 8),
      d('c-hot', 'Herbata zimowa', 'dzbanek · pomarańcz, cynamon, imbir, goździki, cytryna, miód, anyż', 12, '', 9),
      d('c-hot', 'Grzane wino', 'dzbanek', 24, '', 10),

      /* ── PIWA ── */
      d('c-beer', 'Lech / Lech 0%', '', 9, '', 1),
      d('c-beer', 'Tyskie', '', 10, '', 2),
      d('c-beer', 'Żubr', '', 9, '', 3),
      d('c-beer', 'Żywiec Biały', '', 11, '', 4),
      d('c-beer', 'Książęce', '', 11, '', 5),
      d('c-beer', 'Corona', '', 12, '', 6),
      d('c-beer', 'Sok do piwa', '', 2, '', 7)
    ],
    // Zdjęcia startowe (Unsplash, licencja darmowa także komercyjnie).
    // Podmień je na własne w panelu → Galeria. Leżą w public/img/.
    gallery: [
      g('/img/hero.jpg', 'Sala restauracji Miasto 88', 'hero', 1),
      g('/img/about-1.jpg', 'Danie podawane przy stole', 'about1', 2),
      g('/img/about-2.jpg', 'Wspólny stół pełen jedzenia', 'about2', 3),
      g('/img/feature.jpg', 'Pieczona wieprzowina z grillowanymi warzywami', 'feature', 4),
      g('/img/g1-pizza.jpg', 'Pizza prosto z pieca', '', 5),
      g('/img/g2-burger.jpg', 'Burger z chrupiącymi frytkami', '', 6),
      g('/img/g3-makaron.jpg', 'Makaron w sosie pomidorowym', '', 7),
      g('/img/g4-padthai.jpg', 'Pad Thai z warzywami', '', 8),
      g('/img/g5-zeberka.jpg', 'Żeberka BBQ na desce', '', 9),
      g('/img/g6-stek.jpg', 'Stek z frytkami', '', 10),
      g('/img/g7-salatka.jpg', 'Świeża sałatka', '', 11),
      g('/img/g8-pizza2.jpg', 'Pizza z kurczakiem i BBQ', '', 12)
    ],
    reservations: [],
    users: [{ username: 'admin', salt: admin.salt, hash: admin.hash }]
  };

  /** Kategoria. `variants` = nazwy kolumn cenowych (np. rozmiary pizzy). */
  function c(id, name, note, icon, order, variants) {
    return { id: id, name: name, note: note || '', icon: icon, order: order, variants: variants || [] };
  }
  /** Danie z jedną ceną. */
  function d(categoryId, name, desc, price, tag, order) {
    return { id: uid('d-'), categoryId, name, desc, price, prices: [], tag: tag || '', visible: true, order };
  }
  /** Danie z kilkoma cenami (np. rozmiary). `null` = niedostępne w tym rozmiarze. */
  function dv(categoryId, name, desc, prices, tag, order) {
    var first = prices.find(function (x) { return typeof x === 'number'; });
    return {
      id: uid('d-'), categoryId, name, desc,
      price: first === undefined ? 0 : first,
      prices: prices, tag: tag || '', visible: true, order
    };
  }
  function p(name, desc, prices, tag, order) {
    return dv('c-pizza', name, desc, prices, tag, order);
  }
  function g(src, alt, slot, order) {
    return { id: uid('g-'), src, alt, slot, order };
  }
}

let db = null;
let writeTimer = null;

function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  if (!fs.existsSync(DB_FILE)) {
    db = seedDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    console.log('→ Utworzono nową bazę: data/db.json');
    console.log('→ Panel: login "admin", hasło "miasto88" — ZMIEŃ JE PO ZALOGOWANIU.');
    return;
  }

  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

  // uzupełnij brakujące pola, gdyby baza pochodziła ze starszej wersji
  const fresh = seedDb();
  db.settings = Object.assign({}, fresh.settings, db.settings);
  db.hours = Object.assign({}, fresh.hours, db.hours);
  ['categories', 'dishes', 'gallery', 'reservations', 'users'].forEach(function (k) {
    if (!Array.isArray(db[k])) { db[k] = fresh[k]; }
  });
}

/** Zapis z opóźnieniem i podmianą pliku — baza nie zostanie uszkodzona przy awarii. */
function saveDb() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(async function () {
    const tmp = DB_FILE + '.tmp';
    try {
      await fsp.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
      await fsp.rename(tmp, DB_FILE);
    } catch (err) {
      console.error('Błąd zapisu bazy:', err.message);
    }
  }, 150);
}

/* ============================================================
   2. SESJE I LOGOWANIE
   ============================================================ */

const sessions = new Map();
const loginAttempts = new Map();   // ip -> { count, until }

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, expires: Date.now() + SESSION_TTL });
  return token;
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.m88_session;
  if (!token) { return null; }
  const s = sessions.get(token);
  if (!s) { return null; }
  if (s.expires < Date.now()) { sessions.delete(token); return null; }
  s.expires = Date.now() + SESSION_TTL;   // przedłuż aktywną sesję
  return { token, username: s.username };
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(function (part) {
    const i = part.indexOf('=');
    if (i > 0) { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  });
  return out;
}

function throttleLogin(ip) {
  const rec = loginAttempts.get(ip);
  if (rec && rec.until > Date.now()) {
    return Math.ceil((rec.until - Date.now()) / 1000);
  }
  return 0;
}

function noteFailedLogin(ip) {
  const rec = loginAttempts.get(ip) || { count: 0, until: 0 };
  rec.count += 1;
  if (rec.count >= 5) {
    rec.until = Date.now() + 1000 * 60 * 5;   // 5 minut blokady
    rec.count = 0;
  }
  loginAttempts.set(ip, rec);
}

/* ============================================================
   3. GODZINY OTWARCIA I DOSTĘPNOŚĆ STOLIKÓW
   ============================================================ */

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) { return null; }
  return Number(m[1]) * 60 + Number(m[2]);
}

function pad2(n) { return String(n).padStart(2, '0'); }

function fromMinutes(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
}

/** Czy lokal jest teraz otwarty (uwzględnia godziny przechodzące przez północ). */
function openNow(now) {
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();

  const today = db.hours[day];
  if (today && !today.closed) {
    const o = toMinutes(today.open);
    let c = toMinutes(today.close);
    if (c <= o) { c += 1440; }
    if (mins >= o && mins < c) {
      return { open: true, until: today.close === '24:00' ? '00:00' : today.close };
    }
  }

  const prev = db.hours[(day + 6) % 7];
  if (prev && !prev.closed) {
    const po = toMinutes(prev.open);
    let pc = toMinutes(prev.close);
    if (pc <= po) {
      pc += 1440;
      if (mins + 1440 < pc) { return { open: true, until: prev.close }; }
    }
  }

  for (let i = 0; i < 8; i++) {
    const h = db.hours[(day + i) % 7];
    if (!h || h.closed) { continue; }
    if (i === 0 && mins >= toMinutes(h.open)) { continue; }
    return { open: false, next: h.open, sameDay: i === 0 };
  }
  return { open: false };
}

/** Lista godzin, na które można rezerwować danego dnia (co 30 minut). */
function slotsForDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  if (isNaN(date)) { return []; }
  const h = db.hours[date.getDay()];
  if (!h || h.closed) { return []; }

  const open = toMinutes(h.open);
  let close = toMinutes(h.close);
  if (close <= open) { close += 1440; }

  // ostatnia rezerwacja musi się zmieścić przed zamknięciem
  const last = close - Math.min(db.settings.slotMinutes, 60);
  const out = [];
  for (let m = open; m <= last; m += 30) { out.push(fromMinutes(m)); }
  return out;
}

/** Ile miejsc jest już zajętych w oknie czasowym danej rezerwacji. */
function seatsTaken(dateStr, timeStr, ignoreId) {
  const slot = db.settings.slotMinutes;
  const start = toMinutes(timeStr);
  const end = start + slot;

  return db.reservations.reduce(function (sum, r) {
    if (r.id === ignoreId) { return sum; }
    if (r.date !== dateStr) { return sum; }
    if (r.status === 'cancelled' || r.status === 'done') { return sum; }
    const rs = toMinutes(r.time);
    const re = rs + slot;
    const overlap = rs < end && re > start;
    return overlap ? sum + Number(r.people || 0) : sum;
  }, 0);
}

function availability(dateStr, timeStr, people, ignoreId) {
  const seats = db.settings.seats;
  const taken = seatsTaken(dateStr, timeStr, ignoreId);
  const free = Math.max(0, seats - taken);
  return { seats, taken, free, ok: free >= Number(people || 1) };
}

/* ============================================================
   4. WALIDACJA REZERWACJI
   ============================================================ */

function validateReservation(body, opts) {
  const errors = {};
  const s = db.settings;
  const isAdmin = !!(opts && opts.admin);

  const name = String(body.name || '').trim();
  if (name.length < 2 || name.length > 80) {
    errors.name = 'Podaj imię (od 2 do 80 znaków).';
  }

  const phone = String(body.phone || '').trim();
  if (phone.replace(/\D/g, '').length < 9) {
    errors.phone = 'Podaj numer telefonu — minimum 9 cyfr.';
  }

  const date = String(body.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = 'Wybierz datę.';
  }

  const time = String(body.time || '').trim();
  if (toMinutes(time) === null) {
    errors.time = 'Wybierz godzinę.';
  }

  const people = Number(body.people);
  if (!Number.isInteger(people) || people < 1) {
    errors.people = 'Podaj liczbę osób.';
  } else if (!isAdmin && people > s.maxPeoplePerBooking) {
    errors.people = 'Rezerwacje powyżej ' + s.maxPeoplePerBooking + ' osób przyjmujemy telefonicznie: ' + s.phone + '.';
  }

  if (String(body.note || '').length > 500) {
    errors.note = 'Uwagi mogą mieć maksymalnie 500 znaków.';
  }

  if (Object.keys(errors).length) { return { errors }; }

  const when = new Date(date + 'T' + time + ':00');
  if (isNaN(when)) {
    return { errors: { date: 'Nieprawidłowa data lub godzina.' } };
  }

  if (!isAdmin) {
    if (when.getTime() < Date.now() + s.leadMinutes * 60000) {
      errors.time = 'Ten termin już minął. Na dziś prosimy o rezerwację telefoniczną.';
    }
    const maxDate = Date.now() + s.maxDaysAhead * 86400000;
    if (when.getTime() > maxDate) {
      errors.date = 'Rezerwacje przyjmujemy maksymalnie ' + s.maxDaysAhead + ' dni naprzód.';
    }

    const slots = slotsForDate(date);
    if (!slots.length) {
      errors.date = 'W tym dniu jest zamknięte. Wybierz inny termin.';
    } else if (slots.indexOf(time) === -1) {
      errors.time = 'O tej godzinie nie przyjmujemy gości. Dostępne godziny: ' + slots[0] + '–' + slots[slots.length - 1] + '.';
    }
  }

  if (Object.keys(errors).length) { return { errors }; }

  const av = availability(date, time, people, opts && opts.ignoreId);
  if (!isAdmin && !av.ok) {
    return {
      errors: {
        time: av.free === 0
          ? 'Na tę godzinę mamy komplet. Wybierz inny termin lub zadzwoń: ' + s.phone + '.'
          : 'Na tę godzinę zostało ' + av.free + ' wolnych miejsc.'
      },
      availability: av
    };
  }

  return {
    value: {
      name: name,
      phone: phone,
      date: date,
      time: time,
      people: people,
      note: String(body.note || '').trim()
    },
    availability: av
  };
}

/* ============================================================
   5. NARZĘDZIA HTTP
   ============================================================ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, status, data, extraHeaders) {
  const body = JSON.stringify(data);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  }, extraHeaders || {}));
  res.end(body);
}

function readJsonBody(req) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (c) {
      size += c.length;
      if (size > MAX_JSON_BODY) {
        reject(new Error('Przesłane dane są za duże (limit 8 MB).'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', function () {
      if (!chunks.length) { return resolve({}); }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('Nieprawidłowy format danych.')); }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  return req.socket.remoteAddress || 'unknown';
}

/* ============================================================
   6. PLIKI STATYCZNE
   ============================================================ */

async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/') { rel = '/index.html'; }
  if (rel === '/admin' || rel === '/admin/') { rel = '/admin/index.html'; }

  let baseDir = PUBLIC_DIR;
  if (rel.startsWith('/uploads/')) {
    baseDir = UPLOADS_DIR;
    rel = rel.slice('/uploads'.length);
  }

  const filePath = path.join(baseDir, rel);
  if (!filePath.startsWith(baseDir)) {           // ochrona przed ../../
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) { throw new Error('dir'); }

    const ext = path.extname(filePath).toLowerCase();
    const etag = '"' + stat.size + '-' + Number(stat.mtimeMs).toString(36) + '"';
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304).end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'ETag': etag,
      'Cache-Control': baseDir === UPLOADS_DIR ? 'public, max-age=604800' : 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404 — nie znaleziono strony</h1><p><a href="/">Wróć na stronę główną</a></p>');
  }
}

/* ============================================================
   7. API
   ============================================================ */

function publicContent() {
  const s = db.settings;
  const cats = db.categories.slice().sort(function (a, b) { return a.order - b.order; });
  const dishes = db.dishes
    .filter(function (x) { return x.visible !== false; })
    .slice()
    .sort(function (a, b) { return a.order - b.order; });

  return {
    settings: {
      name: s.name, tagline: s.tagline, phone: s.phone, phoneRaw: s.phoneRaw,
      email: s.email, street: s.street, city: s.city, facebook: s.facebook,
      mapsQuery: s.mapsQuery,
      heroKicker: s.heroKicker, heroTitle: s.heroTitle, heroTitleAccent: s.heroTitleAccent,
      heroLead: s.heroLead, aboutTitle: s.aboutTitle, aboutText: s.aboutText,
      featureTitle: s.featureTitle, featureText: s.featureText, menuNote: s.menuNote,
      rating: s.rating, reviewsCount: s.reviewsCount, followers: s.followers,
      maxPeoplePerBooking: s.maxPeoplePerBooking, maxDaysAhead: s.maxDaysAhead
    },
    hours: db.hours,
    status: openNow(new Date()),
    categories: cats,
    dishes: dishes,
    gallery: db.gallery
  };
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;
  const session = getSession(req);

  /* ---------- PUBLICZNE ---------- */

  if (p === '/api/content' && method === 'GET') {
    return sendJson(res, 200, publicContent());
  }

  if (p === '/api/availability' && method === 'GET') {
    const date = url.searchParams.get('date') || '';
    const people = Number(url.searchParams.get('people') || 2);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return sendJson(res, 400, { error: 'Nieprawidłowa data.' });
    }
    const now = Date.now() + db.settings.leadMinutes * 60000;
    const slots = slotsForDate(date).map(function (t) {
      const av = availability(date, t, people);
      const when = new Date(date + 'T' + t + ':00').getTime();
      return { time: t, free: av.free, ok: av.ok && when >= now, past: when < now };
    });
    return sendJson(res, 200, { date: date, seats: db.settings.seats, slots: slots });
  }

  if (p === '/api/reservations' && method === 'POST') {
    const body = await readJsonBody(req);
    const check = validateReservation(body, {});
    if (check.errors) {
      return sendJson(res, 422, { errors: check.errors, availability: check.availability });
    }
    const item = Object.assign({
      id: uid('r-'),
      createdAt: new Date().toISOString(),
      status: 'new',
      adminNote: '',
      source: 'www'
    }, check.value);
    db.reservations.push(item);
    saveDb();
    console.log('★ Nowa rezerwacja:', item.date, item.time, '·', item.people, 'os. ·', item.name, item.phone);
    return sendJson(res, 201, {
      ok: true,
      reservation: { id: item.id, date: item.date, time: item.time, people: item.people, name: item.name }
    });
  }

  /* ---------- LOGOWANIE ---------- */

  if (p === '/api/auth/login' && method === 'POST') {
    const ip = clientIp(req);
    const wait = throttleLogin(ip);
    if (wait) {
      return sendJson(res, 429, { error: 'Za dużo prób. Spróbuj ponownie za ' + wait + ' s.' });
    }
    const body = await readJsonBody(req);
    const user = db.users.find(function (u) { return u.username === String(body.username || '').trim(); });
    if (!user || !verifyPassword(String(body.password || ''), user.salt, user.hash)) {
      noteFailedLogin(ip);
      return sendJson(res, 401, { error: 'Nieprawidłowy login lub hasło.' });
    }
    loginAttempts.delete(ip);
    const token = createSession(user.username);
    return sendJson(res, 200, { ok: true, username: user.username, passwordChanged: db.settings.passwordChanged }, {
      'Set-Cookie': 'm88_session=' + token + '; HttpOnly; Path=/; SameSite=Strict; Max-Age=' + (SESSION_TTL / 1000)
    });
  }

  if (p === '/api/auth/logout' && method === 'POST') {
    if (session) { sessions.delete(session.token); }
    return sendJson(res, 200, { ok: true }, {
      'Set-Cookie': 'm88_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0'
    });
  }

  if (p === '/api/auth/me' && method === 'GET') {
    if (!session) { return sendJson(res, 401, { error: 'Nie zalogowano.' }); }
    return sendJson(res, 200, { username: session.username, passwordChanged: db.settings.passwordChanged });
  }

  /* ---------- OD TĄD TYLKO DLA ZALOGOWANYCH ---------- */

  if (!p.startsWith('/api/admin/')) {
    return sendJson(res, 404, { error: 'Nieznany endpoint API.' });
  }
  if (!session) {
    return sendJson(res, 401, { error: 'Sesja wygasła — zaloguj się ponownie.' });
  }

  const seg = p.replace('/api/admin/', '').split('/').filter(Boolean);
  const resource = seg[0];
  const id = seg[1];

  /* --- przegląd --- */
  if (resource === 'overview' && method === 'GET') {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = db.reservations.filter(function (r) {
      return r.date >= today && r.status !== 'cancelled';
    });
    const guestsToday = db.reservations
      .filter(function (r) { return r.date === today && r.status !== 'cancelled'; })
      .reduce(function (a, r) { return a + Number(r.people || 0); }, 0);

    return sendJson(res, 200, {
      newCount: db.reservations.filter(function (r) { return r.status === 'new'; }).length,
      todayCount: db.reservations.filter(function (r) { return r.date === today && r.status !== 'cancelled'; }).length,
      guestsToday: guestsToday,
      upcomingCount: upcoming.length,
      dishesCount: db.dishes.length,
      categoriesCount: db.categories.length,
      galleryCount: db.gallery.length,
      seats: db.settings.seats,
      passwordChanged: db.settings.passwordChanged,
      today: today
    });
  }

  /* --- rezerwacje --- */
  if (resource === 'reservations') {
    if (method === 'GET') {
      const status = url.searchParams.get('status') || '';
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      const q = (url.searchParams.get('q') || '').toLowerCase();

      let list = db.reservations.slice();
      if (status && status !== 'all') { list = list.filter(function (r) { return r.status === status; }); }
      if (from) { list = list.filter(function (r) { return r.date >= from; }); }
      if (to) { list = list.filter(function (r) { return r.date <= to; }); }
      if (q) {
        list = list.filter(function (r) {
          return (r.name + ' ' + r.phone + ' ' + (r.note || '')).toLowerCase().indexOf(q) !== -1;
        });
      }
      list.sort(function (a, b) {
        return (a.date + a.time).localeCompare(b.date + b.time);
      });
      return sendJson(res, 200, { items: list, seats: db.settings.seats, slotMinutes: db.settings.slotMinutes });
    }

    if (method === 'POST') {
      const body = await readJsonBody(req);
      const check = validateReservation(body, { admin: true });
      if (check.errors) { return sendJson(res, 422, { errors: check.errors }); }
      const item = Object.assign({
        id: uid('r-'), createdAt: new Date().toISOString(),
        status: 'confirmed', adminNote: '', source: 'telefon'
      }, check.value);
      db.reservations.push(item);
      saveDb();
      return sendJson(res, 201, { ok: true, item: item });
    }

    if (method === 'PATCH' && id) {
      const item = db.reservations.find(function (r) { return r.id === id; });
      if (!item) { return sendJson(res, 404, { error: 'Nie znaleziono rezerwacji.' }); }
      const body = await readJsonBody(req);

      if (body.status) {
        const allowed = ['new', 'confirmed', 'cancelled', 'done'];
        if (allowed.indexOf(body.status) === -1) {
          return sendJson(res, 400, { error: 'Nieznany status.' });
        }
        item.status = body.status;
      }
      if (typeof body.adminNote === 'string') { item.adminNote = body.adminNote.slice(0, 500); }

      // edycja szczegółów przez panel
      if (body.name || body.phone || body.date || body.time || body.people) {
        const merged = Object.assign({}, item, body);
        const check = validateReservation(merged, { admin: true, ignoreId: item.id });
        if (check.errors) { return sendJson(res, 422, { errors: check.errors }); }
        Object.assign(item, check.value);
      }
      saveDb();
      return sendJson(res, 200, { ok: true, item: item });
    }

    if (method === 'DELETE' && id) {
      const i = db.reservations.findIndex(function (r) { return r.id === id; });
      if (i === -1) { return sendJson(res, 404, { error: 'Nie znaleziono rezerwacji.' }); }
      db.reservations.splice(i, 1);
      saveDb();
      return sendJson(res, 200, { ok: true });
    }
  }

  /* --- kategorie --- */
  if (resource === 'categories') {
    if (method === 'GET') { return sendJson(res, 200, { items: db.categories }); }

    if (method === 'POST') {
      const b = await readJsonBody(req);
      const name = String(b.name || '').trim();
      if (!name) { return sendJson(res, 422, { errors: { name: 'Podaj nazwę kategorii.' } }); }
      const item = {
        id: uid('c-'), name: name,
        note: String(b.note || '').trim(),
        icon: String(b.icon || 'bowl'),
        order: Number(b.order) || (db.categories.length + 1),
        variants: parseVariants(b.variants)
      };
      db.categories.push(item);
      saveDb();
      return sendJson(res, 201, { ok: true, item: item });
    }

    if (method === 'PATCH' && id) {
      const item = db.categories.find(function (c) { return c.id === id; });
      if (!item) { return sendJson(res, 404, { error: 'Nie znaleziono kategorii.' }); }
      const b = await readJsonBody(req);
      if (typeof b.name === 'string' && b.name.trim()) { item.name = b.name.trim(); }
      if (typeof b.note === 'string') { item.note = b.note.trim(); }
      if (typeof b.icon === 'string') { item.icon = b.icon; }
      if (b.order !== undefined) { item.order = Number(b.order) || item.order; }
      if (b.variants !== undefined) { item.variants = parseVariants(b.variants); }
      saveDb();
      return sendJson(res, 200, { ok: true, item: item });
    }

    if (method === 'DELETE' && id) {
      const i = db.categories.findIndex(function (c) { return c.id === id; });
      if (i === -1) { return sendJson(res, 404, { error: 'Nie znaleziono kategorii.' }); }
      db.categories.splice(i, 1);
      db.dishes = db.dishes.filter(function (d) { return d.categoryId !== id; });
      saveDb();
      return sendJson(res, 200, { ok: true });
    }
  }

  /* --- dania --- */
  if (resource === 'dishes') {
    if (method === 'GET') { return sendJson(res, 200, { items: db.dishes }); }

    if (method === 'POST') {
      const b = await readJsonBody(req);
      const errors = {};
      const name = String(b.name || '').trim();
      const price = Number(b.price);
      if (!name) { errors.name = 'Podaj nazwę dania.'; }
      if (!db.categories.some(function (c) { return c.id === b.categoryId; })) {
        errors.categoryId = 'Wybierz kategorię.';
      }
      if (!(price >= 0)) { errors.price = 'Podaj cenę (liczba).'; }
      if (Object.keys(errors).length) { return sendJson(res, 422, { errors: errors }); }

      const prices = parsePrices(b.prices);
      const item = {
        id: uid('d-'), categoryId: b.categoryId, name: name,
        desc: String(b.desc || '').trim(),
        price: prices.length ? (prices.find(function (x) { return typeof x === 'number'; }) || 0) : price,
        prices: prices,
        tag: String(b.tag || '').trim(),
        visible: b.visible !== false,
        order: Number(b.order) || (db.dishes.filter(function (d) { return d.categoryId === b.categoryId; }).length + 1)
      };
      db.dishes.push(item);
      saveDb();
      return sendJson(res, 201, { ok: true, item: item });
    }

    if (method === 'PATCH' && id) {
      const item = db.dishes.find(function (d) { return d.id === id; });
      if (!item) { return sendJson(res, 404, { error: 'Nie znaleziono dania.' }); }
      const b = await readJsonBody(req);
      if (typeof b.name === 'string' && b.name.trim()) { item.name = b.name.trim(); }
      if (typeof b.desc === 'string') { item.desc = b.desc.trim(); }
      if (b.price !== undefined && Number(b.price) >= 0) { item.price = Number(b.price); }
      if (b.prices !== undefined) {
        item.prices = parsePrices(b.prices);
        if (item.prices.length) {
          const first = item.prices.find(function (x) { return typeof x === 'number'; });
          item.price = first === undefined ? 0 : first;
        }
      }
      if (typeof b.tag === 'string') { item.tag = b.tag.trim(); }
      if (typeof b.visible === 'boolean') { item.visible = b.visible; }
      if (b.categoryId && db.categories.some(function (c) { return c.id === b.categoryId; })) {
        item.categoryId = b.categoryId;
      }
      if (b.order !== undefined) { item.order = Number(b.order) || item.order; }
      saveDb();
      return sendJson(res, 200, { ok: true, item: item });
    }

    if (method === 'DELETE' && id) {
      const i = db.dishes.findIndex(function (d) { return d.id === id; });
      if (i === -1) { return sendJson(res, 404, { error: 'Nie znaleziono dania.' }); }
      db.dishes.splice(i, 1);
      saveDb();
      return sendJson(res, 200, { ok: true });
    }
  }

  /* --- ustawienia --- */
  if (resource === 'settings') {
    if (method === 'GET') { return sendJson(res, 200, { settings: db.settings }); }
    if (method === 'PUT') {
      const b = await readJsonBody(req);
      const polaTekstowe = ['name', 'tagline', 'phone', 'phoneRaw', 'email', 'street', 'city',
        'facebook', 'mapsQuery', 'heroKicker', 'heroTitle', 'heroTitleAccent', 'heroLead',
        'aboutTitle', 'aboutText', 'featureTitle', 'featureText', 'menuNote'];
      polaTekstowe.forEach(function (k) {
        if (typeof b[k] === 'string') { db.settings[k] = b[k].slice(0, 2000); }
      });
      ['rating', 'reviewsCount', 'followers', 'slotMinutes', 'seats',
        'maxPeoplePerBooking', 'leadMinutes', 'maxDaysAhead'].forEach(function (k) {
        if (b[k] !== undefined && !isNaN(Number(b[k]))) { db.settings[k] = Number(b[k]); }
      });
      saveDb();
      return sendJson(res, 200, { ok: true, settings: db.settings });
    }
  }

  /* --- godziny otwarcia --- */
  if (resource === 'hours' && method === 'PUT') {
    const b = await readJsonBody(req);
    for (let day = 0; day < 7; day++) {
      const h = b[day] || b[String(day)];
      if (!h) { continue; }
      const open = String(h.open || '');
      const close = String(h.close || '');
      if (!h.closed && (toMinutes(open) === null || toMinutes(close) === null)) {
        return sendJson(res, 422, { error: 'Nieprawidłowa godzina dla dnia ' + day + '.' });
      }
      db.hours[day] = { closed: !!h.closed, open: open || '11:00', close: close || '22:00' };
    }
    saveDb();
    return sendJson(res, 200, { ok: true, hours: db.hours });
  }

  /* --- galeria (zdjęcia przychodzą jako data URL) --- */
  if (resource === 'gallery') {
    if (method === 'GET') { return sendJson(res, 200, { items: db.gallery }); }

    if (method === 'POST') {
      const b = await readJsonBody(req);
      const m = /^data:image\/(png|jpe?g|webp|gif);base64,([\s\S]+)$/.exec(String(b.dataUrl || ''));
      if (!m) { return sendJson(res, 422, { error: 'Wgraj plik JPG, PNG, WEBP lub GIF.' }); }

      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 6 * 1024 * 1024) {
        return sendJson(res, 413, { error: 'Zdjęcie jest za duże (limit 6 MB).' });
      }
      const fileName = uid('img-') + '.' + ext;
      await fsp.writeFile(path.join(UPLOADS_DIR, fileName), buf);

      const item = {
        id: uid('g-'),
        src: '/uploads/' + fileName,
        alt: String(b.alt || '').trim() || 'Zdjęcie z restauracji ' + db.settings.name,
        slot: String(b.slot || '').trim(),          // hero / about1 / about2 / feature / (puste = galeria)
        order: db.gallery.length + 1
      };
      db.gallery.push(item);
      saveDb();
      return sendJson(res, 201, { ok: true, item: item });
    }

    if (method === 'PATCH' && id) {
      const item = db.gallery.find(function (g) { return g.id === id; });
      if (!item) { return sendJson(res, 404, { error: 'Nie znaleziono zdjęcia.' }); }
      const b = await readJsonBody(req);
      if (typeof b.alt === 'string') { item.alt = b.alt.trim(); }
      if (typeof b.slot === 'string') { item.slot = b.slot.trim(); }
      if (b.order !== undefined) { item.order = Number(b.order) || item.order; }
      saveDb();
      return sendJson(res, 200, { ok: true, item: item });
    }

    if (method === 'DELETE' && id) {
      const i = db.gallery.findIndex(function (g) { return g.id === id; });
      if (i === -1) { return sendJson(res, 404, { error: 'Nie znaleziono zdjęcia.' }); }
      const [removed] = db.gallery.splice(i, 1);
      saveDb();
      // kasujemy tylko pliki wgrane przez panel; zdjęcia startowe z public/img zostają
      if (removed.src.indexOf('/uploads/') === 0) {
        try { await fsp.unlink(path.join(UPLOADS_DIR, path.basename(removed.src))); } catch (e) { /* plik mógł już zniknąć */ }
      }
      return sendJson(res, 200, { ok: true });
    }
  }

  /* --- zmiana hasła --- */
  if (resource === 'password' && method === 'POST') {
    const b = await readJsonBody(req);
    const user = db.users.find(function (u) { return u.username === session.username; });
    if (!verifyPassword(String(b.current || ''), user.salt, user.hash)) {
      return sendJson(res, 422, { errors: { current: 'Obecne hasło jest nieprawidłowe.' } });
    }
    const next = String(b.next || '');
    if (next.length < 8) {
      return sendJson(res, 422, { errors: { next: 'Nowe hasło musi mieć co najmniej 8 znaków.' } });
    }
    const h = hashPassword(next);
    user.salt = h.salt;
    user.hash = h.hash;
    db.settings.passwordChanged = true;
    saveDb();
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'Nieznany endpoint API.' });
}

/* ============================================================
   8. SERWER
   ============================================================ */

const server = http.createServer(async function (req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url.pathname);
    }
  } catch (err) {
    console.error('Błąd:', err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: err.message || 'Błąd serwera.' });
    } else {
      res.end();
    }
  }
});

/* --- reset hasła z wiersza poleceń:  node server.js --reset-haslo NoweHaslo123 --- */
const resetFlag = process.argv.indexOf('--reset-haslo');
loadDb();

if (resetFlag !== -1) {
  const newPass = process.argv[resetFlag + 1];
  if (!newPass || newPass.length < 8) {
    console.log('Użycie: node server.js --reset-haslo TwojeNoweHaslo (min. 8 znaków)');
    process.exit(1);
  }
  const h = hashPassword(newPass);
  db.users[0].salt = h.salt;
  db.users[0].hash = h.hash;
  db.settings.passwordChanged = true;
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  console.log('✓ Hasło administratora zostało zmienione.');
  process.exit(0);
}

server.listen(PORT, function () {
  const line = '─'.repeat(52);
  console.log('\n' + line);
  console.log('  MIASTO 88 — serwer działa');
  console.log(line);
  console.log('  Strona:  http://localhost:' + PORT + '/');
  console.log('  Panel:   http://localhost:' + PORT + '/admin');
  if (!db.settings.passwordChanged) {
    console.log('  Login:   admin   ·   Hasło: miasto88  ← ZMIEŃ W PANELU');
  }
  console.log(line);
  console.log('  Zatrzymanie serwera: Ctrl + C\n');
});

server.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.error('\n✗ Port ' + PORT + ' jest zajęty. Uruchom z innym portem:');
    console.error('   set PORT=3001 && node server.js\n');
  } else {
    console.error(err);
  }
  process.exit(1);
});
