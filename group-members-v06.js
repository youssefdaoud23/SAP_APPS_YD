(() => {
  'use strict';

  let scheduled = false;
  let data = null;
  let selectedGroupId = '';

  function esc(value = '') {
    return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  function injectStyle() {
    if (document.getElementById('v06GroupMemberStyle')) return;
    const style = document.createElement('style');
    style.id = 'v06GroupMemberStyle';
    style.textContent = `
      .v06-members-backdrop{position:fixed;inset:0;z-index:21600;background:rgba(8,18,31,.66);display:grid;place-items:center;padding:20px;backdrop-filter:blur(4px)}
      .v06-members-modal{width:min(850px,97vw);max-height:92vh;overflow:auto;background:var(--surface,#fff);color:var(--text,#1d2939);border:1px solid var(--line,#dfe6ef);border-radius:16px;box-shadow:0 28px 80px rgba(0,0,0,.3)}
      .v06-members-head{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--line,#dfe6ef);position:sticky;top:0;background:var(--surface,#fff);z-index:2}.v06-members-grow{flex:1}
      .v06-members-body{padding:18px;display:grid;gap:14px}.v06-members-controls{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}
      .v06-members-row{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--line,#dfe6ef)}.v06-members-row:last-child{border-bottom:0}.v06-members-main{flex:1;min-width:0}.v06-members-main strong,.v06-members-main span{display:block;overflow-wrap:anywhere}.v06-members-main span{font-size:11px;color:var(--muted,#667085);margin-top:2px}
      .v06-members-section{border:1px solid var(--line,#dfe6ef);border-radius:12px;padding:14px;background:var(--surface-2,#f9fbfe)}
      @media(max-width:650px){.v06-members-controls{grid-template-columns:1fr}.v06-members-row{align-items:flex-start;flex-wrap:wrap}}
    `;
    document.head.appendChild(style);
  }

  function inSettings() {
    return document.querySelector('.topbar-title h1')?.textContent.trim() === 'Settings';
  }

  function ensureCard() {
    if (!inSettings()) return;
    const grid = document.querySelector('.settings-grid');
    if (!grid || document.getElementById('v06GroupMembersCard')) return;
    const card = document.createElement('div');
    card.id = 'v06GroupMembersCard';
    card.className = 'card settings-card';
    card.innerHTML = '<h3>Group membership</h3><p>Assign persistent platform users to authorization groups.</p><button class="btn" data-v06-members-open>Manage memberships</button>';
    grid.appendChild(card);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  async function load() {
    data = await api('/api/security?action=summary');
    if (!selectedGroupId || !(data.groups || []).some(group => group.id === selectedGroupId)) selectedGroupId = data.groups?.[0]?.id || '';
    if (selectedGroupId) {
      const members = await api(`/api/security?action=group-members&groupId=${encodeURIComponent(selectedGroupId)}`);
      data.members = members.members || [];
    } else {
      data.members = [];
    }
  }

  function close() {
    document.getElementById('v06MembersModal')?.remove();
  }

  function memberIds() {
    return new Set((data?.members || []).map(member => member.id));
  }

  function render() {
    close();
    const groups = data?.groups || [];
    const users = data?.users || [];
    const selected = groups.find(group => group.id === selectedGroupId) || null;
    const assigned = memberIds();
    const modal = document.createElement('div');
    modal.id = 'v06MembersModal';
    modal.className = 'v06-members-backdrop';
    modal.innerHTML = `<div class="v06-members-modal" role="dialog" aria-modal="true" aria-label="Group membership manager">
      <div class="v06-members-head"><strong>Group membership</strong><span class="pill">${groups.length} groups · ${users.length} users</span><div class="v06-members-grow"></div><button class="btn small" data-v06-members-close>Close</button></div>
      <div class="v06-members-body">
        <div class="v06-members-controls"><div class="field" style="margin:0"><label>Group</label><select id="v06MembersGroup">${groups.map(group => `<option value="${esc(group.id)}" ${group.id === selectedGroupId ? 'selected' : ''}>${esc(group.name)}</option>`).join('')}</select></div><button class="btn" data-v06-members-refresh>Refresh</button></div>
        ${!groups.length ? '<div class="v06-members-section"><p>Create a group in Users & groups first.</p></div>' : !users.length ? '<div class="v06-members-section"><p>Create a persistent user in Users & groups first.</p></div>' : `<div class="v06-members-section"><h4 style="margin:0 0 8px">${esc(selected?.name || 'Group')} members</h4><p style="margin:0 0 8px;font-size:12px;color:var(--muted,#667085)">Toggle membership. Group roles are combined with direct user roles when effective permissions are resolved.</p>${users.map(user => {
          const active = assigned.has(user.id);
          return `<div class="v06-members-row"><div class="v06-members-main"><strong>${esc(user.displayName || user.username)}</strong><span>${esc(user.username)} · Direct roles: ${(user.roles || []).map(esc).join(', ') || 'none'}</span></div><button class="btn small ${active ? 'danger' : 'primary'}" data-v06-member-user="${esc(user.id)}" data-v06-member-enabled="${active ? 'false' : 'true'}">${active ? 'Remove' : 'Add'}</button></div>`;
        }).join('')}</div>`}
      </div>
    </div>`;
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    document.body.appendChild(modal);
  }

  async function open() {
    try {
      await load();
      render();
    } catch (error) {
      alert(`Could not load group memberships: ${error.message}`);
    }
  }

  async function setMembership(button) {
    if (!selectedGroupId) return;
    const userId = button.dataset.v06MemberUser;
    const enabled = button.dataset.v06MemberEnabled === 'true';
    await api('/api/security?action=group-member', { method: 'POST', body: JSON.stringify({ groupId: selectedGroupId, userId, enabled }) });
    await load();
    render();
  }

  function scheduleMount() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      injectStyle();
      ensureCard();
    });
  }

  document.addEventListener('change', async event => {
    if (event.target.id !== 'v06MembersGroup') return;
    selectedGroupId = event.target.value;
    try { await load(); render(); } catch (error) { alert(error.message); }
  });

  document.addEventListener('click', async event => {
    try {
      if (event.target.closest('[data-v06-members-open]')) await open();
      if (event.target.closest('[data-v06-members-close]')) close();
      if (event.target.closest('[data-v06-members-refresh]')) await open();
      const button = event.target.closest('[data-v06-member-user]');
      if (button) await setMembership(button);
    } catch (error) {
      alert(error.message || 'Membership update failed');
    }
  });

  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  const observer = new MutationObserver(scheduleMount);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleMount();
})();
