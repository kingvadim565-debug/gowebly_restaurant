/* ═══════════════════════════════════════════════════════════
   Sesje bez serwera stanowego.
   Wcześniej sesje leżały w pamięci procesu — na Vercelu to nie działa,
   bo każde żądanie może trafić do innej instancji funkcji. Zamiast tego
   podpisujemy ciasteczko kluczem HMAC: serwer nie musi nic pamiętać,
   a podrobić go nie da się bez znajomości sekretu.
   ═══════════════════════════════════════════════════════════ */
'use strict';

const crypto = require('crypto');
const { parseCookies } = require('./util');

const COOKIE = 'm88_session';
const TTL_SECONDS = 8 * 60 * 60;   // 8 godzin

let warned = false;

function secret() {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) { return fromEnv; }

  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw new Error(
      'Brak zmiennej SESSION_SECRET (min. 16 znaków). ' +
      'Ustaw ją w panelu hostingu — bez niej nie da się bezpiecznie podpisać sesji.'
    );
  }
  // tryb lokalny: losowy sekret na czas życia procesu (restart = wylogowanie)
  if (!global.__m88devSecret) {
    global.__m88devSecret = crypto.randomBytes(32).toString('hex');
    if (!warned) {
      warned = true;
      console.log('→ SESSION_SECRET nieustawiony — używam losowego (tylko lokalnie).');
    }
  }
  return global.__m88devSecret;
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

function createToken(username) {
  const expires = Date.now() + TTL_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ u: username, e: expires })).toString('base64url');
  return payload + '.' + sign(payload);
}

function readToken(token) {
  if (!token || token.indexOf('.') === -1) { return null; }
  const [payload, given] = token.split('.');
  const expected = sign(payload);

  // porównanie odporne na pomiar czasu
  const a = Buffer.from(given || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { return null; }

  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch (e) { return null; }

  if (!data || !data.u || !data.e || data.e < Date.now()) { return null; }
  return { username: data.u, expires: data.e };
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  return readToken(cookies[COOKIE]);
}

function cookieHeader(token, secure) {
  const parts = [
    COOKIE + '=' + (token || ''),
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    'Max-Age=' + (token ? TTL_SECONDS : 0)
  ];
  if (secure) { parts.push('Secure'); }
  return parts.join('; ');
}

/** Po HTTPS ciasteczko musi mieć flagę Secure; lokalnie po http — nie może. */
function isSecureRequest(req) {
  if (process.env.VERCEL) { return true; }
  const proto = req.headers['x-forwarded-proto'];
  if (proto) { return String(proto).split(',')[0].trim() === 'https'; }
  return Boolean(req.socket && req.socket.encrypted);
}

module.exports = { COOKIE, TTL_SECONDS, createToken, getSession, cookieHeader, isSecureRequest };
