'use strict';

const database = require('../lib/database');
const { buildOpenApi } = require('../lib/openapi');
const { hasPermission } = require('../lib/securityModel');

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}

async function getDefinition(where, value, publishedOnly = false) {
  await database.ensureDatabase();
  const column = where === 'slug' ? 'slug' : 'api_id';
  const result = await database.getPool().query(`
    SELECT api_id AS id,name,slug,description,base_path AS "basePath",status,revision::int
    FROM platform_api_definitions
    WHERE ${column}=$1 ${publishedOnly ? "AND status='published'" : ''}
  `, [value]);
  const api = result.rows[0];
  if (!api) return null;
  const operations = await database.getPool().query(`
    SELECT operation_id AS id,method,path,summary,description,mode,connection_id AS "connectionId",
           upstream_path AS "upstreamPath",request_mapping AS "requestMapping",response_mapping AS "responseMapping",
           headers,timeout_ms AS "timeoutMs",enabled
    FROM platform_api_operations WHERE api_id=$1 ORDER BY path,method
  `, [api.id]);
  return { ...api, operations: operations.rows };
}

module.exports = async function openApiHandler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Only GET is supported.' });
  if (!database.enabled()) return send(res, 503, { error: 'PostgreSQL is required for OpenAPI documents.' });
  try {
    const url = new URL(req.url, 'http://localhost');
    const runtimePrefix = '/runtime/openapi/';
    let api;
    let runtimeBase;

    if (url.pathname.startsWith(runtimePrefix)) {
      if (!hasPermission(req.principal, 'apps.view')) return send(res, 403, { error: 'Permission apps.view is required.' });
      const slug = decodeURIComponent(url.pathname.slice(runtimePrefix.length)).replace(/\.json$/i, '');
      if (!slug) return send(res, 400, { error: 'API slug is required.' });
      api = await getDefinition('slug', slug, true);
      runtimeBase = `/runtime/api/${slug}`;
    } else {
      if (!hasPermission(req.principal, 'api.manage')) return send(res, 403, { error: 'Permission api.manage is required.' });
      const apiId = String(url.searchParams.get('apiId') || '').trim().slice(0, 100);
      if (!apiId) return send(res, 400, { error: 'apiId is required.' });
      api = await getDefinition('id', apiId, false);
      runtimeBase = api ? `/runtime/api/${api.slug}` : '';
    }

    if (!api) return send(res, 404, { error: 'API definition not found.' });
    const document = buildOpenApi(api, { runtimeBase });
    return send(res, 200, document, 'application/vnd.oai.openapi+json;version=3.1; charset=utf-8');
  } catch (error) {
    return send(res, Number(error.statusCode) || 500, { error: error.message || 'OpenAPI generation failed.' });
  }
};
