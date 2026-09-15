(() => {
  'use strict';
  const KEY = 'invarture-app-studio-v2';
  const RUNTIME_PREFIX = 'invarture-v05-runtime:';
  const model = globalThis.InvartureModel;
  if (!model) return;

  let overlayNode = null;
  let decorating = false;

  function esc(value = '') {
    return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }
  function attr(value = '') { return esc(value).replace(/`/g, '&#96;'); }
  function ws() {
    try { const state = JSON.parse(localStorage.getItem(KEY) || 'null'); return state ? model.ensureWorkspace(state) : null; }
    catch { return null; }
  }
  function save(state, reload = true) {
    model.ensureWorkspace(state);
    localStorage.setItem(KEY, JSON.stringify(state));
    if (reload) location.reload();
  }
  function current(state) {
    const app = state?.apps?.find(a => a.id === state.currentAppId) || state?.apps?.[0] || null;
    const page = app?.pages?.find(p => p.id === state.currentPageId) || app?.pages?.[0] || null;
    const component = page?.components?.find(c => c.id === state.selectedComponentId) || null;
    return { app, page, component };
  }
  function runtimeValues(appId) {
    try { return JSON.parse(sessionStorage.getItem(RUNTIME_PREFIX + appId) || '{}'); } catch { return {}; }
  }
  function saveRuntimeValues(appId, values) { sessionStorage.setItem(RUNTIME_PREFIX + appId, JSON.stringify(values || {})); }
  function closeOverlay() { overlayNode?.remove(); overlayNode = null; }
  function showOverlay(title, body, wide = false) {
    closeOverlay();
    const node = document.createElement('div');
    node.className = 'v05-overlay';
    node.innerHTML = `<div class="v05-modal ${wide ? 'wide' : ''}"><div class="v05-modal-head"><strong>${esc(title)}</strong><span></span><button class="btn small icon" data-v05-close>×</button></div><div class="v05-modal-body">${body}</div></div>`;
    document.body.appendChild(node); overlayNode = node;
    node.addEventListener('click', e => { if (e.target === node || e.target.closest('[data-v05-close]')) closeOverlay(); });
    return node;
  }
  function field(label, id, value = '', help = '', type = 'text') {
    return `<div class="v05-field"><label for="${id}">${esc(label)}</label><input id="${id}" type="${type}" value="${attr(value)}">${help ? `<small>${esc(help)}</small>` : ''}</div>`;
  }
  function selectField(label, id, value, options, help = '') {
    return `<div class="v05-field"><label for="${id}">${esc(label)}</label><select id="${id}">${options.map(([v,l]) => `<option value="${attr(v)}" ${String(v)===String(value)?'selected':''}>${esc(l)}</option>`).join('')}</select>${help ? `<small>${esc(help)}</small>` : ''}</div>`;
  }
  function checkbox(label, id, checked, help = '') {
    return `<label class="v05-check"><input id="${id}" type="checkbox" ${checked?'checked':''}><span>${esc(label)}${help?`<small>${esc(help)}</small>`:''}</span></label>`;
  }

  function injectCss() {
    if (document.getElementById('v05-css')) return;
    const style = document.createElement('style'); style.id = 'v05-css';
    style.textContent = `
      .v05-overlay{position:fixed;inset:0;z-index:12000;background:rgba(12,22,34,.58);backdrop-filter:blur(4px);padding:5vh 18px;overflow:auto;display:grid;place-items:start center}
      .v05-modal{width:min(760px,96vw);background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow-lg);overflow:hidden}.v05-modal.wide{width:min(1120px,98vw)}
      .v05-modal-head{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:15px 18px;border-bottom:1px solid var(--line);background:var(--surface);position:sticky;top:0;z-index:2}.v05-modal-body{padding:18px;max-height:78vh;overflow:auto}
      .v05-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.v05-card{border:1px solid var(--line);background:var(--surface-2);border-radius:12px;padding:14px}.v05-card h3{font-size:13px;margin:0 0 5px}.v05-card p{font-size:11px;color:var(--muted);line-height:1.5;margin:0 0 10px}
      .v05-field{display:grid;gap:5px;margin:10px 0}.v05-field label{font-size:11px;font-weight:750}.v05-field input,.v05-field select,.v05-field textarea{width:100%;padding:8px 9px;border-radius:8px;border:1px solid var(--line-2);background:var(--surface);color:var(--text)}.v05-field small,.v05-check small{display:block;color:var(--muted);font-size:10px;margin-top:2px;line-height:1.35}
      .v05-check{display:flex;align-items:flex-start;gap:8px;padding:6px 0;font-size:12px}.v05-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.v05-row{display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--line)}.v05-row:last-child{border-bottom:0}.v05-row .grow{flex:1}.v05-row small{color:var(--muted)}
      .v05-badge{display:inline-flex;align-items:center;padding:3px 7px;border-radius:999px;border:1px solid var(--line);font-size:9px;font-weight:750;background:var(--surface-2);color:var(--muted)}
      .v05-issues{display:grid;gap:7px}.v05-issue{padding:9px 10px;border-radius:8px;border-left:3px solid var(--line-2);background:var(--surface-2);font-size:11px}.v05-issue.error{border-left-color:var(--red);color:var(--red)}.v05-issue.warning{border-left-color:var(--amber)}.v05-issue.info{border-left-color:var(--blue)}
      .v05-layout-render{border:1px dashed var(--line-2);border-radius:10px;padding:10px;background:color-mix(in srgb,var(--surface) 92%,var(--blue) 8%)}.v05-layout-grid{display:grid;gap:var(--v05-gap,12px);grid-template-columns:repeat(var(--v05-cols,2),minmax(0,1fr))}.v05-slot{min-height:58px;border:1px dashed var(--line);border-radius:8px;padding:8px;background:var(--surface)}.v05-slot-label{font-size:9px;color:var(--muted);margin-bottom:5px}.v05-child{padding:7px;border-radius:7px;background:var(--surface-2);border:1px solid var(--line);margin:5px 0}.v05-child strong{font-size:11px}.v05-child small{display:block;color:var(--muted);font-size:9px;margin-top:2px}
      .v05-dev-table{width:100%;border-collapse:collapse;font-size:10px}.v05-dev-table th,.v05-dev-table td{text-align:left;padding:7px;border-bottom:1px solid var(--line);vertical-align:top}.v05-dev-table th{color:var(--muted);font-size:9px;text-transform:uppercase}.v05-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px;white-space:pre-wrap;word-break:break-word;background:var(--surface-2);border:1px solid var(--line);padding:9px;border-radius:8px;max-height:260px;overflow:auto}
      .v05-toolbar-cluster{display:contents}.v05-toolbar-env{font-weight:800;color:var(--blue)}
      @media(max-width:800px){.v05-layout-grid{grid-template-columns:1fr!important}.v05-overlay{padding:2vh 8px}.v05-modal-body{padding:12px}}
    `;
    document.head.appendChild(style);
  }

  function ensureToolbar() {
    const title = document.querySelector('.topbar-title h1')?.textContent?.trim();
    const toolbar = document.querySelector('.studio-toolbar');
    if (title !== 'App Studio' || !toolbar || toolbar.querySelector('[data-v05-state]')) return;
    const grow = toolbar.querySelector('.grow'); if (!grow) return;
    const state = ws();
    const wrap = document.createElement('span'); wrap.className = 'v05-toolbar-cluster';
    wrap.innerHTML = `<button class="btn small" data-v05-undo ${globalThis.InvartureHistory?.canUndo()?'':'disabled'}>↶ Undo</button><button class="btn small" data-v05-redo ${globalThis.InvartureHistory?.canRedo()?'':'disabled'}>↷ Redo</button><span class="divider"></span><button class="btn small" data-v05-state>State</button><button class="btn small" data-v05-binding>Binding+</button><button class="btn small" data-v05-fragments>Fragments</button><button class="btn small" data-v05-layout>Layouts</button><button class="btn small v05-toolbar-env" data-v05-environments>${esc(state?.currentEnvironment || 'DEV')}</button><button class="btn small" data-v05-devtools>Devtools</button><span class="divider"></span>`;
    toolbar.insertBefore(wrap, grow);
  }

  function stateEditor() {
    const state = ws(); const { app } = current(state); if (!app) return;
    const values = runtimeValues(app.id);
    const rows = (app.variables || []).map(v => `<div class="v05-row" data-var-row="${attr(v.id)}"><div class="grow"><strong>${esc(v.name)}</strong> <span class="v05-badge">${esc(v.type)}</span> <span class="v05-badge">${esc(v.scope)}</span><small>Default: ${esc(String(v.defaultValue))}</small></div><button class="btn small" data-v05-var-test="${attr(v.id)}">Test value</button><button class="btn small danger" data-v05-var-delete="${attr(v.id)}">Delete</button></div>`).join('');
    const node = showOverlay(`Application state · ${app.name}`, `
      <div class="v05-grid"><section class="v05-card"><h3>Variables</h3><p>Typed application/page/session state. Use <code>{{variableName}}</code> in supported text values.</p>${rows || '<div class="v05-issue info">No variables yet.</div>'}<div class="v05-actions"><button class="btn primary" data-v05-var-add>+ Variable</button></div></section>
      <section class="v05-card"><h3>Runtime state inspector</h3><p>Test values live in this browser session and do not alter the variable defaults.</p>${(app.variables||[]).map(v=>field(v.name,`v05-runtime-${v.id}`,Object.prototype.hasOwnProperty.call(values,v.name)?values[v.name]:v.defaultValue)).join('') || '<div class="v05-issue info">Create a variable first.</div>'}<div class="v05-actions"><button class="btn primary" data-v05-runtime-save>Apply runtime values</button><button class="btn" data-v05-runtime-reset>Reset</button></div></section></div>`, true);
    node.querySelector('[data-v05-var-add]')?.addEventListener('click', addVariableDialog);
    node.querySelectorAll('[data-v05-var-delete]').forEach(btn => btn.addEventListener('click', () => { const latest=ws(); const a=current(latest).app; a.variables=a.variables.filter(v=>v.id!==btn.dataset.v05VarDelete); save(latest); }));
    node.querySelectorAll('[data-v05-var-test]').forEach(btn => btn.addEventListener('click', () => node.querySelector(`#v05-runtime-${CSS.escape(btn.dataset.v05VarTest)}`)?.focus()));
    node.querySelector('[data-v05-runtime-save]')?.addEventListener('click', () => {
      const latest=ws(); const a=current(latest).app; const next={}; for(const v of a.variables||[]) next[v.name]=node.querySelector(`#v05-runtime-${CSS.escape(v.id)}`)?.value ?? v.defaultValue; saveRuntimeValues(a.id,next); closeOverlay(); decorate();
    });
    node.querySelector('[data-v05-runtime-reset]')?.addEventListener('click',()=>{sessionStorage.removeItem(RUNTIME_PREFIX+app.id);closeOverlay();decorate();});
  }

  function addVariableDialog() {
    const node = showOverlay('Add variable', `${field('Name','v05-var-name','newVariable','Letters, numbers and underscore. Start with a letter or underscore.')}${selectField('Type','v05-var-type','string',[['string','String'],['number','Number'],['boolean','Boolean'],['date','Date'],['json','JSON']])}${selectField('Scope','v05-var-scope','application',[['application','Application'],['page','Page'],['session','Session']])}${field('Default value','v05-var-default','')}${checkbox('Persist value','v05-var-persist',false,'Marks intent for future persisted-state handling.')}<div class="v05-actions"><button class="btn primary" data-v05-var-create>Create</button></div>`);
    node.querySelector('[data-v05-var-create]')?.addEventListener('click',()=>{
      const latest=ws(); const a=current(latest).app; const name=node.querySelector('#v05-var-name').value.trim();
      if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return alert('Use a valid variable name.');
      if((a.variables||[]).some(v=>v.name===name)) return alert('That variable already exists.');
      a.variables.push({id:model.uid('var'),name,type:node.querySelector('#v05-var-type').value,scope:node.querySelector('#v05-var-scope').value,defaultValue:node.querySelector('#v05-var-default').value,persist:node.querySelector('#v05-var-persist').checked}); save(latest);
    });
  }

  function bindingEditor() {
    const state=ws(); const {app,component}=current(state); if(!app||!component) return showOverlay('Binding editor','<div class="v05-issue warning">Select a component first.</div>');
    const direct=(state.connections||[]).map(c=>[c.id,`Direct · ${c.name||c.id}`]);
    const aliases=(state.connectionAliases||[]).map(a=>[`alias:${a.id}`,`Alias · ${a.name||a.id}`]);
    const q=model.parseODataPath(component.binding||'');
    const node=showOverlay(`Binding · ${component.type}`, `<div class="v05-grid"><section class="v05-card"><h3>Data source</h3><p>Prefer aliases for applications that must move across DEV/QAS/PRD.</p>${selectField('Connection','v05-bind-source',component.dataSource||'',[['','None'],...aliases,...direct])}${selectField('Binding mode','v05-bind-mode',component.bindingMode||'oneWay',[['oneWay','One way'],['twoWay','Two way'],['list','List'],['context','Context']])}${field('Fallback value','v05-bind-fallback',component.bindingFallback||'')}</section><section class="v05-card"><h3>OData path</h3>${queryFields(q,'v05-bind')}</section></div><div class="v05-actions"><button class="btn primary" data-v05-bind-save>Save binding</button><button class="btn" data-v05-query-preview>Preview generated path</button></div>`,true);
    node.querySelector('[data-v05-bind-save]')?.addEventListener('click',()=>{ const latest=ws(); const c=current(latest).component;if(!c)return;c.dataSource=node.querySelector('#v05-bind-source').value;c.bindingMode=node.querySelector('#v05-bind-mode').value;c.bindingFallback=node.querySelector('#v05-bind-fallback').value;c.binding='/'+readQuery(node,'v05-bind');save(latest); });
    node.querySelector('[data-v05-query-preview]')?.addEventListener('click',()=>alert('/'+readQuery(node,'v05-bind')));
  }

  function queryFields(q,prefix){return `${field('EntitySet / path',`${prefix}-base`,q.base)}${field('$select',`${prefix}-select`,q.select)}${field('$filter',`${prefix}-filter`,q.filter)}${field('$orderby',`${prefix}-orderby`,q.orderby)}${field('$expand',`${prefix}-expand`,q.expand)}${field('$search',`${prefix}-search`,q.search)}${field('$top',`${prefix}-top`,q.top,'','number')}${field('$skip',`${prefix}-skip`,q.skip,'','number')}${selectField('$count',`${prefix}-count`,q.count,[['','Not set'],['true','true'],['false','false']])}`;}
  function readQuery(node,prefix){return model.buildODataPath({base:node.querySelector(`#${prefix}-base`).value,select:node.querySelector(`#${prefix}-select`).value,filter:node.querySelector(`#${prefix}-filter`).value,orderby:node.querySelector(`#${prefix}-orderby`).value,expand:node.querySelector(`#${prefix}-expand`).value,search:node.querySelector(`#${prefix}-search`).value,top:node.querySelector(`#${prefix}-top`).value,skip:node.querySelector(`#${prefix}-skip`).value,count:node.querySelector(`#${prefix}-count`).value});}

  function enhancedQueryBuilder(event) {
    const trigger=event.target.closest?.('[data-adv-query]'); if(!trigger)return false;
    event.preventDefault();event.stopImmediatePropagation();bindingEditor();return true;
  }

  function fragmentLibrary() {
    const state=ws();const {app,component}=current(state);if(!app)return;
    const rows=(state.fragments||[]).map(f=>`<div class="v05-row"><div class="grow"><strong>${esc(f.name)}</strong><small>${esc(f.description||f.component?.type||'Fragment')}</small></div><button class="btn small" data-v05-fragment-insert="${attr(f.id)}">Insert</button><button class="btn small danger" data-v05-fragment-delete="${attr(f.id)}">Delete</button></div>`).join('');
    const node=showOverlay('Reusable fragments',`<section class="v05-card"><h3>Library</h3><p>Fragments are reusable component definitions stored with the workspace.</p>${rows||'<div class="v05-issue info">No fragments saved yet.</div>'}<div class="v05-actions"><button class="btn primary" data-v05-fragment-save ${component?'':'disabled'}>Save selected component as fragment</button></div></section>`);
    node.querySelector('[data-v05-fragment-save]')?.addEventListener('click',()=>saveFragment(component));
    node.querySelectorAll('[data-v05-fragment-insert]').forEach(btn=>btn.addEventListener('click',()=>insertFragment(btn.dataset.v05FragmentInsert)));
    node.querySelectorAll('[data-v05-fragment-delete]').forEach(btn=>btn.addEventListener('click',()=>{const latest=ws();latest.fragments=latest.fragments.filter(f=>f.id!==btn.dataset.v05FragmentDelete);save(latest);}));
  }
  function saveFragment(component){if(!component)return;const name=prompt('Fragment name',component.type+' fragment');if(!name)return;const state=ws();state.fragments.push({id:model.uid('fragment'),name:name.trim(),description:`Reusable ${component.type}`,component:model.clone(component),createdAt:new Date().toISOString()});save(state);}
  function insertFragment(id){const state=ws();const {page}=current(state);const f=state.fragments.find(x=>x.id===id);if(!page||!f)return;const copy=model.cloneComponentWithNewIds(f.component);page.components.push(copy);state.selectedComponentId=copy.id;save(state);}

  function layoutLibrary(){const state=ws();const {component}=current(state);const selectedLayout=component?.type==='layout'?component:null;const node=showOverlay('Nested layouts',`<div class="v05-grid"><section class="v05-card"><h3>Add layout</h3><p>Create nested responsive slots. Child components are stored inside the application schema.</p><div class="v05-actions"><button class="btn" data-v05-layout-add="1">Section</button><button class="btn" data-v05-layout-add="2">2 columns</button><button class="btn" data-v05-layout-add="3">3 columns</button><button class="btn" data-v05-layout-add="4">4 columns</button></div></section><section class="v05-card"><h3>Selected layout</h3>${selectedLayout?`${field('Columns','v05-layout-columns',selectedLayout.columns,'1-4','number')}${field('Gap px','v05-layout-gap',selectedLayout.gap,'0-48','number')}<div class="v05-actions"><button class="btn primary" data-v05-layout-config>Apply</button><button class="btn" data-v05-layout-edit>Edit slots</button></div>`:'<div class="v05-issue info">Select a layout component on the canvas to configure its slots.</div>'}</section></div>`);
    node.querySelectorAll('[data-v05-layout-add]').forEach(btn=>btn.addEventListener('click',()=>addLayout(Number(btn.dataset.v05LayoutAdd))));
    node.querySelector('[data-v05-layout-config]')?.addEventListener('click',()=>{const latest=ws();const c=current(latest).component;if(!c||c.type!=='layout')return;c.columns=Math.max(1,Math.min(4,Number(node.querySelector('#v05-layout-columns').value)||2));c.gap=Math.max(0,Math.min(48,Number(node.querySelector('#v05-layout-gap').value)||12));while(c.slots.length<c.columns)c.slots.push([]);c.slots=c.slots.slice(0,c.columns);save(latest);});
    node.querySelector('[data-v05-layout-edit]')?.addEventListener('click',editLayoutSlots);
  }
  function addLayout(columns){const state=ws();const {page}=current(state);if(!page)return;const layout=model.createLayout(columns);page.components.push(layout);state.selectedComponentId=layout.id;save(state);}
  function editLayoutSlots(){const state=ws();const {component}=current(state);if(!component||component.type!=='layout')return;const slotHtml=component.slots.map((slot,i)=>`<section class="v05-card"><h3>Slot ${i+1}</h3>${slot.map(child=>`<div class="v05-row"><div class="grow"><strong>${esc(model.COMPONENTS[child.type]?.label||child.type)}</strong><small>${esc(child.text||child.label||child.title||'')}</small></div><button class="btn small danger" data-v05-child-delete="${attr(child.id)}">Delete</button></div>`).join('')||'<div class="v05-issue info">Empty slot</div>'}<div class="v05-actions">${['heading','text','button','input','kpi','card'].map(type=>`<button class="btn small" data-v05-child-add="${type}" data-slot="${i}">+ ${esc(model.COMPONENTS[type].label)}</button>`).join('')}</div></section>`).join('');const node=showOverlay('Layout slots',`<div class="v05-grid">${slotHtml}</div>`,true);node.querySelectorAll('[data-v05-child-add]').forEach(btn=>btn.addEventListener('click',()=>{const latest=ws();const c=current(latest).component;const slot=c?.slots?.[Number(btn.dataset.slot)];if(!slot)return;slot.push(model.createComponent(btn.dataset.v05ChildAdd));save(latest);}));node.querySelectorAll('[data-v05-child-delete]').forEach(btn=>btn.addEventListener('click',()=>{const latest=ws();const c=current(latest).component;if(!c)return;for(const slot of c.slots||[]){const idx=slot.findIndex(x=>x.id===btn.dataset.v05ChildDelete);if(idx>=0){slot.splice(idx,1);break;}}save(latest);}));}

  function environmentManager(){const state=ws();const direct=(state.connections||[]).filter(c=>String(c.id||'').startsWith('server:'));const envRows=state.environments.map(e=>`<div class="v05-row"><div class="grow"><strong>${esc(e.id)}</strong><small>${esc(e.name)}</small></div></div>`).join('');const aliasRows=(state.connectionAliases||[]).map(alias=>`<section class="v05-card"><h3>${esc(alias.id)}</h3><p>${esc(alias.name)}</p>${state.environments.map(env=>selectField(env.id,`map-${alias.id}-${env.id}`,alias.mappings?.[env.id]||'',[['','Unmapped'],...direct.map(c=>[c.id,c.name||c.id])])).join('')}<div class="v05-actions"><button class="btn primary" data-v05-alias-save="${attr(alias.id)}">Save mappings</button><button class="btn danger" data-v05-alias-delete="${attr(alias.id)}">Delete alias</button></div></section>`).join('');const node=showOverlay('Environments & connection aliases',`<div class="v05-grid"><section class="v05-card"><h3>Active environment</h3>${selectField('Environment','v05-current-env',state.currentEnvironment,state.environments.map(e=>[e.id,`${e.id} · ${e.name}`]))}<div class="v05-actions"><button class="btn primary" data-v05-env-switch>Switch environment</button></div><hr style="border:0;border-top:1px solid var(--line);margin:14px 0">${envRows}<div class="v05-actions"><button class="btn" data-v05-env-add>+ Environment</button></div></section><section class="v05-card"><h3>Why aliases?</h3><p>Bind an app to <strong>alias:SAP_PRIMARY</strong>. Each environment maps that alias to its own server-side connection. The app itself no longer contains DEV/QAS/PRD-specific connection IDs.</p><div class="v05-actions"><button class="btn primary" data-v05-alias-add>+ Connection alias</button></div></section></div><div class="v05-grid" style="margin-top:12px">${aliasRows||'<div class="v05-issue info">No aliases yet.</div>'}</div>`,true);
    node.querySelector('[data-v05-env-switch]')?.addEventListener('click',()=>{const latest=ws();latest.currentEnvironment=node.querySelector('#v05-current-env').value;save(latest);});
    node.querySelector('[data-v05-env-add]')?.addEventListener('click',()=>{const id=model.normalizeEnvironmentId(prompt('Environment ID','TST'));if(!id)return;const latest=ws();if(latest.environments.some(e=>e.id===id))return alert('Environment already exists.');latest.environments.push({id,name:prompt('Environment name',id)||id});save(latest);});
    node.querySelector('[data-v05-alias-add]')?.addEventListener('click',()=>{const id=model.normalizeAliasId(prompt('Alias ID','SAP_PRIMARY'));if(!id)return;const latest=ws();if(latest.connectionAliases.some(a=>a.id===id))return alert('Alias already exists.');latest.connectionAliases.push({id,name:prompt('Alias name','Primary SAP')||id,mappings:{}});save(latest);});
    node.querySelectorAll('[data-v05-alias-save]').forEach(btn=>btn.addEventListener('click',()=>{const latest=ws();const alias=latest.connectionAliases.find(a=>a.id===btn.dataset.v05AliasSave);if(!alias)return;for(const env of latest.environments)alias.mappings[env.id]=node.querySelector(`#map-${CSS.escape(alias.id)}-${CSS.escape(env.id)}`)?.value||'';save(latest);}));
    node.querySelectorAll('[data-v05-alias-delete]').forEach(btn=>btn.addEventListener('click',()=>{if(!confirm('Delete this alias? Existing app references will become invalid.'))return;const latest=ws();latest.connectionAliases=latest.connectionAliases.filter(a=>a.id!==btn.dataset.v05AliasDelete);save(latest);}));
  }

  function enhancedValidate(event){const trigger=event.target.closest?.('[data-ias-validate]');if(!trigger)return false;event.preventDefault();event.stopImmediatePropagation();const state=ws();const {app}=current(state);const issues=model.validateApp(state,app);const summary=issues.reduce((acc,i)=>(acc[i.severity]=(acc[i.severity]||0)+1,acc),{});showOverlay(`Validation · ${app?.name||'Application'}`,`<div class="v05-row"><span class="v05-badge">${summary.error||0} errors</span><span class="v05-badge">${summary.warning||0} warnings</span><span class="v05-badge">${summary.info||0} info</span></div><div class="v05-issues" style="margin-top:10px">${issues.length?issues.map(i=>`<div class="v05-issue ${i.severity}"><strong>${esc(i.severity.toUpperCase())}</strong> · ${esc(i.message)}<br><small>${esc(i.code)}</small></div>`).join(''):'<div class="v05-issue info">No validation issues found.</div>'}</div>`);return true;}

  function devtools(){const state=ws();const {app}=current(state);const network=globalThis.InvartureDevtools?.network||[];const errors=globalThis.InvartureDevtools?.errors||[];const summary=app?model.summarizeApp(app):{};const bindings=[];if(app)model.walkAppComponents(app,(c,page)=>{if(c.dataSource||c.binding)bindings.push({page:page.name,id:c.id,type:c.type,dataSource:c.dataSource||'',binding:c.binding||''});});showOverlay('Developer tools',`<div class="v05-grid"><section class="v05-card"><h3>Application state</h3><div class="v05-code">${esc(JSON.stringify({environment:state?.currentEnvironment,app:app?.name,...summary,variables:app?.variables||[]},null,2))}</div></section><section class="v05-card"><h3>Errors</h3>${errors.slice(-8).reverse().map(e=>`<div class="v05-issue error">${esc(e.message)}</div>`).join('')||'<div class="v05-issue info">No captured browser errors.</div>'}</section></div><section class="v05-card" style="margin-top:12px"><h3>Network</h3><p>In-memory request diagnostics. Secret-like headers and query parameters are redacted.</p><table class="v05-dev-table"><thead><tr><th>Method</th><th>Status</th><th>ms</th><th>URL</th></tr></thead><tbody>${network.slice(-30).reverse().map(n=>`<tr><td>${esc(n.method)}</td><td>${esc(n.status??'ERR')}</td><td>${esc(n.durationMs??'')}</td><td>${esc(n.url)}</td></tr>`).join('')||'<tr><td colspan="4">No requests captured yet.</td></tr>'}</tbody></table></section><section class="v05-card" style="margin-top:12px"><h3>Bindings</h3><table class="v05-dev-table"><thead><tr><th>Page</th><th>Component</th><th>Source</th><th>Path</th></tr></thead><tbody>${bindings.map(b=>`<tr><td>${esc(b.page)}</td><td>${esc(b.type)}<br><small>${esc(b.id)}</small></td><td>${esc(b.dataSource)}</td><td>${esc(b.binding)}</td></tr>`).join('')||'<tr><td colspan="4">No bindings.</td></tr>'}</tbody></table></section>`,true);}

  function childHtml(c,vars){const text=model.interpolate(c.text||c.label||c.title||'',vars);switch(c.type){case'heading':return`<div class="ui-heading">${esc(text||'Heading')}</div>`;case'text':return`<div class="ui-text">${esc(text||'Text')}</div>`;case'button':return`<button class="ui-button ${esc(c.variant||'primary')}">${esc(text||'Action')}</button>`;case'input':return`<div class="ui-field"><label>${esc(model.interpolate(c.label||'Input',vars))}</label><div class="ui-input">${esc(c.placeholder||'')}</div></div>`;case'kpi':return`<div class="ui-kpi"><div><div class="label">${esc(model.interpolate(c.label||'Metric',vars))}</div><div class="value">${esc(model.interpolate(c.value||'0',vars))}</div></div></div>`;case'card':return`<div class="ui-card"><h4>${esc(model.interpolate(c.title||'Card',vars))}</h4><p>${esc(model.interpolate(c.text||'',vars))}</p></div>`;default:return`<div class="v05-child"><strong>${esc(model.COMPONENTS[c.type]?.label||c.type)}</strong></div>`;}}
  function layoutHtml(component,vars){const cols=Math.max(1,Math.min(4,Number(component.columns)||2));return`<div class="v05-layout-render"><div class="v05-layout-grid" style="--v05-cols:${cols};--v05-gap:${Math.max(0,Number(component.gap)||12)}px">${Array.from({length:cols},(_,i)=>`<div class="v05-slot"><div class="v05-slot-label">Slot ${i+1}</div>${(component.slots?.[i]||[]).map(c=>childHtml(c,vars)).join('')||'<div class="v05-slot-label">Empty</div>'}</div>`).join('')}</div></div>`;}
  function decorateLayoutsAndState(){if(decorating)return;decorating=true;try{const state=ws();if(!state)return;const {app,page}=current(state);const values=app?model.variableMap(app,runtimeValues(app.id)):{};if(page){document.querySelectorAll('.component-wrap[data-component-id]').forEach(root=>{const c=page.components.find(x=>x.id===root.dataset.componentId);if(!c)return;if(c.type==='layout'){root.querySelector(':scope > .ui-card')?.remove();let el=root.querySelector(':scope > .v05-layout-render');if(el)el.outerHTML=layoutHtml(c,values);else root.insertAdjacentHTML('beforeend',layoutHtml(c,values));}if(['heading','text','button','card'].includes(c.type)){const rendered=model.interpolate(c.text||c.title||'',values);const target=c.type==='heading'?root.querySelector('.ui-heading'):c.type==='text'?root.querySelector('.ui-text'):c.type==='button'?root.querySelector('.ui-button'):root.querySelector('.ui-card p');if(target&&rendered)target.textContent=rendered;}});}
      const preview=document.querySelector('.runtime-preview .runtime-body');if(preview&&app){const active=document.querySelector('.runtime-preview .runtime-nav button.active')?.textContent?.trim();const p=app.pages.find(x=>x.name===active)||app.pages.find(x=>x.id===state.currentPageId)||app.pages[0];[...preview.children].forEach((root,i)=>{const c=p?.components?.[i];if(!c)return;if(c.type==='layout')root.innerHTML=layoutHtml(c,values);else if(['heading','text','button','card'].includes(c.type)){const rendered=model.interpolate(c.text||c.title||'',values);const target=c.type==='heading'?root.querySelector('.ui-heading'):c.type==='text'?root.querySelector('.ui-text'):c.type==='button'?root.querySelector('.ui-button'):root.querySelector('.ui-card p');if(target&&rendered)target.textContent=rendered;}});}}
    finally{decorating=false;}}

  function addSettingsCard(){const title=document.querySelector('.topbar-title h1')?.textContent?.trim();const content=document.querySelector('.content');if(title!=='Settings'||!content||content.querySelector('[data-v05-settings]'))return;const state=ws();const card=document.createElement('div');card.dataset.v05Settings='1';card.innerHTML=`<div class="section-head"><h2>V0.5 architecture</h2><p>State, aliases, fragments, layouts and developer diagnostics.</p></div><div class="v05-grid"><section class="v05-card"><h3>Environment</h3><p>Active: <strong>${esc(state?.currentEnvironment||'DEV')}</strong>. Applications can now bind through logical connection aliases.</p><button class="btn" data-v05-environments>Manage environments</button></section><section class="v05-card"><h3>History</h3><p>Browser-session undo/redo keeps up to 40 workspace snapshots.</p><div class="v05-actions"><button class="btn" data-v05-undo ${globalThis.InvartureHistory?.canUndo()?'':'disabled'}>Undo</button><button class="btn" data-v05-redo ${globalThis.InvartureHistory?.canRedo()?'':'disabled'}>Redo</button></div></section><section class="v05-card"><h3>Developer tools</h3><p>Inspect network activity, bindings, application state and browser errors without exposing server secrets.</p><button class="btn" data-v05-devtools>Open Devtools</button></section></div>`;content.appendChild(card);}

  function decorate(){injectCss();ensureToolbar();addSettingsCard();decorateLayoutsAndState();}

  document.addEventListener('click',event=>{
    if(enhancedQueryBuilder(event)||enhancedValidate(event))return;
    const el=event.target.closest?.('[data-v05-undo],[data-v05-redo],[data-v05-state],[data-v05-binding],[data-v05-fragments],[data-v05-layout],[data-v05-environments],[data-v05-devtools]');if(!el)return;
    if(el.matches('[data-v05-undo]'))globalThis.InvartureHistory?.undo();
    else if(el.matches('[data-v05-redo]'))globalThis.InvartureHistory?.redo();
    else if(el.matches('[data-v05-state]'))stateEditor();
    else if(el.matches('[data-v05-binding]'))bindingEditor();
    else if(el.matches('[data-v05-fragments]'))fragmentLibrary();
    else if(el.matches('[data-v05-layout]'))layoutLibrary();
    else if(el.matches('[data-v05-environments]'))environmentManager();
    else if(el.matches('[data-v05-devtools]'))devtools();
  },true);
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&event.key.toLowerCase()==='z'){event.preventDefault();globalThis.InvartureHistory?.undo();}else if((event.ctrlKey||event.metaKey)&&(event.key.toLowerCase()==='y'||(event.shiftKey&&event.key.toLowerCase()==='z'))){event.preventDefault();globalThis.InvartureHistory?.redo();}else if(event.key==='Escape'&&overlayNode)closeOverlay();});
  const observer=new MutationObserver(()=>requestAnimationFrame(decorate));observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('invarture:refresh-data',()=>requestAnimationFrame(decorate));
  decorate();
})();
