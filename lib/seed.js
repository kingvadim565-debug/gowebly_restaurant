/* ═══════════════════════════════════════════════════════════
   Dane startowe — wgrywane raz, przy pierwszym połączeniu z pustą bazą.
   Później wszystko zmienia się przez panel administracyjny.
   ═══════════════════════════════════════════════════════════ */
'use strict';

const { uid, hashPassword } = require('./util');

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

module.exports = { seedDb, PIZZA_SIZES };
