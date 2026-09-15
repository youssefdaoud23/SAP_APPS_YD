(() => {
  'use strict';
  const MAX = 120;
  const network = [];
  const errors = [];
  const originalFetch = globalThis.fetch?.bind(globalThis);

  function push(list, entry) {
    list.push(entry);
    if (list.length > MAX) list.splice(0, list.length - MAX);
    globalThis.dispatchEvent?.(new CustomEvent('invarture:devtools-update'));
  }
  function safeHeaders(headers) {
    const out = {};
    try {
      new Headers(headers || {}).forEach((value, key) => {
        out[key] = /authorization|cookie|token|secret|api-key/i.test(key) ? '[redacted]' : String(value).slice(0, 1000);
      });
    } catch {}
    return out;
  }
  function safeBody(body) {
    if (body == null) return null;
    if (typeof body === 'string') return body.slice(0, 8000);
    if (body instanceof URLSearchParams) return body.toString().slice(0, 8000);
    return `[${body?.constructor?.name || 'body'}]`;
  }
  function safeUrl(input) {
    try {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      for (const key of [...url.searchParams.keys()]) if (/token|secret|password|key/i.test(key)) url.searchParams.set(key, '[redacted]');
      return url.toString();
    } catch { return String(input).slice(0, 2000); }
  }

  if (originalFetch) {
    globalThis.fetch = async function(input, init = {}) {
      const started = performance.now();
      const request = {
        id: `net-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        time: new Date().toISOString(),
        method: String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase(),
        url: safeUrl(input),
        requestHeaders: safeHeaders(init.headers || (input instanceof Request ? input.headers : undefined)),
        requestBody: safeBody(init.body),
        status: null,
        durationMs: null,
        ok: null,
        error: null
      };
      try {
        const response = await originalFetch(input, init);
        request.status = response.status;
        request.ok = response.ok;
        request.durationMs = Math.round((performance.now() - started) * 10) / 10;
        request.responseHeaders = safeHeaders(response.headers);
        push(network, request);
        return response;
      } catch (error) {
        request.ok = false;
        request.error = String(error?.message || error);
        request.durationMs = Math.round((performance.now() - started) * 10) / 10;
        push(network, request);
        throw error;
      }
    };
  }

  globalThis.addEventListener('error', event => push(errors, {
    time: new Date().toISOString(), type: 'error', message: String(event.message || 'Error'), source: event.filename || '', line: event.lineno || 0
  }));
  globalThis.addEventListener('unhandledrejection', event => push(errors, {
    time: new Date().toISOString(), type: 'promise', message: String(event.reason?.message || event.reason || 'Unhandled promise rejection')
  }));

  globalThis.InvartureDevtools = {
    network,
    errors,
    clearNetwork() { network.length = 0; },
    clearErrors() { errors.length = 0; }
  };
})();
