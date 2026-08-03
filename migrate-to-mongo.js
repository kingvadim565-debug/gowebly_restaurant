/* ═══════════════════════════════════════════════════════════
   Przeniesienie danych ze starej wersji (plik data/db.json)
   do MongoDB Atlas.

   Uruchomienie:  npm run migruj

   Skrypt jest bezpieczny: jeśli w bazie są już dane, przerywa
   i nic nie nadpisuje. Zdjęcia z data/uploads wgrywa do bazy.
   ═══════════════════════════════════════════════════════════ */
'use strict';

require('./lib/env').load();

const fs = require('fs');
const path = require('path');
const store = require('./lib/store');

const DB_FILE = path.join(__dirname, 'data', 'db.json');
const UPLOADS = path.join(__dirname, 'data', 'uploads');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

async function main() {
  if (!fs.existsSync(DB_FILE)) {
    console.log('Nie ma pliku data/db.json — nie ma czego przenosić.');
    console.log('To normalne, jeśli zaczynasz od nowej instalacji.');
    return;
  }

  const old = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  await store.connect();

  const istniejace = await store.listReservations({});
  const daniaWBazie = await store.countDishes();
  if (istniejace.length > 0) {
    console.log('W bazie są już rezerwacje (' + istniejace.length + ') — przerywam, żeby nic nie nadpisać.');
    console.log('Jeśli chcesz zacząć od zera, wyczyść bazę w Atlasie i uruchom ponownie.');
    return;
  }

  console.log('Przenoszę dane z data/db.json → MongoDB (' + store.DB_NAME + ')\n');

  if (old.settings) {
    await store.saveSettings(old.settings);
    console.log('  ustawienia          ✓');
  }
  if (old.hours) {
    await store.saveHours(old.hours);
    console.log('  godziny otwarcia    ✓');
  }

  // menu nadpisujemy tylko wtedy, gdy w pliku jest inne niż startowe
  if (Array.isArray(old.categories) && old.categories.length) {
    for (const c of old.categories) {
      const existing = await store.findCategory(c.id);
      if (existing) { await store.updateCategory(c.id, c); } else { await store.insertCategory(c); }
    }
    console.log('  kategorie           ✓ (' + old.categories.length + ')');
  }
  if (Array.isArray(old.dishes) && old.dishes.length) {
    for (const d of old.dishes) {
      const existing = await store.findDish(d.id);
      if (existing) { await store.updateDish(d.id, d); } else { await store.insertDish(d); }
    }
    console.log('  dania               ✓ (' + old.dishes.length + ', było w bazie ' + daniaWBazie + ')');
  }

  // zdjęcia wgrane z panelu trafiają z dysku do bazy
  let zdjec = 0;
  if (Array.isArray(old.gallery)) {
    for (const g of old.gallery) {
      if (g.src && g.src.indexOf('/uploads/') === 0) {
        const file = path.join(UPLOADS, path.basename(g.src));
        if (fs.existsSync(file)) {
          const ext = path.extname(file).toLowerCase();
          const imgId = path.basename(file, ext);
          await store.putImage(imgId, MIME[ext] || 'image/jpeg', fs.readFileSync(file));
          zdjec++;
        }
      }
      const existing = await store.findGallery(g.id);
      if (existing) { await store.updateGallery(g.id, g); } else { await store.insertGallery(g); }
    }
    console.log('  galeria             ✓ (' + old.gallery.length + ' wpisów, ' + zdjec + ' plików do bazy)');
  }

  if (Array.isArray(old.reservations) && old.reservations.length) {
    for (const r of old.reservations) { await store.insertReservation(r); }
    console.log('  rezerwacje          ✓ (' + old.reservations.length + ')');
  }

  if (Array.isArray(old.users) && old.users.length) {
    for (const u of old.users) { await store.setPassword(u.username, u.salt, u.hash); }
    console.log('  hasło administratora ✓ (zachowane ze starej wersji)');
  }

  console.log('\nGotowe. Plik data/db.json możesz teraz zarchiwizować — aplikacja już z niego nie korzysta.');
}

main()
  .then(function () { process.exit(0); })
  .catch(function (err) { console.error('\n✗ Błąd migracji:', err.message); process.exit(1); });
