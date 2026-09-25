'use strict';

const assert = require('assert');
const componentCatalog = require('../lib/componentCatalogV09');
const workflowStore = require('../lib/workflowStore');
const workflowEngine = require('../lib/workflowEngine');
const dataMapping = require('../lib/dataMapping');
const openapi = require('../lib/openapi');
const rfc = require('../lib/rfcConnector');

function testComponents() {
  assert.ok(Object.keys(componentCatalog.COMPONENTS).length >= 20, 'enterprise catalog should have broad coverage');
  assert.ok(componentCatalog.COMPONENTS.valueHelp, 'value help component missing');
  assert.ok(componentCatalog.COMPONENTS.objectStatus, 'object status component missing');
  assert.ok(componentCatalog.COMPONENTS.wizard, 'wizard component missing');
  const html = componentCatalog.render('pageHeader', { title:'PO <450001>', subtitle:'ACME', status:'Open', number:'10', unit:'EUR' });
  assert.ok(html.includes('PO &lt;450001&gt;'), 'renderer must escape component text');
  assert.ok(!html.includes('PO <450001>'), 'renderer emitted unsafe raw text');
}

function testWorkflowModel() {
  const steps = [
    { id:'start', type:'start', next:'decision' },
    { id:'decision', type:'condition', path:'input.amount', operator:'gte', value:10000, then:'approve', else:'end' },
    { id:'approve', type:'approval', approveNext:'end', rejectNext:'end' },
    { id:'end', type:'end' }
  ];
  assert.strictEqual(workflowStore.validateSteps(steps), steps);
  assert.throws(() => workflowStore.validateSteps([{id:'one',type:'end'}]), /exactly one start/);
  assert.throws(() => workflowStore.validateSteps([{id:'start',type:'start',next:'missing'}]), /missing next step/);
  assert.strictEqual(workflowEngine.interpolate('PO {{input.id}}', { input:{id:'450001'} }), 'PO 450001');
  assert.strictEqual(workflowEngine.nextForCondition(steps[1], { input:{amount:12000} }), 'approve');
  assert.strictEqual(workflowEngine.nextForCondition(steps[1], { input:{amount:5000} }), 'end');
}

function testMappings() {
  const context = { body:{comment:'Approved'}, params:{id:'450001'}, principal:{username:'joe'} };
  const mapped = dataMapping.mapRequest({ body:{ PurchaseOrder:'{{params.id}}', Comment:'{{body.comment}}', User:'{{principal.username}}' } }, context, Buffer.from('{}'));
  assert.strictEqual(mapped.contentType, 'application/json; charset=utf-8');
  assert.deepStrictEqual(JSON.parse(mapped.body.toString('utf8')), { PurchaseOrder:'450001', Comment:'Approved', User:'joe' });
  const response = dataMapping.mapResponse({ unwrap:'d.results', pick:['PurchaseOrder','NetAmount'], rename:{PurchaseOrder:'id'}, wrap:'items' }, { d:{ results:[{PurchaseOrder:'450001',NetAmount:'100',Secret:'x'}] } });
  assert.deepStrictEqual(response, { items:[{id:'450001',NetAmount:'100'}] });
}

function testOpenApi() {
  const api = {
    id:'api-1', name:'Purchase Orders', slug:'purchase-orders', description:'PO API', status:'published', revision:4,
    operations:[
      { id:'op-get', method:'GET', path:'/orders/{id}', summary:'Get order', enabled:true, requestMapping:{}, responseMapping:{schema:{type:'object',properties:{id:{type:'string'}}}} },
      { id:'op-post', method:'POST', path:'/orders', summary:'Create order', enabled:true, requestMapping:{schema:{type:'object',required:['supplier']}}, responseMapping:{} }
    ]
  };
  const document = openapi.buildOpenApi(api);
  assert.strictEqual(document.openapi, '3.1.0');
  assert.ok(document.paths['/orders/{id}'].get);
  assert.deepStrictEqual(document.paths['/orders/{id}'].get.parameters[0], { name:'id', in:'path', required:true, schema:{type:'string'} });
  assert.ok(document.paths['/orders'].post.requestBody);
  assert.strictEqual(document['x-invarture-status'], 'published');
}

function testRfcConfig() {
  const old = process.env.SAP_RFC_CONNECTIONS_JSON;
  const oldAllow = process.env.SAP_ALLOW_HTTP;
  try {
    process.env.SAP_ALLOW_HTTP = 'true';
    process.env.SAP_RFC_CONNECTIONS_JSON = JSON.stringify([{ id:'lab', name:'Lab RFC', baseUrl:'http://localhost:9999/rfc/', readOnlyFunctions:['BAPI_USER_GET_DETAIL'], allowedFunctions:['BAPI_USER_GET_DETAIL','BAPI_USER_CHANGE'] }]);
    const connections = rfc.parseConnections();
    assert.strictEqual(connections.length, 1);
    assert.strictEqual(rfc.functionName('bapi_user_get_detail'), 'BAPI_USER_GET_DETAIL');
    assert.strictEqual(rfc.isReadOnly(connections[0], 'BAPI_USER_GET_DETAIL'), true);
    assert.strictEqual(rfc.isReadOnly(connections[0], 'BAPI_USER_CHANGE'), false);
    assert.throws(() => rfc.functionName('BAPI USER GET'), /unsupported characters/);
  } finally {
    if (old == null) delete process.env.SAP_RFC_CONNECTIONS_JSON; else process.env.SAP_RFC_CONNECTIONS_JSON = old;
    if (oldAllow == null) delete process.env.SAP_ALLOW_HTTP; else process.env.SAP_ALLOW_HTTP = oldAllow;
  }
}

testComponents();
testWorkflowModel();
testMappings();
testOpenApi();
testRfcConfig();
console.log('v0.9 platform tests passed');
