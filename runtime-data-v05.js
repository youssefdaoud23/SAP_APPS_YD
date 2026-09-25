(() => {
  'use strict';

  const KEY = 'invarture-app-studio-v2';
  const PREF_KEY = 'invarture-platform-preferences-v1';
  const API = '/api/sap';
  const model = globalThis.InvartureModel;
  if (!model) return;

  const inflight = new Map();
  let timer = null;
  let scheduled = false;

  function state() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || 'null');
      return value ? model.ensureWorkspace(value) : null;
    } catch { return null; }
  }

  function prefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); }
    catch { return {}; }
  }

  function esc(value = '') {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function sourceFor(workspace, component) {
    return model.resolveDataSource(workspace, component?.dataSource);
  }

  function pathFor(component) {
    let path = String(component?.binding || '').trim().replace(/^\/+/, '');
    if (!path) return '';
    if (component.type === 'table' && !/[?&]\$top=/.test(path)) {
      path += `${path.includes('?') ? '&' : '?'}$top=${Math.max(1, Math.min(200, Number(component.pageSize) || 10))}`;
    }
    if (!/[?&]\$format=/.test(path) && !path.endsWith('/$count')) {
      path += `${path.includes('?') ? '&' : '?'}$format=json`;
    }
    return path;
  }

  async function load(workspace, component) {
    const resolved = sourceFor(workspace, component);
    const path = pathFor(component);
    if (!resolved.serverId || !path) return null;
    const key = `${resolved.serverId}|${path}`;
    if (!inflight.has(key)) {
      const promise = (async () => {
        const url = new URL(API, location.origin);
        url.searchParams.set('action', 'request');
        url.searchParams.set('id', resolved.serverId);
        url.searchParams.set('path', path);
        const response = await fetch(url, { headers: { Accept:'application/json,text/plain,*/*' }, cache:'no-store' });
        const text = await response.text();
        if (!response.ok) throw new Error(parseError(text, response.status));
        try { return JSON.parse(text); } catch { return text; }
      })().finally(() => setTimeout(() => inflight.delete(key), 1200));
      inflight.set(key, promise);
    }
    return inflight.get(key);
  }

  function parseError(text, status) {
    try {
      const json = JSON.parse(text);
      return json?.error?.message?.value || json?.error?.message || json?.message || `HTTP ${status}`;
    } catch { return String(text || `HTTP ${status}`).slice(0, 350); }
  }

  function rows(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.value)) return data.value;
    if (Array.isArray(data?.d?.results)) return data.d.results;
    if (data?.d && typeof data.d === 'object') return [data.d];
    if (data && typeof data === 'object') return [data];
    return [];
  }

  function firstRow(data) { return rows(data)[0] || null; }

  function scalar(data) {
    if (['string','number','boolean'].includes(typeof data)) return data;
    if (['string','number','boolean'].includes(typeof data?.value)) return data.value;
    const list = rows(data);
    if (!list.length) return 0;
    if (list.length > 1) return list.length;
    const pair = Object.entries(list[0]).find(([key, value]) => !key.startsWith('__') && ['string','number','boolean'].includes(typeof value));
    return pair ? pair[1] : 1;
  }

  function field(data, names, fallback = undefined) {
    const row = firstRow(data);
    if (!row) return fallback;
    for (const name of names.filter(Boolean)) {
      if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
      const actual = Object.keys(row).find(key => key.toLowerCase() === String(name).toLowerCase());
      if (actual) return row[actual];
    }
    return fallback;
  }

  function fmt(value) {
    if (value == null) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function keys(row) {
    return Object.keys(row || {}).filter(key => !key.startsWith('__') && typeof row[key] !== 'object').slice(0, 14);
  }

  function indicator(root, text, ok) {
    let element = root.querySelector(':scope > .live-data-indicator');
    if (!element) {
      element = document.createElement('div');
      element.className = 'live-data-indicator';
      root.appendChild(element);
    }
    element.textContent = text;
    element.style.cssText = `margin-top:4px;font:600 9px/1.3 system-ui;color:${ok ? '#17835e' : '#b83c4b'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
  }

  async function hydrate(root, workspace, component) {
    const resolved = sourceFor(workspace, component);
    const path = pathFor(component);
    if (!resolved.serverId || !path || !root) return;
    const signature = `${resolved.serverId}|${path}|${component.type}`;
    if (root.dataset.liveHydration === signature) return;
    root.dataset.liveHydration = signature;
    try {
      const data = await load(workspace, component);
      if (!root.isConnected) return;
      if (component.type === 'table') hydrateTable(root, component, data);
      else if (component.type === 'kpi') hydrateKpi(root, data);
      else if (['input','textarea','date','text'].includes(component.type)) hydrateField(root, data);
      else hydrateEnterprise(root, component, data);
      root.dataset.liveState = 'ok';
      indicator(root, `${resolved.kind === 'alias' ? `${resolved.aliasId} -> ` : ''}${resolved.serverId} · live`, true);
    } catch (error) {
      if (!root.isConnected) return;
      root.dataset.liveState = 'error';
      indicator(root, `SAP: ${error.message}`, false);
    }
  }

  function hydrateTable(root, component, data) {
    const list = rows(data);
    if (!list.length) return;
    const table = root.querySelector('table');
    if (!table) return;
    let columns = String(component.columns || '').split(',').map(value => value.trim()).filter(Boolean);
    const available = keys(list[0]);
    if (!columns.length || columns.some(value => !(value in list[0]))) columns = available.slice(0, Math.max(1, Math.min(8, columns.length || 6)));
    const head = table.querySelector('thead tr');
    const body = table.querySelector('tbody');
    if (head) head.innerHTML = columns.map(column => `<th>${esc(column)}</th>`).join('');
    if (body) body.innerHTML = list.slice(0, Math.max(1, Number(component.pageSize) || 10)).map(row => `<tr>${columns.map(column => `<td>${esc(fmt(row[column]))}</td>`).join('')}</tr>`).join('');
  }

  function hydrateKpi(root, data) {
    const element = root.querySelector('.ui-kpi .value');
    if (element) element.textContent = fmt(scalar(data));
  }

  function hydrateField(root, data) {
    const element = root.querySelector('.ui-input,.ui-text');
    if (element) element.textContent = fmt(scalar(data));
  }

  function hydrateEnterprise(root, component, data) {
    const type = component.type;
    const value = field(data, [component.valueField, component.dataField], scalar(data));
    if (type === 'objectStatus') {
      const element = root.querySelector('.v09-status');
      if (element) element.textContent = fmt(field(data, [component.textField, component.dataField, 'Status', 'status'], value));
      return;
    }
    if (type === 'currency') {
      const strong = root.querySelector('.v09-amount strong');
      if (strong) {
        const amount = field(data, [component.valueField, component.dataField, 'NetAmount', 'Amount', 'amount'], value);
        const currency = field(data, [component.currencyField, 'Currency', 'CurrencyCode', 'currency'], component.currency || '');
        strong.innerHTML = `${esc(fmt(amount))} <span>${esc(fmt(currency))}</span>`;
      }
      return;
    }
    if (type === 'progress') {
      const number = Math.max(0, Math.min(100, Number(value) || 0));
      const track = root.querySelector('.v09-progress-track i');
      const display = root.querySelector('.v09-progress > div:first-child span');
      if (track) track.style.width = `${number}%`;
      if (display) display.textContent = `${number}%`;
      return;
    }
    if (['valueHelp','time','datetime','stepInput','slider','rating','multiInput','radioGroup'].includes(type)) {
      const element = root.querySelector('.v09-value-help span,.ui-input,.v09-step span');
      if (element) element.textContent = fmt(value);
      return;
    }
    if (type === 'pageHeader') {
      const row = firstRow(data);
      if (!row) return;
      const scalarKeys = keys(row);
      const title = field(data, [component.titleField, 'Name', 'Description', scalarKeys[0]], component.title);
      const subtitle = field(data, [component.subtitleField, 'Supplier', 'Vendor', scalarKeys[1]], component.subtitle);
      const number = field(data, [component.numberField, 'NetAmount', 'Amount', scalarKeys[2]], component.number);
      const unit = field(data, [component.unitField, 'Currency', 'Unit', scalarKeys[3]], component.unit);
      const titleEl = root.querySelector('.v09-object-header h3');
      const subtitleEl = root.querySelector('.v09-object-header small');
      const numberEl = root.querySelector('.v09-object-number strong');
      const unitEl = root.querySelector('.v09-object-number span');
      if (titleEl) titleEl.textContent = fmt(title);
      if (subtitleEl) subtitleEl.textContent = fmt(subtitle);
      if (numberEl) numberEl.textContent = fmt(number);
      if (unitEl) unitEl.textContent = fmt(unit);
      return;
    }
    if (type === 'list') {
      const list = rows(data);
      const host = root.querySelector('.v09-list');
      if (!host || !list.length) return;
      host.querySelectorAll('.v09-list-item').forEach(item => item.remove());
      const labelKey = component.textField || component.dataField || keys(list[0])[0];
      list.slice(0, 20).forEach(row => host.insertAdjacentHTML('beforeend', `<div class="v09-list-item"><span>${esc(fmt(row[labelKey]))}</span><b>›</b></div>`));
      return;
    }
    if (type === 'objectList') {
      const list = rows(data);
      const host = root.querySelector('.v09-object-list');
      if (!host || !list.length) return;
      host.querySelectorAll('.v09-object-row').forEach(item => item.remove());
      const available = keys(list[0]);
      list.slice(0, 20).forEach(row => {
        host.insertAdjacentHTML('beforeend', `<div class="v09-object-row"><div><b>${esc(fmt(row[component.titleField || available[0]]))}</b><small>${esc(fmt(row[component.subtitleField || available[1]]))}</small></div><div><strong>${esc(fmt(row[component.numberField || available[2]]))}</strong><span class="v09-status neutral">${esc(fmt(row[component.statusField || available[3]]))}</span></div></div>`);
      });
      return;
    }
    if (type === 'avatar') {
      const name = root.querySelector('.v09-avatar-row strong');
      const subtitle = root.querySelector('.v09-avatar-row small');
      if (name) name.textContent = fmt(field(data, [component.nameField, 'Name', 'FullName'], value));
      if (subtitle) subtitle.textContent = fmt(field(data, [component.subtitleField, 'Email', 'Department'], component.subtitle));
      return;
    }
    if (type === 'link') {
      const link = root.querySelector('.v09-link');
      if (link) link.firstChild.textContent = `${fmt(value)} `;
    }
  }

  function previewApp(workspace) {
    const header = document.querySelector('.modal-head strong')?.textContent || '';
    const name = header.startsWith('Preview · ') ? header.slice(10).trim() : '';
    return workspace.apps?.find(app => app.name === name) || workspace.apps?.find(app => app.id === workspace.currentAppId) || workspace.apps?.[0];
  }

  function findInPage(page, id) {
    let found = null;
    for (const root of page?.components || []) {
      model.walkComponent(root, component => { if (component.id === id) found = component; });
      if (found) break;
    }
    return found;
  }

  function hydrateStudio() {
    const workspace = state();
    if (!workspace) return;
    const app = workspace.apps?.find(item => item.id === workspace.currentAppId);
    const page = app?.pages?.find(item => item.id === workspace.currentPageId) || app?.pages?.[0];
    if (!app || !page || app.dataMode === 'mock') return;
    document.querySelectorAll('.component-wrap[data-component-id]').forEach(root => {
      const component = findInPage(page, root.dataset.componentId);
      if (component && sourceFor(workspace, component).serverId) hydrate(root, workspace, component);
    });
  }

  function hydratePreview() {
    const workspace = state();
    const body = document.querySelector('.runtime-preview .runtime-body');
    if (!workspace || !body) return;
    const app = previewApp(workspace);
    if (!app || app.dataMode === 'mock') return;
    const active = document.querySelector('.runtime-preview .runtime-nav button.active')?.textContent?.trim();
    const page = app.pages?.find(item => item.name === active) || app.pages?.find(item => item.id === app.startPageId) || app.pages?.[0];
    if (!page) return;
    [...body.children].forEach((root, index) => {
      const component = page.components?.[index];
      if (component && sourceFor(workspace, component).serverId) hydrate(root, workspace, component);
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; hydrateStudio(); hydratePreview(); });
  }

  function refresh() {
    inflight.clear();
    document.querySelectorAll('[data-live-hydration]').forEach(element => {
      delete element.dataset.liveHydration;
      delete element.dataset.liveState;
    });
    schedule();
  }

  function configure() {
    if (timer) clearInterval(timer);
    timer = null;
    const seconds = Number(prefs().liveRefresh ?? 15);
    if (seconds > 0) timer = setInterval(refresh, Math.max(5, seconds) * 1000);
  }

  new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true });
  addEventListener('focus', schedule);
  addEventListener('storage', event => { if (!event.key || [KEY, PREF_KEY].includes(event.key)) { configure(); schedule(); } });
  addEventListener('invarture:refresh-data', refresh);
  addEventListener('invarture:preferences', configure);
  configure();
  schedule();
})();
