(() => {
  'use strict';

  const WORKSPACE_KEY = 'invarture-app-studio-v2';
  let overlay = null;
  let observer = null;
  let scheduled = false;

  function esc(value='') { return String(value == null ? '' : value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function attr(value='') { return esc(value).replace(/`/g,'&#96;'); }
  function workspace(){ try{return JSON.parse(localStorage.getItem(WORKSPACE_KEY)||'{}');}catch{return {};} }
  async function api(url,options={}){ const response=await fetch(url,{cache:'no-store',credentials:'same-origin',...options,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}}); const body=await response.json().catch(()=>({})); if(!response.ok) throw new Error(body.error||`HTTP ${response.status}`); return body; }
  function close(){overlay?.remove();overlay=null;}
  function toast(message,type='info'){let stack=document.getElementById('release09Toasts');if(!stack){stack=document.createElement('div');stack.id='release09Toasts';stack.className='toast-stack';document.body.appendChild(stack);}const item=document.createElement('div');item.className=`toast ${type}`;item.textContent=message;stack.appendChild(item);setTimeout(()=>item.remove(),3200);}

  async function loadData(){
    const [status, approvals, envs, history] = await Promise.all([
      api('/api/release-approvals?action=status'),
      api('/api/release-approvals?action=list&limit=200'),
      api('/api/deployments?action=environments'),
      api('/api/deployments?action=history&limit=250')
    ]);
    return {status,approvals:approvals.approvals||[],environments:envs.environments||[],history:history.deployments||[]};
  }

  function approvalRow(item){
    const canDecide=item.status==='requested';
    return `<div class="rel09-row"><div><span class="status ${esc(item.status)}">${esc(item.status)}</span><strong>${esc(item.action)} · ${esc(item.targetEnvironmentKey)}</strong><small>${esc(item.appName||item.appId)}</small></div><div><strong>${esc(item.requestedBy)}</strong><small>${esc(new Date(item.requestedAt).toLocaleString())}</small></div><div class="rel09-check">${esc(String(item.snapshotChecksum||'').slice(0,12))}</div><div><small>${esc(item.reason||'No reason supplied')}</small></div><div class="rel09-actions">${canDecide?`<button class="btn small primary" data-rel09-approve="${attr(item.id)}">Approve</button><button class="btn small danger" data-rel09-reject="${attr(item.id)}">Reject</button>`:''}</div></div>`;
  }

  function deploymentOption(item){return `<option value="${attr(item.id)}">${esc(item.environmentKey)} · ${esc(item.appName)} · ${esc(item.versionLabel||item.action)} · ${esc(String(item.checksum||'').slice(0,8))}</option>`;}

  async function open(){
    try{
      const data=await loadData();
      const ws=workspace();
      const apps=(ws.apps||[]).filter(app=>app.status==='published');
      const protectedEnvs=data.environments.filter(env=>env.protected);
      close(); const node=document.createElement('div'); node.className='rel09-overlay';
      node.innerHTML=`<div class="rel09-window"><header><div><strong>Release Center</strong><small>Four-eyes approvals, protected environments and immutable release comparison</small></div><span></span><button class="btn small" data-rel09-refresh>Refresh</button><button class="btn small" data-rel09-close>Close</button></header><main>
        <section class="rel09-banner ${data.status.enabled?'enabled':'disabled'}"><div><strong>Protected release approvals ${data.status.enabled?'enabled':'not enforced in this auth mode'}</strong><p>${data.status.enabled?'Deployments to protected environments require an approval tied to the exact release checksum.':'Local development stays frictionless. Set RELEASE_APPROVALS_ENABLED=true to test four-eyes governance locally.'}</p></div><span>${data.status.selfApprovalAllowed?'Self approval allowed':'Four-eyes'}</span></section>
        <section class="rel09-section"><div class="rel09-head"><div><strong>Request approval</strong><small>Create an approval request before deploy, promote or rollback to a protected environment.</small></div></div><div class="rel09-request-grid">
          <label>Action<select id="rel09Action"><option value="deploy">Deploy current published app</option><option value="promote">Promote deployment</option><option value="rollback">Rollback deployment</option></select></label>
          <label data-rel09-app-field>Application<select id="rel09App">${apps.map(app=>`<option value="${attr(app.id)}">${esc(app.name)}</option>`).join('')}</select></label>
          <label data-rel09-source-field style="display:none">Source deployment<select id="rel09Source">${data.history.map(deploymentOption).join('')}</select></label>
          <label data-rel09-target-field>Target environment<select id="rel09Target">${protectedEnvs.map(env=>`<option value="${attr(env.key)}">${esc(env.key)} · ${esc(env.name)}</option>`).join('')}</select></label>
          <label class="wide">Reason<input id="rel09Reason" placeholder="Business reason, change ticket or release reference"></label>
          <button class="btn primary" data-rel09-request>Request approval</button>
        </div></section>
        <section class="rel09-section"><div class="rel09-head"><div><strong>Approval queue</strong><small>${data.approvals.length} recent approval records</small></div><select id="rel09Filter"><option value="">All statuses</option><option value="requested">Requested</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="consumed">Consumed</option></select></div><div class="rel09-list">${data.approvals.map(approvalRow).join('')||'<p>No release approvals yet.</p>'}</div></section>
        <section class="rel09-section"><div class="rel09-head"><div><strong>Compare immutable deployments</strong><small>Review structural changes before promotion.</small></div></div><div class="rel09-compare-controls"><label>From<select id="rel09From">${data.history.map(deploymentOption).join('')}</select></label><label>To<select id="rel09To">${data.history.map(deploymentOption).join('')}</select></label><button class="btn" data-rel09-compare>Compare</button></div><div id="rel09Diff"></div></section>
      </main></div>`;
      document.body.appendChild(node); overlay=node; wire(data);
    }catch(error){ toast(error.message,'error'); }
  }

  function wire(data){
    overlay.querySelector('[data-rel09-close]')?.addEventListener('click',close);
    overlay.querySelector('[data-rel09-refresh]')?.addEventListener('click',open);
    const action=overlay.querySelector('#rel09Action');
    const syncFields=()=>{const value=action.value;overlay.querySelector('[data-rel09-app-field]').style.display=value==='deploy'?'':'none';overlay.querySelector('[data-rel09-source-field]').style.display=value==='deploy'?'none':'';overlay.querySelector('[data-rel09-target-field]').style.display=value==='rollback'?'none':'';};
    action.addEventListener('change',syncFields);syncFields();
    overlay.querySelector('[data-rel09-request]')?.addEventListener('click',()=>requestApproval(data));
    overlay.querySelectorAll('[data-rel09-approve]').forEach(button=>button.addEventListener('click',()=>decide(button.dataset.rel09Approve,'approve')));
    overlay.querySelectorAll('[data-rel09-reject]').forEach(button=>button.addEventListener('click',()=>decide(button.dataset.rel09Reject,'reject')));
    overlay.querySelector('#rel09Filter')?.addEventListener('change',event=>{const filter=event.target.value;overlay.querySelectorAll('.rel09-row').forEach(row=>{row.style.display=!filter||row.querySelector('.status')?.textContent.trim()===filter?'':'none';});});
    overlay.querySelector('[data-rel09-compare]')?.addEventListener('click',compare);
  }

  async function requestApproval(data){
    try{
      const action=overlay.querySelector('#rel09Action').value;
      const reason=overlay.querySelector('#rel09Reason').value.trim();
      let payload={action,reason};
      if(action==='deploy'){
        const appId=overlay.querySelector('#rel09App').value; const app=(workspace().apps||[]).find(item=>item.id===appId); if(!app) throw new Error('Select a published application.');
        payload={...payload,application:app,environmentKey:overlay.querySelector('#rel09Target').value};
      }else{
        payload={...payload,deploymentId:overlay.querySelector('#rel09Source').value};
        if(action==='promote') payload.targetEnvironmentKey=overlay.querySelector('#rel09Target').value;
      }
      await api('/api/release-approvals?action=request',{method:'POST',body:JSON.stringify(payload)}); toast('Release approval requested','success'); await open();
    }catch(error){toast(error.message,'error');}
  }

  async function decide(id,decision){
    const note=prompt(`${decision==='approve'?'Approval':'Rejection'} note (optional):`,'') ?? null; if(note===null)return;
    try{await api(`/api/release-approvals?action=${decision}`,{method:'POST',body:JSON.stringify({id,note})});toast(`Release ${decision}d`,'success');await open();}catch(error){toast(error.message,'error');}
  }

  async function compare(){
    const out=overlay.querySelector('#rel09Diff');
    try{const from=overlay.querySelector('#rel09From').value,to=overlay.querySelector('#rel09To').value;if(!from||!to)throw new Error('Select two deployments.');out.innerHTML='<p>Comparing...</p>';const result=await api(`/api/releases?action=compare&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);const diff=result.diff;out.innerHTML=`<div class="rel09-summary"><div><strong>${diff.totalChanges}</strong><span>Total changes</span></div><div><strong>${diff.counts.added||0}</strong><span>Added</span></div><div><strong>${diff.counts.changed||0}</strong><span>Changed</span></div><div><strong>${diff.counts.removed||0}</strong><span>Removed</span></div></div><div class="rel09-diff-list">${(diff.changes||[]).slice(0,300).map(change=>`<div><span class="rel09-kind ${esc(change.kind)}">${esc(change.kind)}</span><code>${esc(change.path)}</code><small>${esc(change.category)}</small><pre>${esc(JSON.stringify(change.before))} → ${esc(JSON.stringify(change.after))}</pre></div>`).join('')||'<p>No structural changes. Checksums represent equivalent application snapshots.</p>'}${diff.truncated?'<p>Comparison was truncated by the server limit.</p>':''}</div>`;}catch(error){out.innerHTML=`<div class="rel09-error">${esc(error.message)}</div>`;}
  }

  function injectNav(){const nav=document.querySelector('.sidebar .nav');if(!nav||nav.querySelector('[data-rel09-nav]'))return;const button=document.createElement('button');button.className='nav-button';button.dataset.rel09Nav='true';button.innerHTML='<span class="nav-icon">⇄</span><span>Releases</span>';const settings=nav.querySelector('[data-nav="settings"]');nav.insertBefore(button,settings||null);button.addEventListener('click',open);}
  const style=document.createElement('style');style.textContent=`.rel09-overlay{position:fixed;inset:0;z-index:17000;background:rgba(9,18,30,.68);backdrop-filter:blur(5px);padding:3vh 3vw;overflow:auto}.rel09-window{width:min(1320px,97vw);max-height:94vh;margin:auto;background:var(--surface);border:1px solid var(--line);border-radius:17px;box-shadow:var(--shadow-lg);display:grid;grid-template-rows:auto 1fr;overflow:hidden}.rel09-window>header{display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:8px;padding:14px 17px;border-bottom:1px solid var(--line)}.rel09-window>header>div{display:grid}.rel09-window>header small{font-size:9px;color:var(--muted)}.rel09-window>main{padding:16px;overflow:auto;display:grid;gap:12px}.rel09-banner{display:flex;justify-content:space-between;gap:12px;border-radius:11px;padding:12px;border:1px solid var(--line)}.rel09-banner.enabled{background:#eaf7f0;border-color:#c9ead8}.rel09-banner.disabled{background:var(--surface-2)}.rel09-banner strong{font-size:11px}.rel09-banner p{font-size:9px;margin:4px 0 0;color:var(--muted)}.rel09-banner>span{white-space:nowrap;font-size:9px;font-weight:800}.rel09-section{border:1px solid var(--line);border-radius:11px;padding:13px}.rel09-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}.rel09-head>div{display:grid}.rel09-head small{font-size:9px;color:var(--muted)}.rel09-request-grid{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end}.rel09-request-grid label,.rel09-compare-controls label{display:grid;gap:4px;font-size:9px;font-weight:700}.rel09-request-grid .wide{grid-column:1/-2}.rel09-request-grid input,.rel09-request-grid select,.rel09-compare-controls select,.rel09-head select{border:1px solid var(--line-2);border-radius:7px;background:var(--surface);color:var(--text);padding:7px}.rel09-list{overflow:auto}.rel09-row{display:grid;grid-template-columns:1.3fr .9fr .65fr 1.2fr auto;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line);min-width:850px;font-size:9px}.rel09-row>div{display:grid;gap:3px}.rel09-row small{color:var(--muted)}.rel09-check{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.rel09-actions{display:flex!important;grid-auto-flow:column;gap:5px}.rel09-compare-controls{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end}.rel09-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.rel09-summary>div{border:1px solid var(--line);border-radius:9px;padding:9px;text-align:center}.rel09-summary strong{display:block;font-size:18px}.rel09-summary span{font-size:8px;color:var(--muted)}.rel09-diff-list{max-height:330px;overflow:auto;border:1px solid var(--line);border-radius:9px}.rel09-diff-list>div{display:grid;grid-template-columns:65px minmax(180px,1fr) 80px;gap:8px;padding:7px 9px;border-bottom:1px solid var(--line);font-size:9px}.rel09-diff-list pre{grid-column:2/-1;margin:0;white-space:pre-wrap;font:8px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--muted)}.rel09-kind{font-weight:800;text-transform:uppercase;font-size:8px}.rel09-kind.added{color:#18724a}.rel09-kind.removed{color:#a52b39}.rel09-kind.changed{color:#8a5b00}.rel09-error{padding:9px;background:#fff0f2;color:#a52b39;border-radius:8px;margin-top:10px}@media(max-width:850px){.rel09-overlay{padding:0}.rel09-window{width:100%;max-height:100vh;height:100vh;border-radius:0}.rel09-request-grid,.rel09-compare-controls{grid-template-columns:1fr}.rel09-request-grid .wide{grid-column:auto}.rel09-summary{grid-template-columns:1fr 1fr}}`;document.head.appendChild(style);
  function decorate(){injectNav();}function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;decorate();});}observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});schedule();
})();
