(() => {
  'use strict';
  const VERSION = '0.5.0';
  function apply() {
    document.querySelectorAll('.workspace-card span,.topbar .pill,.settings-card p').forEach(el => {
      if (/v0\.[0-9]+\.[0-9]+/.test(el.textContent || '')) el.textContent = el.textContent.replace(/v0\.[0-9]+\.[0-9]+/g, `v${VERSION}`);
      if (/MVP v0\.[0-9]+\.[0-9]+/.test(el.textContent || '')) el.textContent = el.textContent.replace(/MVP v0\.[0-9]+\.[0-9]+/g, `MVP v${VERSION}`);
    });
    document.documentElement.dataset.iasVersion = VERSION;
  }
  const observer = new MutationObserver(apply);
  observer.observe(document.body, { childList:true, subtree:true });
  apply();
})();
