/**
 * Package Authoring UI — PROJECT_HEAD authoring flow for Phase 3 V4.
 *
 * Talks to /api/packages/* — the transport enforces RBAC and lifecycle
 * gates; this UI only stages actions and surfaces engine responses.
 */
(function () {
  'use strict';

  const state = { packages: [], selected: null };

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
      const tr = document.createElement('tr');
      const s = p.packageState || p.approvalStatus || '—';
      const val = p.lastValidationStatus || '—';
      tr.innerHTML = `
        <td><a href="#" onclick="pkgAuth.open('${p.packageId}');return false;">${p.packageId}</a></td>
        <td>${p.systemType || ''}</td>
        <td>${p.size || ''}</td>
        <td>${p.phase || ''}</td>
        <td>${p.tier || ''}</td>
        <td>${p.revisionNumber ?? 1}</td>
        <td><span class="badge badge-${s}">${s}</span></td>
        <td>${p.architecture || '—'}</td>
        <td>${val}</td>
        <td>
          <button onclick="pkgAuth.open('${p.packageId}')">Open</button>
        </td>`;
      tbody.appendChild(tr);
    }
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
    const isDraft = s === 'DRAFT';
    const isApproved = s === 'APPROVED' && !pkg.supersededBy;
    const val = pkg.lastValidation ? `${pkg.lastValidation.status} (rev ${pkg.lastValidation.revisionNumber})` : 'none';
    const body = document.getElementById('panelBody');
    body.innerHTML = `
      <div><span class="badge badge-${s}">${s}</span> · comboKey=<code>${pkg.comboKey || ''}</code> · architecture=<b>${pkg.architecture || '—'}</b></div>
      <div>Validation: <b>${val}</b></div>
      <div style="margin-top:12px">
        ${isDraft ? '<button onclick="pkgAuth.runChecker()">Run Checker</button>' : ''}
        ${isDraft ? '<button class="primary" onclick="pkgAuth.submit()">Submit for Approval</button>' : ''}
        <button onclick="pkgAuth.duplicate()">Duplicate</button>
        ${isApproved ? '<button onclick="pkgAuth.revise()">Create Revision</button>' : ''}
        ${(!isApproved && s !== 'ARCHIVED') ? '<button class="danger" onclick="pkgAuth.archive()">Archive</button>' : ''}
      </div>
      <h2>Components</h2>
      <pre>${JSON.stringify(pkg.components || [], null, 2)}</pre>`;
  }

  async function runChecker() {
    if (!state.selected) return;
    try {
      const r = await fetchJson(`/api/packages/${encodeURIComponent(state.selected.packageId)}/run-checker`, { method: 'POST', body: '{}' });
      msg('info', `Checker ran — status=${r.status}, findings=${(r.findings || []).length}`);
      await open(state.selected.packageId);
    } catch (e) { msg('error', 'Checker failed: ' + e.message); }
  }

  async function submit() {
    if (!state.selected) return;
    try {
      await fetchJson(`/api/packages/${encodeURIComponent(state.selected.packageId)}/submit`, { method: 'POST', body: '{}' });
      msg('info', 'Submitted for approval');
      await refresh();
      await open(state.selected.packageId);
    } catch (e) { msg('error', 'Submit failed: ' + e.message); }
  }

  async function duplicate() {
    if (!state.selected) return;
    try {
      const r = await fetchJson(`/api/packages/${encodeURIComponent(state.selected.packageId)}/duplicate`, { method: 'POST', body: '{}' });
      msg('info', `Duplicated as ${r.packageId}`);
      await refresh();
    } catch (e) { msg('error', 'Duplicate failed: ' + e.message); }
  }

  async function revise() {
    if (!state.selected) return;
    try {
      const r = await fetchJson(`/api/packages/${encodeURIComponent(state.selected.packageId)}/revision`, { method: 'POST', body: '{}' });
      msg('info', `Revision created as ${r.packageId}`);
      await refresh();
    } catch (e) { msg('error', 'Revise failed: ' + e.message); }
  }

  async function archive() {
    if (!state.selected) return;
    const reason = prompt('Archive reason?');
    if (!reason) return;
    try {
      await fetchJson(`/api/packages/${encodeURIComponent(state.selected.packageId)}/archive`, { method: 'POST', body: JSON.stringify({ reason }) });
      msg('info', 'Archived');
      await refresh();
      await open(state.selected.packageId);
    } catch (e) { msg('error', 'Archive failed: ' + e.message); }
  }

  function startCreate() {
    const template = {
      systemType: prompt('System type (ongrid|hybrid|upgrade)?'),
      size: prompt('Size (e.g. 5)?'),
      phase: prompt('Phase (1P|3P)?'),
      tier: prompt('Tier (base|value|premium)?'),
      architecture: prompt('Architecture (DEYE|ENPHASE)?'),
      profileKey: prompt('Profile key?'),
      components: [],
    };
    if (!template.systemType) return;
    fetchJson('/api/packages', { method: 'POST', body: JSON.stringify({ template }) })
      .then(r => { msg('info', `Created ${r.packageId}`); refresh(); })
      .catch(e => msg('error', 'Create failed: ' + e.message));
  }

  window.pkgAuth = { init: refresh, refresh, open, runChecker, submit, duplicate, revise, archive, startCreate };
})();
