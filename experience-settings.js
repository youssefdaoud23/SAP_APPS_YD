(() => {
  'use strict';

  const PREF_KEY = 'invarture-platform-preferences-v1';
  const WORKSPACE_KEY = 'invarture-app-studio-v2';
  const defaults = {
    theme: 'light',
    accent: 'invarture',
    density: 'comfortable',
    corners: 'rounded',
    liveRefresh: 15,
    reducedMotion: false,
    highContrast: false,
    confirmWrites: true,
    demoReadOnly: false,
    defaultDevice: 'desktop'
  };

  const accents = {
    invarture: ['#2f78ed', '#1e63ce'],
    navy: ['#31506f', '#213951'],
    teal: ['#0f8b8d', '#087174'],
    violet: ['#7656d6', '#6043be']
  };

  let prefs = loadPrefs();
  let lastTitle = '';

  function esc(v = '') {
    return String(v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function uid(prefix = 'id') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function loadPrefs() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; }
    catch { return { ...defaults }; }
  }

  function savePrefs() {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    applyPrefs();
    window.dispatchEvent(new CustomEvent('invarture:preferences', { detail: prefs }));
  }

  function workspace() {
    try { return JSON.parse(localStorage.getItem(WORKSPACE_KEY) || 'null'); }
    catch { return null; }
  }

  function saveWorkspace(ws, reload = true) {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(ws));
    if (reload) location.reload();
  }

  function currentApp(ws) {
    return ws?.apps?.find(a => a.id === ws.currentAppId) || ws?.apps?.[0] || null;
  }

  function currentPage(ws, app) {
    return app?.pages?.find(p => p.id === ws.currentPageId) || app?.pages?.[0] || null;
  }

  function injectCss() {
    if (document.getElementById('ias-experience-css')) return;
    const style = document.createElement('style');
    style.id = 'ias-experience-css';
    style.textContent = `
      .ias-settings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-top:18px}
      .ias-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:17px;box-shadow:0 5px 16px rgba(27,43,65,.035)}
      .ias-card h3{margin:0 0 5px;font-size:15px}.ias-card>p{margin:0 0 14px;color:var(--muted);font-size:12px;line-height:1.5}
      .ias-field{display:grid;gap:5px;margin:11px 0}.ias-field label{font-size:11px;font-weight:750;color:var(--text)}
      .ias-field select,.ias-field input{width:100%;border:1px solid var(--line-2);border-radius:8px;background:var(--surface);color:var(--text);padding:9px 10px}
      .ias-check{display:flex;align-items:flex-start;gap:9px;padding:8px 0;font-size:12px;color:var(--text)}.ias-check input{margin-top:2px}
      .ias-check small{display:block;color:var(--muted);margin-top:2px;line-height:1.35}
      .ias-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .ias-top-action{white-space:nowrap}.ias-health{display:grid;gap:7px;margin-top:10px}.ias-health-row{display:flex;align-items:center;gap:8px;font-size:12px;padding:7px 9px;border-radius:8px;background:var(--surface-2);border:1px solid var(--line)}
      .ias-health-row b{margin-left:auto}.ias-ok{color:var(--green)}.ias-warn{color:var(--amber)}.ias-bad{color:var(--red)}
      .ias-overlay{position:fixed;inset:0;background:rgba(12,22,34,.55);backdrop-filter:blur(4px);z-index:10000;display:grid;place-items:start center;padding:8vh 18px 18px}
      .ias-modal{width:min(760px,96vw);max-height:84vh;overflow:auto;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow-lg)}
      .ias-modal-head{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--surface);z-index:2}.ias-modal-head strong{font-size:15px}.ias-modal-head .grow{flex:1}
      .ias-modal-body{padding:18px}.ias-template-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:11px}.ias-template{border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--surface-2)}.ias-template h4{margin:0 0 6px}.ias-template p{font-size:11px;color:var(--muted);line-height:1.5;min-height:48px}
      .ias-command{width:min(720px,96vw)}.ias-command input{width:100%;border:0;border-bottom:1px solid var(--line);padding:16px 18px;background:var(--surface);color:var(--text);font-size:15px;outline:0}.ias-command-list{max-height:55vh;overflow:auto;padding:8px}.ias-command-item{width:100%;display:flex;gap:10px;align-items:center;text-align:left;border:0;background:transparent;color:var(--text);padding:10px;border-radius:9px}.ias-command-item:hover{background:var(--surface-2)}.ias-command-item span{color:var(--muted);font-size:11px;margin-left:auto}
      .ias-validation{display:grid;gap:8px}.ias-issue{border-left:3px solid var(--line-2);background:var(--surface-2);padding:9px 11px;border-radius:7px;font-size:12px}.ias-issue.warn{border-left-color:var(--amber)}.ias-issue.error{border-left-color:var(--red)}.ias-issue.ok{border-left-color:var(--green)}
      html[data-ias-density="compact"] .content{padding:14px}html[data-ias-density="compact"] .card,html[data-ias-density="compact"] .ias-card{border-radius:9px}html[data-ias-density="compact"] .app-card{padding:12px;min-height:175px}html[data-ias-density="compact"] .btn{min-height:31px;padding:6px 9px}html[data-ias-density="compact"] .studio-layout{gap:6px}
      html[data-ias-density="spacious"] .content{padding:30px}html[data-ias-density="spacious"] .app-card{padding:22px}html[data-ias-density="spacious"] .btn{min-height:40px;padding:10px 15px}
      html[data-ias-corners="soft"]{--radius:20px;--radius-sm:13px}html[data-ias-corners="square"]{--radius:5px;--radius-sm:4px}
      html[data-ias-motion="reduced"] *,html[data-ias-motion="reduced"] *:before,html[data-ias-motion="reduced"] *:after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}
      html[data-ias-contrast="high"]{--line:#a6b1bf;--line-2:#77869a;--muted:#45556a;--muted-2:#596a80}html[data-ias-contrast="high"] .btn,html[data-ias-contrast="high"] .card{box-shadow:none}
      html[data-ias-theme="dark"]{color-scheme:dark;--bg:#0f1722;--surface:#172333;--surface-2:#1d2a3b;--line:#2c3a4c;--line-2:#415269;--text:#edf3fa;--muted:#a6b4c5;--muted-2:#8292a6;--ink:#f3f7fb;--ink-2:#d9e5f2;--green-bg:#0f3026;--amber-bg:#352914;--red-bg:#35191b}
      html[data-ias-theme="dark"] body,html[data-ias-theme="dark"] .main{background:var(--bg)}
      html[data-ias-theme="dark"] .topbar,html[data-ias-theme="dark"] .card,html[data-ias-theme="dark"] .metric-card,html[data-ias-theme="dark"] .studio-toolbar,html[data-ias-theme="dark"] .studio-panel,html[data-ias-theme="dark"] .canvas-head,html[data-ias-theme="dark"] .device-frame,html[data-ias-theme="dark"] .panel-tab.active,html[data-ias-theme="dark"] .palette-item,html[data-ias-theme="dark"] .btn,html[data-ias-theme="dark"] .search input,html[data-ias-theme="dark"] .studio-toolbar select{background:var(--surface);color:var(--text)}
      html[data-ias-theme="dark"] .canvas-panel,html[data-ias-theme="dark"] .stage{background:#111b28}html[data-ias-theme="dark"] .panel-head,html[data-ias-theme="dark"] .panel-tabs,html[data-ias-theme="dark"] .data-table th{background:var(--surface-2)}
      html[data-ias-theme="dark"] .ui-text,html[data-ias-theme="dark"] .app-card p{color:var(--muted)}html[data-ias-theme="dark"] .ui-card,html[data-ias-theme="dark"] .ui-field,html[data-ias-theme="dark"] .ui-table{color:var(--text)}
      @media(max-width:720px){.ias-settings-grid{grid-template-columns:1fr}.ias-template-grid{grid-template-columns:1fr}.ias-overlay{padding-top:3vh}}
    `;
    document.head.appendChild(style);
  }

  function effectiveTheme() {
    if (prefs.theme !== 'auto') return prefs.theme;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyPrefs() {
    injectCss();
    const root = document.documentElement;
    root.dataset.iasTheme = effectiveTheme();
    root.dataset.iasDensity = prefs.density;
    root.dataset.iasCorners = prefs.corners;
    root.dataset.iasMotion = prefs.reducedMotion ? 'reduced' : 'full';
    root.dataset.iasContrast = prefs.highContrast ? 'high' : 'normal';
    const [primary, darker] = accents[prefs.accent] || accents.invarture;
    root.style.setProperty('--blue', primary);
    root.style.setProperty('--blue-2', darker);
  }

  function select(name, value, options) {
    return `<div class="ias-field"><label>${esc(name)}</label><select data-ias-pref="${esc(value.key)}">${options.map(([v,l]) => `<option value="${esc(v)}" ${String(prefs[value.key])===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select></div>`;
  }

  function check(key, title, help) {
    return `<label class="ias-check"><input type="checkbox" data-ias-pref="${esc(key)}" ${prefs[key]?'checked':''}><span>${esc(title)}<small>${esc(help)}</small></span></label>`;
  }

  function renderSettingsExtension() {
    const title = document.querySelector('.topbar-title h1')?.textContent?.trim();
    if (title !== 'Settings') return;
    const content = document.querySelector('.content');
    if (!content || content.querySelector('[data-ias-settings]')) return;

    const wrap = document.createElement('div');
    wrap.dataset.iasSettings = '1';
    wrap.innerHTML = `
      <div class="section-head"><h2>Experience & runtime</h2><p>Personalize App Studio without changing application data.</p></div>
      <div class="ias-settings-grid">
        <section class="ias-card"><h3>Appearance</h3><p>Adjust the workspace for your screen and working style.</p>
          ${select('Theme',{key:'theme'},[['light','Light'],['dark','Dark'],['auto','Follow system']])}
          ${select('Accent',{key:'accent'},[['invarture','Invarture blue'],['navy','Navy'],['teal','Teal'],['violet','Violet']])}
          ${select('Density',{key:'density'},[['compact','Compact'],['comfortable','Comfortable'],['spacious','Spacious']])}
          ${select('Corners',{key:'corners'},[['rounded','Rounded'],['soft','Soft'],['square','Square']])}
          ${check('highContrast','Higher contrast','Strengthens borders and muted text for accessibility.')}
          ${check('reducedMotion','Reduce motion','Minimizes transitions and animation effects.')}
        </section>
        <section class="ias-card"><h3>Runtime behavior</h3><p>Control refresh cadence and safeguards for application testing.</p>
          ${select('Live SAP refresh',{key:'liveRefresh'},[[0,'Manual only'],[5,'Every 5 seconds'],[15,'Every 15 seconds'],[30,'Every 30 seconds'],[60,'Every 60 seconds']])}
          ${select('Default preview device',{key:'defaultDevice'},[['desktop','Desktop'],['tablet','Tablet'],['mobile','Mobile']])}
          ${check('confirmWrites','Confirm SAP writes','Ask before POST, PATCH or DELETE actions from runtime buttons.')}
          ${check('demoReadOnly','UI demo read-only mode','Blocks runtime write buttons in this browser. This is a UI safeguard, not a server security boundary.')}
          <div class="ias-actions"><button class="btn" data-ias-refresh-now>Refresh SAP data now</button></div>
        </section>
        <section class="ias-card"><h3>Productivity</h3><p>Fast navigation and reusable application starters.</p>
          <div class="ias-health-row"><span>Command palette</span><b>Ctrl / Cmd + K</b></div>
          <div class="ias-health-row"><span>Close dialogs</span><b>Esc</b></div>
          <div class="ias-actions"><button class="btn primary" data-ias-templates>Open template gallery</button><button class="btn" data-ias-palette>Open command palette</button></div>
        </section>
        <section class="ias-card"><h3>Platform diagnostics</h3><p>Check browser storage, backend APIs, PWA state and SAP connection registry.</p>
          <div id="ias-diagnostics" class="ias-health"><div class="ias-health-row"><span>Status</span><b class="ias-warn">Not checked</b></div></div>
          <div class="ias-actions"><button class="btn primary" data-ias-diagnostics>Run diagnostics</button></div>
        </section>
      </div>`;
    content.appendChild(wrap);
  }

  const templates = [
    {
      key: 'blank', name: 'Blank business app', icon: '＋', description: 'A clean two-page application ready for SAP bindings.',
      make: name => ({ id: uid('app'), name, description:'Blank Invarture business application.', icon:'AP', status:'draft', tags:['SAP'], updatedAt:new Date().toISOString(), versions:[], pages:[
        { id:uid('page'), name:'Home', title:name, components:[{id:uid('cmp'),type:'heading',text:name,level:'h2',align:'left'},{id:uid('cmp'),type:'text',text:'Start building your application here.',align:'left'}] },
        { id:uid('page'), name:'Details', title:'Details', components:[{id:uid('cmp'),type:'heading',text:'Details',level:'h2',align:'left'}] }
      ]})
    },
    {
      key: 'approval', name: 'Approval workspace', icon: '✓', description: 'KPI overview, pending-items table and approval action buttons.',
      make: name => ({ id:uid('app'), name, description:'Approval inbox for SAP business objects.', icon:'OK', status:'draft', tags:['SAP','Workflow'], updatedAt:new Date().toISOString(), versions:[], pages:[{
        id:uid('page'), name:'Inbox', title:name, components:[
          {id:uid('cmp'),type:'heading',text:name,level:'h2',align:'left'},
          {id:uid('cmp'),type:'kpi',label:'Pending approvals',value:'0',trend:'Live when bound',binding:''},
          {id:uid('cmp'),type:'toolbar',title:'Approval inbox',buttonText:'Refresh'},
          {id:uid('cmp'),type:'table',columns:'ID,Requester,Amount,Status',dataSource:'',binding:'',pageSize:'10'},
          {id:uid('cmp'),type:'button',text:'Refresh',variant:'secondary',logic:{action:'refresh'}}
        ]
      }]})
    },
    {
      key: 'master-detail', name: 'Master-detail app', icon: '▥', description: 'Searchable SAP list with a separate detail page and navigation action.',
      make: name => { const listPage=uid('page'), detailPage=uid('page'); return ({ id:uid('app'), name, description:'Master-detail SAP application starter.', icon:'MD', status:'draft', tags:['SAP','Master Detail'], updatedAt:new Date().toISOString(), versions:[], pages:[
        {id:listPage,name:'List',title:name,components:[{id:uid('cmp'),type:'heading',text:name,level:'h2',align:'left'},{id:uid('cmp'),type:'input',label:'Search',placeholder:'Search records',binding:''},{id:uid('cmp'),type:'table',columns:'ID,Description,Status',dataSource:'',binding:'',pageSize:'10'},{id:uid('cmp'),type:'button',text:'Open details',variant:'primary',logic:{action:'navigate',pageId:detailPage}}]},
        {id:detailPage,name:'Details',title:'Details',components:[{id:uid('cmp'),type:'heading',text:'Record details',level:'h2',align:'left'},{id:uid('cmp'),type:'card',title:'Selected record',text:'Bind fields from your SAP service.'},{id:uid('cmp'),type:'button',text:'Back to list',variant:'secondary',logic:{action:'navigate',pageId:listPage}}]}
      ]}); }
    },
    {
      key: 'dashboard', name: 'Operations dashboard', icon: '42', description: 'Responsive KPI dashboard with metrics, chart and recent activity table.',
      make: name => ({ id:uid('app'), name, description:'Operational SAP dashboard.', icon:'DB', status:'draft', tags:['SAP','Dashboard'], updatedAt:new Date().toISOString(), versions:[], pages:[{
        id:uid('page'),name:'Dashboard',title:name,components:[
          {id:uid('cmp'),type:'heading',text:name,level:'h2',align:'left'},
          {id:uid('cmp'),type:'text',text:'Live operational overview.',align:'left'},
          {id:uid('cmp'),type:'kpi',label:'Open items',value:'0',trend:'Live when bound',binding:''},
          {id:uid('cmp'),type:'kpi',label:'Completed today',value:'0',trend:'Live when bound',binding:''},
          {id:uid('cmp'),type:'chart',title:'Activity trend',labels:'Mon,Tue,Wed,Thu,Fri',values:'20,31,26,39,44',dataSource:'',binding:''},
          {id:uid('cmp'),type:'table',columns:'Time,Item,Owner,Status',dataSource:'',binding:'',pageSize:'5'}
        ]
      }]})
    }
  ];

  function openOverlay(title, body, extraClass = '') {
    closeOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'ias-overlay';
    overlay.id = 'ias-overlay';
    overlay.innerHTML = `<div class="ias-modal ${extraClass}"><div class="ias-modal-head"><strong>${esc(title)}</strong><div class="grow"></div><button class="btn small icon" data-ias-close>×</button></div><div class="ias-modal-body">${body}</div></div>`;
    document.body.appendChild(overlay);
  }

  function closeOverlay() { document.getElementById('ias-overlay')?.remove(); }

  function openTemplates() {
    const body = `<div class="ias-template-grid">${templates.map(t => `<article class="ias-template"><div style="font-size:25px;margin-bottom:8px">${esc(t.icon)}</div><h4>${esc(t.name)}</h4><p>${esc(t.description)}</p><button class="btn primary" data-ias-template="${esc(t.key)}">Create from template</button></article>`).join('')}</div>`;
    openOverlay('Application templates', body);
  }

  function createFromTemplate(key) {
    const template = templates.find(t => t.key === key); if (!template) return;
    const name = prompt('Application name', template.name); if (!name?.trim()) return;
    const ws = workspace(); if (!ws) return alert('Workspace is unavailable.');
    const app = template.make(name.trim());
    ws.apps = Array.isArray(ws.apps) ? ws.apps : [];
    ws.apps.push(app); ws.currentAppId = app.id; ws.currentPageId = app.pages[0]?.id || null; ws.selectedComponentId = null; ws.view = 'studio';
    saveWorkspace(ws);
  }

  function duplicateCurrentApp() {
    const ws = workspace(); const app = currentApp(ws); if (!ws || !app) return;
    const copy = JSON.parse(JSON.stringify(app));
    copy.id = uid('app'); copy.name = `${app.name} Copy`; copy.status = 'draft'; copy.updatedAt = new Date().toISOString(); copy.versions = [];
    const pageMap = new Map();
    copy.pages = (copy.pages || []).map(p => { const old=p.id; p.id=uid('page'); pageMap.set(old,p.id); p.components=(p.components||[]).map(c=>({ ...c, id:uid('cmp') })); return p; });
    for (const p of copy.pages) for (const c of p.components) if (c.logic?.action === 'navigate' && pageMap.has(c.logic.pageId)) c.logic.pageId = pageMap.get(c.logic.pageId);
    ws.apps.push(copy); ws.currentAppId=copy.id; ws.currentPageId=copy.pages[0]?.id||null; ws.selectedComponentId=null; ws.view='studio'; saveWorkspace(ws);
  }

  function validateApp() {
    const ws = workspace(); const app = currentApp(ws); if (!app) return;
    const issues = [];
    if (!app.pages?.length) issues.push(['error','Application has no pages.']);
    const ids = new Set();
    for (const page of app.pages || []) {
      if (!(page.components || []).length) issues.push(['warn',`Page “${page.name}” is empty.`]);
      for (const c of page.components || []) {
        if (ids.has(c.id)) issues.push(['error',`Duplicate component ID: ${c.id}`]); ids.add(c.id);
        if (c.dataSource && !c.binding && ['table','kpi','input','textarea','date','chart'].includes(c.type)) issues.push(['warn',`${page.name}: ${c.type} has a data source but no binding path.`]);
        if (String(c.dataSource || '').startsWith('server:') && !ws.connections?.some(x => x.id === c.dataSource)) issues.push(['warn',`${page.name}: ${c.type} references ${c.dataSource}, which is not imported into the workspace.`]);
        if (c.type === 'button' && ['odata-create','odata-update','odata-delete'].includes(c.logic?.action)) {
          if (!c.logic?.dataSource) issues.push(['error',`${page.name}: write button “${c.text || c.id}” has no connection.`]);
          if (!c.logic?.path) issues.push(['error',`${page.name}: write button “${c.text || c.id}” has no OData path.`]);
        }
      }
    }
    if (app.status === 'published' && issues.some(i => i[0] === 'error')) issues.unshift(['error','Published application contains blocking validation errors.']);
    if (!issues.length) issues.push(['ok','No structural issues detected.']);
    openOverlay(`Validate · ${app.name}`, `<div class="ias-validation">${issues.map(([type,msg])=>`<div class="ias-issue ${type}">${esc(msg)}</div>`).join('')}</div>`);
  }

  function ensureContextActions() {
    const title = document.querySelector('.topbar-title h1')?.textContent?.trim() || '';
    if (title === lastTitle && document.querySelector('[data-ias-context-actions]')) return;
    lastTitle = title;
    document.querySelector('[data-ias-context-actions]')?.remove();
    const spacer = document.querySelector('.topbar-spacer'); if (!spacer) return;
    const wrap = document.createElement('div'); wrap.dataset.iasContextActions='1'; wrap.style.display='flex'; wrap.style.gap='6px';
    if (title === 'Applications') wrap.innerHTML = '<button class="btn small ias-top-action" data-ias-templates>Templates</button><button class="btn small ias-top-action" data-ias-palette>⌘ Search</button>';
    else if (title === 'App Studio') wrap.innerHTML = '<button class="btn small ias-top-action" data-ias-validate>Validate</button><button class="btn small ias-top-action" data-ias-duplicate>Duplicate app</button><button class="btn small ias-top-action" data-ias-palette>⌘ K</button>';
    else if (title !== 'Settings') wrap.innerHTML = '<button class="btn small ias-top-action" data-ias-palette>⌘ K</button>';
    spacer.before(wrap);
  }

  function openPalette() {
    const ws = workspace();
    const commands = [
      {label:'Overview',hint:'Navigate',run:()=>go('home')}, {label:'Applications',hint:'Navigate',run:()=>go('apps')},
      {label:'App Studio',hint:'Navigate',run:()=>go('studio')}, {label:'Connection Center',hint:'Navigate',run:()=>go('data')},
      {label:'Versions',hint:'Navigate',run:()=>go('versions')}, {label:'Settings',hint:'Navigate',run:()=>go('settings')},
      {label:'Application templates',hint:'Create',run:()=>{closeOverlay();openTemplates();}},
      ...(ws?.apps || []).map(a => ({label:a.name,hint:'Open app',run:()=>go('studio',a.id)}))
    ];
    openOverlay('Command palette', `<div class="ias-command"><input id="ias-command-search" autofocus placeholder="Search apps and actions…"><div id="ias-command-list" class="ias-command-list"></div></div>`, 'ias-command');
    const input=document.getElementById('ias-command-search'); const list=document.getElementById('ias-command-list');
    function draw(){ const q=input.value.trim().toLowerCase(); const matches=commands.filter(c=>!q||c.label.toLowerCase().includes(q)).slice(0,20); list.innerHTML=matches.map((c,i)=>`<button class="ias-command-item" data-ias-command-index="${i}"><b>${esc(c.label)}</b><span>${esc(c.hint)}</span></button>`).join('') || '<div style="padding:14px;color:var(--muted)">No matches</div>'; list.querySelectorAll('[data-ias-command-index]').forEach((el,i)=>el.onclick=()=>{ closeOverlay(); matches[i].run(); }); }
    input.addEventListener('input',draw); input.addEventListener('keydown',e=>{if(e.key==='Enter'){const first=list.querySelector('[data-ias-command-index]');first?.click();}}); draw(); setTimeout(()=>input.focus(),0);
  }

  function go(view, appId) {
    const ws=workspace(); if(!ws) return;
    ws.view=view;
    if(appId){ const app=ws.apps.find(a=>a.id===appId); if(app){ws.currentAppId=app.id;ws.currentPageId=app.pages?.[0]?.id||null;ws.selectedComponentId=null;} }
    if(view==='studio' && !appId && prefs.defaultDevice) ws.device=prefs.defaultDevice;
    saveWorkspace(ws);
  }

  async function runDiagnostics() {
    const box=document.getElementById('ias-diagnostics'); if(!box) return;
    box.innerHTML='<div class="ias-health-row"><span>Running checks…</span><b class="ias-warn">…</b></div>';
    const rows=[];
    const ws=workspace();
    rows.push(['Workspace', ws ? `${ws.apps?.length || 0} apps` : 'Unavailable', !!ws]);
    const bytes=new Blob([localStorage.getItem(WORKSPACE_KEY)||'']).size;
    rows.push(['Browser storage', `${Math.round(bytes/1024)} KB`, true]);
    rows.push(['HTTPS', location.protocol==='https:' ? 'Enabled' : 'Not enabled', location.protocol==='https:' || ['localhost','127.0.0.1'].includes(location.hostname)]);
    rows.push(['PWA service worker', navigator.serviceWorker?.controller ? 'Active' : 'Not controlling page', !!navigator.serviceWorker?.controller]);
    try { const r=await fetch('/api/workspace',{cache:'no-store'}); rows.push(['Server workspace API', r.ok?'Reachable':`HTTP ${r.status}`, r.ok]); } catch { rows.push(['Server workspace API','Unavailable',false]); }
    try { const r=await fetch('/api/sap?action=connections',{cache:'no-store'}); const j=await r.json(); rows.push(['SAP connector', r.ok?`${j.connections?.length||0} server connections`:`HTTP ${r.status}`, r.ok]); } catch { rows.push(['SAP connector','Unavailable',false]); }
    box.innerHTML=rows.map(([name,value,ok])=>`<div class="ias-health-row"><span>${esc(name)}</span><b class="${ok?'ias-ok':'ias-warn'}">${esc(value)}</b></div>`).join('');
  }

  function runtimeWriteGuard(event) {
    const button = event.target.closest?.('[data-runtime-button]'); if (!button) return;
    const ws=workspace(); const id=button.dataset.runtimeButton;
    let component=null;
    for(const app of ws?.apps||[]) for(const page of app.pages||[]){ component=(page.components||[]).find(c=>c.id===id); if(component) break; }
    const action=component?.logic?.action;
    if(!['odata-create','odata-update','odata-delete'].includes(action)) return;
    if(prefs.demoReadOnly){ event.preventDefault(); event.stopImmediatePropagation(); alert('UI demo read-only mode is enabled. Disable it in Settings to test SAP write actions.'); return; }
    if(prefs.confirmWrites && !confirm(`Run ${action.replace('odata-','').toUpperCase()} against the configured SAP/API connection?`)){ event.preventDefault(); event.stopImmediatePropagation(); }
  }

  document.addEventListener('click', event => {
    const el=event.target.closest?.('[data-ias-close],[data-ias-templates],[data-ias-template],[data-ias-palette],[data-ias-validate],[data-ias-duplicate],[data-ias-diagnostics],[data-ias-refresh-now]'); if(!el) return;
    if(el.matches('[data-ias-close]')) closeOverlay();
    else if(el.matches('[data-ias-templates]')) openTemplates();
    else if(el.matches('[data-ias-template]')) createFromTemplate(el.dataset.iasTemplate);
    else if(el.matches('[data-ias-palette]')) openPalette();
    else if(el.matches('[data-ias-validate]')) validateApp();
    else if(el.matches('[data-ias-duplicate]')) duplicateCurrentApp();
    else if(el.matches('[data-ias-diagnostics]')) runDiagnostics();
    else if(el.matches('[data-ias-refresh-now]')) window.dispatchEvent(new CustomEvent('invarture:refresh-data'));
  });

  document.addEventListener('change', event => {
    const el=event.target.closest?.('[data-ias-pref]'); if(!el) return;
    const key=el.dataset.iasPref;
    prefs[key]=el.type==='checkbox' ? el.checked : (key==='liveRefresh' ? Number(el.value) : el.value);
    savePrefs();
  });

  document.addEventListener('click', runtimeWriteGuard, true);
  document.addEventListener('keydown', event => {
    if((event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='k'){ event.preventDefault(); openPalette(); }
    if(event.key==='Escape') closeOverlay();
  });

  const observer=new MutationObserver(()=>{ renderSettingsExtension(); ensureContextActions(); });
  observer.observe(document.body,{childList:true,subtree:true});
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(prefs.theme==='auto')applyPrefs();});
  applyPrefs(); renderSettingsExtension(); ensureContextActions();
})();
