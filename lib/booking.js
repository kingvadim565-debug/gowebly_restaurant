/* ═══════════════════════════════════════════════════════════
   Godziny otwarcia i dostępność stolików — czysta logika.
   Funkcje nie sięgają do bazy; wszystko dostają w argumentach,
   dzięki czemu działają tak samo lokalnie i na Vercelu.
   ═══════════════════════════════════════════════════════════ */
'use strict';

const { toMinutes, fromMinutes } = require('./util');

/** Czy lokal jest teraz otwarty (uwzględnia godziny przechodzące przez północ). */
function openNow(hours, now) {
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();

  const today = hours[day];
  if (today && !today.closed) {
    const o = toMinutes(today.open);
    let c = toMinutes(today.close);
    if (c <= o) { c += 1440; }
    if (mins >= o && mins < c) {
      return { open: true, until: today.close === '24:00' ? '00:00' : today.close };
    }
  }

  const prev = hours[(day + 6) % 7];
  if (prev && !prev.closed) {
    const po = toMinutes(prev.open);
    let pc = toMinutes(prev.close);
    if (pc <= po) {
      pc += 1440;
      if (mins + 1440 < pc) { return { open: true, until: prev.close }; }
    }
  }

  for (let i = 0; i < 8; i++) {
    const h = hours[(day + i) % 7];
    if (!h || h.closed) { continue; }
    if (i === 0 && mins >= toMinutes(h.open)) { continue; }
    return { open: false, next: h.open, sameDay: i === 0 };
  }
  return { open: false };
}

/** Lista godzin, na które można rezerwować danego dnia (co 30 minut). */
function slotsForDate(hours, settings, dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  if (isNaN(date)) { return []; }
  const h = hours[date.getDay()];
  if (!h || h.closed) { return []; }

  const open = toMinutes(h.open);
  let close = toMinutes(h.close);
  if (close <= open) { close += 1440; }

  // ostatnia rezerwacja musi się zmieścić przed zamknięciem
  const last = close - Math.min(settings.slotMinutes, 60);
  const out = [];
  for (let m = open; m <= last; m += 30) { out.push(fromMinutes(m)); }
  return out;
}

/** Ile miejsc jest już zajętych w oknie czasowym danej rezerwacji. */
function seatsTaken(settings, dayReservations, timeStr, ignoreId) {
  const slot = settings.slotMinutes;
  const start = toMinutes(timeStr);
  const end = start + slot;

  return dayReservations.reduce(function (sum, r) {
    if (r.id === ignoreId) { return sum; }
    const rs = toMinutes(r.time);
    const re = rs + slot;
    const overlap = rs < end && re > start;
    return overlap ? sum + Number(r.people || 0) : sum;
  }, 0);
}

function availability(settings, dayReservations, timeStr, people, ignoreId) {
  const seats = settings.seats;
  const taken = seatsTaken(settings, dayReservations, timeStr, ignoreId);
  const free = Math.max(0, seats - taken);
  return { seats, taken, free, ok: free >= Number(people || 1) };
}

/**
 * Sprawdza dane rezerwacji.
 * ctx = { settings, hours, dayReservations }
 * opts = { admin, ignoreId }
 */
function validateReservation(ctx, body, opts) {
  const errors = {};
  const s = ctx.settings;
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

    const slots = slotsForDate(ctx.hours, s, date);
    if (!slots.length) {
      errors.date = 'W tym dniu jest zamknięte. Wybierz inny termin.';
    } else if (slots.indexOf(time) === -1) {
      errors.time = 'O tej godzinie nie przyjmujemy gości. Dostępne godziny: ' + slots[0] + '–' + slots[slots.length - 1] + '.';
    }
  }

  if (Object.keys(errors).length) { return { errors }; }

  const av = availability(s, ctx.dayReservations || [], time, people, opts && opts.ignoreId);
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

module.exports = { openNow, slotsForDate, seatsTaken, availability, validateReservation };
