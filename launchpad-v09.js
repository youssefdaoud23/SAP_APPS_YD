(() => {
  'use strict';

  const WORKSPACE_KEY = 'invarture-app-studio-v2';
  const RECENT_KEY = 'invarture-launchpad-recent-v1';
  const LAUNCH_KEY = 'invarture-launchpad-pending-launch';
  let overlay = null;
  let principal = null;
  let canEdit = false;
  let observer = null;
  let scheduled = false;

  function esc(value = '') {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function attr(value = '') { return esc(value).replace(/`/g, '&#96;'); }

  function ws() {
    try { return JSON.parse(localStorage.getItem(WORKSPACE_KEY) || 'null'); }
    catch { return null; }
  }

  function save(state) { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(state)); }

  function recentIds() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
    catch { return []; }
  }

  function remember(appId) {
    const next = [appId, ...recentIds().filter(id => id !== appId)].slice(0, 12);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  }

  async function platformPrincipal() {
    try {
      const response = await fetch('/api/platform', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return null;
      const body = await response.json();
      return body.security?.principal || null;
    } catch { return null; }
  }

  function close() { overlay?.remove(); overlay = null; }

  function allowed(app) {
    const roles = Array.isArray(app.allowedRoles) ? app.allowedRoles.filter(Boolean) : [];
    if (!roles.length) return true;
    if (!principal) return false;
    if (principal.permissions?.includes('platform.admin')) return true;
    return roles.some(role => principal.roles?.includes(role));
  }

  function visibleApps(state) {
    return (state?.apps || []).filter(app => app.status === 'published' && !app.hiddenFromLaunchpad && allowed(app));
  }

  function tile(app) {
    const kpi = app.tileKpi ? `<div class="v09-launch-kpi"><strong>${esc(app.tileKpi)}</strong><span>${esc(app.tileKpiLabel || '')}</span></div>` : '';
    return `<article class="v09-launch-tile ${app.favorite?'favorite':''}" data-launch-app="${attr(app.id)}">
      <button class="v09-launch-main" data-v09-launch="${attr(app.id)}">
        <div class="v09-launch-icon">${esc(app.icon || 'AP')}</div>
        <div class="v09-launch-copy"><strong>${esc(app.tileTitle || app.name)}</strong><p>${esc(app.tileSubtitle || app.description || '')}</p><small>${esc(app.launchpadGroup || 'Business Apps')}</small></div>
        ${kpi}
      </button>
      ${canEdit?`<button class="v09-launch-manage" title="Launchpad settings" data-v09-launch-manage="${attr(app.id)}">⚙</button>`:''}
      ${app.favorite?'<span class="v09-launch-star">★</span>':''}
    </article>`;
  }

  function groupHtml(name, apps) {
    return `<section class="v09-launch-group"><header><div><strong>${esc(name)}</strong><small>${apps.length} application${apps.length===1?'':'s'}</small></div></header><div class="v09-launch-grid">${apps.map(tile).join('')}</div></section>`;
  }

  async function showLaunchpad() {
    principal = await platformPrincipal();
    canEdit = Boolean(principal?.permissions?.includes('platform.admin') || principal?.permissions?.includes('apps.edit'));
    const state = ws();
    const apps = visibleApps(state);
    const queryGroups = {};
    apps.forEach(app => (queryGroups[app.launchpadGroup || 'Business Apps'] ||= []).push(app));
    Object.values(queryGroups).forEach(group => group.sort((a,b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || String(a.name).localeCompare(String(b.name))));
    const recent = recentIds().map(id => apps.find(app => app.id === id)).filter(Boolean).slice(0,6);

    close();
    const node = document.createElement('div');
    node.className = 'v09-launch-overlay';
    node.innerHTML = `<div class="v09-launch-shell">
      <header><div class="v09-launch-brand"><div class="v09-launch-logo">I</div><div><strong>Invarture Launchpad</strong><small>${esc(principal?.username || 'Business applications')}</small></div></div><div class="v09-launch-search"><span>⌕</span><input placeholder="Search applications" data-v09-launch-search></div><button class="btn small" data-v09-launch-close>Close</button></header>
      <main>${recent.length?`<section class="v09-launch-recent"><header><strong>Recently used</strong></header><div>${recent.map(app=>`<button data-v09-launch="${attr(app.id)}"><span>${esc(app.icon||'AP')}</span><strong>${esc(app.name)}</strong></button>`).join('')}</div></section>`:''}<div data-v09-launch-groups>${Object.entries(queryGroups).map(([name,group])=>groupHtml(name,group)).join('') || '<div class="v09-launch-empty"><div>▦</div><strong>No applications available</strong><p>Publish an application and grant your role access to make it appear here.</p></div>'}</div></main>
    </div>`;
    document.body.appendChild(node); overlay = node;
    node.querySelector('[data-v09-launch-close]')?.addEventListener('click', close);
    node.querySelectorAll('[data-v09-launch]').forEach(button => button.addEventListener('click', () => launch(button.dataset.v09Launch)));
    node.querySelectorAll('[data-v09-launch-manage]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); manageApp(button.dataset.v09LaunchManage); }));
    node.querySelector('[data-v09-launch-search]')?.addEventListener('input', event => filterTiles(event.target.value));
  }

  function filterTiles(value) {
    const q = String(value || '').trim().toLowerCase();
    overlay?.querySelectorAll('[data-launch-app]').forEach(tileNode => {
      const app = ws()?.apps?.find(item => item.id === tileNode.dataset.launchApp);
      const haystack = [app?.name, app?.description, app?.launchpadGroup, ...(app?.tags || [])].join(' ').toLowerCase();
      tileNode.style.display = !q || haystack.includes(q) ? '' : 'none';
    });
    overlay?.querySelectorAll('.v09-launch-group').forEach(group => {
      const visible = Array.from(group.querySelectorAll('[data-launch-app]')).some(node => node.style.display !== 'none');
      group.style.display = visible ? '' : 'none';
    });
  }

  function launch(appId) {
    const state = ws();
    const app = state?.apps?.find(item => item.id === appId);
    if (!app) return;
    remember(appId);
    state.currentAppId = appId;
    state.currentPageId = app.startPageId || app.pages?.[0]?.id || null;
    state.view = 'apps';
    save(state);
    sessionStorage.setItem(LAUNCH_KEY, appId);
    location.reload();
  }

  function consumePendingLaunch() {
    const appId = sessionStorage.getItem(LAUNCH_KEY);
    if (!appId) return;
    const button = document.querySelector(`[data-preview-app="${CSS.escape(appId)}"]`);
    if (!button) return;
    sessionStorage.removeItem(LAUNCH_KEY);
    button.click();
  }

  function manageApp(appId) {
    const state = ws();
    const app = state?.apps?.find(item => item.id === appId);
    if (!app) return;
    const roles = ['platform-admin','developer','publisher','viewer'];
    const manager = document.createElement('div');
    manager.className = 'v09-launch-manager-backdrop';
    manager.innerHTML = `<div class="v09-launch-manager"><header><strong>Launchpad settings · ${esc(app.name)}</strong><button class="btn small" data-close>×</button></header>
      <div class="v09-launch-form">
        <label>Group<input data-prop="launchpadGroup" value="${attr(app.launchpadGroup || 'Business Apps')}"></label>
        <label>Tile title<input data-prop="tileTitle" value="${attr(app.tileTitle || '')}" placeholder="Defaults to application name"></label>
        <label class="wide">Tile subtitle<textarea data-prop="tileSubtitle">${esc(app.tileSubtitle || '')}</textarea></label>
        <label>KPI value<input data-prop="tileKpi" value="${attr(app.tileKpi || '')}" placeholder="Optional"></label>
        <label>KPI label<input data-prop="tileKpiLabel" value="${attr(app.tileKpiLabel || '')}" placeholder="Optional"></label>
        <label class="wide">Visible to roles<div class="v09-launch-role-list">${roles.map(role=>`<label><input type="checkbox" data-role="${role}" ${(app.allowedRoles||[]).includes(role)?'checked':''}> ${role}</label>`).join('')}</div><small>Leave all roles unchecked to allow every authenticated user.</small></label>
        <label><span>Featured</span><select data-prop="favorite"><option value="false" ${!app.favorite?'selected':''}>No</option><option value="true" ${app.favorite?'selected':''}>Yes</option></select></label>
        <label><span>Hidden</span><select data-prop="hiddenFromLaunchpad"><option value="false" ${!app.hiddenFromLaunchpad?'selected':''}>No</option><option value="true" ${app.hiddenFromLaunchpad?'selected':''}>Yes</option></select></label>
      </div><footer><button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button></footer></div>`;
    overlay.appendChild(manager);
    manager.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => manager.remove()));
    manager.querySelector('[data-save]').addEventListener('click', async () => {
      const latest = ws(); const target = latest.apps.find(item => item.id === appId); if (!target) return;
      manager.querySelectorAll('[data-prop]').forEach(input => {
        const key = input.dataset.prop;
        target[key] = ['favorite','hiddenFromLaunchpad'].includes(key) ? input.value === 'true' : input.value.trim();
      });
      target.allowedRoles = Array.from(manager.querySelectorAll('[data-role]:checked')).map(input => input.dataset.role);
      target.updatedAt = new Date().toISOString();
      save(latest);
      manager.remove();
      await showLaunchpad();
    });
  }

  function injectNav() {
    const nav = document.querySelector('.sidebar .nav');
    if (!nav || nav.querySelector('[data-v09-launchpad]')) return;
    const button = document.createElement('button');
    button.className = 'nav-button';
    button.dataset.v09Launchpad = 'true';
    button.innerHTML = '<span class="nav-icon">▦</span><span>Launchpad</span>';
    nav.insertBefore(button, nav.firstChild);
    button.addEventListener('click', showLaunchpad);
  }

  function injectCss() {
    if (document.getElementById('v09-launch-css')) return;
    const style = document.createElement('style'); style.id = 'v09-launch-css';
    style.textContent = `
      .v09-launch-overlay{position:fixed;inset:0;z-index:15500;background:#edf2f7;color:#17202b;overflow:auto}.v09-launch-shell{min-height:100vh}.v09-launch-shell>header{height:68px;display:grid;grid-template-columns:auto minmax(220px,560px) auto;gap:20px;align-items:center;padding:0 28px;background:white;border-bottom:1px solid #dfe5ec;position:sticky;top:0;z-index:4}.v09-launch-brand{display:flex;align-items:center;gap:10px}.v09-launch-brand>div:last-child{display:grid}.v09-launch-brand small{font-size:9px;color:#667085}.v09-launch-logo{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;background:#172a42;color:white;font-weight:900}.v09-launch-search{display:grid;grid-template-columns:24px 1fr;align-items:center;background:#f5f7fa;border:1px solid #dde4ec;border-radius:9px;padding:0 9px}.v09-launch-search span{color:#667085}.v09-launch-search input{border:0;background:transparent;padding:10px 3px;outline:0;color:#17202b}.v09-launch-shell>main{padding:24px 5vw 50px;max-width:1600px;margin:auto}
      .v09-launch-recent{margin-bottom:24px}.v09-launch-recent>header,.v09-launch-group>header{margin-bottom:10px}.v09-launch-recent>header strong,.v09-launch-group>header strong{font-size:14px}.v09-launch-recent>div{display:flex;gap:8px;overflow:auto;padding-bottom:4px}.v09-launch-recent button{display:flex;align-items:center;gap:7px;background:white;border:1px solid #dde4ec;border-radius:999px;padding:6px 11px;color:#17202b;white-space:nowrap}.v09-launch-recent button span{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:#edf3fb;color:#255f9f;font-size:8px;font-weight:800}.v09-launch-recent button strong{font-size:10px}
      .v09-launch-group{margin:24px 0}.v09-launch-group>header>div{display:flex;align-items:baseline;gap:8px}.v09-launch-group header small{font-size:9px;color:#667085}.v09-launch-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}.v09-launch-tile{position:relative;background:white;border:1px solid #dfe5ec;border-radius:13px;min-height:140px;box-shadow:0 2px 8px rgba(25,38,55,.05);overflow:hidden}.v09-launch-tile.favorite{border-color:#b8cde5}.v09-launch-main{border:0;background:transparent;color:#17202b;width:100%;height:100%;padding:16px;text-align:left;display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:12px;cursor:pointer}.v09-launch-main:hover{background:#f8fbff}.v09-launch-icon{width:46px;height:46px;border-radius:11px;display:grid;place-items:center;background:#e9f1fa;color:#235d9d;font-weight:900;font-size:12px}.v09-launch-copy strong{display:block;font-size:12px}.v09-launch-copy p{font-size:9px;line-height:1.5;color:#667085;margin:5px 0 10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.v09-launch-copy small{font-size:8px;color:#667085}.v09-launch-kpi{text-align:right;align-self:end}.v09-launch-kpi strong{display:block;font-size:19px}.v09-launch-kpi span{font-size:8px;color:#667085}.v09-launch-manage{position:absolute;right:6px;top:6px;width:28px;height:28px;border:0;background:transparent;border-radius:7px;color:#667085;cursor:pointer}.v09-launch-manage:hover{background:#edf2f7}.v09-launch-star{position:absolute;left:8px;bottom:6px;color:#d99b10;font-size:10px}.v09-launch-empty{text-align:center;padding:70px 20px;color:#667085}.v09-launch-empty>div{font-size:40px}.v09-launch-empty strong{display:block;color:#17202b;margin:6px}.v09-launch-empty p{font-size:10px}
      .v09-launch-manager-backdrop{position:fixed;inset:0;background:rgba(16,28,44,.55);z-index:6;display:grid;place-items:center;padding:20px}.v09-launch-manager{width:min(760px,96vw);background:white;border-radius:14px;box-shadow:0 22px 60px rgba(0,0,0,.2);overflow:hidden}.v09-launch-manager>header,.v09-launch-manager>footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:13px 16px;border-bottom:1px solid #e4e8ee}.v09-launch-manager>footer{border-top:1px solid #e4e8ee;border-bottom:0;justify-content:flex-end}.v09-launch-form{padding:15px;display:grid;grid-template-columns:1fr 1fr;gap:10px}.v09-launch-form>label{display:grid;gap:5px;font-size:9px;font-weight:700}.v09-launch-form>label.wide{grid-column:1/-1}.v09-launch-form input,.v09-launch-form select,.v09-launch-form textarea{border:1px solid #d7dee7;border-radius:7px;padding:8px;background:white;color:#17202b}.v09-launch-form textarea{min-height:70px}.v09-launch-role-list{display:flex;flex-wrap:wrap;gap:7px}.v09-launch-role-list label{font-size:9px;font-weight:500;background:#f4f7fa;border:1px solid #e0e6ed;padding:5px 7px;border-radius:7px}.v09-launch-form small{color:#667085;font-weight:400}
      @media(max-width:760px){.v09-launch-shell>header{grid-template-columns:1fr auto;height:auto;padding:10px 14px}.v09-launch-search{grid-column:1/-1;grid-row:2}.v09-launch-shell>main{padding:15px}.v09-launch-grid{grid-template-columns:1fr}.v09-launch-form{grid-template-columns:1fr}.v09-launch-form>label.wide{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function decorate() {
    injectCss(); injectNav(); consumePendingLaunch();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; decorate(); });
  }

  const app = document.getElementById('app');
  observer = new MutationObserver(schedule);
  if (app) observer.observe(app, { childList:true, subtree:true });
  decorate();
})();
