/**
 * TTT Vibrant motion layer — shared by every public page.
 *  - [data-pop]       springy pop-in when scrolled into view
 *  - [data-speed]     light parallax (e.g. data-speed="0.15")
 *  - [data-split]     split a heading into letters that bounce in
 *  - tilt cards       cards lean toward the pointer
 * Everything is skipped when the visitor prefers reduced motion.
 */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    /* ── 1. Pop-in ── */
    var pops = document.querySelectorAll('[data-pop]');
    if (reduced || !('IntersectionObserver' in window)) {
      pops.forEach(function (el) { el.classList.add('is-in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px' });
      pops.forEach(function (el) { io.observe(el); });
    }

    /* ── 2. Letter split (bouncy heading) ── */
    if (!reduced) {
      document.querySelectorAll('[data-split]').forEach(function (el) {
        var text = el.textContent;
        el.setAttribute('aria-label', text);
        el.textContent = '';
        Array.from(text).forEach(function (ch, i) {
          var s = document.createElement('span');
          s.className = 'split-ch';
          s.setAttribute('aria-hidden', 'true');
          s.textContent = ch === ' ' ? ' ' : ch;
          s.style.setProperty('--i', i);
          el.appendChild(s);
        });
        var obs = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) { el.classList.add('split-in'); obs.disconnect(); }
          });
        });
        obs.observe(el);
      });
    }

    if (reduced) return;

    /* ── 3. Parallax ── */
    var para = Array.from(document.querySelectorAll('[data-speed]'));
    if (para.length) {
      var ticking = false;
      var update = function () {
        var y = window.scrollY;
        para.forEach(function (el) {
          var sp = parseFloat(el.dataset.speed) || 0;
          el.style.transform = 'translate3d(0,' + (y * sp).toFixed(1) + 'px,0)';
        });
        ticking = false;
      };
      window.addEventListener('scroll', function () {
        if (!ticking) { requestAnimationFrame(update); ticking = true; }
      }, { passive: true });
      update();
    }

    /* ── 4. Tilt cards toward the pointer ──
       Uses the individual `rotate`/`scale` CSS properties so it composes
       with GSAP's `transform` tweens instead of fighting them. */
    if (finePointer) {
      var tiltSel = '.tilt, .pillar-card, .proj-card, .stat-item, .value-item, .lead-card, ' +
                    '.member-card, .post-card, .featured-card, .featured-post, .how-item';
      document.querySelectorAll(tiltSel).forEach(function (card) {
        var T_FAST = 'rotate .12s ease-out, scale .3s cubic-bezier(.34,1.56,.64,1), box-shadow .35s cubic-bezier(.34,1.56,.64,1), background .25s';
        var T_BACK = 'rotate .6s cubic-bezier(.34,1.56,.64,1), scale .6s cubic-bezier(.34,1.56,.64,1), box-shadow .35s cubic-bezier(.34,1.56,.64,1), background .25s';
        card.addEventListener('pointermove', function (e) {
          var r = card.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width - .5;
          var py = (e.clientY - r.top) / r.height - .5;
          var deg = Math.min(8, Math.hypot(px, py) * 14);
          card.style.transition = T_FAST;
          card.style.rotate = (-py).toFixed(3) + ' ' + px.toFixed(3) + ' 0 ' + deg.toFixed(2) + 'deg';
          card.style.scale = '1.025';
        });
        card.addEventListener('pointerleave', function () {
          card.style.transition = T_BACK;
          card.style.rotate = '';   // falls back to the card's resting tilt from CSS
          card.style.scale = '';
        });
      });
    }
  });
})();
