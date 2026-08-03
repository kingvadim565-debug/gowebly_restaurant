/* ═══════════════════════════════════════════════════════════
   MIASTO 88 — logika strony publicznej
   Cała treść pochodzi z API (/api/…), więc zmienia się z panelu.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var DAYS = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
  var MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
    'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

  var content = null;
  var galleryItems = [];

  /* ─────────── POMOCNICZE ─────────── */

  function api(path, options) {
    return fetch(path, Object.assign({
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin'
    }, options || {})).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        return { ok: r.ok, status: r.status, data: data };
      });
    });
  }

  function toMinutes(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  function isoToday() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function prettyDate(iso) {
    var p = iso.split('-');
    var d = new Date(iso + 'T12:00:00');
    return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1] + ' ' + p[0] + ' (' + DAYS[d.getDay()].toLowerCase() + ')';
  }

  function peopleWord(n) {
    if (n === 1) { return '1 osoba'; }
    var last = n % 10, tens = n % 100;
    if (last >= 2 && last <= 4 && !(tens >= 12 && tens <= 14)) { return n + ' osoby'; }
    return n + ' osób';
  }

  function money(v) {
    return Number(v).toLocaleString('pl-PL', { maximumFractionDigits: 2 }) + ' zł';
  }

  function setImage(el, src, alt) {
    if (!el || !src) { return; }
    el.style.setProperty('--img', 'url("' + src + '")');
    el.classList.add('has-img');
    if (alt) {
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', alt);
    }
  }

  /* ─────────── STATUS OTWARCIA ─────────── */

  function openState(hours, now) {
    var day = now.getDay();
    var mins = now.getHours() * 60 + now.getMinutes();

    var today = hours[day];
    if (today && !today.closed) {
      var o = toMinutes(today.open), c = toMinutes(today.close);
      if (c <= o) { c += 1440; }
      if (mins >= o && mins < c) {
        return { open: true, until: today.close === '24:00' ? '00:00' : today.close };
      }
    }
    var prev = hours[(day + 6) % 7];
    if (prev && !prev.closed) {
      var po = toMinutes(prev.open), pc = toMinutes(prev.close);
      if (pc <= po) {
        pc += 1440;
        if (mins + 1440 < pc) { return { open: true, until: prev.close }; }
      }
    }
    for (var i = 0; i < 8; i++) {
      var h = hours[(day + i) % 7];
      if (!h || h.closed) { continue; }
      if (i === 0 && mins >= toMinutes(h.open)) { continue; }
      return { open: false, next: h.open, sameDay: i === 0 };
    }
    return { open: false };
  }

  function renderStatus() {
    if (!content) { return; }
    var badge = $('#statusBadge');
    var s = openState(content.hours, new Date());
    badge.classList.toggle('is-open', !!s.open);
    badge.classList.toggle('is-closed', !s.open);
    $('[data-bind="statusText"]').textContent = s.open
      ? 'Otwarte · do ' + s.until
      : (s.next ? 'Zamknięte · otwieramy o ' + s.next : 'Dziś zamknięte');
  }

  /* ─────────── TREŚĆ ─────────── */

  function bindContent() {
    var s = content.settings;

    var map = {
      name: s.name, tagline: s.tagline, phone: s.phone,
      street: s.street, city: s.city,
      addressShort: s.street + ', ' + s.city,
      heroLead: s.heroLead,
      featureText: s.featureText,
      menuNote: s.menuNote,
      rating: String(s.rating).replace('.', ','),
      reviewsCount: Number(s.reviewsCount).toLocaleString('pl-PL')
    };
    Object.keys(map).forEach(function (key) {
      $$('[data-bind="' + key + '"]').forEach(function (el) { el.textContent = map[key]; });
    });

    $$('[data-bind-href="tel"]').forEach(function (el) { el.href = 'tel:' + s.phoneRaw; });

    var counts = { rating: s.rating, reviewsCount: s.reviewsCount, followers: s.followers };
    $$('[data-bind-count]').forEach(function (el) { el.dataset.target = counts[el.dataset.bindCount]; });

    $$('[data-bind-split]').forEach(function (el) { el.textContent = s[el.dataset.bindSplit] || ''; });

    $$('[data-bind-para]').forEach(function (el) {
      el.innerHTML = '';
      String(s[el.dataset.bindPara] || '').split('\n').forEach(function (line) {
        if (!line.trim()) { return; }
        var p = document.createElement('p');
        p.textContent = line.trim();
        el.appendChild(p);
      });
    });

    heroTitle(s);

    $('#routeLink').href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(s.mapsQuery);
    $('#fbLink').href = s.facebook || '#';
    $('#fbLink2').href = s.facebook || '#';
    $('#year').textContent = new Date().getFullYear();

    document.title = s.name + ' — restauracja · ' + s.city.replace(/^\d{2}-\d{3}\s*/, '');
  }

  /** Tytuł hero: pierwsza linia normalna, druga kursywą w czerwieni. */
  function heroTitle(s) {
    var el = $('#heroTitle');
    el.innerHTML = '';
    el.dataset.split = '1';        // Motion.splitAll ma to pominąć — budujemy ręcznie
    var index = 0;

    function addWords(text, cls) {
      String(text || '').trim().split(/\s+/).forEach(function (word) {
        if (!word) { return; }
        var wrap = document.createElement('span');
        wrap.className = 'word';
        var inner = document.createElement('i');
        inner.textContent = word;
        if (cls) { inner.className = cls; }
        inner.style.transitionDelay = (index++ * 70) + 'ms';
        wrap.appendChild(inner);
        el.appendChild(wrap);
        el.appendChild(document.createTextNode(' '));
      });
    }
    addWords(s.heroTitle, '');
    if (s.heroTitleAccent) {
      el.appendChild(document.createElement('br'));
      addWords(s.heroTitleAccent, 'accent');
    }
  }

  /* ─────────── ZDJĘCIA ─────────── */

  function applyImages() {
    var bySlot = {};
    content.gallery.forEach(function (g) { if (g.slot) { bySlot[g.slot] = g; } });

    [['heroImg', 'hero'], ['aboutImg1', 'about1'], ['aboutImg2', 'about2'], ['featureImg', 'feature']]
      .forEach(function (pair) {
        var img = bySlot[pair[1]];
        if (img) { setImage(document.getElementById(pair[0]), img.src, img.alt); }
      });

    galleryItems = content.gallery.filter(function (g) { return !g.slot; });
    renderGallery();
  }

  function renderGallery() {
    var box = $('#gallery');
    box.innerHTML = '';

    if (!galleryItems.length) {
      box.innerHTML = '<p class="gal__empty">Zdjęcia pojawią się tu, gdy dodasz je w panelu administracyjnym.</p>';
      return;
    }

    galleryItems.forEach(function (g, i) {
      var extra = i === 0 ? ' gitem--wide gitem--tall' : (i === 5 ? ' gitem--wide' : '');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gitem anim' + extra;
      b.dataset.anim = 'up';
      b.dataset.index = i;
      b.dataset.delay = Math.min(i * 60, 300);
      b.setAttribute('aria-label', 'Powiększ zdjęcie: ' + g.alt);

      var im = document.createElement('div');
      im.className = 'img';
      setImage(im, g.src);
      b.appendChild(im);

      var cap = document.createElement('span');
      cap.className = 'gitem__cap';
      cap.textContent = g.alt;
      b.appendChild(cap);

      box.appendChild(b);
    });

    window.Motion.observeReveals(box);
  }

  /* ─────────── LIGHTBOX ─────────── */

  function initLightbox() {
    var box = $('#lightbox');
    var img = $('#lbImg');
    var cap = $('#lbCap');
    var current = 0;

    function show(i) {
      if (!galleryItems.length) { return; }
      current = (i + galleryItems.length) % galleryItems.length;
      img.src = galleryItems[current].src;
      img.alt = galleryItems[current].alt;
      cap.textContent = galleryItems[current].alt;
      box.hidden = false;
      document.body.classList.add('is-locked');
      $('#lbClose').focus();
    }
    function hide() {
      box.hidden = true;
      document.body.classList.remove('is-locked');
    }

    $('#gallery').addEventListener('click', function (e) {
      var item = e.target.closest('.gitem');
      if (item) { show(Number(item.dataset.index)); }
    });
    $('#lbClose').addEventListener('click', hide);
    $('#lbPrev').addEventListener('click', function () { show(current - 1); });
    $('#lbNext').addEventListener('click', function () { show(current + 1); });
    box.addEventListener('click', function (e) { if (e.target === box) { hide(); } });
    document.addEventListener('keydown', function (e) {
      if (box.hidden) { return; }
      if (e.key === 'Escape') { hide(); }
      if (e.key === 'ArrowLeft') { show(current - 1); }
      if (e.key === 'ArrowRight') { show(current + 1); }
    });
  }

  /* ─────────── MENU ─────────── */

  var activeCat = 'all';

  function renderTabs() {
    var box = $('#menuTabs');
    var pill = $('#tabsPill');

    var cats = [{ id: 'all', name: 'Wszystko' }].concat(content.categories);
    cats.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab' + (c.id === activeCat ? ' is-active' : '');
      b.textContent = c.name;
      b.dataset.cat = c.id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(c.id === activeCat));
      box.appendChild(b);
    });

    function movePill() {
      var active = box.querySelector('.tab.is-active');
      if (!active) { pill.style.opacity = 0; return; }
      pill.style.opacity = 1;
      pill.style.width = active.offsetWidth + 'px';
      pill.style.transform = 'translateX(' + active.offsetLeft + 'px)';
    }

    box.addEventListener('click', function (e) {
      var tab = e.target.closest('.tab');
      if (!tab || tab.dataset.cat === activeCat) { return; }
      activeCat = tab.dataset.cat;
      box.querySelectorAll('.tab').forEach(function (t) {
        var on = t.dataset.cat === activeCat;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', String(on));
      });
      movePill();
      renderMenu();
    });

    box.addEventListener('scroll', movePill, { passive: true });
    window.addEventListener('resize', movePill);
    requestAnimationFrame(movePill);
    // czcionki wczytują się asynchronicznie i zmieniają szerokość zakładek
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(movePill); }
  }

  var menuGroups = [];

  /** Rozkłada karty na dwie kolumny tak, by obie kończyły się na podobnej wysokości. */
  function layoutMenu() {
    var list = $('#menuList');
    var colA = $('.mcol:first-child', list);
    var colB = $('.mcol:last-child', list);
    if (!colA || !colB || !menuGroups.length) { return; }

    // najpierw wszystko do pierwszej kolumny — wtedy pomiar wysokości jest miarodajny
    menuGroups.forEach(function (el) { colA.appendChild(el); });

    var oneColumn = menuGroups.length === 1 || window.innerWidth <= 1100;
    if (oneColumn) { return; }

    var n = menuGroups.length;
    var gap = 24;
    var heights = menuGroups.map(function (el) { return el.offsetHeight; });
    var split = n <= 16 ? bestSplit(heights, gap) : greedySplit(heights, gap);

    // w obrębie kolumny zachowujemy kolejność z karty (Pizza przed Burgerami itd.)
    split.a.sort(function (x, y) { return x - y; }).forEach(function (i) { colA.appendChild(menuGroups[i]); });
    split.b.sort(function (x, y) { return x - y; }).forEach(function (i) { colB.appendChild(menuGroups[i]); });
  }

  function columnHeight(indexes, heights, gap) {
    if (!indexes.length) { return 0; }
    return indexes.reduce(function (sum, i) { return sum + heights[i]; }, 0) + (indexes.length - 1) * gap;
  }

  /** Pełny przegląd podziałów — dla realistycznej liczby kategorii (≤16) liczy się natychmiast. */
  function bestSplit(heights, gap) {
    var n = heights.length;
    var best = null;
    // pierwsza kategoria zawsze w lewej kolumnie — dzięki temu wynik jest przewidywalny
    for (var mask = 0; mask < (1 << (n - 1)); mask++) {
      var a = [0], b = [];
      for (var i = 1; i < n; i++) { ((mask >> (i - 1)) & 1 ? b : a).push(i); }
      if (!b.length) { continue; }
      var diff = Math.abs(columnHeight(a, heights, gap) - columnHeight(b, heights, gap));
      if (!best || diff < best.diff) { best = { diff: diff, a: a, b: b }; }
      if (diff === 0) { break; }
    }
    return best || { a: heights.map(function (_, i) { return i; }), b: [] };
  }

  /** Zapas na wypadek bardzo długiej karty: najwyższe karty najpierw, każda do niższej kolumny. */
  function greedySplit(heights, gap) {
    var order = heights.map(function (h, i) { return i; })
      .sort(function (x, y) { return heights[y] - heights[x]; });
    var a = [], b = [];
    order.forEach(function (i) {
      if (columnHeight(a, heights, gap) <= columnHeight(b, heights, gap)) { a.push(i); } else { b.push(i); }
    });
    return { a: a, b: b };
  }

  function renderMenu() {
    var list = $('#menuList');
    list.innerHTML = '';
    menuGroups = [];

    var colA = document.createElement('div');
    var colB = document.createElement('div');
    colA.className = 'mcol';
    colB.className = 'mcol';
    list.appendChild(colA);
    list.appendChild(colB);

    var cats = content.categories.filter(function (c) {
      return activeCat === 'all' || c.id === activeCat;
    });

    var n = 0;
    var groups = 0;
    cats.forEach(function (cat) {
      var dishes = content.dishes.filter(function (d) { return d.categoryId === cat.id; });
      if (!dishes.length) { return; }

      var variants = Array.isArray(cat.variants) ? cat.variants : [];
      var group = document.createElement('section');
      group.className = 'mgroup' + (variants.length ? ' mgroup--vars' : '');
      if (variants.length) { group.style.setProperty('--cols', variants.length); }

      var head = document.createElement('div');
      head.className = 'mgroup__head';
      var h3 = document.createElement('h3');
      h3.textContent = cat.name;
      head.appendChild(h3);
      if (cat.note) {
        var small = document.createElement('small');
        small.textContent = cat.note;
        head.appendChild(small);
      }
      group.appendChild(head);

      // wiersz z nazwami rozmiarów nad kolumnami cen
      if (variants.length) {
        var vh = document.createElement('div');
        vh.className = 'varhead';
        vh.appendChild(document.createElement('span'));
        var vcells = document.createElement('div');
        vcells.className = 'dish__prices';
        variants.forEach(function (label) {
          var s = document.createElement('span');
          s.textContent = label;
          vcells.appendChild(s);
        });
        vh.appendChild(vcells);
        group.appendChild(vh);
      }

      var ul = document.createElement('ul');
      dishes.forEach(function (d) {
        var multi = Array.isArray(d.prices) && d.prices.length > 1;
        var li = document.createElement('li');
        li.className = 'dish' + (multi ? ' dish--vars' : '');
        li.style.animationDelay = Math.min(n++ * 30, 450) + 'ms';

        var name = document.createElement('span');
        name.className = 'dish__name';
        name.textContent = d.name;
        if (d.tag) {
          var tag = document.createElement('span');
          tag.className = 'tag';
          tag.dataset.tag = d.tag.toLowerCase();
          tag.textContent = d.tag;
          name.appendChild(tag);
        }

        if (multi) {
          // kilka rozmiarów — ceny w kolumnach po prawej
          var main = document.createElement('div');
          main.className = 'dish__main';
          main.appendChild(name);
          if (d.desc) {
            var vdesc = document.createElement('p');
            vdesc.className = 'dish__desc';
            vdesc.textContent = d.desc;
            main.appendChild(vdesc);
          }
          li.appendChild(main);

          var cells = document.createElement('div');
          cells.className = 'dish__prices';
          d.prices.forEach(function (value, idx) {
            var cell = document.createElement('span');
            if (variants[idx]) { cell.dataset.label = variants[idx]; }
            cell.textContent = typeof value === 'number' ? money(value) : '—';
            if (typeof value !== 'number') { cell.className = 'is-off'; }
            cells.appendChild(cell);
          });
          li.appendChild(cells);
        } else {
          // jedna cena — nazwa, kropki, cena w jednej linii
          var top = document.createElement('div');
          top.className = 'dish__top';
          top.appendChild(name);

          var dots = document.createElement('span');
          dots.className = 'dish__dots';
          top.appendChild(dots);

          var price = document.createElement('span');
          price.className = 'dish__price';
          price.textContent = money(d.price);
          top.appendChild(price);
          li.appendChild(top);

          if (d.desc) {
            var desc = document.createElement('p');
            desc.className = 'dish__desc';
            desc.textContent = d.desc;
            li.appendChild(desc);
          }
        }

        ul.appendChild(li);
      });
      group.appendChild(ul);
      colA.appendChild(group);
      menuGroups.push(group);
      groups++;
    });

    // jedna kategoria — jedna kolumna, żeby nie została pusta połowa
    list.classList.toggle('menu--one', groups === 1);

    if (!n) {
      list.innerHTML = '<p class="gal__empty">Brak dań w tej kategorii.</p>';
      return;
    }
    layoutMenu();
  }

  /* ─────────── GODZINY ─────────── */

  function renderHours() {
    var today = new Date().getDay();
    var body = document.createElement('tbody');

    [1, 2, 3, 4, 5, 6, 0].forEach(function (day) {
      var h = content.hours[day] || {};
      var tr = document.createElement('tr');
      if (day === today) { tr.className = 'is-today'; }
      var th = document.createElement('th');
      th.scope = 'row';
      th.textContent = DAYS[day];
      var td = document.createElement('td');
      td.textContent = h.closed ? 'zamknięte' : h.open + ' – ' + (h.close === '24:00' ? '00:00' : h.close);
      tr.appendChild(th);
      tr.appendChild(td);
      body.appendChild(tr);
    });

    var table = $('#hoursTable');
    table.innerHTML = '';
    table.appendChild(body);
  }

  /* ─────────── MAPA (ładowana przy przewinięciu) ─────────── */

  function initMap() {
    var box = $('#mapBox');
    if (!box) { return; }

    var load = function () {
      if (box.dataset.loaded) { return; }
      box.dataset.loaded = '1';
      var iframe = document.createElement('iframe');
      iframe.title = 'Mapa dojazdu do ' + content.settings.name;
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      iframe.src = 'https://www.google.com/maps?q=' + encodeURIComponent(content.settings.mapsQuery) + '&output=embed';
      box.appendChild(iframe);
    };

    if (!('IntersectionObserver' in window)) { return load(); }
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { load(); io.disconnect(); }
    }, { rootMargin: '300px' });
    io.observe(box);

    // zapas na wypadek, gdyby obserwator nie zadziałał — mapa i tak się wczyta
    var patrol = null;
    var check = function () {
      if (box.dataset.loaded) { return done(); }
      if (box.getBoundingClientRect().top < window.innerHeight + 300) { load(); done(); }
    };
    var done = function () {
      io.disconnect();
      clearInterval(patrol);
      window.removeEventListener('scroll', check);
    };
    window.addEventListener('scroll', check, { passive: true });
    patrol = setInterval(check, 900);
    setTimeout(function () { clearInterval(patrol); }, 60000);
  }

  /* ─────────── GWIAZDKI ─────────── */

  function renderStars(box) {
    if (!box) { return; }
    var rating = Number(content.settings.rating) || 0;
    box.innerHTML = '';
    for (var i = 1; i <= 5; i++) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'currentColor');
      if (i > Math.round(rating)) { svg.setAttribute('class', 'off'); }
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'm12 2 3 6.6 7 .9-5.1 4.8 1.3 7L12 18l-6.2 3.3 1.3-7L2 9.5l7-.9L12 2Z');
      svg.appendChild(path);
      box.appendChild(svg);
    }
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', 'Ocena ' + String(rating).replace('.', ',') + ' na 5');
  }

  /* ═══════════ SYSTEM REZERWACJI ═══════════ */

  var booking = { step: 1, date: '', time: '', people: 2 };

  function initBooking() {
    var form = $('#bookForm');
    var dateInput = $('#b-date');
    var peopleInput = $('#b-people');

    dateInput.min = isoToday();
    dateInput.max = new Date(Date.now() + content.settings.maxDaysAhead * 86400000).toISOString().slice(0, 10);
    dateInput.value = isoToday();
    peopleInput.max = content.settings.maxPeoplePerBooking;

    function setPeople(n) {
      var max = content.settings.maxPeoplePerBooking;
      booking.people = Math.max(1, Math.min(max, n));
      peopleInput.value = booking.people;
      $('#peopleMinus').disabled = booking.people <= 1;
      $('#peoplePlus').disabled = booking.people >= max;
      showError('people', booking.people >= max
        ? 'Dla większych grup prosimy o kontakt telefoniczny: ' + content.settings.phone + '.'
        : '');
    }
    $('#peopleMinus').addEventListener('click', function () { setPeople(booking.people - 1); });
    $('#peoplePlus').addEventListener('click', function () { setPeople(booking.people + 1); });
    peopleInput.addEventListener('change', function () { setPeople(Number(peopleInput.value) || 2); });
    setPeople(2);

    form.addEventListener('click', function (e) {
      var next = e.target.closest('[data-next]');
      var back = e.target.closest('[data-back]');
      if (next) { goStep(Number(next.dataset.next)); }
      if (back) { goStep(Number(back.dataset.back)); }
    });

    form.addEventListener('submit', submitBooking);
    $('#againBtn').addEventListener('click', function () {
      $('#bookDone').hidden = true;
      form.hidden = false;
      $('#steps').hidden = false;
      booking.time = '';
      goStep(1);
    });

    function goStep(n) {
      if (n === 2) {
        booking.date = dateInput.value;
        if (!booking.date) { showError('date', 'Wybierz datę wizyty.'); return; }
        showError('date', '');
        loadSlots();
      }
      if (n === 3) {
        if (!booking.time) { showError('time', 'Wybierz godzinę.'); return; }
        renderSummary();
      }
      booking.step = n;
      $$('.step', form).forEach(function (s) { s.classList.toggle('is-active', Number(s.dataset.step) === n); });
      $$('#steps li').forEach(function (li, i) {
        li.classList.toggle('is-active', i + 1 === n);
        li.classList.toggle('is-done', i + 1 < n);
      });
    }
    booking.goStep = goStep;
  }

  function showError(key, msg) {
    var el = $('[data-err="' + key + '"]');
    if (!el) { return; }
    el.textContent = msg || '';
    var field = el.closest('.field');
    if (field) { field.classList.toggle('is-bad', !!msg); }
  }

  function clearErrors() {
    $$('[data-err]').forEach(function (el) {
      el.textContent = '';
      var f = el.closest('.field');
      if (f) { f.classList.remove('is-bad'); }
    });
  }

  function loadSlots() {
    var box = $('#slots');
    var hint = $('#slotsHint');
    box.innerHTML = '<p class="slots__none">Sprawdzam dostępność…</p>';
    $('#toStep3').disabled = true;
    booking.time = '';

    api('/api/availability?date=' + booking.date + '&people=' + booking.people).then(function (r) {
      if (!r.ok) {
        box.innerHTML = '<p class="slots__none">' + (r.data.error || 'Nie udało się pobrać godzin.') + '</p>';
        return;
      }
      var slots = r.data.slots || [];
      var free = slots.filter(function (s) { return s.ok; });

      hint.textContent = free.length
        ? prettyDate(booking.date) + ' · ' + peopleWord(booking.people) + ' — wybierz godzinę:'
        : prettyDate(booking.date) + ' — brak wolnych terminów.';

      if (!slots.length) {
        box.innerHTML = '<p class="slots__none">W tym dniu jest zamknięte. Wybierz inną datę.</p>';
        return;
      }
      if (!free.length) {
        box.innerHTML = '<p class="slots__none">Wszystkie godziny są zajęte. Zadzwoń do nas: '
          + content.settings.phone + '</p>';
        return;
      }

      box.innerHTML = '';
      slots.forEach(function (s, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot';
        b.disabled = !s.ok;
        b.style.animationDelay = Math.min(i * 22, 350) + 'ms';

        var strong = document.createElement('b');
        strong.textContent = s.time;
        b.appendChild(strong);

        var small = document.createElement('small');
        small.textContent = s.past ? 'minęło' : (s.free > 0 ? s.free + ' miejsc' : 'komplet');
        b.appendChild(small);

        b.addEventListener('click', function () {
          box.querySelectorAll('.slot').forEach(function (x) { x.classList.remove('is-sel'); });
          b.classList.add('is-sel');
          booking.time = s.time;
          $('#toStep3').disabled = false;
          showError('time', '');
        });
        box.appendChild(b);
      });
    });
  }

  function renderSummary() {
    $('#summary').innerHTML =
      '<div><b>Termin:</b> ' + prettyDate(booking.date) + ', godz. ' + booking.time + '</div>' +
      '<div><b>Goście:</b> ' + peopleWord(booking.people) + '</div>';
  }

  function submitBooking(e) {
    e.preventDefault();
    clearErrors();

    var btn = $('#submitBtn');
    var label = btn.querySelector('span');
    btn.disabled = true;
    label.textContent = 'Wysyłam…';

    api('/api/reservations', {
      method: 'POST',
      body: JSON.stringify({
        name: $('#b-name').value,
        phone: $('#b-phone').value,
        note: $('#b-note').value,
        date: booking.date,
        time: booking.time,
        people: booking.people
      })
    }).then(function (r) {
      btn.disabled = false;
      label.textContent = 'Rezerwuję';

      if (r.status === 422 && r.data.errors) {
        Object.keys(r.data.errors).forEach(function (k) { showError(k, r.data.errors[k]); });
        if (r.data.errors.time || r.data.errors.date) { booking.goStep(2); loadSlots(); }
        return;
      }
      if (!r.ok) {
        showError('_form', r.data.error || 'Coś poszło nie tak. Zadzwoń do nas: ' + content.settings.phone);
        return;
      }

      $('#bookForm').hidden = true;
      $('#steps').hidden = true;
      $('#doneText').textContent =
        'Czekamy na Ciebie ' + prettyDate(booking.date) + ' o godzinie ' + booking.time +
        ' — ' + peopleWord(booking.people) + '. Gdyby coś się zmieniło, zadzwoń: ' + content.settings.phone + '.';
      $('#bookDone').hidden = false;
      $('#bookDone').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }).catch(function () {
      btn.disabled = false;
      label.textContent = 'Rezerwuję';
      showError('_form', 'Brak połączenia z serwerem. Zadzwoń do nas: ' + content.settings.phone);
    });
  }

  /* ═══════════ START ═══════════ */

  function boot() {
    bindContent();
    applyImages();
    renderTabs();
    renderMenu();
    renderHours();
    renderStars($('#proofStars'));
    renderStars($('#heroStars'));
    renderStatus();
    initBooking();
    initLightbox();
    initMap();

    window.Motion.strip([
      'Pizza z pieca', 'Soczyste burgery', 'Domowe gnocchi', 'Pad Thai',
      'Golonka w piwie i BBQ', 'Desery z kuchni', 'Czynne do północy'
    ]);

    window.Motion.splitAll();
    window.Motion.observeReveals();
    window.Motion.observeCounters();
    window.Motion.parallax();
    window.Motion.magnetic();
    window.Motion.nav();

    // po zmianie szerokości okna karty menu trzeba rozłożyć od nowa
    var relayout = null;
    var scheduleLayout = function () {
      clearTimeout(relayout);
      relayout = setTimeout(layoutMenu, 180);
    };
    window.addEventListener('resize', scheduleLayout);
    window.addEventListener('orientationchange', scheduleLayout);
    // dodatkowe zabezpieczenie na przejściu jedna ↔ dwie kolumny
    var mq = window.matchMedia('(max-width: 1100px)');
    if (mq.addEventListener) { mq.addEventListener('change', scheduleLayout); }
    else if (mq.addListener) { mq.addListener(scheduleLayout); }
    // czcionki zmieniają wysokość kart po doczytaniu
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(layoutMenu); }

    setInterval(renderStatus, 60000);
  }

  function fail(message) {
    document.body.classList.remove('is-locked');
    var el = $('#loader');
    if (el) {
      el.innerHTML = '<div class="loader__mark">88</div>'
        + '<p style="max-width:34ch;text-align:center;color:#B0301F">' + message + '</p>';
    }
  }

  document.body.classList.add('is-locked');

  Promise.all([window.Motion.loader(), api('/api/content')]).then(function (results) {
    var r = results[1];
    if (!r.ok) { throw new Error(r.data.error || 'Błąd serwera'); }
    content = r.data;
    boot();
  }).catch(function (err) {
    console.error(err);
    fail('Nie udało się wczytać treści strony. Sprawdź, czy serwer działa (npm run dev), i odśwież stronę.');
  });
})();
