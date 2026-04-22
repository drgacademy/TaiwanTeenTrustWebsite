/* ============================================================
   Taiwan Teen Trust — Frontend site_content loader
   Loads all rows from site_content and patches DOM elements
   marked with data-site-key + data-site-lang (and optional
   data-site-attr to patch an attribute instead of textContent).
   ============================================================ */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://tpolpfulwsfqpghweasl.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_grN4TNJpPS7xNBQeiStUmQ_WNc0u8_J';

  if (!window.supabase || !window.supabase.createClient) {
    console.warn('[site-content] Supabase JS not loaded; skipping dynamic content.');
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  async function load() {
    const { data, error } = await sb.from('site_content').select('key, value_zh, value_en');
    if (error) { console.warn('[site-content]', error.message); return; }

    const map = {};
    data.forEach(r => { map[r.key] = r; });

    /* Patch elements */
    document.querySelectorAll('[data-site-key]').forEach(el => {
      const key = el.dataset.siteKey;
      const lang = el.dataset.siteLang || 'zh';
      const attr = el.dataset.siteAttr;  // if set, patch this attribute
      const row = map[key];
      if (!row) return;
      const val = (lang === 'en' ? row.value_en : row.value_zh);
      if (val == null || val === '') return;
      if (attr) el.setAttribute(attr, val);
      else      el.textContent = val;
    });

    /* Logo: special-case — sidebar and hero logos, patch src attribute */
    const logoUrl = map.site_logo_url?.value_zh;
    if (logoUrl) {
      document.querySelectorAll('[data-site-logo]').forEach(img => { img.src = logoUrl; });
    }

    /* Re-trigger counter animation if stats were patched (counters may
       read data-target at animation time, so patching before animation
       is enough — but dispatch a signal for listeners just in case) */
    document.dispatchEvent(new CustomEvent('site-content-loaded', { detail: map }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
