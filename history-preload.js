(() => {
  'use strict';
  const KEY = 'invarture-app-studio-v2';
  const HISTORY_KEY = 'invarture-v05-history';
  const FUTURE_KEY = 'invarture-v05-future';
  const LIMIT = 40;
  const originalSet = Storage.prototype.setItem;
  const originalGet = Storage.prototype.getItem;
  const originalRemove = Storage.prototype.removeItem;

  function readStack(key) {
    try { const v = JSON.parse(sessionStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; }
    catch { return []; }
  }
  function writeStack(key, value) {
    try { originalSet.call(sessionStorage, key, JSON.stringify(value.slice(-LIMIT))); } catch {}
  }
  function snapshot(value) {
    if (!value) return null;
    try { JSON.parse(value); return value; } catch { return null; }
  }

  Storage.prototype.setItem = function(key, value) {
    if (this === localStorage && key === KEY && !globalThis.__IAS_HISTORY_SUPPRESS) {
      const previous = snapshot(originalGet.call(localStorage, KEY));
      const next = snapshot(String(value));
      if (previous && next && previous !== next) {
        const stack = readStack(HISTORY_KEY);
        if (stack[stack.length - 1] !== previous) stack.push(previous);
        writeStack(HISTORY_KEY, stack);
        writeStack(FUTURE_KEY, []);
      }
    }
    return originalSet.call(this, key, value);
  };

  function restore(target, destinationKey) {
    const current = snapshot(originalGet.call(localStorage, KEY));
    if (current) {
      const destination = readStack(destinationKey);
      destination.push(current);
      writeStack(destinationKey, destination);
    }
    globalThis.__IAS_HISTORY_SUPPRESS = true;
    try { originalSet.call(localStorage, KEY, target); }
    finally { globalThis.__IAS_HISTORY_SUPPRESS = false; }
    location.reload();
  }

  globalThis.InvartureHistory = {
    undo() {
      const stack = readStack(HISTORY_KEY);
      const target = stack.pop();
      if (!target) return false;
      writeStack(HISTORY_KEY, stack);
      restore(target, FUTURE_KEY);
      return true;
    },
    redo() {
      const stack = readStack(FUTURE_KEY);
      const target = stack.pop();
      if (!target) return false;
      writeStack(FUTURE_KEY, stack);
      restore(target, HISTORY_KEY);
      return true;
    },
    canUndo() { return readStack(HISTORY_KEY).length > 0; },
    canRedo() { return readStack(FUTURE_KEY).length > 0; },
    clear() { originalRemove.call(sessionStorage, HISTORY_KEY); originalRemove.call(sessionStorage, FUTURE_KEY); }
  };
})();
