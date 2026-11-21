/* ============================================================
   Taiwan Teen Trust — Admin JS (Supabase Edition)
   Auth (Supabase Auth) + DB (Postgres) + Storage (media bucket)
   + UI utilities (toast, modal, sidebar, upload zone)
   ============================================================ */

'use strict';

/* ════════════════════ SUPABASE CLIENT ════════════════════ */
const SUPABASE_URL = 'https://tpolpfulwsfqpghweasl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_grN4TNJpPS7xNBQeiStUmQ_WNc0u8_J';

if (!window.supabase || !window.supabase.createClient) {
  throw new Error('Supabase JS library not loaded. Include @supabase/supabase-js before admin.js.');
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/* ════════════════════ AUTH ════════════════════ */
const Auth = {
  async login(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    return { ok: !error, error: error?.message, user: data?.user || null };
  },

  async logout() {
    await sb.auth.signOut();
    window.location.href = 'index.html';
  },

  async check() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return null; }
    return session.user;
  },

  async get() {
    const { data: { session } } = await sb.auth.getSession();
    return session?.user || null;
  }
};

/* ════════════════════ SAFETY + ERRORS ════════════════════ */

/* Escape any DB/user string before putting it into innerHTML. */
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Turn a Supabase/Postgres error into a sentence people can act on. */
function friendlyError(error) {
  const msg = (error && (error.message || error.error_description)) || String(error || '');
  const code = error && error.code;
  if (code === '23505' || /duplicate key/i.test(msg)) return t('err.duplicate');
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) return t('err.permission');
  if (code === '23502' || /null value in column "([^"]+)"/i.test(msg)) {
    const m = msg.match(/column "([^"]+)"/); return t('err.required') + (m ? `（${m[1]}）` : '');
  }
  if (code === '42703' || /column .* does not exist|Could not find the '.*' column/i.test(msg)) return t('err.column') + ' ' + msg;
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return t('err.network');
  if (/JWT|session|not authenticated/i.test(msg)) return t('err.session');
  return msg;
}

/* ════════════════════ DATA LAYER (async) ════════════════════ */
const DB = {
  async getAll(table, { orderBy = 'created_at', ascending = false } = {}) {
    const { data, error } = await sb.from(table).select('*').order(orderBy, { ascending });
    if (error) { console.error('[DB.getAll]', table, error); showToast(t('err.load') + friendlyError(error), 'error'); return []; }
    return data || [];
  },

  async getById(table, id) {
    const { data, error } = await sb.from(table).select('*').eq('id', id).single();
    if (error) { console.error('[DB.getById]', table, id, error); return null; }
    return data;
  },

  async insert(table, row) {
    const { data, error } = await sb.from(table).insert(row).select().single();
    if (error) { console.error('[DB.insert]', table, error); showToast(t('err.insert') + friendlyError(error), 'error'); return null; }
    return data;
  },

  async update(table, id, patch) {
    const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single();
    if (error) { console.error('[DB.update]', table, id, error); showToast(t('err.update') + friendlyError(error), 'error'); return null; }
    return data;
  },

  async delete(table, id) {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) { console.error('[DB.delete]', table, id, error); showToast(t('err.delete') + friendlyError(error), 'error'); return false; }
    return true;
  },

  /* Upsert by key — useful for site_content (key-value) */
  async upsert(table, row, conflictKey = 'id') {
    const { data, error } = await sb.from(table).upsert(row, { onConflict: conflictKey }).select().single();
    if (error) { console.error('[DB.upsert]', table, error); showToast(t('err.save') + friendlyError(error), 'error'); return null; }
    return data;
  },

  /* Count rows — used by dashboard */
  async count(table) {
    const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
    if (error) { console.error('[DB.count]', table, error); return 0; }
    return count || 0;
  }
};

/* ════════════════════ STORAGE (media bucket) ════════════════════ */
const Storage = {
  /**
   * Upload a File/Blob to the 'media' bucket.
   * folder: subfolder under 'media/' e.g. 'members', 'projects', 'posts'
   * Returns the public URL, or null on error.
   */
  async upload(file, folder = 'general') {
    const ext = (file.name || 'file').split('.').pop().toLowerCase() || 'bin';
    const rand = Math.random().toString(36).slice(2, 10);
    const path = `${folder}/${Date.now()}-${rand}.${ext}`;
    const { error } = await sb.storage.from('media').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined
    });
    if (error) { console.error('[Storage.upload]', error); showToast('上傳失敗：' + error.message, 'error'); return null; }
    const { data } = sb.storage.from('media').getPublicUrl(path);
    return data.publicUrl;
  },

  /**
   * Delete a file by its public URL (extracts the storage path).
   */
  async delete(publicUrl) {
    if (!publicUrl) return false;
    const idx = publicUrl.indexOf('/media/');
    if (idx === -1) return false;
    const path = publicUrl.slice(idx + 7);
    const { error } = await sb.storage.from('media').remove([path]);
    if (error) { console.error('[Storage.delete]', error); return false; }
    return true;
  }
};

/* ════════════════════ ADMIN USERS (edge function) ════════════════════ */
const ADMIN_FN_URL = `${SUPABASE_URL}/functions/v1/admin-users`;

async function callAdminFn(method, { body, query } = {}) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { ok: false, status: 401, error: 'Not signed in' };
  const url = query ? `${ADMIN_FN_URL}?${new URLSearchParams(query)}` : ADMIN_FN_URL;
  let resp, text, json;
  try {
    resp = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    text = await resp.text();
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  } catch (e) {
    return { ok: false, status: 0, error: e.message || 'network error' };
  }
  if (!resp.ok) {
    console.error('[admin-users]', method, resp.status, 'body:', text, 'parsed:', json);
    const msg = json.error || json.message || json.msg || json.code || json.raw || text || `HTTP ${resp.status}`;
    return { ok: false, status: resp.status, error: `${resp.status}: ${msg}` };
  }
  return { ok: true, status: resp.status, data: json };
}

const Admins = {
  async list() {
    const r = await callAdminFn('GET');
    return r.ok ? { ok: true, list: r.data?.admins || [] } : { ok: false, error: r.error, list: [] };
  },
  async invite(email, name, role = 'member') {
    const redirectTo = window.location.origin + '/admin/index.html';
    const r = await callAdminFn('POST', { body: { email, name, role, redirectTo } });
    return r.ok ? { ok: true, admin: r.data?.admin } : { ok: false, error: r.error };
  },
  async remove(id) {
    const r = await callAdminFn('DELETE', { query: { id } });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  },
  /* Update name / role on the admin_users row directly via DB.
     Edge function needed only for auth-side actions (invite/delete). */
  async update(id, patch) {
    const data = await DB.update('admin_users', id, patch);
    return data ? { ok: true, admin: data } : { ok: false, error: 'update failed' };
  },
  /* Send a password-reset email to the user's email address. */
  async resetPassword(email) {
    const redirectTo = `${window.location.origin}/admin/index.html`;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    return error ? { ok: false, error: error.message } : { ok: true };
  },
  /* Set password directly via edge function (requires admin-users function to support setPassword action) */
  async setPassword(userId, newPassword) {
    const r = await callAdminFn('POST', { body: { action: 'setPassword', userId, password: newPassword } });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }
};

/* ════════════════════ UI UTILITIES ════════════════════ */

/* ── Toast notifications ── */
let toastContainer;
function initToasts() {
  if (toastContainer) return;
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  document.body.appendChild(toastContainer);
}

function showToast(message, type = 'info') {
  if (!toastContainer) initToasts();
  const icons = { success: '✓', error: '✕', info: 'ℹ', warn: '!' };
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const icon = document.createElement('span'); icon.className = 'toast__icon'; icon.textContent = icons[type] || icons.info;
  const text = document.createElement('span'); text.textContent = message;
  toast.append(icon, text);
  toastContainer.appendChild(toast);
  const remove = () => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 350); };
  toast.addEventListener('click', remove);
  requestAnimationFrame(() => { requestAnimationFrame(() => toast.classList.add('show')); });
  setTimeout(remove, type === 'error' ? 7000 : 3200);
}

