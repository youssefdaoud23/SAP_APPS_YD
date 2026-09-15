(() => {
  'use strict';

  const STORAGE_KEY = 'invarture-app-studio-v2';
  const API = '/api/sap';
  const inflight = new Map();
  let scheduled = false;

  function workspace() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
  }

  function currentPage(state) {
    const app = state?.apps?.find(a => a.id === state.currentAppId);
    const page = app?.pages?.find(p => p.id === state.currentPageId) || app?.pages?.[0];
    return { app, page };
  }

  function serverConnectionId(component) {
    const id = String(component?.dataSource || '');
    return id.startsWith('server:') ? id.slice(7) : '';
  }

  function pathFor(component) {
    let path = String(component?.binding || '').trim().replace(/^\/+/, '');
    if (!path) return '';
    if (component.type === 'table' && !/[?&]\$top=/.test(path)) path += `${path.includes('?') ? '&' : '?'}$top=${Math.max(1, Math.min(100, Number(component.pageSize) || 10))}`;
    if (!/[?&]\$format=/.test(path) && !path.endsWith('/$count')) path += `${path.includes('?') ? '&' : '?'}$format=json`;
    return path;
  }

  async function load(component) {
    const id = serverConnectionId(component); const path = pathFor(component);
    if (!id || !path) return null;
    const key = `${id}|${path}`;
    if (!inflight.has(key)) {
      const p = (async () => {
        const url = new URL(API, location.origin);
        url.searchParams.set('action', 'request'); url.searchParams.set('id', id); url.searchParams.set('path', path);
        const response = await fetch(url, { headers: { Accept: 'application/json,text/plain,*/*' }, cache: 'no-store' });
        const text = await response.text();
        if (!response.ok) throw new Error(text.slice(0, 300) || `HTTP ${response.status}`);
        try { return JSON.parse(text); } catch { return text; }
      })().finally(() => setTimeout(() => inflight.delete(key), 1500));
      inflight.set(key, p);
    }
    return inflight.get(key);
  }

  function normalizeRows(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.value)) return data.value;
    if (Array.isArray(data?.d?.results)) return data.d.results;
    if (data?.d && typeof data.d === 'object') return [data.d];
    if (data && typeof data === 'object') return [data];
    return [];
  }

  function scalar(data) {
    if (typeof data === 'string' || typeof data === 'number') return data;
    if (typeof data?.value === 'number' || typeof data?.value === 'string') return data.value;
    const rows = normalizeRows(data);
    if (!rows.length) return 0;
    if (rows.length > 1) return rows.length;
    const row = rows[0];
    const candidate = Object.entries(row).find(([k,v]) => !k.startsWith('__') && (typeof v === 'number' || typeof v === 'string'));
    return candidate ? candidate[1] : 1;
  }

  function visibleKeys(row) {
    return Object.keys(row || {}).filter(k => !k.startsWith('__') && typeof row[k] !== 'object').slice(0, 12);
  }

  function esc(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  async function hydrateRoot(root, component) {
    const id = serverConnectionId(component); const path = pathFor(component);
    if (!id || !path || !root) return;
    const hydrationKey = `${id}|${path}|${component.type}`;
    if (root.dataset.liveHydration === hydrationKey) return;
    root.dataset.liveHydration = hydrationKey;
    root.dataset.liveState = 'loading';
    try {
      const data = await load(component);
      if (!root.isConnected) return;
      if (component.type === 'table') hydrateTable(root, component, data);
      else if (component.type === 'kpi') hydrateKpi(root, data);
      else if (component.type === 'input' || component.type === 'textarea' || component.type === 'date') hydrateField(root, data);
      root.dataset.liveState = 'ok';
      addIndicator(root, 'Live SAP data', true);
    } catch (err) {
      if (!root.isConnected) return;
      root.dataset.liveState = 'error';
      addIndicator(root, `SAP: ${err.message}`, false);
    }
  }

  function hydrateTable(root, component, data) {
    const rows = normalizeRows(data); if (!rows.length) return;
    const table = root.querySelector('table'); if (!table) return;
    let cols = String(component.columns || '').split(',').map(s => s.trim()).filter(Boolean);
    const keys = visibleKeys(rows[0]);
    if (!cols.length || cols.some(c => !(c in rows[0]))) cols = keys.slice(0, Math.max(1, Math.min(6, cols.length || 6)));
    const head = table.querySelector('thead tr'); const body = table.querySelector('tbody');
    if (head) head.innerHTML = cols.map(c => `<th>${esc(c)}</th>`).join('');
    if (body) body.innerHTML = rows.slice(0, Math.max(1, Number(component.pageSize) || 10)).map(r => `<tr>${cols.map(c => `<td>${esc(formatValue(r[c]))}</td>`).join('')}</tr>`).join('');
  }

  function hydrateKpi(root, data) {
    const value = root.querySelector('.ui-kpi .value');
    if (value) value.textContent = formatValue(scalar(data));
  }

  function hydrateField(root, data) {
    const input = root.querySelector('.ui-input');
    if (input) input.textContent = formatValue(scalar(data));
  }

  function formatValue(v) {
    if (v == null) return '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function addIndicator(root, text, ok) {
    let el = root.querySelector(':scope > .live-data-indicator');
    if (!el) { el = document.createElement('div'); el.className = 'live-data-indicator'; root.appendChild(el); }
    el.textContent = text;
    el.style.cssText = `margin-top:4px;font:600 9px/1.3 system-ui;color:${ok ? '#17835e' : '#b83c4b'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
  }

  function hydrateStudio() {
    const state = workspace(); if (!state) return;
    const { page } = currentPage(state); if (!page) return;
    document.querySelectorAll('.component-wrap[data-component-id]').forEach(root => {
      const c = page.components.find(x => x.id === root.dataset.componentId);
      if (c && serverConnectionId(c)) hydrateRoot(root, c);
    });
  }

  function hydratePreview() {
    const state = workspace(); if (!state) return;
    const preview = document.querySelector('.runtime-preview .runtime-body'); if (!preview) return;
    const app = state.apps?.find(a => a.id === state.currentAppId); if (!app) return;
    const activeText = document.querySelector('.runtime-preview .runtime-nav button.active')?.textContent?.trim();
    const page = app.pages?.find(p => p.name === activeText) || app.pages?.find(p => p.id === state.currentPageId) || app.pages?.[0];
    if (!page) return;
    [...preview.children].forEach((root, i) => {
      const c = page.components[i]; if (c && serverConnectionId(c)) hydrateRoot(root, c);
    });
  }

  function schedule() {
    if (scheduled) return; scheduled = true;
    requestAnimationFrame(() => { scheduled = false; hydrateStudio(); hydratePreview(); });
  }

  function forceRefresh() {
    inflight.clear();
    document.querySelectorAll('[data-live-hydration]').forEach(el => {
      delete el.dataset.liveHydration;
      delete el.dataset.liveState;
    });
    schedule();
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('storage', schedule);
  window.addEventListener('focus', schedule);
  window.addEventListener('invarture:refresh-data', forceRefresh);
  setInterval(schedule, 8000);
  schedule();
})();
