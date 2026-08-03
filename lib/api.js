/* ═══════════════════════════════════════════════════════════
   API — jeden zestaw tras obsługujący i serwer lokalny, i Vercela.
   ═══════════════════════════════════════════════════════════ */
'use strict';

const store = require('./store');
const auth = require('./auth');
const {
  uid, hashPassword, verifyPassword, toMinutes, parseVariants, parsePrices
} = require('./util');
const { openNow, slotsForDate, availability, validateReservation } = require('./booking');

const MAX_JSON_BODY = 8 * 1024 * 1024;   // 8 MB — zdjęcia lecą jako base64
const LOGIN_WINDOW_MIN = 5;
const LOGIN_MAX_FAILS = 5;

/* ─────────── odpowiedzi ─────────── */

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
  // Vercel potrafi sparsować ciało za nas
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) { return Promise.resolve(req.body); }
    if (typeof req.body === 'string') {
      try { return Promise.resolve(req.body ? JSON.parse(req.body) : {}); }
      catch (e) { return Promise.reject(new Error('Nieprawidłowy format danych.')); }
    }
  }
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
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) { return String(fwd).split(',')[0].trim(); }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/* ─────────── treść publiczna ─────────── */

async function publicContent() {
  const [s, hours, cats, dishes, gallery] = await Promise.all([
    store.getSettings(), store.getHours(),
    store.listCategories(), store.listDishes(true), store.listGallery()
  ]);

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
    hours: hours,
    status: openNow(hours, new Date()),
    categories: cats,
    dishes: dishes,
    gallery: gallery
  };
}

/* ─────────── serwowanie wgranych zdjęć ─────────── */

async function serveUpload(res, fileName) {
  const id = String(fileName).replace(/\.[^.]+$/, '');
  const img = await store.getImage(id);
  if (!img) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Nie znaleziono zdjęcia');
  }
  res.writeHead(200, {
    'Content-Type': img.contentType,
    'Content-Length': img.buffer.length,
    'Cache-Control': 'public, max-age=31536000, immutable'
  });
  res.end(img.buffer);
}

/* ═══════════════════════════════════════════════════════════
   GŁÓWNY ROUTER
   ═══════════════════════════════════════════════════════════ */

