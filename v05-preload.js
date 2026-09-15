(() => {
  'use strict';
  const KEY = 'invarture-app-studio-v2';
  const model = globalThis.InvartureModel;
  if (!model) return;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    const before = JSON.stringify(state);
    model.ensureWorkspace(state);
    const after = JSON.stringify(state);
    if (before !== after) {
      globalThis.__IAS_HISTORY_SUPPRESS = true;
      try { localStorage.setItem(KEY, after); }
      finally { globalThis.__IAS_HISTORY_SUPPRESS = false; }
    }
  } catch (error) {
    console.warn('V0.5 workspace extension migration skipped:', error);
  }
})();
