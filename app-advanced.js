(() => {
  'use strict';

  const WORKSPACE_KEY = 'invarture-app-studio-v2';

  function ws() { try { return JSON.parse(localStorage.getItem(WORKSPACE_KEY) || 'null'); } catch { return null; } }
  function save(state, reload = true) { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(state)); if (reload) location.reload(); }
  function esc(v='') { return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function current(state) { const app=state?.apps?.find(a=>a.id===state.currentAppId)||state?.apps?.[0]; const page=app?.pages?.find(p=>p.id===state.currentPageId)||app?.pages?.[0]; const component=page?.components?.find(c=>c.id===state.selectedComponentId)||null; return {app,page,component}; }
  function close(){ document.getElementById('ias-advanced-overlay')?.remove(); }
  function overlay(title, body){ close(); const el=document.createElement('div'); el.id='ias-advanced-overlay'; el.className='ias-overlay'; el.innerHTML=`<div class="ias-modal"><div class="ias-modal-head"><strong>${esc(title)}</strong><div class="grow"></div><button class="btn small icon" data-adv-close>×</button></div><div class="ias-modal-body">${body}</div></div>`; document.body.appendChild(el); }
  function field(label,id,value,type='text'){ return `<div class="ias-field"><label>${esc(label)}</label><input id="${id}" type="${type}" value="${esc(value??'')}"></div>`; }
  function select(label,id,value,options){ return `<div class="ias-field"><label>${esc(label)}</label><select id="${id}">${options.map(([v,l])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select></div>`; }
  function check(label,id,value,help=''){ return `<label class="ias-check"><input id="${id}" type="checkbox" ${value?'checked':''}><span>${esc(label)}${help?`<small>${esc(help)}</small>`:''}</span></label>`; }

  function ensureButtons(){
    const title=document.querySelector('.topbar-title h1')?.textContent?.trim();
    const toolbar=document.querySelector('.studio-toolbar');
    if(title!=='App Studio'||!toolbar||toolbar.querySelector('[data-adv-app-settings]')) return;
    const grow=toolbar.querySelector('.grow'); if(!grow) return;
    const wrap=document.createElement('span'); wrap.style.display='contents'; wrap.innerHTML='<button class="btn small" data-adv-query>Query builder</button><button class="btn small" data-adv-remap>Remap environment</button><button class="btn small" data-adv-app-settings>App settings+</button><span class="divider"></span>';
    toolbar.insertBefore(wrap,grow);
  }

  function appSettings(){
    const state=ws(); const {app}=current(state); if(!app) return;
    const pageOptions=(app.pages||[]).map(p=>[p.id,p.name]);
    overlay(`Advanced settings · ${app.name}`, `
      <div class="ias-settings-grid" style="margin-top:0">
        <section class="ias-card"><h3>Launchpad</h3><p>Metadata used to organize and present the application.</p>
          ${field('Launchpad group','adv-group',app.launchpadGroup||'Business Apps')}
          ${check('Favorite / featured','adv-favorite',!!app.favorite,'Marks this application as important in the registry.')}
          ${check('Hide from overview launchpad','adv-hidden',!!app.hiddenFromLaunchpad,'The app stays editable but is hidden from the Overview recent-app area.')}
        </section>
        <section class="ias-card"><h3>Runtime</h3><p>Defaults for preview and application behavior.</p>
          ${select('Start page','adv-start-page',app.startPageId||app.pages?.[0]?.id||'',pageOptions)}
          ${select('Data mode','adv-data-mode',app.dataMode||'live',[['live','Live backend data'],['mock','Mock / design-time data']])}
          ${select('Navigation','adv-nav',app.runtimeNavigation||'tabs',[['tabs','Page tabs'],['minimal','Minimal'],['hidden','Hidden']])}
          ${field('Runtime accent','adv-accent',app.runtimeAccent||'#2f78ed','color')}
        </section>
      </div>
      <div class="ias-actions"><button class="btn primary" data-adv-save-app>Save advanced settings</button></div>`);
  }

  function saveAppSettings(){
    const state=ws(); const {app}=current(state); if(!app) return;
    app.launchpadGroup=document.getElementById('adv-group')?.value.trim()||'Business Apps';
    app.favorite=!!document.getElementById('adv-favorite')?.checked;
    app.hiddenFromLaunchpad=!!document.getElementById('adv-hidden')?.checked;
    app.startPageId=document.getElementById('adv-start-page')?.value||app.pages?.[0]?.id||'';
    app.dataMode=document.getElementById('adv-data-mode')?.value||'live';
    app.runtimeNavigation=document.getElementById('adv-nav')?.value||'tabs';
    app.runtimeAccent=document.getElementById('adv-accent')?.value||'#2f78ed';
    app.updatedAt=new Date().toISOString(); save(state);
  }

  function parseBinding(binding=''){
    const raw=String(binding||'').replace(/^\//,''); const [base,query='']=raw.split('?'); const params=new URLSearchParams(query);
    return {base,select:params.get('$select')||'',filter:params.get('$filter')||'',orderby:params.get('$orderby')||'',top:params.get('$top')||''};
  }

  function queryBuilder(){
    const state=ws(); const {component}=current(state); if(!component) return overlay('OData query builder','<div class="ias-issue warn">Select a data-bound component first.</div>');
    if(!['table','kpi','input','textarea','date','chart'].includes(component.type)) return overlay('OData query builder','<div class="ias-issue warn">The selected component does not support a data binding.</div>');
    const q=parseBinding(component.binding||'');
    overlay(`OData query · ${component.type}`, `
      <section class="ias-card"><h3>Binding query</h3><p>Build common OData query options without hand-editing the URL.</p>
        ${field('EntitySet / path','adv-q-base',q.base)}
        ${field('$select','adv-q-select',q.select)}
        ${field('$filter','adv-q-filter',q.filter)}
        ${field('$orderby','adv-q-orderby',q.orderby)}
        ${field('$top','adv-q-top',q.top,'number')}
        <div class="ias-field"><label>Preview</label><input id="adv-q-preview" readonly></div>
      </section>
      <div class="ias-actions"><button class="btn primary" data-adv-save-query>Apply query to selected component</button></div>`);
    const ids=['adv-q-base','adv-q-select','adv-q-filter','adv-q-orderby','adv-q-top']; ids.forEach(id=>document.getElementById(id)?.addEventListener('input',refreshQueryPreview)); refreshQueryPreview();
  }

  function buildQuery(){
    const base=(document.getElementById('adv-q-base')?.value||'').trim().replace(/^\/+/, '');
    const params=new URLSearchParams();
    const selectV=document.getElementById('adv-q-select')?.value.trim(); if(selectV) params.set('$select',selectV);
    const filterV=document.getElementById('adv-q-filter')?.value.trim(); if(filterV) params.set('$filter',filterV);
    const orderV=document.getElementById('adv-q-orderby')?.value.trim(); if(orderV) params.set('$orderby',orderV);
    const topV=document.getElementById('adv-q-top')?.value.trim(); if(topV) params.set('$top',topV);
    const query=params.toString().replace(/%24/g,'$').replace(/%2C/gi,',').replace(/%20/g,' ');
    return `${base}${query?'?'+query:''}`;
  }
  function refreshQueryPreview(){ const el=document.getElementById('adv-q-preview'); if(el) el.value='/'+buildQuery(); }
  function saveQuery(){ const state=ws(); const {component,app}=current(state); if(!component) return; component.binding='/'+buildQuery(); app.updatedAt=new Date().toISOString(); save(state); }

  function remapEnvironment(){
    const state=ws(); const {app}=current(state); if(!app) return;
    const connections=(state.connections||[]).filter(c=>String(c.id||'').startsWith('server:'));
    if(connections.length<2) return overlay('Remap environment','<div class="ias-issue warn">Import at least two server connections in Connection Center first, for example DEV and QAS.</div>');
    const used=new Set(); for(const p of app.pages||[]) for(const c of p.components||[]){ if(c.dataSource) used.add(c.dataSource); if(c.logic?.dataSource) used.add(c.logic.dataSource); }
    const options=connections.map(c=>[c.id,c.name||c.id]);
    const source=[...used].find(id=>connections.some(c=>c.id===id))||connections[0].id;
    overlay(`Remap connections · ${app.name}`, `
      <section class="ias-card"><h3>Environment promotion helper</h3><p>Replaces a connection across all component bindings and OData button actions in this application.</p>
        ${select('From connection','adv-remap-from',source,options)}
        ${select('To connection','adv-remap-to',connections.find(c=>c.id!==source)?.id||connections[0].id,options)}
        ${check('Create snapshot first','adv-remap-snapshot',true,'Adds an app version snapshot before changing references.')}
      </section>
      <div class="ias-actions"><button class="btn primary" data-adv-apply-remap>Remap application</button></div>`);
  }

  function applyRemap(){
    const state=ws(); const {app}=current(state); if(!app) return;
    const from=document.getElementById('adv-remap-from')?.value, to=document.getElementById('adv-remap-to')?.value;
    if(!from||!to||from===to) return alert('Choose two different connections.');
    if(document.getElementById('adv-remap-snapshot')?.checked){ app.versions=Array.isArray(app.versions)?app.versions:[]; app.versions.unshift({id:`version-${Date.now().toString(36)}`,createdAt:new Date().toISOString(),note:`Before environment remap ${from} → ${to}`,pages:JSON.parse(JSON.stringify(app.pages))}); }
    let count=0;
    for(const p of app.pages||[]) for(const c of p.components||[]){ if(c.dataSource===from){c.dataSource=to;count++;} if(c.logic?.dataSource===from){c.logic.dataSource=to;count++;} }
    app.updatedAt=new Date().toISOString(); alert(`Remapped ${count} connection reference${count===1?'':'s'}.`); save(state);
  }

  function decorate(){
    const state=ws(); if(!state) return; const title=document.querySelector('.topbar-title h1')?.textContent?.trim();
    document.querySelectorAll('.app-card').forEach(card=>{
      const id=card.querySelector('[data-open-app]')?.dataset.openApp; const app=state.apps?.find(a=>a.id===id); if(!app) return;
      card.querySelectorAll('[data-adv-badge]').forEach(x=>x.remove());
      const meta=card.querySelector('.app-card-meta'); if(meta){ if(app.favorite) meta.insertAdjacentHTML('afterbegin','<span class="tag" data-adv-badge>★ Featured</span>'); if(app.launchpadGroup) meta.insertAdjacentHTML('beforeend',`<span class="tag" data-adv-badge>${esc(app.launchpadGroup)}</span>`); }
      if(title==='Overview'&&app.hiddenFromLaunchpad) card.style.display='none'; else card.style.removeProperty('display');
    });
    const {app}=current(state); if(title==='App Studio'&&app){ document.querySelectorAll('.device-frame,.runtime-preview').forEach(el=>{el.style.setProperty('--blue',app.runtimeAccent||'#2f78ed');el.style.setProperty('--blue-2',app.runtimeAccent||'#2f78ed');}); }
    const preview=document.querySelector('.runtime-preview'); if(preview&&app){ const nav=preview.querySelector('.runtime-nav'); if(nav) nav.style.display=app.runtimeNavigation==='hidden'?'none':''; if(nav&&app.runtimeNavigation==='minimal') nav.querySelectorAll('button:not(.active)').forEach(b=>b.style.display='none'); }
  }

  document.addEventListener('click',e=>{
    const el=e.target.closest?.('[data-adv-close],[data-adv-app-settings],[data-adv-save-app],[data-adv-query],[data-adv-save-query],[data-adv-remap],[data-adv-apply-remap]'); if(!el) return;
    if(el.matches('[data-adv-close]')) close(); else if(el.matches('[data-adv-app-settings]')) appSettings(); else if(el.matches('[data-adv-save-app]')) saveAppSettings(); else if(el.matches('[data-adv-query]')) queryBuilder(); else if(el.matches('[data-adv-save-query]')) saveQuery(); else if(el.matches('[data-adv-remap]')) remapEnvironment(); else if(el.matches('[data-adv-apply-remap]')) applyRemap();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  const observer=new MutationObserver(()=>{ensureButtons();decorate();}); observer.observe(document.body,{childList:true,subtree:true}); ensureButtons();decorate();
})();
