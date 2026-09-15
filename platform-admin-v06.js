(() => {
  'use strict';

  let snapshot = null;
  let loading = false;
  let scheduled = false;

  function esc(value = '') {
    return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  function badge(label, ok = true) {
    return `<span class="pill" style="margin:2px 4px 2px 0;${ok ? '' : 'opacity:.65'}">${esc(label)}</span>`;
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

  function render() {
    const card = ensureCard();
    if (!card) return;
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
    `;
  }

  async function load() {
    if (loading) return;
    loading = true;
    try {
      const response = await fetch(`/api/platform?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      snapshot = await response.json();
      window.InvarturePlatformStatus = Object.freeze({ ...snapshot });
    } catch (error) {
      snapshot = {
        storage: { mode: 'unknown', connected: false },
        database: { connected: false, error: error.message },
        security: { authMode: 'unknown', principal: null, counts: {} },
        capabilities: {}
      };
    } finally {
      loading = false;
      render();
    }
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

  document.addEventListener('click', event => {
    if (event.target.closest('[data-v06-refresh]')) load();
    if (event.target.closest('[data-nav="settings"]')) setTimeout(scheduleMount, 0);
  });

  const observer = new MutationObserver(scheduleMount);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleMount();
})();
