(() => {
  'use strict';

  let overlay = null;
  let connections = [];
  let selected = null;
  let observer = null;
  let scheduled = false;

  function esc(value='') { return String(value == null ? '' : value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function attr(value='') { return esc(value).replace(/`/g,'&#96;'); }

  async function request(url, options={}) {
    const response = await fetch(url,{cache:'no-store',credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    const text=await response.text(); let body={}; try{body=text?JSON.parse(text):{};}catch{body={raw:text};}
    if(!response.ok) throw new Error(body.error||`HTTP ${response.status}`); return body;
  }

  function close(){ overlay?.remove(); overlay=null; selected=null; }

  function shell(body){
    close(); const node=document.createElement('div'); node.className='rfc09-overlay';
    node.innerHTML=`<div class="rfc09-window"><header><div><strong>SAP RFC / BAPI Center</strong><small>Secure server-side HTTP bridge adapter</small></div><span></span><button class="btn small" data-rfc09-close>Close</button></header><main>${body}</main></div>`;
    document.body.appendChild(node); overlay=node; node.querySelector('[data-rfc09-close]')?.addEventListener('click',close); return node;
  }

  async function openCenter(){
    shell('<div class="rfc09-loading">Loading RFC/BAPI connections...</div>');
    try{
      const body=await request('/api/rfc?action=connections'); connections=body.connections||[]; selected=connections[0]||null; render();
    }catch(error){ shell(`<div class="rfc09-error"><strong>RFC/BAPI Center unavailable</strong><p>${esc(error.message)}</p><p>Configure <code>SAP_RFC_CONNECTIONS_JSON</code> on the server.</p></div>`); }
  }

  function connectionItem(connection){return `<button class="rfc09-conn ${selected?.id===connection.id?'active':''}" data-rfc09-select="${attr(connection.id)}"><strong>${esc(connection.name)}</strong><small>${esc(connection.environment||'')} ${connection.production?'· production':''}</small><span>${esc(connection.adapter)}</span></button>`;}

  function render(){
    if(!overlay) return;
    overlay.querySelector('main').innerHTML=`<div class="rfc09-layout"><aside><div class="rfc09-side-head"><strong>Connections</strong><button class="btn small" data-rfc09-reload>Reload</button></div>${connections.map(connectionItem).join('')||'<p>No RFC bridge connections configured.</p>'}</aside><section>${selected?detailHtml(selected):'<div class="rfc09-empty">Select a connection.</div>'}</section></div>`;
    wire();
  }

  function detailHtml(connection){return `<div class="rfc09-detail"><div class="rfc09-title"><div><strong>${esc(connection.name)}</strong><small>${esc(connection.baseUrl)}</small></div><span class="status ${connection.production?'warning':'published'}">${connection.production?'production':'configured'}</span></div><div class="rfc09-note">This connector does not expose SAP credentials to the browser. The server calls an allow-listed HTTP RFC/BAPI bridge. Native SAP NW RFC can be added later as an optional adapter without bloating the default image.</div><div class="rfc09-actions"><button class="btn" data-rfc09-health>Test bridge</button></div><div id="rfc09Health"></div><hr><div class="rfc09-grid"><label>Function / BAPI<input id="rfc09Function" placeholder="BAPI_USER_GET_DETAIL"></label><label>Timeout (ms)<input id="rfc09Timeout" type="number" value="30000" min="1000" max="120000"></label><label class="wide">Parameters JSON<textarea id="rfc09Parameters">{}</textarea></label></div><div class="rfc09-actions"><button class="btn primary" data-rfc09-invoke>Invoke</button></div><pre id="rfc09Result" class="rfc09-code">No invocation yet.</pre></div>`;}

  function wire(){
    overlay.querySelectorAll('[data-rfc09-select]').forEach(button=>button.addEventListener('click',()=>{selected=connections.find(item=>item.id===button.dataset.rfc09Select)||null;render();}));
    overlay.querySelector('[data-rfc09-reload]')?.addEventListener('click',openCenter);
    overlay.querySelector('[data-rfc09-health]')?.addEventListener('click',async()=>{const out=overlay.querySelector('#rfc09Health'); out.innerHTML='<div class="rfc09-status">Testing...</div>'; try{const result=await request(`/api/rfc?action=health&id=${encodeURIComponent(selected.id)}`); out.innerHTML=`<div class="rfc09-status ${result.ok?'ok':'bad'}">${result.ok?'Bridge reachable/configured':'Bridge check failed'}${result.status?` · HTTP ${result.status}`:''}${result.latencyMs!=null?` · ${result.latencyMs} ms`:''}${result.note?`<small>${esc(result.note)}</small>`:''}</div>`;}catch(error){out.innerHTML=`<div class="rfc09-status bad">${esc(error.message)}</div>`;}});
    overlay.querySelector('[data-rfc09-invoke]')?.addEventListener('click',async()=>{const out=overlay.querySelector('#rfc09Result'); try{const parameters=JSON.parse(overlay.querySelector('#rfc09Parameters').value||'{}'); const fn=overlay.querySelector('#rfc09Function').value.trim(); if(!fn) throw new Error('Enter an RFC/BAPI function name.'); out.textContent='Invoking...'; const result=await request(`/api/rfc?action=invoke&id=${encodeURIComponent(selected.id)}`,{method:'POST',body:JSON.stringify({function:fn,parameters,timeoutMs:Number(overlay.querySelector('#rfc09Timeout').value||30000)})}); out.textContent=JSON.stringify(result,null,2);}catch(error){out.textContent=`Error: ${error.message}`;}});
  }

  function injectNav(){
    const nav=document.querySelector('.sidebar .nav'); if(!nav||nav.querySelector('[data-rfc09-nav]')) return;
    const button=document.createElement('button'); button.className='nav-button'; button.dataset.rfc09Nav='true'; button.innerHTML='<span class="nav-icon">ƒ</span><span>RFC / BAPI</span>'; const settings=nav.querySelector('[data-nav="settings"]'); nav.insertBefore(button,settings||null); button.addEventListener('click',openCenter);
  }

  const style=document.createElement('style'); style.textContent=`.rfc09-overlay{position:fixed;inset:0;z-index:16000;background:rgba(10,20,32,.64);backdrop-filter:blur(5px);padding:4vh 3vw;overflow:auto}.rfc09-window{width:min(1180px,96vw);height:min(780px,92vh);margin:auto;background:var(--surface);border-radius:16px;border:1px solid var(--line);box-shadow:var(--shadow-lg);display:grid;grid-template-rows:auto 1fr;overflow:hidden}.rfc09-window>header{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:14px 17px;border-bottom:1px solid var(--line)}.rfc09-window>header>div{display:grid}.rfc09-window>header small{font-size:9px;color:var(--muted)}.rfc09-window>main{overflow:auto}.rfc09-layout{height:100%;display:grid;grid-template-columns:280px 1fr}.rfc09-layout>aside{padding:12px;background:var(--surface-2);border-right:1px solid var(--line);overflow:auto}.rfc09-layout>section{padding:18px;overflow:auto}.rfc09-side-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px}.rfc09-conn{display:grid;width:100%;text-align:left;gap:3px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--text);padding:9px;margin-bottom:6px}.rfc09-conn.active{border-color:var(--blue)}.rfc09-conn small,.rfc09-conn span{font-size:8px;color:var(--muted)}.rfc09-title{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.rfc09-title>div{display:grid}.rfc09-title strong{font-size:17px}.rfc09-title small{font-size:9px;color:var(--muted);margin-top:3px}.rfc09-note{font-size:10px;line-height:1.55;background:var(--surface-2);border:1px solid var(--line);border-radius:9px;padding:10px;margin:14px 0}.rfc09-actions{display:flex;gap:7px;margin:10px 0}.rfc09-grid{display:grid;grid-template-columns:2fr 1fr;gap:10px}.rfc09-grid label{display:grid;gap:5px;font-size:10px;font-weight:700}.rfc09-grid label.wide{grid-column:1/-1}.rfc09-grid input,.rfc09-grid textarea{border:1px solid var(--line-2);border-radius:8px;padding:8px;background:var(--surface);color:var(--text)}.rfc09-grid textarea{min-height:180px;font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}.rfc09-code{background:#111923;color:#d9e4f2;border-radius:9px;padding:11px;min-height:150px;max-height:300px;overflow:auto;font:10px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap}.rfc09-status{padding:9px;border-radius:8px;background:var(--surface-2);font-size:10px}.rfc09-status.ok{color:#176c49;background:#eaf7f0}.rfc09-status.bad{color:#a52b39;background:#fff0f2}.rfc09-status small{display:block;margin-top:4px}.rfc09-loading,.rfc09-error,.rfc09-empty{text-align:center;padding:60px 20px;color:var(--muted)}.rfc09-error strong{color:var(--red)}@media(max-width:800px){.rfc09-overlay{padding:0}.rfc09-window{width:100%;height:100%;border-radius:0}.rfc09-layout{grid-template-columns:1fr}.rfc09-layout>aside{max-height:210px;border-right:0;border-bottom:1px solid var(--line)}.rfc09-grid{grid-template-columns:1fr}.rfc09-grid label.wide{grid-column:auto}}`; document.head.appendChild(style);

  function decorate(){injectNav();}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;decorate();});}
  observer=new MutationObserver(schedule); observer.observe(document.body,{childList:true,subtree:true}); schedule();
})();
