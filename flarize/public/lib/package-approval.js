/**
 * Package Approval UI — ADMIN queue for Phase 3 V4.
 * Talks to /api/packages/*. RBAC + lifecycle enforcement is at the server.
 */
(function () {
  'use strict';

  const state = { packages: [], selected: null };

  // Session token (set at login by sales.html / BOM login) — the API is
  // Bearer-authenticated; without it every call is a 401 (fixed 2026-09-09).
  function token() { try { return sessionStorage.getItem('gr_session_token') || ''; } catch { return ''; } }

  async function fetchJson(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}), ...(opts.headers || {}) },
    });
    let body;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok) throw Object.assign(new Error((body && body.error) || res.statusText), { status: res.status, body });
    return body;
  }

  function msg(kind, text) {
    const el = document.getElementById('msg');
    el.className = kind === 'error' ? 'error' : 'success';
    el.textContent = text;
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 6000);
  }

  async function refresh() {
    const stateFilter = document.getElementById('stateFilter').value;
    try {
      const q = stateFilter ? `?packageState=${encodeURIComponent(stateFilter)}` : '';
      const { packages } = await fetchJson(`/api/packages${q}`);
      state.packages = packages || [];
      renderList();
    } catch (e) { msg('error', 'Failed to load packages: ' + e.message); }
  }

  function renderList() {
    const tbody = document.querySelector('#list tbody');
    tbody.innerHTML = '';
    for (const p of state.packages) {
      const s = p.packageState || p.approvalStatus || '—';
      const val = p.lastValidationStatus || '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" data-id="${p.packageId}"></td>
        <td><a href="#" onclick="pkgApp.open('${p.packageId}');return false;">${p.packageId}</a></td>
        <td>${p.systemType || ''}</td>
        <td>${p.size || ''}</td>
        <td>${p.phase || ''}</td>
        <td>${p.tier || ''}</td>
        <td>${p.revisionNumber ?? 1}</td>
        <td><span class="badge badge-${s}">${s}</span></td>
        <td>${val}</td>
        <td>${p.submittedBy || '—'}</td>
        <td>
          <button onclick="pkgApp.open('${p.packageId}')">Open</button>
        </td>`;
      tbody.appendChild(tr);
    }
  }

  function toggleAll(on) {
    document.querySelectorAll('#list tbody input[type=checkbox]').forEach(el => { el.checked = on; });
  }

  function selectedIds() {
    return Array.from(document.querySelectorAll('#list tbody input[type=checkbox]:checked'))
      .map(el => el.getAttribute('data-id'));
  }

  async function open(packageId) {
    try {
      const pkg = await fetchJson(`/api/packages/${encodeURIComponent(packageId)}`);
      state.selected = pkg;
      renderDetail(pkg);
    } catch (e) { msg('error', 'Failed to open: ' + e.message); }
  }

  function renderDetail(pkg) {
    document.getElementById('panel').style.display = '';
    document.getElementById('panelTitle').textContent = `${pkg.packageId} — rev ${pkg.revisionNumber ?? 1}`;
    const s = pkg.packageState || pkg.approvalStatus || '—';
    const val = pkg.lastValidation ? `${pkg.lastValidation.status} (rev ${pkg.lastValidation.revisionNumber})` : 'none';
    const body = document.getElementById('panelBody');
    body.innerHTML = `
      <div><span class="badge badge-${s}">${s}</span> · comboKey=<code>${pkg.comboKey || ''}</code> · architecture=<b>${pkg.architecture || '—'}</b></div>
      <div>Validation: <b>${val}</b></div>
      <div>Submitted by: <b>${pkg.submittedBy || '—'}</b> at <b>${pkg.submittedAt || '—'}</b></div>
      <div style="margin-top:12px">
        <button class="primary" onclick="pkgApp.approve()">Approve</button>
        <button class="danger" onclick="pkgApp.reject()">Reject</button>
        <button class="warn" onclick="pkgApp.reset()">Reset</button>
      </div>
      <h2>Components</h2>
      <pre>${JSON.stringify(pkg.components || [], null, 2)}</pre>
      ${pkg.lastValidation ? `<h2>Validation findings</h2><pre>${JSON.stringify(pkg.lastValidation.findings || [], null, 2)}</pre>` : ''}`;
  }

  async function approve() {
    if (!state.selected) return;
    const notes = prompt('Approval notes (optional):');
    try {
      await fetchJson(`/api/packages/${encodeURIComponent(state.selected.packageId)}/approve`, {
        method: 'POST', body: JSON.stringify({ notes: notes || null }),
      });
      msg('info', 'Approved');
      await refresh();
      await open(state.selected.packageId);
    } catch (e) { msg('error', 'Approve failed: ' + e.message); }
  }

  async function reject() {
    if (!state.selected) return;
    const reason = prompt('Rejection reason?');
    if (!reason) return;
    try {
      await fetchJson(`/api/packages/${encodeURIComponent(state.selected.packageId)}/reject`, {
        method: 'POST', body: JSON.stringify({ reason }),
      });
      msg('info', 'Rejected');
      await refresh();
      await open(state.selected.packageId);
    } catch (e) { msg('error', 'Reject failed: ' + e.message); }
  }

  async function reset() {
    if (!state.selected) return;
    try {
      await fetchJson(`/api/packages/${encodeURIComponent(state.selected.packageId)}/reset`, {
        method: 'POST', body: '{}',
      });
      msg('info', 'Reset to DRAFT');
      await refresh();
      await open(state.selected.packageId);
    } catch (e) { msg('error', 'Reset failed: ' + e.message); }
  }

  async function compareSelected() {
    const ids = selectedIds();
    if (ids.length < 2 || ids.length > 5) {
      msg('error', 'Select between 2 and 5 packages to compare.');
      return;
    }
    try {
      const result = await fetchJson(`/api/packages/compare?ids=${encodeURIComponent(ids.join(','))}`);
      document.getElementById('panel').style.display = '';
      document.getElementById('panelTitle').textContent = 'Compare (' + ids.length + ')';
      document.getElementById('panelBody').innerHTML = `<pre>${JSON.stringify(result, null, 2)}</pre>`;
    } catch (e) { msg('error', 'Compare failed: ' + e.message); }
  }

  window.pkgApp = { init: refresh, refresh, open, approve, reject, reset, compareSelected, toggleAll };
})();
