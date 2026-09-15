(() => {
  'use strict';

  const STORAGE_KEY = 'invarture-app-studio-v2';
  const API = '/api/sap';
  let serverConnections = [];
  let currentConnection = null;
  let metadataModel = null;

  const css = `
  .cc-launch{position:fixed;right:22px;bottom:22px;z-index:900;border:0;border-radius:14px;background:#2473ee;color:#fff;padding:12px 16px;font:700 13px/1 system-ui;box-shadow:0 12px 32px rgba(36,115,238,.3);cursor:pointer}
  .cc-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(11,20,34,.66);display:grid;place-items:center;padding:24px;font-family:Inter,system-ui,sans-serif}
  .cc-modal{width:min(1180px,96vw);height:min(760px,92vh);background:#f7f9fc;border-radius:18px;overflow:hidden;box-shadow:0 28px 80px rgba(0,0,0,.3);display:grid;grid-template-rows:64px 1fr;color:#1c2737}
  .cc-head{display:flex;align-items:center;gap:12px;background:#fff;border-bottom:1px solid #dfe5ee;padding:0 18px}.cc-head h2{font-size:18px;margin:0}.cc-head p{font-size:12px;color:#6b778b;margin:2px 0 0}.cc-spacer{flex:1}.cc-btn{border:1px solid #d8e0eb;background:#fff;border-radius:9px;padding:8px 11px;font-weight:700;color:#243349;cursor:pointer}.cc-btn.primary{background:#2473ee;border-color:#2473ee;color:#fff}.cc-btn.danger{color:#bc3446}.cc-body{display:grid;grid-template-columns:300px 1fr;min-height:0}.cc-side{background:#fff;border-right:1px solid #dfe5ee;padding:14px;overflow:auto}.cc-main{padding:18px;overflow:auto}.cc-conn{border:1px solid #e0e6ef;background:#fff;border-radius:12px;padding:12px;margin-bottom:9px;cursor:pointer}.cc-conn.active{border-color:#2473ee;box-shadow:0 0 0 2px rgba(36,115,238,.12)}.cc-conn strong{display:block;font-size:13px}.cc-muted{color:#6f7c90;font-size:12px;line-height:1.45}.cc-badge{display:inline-block;padding:3px 7px;border-radius:999px;background:#eef4ff;color:#1f66ce;font-size:10px;font-weight:800;margin-top:7px}.cc-card{background:#fff;border:1px solid #e0e6ef;border-radius:13px;padding:16px;margin-bottom:13px}.cc-card h3{margin:0 0 10px;font-size:14px}.cc-actions{display:flex;gap:8px;flex-wrap:wrap}.cc-status{padding:10px 12px;border-radius:10px;background:#f0f4fa;font-size:12px}.cc-status.ok{background:#e9f7f0;color:#13734e}.cc-status.bad{background:#fff0f1;color:#ad3342}.cc-grid{display:grid;grid-template-columns:310px 1fr;gap:13px}.cc-list{border:1px solid #e1e7f0;border-radius:10px;max-height:410px;overflow:auto}.cc-row{padding:9px 10px;border-bottom:1px solid #edf1f6;font-size:12px;cursor:pointer;background:#fff}.cc-row:hover,.cc-row.active{background:#f0f5ff;color:#1e62c8}.cc-search{width:100%;border:1px solid #dce3ed;border-radius:9px;padding:9px 10px;margin-bottom:9px}.cc-table{width:100%;border-collapse:collapse;font-size:12px}.cc-table th,.cc-table td{border-bottom:1px solid #e8edf4;padding:8px;text-align:left}.cc-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;background:#f3f5f8;padding:8px;border-radius:8px;overflow:auto}.cc-empty{padding:28px;text-align:center;color:#7a879a;font-size:13px}.cc-note{padding:11px;border:1px solid #d7e5ff;background:#f4f8ff;border-radius:10px;color:#355783;font-size:12px;line-height:1.5}@media(max-width:800px){.cc-body{grid-template-columns:1fr}.cc-side{max-height:190px;border-right:0;border-bottom:1px solid #dfe5ee}.cc-grid{grid-template-columns:1fr}}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const launch = document.createElement('button');
  launch.className = 'cc-launch'; launch.textContent = '⇄ Connection Center'; launch.title = 'Secure SAP Connection Center';
  launch.addEventListener('click', openCenter); document.body.appendChild(launch);

  async function api(params = {}, options = {}) {
    const url = new URL(API, location.origin);
    Object.entries(params).forEach(([k,v]) => v != null && url.searchParams.set(k, v));
    const response = await fetch(url, options);
    const ct = response.headers.get('content-type') || '';
    const body = ct.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) throw new Error(typeof body === 'string' ? body : (body.error || `HTTP ${response.status}`));
    return body;
  }

  function esc(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  async function openCenter() {
    document.getElementById('ccBackdrop')?.remove();
    const back = document.createElement('div'); back.id = 'ccBackdrop'; back.className = 'cc-backdrop';
    back.innerHTML = `<div class="cc-modal"><div class="cc-head"><div><h2>Secure Connection Center</h2><p>SAP OData / REST through the server-side Invarture connector</p></div><div class="cc-spacer"></div><button class="cc-btn" id="ccReload">Reload</button><button class="cc-btn" id="ccClose">Close</button></div><div class="cc-body"><aside class="cc-side" id="ccSide"><div class="cc-empty">Loading connections…</div></aside><main class="cc-main" id="ccMain"><div class="cc-card"><h3>Secure server connections</h3><div class="cc-note">Connections and credentials are defined on the server. The browser receives only a safe connection descriptor and sends requests through <code>/api/sap</code>.</div></div></main></div></div>`;
    document.body.appendChild(back);
    document.getElementById('ccClose').onclick = () => back.remove();
    document.getElementById('ccReload').onclick = loadConnections;
    back.addEventListener('click', e => { if (e.target === back) back.remove(); });
    await loadConnections();
  }

  async function loadConnections() {
    const side = document.getElementById('ccSide'); const main = document.getElementById('ccMain');
    if (!side) return;
    side.innerHTML = '<div class="cc-empty">Loading connections…</div>';
    try {
      const data = await api({ action: 'connections' });
      serverConnections = data.connections || [];
      if (!serverConnections.length) {
        side.innerHTML = '<div class="cc-empty">No server-side connections configured.</div>';
        main.innerHTML = `<div class="cc-card"><h3>No connections yet</h3><div class="cc-note">Set <code>SAP_CONNECTIONS_JSON</code> and the referenced secret environment variables on the Ubuntu server or Vercel deployment, then reload this panel. See <code>.env.example</code>.</div></div>`;
        return;
      }
      side.innerHTML = serverConnections.map(c => `<div class="cc-conn" data-id="${esc(c.id)}"><strong>${esc(c.name)}</strong><div class="cc-muted">${esc(c.type)}<br>${esc(c.baseUrl)}</div><span class="cc-badge">${esc(c.auth)}</span></div>`).join('');
      side.querySelectorAll('.cc-conn').forEach(el => el.onclick = () => selectConnection(el.dataset.id));
      await selectConnection(serverConnections[0].id);
    } catch (err) {
      side.innerHTML = `<div class="cc-empty">Connector unavailable</div>`;
      main.innerHTML = `<div class="cc-card"><h3>Cannot reach the server connector</h3><div class="cc-status bad">${esc(err.message)}</div><p class="cc-muted">Run the app with <code>npm start</code> / <code>node server.js</code>. Opening index.html directly does not provide the /api/sap backend.</p></div>`;
    }
  }

  async function selectConnection(id) {
    currentConnection = serverConnections.find(c => c.id === id);
    metadataModel = null;
    document.querySelectorAll('.cc-conn').forEach(el => el.classList.toggle('active', el.dataset.id === id));
    const main = document.getElementById('ccMain');
    main.innerHTML = `<div class="cc-card"><h3>${esc(currentConnection.name)}</h3><div class="cc-code">${esc(currentConnection.baseUrl)}</div><div class="cc-actions" style="margin-top:11px"><button class="cc-btn primary" id="ccHealth">Test connection</button><button class="cc-btn" id="ccMetadata">Browse metadata</button><button class="cc-btn" id="ccImport">Add to App Studio</button></div><div id="ccResult" style="margin-top:11px"></div></div><div id="ccMetadataArea"></div>`;
    document.getElementById('ccHealth').onclick = testHealth;
    document.getElementById('ccMetadata').onclick = browseMetadata;
    document.getElementById('ccImport').onclick = importToStudio;
  }

  async function testHealth() {
    const out = document.getElementById('ccResult'); out.innerHTML = '<div class="cc-status">Testing $metadata…</div>';
    try {
      const h = await api({ action:'health', id:currentConnection.id });
      out.innerHTML = `<div class="cc-status ${h.ok?'ok':'bad'}"><strong>${h.ok?'Connected':'Failed'}</strong> · HTTP ${h.status} · ${h.latencyMs} ms${h.contentType?` · ${esc(h.contentType)}`:''}${h.sample?`<div class="cc-code" style="margin-top:7px">${esc(h.sample)}</div>`:''}</div>`;
    } catch (err) { out.innerHTML = `<div class="cc-status bad">${esc(err.message)}</div>`; }
  }

  async function browseMetadata() {
    const area = document.getElementById('ccMetadataArea'); area.innerHTML = '<div class="cc-card">Loading OData metadata…</div>';
    try {
      const data = await api({ action:'metadata', id:currentConnection.id });
      metadataModel = parseMetadata(data.xml);
      renderMetadata();
    } catch (err) { area.innerHTML = `<div class="cc-card"><div class="cc-status bad">${esc(err.message)}</div></div>`; }
  }

  function parseMetadata(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('SAP returned metadata that could not be parsed as XML');
    const types = {};
    [...doc.getElementsByTagNameNS('*','EntityType')].forEach(t => {
      const name = t.getAttribute('Name');
      types[name] = [...t.getElementsByTagNameNS('*','Property')].map(p => ({
        name:p.getAttribute('Name'), type:p.getAttribute('Type'), nullable:p.getAttribute('Nullable') !== 'false', maxLength:p.getAttribute('MaxLength') || ''
      }));
    });
    const sets = [...doc.getElementsByTagNameNS('*','EntitySet')].map(s => {
      const fullType = s.getAttribute('EntityType') || '';
      const shortType = fullType.split('.').pop();
      return { name:s.getAttribute('Name'), entityType:fullType, properties:types[shortType] || [] };
    });
    return { sets, raw:xml };
  }

  function renderMetadata(filter='') {
    const area = document.getElementById('ccMetadataArea');
    const sets = metadataModel.sets.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));
    area.innerHTML = `<div class="cc-card"><h3>OData service metadata</h3><div class="cc-grid"><div><input class="cc-search" id="ccSearch" placeholder="Filter entity sets…" value="${esc(filter)}"><div class="cc-list" id="ccSets">${sets.map(s=>`<div class="cc-row" data-entity="${esc(s.name)}">${esc(s.name)}</div>`).join('') || '<div class="cc-empty">No matching entities</div>'}</div></div><div id="ccEntity"><div class="cc-empty">Choose an entity set to inspect fields.</div></div></div></div>`;
    document.getElementById('ccSearch').oninput = e => renderMetadata(e.target.value);
    document.querySelectorAll('[data-entity]').forEach(el => el.onclick = () => showEntity(el.dataset.entity));
  }

  function showEntity(name) {
    const entity = metadataModel.sets.find(s => s.name === name); if (!entity) return;
    document.querySelectorAll('[data-entity]').forEach(el => el.classList.toggle('active', el.dataset.entity === name));
    const target = document.getElementById('ccEntity');
    target.innerHTML = `<h3 style="margin-top:0">${esc(entity.name)}</h3><div class="cc-code">/${esc(entity.name)}</div><div class="cc-actions" style="margin:10px 0"><button class="cc-btn primary" id="ccPreviewEntity">Preview 5 rows</button><button class="cc-btn" id="ccBindEntity">Bind selected component</button><button class="cc-btn" id="ccCopyEntity">Copy path</button></div><table class="cc-table"><thead><tr><th>Property</th><th>EDM type</th><th>Nullable</th></tr></thead><tbody>${entity.properties.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.type)}</td><td>${p.nullable?'Yes':'No'}</td></tr>`).join('')}</tbody></table><div id="ccPreview" style="margin-top:12px"></div>`;
    document.getElementById('ccCopyEntity').onclick = () => navigator.clipboard?.writeText(`/${entity.name}`);
    document.getElementById('ccBindEntity').onclick = () => bindSelected(entity.name);
    document.getElementById('ccPreviewEntity').onclick = () => previewEntity(entity.name);
  }

  async function previewEntity(name) {
    const out = document.getElementById('ccPreview'); out.innerHTML = '<div class="cc-status">Loading first 5 rows…</div>';
    try {
      const url = new URL(API, location.origin); url.searchParams.set('action','request'); url.searchParams.set('id',currentConnection.id); url.searchParams.set('path',`${name}?$top=5&$format=json`);
      const response = await fetch(url); const text = await response.text();
      if (!response.ok) throw new Error(text.slice(0,400));
      let obj; try { obj = JSON.parse(text); } catch { obj = text; }
      out.innerHTML = `<div class="cc-code" style="max-height:240px">${esc(typeof obj==='string'?obj:JSON.stringify(obj,null,2))}</div>`;
    } catch (err) { out.innerHTML = `<div class="cc-status bad">${esc(err.message)}</div>`; }
  }

  function importToStudio() {
    const state = readWorkspace(); if (!state) return alert('App Studio workspace could not be read.');
    state.connections = Array.isArray(state.connections) ? state.connections : [];
    const id = `server:${currentConnection.id}`;
    const existing = state.connections.find(c => c.id === id);
    const mapped = { id, name:currentConnection.name, type:currentConnection.type, url:currentConnection.baseUrl, auth:'Server connector', status:'connected', notes:'Secure server-side connection. Secrets are not stored in the browser.' };
    if (existing) Object.assign(existing,mapped); else state.connections.push(mapped);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    alert(`${currentConnection.name} is now available in App Studio data-source selectors.`);
  }

  function bindSelected(entityName) {
    const state = readWorkspace();
    const app = state?.apps?.find(a => a.id === state.currentAppId);
    const page = app?.pages?.find(p => p.id === state.currentPageId);
    const component = page?.components?.find(c => c.id === state.selectedComponentId);
    if (!component) return alert('Select a component in App Studio first, then choose Bind selected component.');
    const serverId = `server:${currentConnection.id}`;
    if (!state.connections?.some(c => c.id === serverId)) {
      state.connections = state.connections || [];
      state.connections.push({ id:serverId, name:currentConnection.name, type:currentConnection.type, url:currentConnection.baseUrl, auth:'Server connector', status:'connected', notes:'Secure server-side connection.' });
    }
    component.dataSource = serverId;
    component.binding = `/${entityName}`;
    app.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    alert(`Bound ${component.type} to ${currentConnection.name} /${entityName}. The Studio will reload to show the binding.`);
    location.reload();
  }

  function readWorkspace() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
  }
})();
