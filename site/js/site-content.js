/* ============================================================
   Taiwan Teen Trust — Frontend site_content loader
   Loads all rows from site_content and patches DOM elements
   marked with data-site-key + data-site-lang (and optional
   data-site-attr to patch an attribute instead of textContent).
   ============================================================ */
window.esc = function(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

window.escBio = function(str) {
  if (str == null) return '';
  const escaped = window.esc(str);
  return escaped.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
};

(function () {
  'use strict';

  const sb = window.supabaseClient;
  if (!sb) {
    console.warn('[site-content] Supabase client not initialized; skipping dynamic content.');
    return;
  }

  let contentMap = null;

  function updateContentForLang(lang) {
    if (!contentMap) return;

    /* Patch elements */
    document.querySelectorAll('[data-site-key]').forEach(el => {
      const key = el.dataset.siteKey;
      const attr = el.dataset.siteAttr;  // if set, patch this attribute
      const row = contentMap[key];
      if (!row) return;
      const val = (lang === 'en' ? row.value_en : row.value_zh);
      if (val == null || val === '') return;
      if (attr) el.setAttribute(attr, val);
      else      el.textContent = val;
    });

    /* Logo: special-case — sidebar and hero logos, patch src attribute */
    const logoUrl = (lang === 'en' ? contentMap.site_logo_url?.value_en : contentMap.site_logo_url?.value_zh) || contentMap.site_logo_url?.value_zh;
    if (logoUrl) {
      document.querySelectorAll('[data-site-logo]').forEach(img => { img.src = logoUrl; });
    }
  }

  async function load() {
    const { data, error } = await sb.from('site_content').select('key, value_zh, value_en');
    if (error) { console.warn('[site-content]', error.message); return; }

    contentMap = {};
    data.forEach(r => { contentMap[r.key] = r; });

    const lang = localStorage.getItem('ttt-lang') || 'zh';
    updateContentForLang(lang);

    /* Re-trigger counter animation if stats were patched */
    document.dispatchEvent(new CustomEvent('site-content-loaded', { detail: contentMap }));
  }

  // Intercept language toggle button clicks to update dynamic content
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-lang]');
    if (btn) {
      const newLang = btn.dataset.lang;
      setTimeout(() => {
        updateContentForLang(newLang);
      }, 50);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
