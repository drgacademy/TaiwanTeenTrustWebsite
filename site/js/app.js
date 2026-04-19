/* ============================================================
   Taiwan Teen Trust — Main App JS
   Language switching + Navbar + GSAP animations + Cursor
   ============================================================ */

'use strict';

/* ─── Language System ─── */
const LANG_KEY = 'ttt-lang';
let currentLang = localStorage.getItem(LANG_KEY) || 'zh';

const t = {
  zh: {
    nav_home:     '首頁',
    nav_about:    '關於我們',
    nav_team:     '團隊',
    nav_projects: '專案',
    nav_blog:     '部落格',
    nav_focus:    '年度主題',
    nav_join:     '加入我們',
    nav_contact:  '聯絡',
  },
  en: {
    nav_home:     'Home',
    nav_about:    'About',
    nav_team:     'Team',
    nav_projects: 'Projects',
    nav_blog:     'Blog',
    nav_focus:    'Focus',
    nav_join:     'Join Us',
    nav_contact:  'Contact',
  }
};

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-TW' : 'en';

  // Update all [data-zh] / [data-en] elements (use innerHTML to support <br> etc.)
  document.querySelectorAll('[data-zh]').forEach(el => {
    el.innerHTML = lang === 'zh'
      ? el.dataset.zh
      : (el.dataset.en || el.dataset.zh);
  });

  // Toggle .lang-zh / .lang-en visibility (for HTML-containing elements)
  document.querySelectorAll('.lang-zh').forEach(el => { el.style.display = lang === 'zh' ? '' : 'none'; });
  document.querySelectorAll('.lang-en').forEach(el => { el.style.display = lang === 'en' ? '' : 'none'; });

  // Update lang buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
}

/* ─── Navbar ─── */
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  // Scroll state
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  // Hamburger
  const hamburger = document.querySelector('.navbar__hamburger');
  const mobileNav = document.querySelector('.navbar__mobile');
  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      const open = hamburger.classList.toggle('open');
      mobileNav.classList.toggle('open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
    // Close on link click
    mobileNav.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        hamburger.classList.remove('open');
        mobileNav.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  // Active link
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navbar__link').forEach(link => {
    const href = link.getAttribute('href');
    if (href && (href === path || href.endsWith(path))) {
      link.classList.add('active');
    }
  });
}

/* ─── Language Toggle Init ─── */
function initLang() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });
  setLang(currentLang);
}

/* ─── GSAP Scroll Animations ─── */
function initAnimations() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  gsap.registerPlugin(ScrollTrigger);

  // Reveal on scroll
  gsap.utils.toArray('.reveal').forEach(el => {
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 1,
      ease: 'expo.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 88%',
        toggleActions: 'play none none none',
      }
    });
  });

  gsap.utils.toArray('.reveal-left').forEach(el => {
    gsap.to(el, {
      opacity: 1,
      x: 0,
      duration: 1,
      ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 88%' }
    });
  });

  gsap.utils.toArray('.reveal-right').forEach(el => {
    gsap.to(el, {
      opacity: 1,
      x: 0,
      duration: 1,
      ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 88%' }
    });
  });

  gsap.utils.toArray('.reveal-scale').forEach(el => {
    gsap.to(el, {
      opacity: 1,
      scale: 1,
      duration: 1,
      ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 88%' }
    });
  });

  // Stagger children with .stagger-parent
  gsap.utils.toArray('.stagger-parent').forEach(parent => {
    const children = parent.querySelectorAll('.stagger-child');
    if (!children.length) return;
    gsap.fromTo(children,
      { opacity: 0, y: 40 },
      {
        opacity: 1, y: 0,
        duration: 0.9,
        ease: 'expo.out',
        stagger: 0.1,
        scrollTrigger: { trigger: parent, start: 'top 85%' }
      }
    );
  });

  // Counter animation
  document.querySelectorAll('.counter').forEach(el => {
    const target = parseInt(el.dataset.target, 10);
    const suffix = el.dataset.suffix || '';
    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.fromTo({ val: 0 },
          { val: target },
          {
            val: target,
            duration: 2.5,
            ease: 'expo.out',
            onUpdate: function() {
              el.textContent = Math.round(this.targets()[0].val).toLocaleString() + suffix;
            }
          }
        );
      }
    });
  });

  // Parallax hero bg
  const heroBg = document.querySelector('.hero__bg');
  if (heroBg) {
    gsap.to(heroBg, {
      yPercent: 25,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      }
    });
  }

  // Hero text entrance
  const heroTitle = document.querySelector('.hero__title');
  const heroSub   = document.querySelector('.hero__subtitle');
  const heroCtAs  = document.querySelector('.hero__ctas');
  if (heroTitle) {
    const tl = gsap.timeline({ delay: 0.3 });
    tl.fromTo(heroTitle, { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out' });
    if (heroSub)  tl.fromTo(heroSub,  { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1, ease: 'expo.out' }, '-=0.8');
    if (heroCtAs) tl.fromTo(heroCtAs, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' }, '-=0.6');
  }
}

/* ─── Custom Cursor ─── */
function initCursor() {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const dot  = document.querySelector('.cursor-dot');
  const ring = document.querySelector('.cursor-ring');
  if (!dot || !ring) return;

  let mx = 0, my = 0, rx = 0, ry = 0;

  document.addEventListener('mousemove', e => {
    mx = e.clientX;
    my = e.clientY;
    dot.style.transform = `translate(${mx - 3}px, ${my - 3}px)`;
  });

  function animateRing() {
    rx += (mx - rx - 16) * 0.18;
    ry += (my - ry - 16) * 0.18;
    ring.style.transform = `translate(${rx}px, ${ry}px)`;
    requestAnimationFrame(animateRing);
  }
  animateRing();

  document.querySelectorAll('a, button, .card, .member-card').forEach(el => {
    el.addEventListener('mouseenter', () => ring.classList.add('hovering'));
    el.addEventListener('mouseleave', () => ring.classList.remove('hovering'));
  });
}

/* ─── Accordion ─── */
function initAccordion() {
  document.querySelectorAll('.accordion-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.accordion-item');
      const isOpen = item.classList.contains('open');
      // close all
      document.querySelectorAll('.accordion-item.open').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

/* ─── Page Loader ─── */
function initLoader() {
  const loader = document.querySelector('.page-loader');
  if (!loader) return;
  window.addEventListener('load', () => {
    setTimeout(() => loader.classList.add('hidden'), 600);
  });
}

/* ─── Marquee duplicate ─── */
function initMarquee() {
  document.querySelectorAll('.marquee-track').forEach(track => {
    track.innerHTML += track.innerHTML; // duplicate for seamless loop
  });
}

/* ─── Init all ─── */
document.addEventListener('DOMContentLoaded', () => {
  initLoader();
  initNavbar();
  initLang();
  initCursor();
  initAccordion();
  initMarquee();

  // Wait a tick for GSAP CDN to load
  setTimeout(initAnimations, 100);
});
