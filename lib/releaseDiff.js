'use strict';

const IGNORED_KEYS = new Set(['updatedAt', 'createdAt']);

function cleanPath(path) {
  return path.length ? path.join('.') : '$';
}

function same(a, b) {
  if (a === b) return true;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  return false;
}

function summarize(value, max = 220) {
  if (value === undefined) return '[missing]';
  if (value === null) return null;
  if (typeof value === 'string') return value.length > max ? `${value.slice(0, max)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return `[array:${value.length}]`;
  if (typeof value === 'object') return `{object:${Object.keys(value).length}}`;
  return String(value).slice(0, max);
}

function identity(item, index) {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    for (const key of ['id', 'key', 'name', 'type']) {
      const value = item[key];
      if (typeof value === 'string' && value) return `${key}:${value}`;
    }
  }
  return `index:${index}`;
}

function diffValues(before, after, path = [], changes = [], limit = 1000) {
  if (changes.length >= limit || same(before, after)) return changes;
  if (before === undefined) {
    changes.push({ kind: 'added', path: cleanPath(path), before: '[missing]', after: summarize(after) });
    return changes;
  }
  if (after === undefined) {
    changes.push({ kind: 'removed', path: cleanPath(path), before: summarize(before), after: '[missing]' });
    return changes;
  }
  const beforeArray = Array.isArray(before);
  const afterArray = Array.isArray(after);
  if (beforeArray || afterArray) {
    if (!(beforeArray && afterArray)) {
      changes.push({ kind: 'changed', path: cleanPath(path), before: summarize(before), after: summarize(after) });
      return changes;
    }
    const beforeMap = new Map(before.map((item, index) => [identity(item, index), item]));
    const afterMap = new Map(after.map((item, index) => [identity(item, index), item]));
    const keys = Array.from(new Set([...beforeMap.keys(), ...afterMap.keys()])).sort();
    for (const key of keys) {
      if (changes.length >= limit) break;
      diffValues(beforeMap.get(key), afterMap.get(key), [...path, `[${key}]`], changes, limit);
    }
    return changes;
  }
  const beforeObject = before && typeof before === 'object';
  const afterObject = after && typeof after === 'object';
  if (beforeObject || afterObject) {
    if (!(beforeObject && afterObject)) {
      changes.push({ kind: 'changed', path: cleanPath(path), before: summarize(before), after: summarize(after) });
      return changes;
    }
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(key => !IGNORED_KEYS.has(key)).sort();
    for (const key of keys) {
      if (changes.length >= limit) break;
      diffValues(before[key], after[key], [...path, key], changes, limit);
    }
    return changes;
  }
  changes.push({ kind: 'changed', path: cleanPath(path), before: summarize(before), after: summarize(after) });
  return changes;
}

function category(path) {
  if (/\.pages(?:\.|\[)/.test(path) || path.startsWith('pages')) return 'pages';
  if (/components(?:\.|\[)/.test(path)) return 'components';
  if (/bindings|variables|state|dataSource/i.test(path)) return 'data';
  if (/actions|events/i.test(path)) return 'actions';
  if (/settings|theme|style|layout/i.test(path)) return 'experience';
  return 'application';
}

function compare(before, after, limit = 1000) {
  const changes = diffValues(before || {}, after || {}, [], [], limit);
  const counts = { added: 0, removed: 0, changed: 0 };
  const categories = {};
  for (const change of changes) {
    counts[change.kind] = (counts[change.kind] || 0) + 1;
    const group = category(change.path);
    categories[group] = (categories[group] || 0) + 1;
    change.category = group;
  }
  return {
    equal: changes.length === 0,
    truncated: changes.length >= limit,
    totalChanges: changes.length,
    counts,
    categories,
    changes
  };
}

module.exports = { compare, diffValues, summarize, identity, category };
