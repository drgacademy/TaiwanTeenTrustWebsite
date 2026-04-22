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

/* ════════════════════ DATA LAYER (async) ════════════════════ */
const DB = {
  async getAll(table, { orderBy = 'created_at', ascending = false } = {}) {
    const { data, error } = await sb.from(table).select('*').order(orderBy, { ascending });
    if (error) { console.error('[DB.getAll]', table, error); showToast('讀取失敗：' + error.message, 'error'); return []; }
    return data || [];
  },

  async getById(table, id) {
    const { data, error } = await sb.from(table).select('*').eq('id', id).single();
    if (error) { console.error('[DB.getById]', table, id, error); return null; }
    return data;
  },

  async insert(table, row) {
    const { data, error } = await sb.from(table).insert(row).select().single();
    if (error) { console.error('[DB.insert]', table, error); showToast('新增失敗：' + error.message, 'error'); return null; }
    return data;
  },

  async update(table, id, patch) {
    const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single();
    if (error) { console.error('[DB.update]', table, id, error); showToast('更新失敗：' + error.message, 'error'); return null; }
    return data;
  },

  async delete(table, id) {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) { console.error('[DB.delete]', table, id, error); showToast('刪除失敗：' + error.message, 'error'); return false; }
    return true;
  },

  /* Upsert by key — useful for site_content (key-value) */
  async upsert(table, row, conflictKey = 'id') {
    const { data, error } = await sb.from(table).upsert(row, { onConflict: conflictKey }).select().single();
    if (error) { console.error('[DB.upsert]', table, error); showToast('儲存失敗：' + error.message, 'error'); return null; }
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
  async invite(email, name) {
    const r = await callAdminFn('POST', { body: { email, name } });
    return r.ok ? { ok: true, admin: r.data?.admin } : { ok: false, error: r.error };
  },
  async remove(id) {
    const r = await callAdminFn('DELETE', { query: { id } });
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
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => { requestAnimationFrame(() => toast.classList.add('show')); });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 350);
  }, 3000);
}

/* ── Modal ── */
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}
function initModals() {
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) backdrop.classList.remove('open');
    });
  });
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-backdrop');
      if (modal) modal.classList.remove('open');
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
    }
  });
}

/* ── Confirm dialog ── */
function confirmAction(title, text, onConfirm) {
  const existing = document.getElementById('confirm-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'confirm-modal';
  modal.className = 'modal-backdrop open';
  modal.innerHTML = `
    <div class="modal confirm-dialog">
      <div class="modal__body" style="text-align:center;padding:2rem 1.5rem">
        <div class="confirm-icon">⚠️</div>
        <div class="confirm-title">${title}</div>
        <div class="confirm-text">${text}</div>
      </div>
      <div class="modal__footer" style="justify-content:center;gap:.75rem">
        <button class="btn btn--outline" id="confirm-cancel">取消</button>
        <button class="btn" style="background:var(--danger);color:#fff" id="confirm-ok">確認刪除</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('confirm-cancel').onclick = () => modal.remove();
  document.getElementById('confirm-ok').onclick = () => { modal.remove(); onConfirm(); };
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

/* ── Sidebar ── */
async function initSidebar() {
  const user = await Auth.get();
  if (!user) return;
  const avatar = document.querySelector('.sidebar-avatar');
  const name   = document.querySelector('.sidebar-user-name');
  if (avatar) avatar.textContent = (user.email || '?')[0].toUpperCase();
  if (name)   name.textContent   = user.email || '';
  const logoutBtn = document.querySelector('.btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());
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
    'nav.map': '地圖資料點',
    'nav.users': '管理員帳號',
    'nav.settings': '網站設定',
    'nav.preview': '前台預覽',
    'user.role.admin': '管理員',
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
    'users.empty.title': '尚無管理員',
    'users.empty.text': '點擊右上角「邀請管理員」新增第一位。',
    'users.remove.title': '移除管理員？',
    'users.remove.text': '此動作將刪除帳號，對方將無法再登入後台。',
    'users.msg.invited': '已寄出邀請信',
    'users.msg.invite_fail': '邀請失敗',
    'users.msg.removed': '已移除管理員',
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
    'nav.map': 'Map Locations',
    'nav.users': 'Admin Accounts',
    'nav.settings': 'Site Settings',
    'nav.preview': 'View Site',
    'user.role.admin': 'Administrator',
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
    'users.empty.title': 'No admins yet',
    'users.empty.text': 'Click "Invite admin" in the top-right to add the first one.',
    'users.remove.title': 'Remove this admin?',
    'users.remove.text': 'This deletes the account. The person will no longer be able to sign in.',
    'users.msg.invited': 'Invite email sent',
    'users.msg.invite_fail': 'Invite failed',
    'users.msg.removed': 'Admin removed',
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

    /* If already logged in, skip login */
    const existing = await Auth.get();
    if (existing) window.location.href = 'dashboard.html';
    return;
  }

  /* ── All other admin pages: require auth ── */
  if (!document.querySelector('.login-page')) {
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
