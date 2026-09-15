(() => {
  'use strict';
  const KEY = 'invarture-app-studio-v2';
  const model = globalThis.InvartureModel;
  if (!model) return;
  let initialized = Boolean(localStorage.getItem(KEY));
  let busy = false;

  function extendStoredWorkspace() {
    if (busy) return;
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    try {
      const state = JSON.parse(raw);
      const before = JSON.stringify(state);
      model.ensureWorkspace(state);
      const after = JSON.stringify(state);
      if (after !== before) {
        globalThis.__IAS_HISTORY_SUPPRESS = true;
        try { localStorage.setItem(KEY, after); }
        finally { globalThis.__IAS_HISTORY_SUPPRESS = false; }
      }
      initialized = true;
    } catch (error) {
      console.warn('Could not initialize V0.5 workspace extensions:', error);
    }
  }

  function initializeCleanWorkspace() {
    if (initialized || busy || localStorage.getItem(KEY)) {
      extendStoredWorkspace();
      return;
    }
    const saveButton = document.querySelector('[data-save]');
    if (!saveButton) return;
    busy = true;
    try {
      saveButton.click();
      setTimeout(() => {
        busy = false;
        extendStoredWorkspace();
      }, 0);
    } catch {
      busy = false;
    }
  }

  const observer = new MutationObserver(() => requestAnimationFrame(initializeCleanWorkspace));
  observer.observe(document.body, { childList: true, subtree: true });
  initializeCleanWorkspace();
})();
