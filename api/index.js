/* ═══════════════════════════════════════════════════════════
   Wejście dla Vercela — funkcja serverless.
   Pliki z public/ serwuje sam Vercel; tutaj trafia tylko
   /api/… oraz /uploads/… (patrz vercel.json).
   ═══════════════════════════════════════════════════════════ */
'use strict';

const api = require('../lib/api');

module.exports = async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const url = new URL(req.url, proto + '://' + host);

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');

  await api.handleSafely(req, res, url);
};
