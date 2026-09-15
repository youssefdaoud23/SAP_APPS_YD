(() => {
  'use strict';

  const LOGO_URL = 'https://www.invarture.com/wp-content/uploads/2017/07/logo-invarture-erp-sap-normal.png';
  const STORAGE_KEY = 'invarture-app-studio-v2';
  const APP_VERSION = '0.2.0';

  const componentCatalog = [
    { type: 'heading', label: 'Heading', icon: 'H', group: 'Basic', defaults: { text: 'Page heading', level: 'h2', align: 'left' } },
    { type: 'text', label: 'Text', icon: '¶', group: 'Basic', defaults: { text: 'Add descriptive text here.', align: 'left' } },
    { type: 'button', label: 'Button', icon: '▣', group: 'Basic', defaults: { text: 'Action', variant: 'primary', event: '' } },
    { type: 'divider', label: 'Divider', icon: '—', group: 'Basic', defaults: {} },
    { type: 'spacer', label: 'Spacer', icon: '↕', group: 'Basic', defaults: { height: '28' } },
    { type: 'input', label: 'Input', icon: '⌨', group: 'Forms', defaults: { label: 'Input label', placeholder: 'Enter value', binding: '' } },
    { type: 'textarea', label: 'Text area', icon: '▤', group: 'Forms', defaults: { label: 'Notes', placeholder: 'Enter text', binding: '' } },
    { type: 'select', label: 'Select', icon: '⌄', group: 'Forms', defaults: { label: 'Select', options: 'Option A,Option B,Option C', binding: '' } },
    { type: 'checkbox', label: 'Checkbox', icon: '☐', group: 'Forms', defaults: { label: 'Checkbox option', checked: false, binding: '' } },
    { type: 'switch', label: 'Switch', icon: '◉', group: 'Forms', defaults: { label: 'Enabled', checked: true, binding: '' } },
    { type: 'date', label: 'Date', icon: '▦', group: 'Forms', defaults: { label: 'Date', placeholder: 'YYYY-MM-DD', binding: '' } },
    { type: 'kpi', label: 'KPI', icon: '42', group: 'Data', defaults: { label: 'Open items', value: '128', trend: '+8.4%', binding: '' } },
    { type: 'table', label: 'Table', icon: '▥', group: 'Data', defaults: { columns: 'PO,Vendor,Amount,Status', dataSource: '', binding: '', pageSize: '5' } },
    { type: 'chart', label: 'Chart', icon: '▥', group: 'Data', defaults: { title: 'Monthly volume', labels: 'Jan,Feb,Mar,Apr,May,Jun', values: '42,66,53,78,64,88', dataSource: '', binding: '' } },
    { type: 'card', label: 'Card', icon: '▢', group: 'Layout', defaults: { title: 'Card title', text: 'Reusable content card for business information.' } },
    { type: 'toolbar', label: 'Toolbar', icon: '≡', group: 'Layout', defaults: { title: 'Results', buttonText: 'Refresh' } },
    { type: 'tabs', label: 'Tabs', icon: '▤', group: 'Layout', defaults: { tabs: 'Overview,Details,History', active: 'Overview' } },
    { type: 'alert', label: 'Info strip', icon: 'i', group: 'Layout', defaults: { text: 'Information for the user.' } },
    { type: 'image', label: 'Image', icon: '▧', group: 'Media', defaults: { url: '', alt: 'Image', height: '150' } }
  ];

  const samplePO = [
    ['4500012381', 'ACME Industries', '€12,450', 'Open'],
    ['4500012394', 'Contoso GmbH', '€8,920', 'Approved'],
    ['4500012410', 'Northwind SAS', '€21,300', 'Open'],
    ['4500012428', 'Fabrikam AG', '€5,140', 'Blocked'],
    ['4500012441', 'Adventure Works', '€17,880', 'Approved']
  ];

  const initialState = {
    schemaVersion: 2,
    view: 'home',
    device: 'desktop',
    leftTab: 'components',
    rightTab: 'properties',
    currentAppId: 'purchase-orders',
    currentPageId: 'page-overview',
    selectedComponentId: null,
    search: '',
    settings: { autosave: true, showComponentNames: true },
    connections: [
      {
        id: 'conn-demo', name: 'SAP Demo', type: 'OData V2', url: 'https://sap.example.local/sap/opu/odata/sap/',
        auth: 'SAP / proxy', status: 'configured', notes: 'Placeholder connection. Real credentials must be handled server-side.'
      }
    ],
    apps: [
      {
        id: 'purchase-orders', name: 'Purchase Orders', description: 'Procurement workspace for monitoring open purchase orders and supplier activity.', icon: 'PO', status: 'published', tags: ['SAP', 'Procurement'], updatedAt: new Date().toISOString(),
        pages: [
          {
            id: 'page-overview', name: 'Overview', title: 'Purchase Orders', components: [
              { id: 'po-h1', type: 'heading', text: 'Purchase Orders', level: 'h2', align: 'left' },
              { id: 'po-t1', type: 'text', text: 'Monitor purchase orders, supplier activity and approvals from one responsive workspace.', align: 'left' },
              { id: 'po-k1', type: 'kpi', label: 'Open purchase orders', value: '128', trend: '+8.4%', binding: '' },
              { id: 'po-k2', type: 'kpi', label: 'Blocked', value: '14', trend: '-2 this week', binding: '' },
              { id: 'po-toolbar', type: 'toolbar', title: 'Recent purchase orders', buttonText: 'Refresh' },
              { id: 'po-table', type: 'table', columns: 'PO,Vendor,Amount,Status', dataSource: 'conn-demo', binding: '/PurchaseOrders', pageSize: '5' }
            ]
          },
          {
            id: 'page-suppliers', name: 'Suppliers', title: 'Suppliers', components: [
              { id: 'sup-h1', type: 'heading', text: 'Suppliers', level: 'h2', align: 'left' },
              { id: 'sup-search', type: 'input', label: 'Search supplier', placeholder: 'Name or vendor number', binding: '' },
              { id: 'sup-card', type: 'card', title: 'Supplier workspace', text: 'This page demonstrates a second page inside the same application.' }
            ]
          }
        ], versions: []
      },
      {
        id: 'employee-directory', name: 'Employee Directory', description: 'Starter HR application demonstrating forms, tabs and reusable cards.', icon: 'HR', status: 'draft', tags: ['HR'], updatedAt: new Date().toISOString(),
        pages: [{
          id: 'page-people', name: 'People', title: 'Employee Directory', components: [
            { id: 'hr-h1', type: 'heading', text: 'Employee Directory', level: 'h2', align: 'left' },
            { id: 'hr-tabs', type: 'tabs', tabs: 'People,Teams,Locations', active: 'People' },
            { id: 'hr-search', type: 'input', label: 'Search employee', placeholder: 'Name or personnel number', binding: '' },
            { id: 'hr-button', type: 'button', text: 'Search', variant: 'primary', event: 'searchEmployees()' },
            { id: 'hr-card', type: 'card', title: 'Ready for your SAP data', text: 'Bind this application to an OData service once the backend connector is available.' }
          ]
        }], versions: []
      }
    ]
  };

  let state = loadState();
  let modal = null;
  let contextMenu = null;
  let dragPayload = null;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function now() { return new Date().toISOString(); }
  function uid(prefix = 'id') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
  function esc(value = '') { return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }
  function attr(value = '') { return esc(value).replace(/`/g, '&#96;'); }
  function splitCsv(value = '') { return String(value).split(',').map(v => v.trim()).filter(Boolean); }
  function fmtDate(value) { try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); } catch { return value; } }
  function safeText(value, fallback = '') { return value == null ? fallback : String(value); }
  function toast(message, type = 'info') {
    let stack = document.getElementById('toastStack');
    if (!stack) {
      stack = document.createElement('div'); stack.id = 'toastStack'; stack.className = 'toast-stack'; document.body.appendChild(stack);
    }
    const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = message; stack.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  function normalizeState(raw) {
    const next = { ...clone(initialState), ...raw };
    next.settings = { ...initialState.settings, ...(raw.settings || {}) };
    next.connections = Array.isArray(raw.connections) ? raw.connections : clone(initialState.connections);
    next.apps = Array.isArray(raw.apps) ? raw.apps : clone(initialState.apps);
    next.apps = next.apps.map(a => {
      const app = { ...a, versions: Array.isArray(a.versions) ? a.versions : [] };
      if (!Array.isArray(app.pages)) {
        app.pages = [{ id: uid('page'), name: 'Main', title: app.name || 'Application', components: Array.isArray(app.components) ? app.components : [] }];
        delete app.components;
      }
      return app;
    });
    if (!next.apps.some(a => a.id === next.currentAppId)) next.currentAppId = next.apps[0]?.id || null;
    const current = next.apps.find(a => a.id === next.currentAppId);
    if (current && !current.pages.some(p => p.id === next.currentPageId)) next.currentPageId = current.pages[0]?.id || null;
    next.schemaVersion = 2;
    return next;
  }

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return raw ? normalizeState(raw) : clone(initialState);
    } catch {
      return clone(initialState);
    }
  }

  function persist(showToast = false) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { if (showToast) toast('Storage is unavailable in this browser context', 'error'); return false; }
    if (showToast) toast('Workspace saved', 'success');
    return true;
  }

  function autosave() {
    if (state.settings.autosave) persist(false);
  }

  function currentApp() { return state.apps.find(a => a.id === state.currentAppId) || state.apps[0] || null; }
  function currentPage() {
    const app = currentApp();
    return app?.pages.find(p => p.id === state.currentPageId) || app?.pages[0] || null;
  }
  function selectedComponent() { return currentPage()?.components.find(c => c.id === state.selectedComponentId) || null; }
  function connectionName(id) { return state.connections.find(c => c.id === id)?.name || ''; }

  function updateAppTimestamp() {
    const app = currentApp();
    if (app) app.updatedAt = now();
  }

  function iconFor(type) { return componentCatalog.find(c => c.type === type)?.icon || '•'; }
  function labelFor(type) { return componentCatalog.find(c => c.type === type)?.label || type; }

  function render() {
    const appRoot = document.getElementById('app');
    appRoot.innerHTML = shellHtml() + (modal ? modalHtml() : '') + (contextMenu ? contextMenuHtml() : '') + '<div id="toastStack" class="toast-stack"></div>';
    wireGlobal();
    wireView();
  }

  function shellHtml() {
    const meta = {
      home: ['Overview', 'Invarture SAP application workspace'], apps: ['Applications', 'Create, manage and publish applications'],
      studio: ['App Studio', currentApp()?.name || 'Application designer'], data: ['Data Sources', 'SAP OData and API connection registry'],
      versions: ['Versions', currentApp()?.name || 'Application snapshots'], settings: ['Settings', 'Workspace preferences and maintenance']
    }[state.view] || ['App Studio', ''];
    const nav = [
      ['home','⌂','Overview'], ['apps','▦','Applications'], ['studio','✦','App Studio'], ['data','⇄','Data Sources'], ['versions','◴','Versions'], ['settings','⚙','Settings']
    ];
    return `<div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><img src="${LOGO_URL}" alt="Invarture" onload="this.nextElementSibling.style.display='none'" onerror="this.style.display='none'"><div class="brand-fallback">invarture</div><small>App Studio</small></div>
        <nav class="nav">${nav.map(([id,icon,label]) => `<button class="nav-button ${state.view===id?'active':''}" data-nav="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join('')}</nav>
        <div class="sidebar-bottom"><div class="workspace-card"><strong>Test workspace</strong><span>v${APP_VERSION} · Browser-local</span></div></div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="topbar-title"><h1>${esc(meta[0])}</h1><p>${esc(meta[1])}</p></div>
          <div class="topbar-spacer"></div>
          ${state.view === 'studio' ? '<span class="kbd">Ctrl + S</span>' : ''}
          <span class="pill">MVP v${APP_VERSION}</span><div class="avatar">YD</div>
        </header>
        <section class="content ${state.view==='studio'?'studio-content':''}">${viewHtml()}</section>
      </main>
    </div>`;
  }

  function viewHtml() {
    if (state.view === 'apps') return appsHtml();
    if (state.view === 'studio') return studioHtml();
    if (state.view === 'data') return dataSourcesHtml();
    if (state.view === 'versions') return versionsHtml();
    if (state.view === 'settings') return settingsHtml();
    return homeHtml();
  }

  function homeHtml() {
    const published = state.apps.filter(a => a.status === 'published').length;
    const draft = state.apps.filter(a => a.status === 'draft').length;
    const componentCount = state.apps.reduce((sum,a) => sum + a.pages.reduce((s,p) => s + p.components.length,0),0);
    return `<div class="hero"><div>
      <h2>Build SAP business apps with less friction.</h2>
      <p>Invarture App Studio is a clean-room, SAP-focused low-code workspace for composing responsive applications, managing data sources, versioning designs and preparing applications for secure SAP integration.</p>
      <div class="hero-actions"><button class="btn primary" data-new-app>+ New application</button><button class="btn secondary" data-nav="studio">Open Studio</button></div>
    </div><div class="hero-metrics"><div class="hero-metric"><strong>${state.apps.length}</strong><span>Applications</span></div><div class="hero-metric"><strong>${published}</strong><span>Published</span></div></div></div>
    <div class="metric-grid">
      ${metricCard('Applications',state.apps.length,'Workspace total')}${metricCard('Published',published,'Available from launchpad')}${metricCard('Drafts',draft,'Still in development')}${metricCard('Components',componentCount,'Across every page')}
    </div>
    <div class="section-head"><h2>Recent applications</h2><div class="grow"></div><button class="btn small" data-nav="apps">View all</button></div>
    <div class="grid app-grid">${state.apps.slice().sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,6).map(appCard).join('')}</div>
    <div class="section-head"><h2>Platform status</h2></div>
    <div class="card" style="padding:16px"><div class="notice"><strong>Current test boundary:</strong> the visual application lifecycle is functional in-browser. Real SAP authentication and OData/RFC calls must go through a secure server-side connector before production use.</div></div>`;
  }

  function metricCard(label, value, foot) { return `<div class="metric-card"><div class="metric-label">${esc(label)}</div><div class="metric-value">${esc(value)}</div><div class="metric-foot">${esc(foot)}</div></div>`; }

  function appCard(a) {
    const pageCount = a.pages?.length || 0;
    const cmpCount = (a.pages || []).reduce((s,p)=>s+p.components.length,0);
    return `<article class="card app-card">
      <div class="app-card-top"><div class="app-icon">${esc(a.icon || 'AP')}</div><span class="status ${esc(a.status)}">${esc(a.status)}</span></div>
      <div><h3>${esc(a.name)}</h3><p>${esc(a.description || 'No description')}</p></div>
      <div class="app-card-meta">${(a.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}<span class="tag">${pageCount} page${pageCount===1?'':'s'}</span><span class="tag">${cmpCount} components</span></div>
      <div class="app-card-actions"><button class="btn small primary" data-open-app="${attr(a.id)}">Edit</button><button class="btn small" data-preview-app="${attr(a.id)}">Preview</button><button class="btn small icon" title="More" data-app-menu="${attr(a.id)}">•••</button></div>
    </article>`;
  }

  function appsHtml() {
    return `<div class="toolbar"><div class="search"><input id="appSearch" value="${attr(state.search)}" placeholder="Search applications"></div><div class="grow"></div><button class="btn" data-import-app>Import app</button><button class="btn" data-export-workspace>Export workspace</button><button class="btn primary" data-new-app>+ New application</button></div>
      <div class="section-head"><h2>Application registry</h2><p>${state.apps.length} total</p></div>
      <div class="grid app-grid">${filteredApps().map(appCard).join('') || '<div class="card" style="padding:24px;color:var(--muted)">No matching applications.</div>'}</div>`;
  }

  function filteredApps() {
    const q = state.search.trim().toLowerCase();
    if (!q) return state.apps;
    return state.apps.filter(a => [a.name,a.description,...(a.tags||[])].join(' ').toLowerCase().includes(q));
  }

  function studioHtml() {
    const app = currentApp();
    const page = currentPage();
    if (!app || !page) return `<div class="card" style="padding:24px">Create an application to start designing.</div>`;
    return `<div class="studio-toolbar">
      <span class="app-name">${esc(app.name)}</span><span class="status ${esc(app.status)}">${esc(app.status)}</span><span class="divider"></span>
      <select id="pageSelect" title="Current page">${app.pages.map(p=>`<option value="${attr(p.id)}" ${p.id===page.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>
      <button class="btn small" data-add-page>+ Page</button><span class="divider"></span>
      <button class="btn small" data-save>Save</button><button class="btn small" data-snapshot>Snapshot</button><button class="btn small" data-export-app>Export</button>
      <div class="grow"></div><button class="btn small" data-toggle-publish>${app.status==='published'?'Unpublish':'Publish'}</button><button class="btn small primary" data-preview-app="${attr(app.id)}">▶ Preview</button>
    </div>
    <div class="studio-layout">
      ${leftPanelHtml(app,page)}
      ${canvasHtml(app,page)}
      ${rightPanelHtml(app,page)}
    </div>`;
  }

  function leftPanelHtml(app,page) {
    const search = (state.paletteSearch || '').toLowerCase();
    const grouped = componentCatalog.reduce((acc,c)=>{ if (!search || `${c.label} ${c.group}`.toLowerCase().includes(search)) (acc[c.group] ||= []).push(c); return acc; },{});
    const componentPanel = `<div class="panel-body"><div class="palette-search"><input id="paletteSearch" placeholder="Search components" value="${attr(state.paletteSearch||'')}"></div>
      ${Object.entries(grouped).map(([group,items])=>`<div class="palette-group"><div class="palette-group-title">${esc(group)}</div><div class="palette-grid">${items.map(c=>`<button class="palette-item" draggable="true" data-add-type="${attr(c.type)}"><b>${esc(c.icon)}</b>${esc(c.label)}</button>`).join('')}</div></div>`).join('') || '<div class="inspector-empty">No components match.</div>'}</div>`;
    const treePanel = `<div class="panel-body"><div class="palette-group-title">Pages</div><div class="page-list">${app.pages.map(p=>`<div class="page-row"><button class="tree-row ${p.id===page.id?'active':''}" data-page="${attr(p.id)}">▤ ${esc(p.name)}<span class="tree-type">${p.components.length}</span></button>${app.pages.length>1?`<button class="btn small icon danger" title="Delete page" data-delete-page="${attr(p.id)}">×</button>`:''}</div>`).join('')}</div><div class="palette-group-title" style="margin-top:14px">Components</div><div class="tree">${page.components.map((c,i)=>`<button class="tree-row ${c.id===state.selectedComponentId?'active':''}" data-select="${attr(c.id)}"><span>${esc(iconFor(c.type))}</span>${esc(componentDisplayName(c))}<span class="tree-type">${i+1}</span></button>`).join('') || '<div class="inspector-empty">No components yet.</div>'}</div></div>`;
    return `<aside class="studio-panel"><div class="panel-tabs"><button class="panel-tab ${state.leftTab==='components'?'active':''}" data-left-tab="components">Components</button><button class="panel-tab ${state.leftTab==='tree'?'active':''}" data-left-tab="tree">App tree</button></div>${state.leftTab==='tree'?treePanel:componentPanel}</aside>`;
  }

  function canvasHtml(app,page) {
    const components = page.components;
    const content = components.length ? components.map((c,i) => `${dropZoneHtml(i)}${componentWrapperHtml(c,i,false)}`).join('') + dropZoneHtml(components.length) : `<div class="empty-canvas" data-canvas-empty><div><strong>Drop components here</strong>Drag from the palette or click a component to add it.</div></div>`;
    return `<section class="studio-panel canvas-panel"><div class="canvas-head"><span class="pill">${esc(page.name)}</span><span class="zoom-label">${components.length} components</span><div class="device-switch">${['desktop','tablet','mobile'].map(d=>`<button data-device="${d}" class="${state.device===d?'active':''}">${d[0].toUpperCase()+d.slice(1)}</button>`).join('')}</div></div>
      <div class="stage"><div class="device-frame ${state.device}"><div class="runtime-bar"><strong>${esc(app.name)}</strong><span>${esc(page.name)}</span></div><div class="runtime-body"><div class="runtime-page-title">Design canvas · ${esc(page.title || page.name)}</div>${content}</div></div></div></section>`;
  }

  function dropZoneHtml(index) { return `<div class="dropzone" data-drop-index="${index}"></div>`; }

  function componentDisplayName(c) {
    return safeText(c.text || c.title || c.label || labelFor(c.type), labelFor(c.type)).slice(0,28);
  }

  function componentWrapperHtml(c,index,runtime) {
    if (runtime) return componentHtml(c,true);
    return `<div class="component-wrap ${c.id===state.selectedComponentId?'selected':''}" draggable="true" data-component-id="${attr(c.id)}" data-index="${index}">
      ${state.settings.showComponentNames?`<span class="component-name">${esc(labelFor(c.type))}</span>`:''}<div class="component-tools"><button title="Move up" data-move="up" data-id="${attr(c.id)}">↑</button><button title="Move down" data-move="down" data-id="${attr(c.id)}">↓</button><button title="Duplicate" data-duplicate="${attr(c.id)}">⧉</button><button title="Delete" data-delete="${attr(c.id)}">×</button></div>${componentHtml(c,false)}</div>`;
  }

  function componentHtml(c,runtime=false) {
    const click = runtime && c.type === 'button' ? `data-runtime-button="${attr(c.id)}"` : '';
    switch(c.type) {
      case 'heading': return `<div class="ui-heading" style="text-align:${esc(c.align||'left')}">${esc(c.text||'Heading')}</div>`;
      case 'text': return `<div class="ui-text" style="text-align:${esc(c.align||'left')}">${esc(c.text||'Text')}</div>`;
      case 'button': return `<button class="ui-button ${esc(c.variant||'primary')}" ${click}>${esc(c.text||'Action')}</button>`;
      case 'input': return fieldPreview(c,'input');
      case 'textarea': return fieldPreview(c,'textarea');
      case 'select': return `<div class="ui-field"><label>${esc(c.label||'Select')}</label><div class="ui-input ui-select">${esc(splitCsv(c.options)[0]||'Select')}</div>${bindingHint(c)}</div>`;
      case 'checkbox': return `<div class="ui-check"><span class="ui-check-box">${c.checked?'✓':''}</span><span>${esc(c.label||'Checkbox')}</span></div>${bindingHint(c)}`;
      case 'switch': return `<div class="ui-check"><span class="ui-switch" style="background:${c.checked?'#2f78ed':'#d0d5dd'}"></span><span>${esc(c.label||'Enabled')}</span></div>${bindingHint(c)}`;
      case 'date': return fieldPreview(c,'input');
      case 'kpi': return `<div class="ui-kpi"><div><div class="label">${esc(c.label||'Metric')}</div><div class="value">${esc(c.value||'0')}</div></div><div class="trend">${esc(c.trend||'')}</div></div>${bindingHint(c)}`;
      case 'card': return `<div class="ui-card"><h4>${esc(c.title||'Card')}</h4><p>${esc(c.text||'')}</p></div>`;
      case 'toolbar': return `<div class="ui-toolbar"><strong>${esc(c.title||'Toolbar')}</strong><div class="spacer"></div><button class="ui-button secondary">${esc(c.buttonText||'Action')}</button></div>`;
      case 'tabs': { const tabs=splitCsv(c.tabs); return `<div class="ui-tabs">${tabs.map(t=>`<div class="ui-tab ${t===(c.active||tabs[0])?'active':''}">${esc(t)}</div>`).join('')}</div>`; }
      case 'table': return tablePreview(c);
      case 'chart': return chartPreview(c);
      case 'alert': return `<div class="ui-alert">ⓘ ${esc(c.text||'Information')}</div>`;
      case 'image': return `<div class="ui-image" style="height:${Math.max(60,Number(c.height)||150)}px;${c.url?`background-image:url('${attr(c.url)}')`:''}">${c.url?'':`Image · ${esc(c.alt||'')}`}</div>`;
      case 'divider': return '<div class="ui-divider"></div>';
      case 'spacer': return `<div class="ui-spacer" style="height:${Math.max(8,Number(c.height)||28)}px"></div>`;
      default: return `<div class="ui-card">${esc(labelFor(c.type))}</div>`;
    }
  }

  function fieldPreview(c,kind) {
    return `<div class="ui-field"><label>${esc(c.label||'Field')}</label><div class="ui-input ${kind==='textarea'?'ui-textarea':''}">${esc(c.placeholder||'')}</div>${bindingHint(c)}</div>`;
  }
  function bindingHint(c) { return c.binding ? `<div style="font-size:8px;color:#98a2b3;margin-top:4px">↳ ${esc(c.binding)}</div>` : ''; }

  function tablePreview(c) {
    const cols = splitCsv(c.columns); const rows = samplePO.slice(0,Math.max(1,Math.min(5,Number(c.pageSize)||5)));
    return `<div class="ui-table"><table><thead><tr>${cols.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${cols.map((_,i)=>`<td>${esc(row[i] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${c.dataSource||c.binding?`<div style="font-size:8px;color:#98a2b3;margin-top:4px">${esc(connectionName(c.dataSource)||'Data source')} ${c.binding?`· ${esc(c.binding)}`:''}</div>`:''}`;
  }

  function chartPreview(c) {
    const labels=splitCsv(c.labels); const values=splitCsv(c.values).map(v=>Number(v)||0); const max=Math.max(...values,1);
    return `<div><div style="font-size:11px;font-weight:700;margin-bottom:7px">${esc(c.title||'Chart')}</div><div class="ui-chart">${values.map((v,i)=>`<div class="ui-chart-bar" style="height:${Math.max(8,(v/max)*100)}%"><span>${esc(labels[i]||String(i+1))}</span></div>`).join('')}</div></div>`;
  }

  function rightPanelHtml(app,page) {
    const c = selectedComponent();
    const properties = c ? inspectorFieldsHtml(c) : `<div class="inspector-empty"><strong>Nothing selected</strong><br>Select a component on the canvas or in the app tree to edit its properties.</div>`;
    const appSettings = `<div class="panel-body">${inputField('Application name','app-name',app.name)}${textareaField('Description','app-description',app.description||'')}${inputField('Icon text','app-icon',app.icon||'AP')}${inputField('Tags','app-tags',(app.tags||[]).join(', '))}${selectField('Status','app-status',app.status,[['draft','Draft'],['published','Published'],['archived','Archived']])}<div class="inspector-section"><div class="inspector-section-title">Current page</div>${inputField('Page name','page-name',page.name)}${inputField('Page title','page-title',page.title||page.name)}</div></div>`;
    return `<aside class="studio-panel"><div class="panel-tabs"><button class="panel-tab ${state.rightTab==='properties'?'active':''}" data-right-tab="properties">Properties</button><button class="panel-tab ${state.rightTab==='app'?'active':''}" data-right-tab="app">App</button></div>${state.rightTab==='app'?appSettings:`<div class="panel-body">${properties}</div>`}</aside>`;
  }

  function inspectorFieldsHtml(c) {
    const common = `<div class="inspector-section-title">${esc(labelFor(c.type))}</div>${inputField('Component ID','cmp-id',c.id,true)}`;
    let fields='';
    if (['heading','text','button','alert'].includes(c.type)) fields += textareaField(c.type==='button'?'Button text':'Text','cmp-text',c.text||'');
    if (c.type==='heading' || c.type==='text') fields += selectField('Alignment','cmp-align',c.align||'left',[['left','Left'],['center','Center'],['right','Right']]);
    if (c.type==='button') fields += selectField('Variant','cmp-variant',c.variant||'primary',[['primary','Primary'],['secondary','Secondary'],['destructive','Destructive']]);
    if (['input','textarea','select','checkbox','switch','date','kpi'].includes(c.type)) fields += inputField('Label','cmp-label',c.label||'');
    if (['input','textarea','date'].includes(c.type)) fields += inputField('Placeholder','cmp-placeholder',c.placeholder||'');
    if (c.type==='select') fields += inputField('Options','cmp-options',c.options||'','', 'Comma-separated values');
    if (['checkbox','switch'].includes(c.type)) fields += selectField('Default','cmp-checked',String(Boolean(c.checked)),[['true','On / checked'],['false','Off / unchecked']]);
    if (c.type==='kpi') fields += inputField('Value','cmp-value',c.value||'') + inputField('Trend','cmp-trend',c.trend||'');
    if (['card','chart','toolbar'].includes(c.type)) fields += inputField('Title','cmp-title',c.title||'');
    if (c.type==='card') fields += textareaField('Body','cmp-text',c.text||'');
    if (c.type==='toolbar') fields += inputField('Button text','cmp-button-text',c.buttonText||'');
    if (c.type==='tabs') fields += inputField('Tabs','cmp-tabs',c.tabs||'','', 'Comma-separated') + inputField('Active tab','cmp-active',c.active||'');
    if (c.type==='table') fields += inputField('Columns','cmp-columns',c.columns||'','', 'Comma-separated column labels') + inputField('Rows in preview','cmp-page-size',c.pageSize||'5');
    if (c.type==='chart') fields += inputField('Labels','cmp-labels',c.labels||'') + inputField('Values','cmp-values',c.values||'');
    if (c.type==='image') fields += inputField('Image URL','cmp-url',c.url||'') + inputField('Alt text','cmp-alt',c.alt||'') + inputField('Height','cmp-height',c.height||'150');
    if (c.type==='spacer') fields += inputField('Height','cmp-height',c.height||'28');
    if (['input','textarea','select','checkbox','switch','date','kpi','table','chart'].includes(c.type)) {
      fields += `<div class="inspector-section"><div class="inspector-section-title">Data binding</div>${selectField('Data source','cmp-source',c.dataSource||'',[['','None'],...state.connections.map(s=>[s.id,s.name])])}${inputField('Binding path','cmp-binding',c.binding||'','', 'Example: /PurchaseOrders or /BusinessPartner')}</div>`;
    }
    if (c.type==='button') fields += `<div class="inspector-section"><div class="inspector-section-title">Events</div>${textareaField('On press','cmp-event',c.event||'',false,'JavaScript event placeholder. Not executed by the MVP runtime.', 'code-area')}</div>`;
    return common + fields + `<div class="inspector-section"><button class="btn danger" style="width:100%" data-delete="${attr(c.id)}">Delete component</button></div>`;
  }

  function inputField(label,id,value,disabled=false,help='') { return `<div class="field"><label for="${id}">${esc(label)}</label><input id="${id}" value="${attr(value)}" ${disabled?'disabled':''}>${help?`<div class="help">${esc(help)}</div>`:''}</div>`; }
  function textareaField(label,id,value,disabled=false,help='',extra='') { return `<div class="field"><label for="${id}">${esc(label)}</label><textarea id="${id}" class="${extra}" ${disabled?'disabled':''}>${esc(value)}</textarea>${help?`<div class="help">${esc(help)}</div>`:''}</div>`; }
  function selectField(label,id,value,options) { return `<div class="field"><label for="${id}">${esc(label)}</label><select id="${id}">${options.map(([v,l])=>`<option value="${attr(v)}" ${String(v)===String(value)?'selected':''}>${esc(l)}</option>`).join('')}</select></div>`; }

  function dataSourcesHtml() {
    return `<div class="split-layout"><div class="card form-card"><h3>Add data source</h3>
      <div class="notice warning" style="margin-bottom:13px"><strong>Security:</strong> this browser-only MVP never persists passwords or bearer tokens. Production SAP authentication will use a server-side proxy/vault.</div>
      ${inputField('Name','ds-name','')}${selectField('Type','ds-type','OData V2',[['OData V2','OData V2'],['OData V4','OData V4'],['REST','REST API']])}${inputField('Base URL','ds-url','')}${selectField('Authentication','ds-auth','SAP / proxy',[['SAP / proxy','SAP / secure proxy'],['Anonymous','Anonymous'],['Basic (future)','Basic (future backend)'],['OAuth2 (future)','OAuth2 (future backend)']])}${textareaField('Notes','ds-notes','')}
      <button class="btn primary" data-add-source style="width:100%">Add data source</button>
    </div><div><div class="section-head" style="margin-top:0"><h2>Configured sources</h2><p>${state.connections.length} total</p></div><div class="card source-list">${state.connections.map(sourceRowHtml).join('') || '<div class="inspector-empty">No data sources configured.</div>'}</div>
      <div class="section-head"><h2>Integration path</h2></div><div class="card" style="padding:16px"><div class="notice"><strong>Next backend milestone:</strong> the Studio will call an Invarture server-side connector, which will hold SAP credentials securely and proxy OData V2/V4 requests. This avoids CORS problems and prevents credentials from being exposed in browser code.</div></div></div></div>`;
  }

  function sourceRowHtml(s) {
    return `<div class="source-row"><span class="source-dot ready"></span><div class="source-info"><strong>${esc(s.name)}</strong><div>${esc(s.type)} · ${esc(s.url)} · ${esc(s.auth||'')}</div></div><div class="source-actions"><button class="btn small" data-validate-source="${attr(s.id)}">Validate</button><button class="btn small" data-edit-source="${attr(s.id)}">Edit</button><button class="btn small danger" data-delete-source="${attr(s.id)}">Delete</button></div></div>`;
  }

  function versionsHtml() {
    const app=currentApp(); if(!app) return '<div class="card" style="padding:20px">No application selected.</div>';
    const versions=(app.versions||[]).slice().reverse();
    return `<div class="toolbar"><span><strong>${esc(app.name)}</strong></span><div class="grow"></div><button class="btn primary" data-snapshot>+ Create snapshot</button></div><div class="section-head"><h2>Version snapshots</h2><p>${versions.length} saved</p></div><div class="version-list">${versions.map(v=>`<div class="card version-card"><div class="version-icon">◴</div><div class="version-info"><strong>${esc(v.label)}</strong><span>${esc(fmtDate(v.createdAt))} · ${v.pageCount||v.pages?.length||0} pages</span></div><button class="btn small" data-restore-version="${attr(v.id)}">Restore</button><button class="btn small danger" data-delete-version="${attr(v.id)}">Delete</button></div>`).join('') || '<div class="card" style="padding:22px;color:var(--muted)">No snapshots yet. Create one before a significant change.</div>'}</div>`;
  }

  function settingsHtml() {
    return `<div class="settings-grid"><div class="card settings-card"><h3>Workspace behavior</h3><p>These settings apply only to this browser.</p>${selectField('Autosave','set-autosave',String(state.settings.autosave),[['true','Enabled'],['false','Disabled']])}${selectField('Component labels','set-component-labels',String(state.settings.showComponentNames),[['true','Show on selection'],['false','Hide']])}<button class="btn primary" data-save-settings>Save settings</button></div>
      <div class="card settings-card"><h3>Workspace backup</h3><p>Export the complete local workspace including apps, data-source definitions and snapshots.</p><button class="btn" data-export-workspace>Export workspace JSON</button> <button class="btn" data-import-workspace>Import workspace JSON</button></div>
      <div class="card settings-card"><h3>Reset test data</h3><p>Restore the original demo applications and remove browser-local changes.</p><button class="btn danger" data-reset-workspace>Reset workspace</button></div>
      <div class="card settings-card"><h3>About</h3><p>Invarture App Studio MVP v${APP_VERSION}. Clean-room prototype intended to evolve into an SAP-focused low-code platform.</p><span class="pill">Schema v${state.schemaVersion}</span></div></div>`;
  }

  function modalHtml() {
    if (!modal) return '';
    if (modal.type === 'preview') return previewModalHtml(modal.appId, modal.pageId);
    if (modal.type === 'newApp') return formModal('Create application', newAppFormHtml(), 'Create', 'create-app-confirm');
    if (modal.type === 'newPage') return formModal('Create page', `${inputField('Page name','new-page-name','New Page')}${inputField('Page title','new-page-title','New Page')}`, 'Create', 'create-page-confirm');
    if (modal.type === 'editSource') return editSourceModalHtml(modal.sourceId);
    if (modal.type === 'confirm') return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><strong>${esc(modal.title||'Confirm')}</strong><div class="grow"></div><button class="btn small icon" data-close-modal>×</button></div><div class="modal-body"><p style="font-size:13px;line-height:1.6;margin:0">${esc(modal.message||'Are you sure?')}</p></div><div class="modal-foot"><button class="btn" data-close-modal>Cancel</button><button class="btn danger" data-confirm-action="${attr(modal.action)}">${esc(modal.confirmLabel||'Confirm')}</button></div></div></div>`;
    return '';
  }

  function formModal(title,body,confirmLabel,action) {
    return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><strong>${esc(title)}</strong><div class="grow"></div><button class="btn small icon" data-close-modal>×</button></div><div class="modal-body">${body}</div><div class="modal-foot"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-modal-action="${action}">${esc(confirmLabel)}</button></div></div></div>`;
  }

  function newAppFormHtml() { return `${inputField('Application name','new-app-name','New SAP Application')}${textareaField('Description','new-app-description','Business application created with Invarture App Studio.')}${inputField('Icon text','new-app-icon','AP')}${inputField('Tags','new-app-tags','SAP')}`; }

  function editSourceModalHtml(id) {
    const s=state.connections.find(x=>x.id===id); if(!s) return '';
    const body=`${inputField('Name','edit-ds-name',s.name)}${selectField('Type','edit-ds-type',s.type,[['OData V2','OData V2'],['OData V4','OData V4'],['REST','REST API']])}${inputField('Base URL','edit-ds-url',s.url)}${selectField('Authentication','edit-ds-auth',s.auth||'SAP / proxy',[['SAP / proxy','SAP / secure proxy'],['Anonymous','Anonymous'],['Basic (future)','Basic (future backend)'],['OAuth2 (future)','OAuth2 (future backend)']])}${textareaField('Notes','edit-ds-notes',s.notes||'')}`;
    return formModal('Edit data source',body,'Save','save-source-edit');
  }

  function previewModalHtml(appId,pageId) {
    const app=state.apps.find(a=>a.id===appId) || currentApp(); if(!app) return '';
    const page=app.pages.find(p=>p.id===(pageId||state.currentPageId)) || app.pages[0];
    return `<div class="modal-backdrop"><div class="modal large"><div class="modal-head"><strong>Preview · ${esc(app.name)}</strong><span class="status ${esc(app.status)}">${esc(app.status)}</span><div class="grow"></div><button class="btn small icon" data-close-modal>×</button></div><div class="modal-body"><div class="runtime-preview"><div class="runtime-bar"><strong>${esc(app.name)}</strong><div class="runtime-nav">${app.pages.map(p=>`<button class="${p.id===page.id?'active':''}" data-preview-page="${attr(p.id)}">${esc(p.name)}</button>`).join('')}</div><div style="flex:1"></div><span>Invarture App Runtime</span></div><div class="runtime-body">${page.components.map(c=>`<div style="margin-bottom:7px">${componentWrapperHtml(c,0,true)}</div>`).join('') || '<div class="inspector-empty">Empty page</div>'}</div></div></div></div></div>`;
  }

  function contextMenuHtml() {
    if (!contextMenu) return '';
    const style=`left:${Math.min(contextMenu.x,window.innerWidth-180)}px;top:${Math.min(contextMenu.y,window.innerHeight-190)}px`;
    return `<div class="context-menu" style="${style}"><button data-context-action="duplicate">Duplicate</button><button data-context-action="export">Export app</button><button data-context-action="snapshot">Create snapshot</button><button data-context-action="toggle">${contextMenu.app?.status==='published'?'Unpublish':'Publish'}</button><button class="danger" data-context-action="delete">Delete</button></div>`;
  }

  function wireGlobal() {
    document.querySelectorAll('[data-nav]').forEach(el=>el.addEventListener('click',()=>{ state.view=el.dataset.nav; contextMenu=null; render(); }));
    document.querySelectorAll('[data-close-modal]').forEach(el=>el.addEventListener('click',()=>{ modal=null; render(); }));
    document.querySelector('.modal-backdrop')?.addEventListener('click',e=>{ if(e.target.classList.contains('modal-backdrop')){ modal=null; render(); } });
  }

  function keyboardHandler(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='s') { e.preventDefault(); persist(true); }
    if (e.key==='Escape' && modal) { modal=null; render(); }
  }

  function wireView() {
    document.querySelectorAll('[data-new-app]').forEach(el=>el.addEventListener('click',()=>{ modal={type:'newApp'}; render(); }));
    document.querySelectorAll('[data-open-app]').forEach(el=>el.addEventListener('click',()=>openApp(el.dataset.openApp)));
    document.querySelectorAll('[data-preview-app]').forEach(el=>el.addEventListener('click',()=>{ const app=state.apps.find(a=>a.id===el.dataset.previewApp); modal={type:'preview',appId:app.id,pageId:app.pages[0]?.id}; render(); }));
    document.querySelectorAll('[data-app-menu]').forEach(el=>el.addEventListener('click',e=>{ e.stopPropagation(); const app=state.apps.find(a=>a.id===el.dataset.appMenu); contextMenu={x:e.clientX,y:e.clientY,app}; render(); }));
    document.querySelectorAll('[data-context-action]').forEach(el=>el.addEventListener('click',()=>handleContextAction(el.dataset.contextAction)));
    document.querySelector('[data-modal-action="create-app-confirm"]')?.addEventListener('click',createAppFromModal);
    document.querySelector('#appSearch')?.addEventListener('input',e=>{ state.search=e.target.value; render(); setTimeout(()=>{const x=document.querySelector('#appSearch');x?.focus();x?.setSelectionRange(x.value.length,x.value.length);},0); });
    document.querySelectorAll('[data-export-workspace]').forEach(el=>el.addEventListener('click',exportWorkspace));
    document.querySelector('[data-import-app]')?.addEventListener('click',()=>chooseJsonFile(importApp));
    document.querySelector('[data-import-workspace]')?.addEventListener('click',()=>chooseJsonFile(importWorkspace));
    document.querySelector('[data-reset-workspace]')?.addEventListener('click',()=>{ modal={type:'confirm',title:'Reset workspace',message:'This will erase all local changes and restore the original demo workspace.',action:'reset-workspace',confirmLabel:'Reset'}; render(); });
    document.querySelector('[data-confirm-action]')?.addEventListener('click',()=>runConfirmAction(document.querySelector('[data-confirm-action]').dataset.confirmAction));
    if (state.view==='studio') wireStudio();
    if (state.view==='data') wireDataSources();
    if (state.view==='versions') wireVersions();
    if (state.view==='settings') wireSettings();
    document.querySelectorAll('[data-preview-page]').forEach(el=>el.addEventListener('click',()=>{ modal.pageId=el.dataset.previewPage; render(); }));
    document.querySelectorAll('[data-runtime-button]').forEach(el=>el.addEventListener('click',()=>{ const app=state.apps.find(a=>a.id===modal?.appId); const page=app?.pages.find(p=>p.id===modal?.pageId); const c=page?.components.find(x=>x.id===el.dataset.runtimeButton); toast(c?.event?`Configured event: ${c.event}`:'Button pressed','info'); }));
  }

  function openApp(id) {
    const app=state.apps.find(a=>a.id===id); if(!app) return;
    state.currentAppId=id; state.currentPageId=app.pages[0]?.id||null; state.selectedComponentId=null; state.view='studio'; render();
  }

  function createAppFromModal() {
    const name=document.querySelector('#new-app-name')?.value.trim(); if(!name){toast('Application name is required','error');return;}
    const id=slugify(name)+'-'+Math.random().toString(36).slice(2,5);
    const app={id,name,description:document.querySelector('#new-app-description').value.trim(),icon:(document.querySelector('#new-app-icon').value.trim()||'AP').slice(0,3),status:'draft',tags:splitCsv(document.querySelector('#new-app-tags').value),updatedAt:now(),pages:[{id:uid('page'),name:'Main',title:name,components:[]}],versions:[]};
    state.apps.unshift(app); state.currentAppId=app.id; state.currentPageId=app.pages[0].id; state.selectedComponentId=null; state.view='studio'; modal=null; persist(); render(); toast('Application created','success');
  }

  function slugify(v){return String(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'app';}

  function handleContextAction(action) {
    const app=contextMenu?.app; if(!app) return;
    if(action==='duplicate'){ duplicateApp(app.id); contextMenu=null; render(); return; }
    if(action==='export'){ exportApp(app.id); contextMenu=null; render(); return; }
    if(action==='snapshot'){ state.currentAppId=app.id; createSnapshot(); contextMenu=null; render(); return; }
    if(action==='toggle'){ app.status=app.status==='published'?'draft':'published'; app.updatedAt=now(); persist(); contextMenu=null; render(); return; }
    if(action==='delete'){ contextMenu=null; modal={type:'confirm',title:'Delete application',message:`Delete “${app.name}”? This cannot be undone unless you exported a backup.`,action:`delete-app:${app.id}`,confirmLabel:'Delete'}; render(); }
  }

  function duplicateApp(id) {
    const original=state.apps.find(a=>a.id===id); if(!original)return;
    const copy=clone(original); copy.id=uid('app'); copy.name=`${original.name} Copy`; copy.status='draft'; copy.updatedAt=now(); copy.versions=[];
    copy.pages.forEach(p=>{p.id=uid('page');p.components.forEach(c=>c.id=uid('cmp'));});
    state.apps.unshift(copy); persist(); toast('Application duplicated','success');
  }

  function runConfirmAction(action) {
    if(action==='reset-workspace'){ localStorage.removeItem(STORAGE_KEY); state=clone(initialState); modal=null; render(); toast('Workspace reset','success'); return; }
    if(action.startsWith('delete-app:')){ const id=action.split(':')[1]; state.apps=state.apps.filter(a=>a.id!==id); if(state.currentAppId===id){state.currentAppId=state.apps[0]?.id||null;state.currentPageId=state.apps[0]?.pages[0]?.id||null;} persist(); modal=null; render(); toast('Application deleted','success'); return; }
    if(action.startsWith('delete-page:')){ const id=action.split(':')[1]; const app=currentApp(); app.pages=app.pages.filter(p=>p.id!==id); if(state.currentPageId===id)state.currentPageId=app.pages[0]?.id; state.selectedComponentId=null; updateAppTimestamp(); persist(); modal=null; render(); toast('Page deleted','success'); return; }
  }

  function wireStudio() {
    document.querySelector('#pageSelect')?.addEventListener('change',e=>{state.currentPageId=e.target.value;state.selectedComponentId=null;render();});
    document.querySelector('[data-add-page]')?.addEventListener('click',()=>{modal={type:'newPage'};render();});
    document.querySelector('[data-modal-action="create-page-confirm"]')?.addEventListener('click',createPageFromModal);
    document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>{state.currentPageId=el.dataset.page;state.selectedComponentId=null;render();}));
    document.querySelectorAll('[data-delete-page]').forEach(el=>el.addEventListener('click',()=>{const p=currentApp().pages.find(x=>x.id===el.dataset.deletePage);modal={type:'confirm',title:'Delete page',message:`Delete page “${p.name}” and all of its components?`,action:`delete-page:${p.id}`,confirmLabel:'Delete'};render();}));
    document.querySelectorAll('[data-left-tab]').forEach(el=>el.addEventListener('click',()=>{state.leftTab=el.dataset.leftTab;render();}));
    document.querySelectorAll('[data-right-tab]').forEach(el=>el.addEventListener('click',()=>{state.rightTab=el.dataset.rightTab;render();}));
    document.querySelector('#paletteSearch')?.addEventListener('input',e=>{state.paletteSearch=e.target.value;render();setTimeout(()=>{const x=document.querySelector('#paletteSearch');x?.focus();x?.setSelectionRange(x.value.length,x.value.length);},0);});
    document.querySelectorAll('[data-add-type]').forEach(el=>{
      el.addEventListener('click',()=>addComponent(el.dataset.addType));
      el.addEventListener('dragstart',e=>{dragPayload={kind:'new',type:el.dataset.addType};e.dataTransfer.effectAllowed='copy';el.classList.add('dragging');});
      el.addEventListener('dragend',()=>el.classList.remove('dragging'));
    });
    document.querySelectorAll('[data-select]').forEach(el=>el.addEventListener('click',()=>{state.selectedComponentId=el.dataset.select;state.rightTab='properties';render();}));
    document.querySelectorAll('.component-wrap').forEach(el=>{
      el.addEventListener('click',e=>{if(e.target.closest('button'))return;state.selectedComponentId=el.dataset.componentId;state.rightTab='properties';render();});
      el.addEventListener('dragstart',e=>{dragPayload={kind:'move',id:el.dataset.componentId};e.dataTransfer.effectAllowed='move';el.classList.add('dragging');});
      el.addEventListener('dragend',()=>el.classList.remove('dragging'));
    });
    document.querySelectorAll('.dropzone').forEach(el=>{
      el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('drag-over');});
      el.addEventListener('dragleave',()=>el.classList.remove('drag-over'));
      el.addEventListener('drop',e=>{e.preventDefault();el.classList.remove('drag-over');handleDrop(Number(el.dataset.dropIndex));});
    });
    document.querySelector('[data-canvas-empty]')?.addEventListener('dragover',e=>e.preventDefault());
    document.querySelector('[data-canvas-empty]')?.addEventListener('drop',e=>{e.preventDefault();handleDrop(0);});
    document.querySelectorAll('[data-device]').forEach(el=>el.addEventListener('click',()=>{state.device=el.dataset.device;render();}));
    document.querySelectorAll('[data-move]').forEach(el=>el.addEventListener('click',()=>moveComponent(el.dataset.id,el.dataset.move==='up'?-1:1)));
    document.querySelectorAll('[data-duplicate]').forEach(el=>el.addEventListener('click',()=>duplicateComponent(el.dataset.duplicate)));
    document.querySelectorAll('[data-delete]').forEach(el=>el.addEventListener('click',()=>deleteComponent(el.dataset.delete)));
    document.querySelector('[data-save]')?.addEventListener('click',()=>persist(true));
    document.querySelector('[data-snapshot]')?.addEventListener('click',createSnapshot);
    document.querySelector('[data-export-app]')?.addEventListener('click',()=>exportApp(currentApp().id));
    document.querySelector('[data-toggle-publish]')?.addEventListener('click',togglePublishCurrent);
    wireInspector();
  }

  function createPageFromModal() {
    const name=document.querySelector('#new-page-name')?.value.trim(); if(!name)return toast('Page name is required','error');
    const page={id:uid('page'),name,title:document.querySelector('#new-page-title')?.value.trim()||name,components:[]}; currentApp().pages.push(page); state.currentPageId=page.id;state.selectedComponentId=null;updateAppTimestamp();persist();modal=null;render();toast('Page created','success');
  }

  function addComponent(type,index=null) {
    const cat=componentCatalog.find(c=>c.type===type); if(!cat)return;
    const c={id:uid('cmp'),type,...clone(cat.defaults)}; const list=currentPage().components; if(index==null)list.push(c);else list.splice(index,0,c); state.selectedComponentId=c.id; state.rightTab='properties'; updateAppTimestamp(); autosave(); render();
  }

  function handleDrop(index) {
    const list=currentPage().components;
    if(!dragPayload)return;
    if(dragPayload.kind==='new') addComponent(dragPayload.type,index);
    else if(dragPayload.kind==='move') {
      const old=list.findIndex(c=>c.id===dragPayload.id); if(old<0)return; const [c]=list.splice(old,1); let target=index; if(old<index)target--; list.splice(Math.max(0,target),0,c); state.selectedComponentId=c.id; updateAppTimestamp(); autosave(); render();
    }
    dragPayload=null;
  }

  function moveComponent(id,delta) { const list=currentPage().components; const i=list.findIndex(c=>c.id===id);const j=i+delta;if(i<0||j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];updateAppTimestamp();autosave();render(); }
  function duplicateComponent(id) { const list=currentPage().components;const i=list.findIndex(c=>c.id===id);if(i<0)return;const copy=clone(list[i]);copy.id=uid('cmp');list.splice(i+1,0,copy);state.selectedComponentId=copy.id;updateAppTimestamp();autosave();render(); }
  function deleteComponent(id) { const list=currentPage().components;currentPage().components=list.filter(c=>c.id!==id);if(state.selectedComponentId===id)state.selectedComponentId=null;updateAppTimestamp();autosave();render(); }

  function wireInspector() {
    const c=selectedComponent(); const app=currentApp(); const page=currentPage();
    const bind=(id,prop,transform=v=>v)=>{
      const el=document.querySelector(id); if(!el)return;
      el.addEventListener('input',e=>{ if(!c)return;c[prop]=transform(e.target.value);updateAppTimestamp();autosave(); });
      el.addEventListener('change',()=>render());
    };
    const bindChange=(id,prop,transform=v=>v)=>document.querySelector(id)?.addEventListener('change',e=>{ if(!c)return;c[prop]=transform(e.target.value);updateAppTimestamp();autosave();render(); });
    bind('#cmp-text','text');bindChange('#cmp-align','align');bindChange('#cmp-variant','variant');bind('#cmp-label','label');bind('#cmp-placeholder','placeholder');bind('#cmp-options','options');bindChange('#cmp-checked','checked',v=>v==='true');bind('#cmp-value','value');bind('#cmp-trend','trend');bind('#cmp-title','title');bind('#cmp-button-text','buttonText');bind('#cmp-tabs','tabs');bind('#cmp-active','active');bind('#cmp-columns','columns');bind('#cmp-page-size','pageSize');bind('#cmp-labels','labels');bind('#cmp-values','values');bind('#cmp-url','url');bind('#cmp-alt','alt');bind('#cmp-height','height');bindChange('#cmp-source','dataSource');bind('#cmp-binding','binding');bind('#cmp-event','event');
    const appBind=(id,fn)=>{ const el=document.querySelector(id); if(!el)return; el.addEventListener('input',e=>{fn(e.target.value);updateAppTimestamp();autosave();}); el.addEventListener('change',()=>render()); };
    const appChange=(id,fn)=>document.querySelector(id)?.addEventListener('change',e=>{fn(e.target.value);updateAppTimestamp();autosave();render();});
    appBind('#app-name',v=>app.name=v);appBind('#app-description',v=>app.description=v);appBind('#app-icon',v=>app.icon=v.slice(0,3));appBind('#app-tags',v=>app.tags=splitCsv(v));appChange('#app-status',v=>app.status=v);appBind('#page-name',v=>page.name=v);appBind('#page-title',v=>page.title=v);
  }

  function renderPreserveFocus(selector,pos) { render(); requestAnimationFrame(()=>{ const el=document.querySelector(selector); if(el){el.focus(); if(typeof pos==='number'&&el.setSelectionRange)el.setSelectionRange(pos,pos);} }); }

  function togglePublishCurrent() { const app=currentApp();app.status=app.status==='published'?'draft':'published';updateAppTimestamp();persist();render();toast(app.status==='published'?'Application published':'Application moved to draft','success'); }

  function createSnapshot() {
    const app=currentApp(); if(!app)return; const n=(app.versions?.length||0)+1; const snapshot={id:uid('ver'),label:`Version ${n}`,createdAt:now(),pageCount:app.pages.length,pages:clone(app.pages),name:app.name,description:app.description,status:app.status,tags:clone(app.tags||[]),icon:app.icon}; (app.versions ||= []).push(snapshot);persist();toast('Version snapshot created','success'); if(state.view==='versions')render();
  }

  function wireVersions() {
    document.querySelector('[data-snapshot]')?.addEventListener('click',createSnapshot);
    document.querySelectorAll('[data-restore-version]').forEach(el=>el.addEventListener('click',()=>restoreVersion(el.dataset.restoreVersion)));
    document.querySelectorAll('[data-delete-version]').forEach(el=>el.addEventListener('click',()=>{ const app=currentApp(); app.versions=app.versions.filter(v=>v.id!==el.dataset.deleteVersion);persist();render();toast('Snapshot deleted','success'); }));
  }

  function restoreVersion(id) { const app=currentApp(); const v=app.versions.find(x=>x.id===id);if(!v)return;app.pages=clone(v.pages);app.name=v.name;app.description=v.description;app.status=v.status;app.tags=clone(v.tags||[]);app.icon=v.icon;app.updatedAt=now();state.currentPageId=app.pages[0]?.id;state.selectedComponentId=null;persist();render();toast('Snapshot restored','success'); }

  function wireDataSources() {
    document.querySelector('[data-add-source]')?.addEventListener('click',addSource);
    document.querySelectorAll('[data-delete-source]').forEach(el=>el.addEventListener('click',()=>{state.connections=state.connections.filter(s=>s.id!==el.dataset.deleteSource);state.apps.forEach(a=>a.pages.forEach(p=>p.components.forEach(c=>{if(c.dataSource===el.dataset.deleteSource)c.dataSource='';})));persist();render();toast('Data source deleted','success');}));
    document.querySelectorAll('[data-edit-source]').forEach(el=>el.addEventListener('click',()=>{modal={type:'editSource',sourceId:el.dataset.editSource};render();}));
    document.querySelectorAll('[data-validate-source]').forEach(el=>el.addEventListener('click',()=>validateSource(el.dataset.validateSource)));
    document.querySelector('[data-modal-action="save-source-edit"]')?.addEventListener('click',saveSourceEdit);
  }

  function addSource() {
    const name=document.querySelector('#ds-name').value.trim(),url=document.querySelector('#ds-url').value.trim(); if(!name||!url)return toast('Name and Base URL are required','error');
    state.connections.push({id:uid('conn'),name,type:document.querySelector('#ds-type').value,url,auth:document.querySelector('#ds-auth').value,status:'configured',notes:document.querySelector('#ds-notes').value.trim()});persist();render();toast('Data source added','success');
  }

  function saveSourceEdit() {
    const s=state.connections.find(x=>x.id===modal.sourceId);if(!s)return;s.name=document.querySelector('#edit-ds-name').value.trim();s.type=document.querySelector('#edit-ds-type').value;s.url=document.querySelector('#edit-ds-url').value.trim();s.auth=document.querySelector('#edit-ds-auth').value;s.notes=document.querySelector('#edit-ds-notes').value.trim();persist();modal=null;render();toast('Data source updated','success');
  }

  function validateSource(id) {
    const s=state.connections.find(x=>x.id===id); if(!s)return;
    try { const u=new URL(s.url); if(!['http:','https:'].includes(u.protocol))throw new Error(); if(!s.name.trim())throw new Error(); toast('Configuration is structurally valid. Network authentication is intentionally not performed in-browser.','success'); } catch { toast('Invalid data-source configuration','error'); }
  }

  function wireSettings() {
    document.querySelector('[data-save-settings]')?.addEventListener('click',()=>{state.settings.autosave=document.querySelector('#set-autosave').value==='true';state.settings.showComponentNames=document.querySelector('#set-component-labels').value==='true';persist();render();toast('Settings saved','success');});
  }

  function exportWorkspace() { downloadJson('invarture-app-studio-workspace.json',state); toast('Workspace exported','success'); }
  function exportApp(id) { const app=state.apps.find(a=>a.id===id);if(!app)return;downloadJson(`${slugify(app.name)}.invarture-app.json`,{kind:'invarture-app',schemaVersion:2,exportedAt:now(),app});toast('Application exported','success'); }
  function downloadJson(filename,data) { const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }

  function chooseJsonFile(handler) {
    const input=document.getElementById('fileImport'); input.value=''; input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());handler(data);}catch{toast('Invalid JSON file','error');}};input.click();
  }

  function importWorkspace(data) { if(!data||!Array.isArray(data.apps))return toast('Not a valid workspace export','error');state=normalizeState(data);persist();render();toast('Workspace imported','success'); }

  function importApp(data) {
    const app=data?.app||data; if(!app?.name||!Array.isArray(app.pages))return toast('Not a valid application export','error');const copy=clone(app);copy.id=uid('app');copy.updatedAt=now();copy.pages.forEach(p=>{p.id=uid('page');p.components.forEach(c=>c.id=uid('cmp'));});copy.versions=[];state.apps.unshift(copy);persist();render();toast('Application imported','success');
  }

  window.addEventListener('keydown', keyboardHandler);
  window.addEventListener('click',e=>{ if(contextMenu && !e.target.closest('.context-menu') && !e.target.closest('[data-app-menu]')){contextMenu=null;render();} });
  window.addEventListener('beforeunload',()=>{ if(state.settings.autosave)persist(false); });
  window.addEventListener('dragend',()=>{dragPayload=null;});

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});

  render();
})();
