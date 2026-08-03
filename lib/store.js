/* ═══════════════════════════════════════════════════════════
   Warstwa danych — MongoDB Atlas.
   Połączenie jest cache'owane w zmiennej globalnej, bo na Vercelu
   funkcja bywa wywoływana wielokrotnie w tym samym procesie i nie
   wolno otwierać nowego połączenia przy każdym żądaniu.
   ═══════════════════════════════════════════════════════════ */
'use strict';

const { MongoClient, Binary } = require('mongodb');
const { seedDb } = require('./seed');

const DB_NAME = process.env.MONGO_DB || 'miasto88';

const C = {
  settings: 'settings',
  hours: 'hours',
  categories: 'categories',
  dishes: 'dishes',
  gallery: 'gallery',
  images: 'images',
  reservations: 'reservations',
  users: 'users',
  logins: 'login_attempts'
};

// przetrwa pomiędzy wywołaniami funkcji na tym samym „ciepłym" serwerze
let cached = global.__m88mongo;
if (!cached) { cached = global.__m88mongo = { conn: null, promise: null }; }

async function connect() {
  if (cached.conn) { return cached.conn; }

  const uri = process.env.MONGO_URL;
  if (!uri) {
    throw new Error(
      'Brak zmiennej MONGO_URL. Skopiuj .env.example do .env i wklej adres bazy z MongoDB Atlas.'
    );
  }

  if (!cached.promise) {
    cached.promise = MongoClient.connect(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 15000
    }).then(async function (client) {
      const db = client.db(DB_NAME);
      await ensureSeed(db);
      await ensureIndexes(db);
      return { client, db };
    }).catch(function (err) {
      cached.promise = null;       // pozwól spróbować ponownie przy kolejnym żądaniu
      throw new Error(explainMongoError(err));
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

/** Sterownik zwraca surowe błędy OpenSSL — tłumaczymy je na konkret. */
function explainMongoError(err) {
  const m = String((err && err.message) || err);

  if (/tlsv1 alert internal error|SSL alert number 80|TLSV1_ALERT_INTERNAL_ERROR/i.test(m)) {
    return 'Atlas zerwał połączenie, bo Twój adres IP nie jest dozwolony.\n' +
      '  Otwórz Atlas → PROJEKT, w którym leży ten klaster → Network Access →\n' +
      '  ADD IP ADDRESS → ALLOW ACCESS FROM ANYWHERE (0.0.0.0/0) → Confirm.\n' +
      '  Uwaga: lista adresów jest wspólna dla projektu, nie dla klastra —\n' +
      '  jeśli masz kilka projektów, upewnij się, że jesteś w tym właściwym.';
  }
  if (/bad auth|Authentication failed|AuthenticationFailed/i.test(m)) {
    return 'Nieprawidłowy login lub hasło do bazy.\n' +
      '  Sprawdź MONGO_URL — hasło musi być wpisane zamiast <db_password>.\n' +
      '  Znaki specjalne w haśle trzeba zakodować (np. @ → %40).';
  }
  if (/ENOTFOUND|querySrv|EAI_AGAIN/i.test(m)) {
    return 'Nie udało się odnaleźć adresu klastra — sprawdź, czy MONGO_URL nie ma literówki\n' +
      '  i czy komputer ma połączenie z internetem.';
  }
  if (/ETIMEDOUT|ECONNREFUSED|timed out/i.test(m)) {
    return 'Przekroczono czas oczekiwania na odpowiedź bazy.\n' +
      '  Najczęściej to blokada sieci (firewall) albo uśpiony klaster w Atlasie.';
  }
  return m;
}

async function coll(name) {
  const { db } = await connect();
  return db.collection(name);
}

/* ─────────── pierwsze uruchomienie ─────────── */

async function ensureSeed(db) {
  const already = await db.collection(C.settings).findOne({ _id: 'main' });
  if (already) { return; }

  const s = seedDb();
  await db.collection(C.settings).insertOne(Object.assign({ _id: 'main' }, s.settings));
  await db.collection(C.hours).insertOne(Object.assign({ _id: 'main' }, s.hours));
  if (s.categories.length) { await db.collection(C.categories).insertMany(s.categories); }
  if (s.dishes.length) { await db.collection(C.dishes).insertMany(s.dishes); }
  if (s.gallery.length) { await db.collection(C.gallery).insertMany(s.gallery); }
  await db.collection(C.users).insertMany(s.users);
  console.log('→ Baza była pusta — wgrano dane startowe (menu, zdjęcia, konto admin).');
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection(C.categories).createIndex({ id: 1 }, { unique: true }),
    db.collection(C.dishes).createIndex({ id: 1 }, { unique: true }),
    db.collection(C.dishes).createIndex({ categoryId: 1 }),
    db.collection(C.gallery).createIndex({ id: 1 }, { unique: true }),
    db.collection(C.images).createIndex({ id: 1 }, { unique: true }),
    db.collection(C.reservations).createIndex({ id: 1 }, { unique: true }),
    db.collection(C.reservations).createIndex({ date: 1, status: 1 }),
    db.collection(C.users).createIndex({ username: 1 }, { unique: true }),
    // próby logowania kasują się same po godzinie
    db.collection(C.logins).createIndex({ at: 1 }, { expireAfterSeconds: 3600 })
  ]).catch(function (e) { console.warn('Indeksy:', e.message); });
}

const NO_ID = { projection: { _id: 0 } };

/* ─────────── ustawienia i godziny ─────────── */

async function getSettings() {
  const doc = await (await coll(C.settings)).findOne({ _id: 'main' }, NO_ID);
  return doc || seedDb().settings;
}

async function saveSettings(patch) {
  await (await coll(C.settings)).updateOne({ _id: 'main' }, { $set: patch });
  return getSettings();
}

async function getHours() {
  const doc = await (await coll(C.hours)).findOne({ _id: 'main' }, NO_ID);
  return doc || seedDb().hours;
}

async function saveHours(hours) {
  await (await coll(C.hours)).updateOne({ _id: 'main' }, { $set: hours });
  return getHours();
}

/* ─────────── kategorie i dania ─────────── */

async function listCategories() {
  return (await coll(C.categories)).find({}, NO_ID).sort({ order: 1 }).toArray();
}
async function findCategory(id) {
  return (await coll(C.categories)).findOne({ id }, NO_ID);
}
async function insertCategory(item) {
  await (await coll(C.categories)).insertOne(Object.assign({}, item));
  return item;
}
async function updateCategory(id, patch) {
  await (await coll(C.categories)).updateOne({ id }, { $set: patch });
  return findCategory(id);
}
async function deleteCategory(id) {
  const res = await (await coll(C.categories)).deleteOne({ id });
  await (await coll(C.dishes)).deleteMany({ categoryId: id });   // kaskadowo
  return res.deletedCount > 0;
}

async function listDishes(onlyVisible) {
  const q = onlyVisible ? { visible: { $ne: false } } : {};
  return (await coll(C.dishes)).find(q, NO_ID).sort({ order: 1 }).toArray();
}
async function findDish(id) {
  return (await coll(C.dishes)).findOne({ id }, NO_ID);
}
async function countDishesIn(categoryId) {
  return (await coll(C.dishes)).countDocuments({ categoryId });
}
async function insertDish(item) {
  await (await coll(C.dishes)).insertOne(Object.assign({}, item));
  return item;
}
async function updateDish(id, patch) {
  await (await coll(C.dishes)).updateOne({ id }, { $set: patch });
  return findDish(id);
}
async function deleteDish(id) {
  const res = await (await coll(C.dishes)).deleteOne({ id });
  return res.deletedCount > 0;
}

/* ─────────── galeria i pliki graficzne ─────────── */

async function listGallery() {
  return (await coll(C.gallery)).find({}, NO_ID).sort({ order: 1 }).toArray();
}
async function findGallery(id) {
  return (await coll(C.gallery)).findOne({ id }, NO_ID);
}
async function insertGallery(item) {
  await (await coll(C.gallery)).insertOne(Object.assign({}, item));
  return item;
}
async function updateGallery(id, patch) {
  await (await coll(C.gallery)).updateOne({ id }, { $set: patch });
  return findGallery(id);
}
async function deleteGallery(id) {
  const item = await findGallery(id);
  if (!item) { return null; }
  await (await coll(C.gallery)).deleteOne({ id });
  return item;
}
async function countGallery() {
  return (await coll(C.gallery)).countDocuments({});
}

/** Zdjęcia wgrane z panelu trzymamy w bazie — na Vercelu nie ma dysku do zapisu. */
async function putImage(id, contentType, buffer) {
  await (await coll(C.images)).insertOne({
    id, contentType, data: new Binary(buffer), size: buffer.length,
    createdAt: new Date().toISOString()
  });
}
async function getImage(id) {
  const doc = await (await coll(C.images)).findOne({ id });
  if (!doc) { return null; }
  return { contentType: doc.contentType, buffer: doc.data.buffer ? Buffer.from(doc.data.buffer) : Buffer.from(doc.data) };
}
async function deleteImage(id) {
  await (await coll(C.images)).deleteOne({ id });
}

/* ─────────── rezerwacje ─────────── */

async function listReservations(filter) {
  const q = {};
  if (filter && filter.status && filter.status !== 'all') { q.status = filter.status; }
  if (filter && (filter.from || filter.to)) {
    q.date = {};
    if (filter.from) { q.date.$gte = filter.from; }
    if (filter.to) { q.date.$lte = filter.to; }
  }
  let items = await (await coll(C.reservations)).find(q, NO_ID).sort({ date: 1, time: 1 }).toArray();
  if (filter && filter.q) {
    const needle = filter.q.toLowerCase();
    items = items.filter(function (r) {
      return (r.name + ' ' + r.phone + ' ' + (r.note || '')).toLowerCase().indexOf(needle) !== -1;
    });
  }
  return items;
}
async function findReservation(id) {
  return (await coll(C.reservations)).findOne({ id }, NO_ID);
}
async function insertReservation(item) {
  await (await coll(C.reservations)).insertOne(Object.assign({}, item));
  return item;
}
async function updateReservation(id, patch) {
  await (await coll(C.reservations)).updateOne({ id }, { $set: patch });
  return findReservation(id);
}
async function deleteReservation(id) {
  const res = await (await coll(C.reservations)).deleteOne({ id });
  return res.deletedCount > 0;
}

/** Rezerwacje z danego dnia, które blokują miejsca (nowe i potwierdzone). */
async function reservationsOn(date) {
  return (await coll(C.reservations))
    .find({ date, status: { $nin: ['cancelled', 'done'] } }, NO_ID)
    .toArray();
}

async function overviewCounts(today) {
  const c = await coll(C.reservations);
  const [newCount, todayList, upcoming] = await Promise.all([
    c.countDocuments({ status: 'new' }),
    c.find({ date: today, status: { $ne: 'cancelled' } }, NO_ID).toArray(),
    c.countDocuments({ date: { $gte: today }, status: { $ne: 'cancelled' } })
  ]);
  return {
    newCount,
    todayCount: todayList.length,
    guestsToday: todayList.reduce(function (a, r) { return a + Number(r.people || 0); }, 0),
    upcomingCount: upcoming
  };
}

/* ─────────── użytkownicy i limity logowania ─────────── */

async function findUser(username) {
  return (await coll(C.users)).findOne({ username }, NO_ID);
}
async function setPassword(username, salt, hash) {
  await (await coll(C.users)).updateOne({ username }, { $set: { salt, hash } });
}

/** Zliczanie nieudanych logowań po IP — musi być w bazie, bo funkcja
    serverless nie pamięta niczego pomiędzy wywołaniami. */
async function noteFailedLogin(ip) {
  await (await coll(C.logins)).insertOne({ ip, at: new Date() });
}
async function recentFailures(ip, minutes) {
  const since = new Date(Date.now() - minutes * 60000);
  return (await coll(C.logins)).countDocuments({ ip, at: { $gte: since } });
}
async function clearFailures(ip) {
  await (await coll(C.logins)).deleteMany({ ip });
}

async function countDishes() {
  return (await coll(C.dishes)).countDocuments({});
}
async function countCategories() {
  return (await coll(C.categories)).countDocuments({});
}

module.exports = {
  connect, DB_NAME,
  getSettings, saveSettings, getHours, saveHours,
  listCategories, findCategory, insertCategory, updateCategory, deleteCategory,
  listDishes, findDish, insertDish, updateDish, deleteDish, countDishesIn, countDishes, countCategories,
  listGallery, findGallery, insertGallery, updateGallery, deleteGallery, countGallery,
  putImage, getImage, deleteImage,
  listReservations, findReservation, insertReservation, updateReservation,
  deleteReservation, reservationsOn, overviewCounts,
  findUser, setPassword, noteFailedLogin, recentFailures, clearFailures
};
