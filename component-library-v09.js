(() => {
  'use strict';

  const STORAGE_KEY = 'invarture-app-studio-v2';
  const catalog = globalThis.InvartureComponentCatalogV09;
  const model = globalThis.InvartureModel;
  if (!catalog || !model) return;

  let dragType = '';
  let observer = null;
  let scheduled = false;

  function esc(value = '') {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function attr(value = '') { return esc(value).replace(/`/g, '&#96;'); }

  function readWorkspace() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return value ? model.ensureWorkspace(value) : null;
    } catch {
      return null;
    }
  }

  function writeWorkspace(state) {
    model.ensureWorkspace(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function current(state) {
    const app = state?.apps?.find(item => item.id === state.currentAppId) || state?.apps?.[0] || null;
    const page = app?.pages?.find(item => item.id === state.currentPageId) || app?.pages?.[0] || null;
    return { app, page };
  }

  function findComponent(page, id) {
    if (!page || !id) return null;
    let found = null;
    for (const root of page.components || []) {
      model.walkComponent(root, component => { if (component.id === id) found = component; });
      if (found) break;
    }
    return found;
  }

  function addComponent(type, index = null) {
    const meta = catalog.COMPONENTS[type];
    if (!meta) return;
    const state = readWorkspace();
    const { page } = current(state);
    if (!page) return;
    const component = { id: model.uid('cmp'), type, ...model.clone(meta.defaults) };
    const list = page.components || (page.components = []);
    if (Number.isInteger(index)) list.splice(Math.max(0, Math.min(index, list.length)), 0, component);
    else list.push(component);
    state.selectedComponentId = component.id;
    state.rightTab = 'properties';
    writeWorkspace(state);
    location.reload();
  }

  function groupedComponents() {
    const groups = {};
    for (const [type, meta] of Object.entries(catalog.COMPONENTS)) {
      (groups[meta.group] ||= []).push({ type, ...meta });
    }
    return groups;
  }

  function decoratePalette() {
    const studioTitle = document.querySelector('.topbar-title h1')?.textContent?.trim();
    if (studioTitle !== 'App Studio') return;
    const search = document.querySelector('#paletteSearch');
    if (!search) return;
    const panelBody = search.closest('.panel-body');
    if (!panelBody || panelBody.querySelector('[data-v09-palette]')) return;

    const root = document.createElement('div');
    root.dataset.v09Palette = 'true';
    root.innerHTML = Object.entries(groupedComponents()).map(([group, items]) => `
      <div class="palette-group v09-palette-group">
        <div class="palette-group-title">${esc(group)} · Enterprise</div>
        <div class="palette-grid">${items.map(item => `<button class="palette-item" draggable="true" data-v09-add-type="${attr(item.type)}"><b>${esc(item.icon)}</b>${esc(item.label)}</button>`).join('')}</div>
      </div>`).join('');
    panelBody.appendChild(root);

    root.querySelectorAll('[data-v09-add-type]').forEach(button => {
      button.addEventListener('click', () => addComponent(button.dataset.v09AddType));
      button.addEventListener('dragstart', event => {
        dragType = button.dataset.v09AddType;
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/plain', `invarture:${dragType}`);
        button.classList.add('dragging');
      });
      button.addEventListener('dragend', () => {
        dragType = '';
        button.classList.remove('dragging');
      });
    });
  }

  function decorateCanvas() {
    const state = readWorkspace();
    const { page } = current(state);
    if (!page) return;
    document.querySelectorAll('.component-wrap[data-component-id]').forEach(wrap => {
      const component = findComponent(page, wrap.dataset.componentId);
      if (!component || !catalog.isEnterpriseType(component.type)) return;
      if (wrap.dataset.v09Rendered === component.type) return;
      wrap.dataset.v09Rendered = component.type;
      wrap.querySelectorAll('.v09-custom-host').forEach(node => node.remove());
      const generic = Array.from(wrap.children).find(node => node.classList?.contains('ui-card'));
      if (generic) generic.remove();
      const host = document.createElement('div');
      host.className = 'v09-custom-host';
      host.innerHTML = catalog.render(component.type, component);
      wrap.appendChild(host);
    });
  }

  function previewContext(state) {
    const runtime = document.querySelector('.runtime-preview');
    if (!runtime) return null;
    const appName = runtime.querySelector('.runtime-bar strong')?.textContent?.trim();
    const app = state?.apps?.find(item => item.name === appName) || state?.apps?.find(item => item.id === state.currentAppId) || null;
    const activePageId = runtime.querySelector('[data-preview-page].active')?.dataset.previewPage;
    const page = app?.pages?.find(item => item.id === activePageId) || app?.pages?.[0] || null;
    return { runtime, app, page };
  }

  function decoratePreview() {
    const state = readWorkspace();
    const context = previewContext(state);
    if (!context?.page) return;
    const body = context.runtime.querySelector('.runtime-body');
    if (!body) return;
    const rows = Array.from(body.children);
    (context.page.components || []).forEach((component, index) => {
      if (!catalog.isEnterpriseType(component.type)) return;
      const row = rows[index];
      if (!row || row.dataset.v09Preview === component.id) return;
      row.dataset.v09Preview = component.id;
      row.innerHTML = catalog.render(component.type, component);
    });
  }

  const LABELS = {
    text: 'Text', href: 'Link URL', target: 'Target', symbol: 'Symbol', size: 'Size', label: 'Label', initials: 'Initials', name: 'Name', subtitle: 'Subtitle',
    state: 'State', icon: 'Icon', value: 'Value', currency: 'Currency', displayValue: 'Display value', title: 'Title', items: 'Items', description: 'Description',
    placeholder: 'Placeholder', helpText: 'Help text', tokens: 'Tokens', options: 'Options', selected: 'Selected', min: 'Minimum', max: 'Maximum', step: 'Step',
    accept: 'Accepted file types', multiple: 'Allow multiple files', collapsible: 'Collapsible', status: 'Status', number: 'Number', unit: 'Unit', steps: 'Steps',
    activeStep: 'Active step', actionText: 'Action text', month: 'Month label', events: 'Events'
  };
  const TEXTAREA_KEYS = new Set(['items','description','text','events']);
  const NUMBER_KEYS = new Set(['size','value','min','max','step','activeStep']);
  const BOOLEAN_KEYS = new Set(['multiple','collapsible']);

  function inputHtml(key, value) {
    const label = LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
    if (BOOLEAN_KEYS.has(key)) {
      return `<div class="field"><label>${esc(label)}</label><select data-v09-prop="${attr(key)}"><option value="true" ${value?'selected':''}>Yes</option><option value="false" ${!value?'selected':''}>No</option></select></div>`;
    }
    if (key === 'state') {
      return `<div class="field"><label>${esc(label)}</label><select data-v09-prop="${attr(key)}">${['information','success','warning','error','neutral'].map(option=>`<option value="${option}" ${String(value)===option?'selected':''}>${option}</option>`).join('')}</select></div>`;
    }
    if (key === 'target') {
      return `<div class="field"><label>${esc(label)}</label><select data-v09-prop="${attr(key)}"><option value="_self" ${value==='_self'?'selected':''}>Same window</option><option value="_blank" ${value==='_blank'?'selected':''}>New window</option></select></div>`;
    }
    if (TEXTAREA_KEYS.has(key)) return `<div class="field"><label>${esc(label)}</label><textarea data-v09-prop="${attr(key)}">${esc(value == null ? '' : value)}</textarea></div>`;
    return `<div class="field"><label>${esc(label)}</label><input ${NUMBER_KEYS.has(key)?'type="number"':''} data-v09-prop="${attr(key)}" value="${attr(value == null ? '' : value)}"></div>`;
  }

  function saveProperty(componentId, key, rawValue) {
    const state = readWorkspace();
    const { page, app } = current(state);
    const component = findComponent(page, componentId);
    if (!component) return;
    let value = rawValue;
    if (BOOLEAN_KEYS.has(key)) value = rawValue === 'true';
    if (NUMBER_KEYS.has(key)) value = Number(rawValue);
    component[key] = value;
    if (app) app.updatedAt = new Date().toISOString();
    state.selectedComponentId = componentId;
    state.rightTab = 'properties';
    writeWorkspace(state);
    location.reload();
  }

  function decorateInspector() {
    const selected = document.querySelector('.component-wrap.selected[data-component-id]');
    if (!selected) return;
    const state = readWorkspace();
    const { page } = current(state);
    const component = findComponent(page, selected.dataset.componentId);
    if (!component || !catalog.isEnterpriseType(component.type)) return;
    const rightPanel = document.querySelector('.studio-layout > aside:last-child .panel-body');
    if (!rightPanel || rightPanel.querySelector('[data-v09-inspector]')) return;

    const meta = catalog.COMPONENTS[component.type];
    const defaults = meta?.defaults || {};
    const block = document.createElement('div');
    block.dataset.v09Inspector = component.id;
    block.className = 'inspector-section v09-inspector';
    block.innerHTML = `<div class="inspector-section-title">Enterprise properties</div>${Object.keys(defaults).map(key => inputHtml(key, component[key] == null ? defaults[key] : component[key])).join('')}`;
    const deleteSection = Array.from(rightPanel.querySelectorAll('.inspector-section')).pop();
    rightPanel.insertBefore(block, deleteSection || null);
    block.querySelectorAll('[data-v09-prop]').forEach(input => input.addEventListener('change', () => saveProperty(component.id, input.dataset.v09Prop, input.value)));
  }

  function injectCss() {
    if (document.getElementById('v09-component-css')) return;
    const style = document.createElement('style');
    style.id = 'v09-component-css';
    style.textContent = `
      .v09-palette-group{border-top:1px solid var(--line);padding-top:10px}.v09-custom-host{min-width:0}
      .v09-link{display:inline-flex;gap:6px;align-items:center;color:var(--blue);font-weight:700;text-decoration:none;font-size:12px}.v09-icon{line-height:1;display:inline-flex;align-items:center;justify-content:center;color:var(--blue)}
      .v09-avatar-row{display:flex;align-items:center;gap:10px}.v09-avatar-row strong{display:block;font-size:12px}.v09-avatar-row small{display:block;color:var(--muted);font-size:10px;margin-top:2px}.v09-avatar{border-radius:50%;display:grid;place-items:center;background:var(--surface-2);border:1px solid var(--line);font-size:11px;font-weight:800;color:var(--blue);flex:none}
      .v09-status{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:750;border:1px solid transparent}.v09-status.information{background:#eaf2ff;color:#205db1;border-color:#cfe0fa}.v09-status.success{background:#e9f8ef;color:#167144;border-color:#ccebd8}.v09-status.warning{background:#fff5dd;color:#8a5b00;border-color:#f3ddb0}.v09-status.error{background:#feeeee;color:#a62929;border-color:#f4cccc}.v09-status.neutral{background:var(--surface-2);color:var(--muted);border-color:var(--line)}
      .v09-amount{display:grid;gap:3px}.v09-amount small{color:var(--muted);font-size:10px}.v09-amount strong{font-size:24px;letter-spacing:-.02em}.v09-amount strong span{font-size:11px;color:var(--muted);font-weight:700}
      .v09-progress>div:first-child{display:flex;justify-content:space-between;gap:10px;font-size:10px;margin-bottom:6px}.v09-progress-track{height:8px;background:var(--surface-2);border:1px solid var(--line);border-radius:999px;overflow:hidden}.v09-progress-track i{display:block;height:100%;background:var(--blue);border-radius:999px}
      .v09-list,.v09-object-list,.v09-timeline,.v09-attachments{border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden}.v09-list>strong,.v09-object-list>strong,.v09-timeline>strong,.v09-attachments>strong{display:block;padding:10px 12px;border-bottom:1px solid var(--line);font-size:11px}.v09-list>small{display:block;padding:7px 12px;color:var(--muted);font-size:9px}.v09-list-item{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-top:1px solid var(--line);font-size:11px}.v09-list-item b{color:var(--muted);font-size:16px}
      .v09-object-row{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border-top:1px solid var(--line);font-size:10px}.v09-object-row>div{display:grid;gap:3px}.v09-object-row>div:last-child{text-align:right;justify-items:end}.v09-object-row small{color:var(--muted)}
      .v09-timeline{padding-bottom:8px}.v09-timeline-item{display:grid;grid-template-columns:14px 1fr;gap:8px;padding:8px 12px;position:relative}.v09-timeline-item i{width:8px;height:8px;border-radius:50%;background:var(--blue);margin-top:3px;box-shadow:0 0 0 3px color-mix(in srgb,var(--blue) 15%,transparent)}.v09-timeline-item p{margin:2px 0;font-size:10px}.v09-timeline-item small{color:var(--muted);font-size:9px}
      .v09-calendar{border:1px solid var(--line);border-radius:10px;overflow:hidden}.v09-calendar-head{display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--line);font-size:10px}.v09-calendar-head span{color:var(--muted)}.v09-calendar-grid{display:grid;grid-template-columns:repeat(7,1fr)}.v09-calendar-grid>div{min-height:48px;padding:5px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);font-size:9px}.v09-calendar-grid>div.has-event{background:color-mix(in srgb,var(--blue) 8%,var(--surface))}.v09-calendar-grid small{display:block;color:var(--blue);margin-top:4px;font-size:8px;overflow:hidden;text-overflow:ellipsis}
      .v09-value-help{border:1px solid var(--line-2);border-radius:7px;display:flex;justify-content:space-between;align-items:center;padding:8px 9px;background:var(--surface);font-size:11px}.v09-value-help b{color:var(--blue);font-size:16px}.v09-help{font-size:9px;color:var(--muted)}
      .v09-multi{border:1px solid var(--line-2);border-radius:7px;display:flex;gap:5px;flex-wrap:wrap;align-items:center;padding:5px;min-height:36px}.v09-multi span{background:var(--surface-2);border:1px solid var(--line);border-radius:999px;padding:4px 7px;font-size:9px}.v09-multi em{font-style:normal;color:var(--muted);font-size:10px;padding:3px}
      .v09-radio{display:flex;gap:13px;flex-wrap:wrap}.v09-radio span{display:flex;gap:5px;align-items:center;font-size:10px}.v09-radio i{width:13px;height:13px;border-radius:50%;border:1px solid var(--line-2);display:block}.v09-radio i.active{box-shadow:inset 0 0 0 3px var(--surface);background:var(--blue);border-color:var(--blue)}
      .v09-step{display:grid;grid-template-columns:34px 1fr 34px;border:1px solid var(--line-2);border-radius:7px;overflow:hidden}.v09-step button{border:0;background:var(--surface-2);color:var(--text)}.v09-step span{padding:8px;text-align:center;font-size:11px;border-left:1px solid var(--line);border-right:1px solid var(--line)}
      .v09-slider{height:8px;background:var(--surface-2);border-radius:999px;position:relative;margin:10px 3px}.v09-slider i{position:absolute;left:0;top:0;bottom:0;background:var(--blue);border-radius:999px}.v09-slider b{position:absolute;top:50%;width:15px;height:15px;border-radius:50%;background:var(--surface);border:3px solid var(--blue);transform:translate(-50%,-50%)}
      .v09-rating{display:flex;gap:3px;font-size:20px;color:#c8ccd2}.v09-rating span.on{color:#d99b10}.v09-upload{border:1px dashed var(--line-2);border-radius:10px;padding:20px;text-align:center;background:var(--surface-2)}.v09-upload>div{font-size:24px;color:var(--blue)}.v09-upload strong{display:block;font-size:11px;margin:5px}.v09-upload small{color:var(--muted);font-size:9px}
      .v09-panel{border:1px solid var(--line);border-radius:10px;overflow:hidden}.v09-panel-head{display:flex;justify-content:space-between;padding:10px 12px;background:var(--surface-2);border-bottom:1px solid var(--line);font-size:11px}.v09-panel p{padding:12px;margin:0;font-size:10px;color:var(--muted)}
      .v09-object-header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}.v09-object-header small{color:var(--muted);font-size:9px}.v09-object-header h3{margin:3px 0 7px;font-size:16px}.v09-object-number{text-align:right}.v09-object-number strong{display:block;font-size:22px}.v09-object-number span{font-size:10px;color:var(--muted)}
      .v09-wizard{display:flex;align-items:flex-start;justify-content:space-between;gap:4px}.v09-wizard>div{flex:1;text-align:center;position:relative;font-size:9px;color:var(--muted)}.v09-wizard>div:not(:last-child):after{content:'';position:absolute;height:2px;background:var(--line);left:60%;right:-40%;top:12px}.v09-wizard span{position:relative;z-index:1;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;margin:0 auto 5px;background:var(--surface-2);border:1px solid var(--line)}.v09-wizard .active span,.v09-wizard .done span{background:var(--blue);color:white;border-color:var(--blue)}.v09-wizard .done:after{background:var(--blue)}
      .v09-attachments>div{display:grid;grid-template-columns:18px 1fr auto 16px;gap:6px;align-items:center;padding:9px 12px;border-top:1px solid var(--line);font-size:10px}.v09-attachments small{color:var(--muted)}.v09-attachments em{font-style:normal;color:var(--muted)}
      .v09-empty,.v09-message{text-align:center;padding:24px;border:1px dashed var(--line-2);border-radius:10px;background:var(--surface-2)}.v09-empty>div,.v09-message>div{font-size:28px;color:var(--muted)}.v09-empty strong,.v09-message strong{display:block;margin:6px 0;font-size:12px}.v09-empty p,.v09-message p{font-size:10px;color:var(--muted);margin:4px auto 10px;max-width:420px}.v09-message.warning>div{color:#a66b00}.v09-message.error>div{color:#b33}.v09-message.success>div{color:#27845a}
      .v09-inspector{border-top:1px solid var(--line);padding-top:12px;margin-top:12px}
    `;
    document.head.appendChild(style);
  }

  function decorate() {
    injectCss();
    decoratePalette();
    decorateCanvas();
    decoratePreview();
    decorateInspector();
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const app = document.getElementById('app');
      if (observer) observer.disconnect();
      try { decorate(); }
      finally { if (observer && app) observer.observe(app, { childList: true, subtree: true }); }
    });
  }

  document.addEventListener('dragover', event => {
    if (!dragType) return;
    const zone = event.target.closest?.('.dropzone,[data-canvas-empty]');
    if (zone) event.preventDefault();
  }, true);

  document.addEventListener('drop', event => {
    if (!dragType) return;
    const zone = event.target.closest?.('.dropzone,[data-canvas-empty]');
    if (!zone) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const index = zone.matches('.dropzone') ? Number(zone.dataset.dropIndex) : 0;
    const type = dragType;
    dragType = '';
    addComponent(type, Number.isFinite(index) ? index : null);
  }, true);

  const app = document.getElementById('app');
  observer = new MutationObserver(scheduleDecorate);
  if (app) observer.observe(app, { childList: true, subtree: true });
  scheduleDecorate();
})();
