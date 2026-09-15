(() => {
  'use strict';

  let scheduled = false;
  let auditState = { events: [], total: 0, offset: 0, limit: 50, search: '', loading: false, hasMore: false };

  function esc(value = '') {
    return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  function injectStyle() {
    if (document.getElementById('v06AuditStyle')) return;
    const style = document.createElement('style');
    style.id = 'v06AuditStyle';
    style.textContent = `
      .v06-audit-backdrop{position:fixed;inset:0;z-index:21500;background:rgba(8,18,31,.66);display:grid;place-items:center;padding:20px;backdrop-filter:blur(4px)}
      .v06-audit-modal{width:min(1050px,97vw);max-height:92vh;overflow:hidden;display:flex;flex-direction:column;background:var(--surface,#fff);color:var(--text,#1d2939);border:1px solid var(--line,#dfe6ef);border-radius:16px;box-shadow:0 28px 80px rgba(0,0,0,.3)}
      .v06-audit-head{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--line,#dfe6ef)}
      .v06-audit-controls{display:flex;gap:8px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid var(--line,#dfe6ef);background:var(--surface-2,#f9fbfe)}
      .v06-audit-controls input{flex:1;min-width:220px}.v06-audit-list{overflow:auto;padding:0 18px 18px}.v06-audit-row{display:grid;grid-template-columns:155px 190px minmax(130px,1fr) minmax(180px,1.2fr);gap:10px;padding:11px 0;border-bottom:1px solid var(--line,#dfe6ef);font-size:12px;align-items:start}
      .v06-audit-row strong{overflow-wrap:anywhere}.v06-audit-muted{color:var(--muted,#667085);font-size:11px;overflow-wrap:anywhere}.v06-audit-details{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--muted,#667085)}
      .v06-audit-footer{display:flex;align-items:center;gap:8px;padding:12px 18px;border-top:1px solid var(--line,#dfe6ef)}.v06-audit-grow{flex:1}
      @media(max-width:760px){.v06-audit-row{grid-template-columns:1fr}.v06-audit-head{flex-wrap:wrap}}
    `;
    document.head.appendChild(style);
  }

  function inSettings() {
    return document.querySelector('.topbar-title h1')?.textContent.trim() === 'Settings';
  }

  function ensureCard() {
    if (!inSettings()) return;
    const grid = document.querySelector('.settings-grid');
    if (!grid || document.getElementById('v06AuditCard')) return;
    const card = document.createElement('div');
    card.id = 'v06AuditCard';
    card.className = 'card settings-card';
    card.innerHTML = '<h3>Audit & activity</h3><p>Inspect server-side workspace and security changes recorded by the shared platform.</p><button class="btn" data-v06-audit-open>Open audit log</button>';
    grid.appendChild(card);
  }

  function close() {
    document.getElementById('v06AuditModal')?.remove();
  }

  function fmtDate(value) {
    if (!value) return '';
    try { return new Date(value).toLocaleString(); } catch { return String(value); }
  }

  function detailsText(details) {
    if (!details || typeof details !== 'object') return '';
    try { return JSON.stringify(details, null, 2); } catch { return String(details); }
  }

  function renderModal() {
    close();
    const modal = document.createElement('div');
    modal.id = 'v06AuditModal';
    modal.className = 'v06-audit-backdrop';
    modal.innerHTML = `<div class="v06-audit-modal" role="dialog" aria-modal="true" aria-label="Audit log">
      <div class="v06-audit-head"><strong>Audit log</strong><span class="pill">${auditState.total} events</span><div class="v06-audit-grow"></div><button class="btn small" data-v06-audit-close>Close</button></div>
      <div class="v06-audit-controls"><input id="v06AuditSearch" value="${esc(auditState.search)}" placeholder="Search event, actor, target or details"><button class="btn" data-v06-audit-search>Search</button><button class="btn" data-v06-audit-clear>Clear</button><button class="btn" data-v06-audit-refresh>Refresh</button></div>
      <div class="v06-audit-list">
        ${auditState.events.length ? auditState.events.map(event => `<div class="v06-audit-row">
          <div><strong>${esc(event.eventType || '')}</strong><div class="v06-audit-muted">#${esc(event.id || '')}</div></div>
          <div><strong>${esc(event.actor || 'system')}</strong><div class="v06-audit-muted">${esc(fmtDate(event.createdAt))}</div></div>
          <div><strong>${esc(event.targetType || 'platform')}</strong><div class="v06-audit-muted">${esc(event.targetId || '')}</div></div>
          <div class="v06-audit-details">${esc(detailsText(event.details))}</div>
        </div>`).join('') : '<p class="v06-audit-muted" style="padding:20px 0">No audit events match the current filter.</p>'}
      </div>
      <div class="v06-audit-footer"><span class="v06-audit-muted">Showing ${auditState.events.length} of ${auditState.total}</span><div class="v06-audit-grow"></div>${auditState.hasMore ? '<button class="btn" data-v06-audit-more>Load more</button>' : ''}</div>
    </div>`;
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    document.body.appendChild(modal);
  }

  async function load(reset = true) {
    if (auditState.loading) return;
    auditState.loading = true;
    try {
      const offset = reset ? 0 : auditState.events.length;
      const params = new URLSearchParams({ limit: String(auditState.limit), offset: String(offset) });
      if (auditState.search) params.set('search', auditState.search);
      const response = await fetch(`/api/audit?${params}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      auditState.events = reset ? (data.events || []) : auditState.events.concat(data.events || []);
      auditState.total = Number(data.total || 0);
      auditState.offset = offset;
      auditState.hasMore = Boolean(data.hasMore);
      renderModal();
    } catch (error) {
      alert(`Could not load audit log: ${error.message}`);
    } finally {
      auditState.loading = false;
    }
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

  document.addEventListener('click', async event => {
    if (event.target.closest('[data-v06-audit-open]')) await load(true);
    if (event.target.closest('[data-v06-audit-close]')) close();
    if (event.target.closest('[data-v06-audit-refresh]')) await load(true);
    if (event.target.closest('[data-v06-audit-more]')) await load(false);
    if (event.target.closest('[data-v06-audit-search]')) {
      auditState.search = document.getElementById('v06AuditSearch')?.value.trim() || '';
      await load(true);
    }
    if (event.target.closest('[data-v06-audit-clear]')) {
      auditState.search = '';
      await load(true);
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
    if (event.key === 'Enter' && document.activeElement?.id === 'v06AuditSearch') {
      auditState.search = document.activeElement.value.trim();
      load(true);
    }
  });

  const observer = new MutationObserver(scheduleMount);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleMount();
})();
