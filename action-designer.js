(() => {
  'use strict';

  const STORAGE_KEY = 'invarture-app-studio-v2';
  const API = '/api/sap';

  const css = `
    .logic-launch{position:fixed;right:337px;bottom:22px;z-index:900;border:1px solid #d8e0eb;border-radius:14px;background:#fff;color:#25344a;padding:11px 14px;font:700 13px/1 system-ui;box-shadow:0 10px 28px rgba(20,35,55,.16);cursor:pointer}
    .logic-backdrop{position:fixed;inset:0;z-index:1200;background:rgba(10,20,34,.62);display:grid;place-items:center;padding:22px;font-family:Inter,system-ui,sans-serif}
    .logic-modal{width:min(720px,95vw);max-height:90vh;overflow:auto;background:#fff;border-radius:17px;box-shadow:0 28px 80px rgba(0,0,0,.3);color:#1f2b3b}
    .logic-head{height:60px;padding:0 17px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #e1e6ed}.logic-head strong{font-size:16px}.logic-grow{flex:1}
    .logic-body{padding:18px}.logic-field{display:grid;gap:5px;margin-bottom:13px}.logic-field label{font-size:12px;font-weight:750;color:#526077}.logic-field input,.logic-field select,.logic-field textarea{width:100%;border:1px solid #d9e1ec;border-radius:9px;padding:9px 10px;font:13px system-ui;background:#fff}.logic-field textarea{min-height:120px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
    .logic-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}.logic-btn{border:1px solid #d8e0eb;background:#fff;border-radius:9px;padding:8px 11px;font-weight:700;cursor:pointer}.logic-btn.primary{background:#2473ee;color:#fff;border-color:#2473ee}.logic-btn.danger{color:#b63245}.logic-note{background:#f4f8ff;border:1px solid #d9e7ff;color:#365984;border-radius:10px;padding:10px 11px;font-size:12px;line-height:1.5;margin-bottom:14px}.logic-status{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:1500;background:#192637;color:#fff;border-radius:10px;padding:10px 14px;font:600 12px system-ui;box-shadow:0 14px 36px rgba(0,0,0,.25)}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const launch = document.createElement('button');
  launch.className = 'logic-launch'; launch.textContent = '⚡ Logic'; launch.title = 'Configure selected button action';
  launch.addEventListener('click', openDesigner); document.body.appendChild(launch);

  function readState() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } }
  function saveState(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  function selectedContext(s) {
    const app = s?.apps?.find(a => a.id === s.currentAppId);
    const page = app?.pages?.find(p => p.id === s.currentPageId) || app?.pages?.[0];
    const component = page?.components?.find(c => c.id === s.selectedComponentId);
    return { app, page, component };
  }
  function esc(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function attr(v='') { return esc(v); }

  function openDesigner() {
    const s = readState(); const { app, component } = selectedContext(s);
    if (!app || !component || component.type !== 'button') {
      return notify('Select a Button component in App Studio first.');
    }
    const action = component.action || { type:'refresh' };
    const connections = (s.connections || []).filter(c => String(c.id).startsWith('server:'));
    document.getElementById('logicBackdrop')?.remove();
    const el = document.createElement('div'); el.id='logicBackdrop'; el.className='logic-backdrop';
    el.innerHTML = `<div class="logic-modal"><div class="logic-head"><strong>Button Logic · ${esc(component.text || 'Button')}</strong><div class="logic-grow"></div><button class="logic-btn" id="logicClose">Close</button></div><div class="logic-body">
      <div class="logic-note">Actions execute only from the runtime Preview. SAP mutations are sent through the server connector, so SAP credentials stay server-side and CSRF/session handling remains centralized.</div>
      <div class="logic-field"><label>Action</label><select id="logicType">
        ${[['refresh','Refresh SAP data'],['navigate','Navigate to page'],['open-url','Open URL'],['odata-create','OData Create (POST)'],['odata-update','OData Update (PATCH)'],['odata-delete','OData Delete']].map(([v,l])=>`<option value="${v}" ${action.type===v?'selected':''}>${l}</option>`).join('')}
      </select></div>
      <div id="logicFields"></div>
      <div class="logic-actions"><button class="logic-btn danger" id="logicClear">Clear</button><button class="logic-btn primary" id="logicSave">Save action</button></div>
    </div></div>`;
    document.body.appendChild(el);
    document.getElementById('logicClose').onclick=()=>el.remove();
    el.addEventListener('click',e=>{if(e.target===el)el.remove();});
    const type=document.getElementById('logicType'); type.onchange=()=>renderFields(type.value,app,connections,{});
    renderFields(type.value,app,connections,action);
    document.getElementById('logicClear').onclick=()=>{ delete component.action; saveState(s); el.remove(); notify('Button action cleared. Reloading Studio…'); setTimeout(()=>location.reload(),350); };
    document.getElementById('logicSave').onclick=()=>saveAction(s,component,type.value,el);
  }

  function renderFields(type,app,connections,a) {
    const box=document.getElementById('logicFields'); if(!box)return;
    if(type==='refresh'){box.innerHTML='<div class="logic-note">Refreshes all live SAP-bound components on the current page.</div>';return;}
    if(type==='navigate'){
      box.innerHTML=`<div class="logic-field"><label>Destination page</label><select id="logicPage">${app.pages.map(p=>`<option value="${attr(p.id)}" ${a.pageId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>`;return;
    }
    if(type==='open-url'){
      box.innerHTML=`<div class="logic-field"><label>URL</label><input id="logicUrl" value="${attr(a.url||'https://')}" placeholder="https://example.com"></div><div class="logic-field"><label>Target</label><select id="logicTarget"><option value="_blank" ${a.target==='_blank'?'selected':''}>New tab</option><option value="_self" ${a.target==='_self'?'selected':''}>Same tab</option></select></div>`;return;
    }
    const connOptions=connections.length?connections.map(c=>`<option value="${attr(c.id)}" ${a.dataSource===c.id?'selected':''}>${esc(c.name)}</option>`).join(''):'<option value="">No secure server connections imported</option>';
    box.innerHTML=`<div class="logic-field"><label>Server data source</label><select id="logicConnection">${connOptions}</select></div>
      <div class="logic-field"><label>OData path</label><input id="logicPath" value="${attr(a.path||'')}" placeholder="PurchaseOrders or PurchaseOrders(\'4500001\')"></div>
      ${type==='odata-delete'?'':`<div class="logic-field"><label>JSON body</label><textarea id="logicBody" spellcheck="false">${esc(a.body||'{\n  "Field": "Value"\n}')}</textarea></div>`}
      ${type==='odata-update'||type==='odata-delete'?`<div class="logic-field"><label>If-Match (optional)</label><input id="logicIfMatch" value="${attr(a.ifMatch||'')}" placeholder="* or ETag"></div>`:''}`;
  }

  function saveAction(s,c,type,modal) {
    let action={type};
    try {
      if(type==='navigate') action.pageId=document.getElementById('logicPage')?.value||'';
      else if(type==='open-url'){
        action.url=document.getElementById('logicUrl')?.value.trim()||''; action.target=document.getElementById('logicTarget')?.value||'_blank';
        const u=new URL(action.url,location.origin); if(!['http:','https:'].includes(u.protocol)) throw new Error('Only HTTP/HTTPS URLs are allowed.');
      } else if(type.startsWith('odata-')){
        action.dataSource=document.getElementById('logicConnection')?.value||''; action.path=document.getElementById('logicPath')?.value.trim().replace(/^\/+/, '')||'';
        if(!action.dataSource.startsWith('server:')) throw new Error('Choose a secure server connection.');
        if(!action.path) throw new Error('Enter an OData path.');
        if(type!=='odata-delete'){
          const raw=document.getElementById('logicBody')?.value||'{}'; JSON.parse(raw); action.body=raw;
        }
        if(type==='odata-update'||type==='odata-delete') action.ifMatch=document.getElementById('logicIfMatch')?.value.trim()||'';
      }
      c.action=action; c.event=humanLabel(action); saveState(s); modal.remove(); notify('Button action saved. Reloading Studio…'); setTimeout(()=>location.reload(),350);
    } catch(err){ notify(err.message); }
  }

  function humanLabel(a){
    if(a.type==='navigate')return `Navigate to ${a.pageId}`; if(a.type==='refresh')return 'Refresh live data'; if(a.type==='open-url')return `Open ${a.url}`;
    if(a.type.startsWith('odata-'))return `${a.type.replace('odata-','').toUpperCase()} ${a.path}`; return a.type;
  }

  function notify(text){ const n=document.createElement('div');n.className='logic-status';n.textContent=text;document.body.appendChild(n);setTimeout(()=>n.remove(),2600); }

  document.addEventListener('click', async e => {
    const button=e.target.closest?.('[data-runtime-button]'); if(!button)return;
    const s=readState(); if(!s)return;
    const app=s.apps?.find(a=>a.id===s.currentAppId);
    const activeName=document.querySelector('.runtime-preview .runtime-nav button.active')?.textContent?.trim();
    const page=app?.pages?.find(p=>p.name===activeName)||app?.pages?.find(p=>p.id===s.currentPageId)||app?.pages?.[0];
    const c=page?.components?.find(x=>x.id===button.dataset.runtimeButton); const action=c?.action; if(!action)return;
    e.preventDefault(); e.stopImmediatePropagation();
    button.disabled=true;
    try { await execute(action); }
    catch(err){ notify(`Action failed: ${err.message}`); }
    finally{button.disabled=false;}
  }, true);

  async function execute(a){
    if(a.type==='refresh'){ window.dispatchEvent(new CustomEvent('invarture:refresh-data')); return notify('Live SAP data refreshed.'); }
    if(a.type==='navigate'){
      const state=readState();const app=state?.apps?.find(x=>x.id===state.currentAppId);const page=app?.pages?.find(p=>p.id===a.pageId); if(!page)throw new Error('Destination page no longer exists.');
      const b=[...document.querySelectorAll('[data-preview-page]')].find(x=>x.textContent.trim()===page.name); if(!b)throw new Error('Destination page is not available in this preview.'); b.click(); return;
    }
    if(a.type==='open-url'){ window.open(a.url,a.target||'_blank','noopener,noreferrer'); return; }
    if(a.type.startsWith('odata-')){
      const id=String(a.dataSource||'').replace(/^server:/,''); const method={ 'odata-create':'POST','odata-update':'PATCH','odata-delete':'DELETE' }[a.type];
      if(!id||!method)throw new Error('Invalid OData action configuration.');
      const url=new URL(API,location.origin);url.searchParams.set('action','request');url.searchParams.set('id',id);url.searchParams.set('path',a.path||'');
      const headers={Accept:'application/json'}; if(method!=='DELETE')headers['Content-Type']='application/json'; if(a.ifMatch)headers['If-Match']=a.ifMatch;
      const response=await fetch(url,{method,headers,body:method==='DELETE'?undefined:(a.body||'{}')}); const text=await response.text();
      if(!response.ok)throw new Error(text.slice(0,500)||`HTTP ${response.status}`);
      notify(`${method} completed successfully.`); window.dispatchEvent(new CustomEvent('invarture:refresh-data')); return;
    }
  }
})();
