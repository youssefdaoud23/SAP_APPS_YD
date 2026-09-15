(() => {
  'use strict';

  const STORAGE_KEY = 'invarture-app-studio-v2';
  const API = '/api/workspace';
  let serverEtag = null;
  let serverRevision = null;
  let serverStorage = null;

  const style = document.createElement('style');
  style.textContent = `.ws-launch{position:fixed;right:190px;bottom:22px;z-index:900;border:1px solid #d8e0eb;border-radius:14px;background:#fff;color:#25344a;padding:11px 14px;font:700 13px/1 system-ui;box-shadow:0 10px 28px rgba(20,35,55,.16);cursor:pointer}.ws-panel{position:fixed;right:22px;bottom:78px;z-index:1100;width:min(440px,calc(100vw - 28px));background:#fff;border:1px solid #dfe5ee;border-radius:15px;box-shadow:0 20px 60px rgba(13,25,42,.24);padding:15px;font-family:Inter,system-ui,sans-serif;color:#1d2a3a}.ws-panel h3{margin:0 0 6px;font-size:15px}.ws-muted{font-size:12px;color:#6d7a8e;line-height:1.45}.ws-status{margin:11px 0;padding:10px;border-radius:9px;background:#f3f6fa;font-size:12px}.ws-status.ok{background:#eaf7f1;color:#167650}.ws-status.bad{background:#fff0f2;color:#ad3344}.ws-actions{display:flex;gap:8px;flex-wrap:wrap}.ws-btn{border:1px solid #d8e0eb;background:#fff;border-radius:8px;padding:8px 10px;font-weight:700;cursor:pointer}.ws-btn.primary{background:#2473ee;border-color:#2473ee;color:#fff}.ws-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.ws-chip{font-size:10px;font-weight:800;padding:4px 7px;border-radius:999px;background:#edf2f8;color:#46566d}`;
  document.head.appendChild(style);

  const launch = document.createElement('button');
  launch.className = 'ws-launch';
  launch.textContent = '☁ Server Sync';
  launch.addEventListener('click', openPanel);
  document.body.appendChild(launch);

  async function request(options = {}) {
    const response = await fetch(API, { cache: 'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    if (response.headers.get('etag')) serverEtag = response.headers.get('etag');
    const revisionHeader = response.headers.get('x-workspace-revision');
    if (revisionHeader != null && revisionHeader !== '') serverRevision = Number(revisionHeader);
    if (data.revision != null) serverRevision = Number(data.revision);
    if (data.storage) serverStorage = data.storage;
    return data;
  }

  function metaHtml() {
    const storage = serverStorage === 'postgres' ? 'PostgreSQL' : serverStorage === 'file' ? 'File storage' : 'Unknown storage';
    const revision = serverRevision != null ? `Revision ${serverRevision}` : 'ETag locking';
    return `<div class="ws-meta"><span class="ws-chip">${storage}</span><span class="ws-chip">${revision}</span></div>`;
  }

  async function openPanel() {
    document.getElementById('wsPanel')?.remove();
    const panel = document.createElement('div');
    panel.id = 'wsPanel';
    panel.className = 'ws-panel';
    panel.innerHTML = `<h3>Shared Workspace Sync</h3><div class="ws-muted">Synchronize the complete App Studio workspace with the shared server store. V0.6 uses optimistic locking so a stale browser cannot silently overwrite a newer revision.</div><div id="wsStatus" class="ws-status">Checking shared storage…</div><div class="ws-actions"><button id="wsPull" class="ws-btn">Pull latest</button><button id="wsPush" class="ws-btn primary">Push local workspace</button><button id="wsClose" class="ws-btn">Close</button></div>`;
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
        out.innerHTML = `Shared workspace storage is disabled.${metaHtml()}`;
        setDisabled(true);
        return;
      }
      setDisabled(false);
      if (!data.exists) {
        out.className = 'ws-status';
        out.innerHTML = `Shared storage is ready but no workspace has been saved yet.${metaHtml()}`;
        return;
      }
      out.className = 'ws-status ok';
      out.innerHTML = `Shared workspace available · updated ${data.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'recently'}${metaHtml()}`;
    } catch (error) {
      out.className = 'ws-status bad';
      out.textContent = `Shared workspace unavailable: ${error.message}`;
      setDisabled(true);
    }
  }

  function setDisabled(disabled) {
    const pullButton = document.getElementById('wsPull');
    const pushButton = document.getElementById('wsPush');
    if (pullButton) pullButton.disabled = disabled;
    if (pushButton) pushButton.disabled = disabled;
  }

  async function pull() {
    try {
      const data = await request();
      if (!data.exists || !data.workspace) return setMessage('No shared workspace exists yet.', false);
      if (!confirm(`Replace this browser workspace with shared revision ${data.revision ?? 'latest'}?`)) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.workspace));
      setMessage(`Pulled revision ${data.revision ?? 'latest'} successfully. Reloading App Studio…`, false);
      setTimeout(() => location.reload(), 350);
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function push() {
    let workspace;
    try { workspace = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch {}
    if (!workspace) return setMessage('There is no local workspace to push.', true);
    const out = document.getElementById('wsStatus');
    out.className = 'ws-status';
    out.textContent = 'Saving shared workspace…';
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (serverEtag) headers['If-Match'] = serverEtag;
      const data = await request({ method: 'PUT', headers, body: JSON.stringify(workspace) });
      if (data.etag) serverEtag = data.etag;
      if (data.revision != null) serverRevision = Number(data.revision);
      if (data.storage) serverStorage = data.storage;
      setMessage(`Workspace saved${serverRevision != null ? ` as revision ${serverRevision}` : ''}.`, false, true);
    } catch (error) {
      if (/changed on the server/i.test(error.message)) setMessage(`${error.message} Pull the latest revision, review it, then push again.`, true);
      else setMessage(error.message, true);
    }
  }

  function setMessage(text, bad, includeMeta = false) {
    const out = document.getElementById('wsStatus');
    if (!out) return;
    out.className = `ws-status ${bad ? 'bad' : 'ok'}`;
    if (includeMeta) out.innerHTML = `${text}${metaHtml()}`;
    else out.textContent = text;
  }
})();
