(() => {
  'use strict';

  let snapshot = null;
  let loading = false;
  let scheduled = false;
  let securityData = null;

  function esc(value = '') {
    return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  function badge(label, ok = true) {
    return `<span class="pill" style="margin:2px 4px 2px 0;${ok ? '' : 'opacity:.65'}">${esc(label)}</span>`;
  }

  function injectStyle() {
    if (document.getElementById('v06AdminStyle')) return;
    const style = document.createElement('style');
    style.id = 'v06AdminStyle';
    style.textContent = `
      .v06-admin-backdrop{position:fixed;inset:0;z-index:21000;background:rgba(8,18,31,.66);display:grid;place-items:center;padding:20px;backdrop-filter:blur(4px)}
      .v06-admin-modal{width:min(980px,97vw);max-height:92vh;overflow:auto;background:var(--surface,#fff);color:var(--text,#1d2939);border:1px solid var(--line,#dfe6ef);border-radius:16px;box-shadow:0 28px 80px rgba(0,0,0,.3)}
      .v06-admin-head{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--line,#dfe6ef);position:sticky;top:0;background:var(--surface,#fff);z-index:2}
      .v06-admin-body{padding:18px;display:grid;gap:18px}.v06-grow{flex:1}
      .v06-admin-section{border:1px solid var(--line,#dfe6ef);border-radius:12px;padding:14px;background:var(--surface-2,#f9fbfe)}
      .v06-admin-section h4{margin:0 0 10px}.v06-admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .v06-admin-row{display:flex;align-items:center;gap:8px;padding:9px 0;border-top:1px solid var(--line,#dfe6ef)}
      .v06-admin-row:first-of-type{border-top:0}.v06-admin-main{min-width:0;flex:1}.v06-admin-main strong,.v06-admin-main span{display:block;overflow-wrap:anywhere}.v06-admin-main span{font-size:11px;color:var(--muted,#667085);margin-top:2px}
      .v06-role-list{display:flex;flex-wrap:wrap;gap:4px}.v06-form-actions{display:flex;align-items:end;gap:8px;flex-wrap:wrap}.v06-form-actions .field{min-width:150px;flex:1;margin:0}
      @media(max-width:720px){.v06-admin-grid{grid-template-columns:1fr}.v06-admin-row{align-items:flex-start;flex-wrap:wrap}}
    `;
    document.head.appendChild(style);
  }

  function currentViewIsSettings() {
    const heading = document.querySelector('.topbar-title h1');
    return heading && heading.textContent.trim() === 'Settings';
  }

  function ensureCard() {
    if (!currentViewIsSettings()) return null;
    const grid = document.querySelector('.settings-grid');
    if (!grid) return null;
    let card = document.getElementById('v06PlatformStatus');
    if (!card) {
      card = document.createElement('div');
      card.id = 'v06PlatformStatus';
      card.className = 'card settings-card';
      grid.appendChild(card);
    }
    return card;
  }

  function cardMarker() {
    if (!snapshot) return 'loading';
    const storage = snapshot.storage || {};
    const db = snapshot.database || {};
    const sec = snapshot.security || {};
    const principal = sec.principal || {};
    const counts = sec.counts || {};
    return JSON.stringify([storage.mode, storage.connected, db.connected, db.database, sec.authMode, principal.username, principal.roles, principal.permissions?.length, counts.users, counts.groups, counts.roles]);
  }

  function render() {
    injectStyle();
    const card = ensureCard();
    if (!card) return;
    const marker = cardMarker();
    if (card.dataset.v06Marker === marker) return;
    card.dataset.v06Marker = marker;

    if (!snapshot) {
      card.innerHTML = '<h3>Shared platform</h3><p>Loading V0.6 runtime status…</p><button class="btn small" data-v06-refresh>Refresh</button>';
      return;
    }

    const storage = snapshot.storage || {};
    const database = snapshot.database || {};
    const security = snapshot.security || {};
    const principal = security.principal || {};
    const counts = security.counts || {};
    const capabilities = snapshot.capabilities || {};
    const roleText = Array.isArray(principal.roles) && principal.roles.length ? principal.roles.join(', ') : 'none';
    const permissionCount = Array.isArray(principal.permissions) ? principal.permissions.length : 0;

    card.innerHTML = `
      <h3>Shared platform</h3>
      <p>V0.6 runtime, persistence and authorization status.</p>
      <div style="display:flex;flex-wrap:wrap;margin:8px 0 12px">
        ${badge(storage.mode === 'postgres' ? 'PostgreSQL workspace' : 'File workspace', storage.connected !== false)}
        ${badge(database.connected ? 'Database connected' : 'Database unavailable', database.connected)}
        ${badge(capabilities.optimisticLocking ? 'Optimistic locking' : 'No locking', capabilities.optimisticLocking)}
        ${badge(capabilities.auditEvents ? 'Audit enabled' : 'Audit unavailable', capabilities.auditEvents)}
      </div>
      <div class="field"><label>Current identity</label><div class="input-like">${esc(principal.username || 'unknown')}</div></div>
      <div class="field"><label>Authentication</label><div class="input-like">${esc(security.authMode || 'unknown')}</div></div>
      <div class="field"><label>Roles</label><div class="input-like">${esc(roleText)}</div></div>
      <div class="field"><label>Effective permissions</label><div class="input-like">${permissionCount}</div></div>
      <div class="field"><label>Persistent security records</label><div class="input-like">${Number(counts.users || 0)} users · ${Number(counts.groups || 0)} groups · ${Number(counts.roles || 0)} roles</div></div>
      <div class="field"><label>Database</label><div class="input-like">${esc(database.database || (database.connected ? 'connected' : 'not configured'))}</div></div>
      <button class="btn" data-v06-refresh>Refresh platform status</button>
      ${database.connected ? '<button class="btn primary" data-v06-security style="margin-left:6px">Users & groups</button>' : ''}
    `;
  }

  async function api(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function load() {
    if (loading) return;
    loading = true;
    try {
      snapshot = await api(`/api/platform?_=${Date.now()}`);
      window.InvarturePlatformStatus = Object.freeze({ ...snapshot });
    } catch (error) {
      snapshot = { storage: { mode: 'unknown', connected: false }, database: { connected: false, error: error.message }, security: { authMode: 'unknown', principal: null, counts: {} }, capabilities: {} };
    } finally {
      loading = false;
      const card = document.getElementById('v06PlatformStatus');
      if (card) delete card.dataset.v06Marker;
      render();
    }
  }

  function roleButtons(roleKeys, targetType, targetId) {
    const roles = securityData?.roles || [];
    return `<div class="v06-role-list">${roles.map(role => {
      const active = roleKeys.includes(role.key);
      return `<button class="btn small ${active ? 'primary' : ''}" data-v06-role-target="${esc(targetType)}" data-v06-target-id="${esc(targetId)}" data-v06-role-key="${esc(role.key)}" data-v06-role-enabled="${active ? 'false' : 'true'}">${esc(role.name)}</button>`;
    }).join('')}</div>`;
  }

  function closeSecurity() {
    document.getElementById('v06SecurityModal')?.remove();
  }

  function renderSecurityModal() {
    closeSecurity();
    const users = securityData?.users || [];
    const groups = securityData?.groups || [];
    const roles = securityData?.roles || [];
    const modal = document.createElement('div');
    modal.id = 'v06SecurityModal';
    modal.className = 'v06-admin-backdrop';
    modal.innerHTML = `<div class="v06-admin-modal" role="dialog" aria-modal="true" aria-label="Users and groups">
      <div class="v06-admin-head"><strong>Users, groups & roles</strong><span class="pill">V0.6 identity mappings</span><div class="v06-grow"></div><button class="btn small" data-v06-security-close>Close</button></div>
      <div class="v06-admin-body">
        <div class="v06-admin-grid">
          <section class="v06-admin-section"><h4>Users (${users.length})</h4>
            <div class="v06-form-actions">
              <div class="field"><label>Username</label><input id="v06UserName" placeholder="jane.doe"></div>
              <div class="field"><label>Display name</label><input id="v06UserDisplay" placeholder="Jane Doe"></div>
              <div class="field"><label>Email</label><input id="v06UserEmail" placeholder="optional"></div>
              <div class="field"><label>Initial role</label><select id="v06UserRole">${roles.map(role => `<option value="${esc(role.key)}">${esc(role.name)}</option>`).join('')}</select></div>
              <button class="btn primary" data-v06-user-create>Create</button>
            </div>
            <div style="margin-top:10px">${users.map(user => `<div class="v06-admin-row"><div class="v06-admin-main"><strong>${esc(user.displayName || user.username)}</strong><span>${esc(user.username)}${user.email ? ` · ${esc(user.email)}` : ''}</span>${roleButtons(user.roles || [], 'user', user.id)}</div><button class="btn small danger" data-v06-user-delete="${esc(user.id)}">Delete</button></div>`).join('') || '<p>No persistent users yet.</p>'}</div>
          </section>
          <section class="v06-admin-section"><h4>Groups (${groups.length})</h4>
            <div class="v06-form-actions">
              <div class="field"><label>Group name</label><input id="v06GroupName" placeholder="Procurement Developers"></div>
              <div class="field"><label>Description</label><input id="v06GroupDescription" placeholder="Optional"></div>
              <div class="field"><label>Initial role</label><select id="v06GroupRole"><option value="">No role</option>${roles.map(role => `<option value="${esc(role.key)}">${esc(role.name)}</option>`).join('')}</select></div>
              <button class="btn primary" data-v06-group-create>Create</button>
            </div>
            <div style="margin-top:10px">${groups.map(group => `<div class="v06-admin-row"><div class="v06-admin-main"><strong>${esc(group.name)}</strong><span>${Number(group.memberCount || 0)} members${group.description ? ` · ${esc(group.description)}` : ''}</span>${roleButtons(group.roles || [], 'group', group.id)}</div><button class="btn small danger" data-v06-group-delete="${esc(group.id)}">Delete</button></div>`).join('') || '<p>No persistent groups yet.</p>'}</div>
          </section>
        </div>
        <section class="v06-admin-section"><h4>Built-in role catalog</h4><div class="v06-admin-grid">${roles.map(role => `<div><strong>${esc(role.name)}</strong><p style="margin:4px 0 6px;font-size:12px">${esc(role.description)}</p><span style="font-size:11px;color:var(--muted,#667085)">${(role.permissions || []).map(esc).join(' · ')}</span></div>`).join('')}</div></section>
        <p style="font-size:11px;color:var(--muted,#667085);margin:0">These records are identity and authorization mappings. Authentication is still Basic/local in V0.6; OIDC/Entra will map authenticated identities and groups onto these records later.</p>
      </div>
    </div>`;
    modal.addEventListener('click', event => { if (event.target === modal) closeSecurity(); });
    document.body.appendChild(modal);
  }

  async function loadSecurity() {
    try {
      securityData = await api('/api/security?action=summary');
      renderSecurityModal();
    } catch (error) {
      alert(`Could not load identity administration: ${error.message}`);
    }
  }

  async function createUser() {
    const username = document.getElementById('v06UserName')?.value.trim();
    if (!username) return;
    await api('/api/security?action=user', { method: 'POST', body: JSON.stringify({ username, displayName: document.getElementById('v06UserDisplay')?.value.trim(), email: document.getElementById('v06UserEmail')?.value.trim(), roles: [document.getElementById('v06UserRole')?.value || 'viewer'] }) });
    await Promise.all([load(), loadSecurity()]);
  }

  async function createGroup() {
    const name = document.getElementById('v06GroupName')?.value.trim();
    if (!name) return;
    const role = document.getElementById('v06GroupRole')?.value;
    await api('/api/security?action=group', { method: 'POST', body: JSON.stringify({ name, description: document.getElementById('v06GroupDescription')?.value.trim(), roles: role ? [role] : [] }) });
    await Promise.all([load(), loadSecurity()]);
  }

  async function toggleRole(button) {
    const targetType = button.dataset.v06RoleTarget;
    const targetId = button.dataset.v06TargetId;
    const roleKey = button.dataset.v06RoleKey;
    const enabled = button.dataset.v06RoleEnabled === 'true';
    const action = targetType === 'group' ? 'group-role' : 'user-role';
    const idKey = targetType === 'group' ? 'groupId' : 'userId';
    await api(`/api/security?action=${action}`, { method: 'POST', body: JSON.stringify({ [idKey]: targetId, roleKey, enabled }) });
    await loadSecurity();
  }

  function scheduleMount() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (!currentViewIsSettings()) return;
      render();
      if (!snapshot && !loading) load();
    });
  }

  document.addEventListener('click', async event => {
    try {
      if (event.target.closest('[data-v06-refresh]')) await load();
      if (event.target.closest('[data-v06-security]')) await loadSecurity();
      if (event.target.closest('[data-v06-security-close]')) closeSecurity();
      if (event.target.closest('[data-v06-user-create]')) await createUser();
      if (event.target.closest('[data-v06-group-create]')) await createGroup();
      const roleButton = event.target.closest('[data-v06-role-target]');
      if (roleButton) await toggleRole(roleButton);
      const deleteUserButton = event.target.closest('[data-v06-user-delete]');
      if (deleteUserButton && confirm('Delete this identity mapping?')) {
        await api(`/api/security?action=user&id=${encodeURIComponent(deleteUserButton.dataset.v06UserDelete)}`, { method: 'DELETE' });
        await Promise.all([load(), loadSecurity()]);
      }
      const deleteGroupButton = event.target.closest('[data-v06-group-delete]');
      if (deleteGroupButton && confirm('Delete this group?')) {
        await api(`/api/security?action=group&id=${encodeURIComponent(deleteGroupButton.dataset.v06GroupDelete)}`, { method: 'DELETE' });
        await Promise.all([load(), loadSecurity()]);
      }
      if (event.target.closest('[data-nav="settings"]')) setTimeout(scheduleMount, 0);
    } catch (error) {
      alert(error.message || 'Administration request failed');
    }
  });

  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSecurity(); });
  const observer = new MutationObserver(scheduleMount);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleMount();
})();
