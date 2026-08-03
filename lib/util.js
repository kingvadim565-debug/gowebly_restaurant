/* ═══════════════════════════════════════════════════════════
   Narzędzia wspólne dla serwera lokalnego i funkcji na Vercelu.
   ═══════════════════════════════════════════════════════════ */
'use strict';

const crypto = require('crypto');

/* ─────────── identyfikatory i hasła ─────────── */

function uid(prefix) {
  return (prefix || '') + crypto.randomBytes(6).toString('hex');
}

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  return { salt: s, hash: crypto.scryptSync(password, s, 64).toString('hex') };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return stored.length === check.length && crypto.timingSafeEqual(stored, check);
}

/* ─────────── czas ─────────── */

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function fromMinutes(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
}

/* ─────────── walidacja pól menu ─────────── */

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

/* ─────────── ciasteczka ─────────── */

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(function (part) {
    const i = part.indexOf('=');
    if (i > 0) { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  });
  return out;
}

module.exports = {
  uid, hashPassword, verifyPassword,
  toMinutes, fromMinutes, pad2,
  parseVariants, parsePrices, parseCookies
};
