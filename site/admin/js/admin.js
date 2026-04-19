/* ============================================================
   Taiwan Teen Trust — Admin JS
   Auth guard + LocalStorage data layer + UI utilities
   Supabase-ready: swap storageGet/storageSet/storageDelete
   for supabase.from(...) calls when backend is live.
   ============================================================ */

'use strict';

/* ════════════════════ AUTH ════════════════════ */
const AUTH_KEY = 'ttt-admin-auth';
const DEMO_EMAIL = 'admin@taiwanteentrust.org';
const DEMO_PASS  = 'ttt2025';

const Auth = {
  login(email, password) {
    if (email === DEMO_EMAIL && password === DEMO_PASS) {
      localStorage.setItem(AUTH_KEY, JSON.stringify({ email, role: 'admin', ts: Date.now() }));
      return true;
    }
    return false;
  },
  logout() {
    localStorage.removeItem(AUTH_KEY);
    window.location.href = 'index.html';
  },
  check() {
    const session = localStorage.getItem(AUTH_KEY);
    if (!session) { window.location.href = 'index.html'; return null; }
    return JSON.parse(session);
  },
  get() {
    const s = localStorage.getItem(AUTH_KEY);
    return s ? JSON.parse(s) : null;
  }
};

/* ════════════════════ DATA LAYER ════════════════════ */
/* Each collection stored as JSON array in localStorage.
   Key names match future Supabase table names. */

