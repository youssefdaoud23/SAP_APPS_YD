(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.InvartureModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const EXTENSION_SCHEMA_VERSION = 1;
  const DEFAULT_ENVIRONMENTS = [
    { id: 'DEV', name: 'Development' },
    { id: 'QAS', name: 'Quality' },
    { id: 'PRD', name: 'Production' }
  ];

  const COMPONENTS = {
    heading: { group: 'Basic', label: 'Heading', icon: 'H', bindable: false, defaults: { text: 'Heading', level: 'h2', align: 'left' } },
    text: { group: 'Basic', label: 'Text', icon: '¶', bindable: true, defaults: { text: 'Text', align: 'left' } },
    button: { group: 'Basic', label: 'Button', icon: '▣', bindable: false, defaults: { text: 'Action', variant: 'primary' } },
    divider: { group: 'Basic', label: 'Divider', icon: '─', bindable: false, defaults: {} },
    spacer: { group: 'Basic', label: 'Spacer', icon: '↕', bindable: false, defaults: { height: '28' } },
    input: { group: 'Forms', label: 'Input', icon: '⌨', bindable: true, defaults: { label: 'Input', placeholder: 'Enter value', bindingMode: 'twoWay' } },
    textarea: { group: 'Forms', label: 'Text area', icon: '▤', bindable: true, defaults: { label: 'Notes', placeholder: 'Enter text', bindingMode: 'twoWay' } },
    select: { group: 'Forms', label: 'Select', icon: '⌄', bindable: true, defaults: { label: 'Select', options: 'Option A,Option B', bindingMode: 'twoWay' } },
    checkbox: { group: 'Forms', label: 'Checkbox', icon: '☐', bindable: true, defaults: { label: 'Checkbox', checked: false, bindingMode: 'twoWay' } },
    switch: { group: 'Forms', label: 'Switch', icon: '◉', bindable: true, defaults: { label: 'Enabled', checked: true, bindingMode: 'twoWay' } },
    date: { group: 'Forms', label: 'Date', icon: '▦', bindable: true, defaults: { label: 'Date', placeholder: 'YYYY-MM-DD', bindingMode: 'twoWay' } },
    kpi: { group: 'Data', label: 'KPI', icon: '42', bindable: true, defaults: { label: 'Metric', value: '0', trend: '', bindingMode: 'oneWay' } },
    table: { group: 'Data', label: 'Table', icon: '▥', bindable: true, defaults: { columns: '', pageSize: '10', bindingMode: 'list' } },
    chart: { group: 'Data', label: 'Chart', icon: '▥', bindable: true, defaults: { title: 'Chart', labels: '', values: '', bindingMode: 'list' } },
    card: { group: 'Layout', label: 'Card', icon: '▢', bindable: false, defaults: { title: 'Card', text: '' } },
    toolbar: { group: 'Layout', label: 'Toolbar', icon: '≡', bindable: false, defaults: { title: 'Toolbar', buttonText: 'Action' } },
    tabs: { group: 'Layout', label: 'Tabs', icon: '▤', bindable: false, defaults: { tabs: 'Overview,Details', active: 'Overview' } },
    alert: { group: 'Feedback', label: 'Info strip', icon: 'i', bindable: false, defaults: { text: 'Information' } },
    image: { group: 'Media', label: 'Image', icon: '▧', bindable: false, defaults: { url: '', alt: 'Image', height: '150' } },
    layout: { group: 'Layout', label: 'Layout container', icon: '▦', bindable: false, container: true, defaults: { layoutKind: 'columns', columns: 2, gap: 12, background: 'transparent', slots: [[], []] } }
  };

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function uid(prefix = 'id') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeEnvironmentId(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
  }

  function normalizeAliasId(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
  }

  function componentChildren(component) {
    if (!component || typeof component !== 'object') return [];
    const groups = [];
    if (Array.isArray(component.children)) groups.push(component.children);
    if (Array.isArray(component.slots)) {
      for (const slot of component.slots) if (Array.isArray(slot)) groups.push(slot);
    }
    return groups;
  }

  function walkComponent(component, visitor, parent = null, path = []) {
    visitor(component, parent, path);
    const groups = componentChildren(component);
    groups.forEach((group, groupIndex) => {
      group.forEach((child, childIndex) => walkComponent(child, visitor, component, path.concat([groupIndex, childIndex])));
    });
  }

  function walkAppComponents(app, visitor) {
    for (const page of app?.pages || []) {
      for (const component of page.components || []) walkComponent(component, (c, parent, path) => visitor(c, page, parent, path));
    }
  }

  function ensureComponent(component) {
    if (!component || typeof component !== 'object') return component;
    if (!component.id) component.id = uid('cmp');
    if (component.type === 'layout') {
      const columns = Math.max(1, Math.min(4, Number(component.columns) || 2));
      component.columns = columns;
      component.gap = Math.max(0, Math.min(48, Number(component.gap) || 12));
      if (!Array.isArray(component.slots)) component.slots = [];
      while (component.slots.length < columns) component.slots.push([]);
      component.slots = component.slots.slice(0, columns).map(slot => Array.isArray(slot) ? slot : []);
    }
    for (const group of componentChildren(component)) for (const child of group) ensureComponent(child);
    return component;
  }

  function ensureWorkspace(state) {
    if (!state || typeof state !== 'object') return state;
    state.extensionSchemaVersion = EXTENSION_SCHEMA_VERSION;
    if (!Array.isArray(state.environments) || !state.environments.length) state.environments = clone(DEFAULT_ENVIRONMENTS);
    state.environments = state.environments.map(env => ({ id: normalizeEnvironmentId(env.id) || 'ENV', name: String(env.name || env.id || 'Environment') }));
    if (!state.currentEnvironment || !state.environments.some(e => e.id === state.currentEnvironment)) state.currentEnvironment = state.environments[0].id;
    if (!Array.isArray(state.connectionAliases)) state.connectionAliases = [];
    state.connectionAliases = state.connectionAliases.map(alias => ({
      id: normalizeAliasId(alias.id) || 'SAP_PRIMARY',
      name: String(alias.name || alias.id || 'Connection alias'),
      mappings: alias.mappings && typeof alias.mappings === 'object' ? alias.mappings : {}
    }));
    if (!Array.isArray(state.fragments)) state.fragments = [];
    for (const app of state.apps || []) {
      if (!Array.isArray(app.variables)) app.variables = [];
      app.variables = app.variables.map(variable => ({
        id: variable.id || uid('var'),
        name: String(variable.name || 'variable'),
        type: ['string','number','boolean','date','json'].includes(variable.type) ? variable.type : 'string',
        scope: ['application','page','session'].includes(variable.scope) ? variable.scope : 'application',
        defaultValue: variable.defaultValue == null ? '' : variable.defaultValue,
        persist: Boolean(variable.persist)
      }));
      for (const page of app.pages || []) for (const component of page.components || []) ensureComponent(component);
    }
    return state;
  }

  function resolveDataSource(state, reference, environmentId) {
    const value = String(reference || '');
    if (!value) return { kind: 'none', reference: '', serverId: '' };
    if (value.startsWith('server:')) return { kind: 'server', reference: value, serverId: value.slice(7) };
    if (!value.startsWith('alias:')) return { kind: 'local', reference: value, serverId: '' };
    const aliasId = normalizeAliasId(value.slice(6));
    const alias = (state?.connectionAliases || []).find(item => item.id === aliasId);
    const env = environmentId || state?.currentEnvironment || 'DEV';
    const mapped = alias?.mappings?.[env] || '';
    return {
      kind: 'alias',
      reference: value,
      aliasId,
      environment: env,
      mapped,
      serverId: String(mapped).startsWith('server:') ? String(mapped).slice(7) : ''
    };
  }

  function parseODataPath(binding = '') {
    const raw = String(binding || '').trim().replace(/^\/+/, '');
    const question = raw.indexOf('?');
    const base = question >= 0 ? raw.slice(0, question) : raw;
    const params = new URLSearchParams(question >= 0 ? raw.slice(question + 1) : '');
    return {
      base,
      select: params.get('$select') || '',
      filter: params.get('$filter') || '',
      orderby: params.get('$orderby') || '',
      top: params.get('$top') || '',
      skip: params.get('$skip') || '',
      expand: params.get('$expand') || '',
      search: params.get('$search') || '',
      count: params.get('$count') || ''
    };
  }

  function buildODataPath(query = {}) {
    const base = String(query.base || '').trim().replace(/^\/+/, '');
    const params = new URLSearchParams();
    for (const [key, value] of [
      ['$select', query.select], ['$filter', query.filter], ['$orderby', query.orderby], ['$top', query.top],
      ['$skip', query.skip], ['$expand', query.expand], ['$search', query.search], ['$count', query.count]
    ]) {
      if (value !== undefined && value !== null && String(value).trim() !== '') params.set(key, String(value).trim());
    }
    const qs = params.toString()
      .replace(/%24/g, '$').replace(/%2C/gi, ',').replace(/%20/g, '%20').replace(/%27/gi, "'")
      .replace(/%28/gi, '(').replace(/%29/gi, ')').replace(/%2F/gi, '/').replace(/%3A/gi, ':');
    return `${base}${qs ? `?${qs}` : ''}`;
  }

  function cloneComponentWithNewIds(component) {
    const copy = clone(component);
    walkComponent(copy, child => { child.id = uid('cmp'); });
    return copy;
  }

  function createLayout(columns = 2) {
    const count = Math.max(1, Math.min(4, Number(columns) || 2));
    return {
      id: uid('cmp'), type: 'layout', layoutKind: count === 1 ? 'section' : 'columns', columns: count,
      gap: 12, background: 'transparent', slots: Array.from({ length: count }, () => [])
    };
  }

  function createComponent(type, overrides = {}) {
    const meta = COMPONENTS[type];
    if (!meta) throw new Error(`Unknown component type: ${type}`);
    const component = { id: uid('cmp'), type, ...clone(meta.defaults), ...clone(overrides) };
    return ensureComponent(component);
  }

  function variableMap(app, runtimeValues = {}) {
    const result = {};
    for (const variable of app?.variables || []) {
      result[variable.name] = Object.prototype.hasOwnProperty.call(runtimeValues, variable.name) ? runtimeValues[variable.name] : variable.defaultValue;
    }
    return result;
  }

  function interpolate(value, variables = {}) {
    return String(value == null ? '' : value).replace(/\{\{\s*(?:app\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_, name) => {
      const resolved = variables[name];
      if (resolved == null) return '';
      return typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
    });
  }

  function validateApp(state, app) {
    const issues = [];
    const add = (severity, code, message, detail = {}) => issues.push({ severity, code, message, ...detail });
    if (!app) return [{ severity: 'error', code: 'app.missing', message: 'Application is missing.' }];
    if (!String(app.name || '').trim()) add('error', 'app.name', 'Application name is required.');
    if (!Array.isArray(app.pages) || !app.pages.length) add('error', 'app.pages', 'Application must contain at least one page.');
    const ids = new Set();
    const variableNames = new Set();
    for (const variable of app.variables || []) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.name || '')) add('error', 'variable.name', `Variable "${variable.name || ''}" has an invalid name.`, { variableId: variable.id });
      if (variableNames.has(variable.name)) add('error', 'variable.duplicate', `Variable "${variable.name}" is duplicated.`, { variableId: variable.id });
      variableNames.add(variable.name);
    }
    for (const page of app.pages || []) {
      if (!String(page.name || '').trim()) add('warning', 'page.name', 'A page has no name.', { pageId: page.id });
      if (!(page.components || []).length) add('info', 'page.empty', `Page "${page.name || page.id}" is empty.`, { pageId: page.id });
      for (const root of page.components || []) {
        walkComponent(root, component => {
          if (!component.id) add('error', 'component.id', 'A component is missing an ID.', { pageId: page.id });
          else if (ids.has(component.id)) add('error', 'component.duplicate', `Duplicate component ID "${component.id}".`, { pageId: page.id, componentId: component.id });
          else ids.add(component.id);
          const meta = COMPONENTS[component.type];
          if (!meta) add('warning', 'component.unknown', `Unknown component type "${component.type}".`, { componentId: component.id });
          if (component.dataSource) {
            const resolved = resolveDataSource(state, component.dataSource);
            if (resolved.kind === 'alias' && !resolved.mapped) add('error', 'binding.alias', `Alias ${resolved.aliasId} has no mapping for ${resolved.environment}.`, { componentId: component.id });
            if ((resolved.kind === 'server' || resolved.kind === 'alias') && !String(component.binding || '').trim()) add('warning', 'binding.path', `Component ${component.id} has a server data source but no binding path.`, { componentId: component.id });
          }
          const action = component.action || component.logic;
          if (action?.type?.startsWith?.('odata-')) {
            if (!action.dataSource) add('error', 'logic.datasource', `OData action on ${component.id} has no connection.`, { componentId: component.id });
            if (!action.path) add('error', 'logic.path', `OData action on ${component.id} has no path.`, { componentId: component.id });
            if (action.dataSource) {
              const actionSource = resolveDataSource(state, action.dataSource);
              if (actionSource.kind === 'alias' && !actionSource.mapped) add('error', 'logic.alias', `Action alias ${actionSource.aliasId} has no mapping for ${actionSource.environment}.`, { componentId: component.id });
            }
          }
        });
      }
    }
    return issues;
  }

  function summarizeApp(app) {
    let components = 0;
    walkAppComponents(app, () => { components += 1; });
    return {
      pages: app?.pages?.length || 0,
      components,
      variables: app?.variables?.length || 0,
      versions: app?.versions?.length || 0
    };
  }

  return {
    EXTENSION_SCHEMA_VERSION,
    DEFAULT_ENVIRONMENTS,
    COMPONENTS,
    clone,
    uid,
    ensureWorkspace,
    ensureComponent,
    walkComponent,
    walkAppComponents,
    resolveDataSource,
    parseODataPath,
    buildODataPath,
    cloneComponentWithNewIds,
    createLayout,
    createComponent,
    variableMap,
    interpolate,
    validateApp,
    summarizeApp,
    normalizeAliasId,
    normalizeEnvironmentId
  };
});
