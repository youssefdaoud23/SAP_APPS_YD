'use strict';

function routeParameters(path) {
  const params = [];
  const seen = new Set();
  String(path || '').replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_, name) => {
    if (!seen.has(name)) {
      seen.add(name);
      params.push({ name, in: 'path', required: true, schema: { type: 'string' } });
    }
    return _;
  });
  return params;
}

function normalizePath(basePath, operationPath) {
  const base = String(basePath || '').replace(/^\/+|\/+$/g, '');
  const op = String(operationPath || '/').replace(/^\/+/, '');
  const combined = [base, op].filter(Boolean).join('/');
  return `/${combined}`.replace(/\/+/g, '/');
}

function schemaFromMapping(mapping, fallback = { type: 'object', additionalProperties: true }) {
  if (mapping && typeof mapping === 'object' && !Array.isArray(mapping)) {
    if (mapping.schema && typeof mapping.schema === 'object' && !Array.isArray(mapping.schema)) return mapping.schema;
    if (mapping.body && typeof mapping.body === 'object' && !Array.isArray(mapping.body)) {
      const properties = {};
      for (const key of Object.keys(mapping.body)) properties[key] = {};
      return { type: 'object', properties, additionalProperties: true };
    }
  }
  return fallback;
}

function buildOpenApi(api, options = {}) {
  const runtimeBase = options.runtimeBase || `/runtime/api/${api.slug}`;
  const paths = {};
  for (const operation of api.operations || []) {
    if (operation.enabled === false) continue;
    const path = normalizePath('/', operation.path || '/');
    const method = String(operation.method || 'GET').toLowerCase();
    if (!paths[path]) paths[path] = {};
    const entry = {
      operationId: operation.id || `${method}-${path.replace(/[^A-Za-z0-9]+/g, '-')}`,
      summary: operation.summary || undefined,
      description: operation.description || undefined,
      parameters: routeParameters(operation.path),
      responses: {
        '200': {
          description: 'Successful response',
          content: { 'application/json': { schema: schemaFromMapping(operation.responseMapping) } }
        },
        '400': { description: 'Invalid request' },
        '401': { description: 'Authentication required' },
        '403': { description: 'Permission denied' },
        '502': { description: 'Upstream SAP request failed' }
      },
      'x-invarture-mode': operation.mode || 'sap-proxy',
      'x-invarture-runtime-path': `${runtimeBase}${operation.path === '/' ? '' : operation.path}`
    };
    if (!['get','head'].includes(method)) {
      entry.requestBody = {
        required: false,
        content: { 'application/json': { schema: schemaFromMapping(operation.requestMapping) } }
      };
    }
    paths[path][method] = entry;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: api.name,
      version: `revision-${Number(api.revision || 1)}`,
      description: api.description || undefined
    },
    servers: [{ url: runtimeBase, description: 'Invarture App Studio runtime' }],
    paths,
    components: {
      securitySchemes: {
        platformSession: { type: 'apiKey', in: 'cookie', name: 'invarture_session', description: 'Authenticated Invarture App Studio session.' }
      }
    },
    security: [{ platformSession: [] }],
    'x-invarture-api-id': api.id,
    'x-invarture-status': api.status
  };
}

module.exports = { buildOpenApi, routeParameters, normalizePath, schemaFromMapping };
