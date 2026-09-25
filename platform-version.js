(() => {
  'use strict';

  const FALLBACK_VERSION = '0.8.0';
  let buildInfo = null;
  let loading = false;
  let applyQueued = false;

  function esc(v = '') {
    return String(v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function injectStyle() {
    if (document.getElementById('ias-build-info-style')) return;
    const style = document.createElement('style');
    style.id = 'ias-build-info-style';
    style.textContent = `
      .ias-build-info-trigger{cursor:pointer!important;user-select:none}
      .workspace-card.ias-build-info-trigger{transition:.15s ease}
      .workspace-card.ias-build-info-trigger:hover{background:rgba(255,255,255,.09);border-color:rgba(114,167,255,.45)}
      .ias-build-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#32d583;margin-right:5px;box-shadow:0 0 0 3px rgba(50,213,131,.12)}
      .ias-build-backdrop{position:fixed;inset:0;z-index:20000;background:rgba(10,20,34,.62);backdrop-filter:blur(4px);display:grid;place-items:center;padding:18px}
      .ias-build-modal{width:min(650px,96vw);background:var(--surface,#fff);color:var(--text,#1d2939);border:1px solid var(--line,#dfe6ef);border-radius:16px;box-shadow:0 28px 80px rgba(0,0,0,.28);overflow:hidden}
      .ias-build-head{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--line,#dfe6ef)}
      .ias-build-head strong{font-size:16px}.ias-build-grow{flex:1}
      .ias-build-body{padding:18px;display:grid;gap:10px}
      .ias-build-row{display:grid;grid-template-columns:150px minmax(0,1fr);gap:12px;padding:9px 10px;border:1px solid var(--line,#dfe6ef);border-radius:9px;background:var(--surface-2,#f9fbfe);font-size:12px}
      .ias-build-row span:first-child{color:var(--muted,#667085);font-weight:700}.ias-build-row code{overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px}
      .ias-build-note{font-size:11px;line-height:1.55;color:var(--muted,#667085);padding:10px 11px;background:var(--surface-2,#f9fbfe);border-radius:9px}
      .ias-build-actions{display:flex;gap:8px;justify-content:flex-end;padding:0 18px 18px}
      @media(max-width:600px){.ias-build-row{grid-template-columns:1fr;gap:4px}}
    `;
    document.head.appendChild(style);
  }

  function versionText() {
    const version = buildInfo?.version || FALLBACK_VERSION;
    const short = buildInfo?.shortCommit;
    return short ? `v${version} · ${short}` : `v${version}`;
  }

  function apply() {
    injectStyle();
    const currentVersion = buildInfo?.version || FALLBACK_VERSION;
    document.documentElement.dataset.iasVersion = currentVersion;
    if (buildInfo?.shortCommit) document.documentElement.dataset.iasCommit = buildInfo.shortCommit;

    const label = versionText();
    document.querySelectorAll('.workspace-card').forEach(card => {
      card.classList.add('ias-build-info-trigger');
      card.title = 'Click to view running build details';
      const span = card.querySelector('span');
      const marker = `${label}|workspace`;
      if (span && span.dataset.iasBuildMarker !== marker) {
        span.dataset.iasBuildMarker = marker;
        span.innerHTML = `<span class="ias-build-dot"></span>${esc(label)} · Running build`;
      }
    });

    document.querySelectorAll('.topbar .pill').forEach(pill => {
      pill.classList.add('ias-build-info-trigger');
      pill.title = 'Running build. Click for commit details.';
      const marker = `${label}|topbar`;
      if (pill.dataset.iasBuildMarker !== marker) {
        pill.dataset.iasBuildMarker = marker;
        pill.textContent = label;
      }
    });
  }

  function scheduleApply() {
    if (applyQueued) return;
    applyQueued = true;
    requestAnimationFrame(() => {
      applyQueued = false;
      apply();
    });
  }

  async function loadBuildInfo() {
    if (loading) return;
    loading = true;
    try {
      const response = await fetch(`/api/version?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      buildInfo = await response.json();
      window.InvartureBuildInfo = Object.freeze({ ...buildInfo });
      window.dispatchEvent(new CustomEvent('invarture:build-info', { detail: buildInfo }));
    } catch (error) {
      buildInfo = { version: FALLBACK_VERSION, shortCommit: null, commit: null, commitSource: 'client-fallback', error: error.message };
    } finally {
      loading = false;
      apply();
    }
  }

  function closeModal() {
    document.getElementById('iasBuildInfoModal')?.remove();
  }

  function showModal() {
    closeModal();
    const info = buildInfo || { version: FALLBACK_VERSION };
    const modal = document.createElement('div');
    modal.id = 'iasBuildInfoModal';
    modal.className = 'ias-build-backdrop';
    const commit = info.commit || 'Unavailable';
    const builtAt = info.builtAt ? new Date(info.builtAt).toLocaleString() : 'Direct runtime / not stamped';
    modal.innerHTML = `<div class="ias-build-modal" role="dialog" aria-modal="true" aria-label="Build information">
      <div class="ias-build-head"><span class="ias-build-dot"></span><strong>Running build</strong><div class="ias-build-grow"></div><button class="btn small" data-build-close>Close</button></div>
      <div class="ias-build-body">
        <div class="ias-build-row"><span>Product version</span><code>v${esc(info.version || FALLBACK_VERSION)}</code></div>
        <div class="ias-build-row"><span>Build fingerprint</span><code>${esc(info.fingerprint || versionText())}</code></div>
        <div class="ias-build-row"><span>Git commit</span><code>${esc(commit)}</code></div>
        <div class="ias-build-row"><span>Commit source</span><code>${esc(info.commitSource || 'unknown')}</code></div>
        <div class="ias-build-row"><span>Built at</span><code>${esc(builtAt)}</code></div>
        <div class="ias-build-row"><span>Server environment</span><code>${esc(info.environment || 'unknown')}</code></div>
        <div class="ias-build-row"><span>Node runtime</span><code>${esc(info.node || 'unknown')}</code></div>
        <div class="ias-build-note">For Docker, App Studio listens on port <code>8081</code> inside the container and is exposed as <code>localhost:8081</code>. To verify the running code, compare this commit with <code>git rev-parse --short=8 HEAD</code>.</div>
      </div>
      <div class="ias-build-actions"><button class="btn" data-build-refresh>Refresh build info</button><button class="btn primary" data-build-copy>Copy fingerprint</button></div>
    </div>`;
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
    document.body.appendChild(modal);
  }

  document.addEventListener('click', async event => {
    if (event.target.closest('.ias-build-info-trigger')) showModal();
    if (event.target.closest('[data-build-close]')) closeModal();
    if (event.target.closest('[data-build-refresh]')) { await loadBuildInfo(); showModal(); }
    if (event.target.closest('[data-build-copy]')) {
      const text = buildInfo?.fingerprint || versionText();
      try { await navigator.clipboard.writeText(text); event.target.textContent = 'Copied'; }
      catch { window.prompt('Copy build fingerprint', text); }
    }
  });

  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, { childList: true, subtree: true });
  apply();
  loadBuildInfo();
})();
