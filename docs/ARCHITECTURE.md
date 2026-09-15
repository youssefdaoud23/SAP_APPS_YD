# Architecture

## Current architecture

Invarture App Studio remains intentionally self-hosting friendly:

- static browser frontend;
- plain Node.js HTTP server;
- server-side SAP connector;
- optional persistent workspace file;
- Docker / Docker Compose;
- no build step required for ordinary deployment.

## V0.5 architectural boundary

`lib/platformModel.js` is the shared domain-model boundary. It is deliberately UMD-compatible so it can run:

- in the browser today;
- under Node tests today;
- behind a future TypeScript/React adapter later.

This lets the product move toward a typed frontend incrementally rather than coupling an urgent framework rewrite to functional development.

## Browser modules

- `app.js` - legacy v0.2-v0.4 designer shell and core rendering.
- `experience-settings.js` - workspace experience preferences.
- `app-advanced.js` - v0.4 advanced settings and promotion helper.
- `developer-tools.js` - in-memory request/error diagnostics.
- `runtime-data-v05.js` - direct/alias SAP data hydration.
- `action-designer-v05.js` - environment-aware runtime actions.
- `v05-studio.js` - V0.5 IDE tools, layouts, state, bindings, fragments and validation.
- `history-preload.js` - browser-session workspace history.
- `v05-preload.js` - additive workspace extension migration before the legacy shell loads.

## Next refactoring target

The next structural step is to migrate the legacy component switch renderer into the shared component metadata registry. That should happen incrementally while preserving the current workspace JSON and runtime behavior.
