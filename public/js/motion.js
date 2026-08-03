/* ═══════════════════════════════════════════════════════════
   MIASTO 88 — silnik animacji
   Bez bibliotek: IntersectionObserver + requestAnimationFrame.
   Wszystko wyłącza się przy systemowej opcji „ogranicz ruch".
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FINE_POINTER = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ─────────── EKRAN POWITALNY ─────────── */
  function loader() {
    var el = $('#loader');
    if (!el) { return Promise.resolve(); }
    var bar = $('.loader__bar i', el);

    return new Promise(function (resolve) {
      var value = 0;
      var ready = false;

      var tick = setInterval(function () {
        value += Math.random() * 18 + 8;
        if (value > 90 && !ready) { value = 90; }
        if (ready) { value = 100; }
        var v = Math.min(100, Math.round(value));
        if (bar) { bar.style.width = v + '%'; }
        if (v >= 100) {
          clearInterval(tick);
          setTimeout(function () {
            el.classList.add('is-gone');
            document.body.classList.remove('is-locked');
            setTimeout(function () { el.remove(); }, 600);
            resolve();
          }, 180);
        }
      }, REDUCED ? 20 : 90);

      var finish = function () { ready = true; };
      if (document.readyState === 'complete') { setTimeout(finish, REDUCED ? 0 : 220); }
      else { window.addEventListener('load', function () { setTimeout(finish, REDUCED ? 0 : 220); }); }
      setTimeout(finish, 3500);   // bezpiecznik — strona nigdy nie zawiśnie na ekranie ładowania
    });
  }

  /* ─────────── NAGŁÓWKI SŁOWO PO SŁOWIE ─────────── */
  function splitText(el) {
    if (!el || el.dataset.split === '1') { return; }
    var text = el.textContent.trim();
    if (!text) { return; }
    el.dataset.split = '1';
    el.textContent = '';
    text.split(/\s+/).forEach(function (word, i, arr) {
      var wrap = document.createElement('span');
      wrap.className = 'word';
      var inner = document.createElement('i');
      inner.textContent = word;
      inner.style.transitionDelay = (i * 60) + 'ms';
      wrap.appendChild(inner);
      el.appendChild(wrap);
      if (i < arr.length - 1) { el.appendChild(document.createTextNode(' ')); }
    });
  }

  function splitAll(root) { $$('.split', root || document).forEach(splitText); }

  /* ─────────── UJAWNIANIE PRZY PRZEWIJANIU ─────────── */
  var revealObserver = null;

  function observeReveals(root) {
    var targets = $$('.anim, .split', root || document)
      .filter(function (el) { return !el.dataset.observed; });
    if (!targets.length) { return; }

    if (REDUCED || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.dataset.observed = '1'; el.classList.add('is-in'); });
      return;
    }

    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) { return; }
          var el = en.target;
          setTimeout(function () { el.classList.add('is-in'); }, Number(el.dataset.delay || 0));
          revealObserver.unobserve(el);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    }

    targets.forEach(function (el) { el.dataset.observed = '1'; revealObserver.observe(el); });
    startScrollFallback();
  }

  /* Zapasowe odsłanianie oparte na przewijaniu.
     Gdyby IntersectionObserver z jakiegokolwiek powodu nie zadziałał,
     treść i tak się pokaże — nigdy nie zostanie pusta strona. */
  var fallbackOn = false;
  function startScrollFallback() {
    if (fallbackOn) { return; }
    fallbackOn = true;

    var throttle = null;
    var patrol = null;

    function sweep() {
      throttle = null;
      var vh = window.innerHeight;
      var left = $$('[data-observed]:not(.is-in)');
      left.forEach(function (el) {
        if (el.getBoundingClientRect().top < vh - 40) { el.classList.add('is-in'); }
      });
      if (!$$('[data-observed]:not(.is-in)').length) { stop(); }
    }

    function onScroll() {
      if (throttle === null) { throttle = setTimeout(sweep, 120); }
    }

    function stop() {
      clearInterval(patrol);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    }

    // celowo setTimeout, a nie requestAnimationFrame — działa nawet wtedy,
    // gdy przeglądarka wstrzyma rysowanie klatek (karta w tle, oszczędzanie energii)
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    patrol = setInterval(sweep, 900);
    // po minucie wystarczy nasłuch przewijania — cykliczny patrol nie jest już potrzebny,
    // ale listener zostaje aż wszystko będzie widoczne
    setTimeout(function () { clearInterval(patrol); }, 60000);
    setTimeout(sweep, 1200);
  }

  /* ─────────── PARALAKSA ─────────── */
  function parallax() {
    if (REDUCED) { return; }
    var items = $$('[data-parallax]');
    if (!items.length) { return; }

    var ticking = false;
    function update() {
      var vh = window.innerHeight;
      items.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) { return; }
        var speed = parseFloat(el.dataset.parallax) || 0.1;
        var progress = (r.top + r.height / 2 - vh / 2) / vh;
        el.style.transform = 'translate3d(0,' + (progress * speed * 100).toFixed(2) + 'px,0)';
      });
      ticking = false;
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  /* ─────────── LICZNIKI ─────────── */
  function countUp(el) {
    var target = parseFloat(el.dataset.target || el.textContent) || 0;
    var decimals = Number(el.dataset.decimals || 0);
    var suffix = el.dataset.suffix || '';

    function format(v) {
      if (decimals) { return v.toFixed(decimals).replace('.', ','); }
      return Math.round(v).toLocaleString('pl-PL');
    }
    if (REDUCED) { el.textContent = format(target) + suffix; return; }

    var start = performance.now();
    (function frame(now) {
      var t = Math.min(1, (now - start) / 1300);
      el.textContent = format(target * (1 - Math.pow(1 - t, 3))) + suffix;
      if (t < 1) { requestAnimationFrame(frame); }
    })(start);
  }

  function observeCounters(root) {
    var items = $$('[data-count]', root || document).filter(function (el) { return !el.dataset.counted; });
    if (!items.length) { return; }
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.dataset.counted = '1'; countUp(el); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) { return; }
        en.target.dataset.counted = '1';
        countUp(en.target);
        io.unobserve(en.target);
      });
    }, { threshold: 0.4 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ─────────── PRZYCISKI PRZYCIĄGAJĄCE KURSOR ─────────── */
  function magnetic(root) {
    if (REDUCED || !FINE_POINTER) { return; }
    $$('.magnetic', root || document).forEach(function (el) {
      if (el.dataset.magnetic) { return; }
      el.dataset.magnetic = '1';
      var raf = null;

      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.18;
        var y = (e.clientY - r.top - r.height / 2) * 0.28;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
        });
      });
      el.addEventListener('mouseleave', function () {
        cancelAnimationFrame(raf);
        el.style.transition = 'transform .5s cubic-bezier(.22,1,.36,1)';
        el.style.transform = '';
        setTimeout(function () { el.style.transition = ''; }, 520);
      });
    });
  }

  /* ─────────── NAWIGACJA ─────────── */
  function nav() {
    var navEl = $('#nav');
    var burger = $('#burger');
    var links = $('#navLinks');
    if (!navEl) { return; }

    var onScroll = function () { navEl.classList.toggle('is-stuck', window.scrollY > 10); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    if (burger && links) {
      var setOpen = function (open) {
        links.classList.toggle('is-open', open);
        burger.setAttribute('aria-expanded', String(open));
      };
      burger.addEventListener('click', function () {
        setOpen(burger.getAttribute('aria-expanded') !== 'true');
      });
      links.addEventListener('click', function (e) { if (e.target.closest('a')) { setOpen(false); } });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { setOpen(false); } });
      window.addEventListener('resize', function () { if (window.innerWidth > 760) { setOpen(false); } });
    }

    var anchors = $$('#navLinks a');
    var sections = anchors
      .map(function (a) { return document.querySelector(a.getAttribute('href')); })
      .filter(Boolean);

    if ('IntersectionObserver' in window && sections.length) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) { return; }
          anchors.forEach(function (a) {
            a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id);
          });
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      sections.forEach(function (s) { spy.observe(s); });
    }
  }

  /* ─────────── PRZEWIJANY PASEK HASEŁ ─────────── */
  function strip(words) {
    var track = $('#stripTrack');
    if (!track) { return; }
    track.innerHTML = '';
    for (var copy = 0; copy < 2; copy++) {
      var group = document.createElement('span');
      words.forEach(function (w) {
        var b = document.createElement('b');
        b.textContent = w;
        group.appendChild(b);
      });
      track.appendChild(group);
    }
  }

  global.Motion = {
    reduced: REDUCED,
    loader: loader,
    splitAll: splitAll,
    observeReveals: observeReveals,
    observeCounters: observeCounters,
    parallax: parallax,
    magnetic: magnetic,
    nav: nav,
    strip: strip
  };
})(window);
