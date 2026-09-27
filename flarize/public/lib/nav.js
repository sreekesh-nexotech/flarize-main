/**
 * FLARIZE NAV BAR — shared navigation across all workspace pages.
 *
 * Usage: Include <script src="/lib/nav.js"></script> in any workspace page.
 * Call flarizeNav.init({ current: 'sales' }) after DOM ready.
 *
 * The nav bar reads the session role from sessionStorage and shows
 * only the links appropriate for that role.
 */
(function () {
  'use strict';

  const SESSION_KEY = 'gr_session_token';
  const ROLE_KEY = 'gr_user_role';
  const USER_KEY = 'gr_user_name';
  const USERID_KEY = 'gr_user_id';

  // ---------------------------------------------------------------------------
  // P0.2 (2026-09-13) — one place handles "session died" for every page.
  // Tokens are signed and survive server restarts now, but they still expire
  // (8 h), are revoked on password reset / disable, or vanish when the user
  // clears storage. Every page used to render its own raw "Unauthorized" while
  // the nav still showed the cached name. Now: any /api/ call answering 401
  // clears the cached identity and returns to the login page (with ?next= so
  // the user lands back where they were). Headless automation (server PDF
  // render, e2e) is exempt so its own error reporting keeps working.
  // ---------------------------------------------------------------------------
  function clearSession() {
    try { [SESSION_KEY, ROLE_KEY, USER_KEY, USERID_KEY].forEach(k => sessionStorage.removeItem(k)); } catch (_) {}
  }
  function goLogin() {
    if (location.pathname === '/login.html') return;
    const next = location.pathname + location.search;
    location.replace('/login.html?next=' + encodeURIComponent(next));
  }
  const noRedirect = () => !!(window.__flarizeNoAuthRedirect || (navigator && navigator.webdriver));
  if (typeof window.fetch === 'function' && !window.__flarizeFetchWrapped) {
    window.__flarizeFetchWrapped = true;
    const origFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const res = await origFetch(input, init);
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const isApi = /^(?:https?:\/\/[^/]+)?\/api\//.test(url);
        const isAuthRoute = /\/api\/auth\/(?:login|logout)(?:[/?]|$)/.test(url);
        if (res.status === 401 && isApi && !isAuthRoute && !noRedirect()) { clearSession(); goLogin(); }
      } catch (_) { /* never break the caller */ }
      return res;
    };
  }

  // Role → pages. `primary` is what a normal user needs every day; `more` is the
  // advanced / engineering tooling, folded into a "More ▾" menu (2026-09-09
  // usability review: one Sales page, kW Packs + Items & Prices up front,
  // project workspace / packages / CMS / procurement batches behind More).
  // 2026-09-10 owner rule: each role sees ONLY its own pages. Sales → Sales +
  // History. Project Head → kW Packs (+ approve items) + History. Procurement →
  // Items & Prices. Admin sees everything; the engineering / developer consoles
  // (project workspace, purchase batches, registry, CMS designer, quotation
  // internals) are Admin-only and folded behind "Advanced ▾".
  const ROLE_PAGES = {
    // 2026-09-13 P2 (owner-approved cuts): the per-package registry pages
    // (Approvals / Packages / BOM Configuration) are written by the kW Packs
    // publish step and no longer a human workstation, and the CMS page designer
    // never feeds the printed quotation (offers = Quotation content → Offer page).
    // Routes and data stay; only the menu entries go. Direct URLs still work
    // for repair work.
    ADMIN: {
      primary: ['admin-dashboard', 'sales', 'quotation-history', 'pack-config', 'catalog', 'quotation-content', 'company', 'users'],
      more: ['quotation', 'workspace', 'procurement'],
    },
    // 2026-09-13 P1: Project Head edits quotation content (terms, timeline, appliances, testimonials).
    PROJECT_HEAD: { primary: ['pack-config', 'catalog', 'quotation-content', 'quotation-history'], more: [] },
    ENGINEERING: { primary: ['pack-config', 'catalog', 'quotation-history'], more: [] },
    PROCUREMENT: { primary: ['catalog'], more: [] },
    SALES: { primary: ['sales', 'quotation-history'], more: [] },
    SALES_HEAD: { primary: ['sales', 'quotation-history'], more: [] },
    SALES_CRS: { primary: ['sales', 'quotation-history'], more: [] },
    FIELD_SALES: { primary: ['sales', 'quotation-history'], more: [] },
  };

  // Page definitions
  const PAGES = {
    'admin-dashboard': { label: 'Dashboard', href: '/admin-dashboard.html' },
    'catalog': { label: 'Items & Prices', href: '/catalog.html' },
    'pack-config': { label: 'kW Packs', href: '/pack-config.html' },
    'sales': { label: 'Sales', href: '/sales.html' },
    'quotation-history': { label: 'History', href: '/quotation-history.html' },
    'quotation-content': { label: 'Quotation content', href: '/quotation-content.html' },
    'quotation': { label: 'Quotation internals (gate · versions)', href: '/quotation.html' },
    'company': { label: 'Company', href: '/company-profile.html' },
    'users': { label: 'Users', href: '/user-management.html' },
    'package-approval': { label: 'Approvals', href: '/package-approval.html' },
    'workspace': { label: 'Project workspace (single-project BOM)', href: '/workspace.html' },
    'procurement': { label: 'Purchase batches (landed cost)', href: '/procurement.html' },
    'ph-bom-config': { label: 'BOM Configuration (registry)', href: '/ph-bom-config.html' },
    'package-authoring': { label: 'Packages (registry list)', href: '/package-authoring.html' },
    'cms': { label: 'CMS (document content)', href: '/cms.html' },
    // retired 2026-09-09 — kept so old bookmarks still resolve
    'sales-wizard': { label: 'Sales', href: '/sales.html' },
  };

  function getRole() {
    try { return sessionStorage.getItem(ROLE_KEY) || ''; } catch { return ''; }
  }

  function getUserName() {
    try { return sessionStorage.getItem(USER_KEY) || ''; } catch { return ''; }
  }

  function doLogout() {
    let token = '';
    try { token = sessionStorage.getItem(SESSION_KEY) || ''; } catch (_) {}
    if (token) {
      fetch('/api/auth/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } }).catch(() => {});
    }
    clearSession();
    window.location.href = '/login.html';
  }

  function init(opts) {
    const current = opts?.current || '';
    const role = getRole();
    const userName = getUserName();

    // No token at all → nothing on this page can work; go straight to login.
    let token = '';
    try { token = sessionStorage.getItem(SESSION_KEY) || ''; } catch (_) {}
    if (!token && !noRedirect()) { goLogin(); return; }
    // Validate the cached identity once per page load (non-blocking). A dead
    // token answers 401 → the fetch wrapper above sends the user to login.
    if (token && !noRedirect()) {
      fetch('/api/auth/session', { headers: { 'Authorization': 'Bearer ' + token } }).then(async (r) => {
        if (!r.ok) return;
        const d = await r.json().catch(() => null);
        const u = d && d.user;
        if (!u) return;
        // Keep the cached name/role in step with the server (role changes apply on next load).
        try {
          if (u.role && u.role !== role) sessionStorage.setItem(ROLE_KEY, u.role);
          const nm = u.name || u.username;
          if (nm && nm !== userName) sessionStorage.setItem(USER_KEY, nm);
          if (u.userId) sessionStorage.setItem(USERID_KEY, u.userId);
        } catch (_) {}
      }).catch(() => {});
    }
    const cfg = ROLE_PAGES[role] || { primary: [], more: [] };
    const allowed = [...cfg.primary, ...cfg.more];
    const currentKey = current === 'sales-wizard' ? 'sales' : current;

    // Build nav links — primary inline, advanced behind "More ▾"
    const linkHtml = (p) => { const pg = PAGES[p]; const active = p === currentKey; return `<a href="${pg.href}" class="fnav-link${active ? ' fnav-active' : ''}">${pg.label}</a>`; };
    const links = cfg.primary.filter(p => PAGES[p]).map(linkHtml).join('');
    const moreItems = cfg.more.filter(p => PAGES[p]);
    const moreHtml = moreItems.length
      ? `<div class="fnav-more"><button type="button" class="fnav-link fnav-more-btn${moreItems.includes(currentKey) ? ' fnav-active' : ''}" onclick="this.parentNode.classList.toggle('open')">Advanced ▾</button><div class="fnav-menu">${moreItems.map(linkHtml).join('')}</div></div>`
      : '';

    const roleLabel = role || 'Unknown';
    const userLabel = userName || 'User';

    // Inject CSS if not already present
    if (!document.getElementById('fnav-styles')) {
      const style = document.createElement('style');
      style.id = 'fnav-styles';
      style.textContent = `
        .fnav-bar { display:flex; align-items:center; gap:6px; padding:6px 16px; background:#1e293b;
                    border-bottom:2px solid #334155; font:13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                    position:sticky; top:0; z-index:9999; flex-wrap:wrap; }
        .fnav-brand { font-weight:800; color:#60a5fa; font-size:14px; margin-right:8px; text-decoration:none; }
        .fnav-link { color:#94a3b8; text-decoration:none; padding:5px 10px; border-radius:4px; font-weight:500;
                     transition: all .15s; white-space:nowrap; }
        .fnav-link:hover { color:#e2e8f0; background:#334155; }
        .fnav-active { color:#ffffff; background:#2563eb; }
        .fnav-active:hover { background:#1d4ed8; }
        .fnav-spacer { flex:1; }
        .fnav-user { color:#94a3b8; font-size:12px; white-space:nowrap; }
        .fnav-role { display:inline-block; padding:2px 8px; border-radius:10px; font-size:10px;
                     font-weight:700; background:rgba(96,165,250,.15); color:#60a5fa;
                     text-transform:uppercase; letter-spacing:.04em; margin-left:6px; }
        .fnav-logout { color:#94a3b8; background:none; border:1px solid #475569; border-radius:4px;
                       padding:3px 10px; font:12px inherit; cursor:pointer; margin-left:8px; }
        .fnav-logout:hover { color:#f1f5f9; border-color:#64748b; }
        .fnav-more { position:relative; }
        .fnav-more-btn { background:none; border:0; cursor:pointer; font:inherit; }
        .fnav-menu { display:none; position:absolute; top:100%; left:0; background:#1e293b; border:1px solid #334155; border-radius:6px;
                     padding:6px; min-width:230px; z-index:10000; box-shadow:0 8px 24px rgba(0,0,0,.3); }
        .fnav-menu .fnav-link { display:block; padding:7px 10px; }
        .fnav-more.open .fnav-menu { display:block; }
      `;
      document.head.appendChild(style);
    }

    // Create nav bar element
    const nav = document.createElement('nav');
    nav.className = 'fnav-bar';
    nav.innerHTML = `
      <a class="fnav-brand" href="${allowed[0] ? PAGES[allowed[0]].href : '/login.html'}">Flarize</a>
      ${links}${moreHtml}
      <div class="fnav-spacer"></div>
      <span class="fnav-user">${esc(userLabel)}<span class="fnav-role">${esc(roleLabel)}</span></span>
      <button class="fnav-logout" onclick="flarizeNav.logout()">Logout</button>
    `;

    document.body.insertBefore(nav, document.body.firstChild);
    document.addEventListener('click', (e) => { if (!e.target.closest('.fnav-more')) nav.querySelectorAll('.fnav-more.open').forEach(m => m.classList.remove('open')); });
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  window.flarizeNav = { init, logout: doLogout };
})();
