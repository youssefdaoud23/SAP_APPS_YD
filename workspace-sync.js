(() => {
  'use strict';

  const STORAGE_KEY = 'invarture-app-studio-v2';
  const API = '/api/workspace';
  let serverEtag = null;

  const style = document.createElement('style');
  style.textContent = `.ws-launch{position:fixed;right:190px;bottom:22px;z-index:900;border:1px solid #d8e0eb;border-radius:14px;background:#fff;color:#25344a;padding:11px 14px;font:700 13px/1 system-ui;box-shadow:0 10px 28px rgba(20,35,55,.16);cursor:pointer}.ws-panel{position:fixed;right:22px;bottom:78px;z-index:1100;width:min(420px,calc(100vw - 28px));background:#fff;border:1px solid #dfe5ee;border-radius:15px;box-shadow:0 20px 60px rgba(13,25,42,.24);padding:15px;font-family:Inter,system-ui,sans-serif;color:#1d2a3a}.ws-panel h3{margin:0 0 6px;font-size:15px}.ws-muted{font-size:12px;color:#6d7a8e;line-height:1.45}.ws-status{margin:11px 0;padding:10px;border-radius:9px;background:#f3f6fa;font-size:12px}.ws-status.ok{background:#eaf7f1;color:#167650}.ws-status.bad{background:#fff0f2;color:#ad3344}.ws-actions{display:flex;gap:8px;flex-wrap:wrap}.ws-btn{border:1px solid #d8e0eb;background:#fff;border-radius:8px;padding:8px 10px;font-weight:700;cursor:pointer}.ws-btn.primary{background:#2473ee;border-color:#2473ee;color:#fff}`;
  document.head.appendChild(style);

  const launch = document.createElement('button');
  launch.className = 'ws-launch';
  launch.textContent = '☁ Server Sync';
  launch.addEventListener('click', openPanel);
  document.body.appendChild(launch);

  async function request(options = {}) {
    const response = await fetch(API, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    if (response.headers.get('etag')) serverEtag = response.headers.get('etag');
    return data;
  }

  async function openPanel() {
    document.getElementById('wsPanel')?.remove();
    const panel = document.createElement('div'); panel.id = 'wsPanel'; panel.className = 'ws-panel';
    panel.innerHTML = `<h3>Server Workspace Sync</h3><div class="ws-muted">Persist the complete App Studio workspace on the Ubuntu server instead of relying only on this browser.</div><div id="wsStatus" class="ws-status">Checking server storage…</div><div class="ws-actions"><button id="wsPull" class="ws-btn">Pull from server</button><button id="wsPush" class="ws-btn primary">Push local workspace</button><button id="wsClose" class="ws-btn">Close</button></div>`;
    document.body.appendChild(panel);
    document.getElementById('wsClose').onclick = () => panel.remove();
    document.getElementById('wsPull').onclick = pull;
    document.getElementById('wsPush').onclick = push;
    await status();
  }

  async function status() {
    const out = document.getElementById('wsStatus');
    try {
      const data = await request();
      if (!data.enabled) {
        out.className = 'ws-status bad';
        out.textContent = 'Server sync is disabled. Set WORKSPACE_FILE in .env.';
        setDisabled(true); return;
      }
      setDisabled(false);
      if (!data.exists) { out.className='ws-status'; out.textContent='Server storage is enabled but no workspace has been saved yet.'; return; }
      out.className = 'ws-status ok';
      out.textContent = `Server workspace available · updated ${data.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'recently'}`;
    } catch (err) {
      out.className='ws-status bad'; out.textContent=`Server sync unavailable: ${err.message}`; setDisabled(true);
    }
  }

  function setDisabled(disabled) {
    const a=document.getElementById('wsPull'),b=document.getElementById('wsPush'); if(a)a.disabled=disabled;if(b)b.disabled=disabled;
  }

  async function pull() {
    const out = document.getElementById('wsStatus');
    try {
      const data = await request();
      if (!data.exists || !data.workspace) return setMessage('No server workspace exists yet.', false);
      if (!confirm('Replace this browser workspace with the server copy?')) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.workspace));
      out.className='ws-status ok'; out.textContent='Pulled successfully. Reloading App Studio…';
      setTimeout(() => location.reload(), 350);
    } catch (err) { setMessage(err.message, true); }
  }

  async function push() {
    let workspace;
    try { workspace = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch {}
    if (!workspace) return setMessage('There is no local workspace to push.', true);
    const out = document.getElementById('wsStatus'); out.className='ws-status'; out.textContent='Saving workspace…';
    try {
      const headers = { 'Content-Type':'application/json' };
      if (serverEtag) headers['If-Match'] = serverEtag;
      const data = await request({ method:'PUT', headers, body:JSON.stringify(workspace) });
      if (data.etag) serverEtag = data.etag;
      setMessage('Workspace saved on the server.', false);
    } catch (err) {
      if (/changed on the server/i.test(err.message)) setMessage(`${err.message} Use Pull first, review the latest state, then push again.`, true);
      else setMessage(err.message, true);
    }
  }

  function setMessage(text, bad) {
    const out = document.getElementById('wsStatus'); if (!out) return;
    out.className = `ws-status ${bad?'bad':'ok'}`; out.textContent = text;
  }
})();
