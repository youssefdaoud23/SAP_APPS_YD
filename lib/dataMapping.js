'use strict';

function getPath(source, path) {
  if (!path) return source;
  return String(path).split('.').reduce((value, key) => value == null ? undefined : value[key], source);
}

function template(value, context) {
  if (Array.isArray(value)) return value.map(item => template(item, context));
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) output[key] = template(item, context);
    return output;
  }
  if (typeof value !== 'string') return value;
  const exact = value.match(/^\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}$/);
  if (exact) {
    const resolved = getPath(context, exact[1]);
    return resolved === undefined ? null : resolved;
  }
  return value.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_, path) => {
    const resolved = getPath(context, path);
    if (resolved == null) return '';
    return typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
  });
}

function isEmptyMapping(mapping) {
  return !mapping || typeof mapping !== 'object' || Array.isArray(mapping) || Object.keys(mapping).length === 0;
}

function mapRequest(mapping, context, originalBody) {
  if (isEmptyMapping(mapping) || mapping.body === undefined) return { body: originalBody, contentType: null };
  const body = template(mapping.body, context);
  return { body: Buffer.from(JSON.stringify(body)), contentType: 'application/json; charset=utf-8' };
}

function pickObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const result = {};
  for (const key of keys || []) if (Object.prototype.hasOwnProperty.call(value, key)) result[key] = value[key];
  return result;
}

function renameObject(value, rename) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const result = { ...value };
  for (const [from, to] of Object.entries(rename || {})) {
    if (!Object.prototype.hasOwnProperty.call(result, from)) continue;
    result[to] = result[from];
    if (to !== from) delete result[from];
  }
  return result;
}

function mapResponse(mapping, value) {
  if (isEmptyMapping(mapping)) return value;
  let result = value;
  if (mapping.unwrap) result = getPath(result, mapping.unwrap);
  if (Array.isArray(result)) {
    if (Array.isArray(mapping.pick) && mapping.pick.length) result = result.map(item => pickObject(item, mapping.pick));
    if (mapping.rename && typeof mapping.rename === 'object') result = result.map(item => renameObject(item, mapping.rename));
  } else {
    if (Array.isArray(mapping.pick) && mapping.pick.length) result = pickObject(result, mapping.pick);
    if (mapping.rename && typeof mapping.rename === 'object') result = renameObject(result, mapping.rename);
  }
  if (mapping.wrap) result = { [String(mapping.wrap)]: result };
  return result;
}

module.exports = { getPath, template, mapRequest, mapResponse, isEmptyMapping };