/* ── Modal ──
   Any input inside an open modal marks it "dirty". Closing it by the ✕,
   the backdrop or Esc asks before throwing edits away. Pages close it
   programmatically with closeModal(id) after a successful save. */
function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.dataset.dirty = '';
  m.classList.add('open');
  clearFieldErrors(m);
  setTimeout(() => { const f = m.querySelector('input:not([type=hidden]):not([type=file]), textarea, select'); if (f) f.focus(); }, 60);
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.remove('open'); m.dataset.dirty = ''; }
}
function requestCloseModal(m) {
  if (!m) return;
  if (m.dataset.dirty) {
    confirmAction(t('confirm.discard.title'), t('confirm.discard.text'), () => { m.classList.remove('open'); m.dataset.dirty = ''; },
      { okLabel: t('confirm.discard.ok'), icon: '✋' });
    return;
  }
  m.classList.remove('open');
}
let modalsReady = false;
function initModals() {
  if (modalsReady) return;   // pages sometimes call this again; listeners must be added once
  modalsReady = true;
  document.addEventListener('input', e => {
    const m = e.target.closest && e.target.closest('.modal-backdrop');
    if (m && m.id !== 'confirm-modal') m.dataset.dirty = '1';
    const f = e.target.closest && e.target.closest('.field');
    if (f) f.classList.remove('field--error');
  });
  document.addEventListener('click', e => {
    const backdrop = e.target.classList && e.target.classList.contains('modal-backdrop') ? e.target : null;
    if (backdrop && backdrop.id !== 'confirm-modal') requestCloseModal(backdrop);
    const closer = e.target.closest && e.target.closest('[data-close-modal]');
    if (closer) requestCloseModal(closer.closest('.modal-backdrop'));
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const conf = document.getElementById('confirm-modal');
    if (conf) { conf.remove(); return; }
    const open = [...document.querySelectorAll('.modal-backdrop.open')].pop();
    if (open) requestCloseModal(open);
  });
  window.addEventListener('beforeunload', e => {
    if (document.querySelector('.modal-backdrop.open[data-dirty="1"]') || document.body.dataset.dirty === '1') {
      e.preventDefault(); e.returnValue = '';
    }
  });
}

/* ── Inline field validation ──
   validateFields(container) checks every [required] input inside it,
   marks empty ones in red with a message, focuses the first, and returns
   true when everything is filled. */
function clearFieldErrors(root) {
  (root || document).querySelectorAll('.field--error').forEach(f => f.classList.remove('field--error'));
}
function validateFields(root) {
  clearFieldErrors(root);
  let first = null;
  root.querySelectorAll('[required]').forEach(input => {
    if (input.closest('[hidden]') || input.offsetParent === null) return;
    if (String(input.value || '').trim()) return;
    const field = input.closest('.field');
    if (field) {
      field.classList.add('field--error');
      let msg = field.querySelector('.field-error-msg');
      if (!msg) { msg = document.createElement('div'); msg.className = 'field-error-msg'; field.appendChild(msg); }
      msg.textContent = t('err.field.required');
    }
    if (!first) first = input;
  });
  if (first) { first.focus(); showToast(t('err.fix.fields'), 'warn'); return false; }
  return true;
}

