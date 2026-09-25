(() => {
  'use strict';

  let active = false;
  let scheduled = false;
  let functions = [];
  let detail = null;
  let selectedId = null;
  let detailEtag = null;
  let message = '';
  let messageBad = false;

  const style = document.createElement('style');
  style.textContent = `
    .fn08-shell{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;min-height:calc(100vh - 150px)}
    .fn08-side,.fn08-main{background:#fff;border:1px solid #dfe5ee;border-radius:14px;box-shadow:0 8px 24px rgba(20,35,55,.06)}
    .fn08-side{padding:14px;display:flex;flex-direction:column;gap:10px}.fn08-main{padding:18px;overflow:auto}.fn08-list{display:flex;flex-direction:column;gap:7px;max-height:55vh;overflow:auto}
    .fn08-item{border:1px solid #e1e6ed;background:#fff;border-radius:9px;padding:10px;text-align:left;cursor:pointer;color:#25344a}.fn08-item.active{border-color:#2473ee;background:#eef5ff}.fn08-item small{display:block;color:#758196;margin-top:3px}
    .fn08-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.fn08-wide{grid-column:1/-1}.fn08-field label{display:block;font-size:12px;font-weight:700;color:#556276;margin-bottom:5px}.fn08-field input,.fn08-field select,.fn08-field textarea{width:100%;box-sizing:border-box;border:1px solid #d8e0eb;border-radius:8px;padding:9px;background:#fff;color:#1d2a3a}.fn08-field textarea{min-height:120px;resize:vertical;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
    .fn08-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.fn08-btn{border:1px solid #d8e0eb;background:#fff;border-radius:8px;padding:8px 11px;font-weight:700;cursor:pointer}.fn08-btn.primary{background:#2473ee;border-color:#2473ee;color:#fff}.fn08-btn.danger{color:#a82e3f}.fn08-status{padding:9px 10px;border-radius:8px;background:#f3f6fa;font-size:12px;margin:10px 0}.fn08-status.bad{background:#fff0f2;color:#a82e3f}.fn08-status.ok{background:#eaf7f1;color:#167650}.fn08-code{background:#111923;color:#d9e4f2;border-radius:9px;padding:10px;white-space:pre-wrap;word-break:break-word;max-height:280px;overflow:auto;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}.fn08-help{font-size:12px;color:#68758a;line-height:1.5}.fn08-runtime{font:11px ui-monospace,SFMono-Regular,Consolas,monospace;color:#667489;word-break:break-all}
    @media(max-width:900px){.fn08-shell{grid-template-columns:1fr}.fn08-grid{grid-template-columns:1fr}.fn08-wide{grid-column:auto}}
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

  function ensureNav() {
    const nav = document.querySelector('.nav');
    if (!nav || nav.querySelector('[data-server-functions-nav]')) return;
    const button = document.createElement('button');
    button.className = 'nav-button';
    button.setAttribute('data-server-functions-nav', '1');
    button.innerHTML = '<span class="nav-icon">ƒ</span><span>Server Functions</span>';
    const apiButton = nav.querySelector('[data-api-designer-nav]');
    if (apiButton?.nextSibling) nav.insertBefore(button, apiButton.nextSibling);
    else {
      const settings = nav.querySelector('[data-nav="settings"]');
      nav.insertBefore(button, settings || null);
    }
  }

  function setTopbar() {
    const title = document.querySelector('.topbar-title h1');
    const subtitle = document.querySelector('.topbar-title p');
    if (title) title.textContent = 'Server Functions';
    if (subtitle) subtitle.textContent = 'Compose safe server-side SAP business logic';
  }

  async function activate() {
    active = true;
    document.querySelectorAll('.nav-button').forEach(node => node.classList.remove('active'));
    document.querySelector('[data-server-functions-nav]')?.classList.add('active');
    setTopbar();
    const content = document.querySelector('.content');
    if (!content) return;
    content.className = 'content';
    content.innerHTML = '<div id="serverFunctionsV08"><div class="card">Loading Server Functions…</div></div>';
    await loadAll();
  }

  async function loadAll() {
    try {
      const result = await request('/api/functions');
      functions = result.data.functions || [];
      if (selectedId && !functions.some(item => item.id === selectedId)) selectedId = null;
      if (!selectedId && functions.length) selectedId = functions[0].id;
      if (selectedId) await loadDetail(selectedId, false);
      else { detail = null; detailEtag = null; render(); }
    } catch (error) { functions=[]; detail=null; setMessage(error.message, true); }
  }

  async function loadDetail(id, renderAfter = true) {
    try {
      const result = await request(`/api/functions?id=${encodeURIComponent(id)}`);
      detail = result.data;
      selectedId = id;
      detailEtag = result.response.headers.get('etag');
      if (renderAfter) render();
    } catch (error) { setMessage(error.message, true); }
  }

  function setMessage(text, bad = false) { message = text || ''; messageBad = bad; render(); }
  function value(id) { return document.getElementById(id)?.value ?? ''; }
  function pretty(value) { return JSON.stringify(value ?? {}, null, 2); }

  function render() {
    if (!active) return;
    const mount = document.getElementById('serverFunctionsV08');
    if (!mount) return;
    const messageHtml = message ? `<div class="fn08-status ${messageBad?'bad':'ok'}">${esc(message)}</div>` : '';
    mount.innerHTML = `<div class="fn08-shell">
      <aside class="fn08-side"><strong>Server Functions</strong>
        <div class="fn08-field"><label>New function name</label><input id="fn08NewName" placeholder="Get Product Summary"></div>
        <button class="fn08-btn primary" data-fn08-create>Create function</button>${messageHtml}
        <div class="fn08-list">${functions.length ? functions.map(item => `<button class="fn08-item ${item.id===selectedId?'active':''}" data-fn08-select="${esc(item.id)}"><strong>${esc(item.name)}</strong><small>${esc(item.slug)} · ${esc(item.status)} · rev ${Number(item.revision||1)}</small></button>`).join('') : '<div class="fn08-status">No server functions yet.</div>'}</div>
      </aside>
      <main class="fn08-main">${detail ? detailHtml() : '<h2>Server Functions</h2><p>Create a function on the left to begin.</p>'}</main>
    </div>`;
  }

  function detailHtml() {
    return `<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><h2 style="margin:0">${esc(detail.name)}</h2><div class="fn08-runtime">POST /runtime/functions/${esc(detail.slug)}</div></div><span class="pill">rev ${Number(detail.revision||1)}</span></div>
      <div class="fn08-grid" style="margin-top:16px">
        <div class="fn08-field"><label>Name</label><input id="fn08Name" value="${esc(detail.name)}"></div>
        <div class="fn08-field"><label>Slug</label><input id="fn08Slug" value="${esc(detail.slug)}"></div>
        <div class="fn08-field"><label>Status</label><select id="fn08Status">${['draft','published','disabled'].map(v=>`<option ${detail.status===v?'selected':''}>${v}</option>`).join('')}</select></div>
        <div class="fn08-field"><label>Timeout (ms)</label><input id="fn08Timeout" type="number" min="1000" max="120000" value="${Number(detail.timeoutMs||30000)}"></div>
        <div class="fn08-field fn08-wide"><label>Description</label><input id="fn08Description" value="${esc(detail.description||'')}"></div>
        <div class="fn08-field fn08-wide"><label>Input schema</label><textarea id="fn08Schema">${esc(pretty(detail.inputSchema||{}))}</textarea></div>
        <div class="fn08-field fn08-wide"><label>Pipeline steps</label><textarea id="fn08Steps" style="min-height:300px">${esc(pretty(detail.steps||[]))}</textarea></div>
      </div>
      <div class="fn08-help">Supported step types: <strong>require</strong>, <strong>set</strong>, <strong>sap-request</strong>, <strong>respond</strong>. Use templates such as <code>{{input.productId}}</code>, <code>{{vars.name}}</code> and <code>{{steps.products.data}}</code>. No arbitrary JavaScript is executed.</div>
      <div class="fn08-actions"><button class="fn08-btn primary" data-fn08-save>Save function</button><button class="fn08-btn" data-fn08-example>Load example</button><button class="fn08-btn danger" data-fn08-delete>Delete</button></div>
      <section style="margin-top:22px;padding-top:18px;border-top:1px solid #e5eaf0"><h3>Test published function</h3><div class="fn08-field"><label>JSON input</label><textarea id="fn08TestInput">{}</textarea></div><div class="fn08-actions"><button class="fn08-btn" data-fn08-test>Run test</button></div><div id="fn08TestResult" class="fn08-code">Publish the function, then run a test.</div></section>`;
  }

  function parseJsonField(id, label, fallback) {
    const text = value(id).trim();
    if (!text) return fallback;
    try { return JSON.parse(text); }
    catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
  }

  async function createFunction() {
    const name = value('fn08NewName').trim();
    if (!name) return setMessage('Enter a function name first.', true);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64);
    try {
      const result = await request('/api/functions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name, slug, steps:[] }) });
      selectedId=result.data.id; message='Function created.'; messageBad=false; await loadAll();
    } catch (error) { setMessage(error.message, true); }
  }

  async function saveFunction() {
    if (!detail) return;
    try {
      const inputSchema = parseJsonField('fn08Schema','Input schema',{});
      const steps = parseJsonField('fn08Steps','Pipeline steps',[]);
      if (!Array.isArray(steps)) throw new Error('Pipeline steps must be a JSON array.');
      const result = await request(`/api/functions?id=${encodeURIComponent(detail.id)}`, {
        method:'PUT', headers:{'Content-Type':'application/json', ...(detailEtag?{'If-Match':detailEtag}:{})},
        body:JSON.stringify({ name:value('fn08Name'),slug:value('fn08Slug'),description:value('fn08Description'),status:value('fn08Status'),timeoutMs:Number(value('fn08Timeout')||30000),inputSchema,steps,revision:detail.revision })
      });
      detail=result.data; detailEtag=result.response.headers.get('etag'); message='Function saved.'; messageBad=false; await loadAll();
    } catch (error) { setMessage(error.message, true); }
  }

  async function deleteFunction() {
    if (!detail || !confirm(`Delete server function ${detail.name}?`)) return;
    try { await request(`/api/functions?id=${encodeURIComponent(detail.id)}`, {method:'DELETE'}); selectedId=null;detail=null;detailEtag=null;message='Function deleted.';messageBad=false;await loadAll(); }
    catch (error) { setMessage(error.message, true); }
  }

  function loadExample() {
    const schema = { required:[], properties:{} };
    const steps = [
      { type:'set', key:'message', value:'Hello from Invarture Server Functions' },
      { type:'respond', value:{ message:'{{vars.message}}', user:'{{principal.username}}' } }
    ];
    const schemaNode=document.getElementById('fn08Schema'); const stepsNode=document.getElementById('fn08Steps');
    if(schemaNode) schemaNode.value=pretty(schema); if(stepsNode) stepsNode.value=pretty(steps);
  }

  async function testFunction() {
    const out=document.getElementById('fn08TestResult'); if(!detail||!out)return;
    if(detail.status!=='published'){out.textContent='Publish the function before testing its runtime route.';return;}
    let input; try{input=parseJsonField('fn08TestInput','Test input',{});if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Test input must be a JSON object.');}catch(error){out.textContent=error.message;return;}
    out.textContent='Executing…';
    try{const response=await fetch(`/runtime/functions/${encodeURIComponent(detail.slug)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),cache:'no-store'});const text=await response.text();out.textContent=`HTTP ${response.status}\n${text.slice(0,12000)}`;}catch(error){out.textContent=`Request failed: ${error.message}`;}
  }

  document.addEventListener('click', event => {
    if(event.target.closest('[data-server-functions-nav]')){event.preventDefault();activate();return;}
    if(event.target.closest('[data-nav]')||event.target.closest('[data-api-designer-nav]'))active=false;
    if(!active)return;
    const select=event.target.closest('[data-fn08-select]');if(select){loadDetail(select.getAttribute('data-fn08-select'));return;}
    if(event.target.closest('[data-fn08-create]'))return createFunction();
    if(event.target.closest('[data-fn08-save]'))return saveFunction();
    if(event.target.closest('[data-fn08-delete]'))return deleteFunction();
    if(event.target.closest('[data-fn08-example]'))return loadExample();
    if(event.target.closest('[data-fn08-test]'))return testFunction();
  });

  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;ensureNav();});}
  const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});schedule();
})();
