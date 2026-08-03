/* Wczytuje plik .env bez żadnej biblioteki — na Vercelu zmienne
   są już w środowisku, więc plik po prostu nie istnieje i nic się nie dzieje. */
'use strict';

const fs = require('fs');
const path = require('path');

function load(file) {
  const target = file || path.join(__dirname, '..', '.env');
  let text;
  try { text = fs.readFileSync(target, 'utf8'); }
  catch (e) { return false; }

  text.split(/\r?\n/).forEach(function (line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) { return; }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) { return; }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) { process.env[key] = value; }
  });
  return true;
}

module.exports = { load };
