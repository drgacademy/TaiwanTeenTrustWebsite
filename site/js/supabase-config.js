(function () {
  'use strict';
  const SUPABASE_URL = 'https://tpolpfulwsfqpghweasl.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_grN4TNJpPS7xNBQeiStUmQ_WNc0u8_J';

  if (window.supabase && window.supabase.createClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  } else {
    console.warn('[supabase-config] Supabase library not loaded yet; will retry on DOMContentLoaded.');
    document.addEventListener('DOMContentLoaded', () => {
      if (window.supabase && window.supabase.createClient && !window.supabaseClient) {
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false }
        });
      }
    });
  }
})();