/* ── Slug helper: "Stray Aid Map" → "stray-aid-map" ── */
function slugify(str) {
  return String(str || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
/* <input data-slug-from="p-title-en"> fills itself from that field until
   someone edits the slug by hand. */
function initSlugFields() {
  document.querySelectorAll('[data-slug-from]').forEach(slugEl => {
    const sources = slugEl.dataset.slugFrom.split(',').map(id => document.getElementById(id.trim())).filter(Boolean);
    if (!sources.length) return;
    slugEl.addEventListener('input', () => { slugEl.dataset.manual = slugEl.value ? '1' : ''; });
    sources.forEach(src => src.addEventListener('input', () => {
      if (slugEl.dataset.manual) return;
      const base = sources.map(s => slugify(s.value)).find(Boolean) || '';
      slugEl.value = base;
    }));
    // when a modal opens with an existing slug, treat it as manual
    new MutationObserver(() => { slugEl.dataset.manual = slugEl.value ? '1' : ''; })
      .observe(slugEl.closest('.modal-backdrop') || document.body, { attributes: true, attributeFilter: ['class'] });
  });
}

/* ── Confirm dialog ── */
function confirmAction(title, text, onConfirm, opts = {}) {
  const existing = document.getElementById('confirm-modal');
  if (existing) existing.remove();
  const okLabel = opts.okLabel || t('confirm.delete.ok');
  const danger = opts.danger !== false;

  const modal = document.createElement('div');
  modal.id = 'confirm-modal';
  modal.className = 'modal-backdrop open';
  modal.innerHTML = `
    <div class="modal confirm-dialog" role="alertdialog" aria-modal="true">
      <div class="modal__body" style="text-align:center;padding:2rem 1.5rem">
        <div class="confirm-icon">${esc(opts.icon || '⚠️')}</div>
        <div class="confirm-title">${esc(title)}</div>
        <div class="confirm-text">${esc(text)}</div>
      </div>
      <div class="modal__footer" style="justify-content:center;gap:.75rem">
        <button class="btn btn--outline" id="confirm-cancel">${esc(t('btn.cancel'))}</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" id="confirm-ok">${esc(okLabel)}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('confirm-cancel').onclick = () => modal.remove();
  document.getElementById('confirm-ok').onclick = () => { modal.remove(); onConfirm(); };
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  setTimeout(() => document.getElementById('confirm-cancel')?.focus(), 30);
}

/* ── Sidebar (single source of truth for every admin page) ── */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  settings: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  focus: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>',
  projects: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  categories: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  blog: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  members: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  map: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  applications: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  users: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M18 8v6"/><path d="M21 11h-6"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
};
const NAV = [
  { group: 'nav.group.overview', items: [
    { href: 'dashboard.html', icon: 'dashboard', key: 'nav.dashboard' },
  ]},
  { group: 'nav.group.content', items: [
    { href: 'settings.html', icon: 'settings', key: 'nav.settings' },
    { href: 'focus.html', icon: 'focus', key: 'nav.focus' },
    { href: 'projects.html', icon: 'projects', key: 'nav.projects' },
    { href: 'blog.html', icon: 'blog', key: 'nav.blog' },
    { href: 'members.html', icon: 'members', key: 'nav.members' },
    { href: 'categories.html', icon: 'categories', key: 'nav.categories' },
  ]},
  { group: 'nav.group.map', items: [
    { href: 'map-locations.html', icon: 'map', key: 'nav.map' },
    { href: '../projects/stray-aid-map.html', icon: 'external', key: 'nav.map.public', external: true },
  ]},
  { group: 'nav.group.people', items: [
    { href: 'applications.html', icon: 'applications', key: 'nav.applications' },
    { href: 'users.html', icon: 'users', key: 'nav.users', adminOnly: true },
  ]},
  { group: 'nav.system', items: [
    { href: '../index.html', icon: 'external', key: 'nav.preview', external: true },
  ]},
];
function renderSidebar() {
  const aside = document.getElementById('admin-sidebar');
  if (!aside) return;
  const here = (location.pathname.split('/').pop() || 'dashboard.html');
  const svg = name => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  aside.innerHTML = `
    <a class="sidebar-brand" href="dashboard.html">
      <img src="../assets/logo-real.png" alt="TTT" style="width:30px;height:30px;border-radius:8px;object-fit:cover;object-position:left center;flex-shrink:0">
      <div><div class="sidebar-brand-text" data-i18n="brand.name">TTT Admin</div><div class="sidebar-brand-sub" data-i18n="brand.sub">管理後台</div></div>
    </a>
    ${NAV.map(g => `
      <div class="sidebar-section">
        <div class="sidebar-section-label" data-i18n="${g.group}"></div>
        ${g.items.map(it => `
          <a href="${it.href}" class="sidebar-link${it.href === here ? ' active' : ''}"${it.external ? ' target="_blank" rel="noopener"' : ''}${it.adminOnly ? ' data-admin-only' : ''}${it.href === here ? ' aria-current="page"' : ''}>
            ${svg(it.icon)}<span data-i18n="${it.key}"></span>${it.external ? '<span class="sidebar-ext">↗</span>' : ''}
          </a>`).join('')}
      </div>`).join('')}
    <div class="sidebar-footer">
      <div class="sidebar-user"><div class="sidebar-avatar">·</div><div><div class="sidebar-user-name"></div><div class="sidebar-user-role" data-i18n="user.role.member"></div></div></div>
      <button class="btn-logout" data-i18n="btn.logout">登出</button>
    </div>`;
  applyI18n();
}

/* ── Sidebar ── */
async function initSidebar() {
  const user = await Auth.get();
  if (!user) return;

  const avatar = document.querySelector('.sidebar-avatar');
  const name   = document.querySelector('.sidebar-user-name');
  if (avatar) avatar.textContent = (user.email || '?')[0].toUpperCase();
  if (name)   name.textContent   = user.email || '';

  // Look up actual role from admin_users table
  let role = 'member';
  try {
    const { data } = await sb.from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .single();
    role = data?.role || 'member';
  } catch { /* default to member on error */ }

  // Update role badge with correct i18n key (so lang switch also updates it)
  const roleEl = document.querySelector('.sidebar-user-role');
  if (roleEl) roleEl.dataset.i18n = role === 'admin' ? 'user.role.admin' : 'user.role.member';

  // Hide the backend-users nav link for non-admins
  if (role !== 'admin') {
    document.querySelectorAll('.admin-sidebar [data-admin-only]').forEach(a => { a.style.display = 'none'; });
  }

  const logoutBtn = document.querySelector('.btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());

  // ── Mobile sidebar: inject hamburger + overlay ──
  const sidebar  = document.getElementById('admin-sidebar');
  const topbar   = document.querySelector('.admin-topbar');
  if (sidebar && topbar && !document.getElementById('sidebar-hamburger')) {
    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay';
    document.body.appendChild(overlay);

    // Hamburger button (injected as first child of topbar)
    const btn = document.createElement('button');
    btn.id = 'sidebar-hamburger';
    btn.setAttribute('aria-label', '選單');
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6"  x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
    topbar.insertBefore(btn, topbar.firstChild);

    const openSidebar  = () => { sidebar.classList.add('open');  overlay.classList.add('show'); };
    const closeSidebar = () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); };

    btn.addEventListener('click', openSidebar);
    overlay.addEventListener('click', closeSidebar);

    // Close sidebar when a nav link is tapped on mobile
    sidebar.querySelectorAll('.sidebar-link').forEach(link => {
      link.addEventListener('click', () => { if (window.innerWidth <= 768) closeSidebar(); });
    });
  }

  /* Pending applications badge (admin only) */
  if (role === 'admin') {
    try {
      const { count } = await sb.from('join_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (count > 0) {
        const appsLink = document.querySelector('.admin-sidebar a[href="applications.html"]');
        if (appsLink && !appsLink.querySelector('.sidebar-notif')) {
          const badge = document.createElement('span');
          badge.className = 'sidebar-notif';
          badge.textContent = count > 99 ? '99+' : count;
          appsLink.appendChild(badge);
        }
      }
    } catch (_) {}
  }
}

/* ── Search filter helper ── */
function filterTable(rows, query, fields) {
  if (!query) return rows;
  const q = query.toLowerCase();
  return rows.filter(r => fields.some(f => (r[f] || '').toString().toLowerCase().includes(q)));
}

/* ── Date formatter ── */
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/* ════════════════════ I18N ════════════════════ */
const I18N = {
  zh: {
    /* Brand / sidebar */
    'brand.name': 'TTT Admin',
    'brand.sub': '管理後台',
    'nav.main': '主選單',
    'nav.system': '系統',
    'nav.dashboard': '儀表板',
    'nav.members': '團隊成員',
    'nav.projects': '專案管理',
    'nav.blog': '部落格文章',
    'nav.focus': '年度主題',
    'nav.categories': '分類管理',
    'cats.proj.title': '專案分類',
    'cats.proj.new': '新增分類',
    'cats.dept.title': '團隊部門',
    'cats.dept.new': '新增部門',
    'cats.col.icon': '圖示',
    'cats.col.key': '識別碼',
    'cats.col.label_zh': '中文名稱',
    'cats.col.label_en': '英文名稱',
    'cats.col.color': '顏色',
    'cats.col.order': '排序',
    'cats.col.actions': '操作',
    'cats.f.key': '識別碼 (key) *',
    'cats.f.key_hint': '小寫英文，建立後不建議變更',
    'cats.f.icon': '圖示 (emoji)',
    'cats.f.label_zh': '中文名稱 *',
    'cats.f.label_en': '英文名稱',
    'cats.f.color': '顏色 (HEX)',
    'cats.f.order': '排序',
    'nav.map': '地圖資料點',
    'nav.applications': '加入申請',
    'nav.users': '管理員帳號',
    'nav.settings': '網站設定',
    'nav.preview': '前台預覽',
    'user.role.admin': '管理員',
    'user.role.member': '團員',
    'nav.group.overview': '總覽',
    'dash.todo.title': '待處理事項',
    'settings.where.hero': '顯示位置：首頁最上方大標題下面的那段介紹文字。',
    'settings.where.mission': '顯示位置：首頁黃色「信任」區塊右側的說明文字。',
    'settings.where.pillars': '顯示位置：首頁「三大行動方向」的三張彩色卡片。',
    'settings.where.stats': '顯示位置：首頁的四張彩色數字卡。「觸及人次」由網站自動計算，不用手動填。',
    'settings.where.social': '顯示位置：每一頁的頁尾；嘖嘖連結是「支持我們」按鈕要轉去的募資頁。',
    'settings.where.basic': '這幾欄目前只在後台記錄，前台還沒有用到。',
    'settings.reach.auto': '自動計算（每次有人打開首頁 +1）',
    'settings.nothing': '沒有任何變更需要儲存',
    'dash.todo.apps': '份加入申請等你審核',
    'dash.todo.drafts': '篇部落格文章還是草稿',
    'dash.todo.proj_en': '個專案缺少英文名稱或簡介',
    'dash.todo.members': '位成員缺少英文名字或照片',
    'dash.todo.coords': '個地圖地點沒有座標',
    'dash.todo.none': '目前沒有需要處理的事情',
    'dash.map.title': '我想改前台的…',
    'dash.map.home': '首頁簡介、使命、三大方向、數字',
    'dash.map.footer': '頁尾社群連結、嘖嘖募資連結、Logo',
    'dash.map.focus': '年度主題頁',
    'dash.map.projects': '專案頁的專案卡片',
    'dash.map.blog': '部落格文章',
    'dash.map.team': '團隊頁的成員',
    'dash.map.cats': '專案分類、團隊部門',
    'dash.map.map': '浪浪地圖上的收容所與地點',
    'dash.map.later': '首頁大標題、跑馬燈、首頁專案卡片與「關於我們」頁目前寫在程式裡，下一階段會開放在後台修改。',
    'nav.group.content': '網站內容',
    'nav.group.map': '浪浪地圖',
    'nav.group.people': '人員',
    'nav.map.public': '查看地圖前台',
    'err.load': '讀取失敗：',
    'err.insert': '新增失敗：',
    'err.update': '更新失敗：',
    'err.delete': '刪除失敗：',
    'err.save': '儲存失敗：',
    'err.duplicate': '已經有相同的資料（例如網址代稱重複），請換一個。',
    'err.permission': '沒有權限：你的帳號不是後台成員，或需要管理員權限。',
    'err.required': '有必填欄位沒有填寫',
    'err.column': '資料庫缺少欄位，請通知管理員執行最新的 SQL。',
    'err.network': '連線失敗，請檢查網路後再試一次。',
    'err.session': '登入已過期，請重新登入。',
    'err.field.required': '這一欄必填',
    'err.fix.fields': '請先完成標示紅色的欄位',
    'err.pass.short': '密碼長度至少 10 個字元',
    'err.pass.mismatch': '兩次密碼不一致，請重新輸入',
    'confirm.discard.title': '要放棄未儲存的變更嗎？',
    'confirm.discard.text': '你剛才輸入的內容還沒有儲存，關閉後就會消失。',
    'confirm.discard.ok': '放棄變更',
    'confirm.delete.ok': '確認刪除',
    'btn.logout': '登出',
    'btn.view_site': '前台',
    'btn.save': '儲存',
    'btn.saving': '儲存中…',
    'btn.cancel': '取消',
    'btn.delete': '刪除',
    'btn.confirm_delete': '確認刪除',
    'btn.edit': '編輯',
    'btn.add': '新增',
    'btn.upload': '上傳',
    'btn.remove': '移除',
    'common.home': '首頁',
    'common.all': '全部',
    'common.loading': '讀取中…',

    /* Login */
    'login.brand.sub': 'Admin Panel',
    'login.title': '歡迎回來',
    'login.sub': '請輸入管理員帳號登入後台。',
    'login.email': '電子郵件',
    'login.password': '密碼',
    'login.submit': '登入',
    'login.submitting': '登入中…',
    'login.hint': '使用管理員帳號登入。忘記密碼請聯絡系統管理員。',
    'login.err.invalid': '電子郵件或密碼不正確。',
    'login.err.generic': '登入失敗，請稍後再試。',
    'login.showpass': '顯示密碼',
    'login.hidepass': '隱藏密碼',
    'login.email.ph': 'name@example.com',

    /* Dashboard */
    'dash.title': '總覽',
    'dash.crumb.current': '儀表板',
    'dash.stat.members': '團隊成員',
    'dash.stat.projects': '進行中專案',
    'dash.stat.posts': '已發布文章',
    'dash.stat.locations': '地圖資料點',
    'dash.panel.activity': '最新動態',
    'dash.panel.quick': '快速操作',
    'dash.qa.new_member': '新增團隊成員',
    'dash.qa.new_project': '新增專案',
    'dash.qa.new_post': '撰寫新文章',
    'dash.qa.new_location': '新增地圖資料點',
    'dash.qa.preview_map': '預覽 Stray Aid Map',
    'dash.card.members.desc': '新增、編輯、停用成員帳號與個人資料。',
    'dash.card.projects.desc': '管理專案狀態、分類與展示資訊。',
    'dash.card.blog': '部落格',
    'dash.card.blog.desc': '發布、編輯與管理所有文章。',
    'dash.card.map.desc': '管理流浪動物地圖上的收容所、醫院等資料。',
    'dash.activity.empty': '尚無動態。',
    'dash.activity.updated': '已更新',
    'dash.type.member': '成員',
    'dash.type.project': '專案',
    'dash.type.post': '文章',
    'dash.type.location': '地點',

    /* Members */
    'members.title': '所有成員',
    'members.new': '新增成員',
    'members.edit': '編輯成員',
    'members.search.ph': '搜尋姓名、部門…',
    'members.filter.dept': '所有部門',
    'members.filter.status': '所有狀態',
    'members.status.active': '現役',
    'members.status.alumni': '校友',
    'members.col.name_zh': '姓名',
    'members.col.name_en': '英文姓名',
    'members.col.dept': '部門',
    'members.col.role': '職稱',
    'members.col.year': '屆別',
    'members.col.status': '狀態',
    'members.col.email': '電子郵件',
    'members.col.actions': '操作',
    'members.photo.title': '成員大頭照',
    'members.photo.hint': '建議尺寸 400×400，JPG/PNG，點擊或拖曳上傳',
    'members.f.name_zh': '中文姓名 *',
    'members.f.name_en': '英文姓名',
    'members.f.dept': '部門 *',
    'members.f.role': '職稱',
    'members.f.year': '屆別',
    'members.f.email': '電子郵件',
    'members.f.status': '狀態',
    'members.f.bio': '簡介',

    /* Projects */
    'projects.title': '所有專案',
    'projects.new': '新增專案',
    'projects.edit': '編輯專案',
    'projects.search.ph': '搜尋專案名稱…',
    'projects.filter.cat': '所有分類',
    'projects.filter.status': '所有狀態',
    'projects.status.active': '進行中',
    'projects.status.archived': '已封存',
    'projects.status.draft': '草稿',
    'projects.col.title': '專案名稱',
    'projects.col.category': '分類',
    'projects.col.status': '狀態',
    'projects.col.updated': '最後更新',
    'projects.col.actions': '操作',
    'projects.f.title_zh': '中文名稱 *',
    'projects.f.title_en': '英文名稱',
    'projects.f.category': '分類 *',
    'projects.f.status': '狀態',
    'projects.f.summary_zh': '簡介（中）',
    'projects.f.summary_en': '簡介（英）',
    'projects.f.link': '專案連結',

    /* Blog */
    'blog.title': '所有文章',
    'blog.new': '撰寫文章',
    'blog.edit': '編輯文章',
    'blog.search.ph': '搜尋文章標題…',
    'blog.filter.status': '所有狀態',
    'blog.status.published': '已發布',
    'blog.status.draft': '草稿',
    'blog.col.title': '標題',
    'blog.col.author': '作者',
    'blog.col.status': '狀態',
    'blog.col.published': '發布日期',
    'blog.col.actions': '操作',
    'blog.f.title_zh': '中文標題 *',
    'blog.f.title_en': '英文標題',
    'blog.f.author': '作者',
    'blog.f.status': '狀態',
    'blog.f.excerpt_zh': '摘要（中）',
    'blog.f.excerpt_en': '摘要（英）',
    'blog.f.body_zh': '內文（中）',
    'blog.f.body_en': '內文（英）',

    /* Focus themes */
    'focus.title': '所有年度主題',
    'focus.new': '新增年度主題',
    'focus.edit': '編輯年度主題',
    'focus.empty': '尚無年度主題',
    'focus.col.year': '年份',
    'focus.col.title': '主題',
    'focus.col.status': '狀態',
    'focus.col.media': '媒體',
    'focus.status.active': '當前主題',
    'focus.status.completed': '已完成',
    'focus.status.planned': '規劃中',
    'focus.f.year': '年份 *',
    'focus.f.status': '狀態',
    'focus.f.title_zh': '中文標題 *',
    'focus.f.title_en': '英文標題',
    'focus.f.icon': '圖示 (emoji)',
    'focus.f.color': '主色 (HEX)',
    'focus.f.why_zh': '為什麼是這個議題？（中）',
    'focus.f.why_en': '為什麼是這個議題？（英）',
    'focus.f.response_zh': '我們的回應 / 成果（中）',
    'focus.f.response_en': '我們的回應 / 成果（英）',

    /* Map locations */
    'map.title': '所有資料點',
    'map.new': '新增資料點',
    'map.edit': '編輯資料點',
    'map.search.ph': '搜尋名稱、地址…',
    'map.filter.type': '所有類型',
    'map.type.shelter': '收容所',
    'map.type.vet': '動物醫院',
    'map.type.feed': '餵食站',
    'map.type.rescue': '救援站',
    'map.col.name': '名稱',
    'map.col.type': '類型',
    'map.col.city': '城市',
    'map.col.coord': '座標',
    'map.col.actions': '操作',
    'map.f.name': '名稱 *',
    'map.f.type': '類型 *',
    'map.f.city': '城市',
    'map.f.address': '地址',
    'map.f.phone': '電話',
    'map.f.lat': '緯度',
    'map.f.lng': '經度',
    'map.f.desc': '描述',
    'map.f.photos': '照片',

    /* Admin users */
    'users.crumb.current': '管理員帳號',
    'users.title': '所有管理員',
    'users.sub': '建立可登入後台的社員帳號；系統會寄發邀請信讓對方設定密碼。',
    'users.invite': '邀請管理員',
    'users.invite.title': '邀請新管理員',
    'users.invite.hint': '系統會寄送含設定密碼連結的邀請信到下方信箱。',
    'users.col.email': '電子郵件',
    'users.col.name': '姓名 / 備註',
    'users.col.role': '角色',
    'users.col.created': '建立時間',
    'users.col.actions': '操作',
    'users.f.email': '電子郵件 *',
    'users.f.name': '姓名 / 備註',
    'users.f.email.ph': 'name@example.com',
    'users.f.name.ph': '王小明 / 資訊部部長',
    'users.role.admin': '管理員',
    'users.role.member': '團員',
    'users.f.role': '角色',
    'users.f.role.hint': '管理員可管理所有資料；團員僅能編輯部分內容。',
    'users.f.password': '新密碼 *',
    'users.f.password.ph': '輸入新密碼（至少 10 個字元）',
    'users.f.password.confirm': '確認密碼 *',
    'users.f.password.confirm.ph': '再輸入一次密碼',
    'users.edit.title': '編輯後台使用者',
    'users.edit': '編輯',
    'users.password.title': '密碼管理',
    'users.password.hint': '直接在此設定新密碼，或寄送密碼重設信讓使用者自行設定。',
    'users.password.set': '直接設定密碼',
    'users.password.setting': '設定中…',
    'users.password.reset': '寄送密碼重設信',
    'users.password.resetting': '寄送中…',
    'users.msg.password_required': '請輸入新密碼',
    'users.msg.password_too_short': '密碼至少需要 10 個字元',
    'users.msg.password_mismatch': '兩次輸入的密碼不一致',
    'users.msg.password_set': '密碼已設定',
    'users.msg.password_set_fail': '設定密碼失敗',
    'users.msg.password_sent': '已寄出密碼重設信',
    'users.msg.password_fail': '寄送密碼重設信失敗',
    'users.empty.title': '尚無使用者',
    'users.empty.text': '點擊右上角「邀請使用者」新增第一位。',
    'users.remove.title': '移除使用者？',
    'users.remove.text': '此動作將刪除帳號，對方將無法再登入後台。',
    'users.invite': '邀請使用者',
    'users.invite.title': '邀請新使用者',
    'users.invite.hint': '系統會寄送含設定密碼連結的邀請信到下方信箱。預設角色為「團員」。',
    'users.title': '所有後台使用者',
    'users.sub': '建立可登入後台的帳號；可以指定角色為管理員或團員。系統會寄發邀請信讓對方設定密碼。',
    'users.msg.invited': '已寄出邀請信',
    'users.msg.invite_fail': '邀請失敗',
    'users.msg.removed': '已移除使用者',
    'users.msg.updated': '已更新',
    'users.msg.self_remove': '無法移除自己',
    'users.msg.email_required': '請輸入電子郵件',
    'users.msg.email_invalid': '電子郵件格式不正確',
    'users.badge.you': '你',

    /* Settings */
    'settings.crumb.current': '網站設定',
    'settings.title': '網站設定',
    'settings.sub': '管理前台顯示的文字、圖片與社群連結。',
    'settings.save_all': '全部儲存',
    'settings.section.basic': '基本資訊',
    'settings.section.logo': '網站 Logo',
    'settings.section.hero': '首頁 Hero 區塊',
    'settings.section.mission': '使命宣言',
    'settings.section.pillars': '三大支柱',
    'settings.section.stats': '統計數字',
    'settings.section.social': '社群連結',
    'settings.lang.zh': '中文',
    'settings.lang.en': 'English',
    'settings.f.site_name_zh': '組織名稱（中文）',
    'settings.f.site_name_en': '組織名稱（英文）',
    'settings.f.email': '聯絡 Email',
    'settings.f.year': '成立年份',
    'settings.f.hero_tagline_zh': '主標語（中文）',
    'settings.f.hero_tagline_en': '主標語（英文）',
    'settings.f.hero_desc_zh': '描述（中文）',
    'settings.f.hero_desc_en': '描述（英文）',
    'settings.f.mission_quote_zh': '金句（中文）',
    'settings.f.mission_quote_en': '金句（英文）',
    'settings.f.mission_body_zh': '內文（中文）',
    'settings.f.mission_body_en': '內文（英文）',
    'settings.f.pillar': '主軸',
    'settings.f.title_zh': '標題（中文）',
    'settings.f.title_en': '標題（英文）',
    'settings.f.desc_zh': '描述（中文）',
    'settings.f.desc_en': '描述（英文）',
    'settings.f.stat_members': '現役成員',
    'settings.f.stat_projects': '進行中專案',
    'settings.f.stat_themes': '年度主題',
    'settings.f.stat_reached': '觸及人次',
    'settings.f.instagram': 'Instagram 連結',
    'settings.f.threads': 'Threads 連結',
    'settings.f.zeczec': '嘖嘖募資連結',
    'settings.logo.current': '目前 Logo',
    'settings.logo.upload_new': '上傳新 Logo',
    'settings.logo.drop_hint': '點擊或拖曳上傳',
    'settings.logo.accept_hint': 'PNG、JPG — 建議正方形，最少 256×256',
    'settings.logo.footnote': 'Logo 會上傳至 Supabase Storage。清除後前台將顯示預設 logo。',
    'settings.logo.reset': '清除',

    /* Toast / misc */
    'msg.saved': '已儲存',
    'msg.deleted': '已刪除',
    'msg.created': '已新增',
    'msg.updated': '已更新',
    'msg.load_fail': '讀取失敗',
    'msg.save_fail': '儲存失敗',
    'msg.save_partial_fail': '部分儲存失敗',
    'msg.confirm_del_title': '確定要刪除嗎？',
    'msg.confirm_del_text': '此動作無法復原。',
    'msg.uploading': '上傳中…',
    'msg.upload_invalid': '請選擇圖片檔案',
    'msg.logo_uploaded': 'Logo 已上傳（記得儲存）',
    'msg.logo_will_clear': '將在儲存後清除 Logo',
    'msg.settings_saved': '設定已儲存',
  },

  en: {
    'brand.name': 'TTT Admin',
    'brand.sub': 'Admin Console',
    'nav.main': 'Main',
    'nav.system': 'System',
    'nav.dashboard': 'Dashboard',
    'nav.members': 'Team Members',
    'nav.projects': 'Projects',
    'nav.blog': 'Blog Posts',
    'nav.focus': 'Annual Focus',
    'nav.categories': 'Categories',
    'cats.proj.title': 'Project Categories',
    'cats.proj.new': 'Add Category',
    'cats.dept.title': 'Departments',
    'cats.dept.new': 'Add Department',
    'cats.col.icon': 'Icon',
    'cats.col.key': 'Key',
    'cats.col.label_zh': 'Chinese',
    'cats.col.label_en': 'English',
    'cats.col.color': 'Color',
    'cats.col.order': 'Order',
    'cats.col.actions': 'Actions',
    'cats.f.key': 'Key *',
    'cats.f.key_hint': 'lowercase, avoid changing after creation',
    'cats.f.icon': 'Icon (emoji)',
    'cats.f.label_zh': 'Chinese Name *',
    'cats.f.label_en': 'English Name',
    'cats.f.color': 'Color (HEX)',
    'cats.f.order': 'Sort Order',
    'nav.map': 'Map Locations',
    'nav.applications': 'Applications',
    'nav.users': 'Admin Accounts',
    'nav.settings': 'Site Settings',
    'nav.preview': 'View Site',
    'user.role.admin': 'Administrator',
    'user.role.member': 'Member',
    'nav.group.overview': 'Overview',
    'dash.todo.title': 'Needs attention',
    'settings.where.hero': 'Shown on: the intro paragraph under the big homepage headline.',
    'settings.where.mission': 'Shown on: the text beside the yellow "TRUST" block on the homepage.',
    'settings.where.pillars': 'Shown on: the three colour cards under "Three Core Pillars" on the homepage.',
    'settings.where.stats': 'Shown on: the four number cards on the homepage. "People reached" is counted automatically.',
    'settings.where.social': 'Shown on: every page footer; the zeczec link is where "Support Us" redirects.',
    'settings.where.basic': 'These are stored for reference only; the public site does not use them yet.',
    'settings.reach.auto': 'Counted automatically (+1 every homepage visit)',
    'settings.nothing': 'Nothing has changed',
    'dash.todo.apps': 'join applications waiting for review',
    'dash.todo.drafts': 'blog posts still in draft',
    'dash.todo.proj_en': 'projects missing an English title or summary',
    'dash.todo.members': 'members missing an English name or photo',
    'dash.todo.coords': 'map locations without coordinates',
    'dash.todo.none': 'Nothing needs your attention right now',
    'dash.map.title': 'I want to change…',
    'dash.map.home': 'Homepage intro, mission, pillars, numbers',
    'dash.map.footer': 'Footer social links, zeczec link, logo',
    'dash.map.focus': 'Annual focus page',
    'dash.map.projects': 'Project cards on the Projects page',
    'dash.map.blog': 'Blog posts',
    'dash.map.team': 'Members on the Team page',
    'dash.map.cats': 'Project categories, departments',
    'dash.map.map': 'Shelters and places on the Stray Aid Map',
    'dash.map.later': 'The homepage headline, marquee, homepage project cards and the About page are still hard-coded; the next phase makes them editable here.',
    'nav.group.content': 'Website content',
    'nav.group.map': 'Stray Aid Map',
    'nav.group.people': 'People',
    'nav.map.public': 'Open public map',
    'err.load': 'Could not load: ',
    'err.insert': 'Could not create: ',
    'err.update': 'Could not update: ',
    'err.delete': 'Could not delete: ',
    'err.save': 'Could not save: ',
    'err.duplicate': 'This already exists (for example the slug is taken). Try another.',
    'err.permission': 'Permission denied: your account is not staff, or this needs an admin.',
    'err.required': 'A required field is empty',
    'err.column': 'The database is missing a column. Ask an admin to run the latest SQL.',
    'err.network': 'Connection failed. Check your network and try again.',
    'err.session': 'Your session expired. Please log in again.',
    'err.field.required': 'This field is required',
    'err.fix.fields': 'Please fill in the fields marked in red',
    'err.pass.short': 'Password must be at least 10 characters',
    'err.pass.mismatch': 'The two passwords do not match',
    'confirm.discard.title': 'Discard unsaved changes?',
    'confirm.discard.text': 'What you typed has not been saved and will be lost.',
    'confirm.discard.ok': 'Discard',
    'confirm.delete.ok': 'Delete',
    'btn.logout': 'Log out',
    'btn.view_site': 'View site',
    'btn.save': 'Save',
    'btn.saving': 'Saving…',
    'btn.cancel': 'Cancel',
    'btn.delete': 'Delete',
    'btn.confirm_delete': 'Confirm delete',
    'btn.edit': 'Edit',
    'btn.add': 'Add',
    'btn.upload': 'Upload',
    'btn.remove': 'Remove',
    'common.home': 'Home',
    'common.all': 'All',
    'common.loading': 'Loading…',

    'login.brand.sub': 'Admin Panel',
    'login.title': 'Welcome back',
    'login.sub': 'Sign in with your admin credentials to continue.',
    'login.email': 'Email',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.submitting': 'Signing in…',
    'login.hint': 'Admin access only. Contact your system administrator if you forgot your password.',
    'login.err.invalid': 'Incorrect email or password.',
    'login.err.generic': 'Sign-in failed. Please try again later.',
    'login.showpass': 'Show password',
    'login.hidepass': 'Hide password',
    'login.email.ph': 'name@example.com',

    'dash.title': 'Overview',
    'dash.crumb.current': 'Dashboard',
    'dash.stat.members': 'Team Members',
    'dash.stat.projects': 'Active Projects',
    'dash.stat.posts': 'Published Posts',
    'dash.stat.locations': 'Map Locations',
    'dash.panel.activity': 'Recent Activity',
    'dash.panel.quick': 'Quick Actions',
    'dash.qa.new_member': 'Add team member',
    'dash.qa.new_project': 'Add project',
    'dash.qa.new_post': 'Write post',
    'dash.qa.new_location': 'Add map location',
    'dash.qa.preview_map': 'Preview Stray Aid Map',
    'dash.card.members.desc': 'Create, edit, and deactivate team accounts and profiles.',
    'dash.card.projects.desc': 'Manage project status, categories, and display details.',
    'dash.card.blog': 'Blog',
    'dash.card.blog.desc': 'Publish, edit, and manage all posts.',
    'dash.card.map.desc': 'Manage shelters, clinics, and other points on the stray-aid map.',
    'dash.activity.empty': 'No recent activity.',
    'dash.activity.updated': 'updated',
    'dash.type.member': 'Member',
    'dash.type.project': 'Project',
    'dash.type.post': 'Post',
    'dash.type.location': 'Location',

    'members.title': 'All Members',
    'members.new': 'Add Member',
    'members.edit': 'Edit Member',
    'members.search.ph': 'Search name, department…',
    'members.filter.dept': 'All departments',
    'members.filter.status': 'All statuses',
    'members.status.active': 'Active',
    'members.status.alumni': 'Alumni',
    'members.col.name_zh': 'Name (ZH)',
    'members.col.name_en': 'Name (EN)',
    'members.col.dept': 'Department',
    'members.col.role': 'Role',
    'members.col.year': 'Cohort',
    'members.col.status': 'Status',
    'members.col.email': 'Email',
    'members.col.actions': 'Actions',
    'members.photo.title': 'Profile photo',
    'members.photo.hint': 'Recommended 400×400, JPG/PNG. Click or drop to upload.',
    'members.f.name_zh': 'Chinese name *',
    'members.f.name_en': 'English name',
    'members.f.dept': 'Department *',
    'members.f.role': 'Role',
    'members.f.year': 'Cohort',
    'members.f.email': 'Email',
    'members.f.status': 'Status',
    'members.f.bio': 'Bio',

    'projects.title': 'All Projects',
    'projects.new': 'New Project',
    'projects.edit': 'Edit Project',
    'projects.search.ph': 'Search project name…',
    'projects.filter.cat': 'All categories',
    'projects.filter.status': 'All statuses',
    'projects.status.active': 'Active',
    'projects.status.archived': 'Archived',
    'projects.status.draft': 'Draft',
    'projects.col.title': 'Project',
    'projects.col.category': 'Category',
    'projects.col.status': 'Status',
    'projects.col.updated': 'Last updated',
    'projects.col.actions': 'Actions',
    'projects.f.title_zh': 'Chinese title *',
    'projects.f.title_en': 'English title',
    'projects.f.category': 'Category *',
    'projects.f.status': 'Status',
    'projects.f.summary_zh': 'Summary (ZH)',
    'projects.f.summary_en': 'Summary (EN)',
    'projects.f.link': 'Project link',

    'blog.title': 'All Posts',
    'blog.new': 'Write Post',
    'blog.edit': 'Edit Post',
    'blog.search.ph': 'Search post title…',
    'blog.filter.status': 'All statuses',
    'blog.status.published': 'Published',
    'blog.status.draft': 'Draft',
    'blog.col.title': 'Title',
    'blog.col.author': 'Author',
    'blog.col.status': 'Status',
    'blog.col.published': 'Published',
    'blog.col.actions': 'Actions',
    'blog.f.title_zh': 'Chinese title *',
    'blog.f.title_en': 'English title',
    'blog.f.author': 'Author',
    'blog.f.status': 'Status',
    'blog.f.excerpt_zh': 'Excerpt (ZH)',
    'blog.f.excerpt_en': 'Excerpt (EN)',
    'blog.f.body_zh': 'Body (ZH)',
    'blog.f.body_en': 'Body (EN)',

    /* Focus themes */
    'focus.title': 'All Annual Focus Themes',
    'focus.new': 'New Focus Theme',
    'focus.edit': 'Edit Focus Theme',
    'focus.empty': 'No focus themes yet',
    'focus.col.year': 'Year',
    'focus.col.title': 'Theme',
    'focus.col.status': 'Status',
    'focus.col.media': 'Media',
    'focus.status.active': 'Current Focus',
    'focus.status.completed': 'Completed',
    'focus.status.planned': 'Planned',
    'focus.f.year': 'Year *',
    'focus.f.status': 'Status',
    'focus.f.title_zh': 'Chinese Title *',
    'focus.f.title_en': 'English Title',
    'focus.f.icon': 'Icon (emoji)',
    'focus.f.color': 'Theme Color (HEX)',
    'focus.f.why_zh': 'Why this issue? (ZH)',
    'focus.f.why_en': 'Why this issue? (EN)',
    'focus.f.response_zh': 'Our Response / Impact (ZH)',
    'focus.f.response_en': 'Our Response / Impact (EN)',

    'map.title': 'All Locations',
    'map.new': 'Add Location',
    'map.edit': 'Edit Location',
    'map.search.ph': 'Search name, address…',
    'map.filter.type': 'All types',
    'map.type.shelter': 'Shelter',
    'map.type.vet': 'Vet clinic',
    'map.type.feed': 'Feeding station',
    'map.type.rescue': 'Rescue base',
    'map.col.name': 'Name',
    'map.col.type': 'Type',
    'map.col.city': 'City',
    'map.col.coord': 'Coordinates',
    'map.col.actions': 'Actions',
    'map.f.name': 'Name *',
    'map.f.type': 'Type *',
    'map.f.city': 'City',
    'map.f.address': 'Address',
    'map.f.phone': 'Phone',
    'map.f.lat': 'Latitude',
    'map.f.lng': 'Longitude',
    'map.f.desc': 'Description',
    'map.f.photos': 'Photos',

    'users.crumb.current': 'Admin Accounts',
    'users.title': 'All Admins',
    'users.sub': 'Create accounts that can sign into this admin panel. An invite email will be sent for the recipient to set their password.',
    'users.invite': 'Invite admin',
    'users.invite.title': 'Invite a new admin',
    'users.invite.hint': 'An invite email with a password-setup link will be sent to the address below.',
    'users.col.email': 'Email',
    'users.col.name': 'Name / Note',
    'users.col.role': 'Role',
    'users.col.created': 'Created',
    'users.col.actions': 'Actions',
    'users.f.email': 'Email *',
    'users.f.name': 'Name / Note',
    'users.f.email.ph': 'name@example.com',
    'users.f.name.ph': 'Alice / IT Lead',
    'users.role.admin': 'Admin',
    'users.role.member': 'Member',
    'users.f.role': 'Role',
    'users.f.role.hint': 'Admins can manage everything; members have limited access.',
    'users.f.password': 'New Password *',
    'users.f.password.ph': 'Enter new password (at least 10 characters)',
    'users.f.password.confirm': 'Confirm Password *',
    'users.f.password.confirm.ph': 'Re-enter password',
    'users.edit.title': 'Edit user',
    'users.edit': 'Edit',
    'users.password.title': 'Password',
    'users.password.hint': 'Set a new password directly here, or send a password reset email for the user to set their own password.',
    'users.password.set': 'Set Password Directly',
    'users.password.setting': 'Setting…',
    'users.password.reset': 'Send password-reset email',
    'users.password.resetting': 'Sending…',
    'users.msg.password_required': 'Please enter a new password',
    'users.msg.password_too_short': 'Password must be at least 10 characters',
    'users.msg.password_mismatch': 'Passwords do not match',
    'users.msg.password_set': 'Password set successfully',
    'users.msg.password_set_fail': 'Failed to set password',
    'users.msg.password_sent': 'Password-reset email sent',
    'users.msg.password_fail': 'Failed to send password-reset email',
    'users.empty.title': 'No users yet',
    'users.empty.text': 'Click "Invite user" in the top-right to add the first one.',
    'users.remove.title': 'Remove this user?',
    'users.remove.text': 'This deletes the account. The person will no longer be able to sign in.',
    'users.invite': 'Invite user',
    'users.invite.title': 'Invite a new user',
    'users.invite.hint': 'An invite email with a password-setup link will be sent to the address below. Default role is Member.',
    'users.title': 'All Backend Users',
    'users.sub': 'Create accounts that can sign into this admin panel. Roles can be Admin or Member. An invite email will be sent for the recipient to set their password.',
    'users.msg.invited': 'Invite email sent',
    'users.msg.invite_fail': 'Invite failed',
    'users.msg.removed': 'User removed',
    'users.msg.updated': 'Updated',
    'users.msg.self_remove': 'You cannot remove yourself',
    'users.msg.email_required': 'Email is required',
    'users.msg.email_invalid': 'Invalid email format',
    'users.badge.you': 'You',

    'settings.crumb.current': 'Site Settings',
    'settings.title': 'Site Settings',
    'settings.sub': 'Manage front-end text, images, and social links.',
    'settings.save_all': 'Save all',
    'settings.section.basic': 'Basic Info',
    'settings.section.logo': 'Site Logo',
    'settings.section.hero': 'Homepage Hero',
    'settings.section.mission': 'Mission Statement',
    'settings.section.pillars': 'Three Pillars',
    'settings.section.stats': 'Stats',
    'settings.section.social': 'Social Links',
    'settings.lang.zh': '中文',
    'settings.lang.en': 'English',
    'settings.f.site_name_zh': 'Organization name (Chinese)',
    'settings.f.site_name_en': 'Organization name (English)',
    'settings.f.email': 'Contact email',
    'settings.f.year': 'Founded year',
    'settings.f.hero_tagline_zh': 'Tagline (Chinese)',
    'settings.f.hero_tagline_en': 'Tagline (English)',
    'settings.f.hero_desc_zh': 'Description (Chinese)',
    'settings.f.hero_desc_en': 'Description (English)',
    'settings.f.mission_quote_zh': 'Quote (Chinese)',
    'settings.f.mission_quote_en': 'Quote (English)',
    'settings.f.mission_body_zh': 'Body (Chinese)',
    'settings.f.mission_body_en': 'Body (English)',
    'settings.f.pillar': 'Pillar',
    'settings.f.title_zh': 'Title (Chinese)',
    'settings.f.title_en': 'Title (English)',
    'settings.f.desc_zh': 'Description (Chinese)',
    'settings.f.desc_en': 'Description (English)',
    'settings.f.stat_members': 'Active members',
    'settings.f.stat_projects': 'Active projects',
    'settings.f.stat_themes': 'Annual themes',
    'settings.f.stat_reached': 'People reached',
    'settings.f.instagram': 'Instagram URL',
    'settings.f.threads': 'Threads URL',
    'settings.f.zeczec': 'Zeczec Crowdfunding URL',
    'settings.logo.current': 'Current logo',
    'settings.logo.upload_new': 'Upload new logo',
    'settings.logo.drop_hint': 'Click or drag to upload',
    'settings.logo.accept_hint': 'PNG, JPG — square recommended, min 256×256',
    'settings.logo.footnote': 'Logo is uploaded to Supabase Storage. Clearing restores the default logo.',
    'settings.logo.reset': 'Clear',

    'msg.saved': 'Saved',
    'msg.deleted': 'Deleted',
    'msg.created': 'Created',
    'msg.updated': 'Updated',
    'msg.load_fail': 'Load failed',
    'msg.save_fail': 'Save failed',
    'msg.save_partial_fail': 'Some items failed to save',
    'msg.confirm_del_title': 'Delete this item?',
    'msg.confirm_del_text': 'This action cannot be undone.',
    'msg.uploading': 'Uploading…',
    'msg.upload_invalid': 'Please select an image file',
    'msg.logo_uploaded': 'Logo uploaded (remember to save)',
    'msg.logo_will_clear': 'Logo will be cleared on save',
    'msg.settings_saved': 'Settings saved',
  }
};

const LANG_KEY = 'ttt-admin-lang';

function getLang() {
  const saved = localStorage.getItem(LANG_KEY);
  return (saved === 'en' || saved === 'zh') ? saved : 'zh';
}

function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.lang = (lang === 'en' ? 'en' : 'zh-TW');
  applyI18n();
  document.querySelectorAll('[data-lang-btn]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.langBtn === lang);
  });
  document.dispatchEvent(new CustomEvent('admin-lang-changed', { detail: lang }));
}

function t(key) {
  const lang = getLang();
  return (I18N[lang] && I18N[lang][key]) || (I18N.zh && I18N.zh[key]) || key;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = t(key);
    if (val) el.textContent = val;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.dataset.i18nPh;
    const val = t(key);
    if (val) el.setAttribute('placeholder', val);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    const val = t(key);
    if (val) el.setAttribute('title', val);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.dataset.i18nAria;
    const val = t(key);
    if (val) el.setAttribute('aria-label', val);
  });
  /* Document title */
  const titleEl = document.querySelector('title[data-i18n-title-key]');
  if (titleEl) {
    const baseKey = titleEl.dataset.i18nTitleKey;
    const baseVal = t(baseKey);
    if (baseVal) titleEl.textContent = `TTT Admin — ${baseVal}`;
  }
}

/* Inject language toggle into sidebar footer (admin pages) */
function injectSidebarLangToggle() {
  const footer = document.querySelector('.sidebar-footer');
  if (!footer || footer.querySelector('.sidebar-lang')) return;
  const cur = getLang();
  const wrap = document.createElement('div');
  wrap.className = 'sidebar-lang';
  wrap.innerHTML = `
    <button type="button" data-lang-btn="zh" class="${cur==='zh'?'active':''}">中文</button>
    <button type="button" data-lang-btn="en" class="${cur==='en'?'active':''}">EN</button>`;
  const user = footer.querySelector('.sidebar-user');
  footer.insertBefore(wrap, user || footer.firstChild);
  wrap.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => setLang(b.dataset.langBtn));
  });
}

/* Inject language toggle into login page (top-right of body) */
function injectLoginLangToggle() {
  if (document.querySelector('.login-lang')) return;
  const page = document.querySelector('.login-page');
  if (!page) return;
  const cur = getLang();
  const wrap = document.createElement('div');
  wrap.className = 'login-lang';
  wrap.innerHTML = `
    <button type="button" data-lang-btn="zh" class="${cur==='zh'?'active':''}">中文</button>
    <button type="button" data-lang-btn="en" class="${cur==='en'?'active':''}">EN</button>`;
  page.appendChild(wrap);
  wrap.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => setLang(b.dataset.langBtn));
  });
}

/* ════════════════════ PAGE INIT ════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  initToasts();
  initModals();
  document.documentElement.lang = (getLang() === 'en' ? 'en' : 'zh-TW');

  /* ── Login page ── */
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    injectLoginLangToggle();
    applyI18n();

    const emailIn = document.getElementById('login-email');
    const passIn  = document.getElementById('login-pass');
    const errEl   = document.getElementById('login-error');
    const btn     = loginForm.querySelector('button[type="submit"]');

    /* Password show/hide toggle */
    const pwToggle = document.getElementById('password-toggle');
    if (pwToggle) {
      pwToggle.addEventListener('click', () => {
        const showing = passIn.type === 'password';
        passIn.type = showing ? 'text' : 'password';
        pwToggle.classList.toggle('shown', showing);
        const label = showing ? t('login.hidepass') : t('login.showpass');
        pwToggle.setAttribute('aria-label', label);
        pwToggle.setAttribute('title', label);
      });
    }

    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      errEl.classList.remove('show');
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = t('login.submitting');

      const { ok, error } = await Auth.login(emailIn.value.trim(), passIn.value);
      if (ok) {
        window.location.href = 'dashboard.html';
      } else {
        errEl.textContent = error === 'Invalid login credentials'
          ? t('login.err.invalid')
          : (error || t('login.err.generic'));
        errEl.classList.add('show');
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });

    /* Detect invite / password-recovery token in URL hash */
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const tokenType  = hashParams.get('type');
    if (tokenType === 'invite' || tokenType === 'recovery') {
      document.querySelector('.login-page').style.display = 'none';
      const spBox = document.getElementById('set-password-box');
      if (spBox) spBox.style.display = 'flex';
      const spForm  = document.getElementById('set-password-form');
      const spErr   = document.getElementById('sp-error');
      const spBtn   = document.getElementById('sp-submit');
      if (spForm) {
        spForm.addEventListener('submit', async e => {
          e.preventDefault();
          spErr.classList.remove('show');
          const np = document.getElementById('sp-new-pass').value;
          const cp = document.getElementById('sp-confirm-pass').value;
          if (np.length < 10) {
            spErr.textContent = t('err.pass.short'); spErr.classList.add('show'); return;
          }
          if (np !== cp) {
            spErr.textContent = t('err.pass.mismatch'); spErr.classList.add('show'); return;
          }
          spBtn.disabled = true; spBtn.textContent = '設定中…';
          const { error } = await sb.auth.updateUser({ password: np });
          if (error) {
            spErr.textContent = error.message; spErr.classList.add('show');
            spBtn.disabled = false; spBtn.textContent = '確認設定';
            return;
          }
          window.location.href = 'dashboard.html';
        });
      }
      return;
    }

    /* If already logged in, skip login */
    const existing = await Auth.get();
    if (existing) window.location.href = 'dashboard.html';
    return;
  }

  /* ── All other admin pages: require auth ── */
  if (!document.querySelector('.login-page')) {
    renderSidebar();
    initSlugFields();
    const user = await Auth.check();
    if (user) {
      await initSidebar();
      injectSidebarLangToggle();
      applyI18n();
    }
  }
});

/* ════════════════════ IMAGE UTILITIES ════════════════════ */

/**
 * Compress an image File → Blob (JPEG) with max dimensions.
 * Non-image files (video, SVG, GIF) pass through unchanged.
 */
function compressImage(file, maxW = 1600, maxH = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const passthrough = !file.type.startsWith('image/')
      || file.type === 'image/gif'
      || file.type === 'image/svg+xml';
    if (passthrough) { resolve(file); return; }

    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.round(img.width  * ratio);
        const h = Math.round(img.height * ratio);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        cv.toBlob(blob => {
          if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
          /* Wrap Blob as File so Storage.upload can use .name */
          const out = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
          resolve(out);
        }, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * High-level helper: compress (if image) then upload to Storage.
 * Returns the public URL.
 */
async function uploadToMedia(file, folder = 'general', opts = {}) {
  const { maxW = 1600, maxH = 1600, quality = 0.85, compress = true } = opts;
  const toUpload = (compress && file.type.startsWith('image/'))
    ? await compressImage(file, maxW, maxH, quality)
    : file;
  return await Storage.upload(toUpload, folder);
}

/**
 * Wire a drop-zone element + hidden <input type="file"> to a callback.
 * onFiles(files[]) receives the raw File objects (no compression).
 * Caller is responsible for uploading / processing.
 */
function bindUploadZone(zoneEl, inputEl, onFiles) {
  zoneEl.addEventListener('click', () => inputEl.click());
  zoneEl.addEventListener('dragover',  e => { e.preventDefault(); zoneEl.classList.add('drag-over'); });
  zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('drag-over'));
  zoneEl.addEventListener('drop', e => {
    e.preventDefault(); zoneEl.classList.remove('drag-over');
    onFiles([...e.dataTransfer.files]);
  });
  inputEl.addEventListener('change', () => {
    onFiles([...inputEl.files]);
    inputEl.value = '';
  });
}
