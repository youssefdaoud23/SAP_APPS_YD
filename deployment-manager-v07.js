(() => {
  'use strict';

  const STORAGE_KEY = 'invarture-app-studio-v2';
  let scheduled = false;
  let state = { environments: [], history: [], selectedAppId: '', loading: false, details: null };

  function esc(value = '') {
    return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  function injectStyle() {
    if (document.getElementById('v07DeployStyle')) return;
    const style = document.createElement('style');
    style.id = 'v07DeployStyle';
    style.textContent = `
      .v07-deploy-entry{margin-top:14px;padding:16px;border:1px solid var(--line,#dfe6ef);border-radius:14px;background:var(--surface,#fff);display:flex;align-items:center;gap:12px;flex-wrap:wrap}.v07-deploy-entry p{margin:3px 0 0;color:var(--muted,#667085);font-size:12px}.v07-grow{flex:1}
      .v07-deploy-backdrop{position:fixed;inset:0;z-index:22000;background:rgba(8,18,31,.68);display:grid;place-items:center;padding:18px;backdrop-filter:blur(4px)}
      .v07-deploy-modal{width:min(1180px,98vw);max-height:94vh;overflow:hidden;display:flex;flex-direction:column;background:var(--surface,#fff);color:var(--text,#1d2939);border:1px solid var(--line,#dfe6ef);border-radius:16px;box-shadow:0 30px 90px rgba(0,0,0,.34)}
      .v07-deploy-head{display:flex;align-items:center;gap:9px;padding:15px 18px;border-bottom:1px solid var(--line,#dfe6ef);flex-wrap:wrap}.v07-deploy-body{overflow:auto;padding:18px;display:grid;gap:16px}
      .v07-env-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:9px}.v07-env-card{border:1px solid var(--line,#dfe6ef);border-radius:11px;padding:11px;background:var(--surface-2,#f9fbfe)}.v07-env-card strong,.v07-env-card span{display:block}.v07-env-card span{font-size:11px;color:var(--muted,#667085);margin-top:3px}
      .v07-section{border:1px solid var(--line,#dfe6ef);border-radius:12px;padding:14px;background:var(--surface,#fff)}.v07-section h4{margin:0 0 10px}.v07-form{display:grid;grid-template-columns:1.2fr .7fr .8fr 1.5fr auto;gap:8px;align-items:end}.v07-form .field{margin:0;min-width:0}
      .v07-history{overflow:auto}.v07-row{display:grid;grid-template-columns:115px minmax(140px,1.1fr) 85px 110px minmax(130px,.9fr) 210px;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line,#dfe6ef);font-size:11px;min-width:830px}.v07-row:last-child{border-bottom:0}.v07-row strong{font-size:12px;overflow-wrap:anywhere}.v07-muted{color:var(--muted,#667085);font-size:10px}.v07-actions{display:flex;gap:5px;justify-content:flex-end}.v07-checksum{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px}
      .v07-env-admin-row{display:grid;grid-template-columns:80px minmax(130px,1fr) 110px 80px 100px 210px;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line,#dfe6ef);font-size:11px;min-width:740px}.v07-env-admin-row:last-child{border-bottom:0}.v07-details{background:var(--surface-2,#f9fbfe);border-radius:10px;padding:11px;font-size:11px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.v07-details div{min-width:0}.v07-details strong,.v07-details span{display:block;overflow-wrap:anywhere}.v07-details span{color:var(--muted,#667085);margin-top:2px}
      @media(max-width:900px){.v07-form{grid-template-columns:1fr 1fr}.v07-form button{grid-column:1/-1}.v07-details{grid-template-columns:1fr}}
      @media(max-width:560px){.v07-form{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function workspace() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {}; }
    catch { return {}; }
  }

  function apps() {
    return Array.isArray(workspace().apps) ? workspace().apps : [];
  }

  function currentApp() {
    const ws = workspace();
    const list = Array.isArray(ws.apps) ? ws.apps : [];
    return list.find(app => app.id === (state.selectedAppId || ws.currentAppId)) || list[0] || null;
  }

  async function api(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  function inVersions() {
    return document.querySelector('.topbar-title h1')?.textContent.trim() === 'Versions';
  }

  function ensureEntry() {
    if (!inVersions()) return;
    const content = document.querySelector('.content');
    if (!content || document.getElementById('v07DeploymentEntry')) return;
    const entry = document.createElement('div');
    entry.id = 'v07DeploymentEntry';
    entry.className = 'v07-deploy-entry';
    entry.innerHTML = '<div><strong>Environment deployments</strong><p>Promote immutable application snapshots through DEV, QAS and PRD with server-side history and rollback.</p></div><div class="v07-grow"></div><button class="btn primary" data-v07-deploy-open>Open Deployment Manager</button>';
    content.appendChild(entry);
  }

  function environmentByKey(key) {
    return state.environments.find(environment => environment.key === key) || null;
  }

  function nextEnvironment(key) {
    const current = environmentByKey(key);
    if (!current) return null;
    return state.environments.filter(environment => Number(environment.sortOrder) > Number(current.sortOrder)).sort((a,b) => Number(a.sortOrder) - Number(b.sortOrder))[0] || null;
  }

  async function refreshData() {
    const app = currentApp();
    const [envData, historyData] = await Promise.all([
      api('/api/deployments?action=environments'),
      api(`/api/deployments?action=history&limit=100${app?.id ? `&appId=${encodeURIComponent(app.id)}` : ''}`)
    ]);
    state.environments = envData.environments || [];
    state.history = historyData.deployments || [];
  }

  function close() {
    document.getElementById('v07DeployModal')?.remove();
  }

  function envStrip() {
    const app = currentApp();
    const latest = new Map();
    for (const item of state.history) if (!latest.has(item.environmentKey)) latest.set(item.environmentKey, item);
    return state.environments.map(environment => {
      const deployment = latest.get(environment.key);
      return `<div class="v07-env-card"><strong>${esc(environment.key)} · ${esc(environment.name)}</strong><span>${esc(environment.stage)}${environment.protected ? ' · protected' : ''}</span><span>${deployment ? `Latest: ${esc(deployment.versionLabel || deployment.action)} · ${esc(new Date(deployment.deployedAt).toLocaleString())}` : `No ${esc(app?.name || 'app')} deployment yet`}</span><span>${Object.keys(environment.connectionAliases || {}).length} connection aliases</span></div>`;
    }).join('');
  }

  function appOptions() {
    const selected = currentApp()?.id;
    return apps().map(app => `<option value="${esc(app.id)}" ${app.id === selected ? 'selected' : ''}>${esc(app.name)} · ${esc(app.status || 'draft')}</option>`).join('');
  }

  function envOptions() {
    return state.environments.map(environment => `<option value="${esc(environment.key)}">${esc(environment.key)} · ${esc(environment.name)}</option>`).join('');
  }

  function historyRows() {
    if (!state.history.length) return '<p class="v07-muted">No deployments exist for this application yet.</p>';
    return `<div class="v07-history">${state.history.map(item => {
      const next = nextEnvironment(item.environmentKey);
      return `<div class="v07-row">
        <div><strong>${esc(item.action)}</strong><div class="v07-muted">${esc(item.environmentKey)}</div></div>
        <div><strong>${esc(item.appName)}</strong><div class="v07-muted">${esc(item.versionLabel || 'unlabeled')}</div></div>
        <div><strong>${esc(item.environmentKey)}</strong><div class="v07-muted">${esc(item.environmentStage)}</div></div>
        <div class="v07-checksum">${esc(String(item.checksum || '').slice(0, 12))}</div>
        <div><strong>${esc(item.deployedBy || 'system')}</strong><div class="v07-muted">${esc(new Date(item.deployedAt).toLocaleString())}</div></div>
        <div class="v07-actions"><button class="btn small" data-v07-details="${esc(item.id)}">Details</button>${next ? `<button class="btn small primary" data-v07-promote="${esc(item.id)}" data-v07-target="${esc(next.key)}">Promote → ${esc(next.key)}</button>` : ''}<button class="btn small" data-v07-rollback="${esc(item.id)}">Rollback</button></div>
      </div>`;
    }).join('')}</div>`;
  }

  function envAdminRows() {
    return `<div style="overflow:auto">${state.environments.map(environment => `<div class="v07-env-admin-row"><strong>${esc(environment.key)}</strong><span>${esc(environment.name)}</span><span>${esc(environment.stage)}</span><span>${environment.protected ? 'Protected' : 'Open'}</span><span>${Object.keys(environment.connectionAliases || {}).length} aliases</span><div class="v07-actions"><button class="btn small" data-v07-env-aliases="${esc(environment.key)}">Aliases</button>${environment.builtin ? '' : `<button class="btn small danger" data-v07-env-delete="${esc(environment.key)}">Delete</button>`}</div></div>`).join('')}</div>`;
  }

  function detailsHtml() {
    const item = state.details;
    if (!item) return '';
    return `<div class="v07-section"><h4>Deployment details</h4><div class="v07-details"><div><strong>Deployment</strong><span>${esc(item.id)}</span></div><div><strong>Application</strong><span>${esc(item.appName)} (${esc(item.appId)})</span></div><div><strong>Environment</strong><span>${esc(item.environmentKey)} · ${esc(item.environmentStage)}</span></div><div><strong>Version</strong><span>${esc(item.versionLabel || item.versionId || 'unlabeled')}</span></div><div><strong>Checksum</strong><span class="v07-checksum">${esc(item.checksum)}</span></div><div><strong>Pages</strong><span>${Array.isArray(item.application?.pages) ? item.application.pages.length : 0}</span></div><div><strong>Action</strong><span>${esc(item.action)}</span></div><div><strong>Actor</strong><span>${esc(item.deployedBy || 'system')}</span></div><div><strong>Release notes</strong><span>${esc(item.releaseNotes || 'none')}</span></div></div></div>`;
  }

  function render() {
    close();
    injectStyle();
    const app = currentApp();
    const modal = document.createElement('div');
    modal.id = 'v07DeployModal';
    modal.className = 'v07-deploy-backdrop';
    modal.innerHTML = `<div class="v07-deploy-modal" role="dialog" aria-modal="true" aria-label="Deployment Manager">
      <div class="v07-deploy-head"><strong>Deployment Manager</strong><span class="pill">V0.7</span><span class="pill">Immutable snapshots</span><div class="v07-grow"></div><button class="btn small" data-v07-refresh>Refresh</button><button class="btn small" data-v07-close>Close</button></div>
      <div class="v07-deploy-body">
        <div class="v07-env-strip">${envStrip()}</div>
        <div class="v07-section"><h4>Deploy application</h4><div class="v07-form">
          <div class="field"><label>Application</label><select id="v07DeployApp">${appOptions()}</select></div>
          <div class="field"><label>Environment</label><select id="v07DeployEnvironment">${envOptions()}</select></div>
          <div class="field"><label>Version label</label><input id="v07DeployVersion" value="${esc(app?.versions?.length ? `snapshot-${app.versions.length}` : 'current')}" placeholder="2026.09.15"></div>
          <div class="field"><label>Release notes</label><input id="v07DeployNotes" placeholder="What changed in this deployment?"></div>
          <button class="btn primary" data-v07-deploy>Create deployment</button>
        </div><p class="v07-muted" style="margin:8px 0 0">Production accepts published application snapshots only. Each deployment stores its own immutable server-side copy and checksum.</p></div>
        ${detailsHtml()}
        <div class="v07-section"><h4>Deployment history · ${esc(app?.name || 'No app selected')}</h4>${historyRows()}</div>
        <div class="v07-section"><h4>Environment configuration</h4>${envAdminRows()}<div class="v07-form" style="margin-top:12px;grid-template-columns:.6fr 1.2fr .8fr .6fr auto"><div class="field"><label>Key</label><input id="v07EnvKey" placeholder="UAT"></div><div class="field"><label>Name</label><input id="v07EnvName" placeholder="User Acceptance"></div><div class="field"><label>Stage</label><select id="v07EnvStage"><option value="test">Test</option><option value="development">Development</option><option value="production">Production</option><option value="custom">Custom</option></select></div><div class="field"><label>Order</label><input id="v07EnvOrder" type="number" value="25"></div><button class="btn" data-v07-env-create>Add environment</button></div></div>
      </div>
    </div>`;
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    document.body.appendChild(modal);
  }

  async function open() {
    try {
      state.selectedAppId = state.selectedAppId || workspace().currentAppId || apps()[0]?.id || '';
      await refreshData();
      render();
    } catch (error) {
      alert(`Could not open Deployment Manager: ${error.message}`);
    }
  }

  async function deploy() {
    const app = currentApp();
    if (!app) throw new Error('Select an application first.');
    const environmentKey = document.getElementById('v07DeployEnvironment')?.value;
    const versionLabel = document.getElementById('v07DeployVersion')?.value.trim();
    const releaseNotes = document.getElementById('v07DeployNotes')?.value.trim();
    await api('/api/deployments?action=deploy', { method: 'POST', body: JSON.stringify({ application: app, environmentKey, versionLabel, releaseNotes }) });
    state.details = null;
    await refreshData();
    render();
  }

  async function promote(button) {
    const target = button.dataset.v07Target;
    if (!confirm(`Promote this immutable deployment to ${target}?`)) return;
    const notes = prompt(`Release notes for ${target}`, `Promoted to ${target}`) || '';
    await api('/api/deployments?action=promote', { method: 'POST', body: JSON.stringify({ deploymentId: button.dataset.v07Promote, targetEnvironmentKey: target, releaseNotes: notes }) });
    state.details = null;
    await refreshData();
    render();
  }

  async function rollback(id) {
    const source = state.history.find(item => item.id === id);
    if (!confirm(`Create a new rollback deployment in ${source?.environmentKey || 'this environment'} using this immutable snapshot?`)) return;
    const notes = prompt('Rollback reason', 'Rollback to known-good deployment') || '';
    await api('/api/deployments?action=rollback', { method: 'POST', body: JSON.stringify({ deploymentId: id, releaseNotes: notes }) });
    state.details = null;
    await refreshData();
    render();
  }

  async function details(id) {
    const result = await api(`/api/deployments?action=deployment&id=${encodeURIComponent(id)}`);
    state.details = result.deployment;
    render();
  }

  async function createEnvironment() {
    const key = document.getElementById('v07EnvKey')?.value.trim();
    const name = document.getElementById('v07EnvName')?.value.trim();
    const stage = document.getElementById('v07EnvStage')?.value;
    const sortOrder = Number(document.getElementById('v07EnvOrder')?.value || 100);
    if (!key || !name) throw new Error('Environment key and name are required.');
    await api('/api/deployments?action=environment', { method: 'POST', body: JSON.stringify({ key, name, stage, sortOrder, protected: stage === 'production', connectionAliases: {} }) });
    await refreshData();
    render();
  }

  async function configureAliases(key) {
    const environment = environmentByKey(key);
    if (!environment) return;
    const raw = prompt(`Connection aliases for ${key} as JSON`, JSON.stringify(environment.connectionAliases || {}, null, 2));
    if (raw == null) return;
    let connectionAliases;
    try { connectionAliases = raw.trim() ? JSON.parse(raw) : {}; }
    catch { throw new Error('Alias mapping is not valid JSON.'); }
    await api('/api/deployments?action=environment', { method: 'POST', body: JSON.stringify({ key: environment.key, name: environment.name, stage: environment.stage, sortOrder: environment.sortOrder, protected: environment.protected, connectionAliases }) });
    await refreshData();
    render();
  }

  async function deleteEnvironment(key) {
    if (!confirm(`Delete custom environment ${key}?`)) return;
    await api(`/api/deployments?action=environment&key=${encodeURIComponent(key)}`, { method: 'DELETE' });
    await refreshData();
    render();
  }

  function scheduleMount() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      injectStyle();
      ensureEntry();
    });
  }

  document.addEventListener('change', async event => {
    if (event.target.id !== 'v07DeployApp') return;
    state.selectedAppId = event.target.value;
    try { await refreshData(); state.details = null; render(); } catch (error) { alert(error.message); }
  });

  document.addEventListener('click', async event => {
    try {
      if (event.target.closest('[data-v07-deploy-open]')) await open();
      if (event.target.closest('[data-v07-close]')) close();
      if (event.target.closest('[data-v07-refresh]')) await open();
      if (event.target.closest('[data-v07-deploy]')) await deploy();
      const detailButton = event.target.closest('[data-v07-details]');
      if (detailButton) await details(detailButton.dataset.v07Details);
      const promoteButton = event.target.closest('[data-v07-promote]');
      if (promoteButton) await promote(promoteButton);
      const rollbackButton = event.target.closest('[data-v07-rollback]');
      if (rollbackButton) await rollback(rollbackButton.dataset.v07Rollback);
      if (event.target.closest('[data-v07-env-create]')) await createEnvironment();
      const aliasesButton = event.target.closest('[data-v07-env-aliases]');
      if (aliasesButton) await configureAliases(aliasesButton.dataset.v07EnvAliases);
      const deleteButton = event.target.closest('[data-v07-env-delete]');
      if (deleteButton) await deleteEnvironment(deleteButton.dataset.v07EnvDelete);
    } catch (error) {
      alert(error.message || 'Deployment operation failed');
    }
  });

  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  const observer = new MutationObserver(scheduleMount);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleMount();
})();