async function handle(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  if (p.startsWith('/uploads/')) {
    return serveUpload(res, p.slice('/uploads/'.length));
  }

  const session = auth.getSession(req);
  const secure = auth.isSecureRequest(req);

  /* ───────── PUBLICZNE ───────── */

  if (p === '/api/content' && method === 'GET') {
    return sendJson(res, 200, await publicContent());
  }

  if (p === '/api/availability' && method === 'GET') {
    const date = url.searchParams.get('date') || '';
    const people = Number(url.searchParams.get('people') || 2);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return sendJson(res, 400, { error: 'Nieprawidłowa data.' });
    }
    const [settings, hours, dayRes] = await Promise.all([
      store.getSettings(), store.getHours(), store.reservationsOn(date)
    ]);
    const now = Date.now() + settings.leadMinutes * 60000;
    const slots = slotsForDate(hours, settings, date).map(function (t) {
      const av = availability(settings, dayRes, t, people);
      const when = new Date(date + 'T' + t + ':00').getTime();
      return { time: t, free: av.free, ok: av.ok && when >= now, past: when < now };
    });
    return sendJson(res, 200, { date: date, seats: settings.seats, slots: slots });
  }

  if (p === '/api/reservations' && method === 'POST') {
    const body = await readJsonBody(req);
    const date = String(body.date || '').trim();
    const [settings, hours, dayRes] = await Promise.all([
      store.getSettings(), store.getHours(),
      /^\d{4}-\d{2}-\d{2}$/.test(date) ? store.reservationsOn(date) : Promise.resolve([])
    ]);
    const check = validateReservation({ settings, hours, dayReservations: dayRes }, body, {});
    if (check.errors) {
      return sendJson(res, 422, { errors: check.errors, availability: check.availability });
    }
    const item = Object.assign({
      id: uid('r-'), createdAt: new Date().toISOString(),
      status: 'new', adminNote: '', source: 'www'
    }, check.value);
    await store.insertReservation(item);
    console.log('★ Nowa rezerwacja:', item.date, item.time, '·', item.people, 'os. ·', item.name, item.phone);
    return sendJson(res, 201, {
      ok: true,
      reservation: { id: item.id, date: item.date, time: item.time, people: item.people, name: item.name }
    });
  }

  /* ───────── LOGOWANIE ───────── */

  if (p === '/api/auth/login' && method === 'POST') {
    const ip = clientIp(req);
    const fails = await store.recentFailures(ip, LOGIN_WINDOW_MIN);
    if (fails >= LOGIN_MAX_FAILS) {
      return sendJson(res, 429, {
        error: 'Za dużo nieudanych prób. Spróbuj ponownie za kilka minut.'
      });
    }
    const body = await readJsonBody(req);
    const user = await store.findUser(String(body.username || '').trim());
    if (!user || !verifyPassword(String(body.password || ''), user.salt, user.hash)) {
      await store.noteFailedLogin(ip);
      return sendJson(res, 401, { error: 'Nieprawidłowy login lub hasło.' });
    }
    await store.clearFailures(ip);
    const settings = await store.getSettings();
    return sendJson(res, 200,
      { ok: true, username: user.username, passwordChanged: !!settings.passwordChanged },
      { 'Set-Cookie': auth.cookieHeader(auth.createToken(user.username), secure) });
  }

  if (p === '/api/auth/logout' && method === 'POST') {
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader('', secure) });
  }

  if (p === '/api/auth/me' && method === 'GET') {
    if (!session) { return sendJson(res, 401, { error: 'Nie zalogowano.' }); }
    const settings = await store.getSettings();
    return sendJson(res, 200, {
      username: session.username, passwordChanged: !!settings.passwordChanged
    });
  }

  /* ───────── DALEJ TYLKO DLA ZALOGOWANYCH ───────── */

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
    const [counts, settings, dishes, cats, gal] = await Promise.all([
      store.overviewCounts(today), store.getSettings(),
      store.countDishes(), store.countCategories(), store.countGallery()
    ]);
    return sendJson(res, 200, Object.assign({}, counts, {
      dishesCount: dishes, categoriesCount: cats, galleryCount: gal,
      seats: settings.seats, passwordChanged: !!settings.passwordChanged, today: today
    }));
  }

  /* --- rezerwacje --- */
  if (resource === 'reservations') {
    if (method === 'GET') {
      const [items, settings] = await Promise.all([
        store.listReservations({
          status: url.searchParams.get('status') || '',
          from: url.searchParams.get('from') || '',
          to: url.searchParams.get('to') || '',
          q: url.searchParams.get('q') || ''
        }),
        store.getSettings()
      ]);
      return sendJson(res, 200, { items, seats: settings.seats, slotMinutes: settings.slotMinutes });
    }

    if (method === 'POST') {
      const body = await readJsonBody(req);
      const [settings, hours, dayRes] = await Promise.all([
        store.getSettings(), store.getHours(),
        store.reservationsOn(String(body.date || ''))
      ]);
      const check = validateReservation({ settings, hours, dayReservations: dayRes }, body, { admin: true });
      if (check.errors) { return sendJson(res, 422, { errors: check.errors }); }
      const item = Object.assign({
        id: uid('r-'), createdAt: new Date().toISOString(),
        status: 'confirmed', adminNote: '', source: 'telefon'
      }, check.value);
      await store.insertReservation(item);
      return sendJson(res, 201, { ok: true, item });
    }

    if (method === 'PATCH' && id) {
      const item = await store.findReservation(id);
      if (!item) { return sendJson(res, 404, { error: 'Nie znaleziono rezerwacji.' }); }
      const body = await readJsonBody(req);
      const patch = {};

      if (body.status) {
        if (['new', 'confirmed', 'cancelled', 'done'].indexOf(body.status) === -1) {
          return sendJson(res, 400, { error: 'Nieznany status.' });
        }
        patch.status = body.status;
      }
      if (typeof body.adminNote === 'string') { patch.adminNote = body.adminNote.slice(0, 500); }

      if (body.name || body.phone || body.date || body.time || body.people) {
        const merged = Object.assign({}, item, body);
        const [settings, hours, dayRes] = await Promise.all([
          store.getSettings(), store.getHours(), store.reservationsOn(String(merged.date || ''))
        ]);
        const check = validateReservation(
          { settings, hours, dayReservations: dayRes }, merged, { admin: true, ignoreId: item.id }
        );
        if (check.errors) { return sendJson(res, 422, { errors: check.errors }); }
        Object.assign(patch, check.value);
      }
      return sendJson(res, 200, { ok: true, item: await store.updateReservation(id, patch) });
    }

    if (method === 'DELETE' && id) {
      const ok = await store.deleteReservation(id);
      if (!ok) { return sendJson(res, 404, { error: 'Nie znaleziono rezerwacji.' }); }
      return sendJson(res, 200, { ok: true });
    }
  }

  /* --- kategorie --- */
  if (resource === 'categories') {
    if (method === 'GET') { return sendJson(res, 200, { items: await store.listCategories() }); }

    if (method === 'POST') {
      const b = await readJsonBody(req);
      const name = String(b.name || '').trim();
      if (!name) { return sendJson(res, 422, { errors: { name: 'Podaj nazwę kategorii.' } }); }
      const item = {
        id: uid('c-'), name,
        note: String(b.note || '').trim(),
        icon: String(b.icon || 'bowl'),
        order: Number(b.order) || ((await store.countCategories()) + 1),
        variants: parseVariants(b.variants)
      };
      await store.insertCategory(item);
      return sendJson(res, 201, { ok: true, item });
    }

    if (method === 'PATCH' && id) {
      const item = await store.findCategory(id);
      if (!item) { return sendJson(res, 404, { error: 'Nie znaleziono kategorii.' }); }
      const b = await readJsonBody(req);
      const patch = {};
      if (typeof b.name === 'string' && b.name.trim()) { patch.name = b.name.trim(); }
      if (typeof b.note === 'string') { patch.note = b.note.trim(); }
      if (typeof b.icon === 'string') { patch.icon = b.icon; }
      if (b.order !== undefined) { patch.order = Number(b.order) || item.order; }
      if (b.variants !== undefined) { patch.variants = parseVariants(b.variants); }
      return sendJson(res, 200, { ok: true, item: await store.updateCategory(id, patch) });
    }

    if (method === 'DELETE' && id) {
      const ok = await store.deleteCategory(id);
      if (!ok) { return sendJson(res, 404, { error: 'Nie znaleziono kategorii.' }); }
      return sendJson(res, 200, { ok: true });
    }
  }

  /* --- dania --- */
  if (resource === 'dishes') {
    if (method === 'GET') { return sendJson(res, 200, { items: await store.listDishes(false) }); }

    if (method === 'POST') {
      const b = await readJsonBody(req);
      const errors = {};
      const name = String(b.name || '').trim();
      const price = Number(b.price);
      if (!name) { errors.name = 'Podaj nazwę dania.'; }
      if (!(await store.findCategory(b.categoryId))) { errors.categoryId = 'Wybierz kategorię.'; }
      const prices = parsePrices(b.prices);
      if (!prices.length && !(price >= 0)) { errors.price = 'Podaj cenę (liczba).'; }
      if (Object.keys(errors).length) { return sendJson(res, 422, { errors }); }

      const first = prices.find(function (x) { return typeof x === 'number'; });
      const item = {
        id: uid('d-'), categoryId: b.categoryId, name,
        desc: String(b.desc || '').trim(),
        price: prices.length ? (first === undefined ? 0 : first) : price,
        prices,
        tag: String(b.tag || '').trim(),
        visible: b.visible !== false,
        order: Number(b.order) || ((await store.countDishesIn(b.categoryId)) + 1)
      };
      await store.insertDish(item);
      return sendJson(res, 201, { ok: true, item });
    }

    if (method === 'PATCH' && id) {
      const item = await store.findDish(id);
      if (!item) { return sendJson(res, 404, { error: 'Nie znaleziono dania.' }); }
      const b = await readJsonBody(req);
      const patch = {};
      if (typeof b.name === 'string' && b.name.trim()) { patch.name = b.name.trim(); }
      if (typeof b.desc === 'string') { patch.desc = b.desc.trim(); }
      if (b.price !== undefined && Number(b.price) >= 0) { patch.price = Number(b.price); }
      if (b.prices !== undefined) {
        patch.prices = parsePrices(b.prices);
        if (patch.prices.length) {
          const f = patch.prices.find(function (x) { return typeof x === 'number'; });
          patch.price = f === undefined ? 0 : f;
        }
      }
      if (typeof b.tag === 'string') { patch.tag = b.tag.trim(); }
      if (typeof b.visible === 'boolean') { patch.visible = b.visible; }
      if (b.categoryId && await store.findCategory(b.categoryId)) { patch.categoryId = b.categoryId; }
      if (b.order !== undefined) { patch.order = Number(b.order) || item.order; }
      return sendJson(res, 200, { ok: true, item: await store.updateDish(id, patch) });
    }

    if (method === 'DELETE' && id) {
      const ok = await store.deleteDish(id);
      if (!ok) { return sendJson(res, 404, { error: 'Nie znaleziono dania.' }); }
      return sendJson(res, 200, { ok: true });
    }
  }

  /* --- ustawienia --- */
  if (resource === 'settings') {
    if (method === 'GET') { return sendJson(res, 200, { settings: await store.getSettings() }); }
    if (method === 'PUT') {
      const b = await readJsonBody(req);
      const patch = {};
      ['name', 'tagline', 'phone', 'phoneRaw', 'email', 'street', 'city',
        'facebook', 'mapsQuery', 'heroKicker', 'heroTitle', 'heroTitleAccent', 'heroLead',
        'aboutTitle', 'aboutText', 'featureTitle', 'featureText', 'menuNote'
      ].forEach(function (k) {
        if (typeof b[k] === 'string') { patch[k] = b[k].slice(0, 2000); }
      });
      ['rating', 'reviewsCount', 'followers', 'slotMinutes', 'seats',
        'maxPeoplePerBooking', 'leadMinutes', 'maxDaysAhead'
      ].forEach(function (k) {
        if (b[k] !== undefined && !isNaN(Number(b[k]))) { patch[k] = Number(b[k]); }
      });
      return sendJson(res, 200, { ok: true, settings: await store.saveSettings(patch) });
    }
  }

  /* --- godziny otwarcia --- */
  if (resource === 'hours' && method === 'PUT') {
    const b = await readJsonBody(req);
    const patch = {};
    for (let day = 0; day < 7; day++) {
      const h = b[day] || b[String(day)];
      if (!h) { continue; }
      const open = String(h.open || '');
      const close = String(h.close || '');
      if (!h.closed && (toMinutes(open) === null || toMinutes(close) === null)) {
        return sendJson(res, 422, { error: 'Nieprawidłowa godzina dla dnia ' + day + '.' });
      }
      patch[day] = { closed: !!h.closed, open: open || '11:00', close: close || '22:00' };
    }
    return sendJson(res, 200, { ok: true, hours: await store.saveHours(patch) });
  }

  /* --- galeria --- */
  if (resource === 'gallery') {
    if (method === 'GET') { return sendJson(res, 200, { items: await store.listGallery() }); }

    if (method === 'POST') {
      const b = await readJsonBody(req);
      const m = /^data:image\/(png|jpe?g|webp|gif);base64,([\s\S]+)$/.exec(String(b.dataUrl || ''));
      if (!m) { return sendJson(res, 422, { error: 'Wgraj plik JPG, PNG, WEBP lub GIF.' }); }

      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 6 * 1024 * 1024) {
        return sendJson(res, 413, { error: 'Zdjęcie jest za duże (limit 6 MB).' });
      }

      const settings = await store.getSettings();
      const imgId = uid('img-');
      await store.putImage(imgId, 'image/' + (ext === 'jpg' ? 'jpeg' : ext), buf);

      const item = {
        id: uid('g-'),
        src: '/uploads/' + imgId + '.' + ext,
        alt: String(b.alt || '').trim() || 'Zdjęcie z restauracji ' + settings.name,
        slot: String(b.slot || '').trim(),
        order: (await store.countGallery()) + 1
      };
      await store.insertGallery(item);
      return sendJson(res, 201, { ok: true, item });
    }

    if (method === 'PATCH' && id) {
      const item = await store.findGallery(id);
      if (!item) { return sendJson(res, 404, { error: 'Nie znaleziono zdjęcia.' }); }
      const b = await readJsonBody(req);
      const patch = {};
      if (typeof b.alt === 'string') { patch.alt = b.alt.trim(); }
      if (typeof b.slot === 'string') { patch.slot = b.slot.trim(); }
      if (b.order !== undefined) { patch.order = Number(b.order) || item.order; }
      return sendJson(res, 200, { ok: true, item: await store.updateGallery(id, patch) });
    }

    if (method === 'DELETE' && id) {
      const removed = await store.deleteGallery(id);
      if (!removed) { return sendJson(res, 404, { error: 'Nie znaleziono zdjęcia.' }); }
      // plik kasujemy tylko dla zdjęć wgranych z panelu; startowe leżą w public/img
      if (removed.src.indexOf('/uploads/') === 0) {
        await store.deleteImage(removed.src.slice('/uploads/'.length).replace(/\.[^.]+$/, ''));
      }
      return sendJson(res, 200, { ok: true });
    }
  }

  /* --- zmiana hasła --- */
  if (resource === 'password' && method === 'POST') {
    const b = await readJsonBody(req);
    const user = await store.findUser(session.username);
    if (!user || !verifyPassword(String(b.current || ''), user.salt, user.hash)) {
      return sendJson(res, 422, { errors: { current: 'Obecne hasło jest nieprawidłowe.' } });
    }
    const next = String(b.next || '');
    if (next.length < 8) {
      return sendJson(res, 422, { errors: { next: 'Nowe hasło musi mieć co najmniej 8 znaków.' } });
    }
    const h = hashPassword(next);
    await store.setPassword(user.username, h.salt, h.hash);
    await store.saveSettings({ passwordChanged: true });
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'Nieznany endpoint API.' });
}

/** Opakowanie z obsługą błędów — używane przez oba wejścia. */
async function handleSafely(req, res, url) {
  try {
    await handle(req, res, url);
  } catch (err) {
    console.error('Błąd API:', err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: err.message || 'Błąd serwera.' });
    } else {
      res.end();
    }
  }
}

module.exports = { handle, handleSafely, publicContent, sendJson };
