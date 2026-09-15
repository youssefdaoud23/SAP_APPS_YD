'use strict';

const database = require('../lib/database');
const { hasPermission } = require('../lib/securityModel');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function boundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value == null ? '' : value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

module.exports = async function auditHandler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Only GET is supported.' });
  if (!hasPermission(req.principal, 'audit.view')) return send(res, 403, { error: 'Permission audit.view is required.' });
  if (!database.enabled()) return send(res, 503, { error: 'PostgreSQL is required for the audit log.' });

  try {
    await database.ensureDatabase();
    const url = new URL(req.url, 'http://localhost');
    const limit = boundedInt(url.searchParams.get('limit'), 50, 1, 200);
    const offset = boundedInt(url.searchParams.get('offset'), 0, 0, 1000000);
    const eventType = String(url.searchParams.get('eventType') || '').trim().slice(0, 160);
    const actor = String(url.searchParams.get('actor') || '').trim().slice(0, 160);
    const search = String(url.searchParams.get('search') || '').trim().slice(0, 200);

    const where = [];
    const values = [];
    const add = value => {
      values.push(value);
      return `$${values.length}`;
    };

    if (eventType) where.push(`event_type = ${add(eventType)}`);
    if (actor) where.push(`actor = ${add(actor)}`);
    if (search) {
      const ref = add(`%${search}%`);
      where.push(`(event_type ILIKE ${ref} OR COALESCE(actor,'') ILIKE ${ref} OR COALESCE(target_type,'') ILIKE ${ref} OR COALESCE(target_id,'') ILIKE ${ref} OR details::text ILIKE ${ref})`);
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await database.getPool().query(`SELECT COUNT(*)::int AS count FROM platform_audit_events ${clause}`, values);
    const limitRef = add(limit);
    const offsetRef = add(offset);
    const result = await database.getPool().query(`
      SELECT event_id AS "id", event_type AS "eventType", actor,
             target_type AS "targetType", target_id AS "targetId",
             details, created_at AS "createdAt"
      FROM platform_audit_events
      ${clause}
      ORDER BY event_id DESC
      LIMIT ${limitRef} OFFSET ${offsetRef}
    `, values);

    return send(res, 200, {
      events: result.rows,
      total: countResult.rows[0]?.count || 0,
      limit,
      offset,
      hasMore: offset + result.rows.length < (countResult.rows[0]?.count || 0)
    });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Audit log unavailable.' });
  }
};
