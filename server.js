/* ═══════════════════════════════════════════════════════════
   Miasto 88 — serwer lokalny (development).
   Serwuje pliki z public/ i przekazuje /api oraz /uploads
   do tego samego routera, który obsługuje produkcję na Vercelu.

   Uruchomienie:  npm run dev
   ═══════════════════════════════════════════════════════════ */
'use strict';

require('./lib/env').load();

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const api = require('./lib/api');
const store = require('./lib/store');
const { hashPassword } = require('./lib/util');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

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

async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/') { rel = '/index.html'; }
  if (rel === '/admin' || rel === '/admin/') { rel = '/admin/index.html'; }

  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) {          // ochrona przed ../../
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
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404 — nie znaleziono strony</h1><p><a href="/">Wróć na stronę główną</a></p>');
  }
}

const server = http.createServer(async function (req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
    return api.handleSafely(req, res, url);
  }
  return serveStatic(req, res, url.pathname);
});

/* ─────────── reset hasła z wiersza poleceń ─────────── */

async function resetPassword(newPass) {
  if (!newPass || newPass.length < 8) {
    console.log('Użycie: npm run reset-haslo -- TwojeNoweHaslo   (min. 8 znaków)');
    process.exit(1);
  }
  const h = hashPassword(newPass);
  await store.setPassword('admin', h.salt, h.hash);
  await store.saveSettings({ passwordChanged: true });
  console.log('✓ Hasło administratora zostało zmienione.');
  process.exit(0);
}

async function main() {
  const flag = process.argv.indexOf('--reset-haslo');
  if (flag !== -1) { return resetPassword(process.argv[flag + 1]); }

  try {
    await store.connect();          // sprawdzamy połączenie zanim wpuścimy ruch
  } catch (err) {
    console.error('\n✗ Nie udało się połączyć z bazą MongoDB:\n  ' + err.message + '\n');
    process.exit(1);
  }

  const settings = await store.getSettings();

  server.listen(PORT, function () {
    const line = '─'.repeat(52);
    console.log('\n' + line);
    console.log('  MIASTO 88 — serwer działa');
    console.log(line);
    console.log('  Strona:  http://localhost:' + PORT + '/');
    console.log('  Panel:   http://localhost:' + PORT + '/admin');
    console.log('  Baza:    MongoDB Atlas · ' + store.DB_NAME);
    if (!settings.passwordChanged) {
      console.log('  Login:   admin   ·   Hasło: miasto88  ← ZMIEŃ W PANELU');
    }
    console.log(line);
    console.log('  Zatrzymanie serwera: Ctrl + C\n');
  });
}

server.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.error('\n✗ Port ' + PORT + ' jest zajęty. Uruchom z innym portem:');
    console.error('   set PORT=3001 && npm run dev\n');
  } else {
    console.error(err);
  }
  process.exit(1);
});

main();
