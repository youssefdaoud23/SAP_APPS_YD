(() => {
  'use strict';
  const VERSION = '0.3.0';
  function apply() {
    document.querySelectorAll('.workspace-card span,.topbar .pill,.settings-card p').forEach(el => {
      if (/v0\.2\.0/.test(el.textContent || '')) el.textContent = el.textContent.replace(/v0\.2\.0/g, `v${VERSION}`);
      if (/MVP v0\.2\.0/.test(el.textContent || '')) el.textContent = el.textContent.replace(/MVP v0\.2\.0/g, `MVP v${VERSION}`);
    });
  }
  const observer = new MutationObserver(apply);
  observer.observe(document.body, { childList:true, subtree:true });
  apply();
})();
