(() => {
  'use strict';

  let overlay = null;
  let observer = null;
  let scheduled = false;

  function esc(value = '') {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  async function request(url, options = {}) {
    const response = await fetch(url, { cache:'no-store', credentials:'same-origin', ...options, headers:{ 'Content-Type':'application/json', ...(options.headers || {}) } });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw:text }; }
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return { data, response };
  }

  function activeApiId() {
    return document.querySelector('.api08-item.active[data-api08-select]')?.getAttribute('data-api08-select') || '';
  }

  function close() { overlay?.remove(); overlay = null; }

  function show(title, body, wide = false) {
    close();
    const node = document.createElement('div');
    node.className = 'api09-overlay';
    node.innerHTML = `<div class="api09-modal ${wide?'wide':''}"><header><strong>${esc(title)}</strong><span></span><button class="api08-btn" data-api09-close>Close</button></header><main>${body}</main></div>`;
    document.body.appendChild(node); overlay = node;
    node.querySelector('[data-api09-close]')?.addEventListener('click', close);
    return node;
  }

  async function openOpenApi() {
    const apiId = activeApiId();
    if (!apiId) return;
    try {
      const { data } = await request(`/api/openapi?apiId=${encodeURIComponent(apiId)}`);
      const node = show(`OpenAPI 3.1 · ${data.info?.title || 'API'}`, `<div class="api09-actions"><button class="api08-btn primary" data-api09-copy>Copy JSON</button><button class="api08-btn" data-api09-download>Download JSON</button></div><pre class="api09-code">${esc(JSON.stringify(data,null,2))}</pre>`, true);
      node.querySelector('[data-api09-copy]')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(JSON.stringify(data,null,2)); } catch {}
      });
      node.querySelector('[data-api09-download]')?.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/vnd.oai.openapi+json'});
        const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${data.info?.title || 'api'}.openapi.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),500);
      });
    } catch (error) { show('OpenAPI error', `<div class="api08-status bad">${esc(error.message)}</div>`); }
  }

  async function editMappings(operationId) {
    const apiId = activeApiId();
    if (!apiId || !operationId) return;
    try {
      const { data: api } = await request(`/api/apis?id=${encodeURIComponent(apiId)}`);
      const operation = (api.operations || []).find(item => item.id === operationId);
      if (!operation) throw new Error('Operation was not found.');
      const node = show(`Mappings · ${operation.method} ${operation.path}`, `
        <div class="api09-help"><strong>Declarative mapping</strong><p>Request templates can use <code>{{body.field}}</code>, <code>{{query.field}}</code>, <code>{{params.id}}</code> and <code>{{principal.username}}</code>. Response mappings support <code>unwrap</code>, <code>pick</code>, <code>rename</code> and <code>wrap</code>.</p></div>
        <div class="api09-grid"><label>Request mapping JSON<textarea id="api09Request">${esc(JSON.stringify(operation.requestMapping || {},null,2))}</textarea></label><label>Response mapping JSON<textarea id="api09Response">${esc(JSON.stringify(operation.responseMapping || {},null,2))}</textarea></label></div>
        <details><summary>Examples</summary><pre class="api09-code compact">Request:
{
  "body": {
    "PurchaseOrder": "{{params.id}}",
    "Comment": "{{body.comment}}",
    "ChangedBy": "{{principal.username}}"
  },
  "schema": { "type": "object" }
}

Response:
{
  "unwrap": "d.results",
  "pick": ["PurchaseOrder", "Supplier", "NetAmount"],
  "rename": { "PurchaseOrder": "id", "NetAmount": "amount" },
  "wrap": "items",
  "schema": { "type": "object" }
}</pre></details>
        <div class="api09-actions"><button class="api08-btn primary" data-api09-save-map>Save mappings</button></div>`, true);
      node.querySelector('[data-api09-save-map]')?.addEventListener('click', async () => {
        try {
          const requestMapping = JSON.parse(node.querySelector('#api09Request').value || '{}');
          const responseMapping = JSON.parse(node.querySelector('#api09Response').value || '{}');
          const payload = { ...operation, requestMapping, responseMapping };
          delete payload.id; delete payload.apiId; delete payload.createdAt; delete payload.updatedAt;
          await request(`/api/apis?action=operation&id=${encodeURIComponent(operationId)}`, { method:'PUT', body:JSON.stringify(payload) });
          close(); location.reload();
        } catch (error) {
          const current = node.querySelector('.api08-status.bad');
          if (current) current.textContent = error.message;
          else node.querySelector('main').insertAdjacentHTML('afterbegin', `<div class="api08-status bad">${esc(error.message)}</div>`);
        }
      });
    } catch (error) { show('Mapping editor error', `<div class="api08-status bad">${esc(error.message)}</div>`); }
  }

  function decorate() {
    const root = document.getElementById('apiDesignerV08');
    if (!root) return;
    const main = root.querySelector('.api08-main');
    if (main && !main.querySelector('[data-api09-openapi]') && activeApiId()) {
      const firstActions = main.querySelector('.api08-actions');
      if (firstActions) {
        const button = document.createElement('button'); button.className='api08-btn'; button.dataset.api09Openapi='1'; button.textContent='OpenAPI 3.1';
        firstActions.appendChild(button);
      }
    }
    root.querySelectorAll('[data-api08-edit-op]').forEach(edit => {
      const cell = edit.closest('td'); if (!cell || cell.querySelector('[data-api09-mapping]')) return;
      const button = document.createElement('button'); button.className='api08-btn'; button.dataset.api09Mapping=edit.dataset.api08EditOp; button.textContent='Mappings';
      edit.insertAdjacentElement('afterend', button);
    });
  }

  document.addEventListener('click', event => {
    const open = event.target.closest('[data-api09-openapi]'); if (open) { event.preventDefault(); openOpenApi(); return; }
    const mapping = event.target.closest('[data-api09-mapping]'); if (mapping) { event.preventDefault(); editMappings(mapping.dataset.api09Mapping); return; }
  });

  const style = document.createElement('style');
  style.textContent = `.api09-overlay{position:fixed;inset:0;z-index:16500;background:rgba(12,22,34,.62);backdrop-filter:blur(4px);display:grid;place-items:center;padding:20px}.api09-modal{width:min(760px,96vw);max-height:90vh;background:#fff;color:#1d2a3a;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.25);overflow:hidden;display:grid;grid-template-rows:auto 1fr}.api09-modal.wide{width:min(1180px,98vw)}.api09-modal>header{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:12px 15px;border-bottom:1px solid #e2e7ee}.api09-modal>main{padding:15px;overflow:auto}.api09-code{background:#111923;color:#d9e4f2;padding:12px;border-radius:9px;white-space:pre-wrap;word-break:break-word;font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;max-height:62vh;overflow:auto}.api09-code.compact{max-height:300px}.api09-actions{display:flex;gap:7px;margin:0 0 12px}.api09-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.api09-grid label{display:grid;gap:6px;font-size:11px;font-weight:700}.api09-grid textarea{min-height:330px;border:1px solid #d8e0eb;border-radius:8px;padding:9px;font:10px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}.api09-help{background:#f3f6fa;border-radius:9px;padding:10px;margin-bottom:12px}.api09-help p{font-size:10px;line-height:1.5;margin:4px 0}.api09-modal details{margin:12px 0}.api09-modal summary{cursor:pointer;font-size:10px;font-weight:800}@media(max-width:760px){.api09-grid{grid-template-columns:1fr}.api09-overlay{padding:4px}.api09-modal{width:100%;max-height:99vh}}`;
  document.head.appendChild(style);

  function schedule() {
    if (scheduled) return; scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;decorate();});
  }
  observer = new MutationObserver(schedule); observer.observe(document.body,{childList:true,subtree:true}); schedule();
})();
