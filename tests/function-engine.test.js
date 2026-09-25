'use strict';

const assert = require('assert');
const { principal } = require('../lib/securityModel');
const { authorizeConnectionRequest, isProductionConnection } = require('../lib/connectionPolicy');
const { execute, interpolate, validateInputSchema } = require('../lib/functionEngine');

(async () => {
  const context = { input: { id: 'P100', amount: 42 }, vars: { name: 'Demo' }, steps: {} };
  assert.strictEqual(interpolate('Products/{{input.id}}', context), 'Products/P100');
  assert.deepStrictEqual(interpolate('{{input}}', context), context.input);
  assert.deepStrictEqual(interpolate({ value: '{{input.amount}}', label: '{{vars.name}}' }, context), { value: 42, label: 'Demo' });

  validateInputSchema({ id: 'P100', active: true }, {
    required: ['id'],
    properties: { id: { type: 'string' }, active: { type: 'boolean' } }
  });
  assert.throws(() => validateInputSchema({}, { required: ['id'] }), /Required input field id/);
  assert.throws(() => validateInputSchema({ id: 1 }, { properties: { id: { type: 'string' } } }), /must be of type string/);

  const developer = principal('dev', ['developer'], 'test');
  const admin = principal('admin', ['platform-admin'], 'test');
  assert.strictEqual(isProductionConnection({ environment: 'PRD' }), true);
  assert.strictEqual(isProductionConnection({ stage: 'production' }), true);
  assert.strictEqual(isProductionConnection({ production: true }), true);
  assert.strictEqual(isProductionConnection({ environment: 'DEV' }), false);
  assert.strictEqual(authorizeConnectionRequest(developer, { environment: 'DEV' }, 'GET').ok, true);
  assert.strictEqual(authorizeConnectionRequest(developer, { environment: 'DEV' }, 'POST').ok, true);
  assert.strictEqual(authorizeConnectionRequest(developer, { environment: 'PRD' }, 'POST').ok, false);
  assert.match(authorizeConnectionRequest(developer, { environment: 'PRD' }, 'POST').error, /production.write/);
  assert.strictEqual(authorizeConnectionRequest(admin, { environment: 'PRD' }, 'POST').ok, true);

  const result = await execute({
    inputSchema: { required: ['who'], properties: { who: { type: 'string' } } },
    timeoutMs: 5000,
    steps: [
      { type: 'set', key: 'message', value: 'Hello {{input.who}}' },
      { type: 'respond', value: { message: '{{vars.message}}', user: '{{principal.username}}' } }
    ]
  }, { who: 'SAP' }, admin);
  assert.deepStrictEqual(result, { message: 'Hello SAP', user: 'admin' });

  console.log('functionEngine tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
