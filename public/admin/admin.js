/* ═══════════════════════════════════════════════════════════
   MIASTO 88 — panel administracyjny
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var DAYS = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
  var MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  var STATUS = {
    new: 'Nowa', confirmed: 'Potwierdzona', done: 'Zrealizowana', cancelled: 'Odwołana'
  };
  var SLOTS = [
    { v: '', t: 'Galeria' },
    { v: 'hero', t: 'Zdjęcie główne (hero)' },
    { v: 'about1', t: 'O nas — duże' },
    { v: 'about2', t: 'O nas — małe' },
    { v: 'feature', t: 'Danie sztandarowe' }
  ];

  var state = { categories: [], dishes: [], gallery: [], settings: {}, hours: {}, reservations: [] };
  var resFilter = { status: 'all', q: '' };

  /* ─────────── API ─────────── */

  function api(path, method, body) {
    return fetch(path, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.status === 401 && path.indexOf('/api/auth/') !== 0) { showLogin(); }
        return { ok: r.ok, status: r.status, data: data };
      });
    });
  }

  /* ─────────── DROBIAZGI ─────────── */

  function toast(msg, kind) {
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'toast' + (kind ? ' is-' + kind : '');
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.hidden = true; }, 3200);
  }

  function flashSaved() {
    var f = $('#saveFlag');
    f.hidden = false;
    clearTimeout(f._t);
    f._t = setTimeout(function () { f.hidden = true; }, 2200);
  }

  function shortDate(iso) {
    var p = String(iso).split('-');
    if (p.length !== 3) { return iso; }
    return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1];
  }

  function dayName(iso) {
    var d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? '' : DAYS[d.getDay()].toLowerCase();
  }

  function isoToday() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ─────────── LOGOWANIE ─────────── */

  function showLogin() {
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    setTimeout(function () { $('#l-pass').focus(); }, 60);
  }

  function showApp() {
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
  }

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('#loginBtn');
    var err = $('#loginErr');
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Logowanie…';

    api('/api/auth/login', 'POST', {
      username: $('#l-user').value,
      password: $('#l-pass').value
    }).then(function (r) {
      btn.disabled = false;
      btn.textContent = 'Zaloguj się';
      if (!r.ok) {
        err.textContent = r.data.error || 'Nie udało się zalogować.';
        err.hidden = false;
        return;
      }
      $('#l-pass').value = '';
      showApp();
      loadAll();
    });
  });

  $('#logoutBtn').addEventListener('click', function () {
    api('/api/auth/logout', 'POST').then(showLogin);
  });

  /* ─────────── NAWIGACJA ─────────── */

  $$('.snav').forEach(function (b) {
    b.addEventListener('click', function () {
      var view = b.dataset.view;
      $$('.snav').forEach(function (x) { x.classList.toggle('is-active', x === b); });
      $$('.view').forEach(function (v) { v.classList.toggle('is-active', v.dataset.view === view); });
      $('#viewTitle').textContent = b.textContent.trim().replace(/\s*\d+$/, '');
      $('#side').classList.remove('is-open');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  $('#sideToggle').addEventListener('click', function () { $('#side').classList.toggle('is-open'); });

  /* ─────────── MODAL ─────────── */

  function modal(title, bodyHtml, actions) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHtml;
    var foot = $('#modalFoot');
    foot.innerHTML = '';
    (actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'btn ' + (a.kind || 'btn--line');
      b.textContent = a.label;
      b.addEventListener('click', function () { a.onClick(closeModal); });
      foot.appendChild(b);
    });
    $('#modal').hidden = false;
    var first = $('#modalBody input, #modalBody select, #modalBody textarea');
    if (first) { setTimeout(function () { first.focus(); }, 60); }
  }
  function closeModal() { $('#modal').hidden = true; }
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', function (e) { if (e.target === $('#modal')) { closeModal(); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeModal(); } });

  function modalValues() {
    var out = {};
    $$('#modalBody [name]').forEach(function (el) {
      out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return out;
  }

  /* ═══════════ PULPIT ═══════════ */

  function renderOverview(o) {
    $('#statCards').innerHTML = [
      card(o.newCount, 'nowych rezerwacji', o.newCount > 0),
      card(o.todayCount, 'rezerwacji na dziś'),
      card(o.guestsToday + ' / ' + o.seats, 'gości dziś / miejsc'),
      card(o.upcomingCount, 'nadchodzących'),
      card(o.dishesCount, 'dań w karcie'),
      card(o.galleryCount, 'zdjęć w galerii')
    ].join('');

    $('#navNew').hidden = !o.newCount;
    $('#navNew').textContent = o.newCount;
    $('#passWarn').hidden = !!o.passwordChanged;

    function card(value, label, hot) {
      return '<div class="card' + (hot ? ' card--hot' : '') + '"><b>' + esc(value) + '</b><span>' + label + '</span></div>';
    }
  }

  function renderToday() {
    var today = isoToday();
    var list = state.reservations.filter(function (r) {
      return r.date === today && r.status !== 'cancelled';
    });
    $('#todayList').innerHTML = list.length ? table(list) : '<p class="empty">Na dziś nie ma jeszcze rezerwacji.</p>';
    wireResActions($('#todayList'));
  }

  /* ═══════════ REZERWACJE ═══════════ */

  function table(items) {
    var rows = items.map(function (r) {
      return '<tr data-id="' + r.id + '">'
        + '<td class="num"><b>' + esc(r.time) + '</b><br><small>' + shortDate(r.date) + ' · ' + dayName(r.date) + '</small></td>'
        + '<td class="who"><strong>' + esc(r.name) + '</strong><small>' + esc(r.phone) + '</small></td>'
        + '<td class="num">' + esc(r.people) + ' os.</td>'
        + '<td>' + (r.note ? '<small>' + esc(r.note) + '</small>' : '<small style="opacity:.4">—</small>') + '</td>'
        + '<td><span class="pill pill--' + r.status + '">' + STATUS[r.status] + '</span></td>'
        + '<td><div class="acts">'
        + (r.status !== 'confirmed' ? '<button class="btn btn--sm btn--line" data-act="confirmed">Potwierdź</button>' : '')
        + (r.status !== 'done' ? '<button class="btn btn--sm btn--line" data-act="done">Zrealizowana</button>' : '')
        + (r.status !== 'cancelled' ? '<button class="btn btn--sm btn--bad" data-act="cancelled">Odwołaj</button>' : '')
        + '<button class="btn btn--sm btn--line" data-act="edit">Edytuj</button>'
        + '<button class="btn btn--sm btn--bad" data-act="delete">Usuń</button>'
        + '</div></td></tr>';
    }).join('');

    return '<table class="tbl"><thead><tr>'
      + '<th>Termin</th><th>Gość</th><th>Osób</th><th>Uwagi</th><th>Status</th><th></th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function renderReservations() {
    var list = state.reservations.slice();

    if (resFilter.status !== 'all') {
      list = list.filter(function (r) { return r.status === resFilter.status; });
    }
    if (resFilter.q) {
      var q = resFilter.q.toLowerCase();
      list = list.filter(function (r) {
        return (r.name + ' ' + r.phone + ' ' + (r.note || '')).toLowerCase().indexOf(q) !== -1;
      });
    }

    $('#resList').innerHTML = list.length ? table(list) : '<p class="empty">Brak rezerwacji spełniających kryteria.</p>';
    wireResActions($('#resList'));
  }

  function wireResActions(root) {
    $$('[data-act]', root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').dataset.id;
        var act = btn.dataset.act;
        var item = state.reservations.find(function (r) { return r.id === id; });

        if (act === 'delete') {
          if (!confirm('Usunąć rezerwację: ' + item.name + ', ' + item.date + ' ' + item.time + '?')) { return; }
          api('/api/admin/reservations/' + id, 'DELETE').then(function () {
            toast('Rezerwacja usunięta', 'ok');
            loadReservations();
          });
          return;
        }
        if (act === 'edit') { return editReservation(item); }

        api('/api/admin/reservations/' + id, 'PATCH', { status: act }).then(function (r) {
          if (!r.ok) { return toast(r.data.error || 'Nie udało się zmienić statusu', 'bad'); }
          toast('Status: ' + STATUS[act], 'ok');
          loadReservations();
        });
      });
    });
  }

  function reservationForm(v) {
    v = v || {};
    return '<div class="fgrid">'
      + '<label>Imię i nazwisko<input name="name" value="' + esc(v.name || '') + '"></label>'
      + '<label>Telefon<input name="phone" value="' + esc(v.phone || '') + '"></label>'
      + '<label>Data<input name="date" type="date" value="' + esc(v.date || isoToday()) + '"></label>'
      + '<label>Godzina<input name="time" type="time" step="900" value="' + esc(v.time || '18:00') + '"></label>'
      + '<label>Liczba osób<input name="people" type="number" min="1" value="' + esc(v.people || 2) + '"></label>'
      + '<label class="wide">Uwagi<textarea name="note" rows="2">' + esc(v.note || '') + '</textarea></label>'
      + '<label class="wide">Notatka wewnętrzna<textarea name="adminNote" rows="2">' + esc(v.adminNote || '') + '</textarea></label>'
      + '</div>';
  }

  $('#addResBtn').addEventListener('click', function () {
    modal('Nowa rezerwacja (telefoniczna)', reservationForm(), [
      { label: 'Anuluj', onClick: function (close) { close(); } },
      {
        label: 'Dodaj', kind: 'btn--gold', onClick: function (close) {
          var v = modalValues();
          v.people = Number(v.people);
          api('/api/admin/reservations', 'POST', v).then(function (r) {
            if (!r.ok) { return toast(firstError(r.data) || 'Sprawdź dane', 'bad'); }
            close(); toast('Rezerwacja dodana', 'ok'); loadReservations();
          });
        }
      }
    ]);
  });

  function editReservation(item) {
    modal('Edycja rezerwacji', reservationForm(item), [
      { label: 'Zamknij', onClick: function (close) { close(); } },
      {
        label: 'Zapisz', kind: 'btn--gold', onClick: function (close) {
          var v = modalValues();
          v.people = Number(v.people);
          api('/api/admin/reservations/' + item.id, 'PATCH', v).then(function (r) {
            if (!r.ok) { return toast(firstError(r.data) || 'Sprawdź dane', 'bad'); }
            close(); toast('Zapisano', 'ok'); loadReservations();
          });
        }
      }
    ]);
  }

  function firstError(data) {
    if (data.error) { return data.error; }
    if (data.errors) { return data.errors[Object.keys(data.errors)[0]]; }
    return '';
  }

  $('#resFilters').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) { return; }
    $$('.chip', $('#resFilters')).forEach(function (c) { c.classList.toggle('is-active', c === chip); });
    resFilter.status = chip.dataset.status;
    renderReservations();
  });

  $('#resSearch').addEventListener('input', function () {
    resFilter.q = this.value.trim();
    renderReservations();
  });

  /* ═══════════ MENU ═══════════ */

  function renderMenuAdmin() {
    var box = $('#menuAdmin');
    if (!state.categories.length) {
      box.innerHTML = '<p class="empty">Brak kategorii. Dodaj pierwszą, aby zacząć budować kartę.</p>';
      return;
    }

    box.innerHTML = state.categories
      .slice().sort(function (a, b) { return a.order - b.order; })
      .map(function (cat) {
        var dishes = state.dishes
          .filter(function (d) { return d.categoryId === cat.id; })
          .sort(function (a, b) { return a.order - b.order; });

        var rows = dishes.map(function (d) {
          var priceTxt = Array.isArray(d.prices) && d.prices.length > 1
            ? d.prices.map(function (v) {
              return typeof v === 'number' ? Number(v).toFixed(2).replace('.', ',') : '—';
            }).join(' / ') + ' zł'
            : Number(d.price).toFixed(2).replace('.', ',') + ' zł';

          return '<div class="dishrow' + (d.visible === false ? ' is-hidden' : '') + '" data-dish="' + d.id + '">'
            + '<div class="dishrow__main"><b>' + esc(d.name) + '</b>'
            + (d.tag ? '<span class="minitag">' + esc(d.tag) + '</span>' : '')
            + (d.desc ? '<small>' + esc(d.desc) + '</small>' : '') + '</div>'
            + '<span class="dishrow__price">' + priceTxt + '</span>'
            + '<div class="acts">'
            + '<button class="btn btn--sm btn--line" data-dact="toggle">' + (d.visible === false ? 'Pokaż' : 'Ukryj') + '</button>'
            + '<button class="btn btn--sm btn--line" data-dact="edit">Edytuj</button>'
            + '<button class="btn btn--sm btn--bad" data-dact="del">Usuń</button>'
            + '</div></div>';
        }).join('') || '<div class="dishrow"><small style="opacity:.5">Brak dań w tej kategorii.</small></div>';

        var vars = Array.isArray(cat.variants) && cat.variants.length
          ? '<small>ceny: ' + esc(cat.variants.join(' / ')) + '</small>' : '';

        return '<div class="catblock" data-cat="' + cat.id + '">'
          + '<div class="catblock__head"><h3>' + esc(cat.name) + '</h3>'
          + (cat.note ? '<small>' + esc(cat.note) + '</small>' : '') + vars
          + '<div class="acts">'
          + '<button class="btn btn--sm btn--line" data-cact="edit">Edytuj</button>'
          + '<button class="btn btn--sm btn--bad" data-cact="del">Usuń</button>'
          + '</div></div>' + rows + '</div>';
      }).join('');

    $$('[data-cact]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.closest('[data-cat]').dataset.cat;
        var cat = state.categories.find(function (c) { return c.id === id; });
        if (b.dataset.cact === 'del') {
          var n = state.dishes.filter(function (d) { return d.categoryId === id; }).length;
          if (!confirm('Usunąć kategorię „' + cat.name + '"' + (n ? ' wraz z ' + n + ' daniami' : '') + '?')) { return; }
          api('/api/admin/categories/' + id, 'DELETE').then(function () {
            toast('Kategoria usunięta', 'ok'); loadMenu();
          });
        } else { categoryModal(cat); }
      });
    });

    $$('[data-dact]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.closest('[data-dish]').dataset.dish;
        var dish = state.dishes.find(function (d) { return d.id === id; });
        var act = b.dataset.dact;

        if (act === 'del') {
          if (!confirm('Usunąć danie „' + dish.name + '"?')) { return; }
          api('/api/admin/dishes/' + id, 'DELETE').then(function () { toast('Danie usunięte', 'ok'); loadMenu(); });
        } else if (act === 'toggle') {
          api('/api/admin/dishes/' + id, 'PATCH', { visible: dish.visible === false }).then(function () { loadMenu(); });
        } else { dishModal(dish); }
      });
    });
  }

  function categoryModal(cat) {
    var isNew = !cat;
    cat = cat || {};
    modal(isNew ? 'Nowa kategoria' : 'Edycja kategorii',
      '<div class="fgrid">'
      + '<label>Nazwa<input name="name" value="' + esc(cat.name || '') + '"></label>'
      + '<label>Dopisek (np. „w zestawie z frytkami")<input name="note" value="' + esc(cat.note || '') + '"></label>'
      + '<label>Kolejność<input name="order" type="number" min="1" value="' + esc(cat.order || state.categories.length + 1) + '"></label>'
      + '<label class="wide">Kolumny cenowe — po przecinku, np. <b>30 cm, 40 cm, 50 cm</b>. Zostaw puste, jeśli dania mają jedną cenę.'
      + '<input name="variants" value="' + esc((cat.variants || []).join(', ')) + '" placeholder="np. 30 cm, 40 cm, 50 cm"></label>'
      + '</div>',
      [
        { label: 'Anuluj', onClick: function (c) { c(); } },
        {
          label: isNew ? 'Dodaj' : 'Zapisz', kind: 'btn--gold', onClick: function (close) {
            var v = modalValues();
            v.order = Number(v.order);
            api('/api/admin/categories' + (isNew ? '' : '/' + cat.id), isNew ? 'POST' : 'PATCH', v)
              .then(function (r) {
                if (!r.ok) { return toast(firstError(r.data) || 'Sprawdź dane', 'bad'); }
                close(); toast('Zapisano', 'ok'); loadMenu();
              });
          }
        }
      ]);
  }

  function dishModal(dish) {
    var isNew = !dish;
    dish = dish || {};
    var catId = dish.categoryId || (state.categories[0] && state.categories[0].id);
    var options = state.categories.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === catId ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');

    function priceFields(categoryId) {
      var cat = state.categories.find(function (c) { return c.id === categoryId; });
      var variants = (cat && cat.variants) || [];
      if (!variants.length) {
        return '<label>Cena (zł)<input name="price" type="number" step="0.5" min="0" value="'
          + esc(dish.price != null ? dish.price : '') + '"></label>';
      }
      return variants.map(function (label, i) {
        var v = Array.isArray(dish.prices) && dish.prices[i] != null ? dish.prices[i] : '';
        return '<label>Cena — ' + esc(label) + ' (zł)<input name="price' + i + '" type="number" step="0.5" min="0" '
          + 'value="' + esc(v) + '" placeholder="puste = brak"></label>';
      }).join('');
    }

    modal(isNew ? 'Nowe danie' : 'Edycja dania',
      '<div class="fgrid">'
      + '<label class="wide">Nazwa<input name="name" value="' + esc(dish.name || '') + '"></label>'
      + '<label>Kategoria<select name="categoryId">' + options + '</select></label>'
      + '<label>Kolejność<input name="order" type="number" min="1" value="' + esc(dish.order || 1) + '"></label>'
      + '<div class="wide fgrid" id="priceBox" style="padding:0">' + priceFields(catId) + '</div>'
      + '<label class="wide">Opis / składniki<textarea name="desc" rows="2">' + esc(dish.desc || '') + '</textarea></label>'
      + '<label>Etykieta (np. nowość, hit, wege)<input name="tag" value="' + esc(dish.tag || '') + '"></label>'
      + '<label class="row-check"><input name="visible" type="checkbox"' + (dish.visible !== false ? ' checked' : '') + '> Widoczne na stronie</label>'
      + '</div>',
      [
        { label: 'Anuluj', onClick: function (c) { c(); } },
        {
          label: isNew ? 'Dodaj' : 'Zapisz', kind: 'btn--gold', onClick: function (close) {
            var v = modalValues();
            var cat = state.categories.find(function (c) { return c.id === v.categoryId; });
            var variants = (cat && cat.variants) || [];

            if (variants.length) {
              v.prices = variants.map(function (_, i) { return v['price' + i]; });
              variants.forEach(function (_, i) { delete v['price' + i]; });
              if (!v.prices.some(function (x) { return String(x).trim() !== ''; })) {
                return toast('Podaj cenę przynajmniej dla jednego rozmiaru', 'bad');
              }
              v.price = 0;
            } else {
              v.price = Number(v.price);
              v.prices = [];
            }
            v.order = Number(v.order);

            api('/api/admin/dishes' + (isNew ? '' : '/' + dish.id), isNew ? 'POST' : 'PATCH', v)
              .then(function (r) {
                if (!r.ok) { return toast(firstError(r.data) || 'Sprawdź dane', 'bad'); }
                close(); toast('Zapisano', 'ok'); loadMenu();
              });
          }
        }
      ]);

    // zmiana kategorii przebudowuje pola cen (jedna cena ↔ rozmiary)
    var sel = document.querySelector('#modalBody [name="categoryId"]');
    if (sel) {
      sel.addEventListener('change', function () {
        document.querySelector('#priceBox').innerHTML = priceFields(sel.value);
      });
    }
  }

  $('#addCatBtn').addEventListener('click', function () { categoryModal(null); });
  $('#addDishBtn').addEventListener('click', function () {
    if (!state.categories.length) { return toast('Najpierw dodaj kategorię', 'bad'); }
    dishModal(null);
  });

  /* ═══════════ GALERIA ═══════════ */

  function renderGalleryAdmin() {
    var box = $('#galleryAdmin');
    if (!state.gallery.length) {
      box.innerHTML = '<p class="empty">Brak zdjęć. Wgraj pierwsze powyżej.</p>';
      return;
    }
    box.innerHTML = state.gallery.map(function (g) {
      var opts = SLOTS.map(function (s) {
        return '<option value="' + s.v + '"' + (s.v === (g.slot || '') ? ' selected' : '') + '>' + s.t + '</option>';
      }).join('');
      return '<div class="imgcard" data-img="' + g.id + '">'
        + '<img src="' + esc(g.src) + '" alt="' + esc(g.alt) + '">'
        + '<div class="imgcard__body">'
        + '<input data-f="alt" value="' + esc(g.alt) + '" placeholder="Opis zdjęcia">'
        + '<select data-f="slot">' + opts + '</select>'
        + '<button class="btn btn--sm btn--bad" data-f="del">Usuń zdjęcie</button>'
        + '</div></div>';
    }).join('');

    $$('.imgcard', box).forEach(function (cardEl) {
      var id = cardEl.dataset.img;
      var save = function () {
        api('/api/admin/gallery/' + id, 'PATCH', {
          alt: $('[data-f="alt"]', cardEl).value,
          slot: $('[data-f="slot"]', cardEl).value
        }).then(function () { flashSaved(); loadGallery(); });
      };
      $('[data-f="alt"]', cardEl).addEventListener('change', save);
      $('[data-f="slot"]', cardEl).addEventListener('change', save);
      $('[data-f="del"]', cardEl).addEventListener('click', function () {
        if (!confirm('Usunąć to zdjęcie?')) { return; }
        api('/api/admin/gallery/' + id, 'DELETE').then(function () { toast('Zdjęcie usunięte', 'ok'); loadGallery(); });
      });
    });
  }

  function uploadFiles(files) {
    var list = Array.prototype.slice.call(files).filter(function (f) { return /^image\//.test(f.type); });
    if (!list.length) { return toast('To nie są pliki graficzne', 'bad'); }

    var bar = $('#upBar');
    var fill = $('i', bar);
    bar.hidden = false;
    var done = 0;

    var step = function () {
      done++;
      fill.style.width = Math.round((done / list.length) * 100) + '%';
      if (done === list.length) {
        setTimeout(function () { bar.hidden = true; fill.style.width = '0'; }, 600);
        toast('Wgrano ' + list.length + ' zdj.', 'ok');
        loadGallery();
      }
    };

    list.forEach(function (file) {
      if (file.size > 6 * 1024 * 1024) {
        toast(file.name + ': plik większy niż 6 MB', 'bad');
        return step();
      }
      var reader = new FileReader();
      reader.onload = function () {
        api('/api/admin/gallery', 'POST', {
          dataUrl: reader.result,
          alt: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
        }).then(function (r) {
          if (!r.ok) { toast(r.data.error || 'Błąd wgrywania', 'bad'); }
          step();
        });
      };
      reader.onerror = step;
      reader.readAsDataURL(file);
    });
  }

  $('#pickBtn').addEventListener('click', function () { $('#fileInput').click(); });
  $('#fileInput').addEventListener('change', function () { uploadFiles(this.files); this.value = ''; });

  var dz = $('#dropZone');
  ['dragenter', 'dragover'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('is-over'); });
  });
  dz.addEventListener('drop', function (e) { uploadFiles(e.dataTransfer.files); });

  /* ═══════════ GODZINY ═══════════ */

  function renderHoursAdmin() {
    var order = [1, 2, 3, 4, 5, 6, 0];
    $('#hoursAdmin').innerHTML = order.map(function (day) {
      var h = state.hours[day] || { open: '11:00', close: '22:00', closed: false };
      var close = h.close === '24:00' ? '23:59' : h.close;
      return '<div class="hrow' + (h.closed ? ' is-closed' : '') + '" data-day="' + day + '">'
        + '<strong>' + DAYS[day] + '</strong>'
        + '<label><input type="checkbox" data-f="closed"' + (h.closed ? ' checked' : '') + '> zamknięte</label>'
        + '<input type="time" data-f="open" value="' + h.open + '">'
        + '<input type="time" data-f="close" value="' + close + '" data-orig="' + esc(h.close) + '">'
        + '</div>';
    }).join('');

    $$('#hoursAdmin [data-f="closed"]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        cb.closest('.hrow').classList.toggle('is-closed', cb.checked);
      });
    });
  }

  $('#saveHours').addEventListener('click', function () {
    var payload = {};
    $$('#hoursAdmin .hrow').forEach(function (row) {
      var day = row.dataset.day;
      var closeEl = $('[data-f="close"]', row);
      var close = closeEl.value;
      // 23:59 i 00:00 traktujemy jako północ — serwer rozumie 24:00
      if (close === '23:59' || close === '00:00') { close = '24:00'; }
      payload[day] = {
        closed: $('[data-f="closed"]', row).checked,
        open: $('[data-f="open"]', row).value,
        close: close
      };
    });
    api('/api/admin/hours', 'PUT', payload).then(function (r) {
      if (!r.ok) { return toast(r.data.error || 'Nie udało się zapisać', 'bad'); }
      state.hours = r.data.hours;
      renderHoursAdmin();
      toast('Godziny zapisane', 'ok');
      flashSaved();
    });
  });

  /* ═══════════ USTAWIENIA ═══════════ */

  function fillSettings() {
    var form = $('#settingsForm');
    Object.keys(state.settings).forEach(function (k) {
      var el = form.elements[k];
      if (el) { el.value = state.settings[k]; }
    });
  }

  $('#settingsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var out = {};
    $$('#settingsForm [name]').forEach(function (el) { out[el.name] = el.value; });
    api('/api/admin/settings', 'PUT', out).then(function (r) {
      if (!r.ok) { return toast(r.data.error || 'Nie udało się zapisać', 'bad'); }
      state.settings = r.data.settings;
      toast('Ustawienia zapisane', 'ok');
      flashSaved();
    });
  });

  /* ═══════════ HASŁO ═══════════ */

  $('#passForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = $('#passMsg');
    var f = e.target.elements;
    msg.hidden = false;

    if (f.next.value !== f.repeat.value) {
      msg.className = 'msg msg--bad';
      msg.textContent = 'Nowe hasła nie są takie same.';
      return;
    }
    api('/api/admin/password', 'POST', { current: f.current.value, next: f.next.value })
      .then(function (r) {
        if (!r.ok) {
          msg.className = 'msg msg--bad';
          msg.textContent = firstError(r.data) || 'Nie udało się zmienić hasła.';
          return;
        }
        msg.className = 'msg msg--ok';
        msg.textContent = 'Hasło zostało zmienione.';
        e.target.reset();
        $('#passWarn').hidden = true;
        toast('Hasło zmienione', 'ok');
      });
  });

  /* ═══════════ ŁADOWANIE DANYCH ═══════════ */

  function loadReservations() {
    return api('/api/admin/reservations').then(function (r) {
      if (!r.ok) { return; }
      state.reservations = r.data.items;
      renderReservations();
      renderToday();
      return api('/api/admin/overview').then(function (o) {
        if (o.ok) { renderOverview(o.data); }
      });
    });
  }

  function loadMenu() {
    return Promise.all([api('/api/admin/categories'), api('/api/admin/dishes')]).then(function (rs) {
      if (rs[0].ok) { state.categories = rs[0].data.items; }
      if (rs[1].ok) { state.dishes = rs[1].data.items; }
      renderMenuAdmin();
    });
  }

  function loadGallery() {
    return api('/api/admin/gallery').then(function (r) {
      if (!r.ok) { return; }
      state.gallery = r.data.items;
      renderGalleryAdmin();
    });
  }

  function loadSettings() {
    return api('/api/admin/settings').then(function (r) {
      if (!r.ok) { return; }
      state.settings = r.data.settings;
      fillSettings();
    });
  }

  function loadHours() {
    return api('/api/content').then(function (r) {
      if (!r.ok) { return; }
      state.hours = r.data.hours;
      renderHoursAdmin();
    });
  }

  function loadAll() {
    loadReservations();
    loadMenu();
    loadGallery();
    loadSettings();
    loadHours();
  }

  /* ═══════════ START ═══════════ */

  api('/api/auth/me').then(function (r) {
    if (r.ok) { showApp(); loadAll(); }
    else { showLogin(); }
  });

  // odświeżaj rezerwacje co minutę, gdy karta jest aktywna
  setInterval(function () {
    if (!document.hidden && !$('#appView').hidden) { loadReservations(); }
  }, 60000);
})();
