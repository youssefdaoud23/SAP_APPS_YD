'use strict';
const assert = require('assert');
const model = require('../lib/platformModel');

function makeWorkspace() {
  return {
    schemaVersion: 2,
    currentAppId: 'a1',
    currentPageId: 'p1',
    connections: [
      { id: 'server:dev', name: 'DEV' },
      { id: 'server:qas', name: 'QAS' }
    ],
    apps: [{ id: 'a1', name: 'Test', pages: [{ id: 'p1', name: 'Main', components: [] }], versions: [] }]
  };
}

{
  const state = makeWorkspace();
  model.ensureWorkspace(state);
  assert.equal(state.extensionSchemaVersion, 1);
  assert.equal(state.currentEnvironment, 'DEV');
  assert.deepEqual(state.environments.map(e => e.id), ['DEV','QAS','PRD']);
  assert.ok(Array.isArray(state.apps[0].variables));
  assert.ok(Array.isArray(state.fragments));
}

{
  const state = makeWorkspace(); model.ensureWorkspace(state);
  state.connectionAliases.push({ id:'SAP_PRIMARY', name:'Primary', mappings:{ DEV:'server:dev', QAS:'server:qas' } });
  let resolved = model.resolveDataSource(state, 'alias:SAP_PRIMARY');
  assert.equal(resolved.serverId, 'dev');
  state.currentEnvironment = 'QAS';
  resolved = model.resolveDataSource(state, 'alias:SAP_PRIMARY');
  assert.equal(resolved.serverId, 'qas');
  assert.equal(model.resolveDataSource(state, 'server:dev').serverId, 'dev');
}

{
  const path = model.buildODataPath({
    base:'PurchaseOrders', select:'PurchaseOrder,Supplier', filter:"Status eq 'Open'", orderby:'PurchaseOrder desc',
    expand:'Items', top:25, skip:10, count:'true'
  });
  assert.ok(path.startsWith('PurchaseOrders?'));
  assert.ok(path.includes('$select=PurchaseOrder,Supplier'));
  assert.ok(path.includes('$expand=Items'));
  assert.ok(path.includes('$top=25'));
  const parsed = model.parseODataPath('/' + path);
  assert.equal(parsed.base, 'PurchaseOrders');
  assert.equal(parsed.expand, 'Items');
  assert.equal(parsed.top, '25');
  assert.equal(parsed.skip, '10');
  assert.equal(parsed.count, 'true');
}

{
  const layout = model.createLayout(3);
  assert.equal(layout.type, 'layout');
  assert.equal(layout.slots.length, 3);
  layout.slots[0].push(model.createComponent('text', { text:'Hello' }));
  const cloned = model.cloneComponentWithNewIds(layout);
  assert.notEqual(cloned.id, layout.id);
  assert.notEqual(cloned.slots[0][0].id, layout.slots[0][0].id);
}

{
  const state = makeWorkspace(); model.ensureWorkspace(state);
  const app = state.apps[0];
  app.variables.push({ id:'v1', name:'companyCode', type:'string', scope:'application', defaultValue:'1000', persist:false });
  assert.equal(model.interpolate('Company {{companyCode}}', model.variableMap(app)), 'Company 1000');
}

{
  const state = makeWorkspace(); model.ensureWorkspace(state);
  state.connectionAliases.push({ id:'SAP_PRIMARY', name:'Primary', mappings:{ DEV:'server:dev' } });
  const app = state.apps[0];
  app.pages[0].components.push({ id:'t1', type:'table', dataSource:'alias:SAP_PRIMARY', binding:'/Orders' });
  let issues = model.validateApp(state, app);
  assert.equal(issues.filter(i=>i.severity==='error').length, 0);
  state.currentEnvironment='QAS';
  issues = model.validateApp(state, app);
  assert.ok(issues.some(i=>i.code==='binding.alias' && i.severity==='error'));
}

console.log('platformModel tests passed');
