/**
 * TTT Aurora Background — rainbow ambient animation
 * Adds gently drifting color orbs + flowing wave lines to every page.
 */
(function () {
  /* ── 1. CSS injection ── */
  var css = document.createElement('style');
  css.textContent = [
    /* Make body transparent so aurora (fixed, z-index:0) bleeds through */
    'html{background:#fff}',
    'body{background:transparent!important}',

    /* Aurora container */
    '.ttt-aura{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}',

    /* Colour orbs — radial-gradient blobs that drift slowly */
    '.ao{position:absolute;border-radius:50%;animation:ao-float linear infinite alternate}',
    '.ao1{width:75vw;height:75vw;background:radial-gradient(circle at 40% 40%,#0D2B52 0%,transparent 68%);opacity:.13;top:-25%;left:-18%;animation-duration:24s}',
    '.ao2{width:62vw;height:62vw;background:radial-gradient(circle at 55% 45%,#2ECAD4 0%,transparent 68%);opacity:.12;top:20%;right:-18%;animation-duration:30s;animation-delay:-11s}',
    '.ao3{width:58vw;height:58vw;background:radial-gradient(circle at 45% 50%,#1A467D 0%,transparent 68%);opacity:.11;bottom:0%;left:8%;animation-duration:21s;animation-delay:-17s}',
    '.ao4{width:48vw;height:48vw;background:radial-gradient(circle at 50% 50%,#1D7B93 0%,transparent 68%);opacity:.10;top:52%;right:22%;animation-duration:26s;animation-delay:-8s}',
    '.ao5{width:68vw;height:68vw;background:radial-gradient(circle at 50% 60%,#0D2B52 0%,transparent 68%);opacity:.11;bottom:-28%;right:-14%;animation-duration:35s;animation-delay:-23s}',
    '.ao6{width:50vw;height:50vw;background:radial-gradient(circle at 50% 40%,#2ECAD4 0%,transparent 68%);opacity:.09;top:40%;left:30%;animation-duration:28s;animation-delay:-5s}',

    /* Orb keyframe — gentle multi-direction drift */
    '@keyframes ao-float{',
    '0%{transform:translate(0,0)scale(1)}',
    '25%{transform:translate(38px,-30px)scale(1.08)}',
    '50%{transform:translate(-20px,40px)scale(.96)}',
    '75%{transform:translate(30px,20px)scale(1.04)}',
    '100%{transform:translate(-15px,-10px)scale(1.10)}',
    '}',

    /* Canvas for wave lines */
    '#ao-canvas{position:absolute;inset:0;width:100%;height:100%}',

    /* Lift content sections above the z-index:0 aurora layer */
    /* Use position:relative + z-index:1 only on semantic content, not on fixed elements */
    'section,main,article,footer,.page-section{position:relative;z-index:1}',
    /* Panels that are non-fixed and need lifting */
    '.hero,.stats-section,.mission-section,.pillars-section,.projects-section,',
    '.partners-section,.join-section,.about-hero,.about-mission,.about-stats,',
    '.about-values,.team-hero,.team-section,.proj-hero,.proj-list,',
    '.blog-hero,.blog-list,.focus-hero,.focus-themes,.cta-sec{position:relative;z-index:1}',

    /* Footer neon rainbow top bar */
    'footer{position:relative}',
    'footer::before{content:\'\';position:absolute;top:0;left:0;right:0;height:3px;',
    'background:linear-gradient(90deg,#0D2B52,#1A467D,#2ECAD4,#0D2B52);',
    'background-size:200% 100%;animation:ttt-rainbow-shift 5s linear infinite;',
    'box-shadow:0 0 8px rgba(46,202,212,.55),0 0 16px rgba(26,70,125,.4),0 0 24px rgba(13,43,82,.3)}',
    '@keyframes ttt-rainbow-shift{0%{background-position:0% 0%}100%{background-position:200% 0%}}',
    '.footer-rainbow{display:none}',
  ].join('');
  document.head.appendChild(css);

  /* ── 2. Build DOM ── */
  var wrap = document.createElement('div');
  wrap.className = 'ttt-aura';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML =
    '<div class="ao ao1"></div>' +
    '<div class="ao ao2"></div>' +
    '<div class="ao ao3"></div>' +
    '<div class="ao ao4"></div>' +
    '<div class="ao ao5"></div>' +
    '<div class="ao ao6"></div>' +
    '<canvas id="ao-canvas"></canvas>';
  document.body.insertBefore(wrap, document.body.firstChild);

  /* ── 3. Wave line animation ── */
  var cv = document.getElementById('ao-canvas');
  var cx = cv.getContext('2d');
  var frame = 0;

  /* Three waves at different Y positions, different rainbow color pairs */
  var WAVES = [
    { amp: 115, freq: 0.00195, spd: 0.0045, yPct: 0.20, hue1: '#0D2B52', hue2: '#1A467D' },
    { amp: 95,  freq: 0.00270, spd: 0.0060, yPct: 0.52, hue1: '#1A467D', hue2: '#2ECAD4' },
    { amp: 135, freq: 0.00160, spd: 0.0075, yPct: 0.82, hue1: '#2ECAD4', hue2: '#0D2B52' },
  ];

  function resize() {
    cv.width  = window.innerWidth;
    cv.height = window.innerHeight;
  }

  function hexA(hex, a) {
    /* hex + alpha 0-1 → rgba string */
    var r = parseInt(hex.slice(1,3),16);
    var g = parseInt(hex.slice(3,5),16);
    var b = parseInt(hex.slice(5,7),16);
    return 'rgba('+r+','+g+','+b+','+a+')';
  }

  function tick() {
    var W = cv.width, H = cv.height;
    cx.clearRect(0, 0, W, H);

    WAVES.forEach(function (w) {
      /* Horizontal gradient: fade in → color A → color B → fade out */
      var g = cx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0,    hexA(w.hue1, 0));
      g.addColorStop(0.12, hexA(w.hue1, 0.85));
      g.addColorStop(0.42, hexA(w.hue2, 1.00));
      g.addColorStop(0.70, hexA(w.hue1, 0.85));
      g.addColorStop(1,    hexA(w.hue1, 0));

      cx.beginPath();
      cx.strokeStyle = g;
      cx.lineWidth   = 1.5;
      cx.globalAlpha = 0.38;

      for (var x = 0; x <= W; x += 3) {
        var y = H * w.yPct
              + Math.sin(x * w.freq + frame * w.spd) * w.amp
              + Math.sin(x * w.freq * 2.35 + frame * w.spd * 0.58 + 1.8) * w.amp * 0.32
              + Math.sin(x * w.freq * 0.71 + frame * w.spd * 0.22 + 3.4) * w.amp * 0.18;
        if (x === 0) cx.moveTo(x, y);
        else          cx.lineTo(x, y);
      }
      cx.stroke();
      cx.globalAlpha = 1;
    });

    frame++;
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);
  resize();
  tick();

  /* ── 4. Page Transition (triple-wipe cinematic effect) ── */
  (function () {
    /* Detect logo path from existing nav link */
    var homeA = document.querySelector('a[href="index.html"], a[href="../index.html"]');
    var base = (homeA && homeA.getAttribute('href').indexOf('../') === 0) ? '../' : '';

    /* Build overlay if not present */
    var ov = document.getElementById('ttt-ov');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'ttt-ov';
      ov.innerHTML =
        '<div class="ttt-p ttt-p1" style="transform:translateX(-105%)"></div>' +
        '<div class="ttt-p ttt-p2" style="transform:translateX(-105%)"></div>' +
        '<div class="ttt-p ttt-p3" style="transform:translateX(-105%)"></div>' +
        '<div class="ttt-lg"><img src="' + base + 'assets/logo-real.png" alt="TTT">' +
          '<span>Taiwan Teen Trust</span></div>';
      document.body.appendChild(ov);
    }

    var panels = ov.querySelectorAll('.ttt-p');
    var lg = ov.querySelector('.ttt-lg');
    var E = 'cubic-bezier(0.76,0,0.24,1)';

    function slidePanel(el, to, dur, delay) {
      setTimeout(function () {
        el.style.transition = 'transform ' + dur + 'ms ' + E;
        el.style.transform = to;
        el.classList.add('ttt-shine');
        setTimeout(function () { el.classList.remove('ttt-shine'); }, dur + 50);
      }, delay);
    }

    function cover(cb) {
      /* Reset panels to left edge */
      document.documentElement.classList.add('ttt-transitioning');
      panels.forEach(function (p) {
        p.style.transition = 'none';
        p.style.transform = 'translateX(-105%)';
      });
      lg.style.transition = 'none';
      lg.style.opacity = '0';
      lg.style.transform = 'translateY(8px)';
      ov.offsetHeight; /* force reflow */

      /* Staggered entry */
      slidePanel(panels[0], 'translateX(0)', 260, 0);
      slidePanel(panels[1], 'translateX(0)', 260, 50);
      slidePanel(panels[2], 'translateX(0)', 260, 100);

      /* Logo fades in */
      setTimeout(function () {
        lg.style.transition = 'opacity 160ms ease, transform 160ms ease';
        lg.style.opacity = '1';
        lg.style.transform = 'translateY(0)';
      }, 380);

      /* Navigate after logo has been visible briefly */
      if (cb) setTimeout(cb, 540);
    }

    function uncover() {
      /* Start state: all panels covering, logo visible */
      panels.forEach(function (p) { p.style.transform = 'translateX(0)'; });
      lg.style.opacity = '1';
      lg.style.transform = 'translateY(0)';

      /* Logo fades out */
      lg.style.transition = 'opacity 120ms ease, transform 120ms ease';
      lg.style.opacity = '0';
      lg.style.transform = 'translateY(-8px)';

      /* Reverse stagger exit */
      slidePanel(panels[2], 'translateX(105%)', 280, 60);
      slidePanel(panels[1], 'translateX(105%)', 280, 130);
      slidePanel(panels[0], 'translateX(105%)', 280, 200);

      /* Remove transitioning class after uncover completes */
      setTimeout(function () {
        document.documentElement.classList.remove('ttt-transitioning');
      }, 500);
    }

    /* On page load: if arriving via a transition, play uncover */
    if (sessionStorage.getItem('ttt-tr')) {
      sessionStorage.removeItem('ttt-tr');
      document.documentElement.classList.add('ttt-transitioning');
      panels.forEach(function (p) {
        p.style.transition = 'none';
        p.style.transform = 'translateX(0)';
      });
      lg.style.opacity = '1';
      setTimeout(uncover, 100);
    }

    /* Handle backwards navigation from bfcache */
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) {
        window.location.reload();
      }
    });

    /* Intercept internal nav clicks */
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href) return;
      if (href.charAt(0) === '#') return;
      if (/^(https?:\/\/|mailto:|tel:)/.test(href)) return;
      if (a.target === '_blank') return;
      if (a.hasAttribute('download')) return;
      /* Skip same-page self-links */
      var cur = window.location.pathname.split('/').pop() || 'index.html';
      if (href === cur) return;

      e.preventDefault();
      sessionStorage.setItem('ttt-tr', '1');
      cover(function () { window.location.href = href; });
    }, true);
  })();

  /* ── 5. Social Icons (Instagram + Threads) in Navbar ── */
  (function () {
    var socialCss = document.createElement('style');
    socialCss.textContent =
      '.nav__socials{display:flex;align-items:center;gap:.35rem;margin-right:.55rem}' +
      '.nav__social{display:flex;align-items:center;justify-content:center;width:30px;height:30px;' +
        'border-radius:8px;transition:transform .2s var(--ease,ease),opacity .2s;opacity:.75;' +
        'flex-shrink:0}' +
      '.nav__social:hover{transform:translateY(-2px) scale(1.1);opacity:1}' +
      '.nav__social svg{width:18px;height:18px;display:block}';
    document.head.appendChild(socialCss);

    /* Rainbow gradient stops shared across both icons (embedded per-SVG for cross-browser compat) */
    function rainbowDefs(id) {
      return '<defs><linearGradient id="' + id + '" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '<stop offset="0%" stop-color="#ff3b3b"/>' +
        '<stop offset="20%" stop-color="#ff8c00"/>' +
        '<stop offset="40%" stop-color="#ffd600"/>' +
        '<stop offset="60%" stop-color="#00c95d"/>' +
        '<stop offset="80%" stop-color="#0099ff"/>' +
        '<stop offset="100%" stop-color="#ff2dca"/>' +
        '</linearGradient></defs>';
    }

    /* Instagram — rounded-rect outline + circle + dot */
    var igSvg =
      '<svg viewBox="0 0 24 24" fill="none" stroke="url(#ig-r)" stroke-width="1.7" ' +
        'stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
      rainbowDefs('ig-r') +
      '<rect x="2" y="2" width="20" height="20" rx="5.5" ry="5.5"/>' +
      '<circle cx="12" cy="12" r="4"/>' +
      '<circle cx="17.4" cy="6.6" r="1.1" fill="url(#ig-r)" stroke="none"/>' +
      '</svg>';

    /* Threads — official "@" swirl path (24×24 viewBox) */
    var thSvg =
      '<svg viewBox="0 0 192 192" fill="url(#th-r)" xmlns="http://www.w3.org/2000/svg">' +
      rainbowDefs('th-r') +
      '<path d="M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.244-15.224-1.626-23.68-1.14-23.82 1.371-39.134 15.264-38.105 34.568.522 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.453-15.153 9.899-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.351-22.809-.169-40.06-7.484-51.275-21.742C35.236 139.966 29.808 120.682 29.605 96c.203-24.682 5.63-43.966 16.133-57.317C56.954 24.425 74.204 17.11 97.013 16.94c22.975.17 40.526 7.52 52.171 21.847 5.71 7.026 9.988 15.73 12.853 25.895l16.147-4.308c-3.44-12.698-8.853-23.606-16.219-32.668C147.036 9.607 125.033.195 97.07 0h-.113C69.1.195 47.303 9.65 32.79 28.08 19.882 44.485 13.224 67.315 13.001 95.932L13 96v.067c.224 28.617 6.882 51.447 19.791 67.854C47.304 182.35 69.1 191.805 96.957 192h.113c24.96-.173 42.554-6.708 57.048-21.189 18.963-18.944 18.392-42.702 12.114-57.256-4.432-10.321-12.89-18.676-24.695-24.567Z"/>' +
      '<path d="M98.33 129.147c-10.562.612-19.394-4.307-19.875-12.88-.34-6.107 4.243-12.95 20.727-13.901 7.307-.42 14.308-.078 20.927 1.013-2.38 29.749-11.153 25.174-21.779 25.768Z"/>' +
      '</svg>';

    function inject() {
      var navActions = document.querySelector('.nav__actions');
      if (!navActions || document.querySelector('.nav__socials')) return;
      var navLang = navActions.querySelector('.nav__lang');

      var div = document.createElement('div');
      div.className = 'nav__socials';
      div.innerHTML =
        '<a href="https://instagram.com/taiwanteentrust" class="nav__social" ' +
          'target="_blank" rel="noopener" aria-label="Instagram">' + igSvg + '</a>' +
        '<a href="https://threads.net/@taiwanteentrust" class="nav__social" ' +
          'target="_blank" rel="noopener" aria-label="Threads">' + thSvg + '</a>';

      if (navLang) {
        navActions.insertBefore(div, navLang);
      } else {
        navActions.prepend(div);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inject);
    } else {
      inject();
    }
  })();
})();