const DB = {
  _get(table)        { return JSON.parse(localStorage.getItem('ttt_' + table) || '[]'); },
  _set(table, data)  { localStorage.setItem('ttt_' + table, JSON.stringify(data)); },
  _nextId(table)     { const rows = this._get(table); return rows.length ? Math.max(...rows.map(r => r.id)) + 1 : 1; },

  getAll(table)      { return this._get(table); },
  getById(table, id) { return this._get(table).find(r => r.id === id) || null; },

  insert(table, row) {
    const rows = this._get(table);
    const newRow = { ...row, id: this._nextId(table), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    rows.unshift(newRow);
    this._set(table, rows);
    return newRow;
  },

  update(table, id, patch) {
    const rows = this._get(table);
    const idx = rows.findIndex(r => r.id === id);
    if (idx === -1) return null;
    rows[idx] = { ...rows[idx], ...patch, updated_at: new Date().toISOString() };
    this._set(table, rows);
    return rows[idx];
  },

  delete(table, id) {
    const rows = this._get(table).filter(r => r.id !== id);
    this._set(table, rows);
  }
};

/* ── Seed demo data if tables are empty ── */
function seedIfEmpty() {
  /* Members */
  if (DB.getAll('members').length === 0) {
    const members = [
      { name: '陳雅婷', name_en: 'Ya-Ting Chen', dept: '資訊科技', year: '2025', role: '部長', status: 'active', email: 'yaoting@example.com', bio: '負責網站開發與系統維護。', bio_en: 'Handles web development and system maintenance.' },
      { name: '林子祥', name_en: 'Zi-Xiang Lin', dept: '行銷', year: '2025', role: '副部長', status: 'active', email: 'zixiang@example.com', bio: '社群媒體策略與品牌推廣。', bio_en: 'Social media strategy and brand promotion.' },
      { name: '王思涵', name_en: 'Si-Han Wang', dept: '設計', year: '2025', role: '部長', status: 'active', email: 'sihan@example.com', bio: '視覺設計與品牌識別。', bio_en: 'Visual design and brand identity.' },
      { name: '張家豪', name_en: 'Jia-Hao Zhang', dept: '研究', year: '2024', role: '研究員', status: 'alumni', email: 'jiahao@example.com', bio: '專注動物保護政策研究。', bio_en: 'Animal protection policy research.' },
      { name: '許靜雯', name_en: 'Jing-Wen Xu', dept: '活動', year: '2025', role: '部長', status: 'active', email: 'jingwen@example.com', bio: '活動策劃與執行。', bio_en: 'Event planning and execution.' },
    ];
    members.forEach(m => DB.insert('members', m));
  }

  /* Projects */
  if (DB.getAll('projects').length === 0) {
    const projects = [
      { title: 'Stray Aid Map', title_en: 'Stray Aid Map', slug: 'stray-aid-map', category: 'animals', status: 'active', year: '2026', summary: '整合全台流浪動物救援資源的互動地圖。', summary_en: 'Interactive map aggregating stray animal rescue resources across Taiwan.' },
      { title: '流浪動物 TNR 倡議', title_en: 'Stray Animal TNR Advocacy', slug: 'tnr-advocacy', category: 'advocacy', status: 'active', year: '2026', summary: '推廣人道捕捉、絕育、回置政策。', summary_en: 'Promoting humane trap-neuter-return policy.' },
      { title: '校園流浪貓調查', title_en: 'Campus Stray Cat Survey', slug: 'campus-cat-survey', category: 'research', status: 'completed', year: '2025', summary: '北台灣15所高中校園流浪貓數量與現況調查。', summary_en: 'Survey of stray cat populations across 15 high school campuses in northern Taiwan.' },
    ];
    projects.forEach(p => DB.insert('projects', p));
  }

  /* Blog posts */
  if (DB.getAll('posts').length === 0) {
    const posts = [
      { title: '台灣流浪動物問題的根源', title_en: 'Root Causes of Taiwan\'s Stray Animal Problem', slug: 'stray-animals-taiwan', category: '報告', status: 'published', author: '研究小組', date: '2025-11-15', summary: '深入分析台灣流浪動物危機的成因與應對方式。', summary_en: 'Deep analysis of the causes of and responses to Taiwan\'s stray animal crisis.' },
      { title: '認識 TNR：人道捕捉絕育回置', title_en: 'Understanding TNR: Trap-Neuter-Return', slug: 'understanding-tnr', category: '觀點', status: 'published', author: '林子祥', date: '2025-10-01', summary: 'TNR 是什麼？為什麼它是目前控制流浪動物最人道的方式？', summary_en: 'What is TNR and why is it the most humane way to manage stray animal populations?' },
      { title: '我與一隻橘貓的故事', title_en: 'My Story with an Orange Cat', slug: 'orange-cat-story', category: '故事', status: 'published', author: '王思涵', date: '2025-09-10', summary: '一位義工與校園流浪貓建立情感的紀錄。', summary_en: 'A volunteer\'s account of bonding with a campus stray cat.' },
      { title: '2025 年度工作報告草稿', title_en: '2025 Annual Report Draft', slug: '2025-annual-report', category: '報告', status: 'draft', author: '陳雅婷', date: '2026-01-01', summary: '尚未發布的年度報告草稿。', summary_en: 'Unpublished draft of the annual report.' },
    ];
    posts.forEach(p => DB.insert('posts', p));
  }

  /* Map locations */
  if (DB.getAll('map_locations').length === 0) {
    const locs = [
      { name: '臺北市動物之家', name_en: 'Taipei Animal Shelter', type: 'shelter', address: '台北市北投區立農街二段350號', address_en: '350 Linong St. Sec.2, Beitou, Taipei', phone: '02-2858-3700', hours: '週二–週日 09:00–17:00', hours_en: 'Tue–Sun 09:00–17:00', lat: '25.1306', lng: '121.4984', status: 'active' },
      { name: '台大附設動物醫院', name_en: 'NTU Veterinary Hospital', type: 'vet', address: '台北市大安區基隆路三段153號', address_en: '153 Keelung Rd. Sec.3, Da\'an, Taipei', phone: '02-2739-6828', hours: '週一–週五 08:30–17:00', hours_en: 'Mon–Fri 08:30–17:00', lat: '25.0139', lng: '121.5454', status: 'active' },
      { name: '大安森林公園餵食點', name_en: 'Da\'an Forest Park Feeding Station', type: 'feed', address: '台北市大安區新生南路二段與和平東路口', address_en: 'Xinsheng S. Rd. Sec.2 & Heping E. Rd., Taipei', phone: '', hours: '每日 07:00、18:00', hours_en: 'Daily 07:00 & 18:00', lat: '25.0299', lng: '121.5342', status: 'active' },
      { name: '台灣動物緊急救援小組', name_en: 'Taiwan Emergency Animal Rescue', type: 'rescue', address: '台北市中山區民權東路三段106巷', address_en: 'Lane 106 Minquan E. Rd. Sec.3, Zhongshan, Taipei', phone: '02-2599-1083', hours: '週一–週五 09:00–18:00（緊急24小時）', hours_en: 'Mon–Fri 09:00–18:00 (Emergency 24hr)', lat: '25.0618', lng: '121.5378', status: 'active' },
    ];
    locs.forEach(l => DB.insert('map_locations', l));
  }
}

/* ════════════════════ UI UTILITIES ════════════════════ */

/* ── Toast notifications ── */
let toastContainer;
function initToasts() {
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  document.body.appendChild(toastContainer);
}

function showToast(message, type = 'info') {
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
function initSidebar() {
  const session = Auth.get();
  if (!session) return;
  const avatar = document.querySelector('.sidebar-avatar');
  const name   = document.querySelector('.sidebar-user-name');
  if (avatar) avatar.textContent = session.email[0].toUpperCase();
  if (name)   name.textContent   = session.email;
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

/* ════════════════════ PAGE INIT ════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  seedIfEmpty();
  initToasts();
  initModals();
  initSidebar();

  /* Login form */
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    const emailIn = document.getElementById('login-email');
    const passIn  = document.getElementById('login-pass');
    const errEl   = document.getElementById('login-error');
    loginForm.addEventListener('submit', e => {
      e.preventDefault();
      if (Auth.login(emailIn.value.trim(), passIn.value)) {
        window.location.href = 'dashboard.html';
      } else {
        errEl.textContent = '電子郵件或密碼不正確。';
        errEl.classList.add('show');
      }
    });
    /* If already logged in, skip login */
    if (Auth.get()) window.location.href = 'dashboard.html';
    return;
  }

  /* All other admin pages: check auth */
  if (!document.querySelector('.login-page')) Auth.check();
});
