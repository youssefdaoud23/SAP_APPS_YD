(() => {
  'use strict';

  let active = false;
  let scheduled = false;
  let apis = [];
  let detail = null;
  let selectedId = null;
  let selectedOperationId = null;
  let detailEtag = null;
  let connections = [];
  let message = '';
  let messageBad = false;

  const style = document.createElement('style');
  style.textContent = `
    .api08-shell{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;min-height:calc(100vh - 150px)}
    .api08-sidebar,.api08-main{background:#fff;border:1px solid #dfe5ee;border-radius:14px;box-shadow:0 8px 24px rgba(20,35,55,.06)}
    .api08-sidebar{padding:14px;display:flex;flex-direction:column;gap:10px}.api08-main{padding:18px;overflow:auto}
    .api08-list{display:flex;flex-direction:column;gap:7px;max-height:55vh;overflow:auto}.api08-item{border:1px solid #e1e6ed;background:#fff;border-radius:9px;padding:10px;text-align:left;cursor:pointer;color:#25344a}.api08-item.active{border-color:#2473ee;background:#eef5ff}.api08-item small{display:block;color:#758196;margin-top:3px}
    .api08-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.api08-grid .wide{grid-column:1/-1}.api08-field label{display:block;font-size:12px;font-weight:700;color:#556276;margin-bottom:5px}.api08-field input,.api08-field select,.api08-field textarea{width:100%;box-sizing:border-box;border:1px solid #d8e0eb;border-radius:8px;padding:9px;background:#fff;color:#1d2a3a}.api08-field textarea{min-height:76px;resize:vertical}
    .api08-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.api08-btn{border:1px solid #d8e0eb;background:#fff;border-radius:8px;padding:8px 11px;font-weight:700;cursor:pointer}.api08-btn.primary{background:#2473ee;border-color:#2473ee;color:#fff}.api08-btn.danger{color:#a82e3f}.api08-btn:disabled{opacity:.5;cursor:not-allowed}
    .api08-status{padding:9px 10px;border-radius:8px;background:#f3f6fa;font-size:12px;margin:10px 0}.api08-status.bad{background:#fff0f2;color:#a82e3f}.api08-status.ok{background:#eaf7f1;color:#167650}
    .api08-table{width:100%;border-collapse:collapse;font-size:12px}.api08-table th,.api08-table td{border-bottom:1px solid #e7ebf0;padding:8px;text-align:left;vertical-align:top}.api08-method{font-weight:800;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.api08-runtime{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;color:#667489;word-break:break-all}
    .api08-section{margin-top:22px;padding-top:18px;border-top:1px solid #e5eaf0}.api08-section h3{margin:0 0 8px}.api08-preview{background:#111923;color:#d9e4f2;border-radius:9px;padding:10px;white-space:pre-wrap;word-break:break-word;max-height:250px;overflow:auto;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
    @media(max-width:900px){.api08-shell{grid-template-columns:1fr}.api08-grid{grid-template-columns:1fr}.api08-grid .wide{grid-column:auto}}
  `;
  document.head.appendChild(style);

  function esc(value = '') {
    return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  async function request(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return { data, response };
  }

  function setMessage(text, bad = false) {
    message = text || '';
    messageBad = bad;
    render();
  }

  function ensureNav() {
    const nav = document.querySelector('.nav');
    if (!nav || nav.querySelector('[data-api-designer-nav]')) return;
    const button = document.createElement('button');
    button.className = 'nav-button';
    button.setAttribute('data-api-designer-nav', '1');
    button.innerHTML = '<span class="nav-icon">◇</span><span>API Designer</span>';
    const settings = nav.querySelector('[data-nav="settings"]');
    nav.insertBefore(button, settings || null);
  }

  function setTopbar() {
    const title = document.querySelector('.topbar-title h1');
    const subtitle = document.querySelector('.topbar-title p');
    if (title) title.textContent = 'API Designer';
    if (subtitle) subtitle.textContent = 'Create reusable, governed SAP-facing APIs';
  }

  async function activate() {
    active = true;
    document.querySelectorAll('.nav-button').forEach(node => node.classList.remove('active'));
    document.querySelector('[data-api-designer-nav]')?.classList.add('active');
    setTopbar();
    const content = document.querySelector('.content');
    if (!content) return;
    content.className = 'content';
    content.innerHTML = '<div id="apiDesignerV08"><div class="card">Loading API Designer…</div></div>';
    await loadAll();
  }

  async function loadAll() {
    try {
      const [apiResult, connectionResult] = await Promise.all([
        request('/api/apis'),
        request('/api/sap?action=connections').catch(() => ({ data: { connections: [] } }))
      ]);
      apis = apiResult.data.apis || [];
      connections = connectionResult.data.connections || [];
      if (selectedId && !apis.some(api => api.id === selectedId)) selectedId = null;
      if (!selectedId && apis.length) selectedId = apis[0].id;
      if (selectedId) await loadDetail(selectedId, false);
      else { detail = null; detailEtag = null; render(); }
    } catch (error) {
      detail = null;
      apis = [];
      setMessage(error.message, true);
    }
  }

  async function loadDetail(id, renderAfter = true) {
    try {
      const result = await request(`/api/apis?id=${encodeURIComponent(id)}`);
      detail = result.data;
      selectedId = id;
      detailEtag = result.response.headers.get('etag');
      if (selectedOperationId && !(detail.operations || []).some(op => op.id === selectedOperationId)) selectedOperationId = null;
      if (renderAfter) render();
    } catch (error) { setMessage(error.message, true); }
  }

  function connectionOptions(selected = '') {
    const base = '<option value="">Choose server connection</option>';
    return base + connections.map(item => `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''}>${esc(item.name)} (${esc(item.id)})</option>`).join('');
  }

  function render() {
    if (!active) return;
    const mount = document.getElementById('apiDesignerV08');
    if (!mount) return;
    const messageHtml = message ? `<div class="api08-status ${messageBad ? 'bad' : 'ok'}">${esc(message)}</div>` : '';
    mount.innerHTML = `<div class="api08-shell">
      <aside class="api08-sidebar">
        <strong>Reusable APIs</strong>
        <div class="api08-field"><label>New API name</label><input id="api08NewName" placeholder="Purchase Order API"></div>
        <button class="api08-btn primary" data-api08-create>Create API</button>
        ${messageHtml}
        <div class="api08-list">${apis.length ? apis.map(api => `<button class="api08-item ${api.id === selectedId ? 'active' : ''}" data-api08-select="${esc(api.id)}"><strong>${esc(api.name)}</strong><small>${esc(api.slug)} · ${esc(api.status)} · ${Number(api.operationCount || 0)} operations</small></button>`).join('') : '<div class="api08-status">No reusable APIs yet.</div>'}</div>
      </aside>
      <main class="api08-main">${detail ? detailHtml() : '<h2>API Designer</h2><p>Create an API on the left to begin.</p>'}</main>
    </div>`;
  }

  function detailHtml() {
    const operations = detail.operations || [];
    const selectedOp = operations.find(op => op.id === selectedOperationId) || null;
    return `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px"><div><h2 style="margin:0">${esc(detail.name)}</h2><div class="api08-runtime">/runtime/api/${esc(detail.slug)}</div></div><span class="pill">rev ${Number(detail.revision || 1)}</span></div>
      <div class="api08-grid" style="margin-top:16px">
        <div class="api08-field"><label>Name</label><input id="api08Name" value="${esc(detail.name)}"></div>
        <div class="api08-field"><label>Slug</label><input id="api08Slug" value="${esc(detail.slug)}"></div>
        <div class="api08-field"><label>Base path</label><input id="api08BasePath" value="${esc(detail.basePath)}"></div>
        <div class="api08-field"><label>Status</label><select id="api08Status">${['draft','published','disabled'].map(v => `<option ${detail.status===v?'selected':''}>${v}</option>`).join('')}</select></div>
        <div class="api08-field wide"><label>Description</label><textarea id="api08Description">${esc(detail.description || '')}</textarea></div>
      </div>
      <div class="api08-actions"><button class="api08-btn primary" data-api08-save>Save API</button><button class="api08-btn danger" data-api08-delete>Delete API</button><button class="api08-btn" data-api08-refresh>Refresh</button></div>

      <section class="api08-section"><h3>Operations</h3>
        ${operations.length ? `<table class="api08-table"><thead><tr><th>Method</th><th>Route</th><th>SAP target</th><th></th></tr></thead><tbody>${operations.map(op => `<tr><td class="api08-method">${esc(op.method)}</td><td><strong>${esc(op.path)}</strong><div>${esc(op.summary || '')}</div><div class="api08-runtime">/runtime/api/${esc(detail.slug)}${esc(op.path)}</div></td><td>${esc(op.connectionId || '')}<div class="api08-runtime">${esc(op.upstreamPath || '')}</div></td><td><button class="api08-btn" data-api08-edit-op="${esc(op.id)}">Edit</button> ${op.method === 'GET' ? `<button class="api08-btn" data-api08-test-op="${esc(op.id)}">Test GET</button>` : ''} <button class="api08-btn danger" data-api08-delete-op="${esc(op.id)}">Delete</button></td></tr>`).join('')}</tbody></table>` : '<div class="api08-status">No operations yet.</div>'}
      </section>
      <section class="api08-section"><h3>${selectedOp ? 'Edit operation' : 'Add operation'}</h3>${operationForm(selectedOp)}</section>
      <section class="api08-section"><h3>Test result</h3><div id="api08TestResult" class="api08-preview">Select Test GET on a published GET operation.</div></section>`;
  }

  function operationForm(op) {
    const value = op || { method:'GET', path:'/', summary:'', connectionId:'', upstreamPath:'', timeoutMs:30000, enabled:true };
    return `<div class="api08-grid">
      <div class="api08-field"><label>Method</label><select id="api08OpMethod">${['GET','POST','PUT','PATCH','DELETE'].map(v => `<option ${value.method===v?'selected':''}>${v}</option>`).join('')}</select></div>
      <div class="api08-field"><label>Route path</label><input id="api08OpPath" value="${esc(value.path || '/')}"></div>
      <div class="api08-field wide"><label>Summary</label><input id="api08OpSummary" value="${esc(value.summary || '')}"></div>
      <div class="api08-field"><label>SAP connection</label><select id="api08OpConnection">${connectionOptions(value.connectionId || '')}</select></div>
      <div class="api08-field"><label>Timeout (ms)</label><input id="api08OpTimeout" type="number" min="1000" max="120000" value="${Number(value.timeoutMs || 30000)}"></div>
      <div class="api08-field wide"><label>Upstream path</label><input id="api08OpUpstream" value="${esc(value.upstreamPath || '')}" placeholder="PurchaseOrders/{id}"></div>
      <div class="api08-field"><label>Enabled</label><select id="api08OpEnabled"><option value="true" ${value.enabled!==false?'selected':''}>Yes</option><option value="false" ${value.enabled===false?'selected':''}>No</option></select></div>
    </div><div class="api08-actions"><button class="api08-btn primary" data-api08-save-op>${op ? 'Update operation' : 'Add operation'}</button>${op ? '<button class="api08-btn" data-api08-cancel-op>Cancel</button>' : ''}</div>`;
  }

  function value(id) { return document.getElementById(id)?.value ?? ''; }

  async function createApi() {
    const name = value('api08NewName').trim();
    if (!name) return setMessage('Enter an API name first.', true);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
    try {
      const result = await request('/api/apis', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name, slug }) });
      selectedId = result.data.id;
      message = 'API created.'; messageBad = false;
      await loadAll();
    } catch (error) { setMessage(error.message, true); }
  }

  async function saveApi() {
    if (!detail) return;
    try {
      const result = await request(`/api/apis?id=${encodeURIComponent(detail.id)}`, {
        method:'PUT',
        headers:{ 'Content-Type':'application/json', ...(detailEtag ? {'If-Match':detailEtag} : {}) },
        body:JSON.stringify({ name:value('api08Name'), slug:value('api08Slug'), basePath:value('api08BasePath'), status:value('api08Status'), description:value('api08Description'), revision:detail.revision })
      });
      detail = result.data;
      detailEtag = result.response.headers.get('etag');
      message = 'API saved.'; messageBad = false;
      await loadAll();
    } catch (error) { setMessage(error.message, true); }
  }

  async function deleteApi() {
    if (!detail || !confirm(`Delete API ${detail.name} and all of its operations?`)) return;
    try {
      await request(`/api/apis?id=${encodeURIComponent(detail.id)}`, { method:'DELETE' });
      selectedId = null; selectedOperationId = null; detail = null; message='API deleted.'; messageBad=false;
      await loadAll();
    } catch (error) { setMessage(error.message, true); }
  }

  async function saveOperation() {
    if (!detail) return;
    const body = {
      method:value('api08OpMethod'), path:value('api08OpPath'), summary:value('api08OpSummary'),
      connectionId:value('api08OpConnection'), upstreamPath:value('api08OpUpstream'),
      timeoutMs:Number(value('api08OpTimeout') || 30000), enabled:value('api08OpEnabled') !== 'false', mode:'sap-proxy'
    };
    try {
      const url = selectedOperationId ? `/api/apis?action=operation&id=${encodeURIComponent(selectedOperationId)}` : `/api/apis?action=operation&apiId=${encodeURIComponent(detail.id)}`;
      const result = await request(url, { method:selectedOperationId?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      detail = result.data; detailEtag = result.response.headers.get('etag'); selectedOperationId = null;
      message='Operation saved.'; messageBad=false; await loadAll();
    } catch (error) { setMessage(error.message, true); }
  }

  async function deleteOperation(id) {
    if (!confirm('Delete this API operation?')) return;
    try {
      const result = await request(`/api/apis?action=operation&id=${encodeURIComponent(id)}`, { method:'DELETE' });
      detail=result.data; detailEtag=result.response.headers.get('etag'); selectedOperationId=null; message='Operation deleted.'; messageBad=false; await loadAll();
    } catch (error) { setMessage(error.message, true); }
  }

  async function testOperation(id) {
    const op = (detail?.operations || []).find(item => item.id === id);
    const out = document.getElementById('api08TestResult');
    if (!op || !out) return;
    if (detail.status !== 'published') { out.textContent = 'Publish the API before testing its runtime route.'; return; }
    out.textContent = 'Calling runtime…';
    try {
      const response = await fetch(`/runtime/api/${encodeURIComponent(detail.slug)}${op.path}`, { cache:'no-store' });
      const body = await response.text();
      out.textContent = `HTTP ${response.status}\n${body.slice(0, 12000)}`;
    } catch (error) { out.textContent = `Request failed: ${error.message}`; }
  }

  document.addEventListener('click', event => {
    const customNav = event.target.closest('[data-api-designer-nav]');
    if (customNav) { event.preventDefault(); activate(); return; }
    if (event.target.closest('[data-nav]')) active = false;
    if (!active) return;
    const select = event.target.closest('[data-api08-select]');
    if (select) { selectedOperationId=null; loadDetail(select.getAttribute('data-api08-select')); return; }
    if (event.target.closest('[data-api08-create]')) return createApi();
    if (event.target.closest('[data-api08-save]')) return saveApi();
    if (event.target.closest('[data-api08-delete]')) return deleteApi();
    if (event.target.closest('[data-api08-refresh]')) return loadAll();
    const editOp = event.target.closest('[data-api08-edit-op]');
    if (editOp) { selectedOperationId=editOp.getAttribute('data-api08-edit-op'); render(); return; }
    if (event.target.closest('[data-api08-cancel-op]')) { selectedOperationId=null; render(); return; }
    if (event.target.closest('[data-api08-save-op]')) return saveOperation();
    const deleteOp = event.target.closest('[data-api08-delete-op]');
    if (deleteOp) return deleteOperation(deleteOp.getAttribute('data-api08-delete-op'));
    const testOp = event.target.closest('[data-api08-test-op]');
    if (testOp) return testOperation(testOp.getAttribute('data-api08-test-op'));
  });

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled=false; ensureNav(); });
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList:true, subtree:true });
  schedule();
})();
