# Invarture App Studio

Invarture App Studio is a clean-room, Invarture-branded SAP-focused low-code application platform. The goal is to build an open, self-hostable enterprise application platform with Neptune-class SAP capabilities while improving portability, debugging, environment promotion, testing and developer ergonomics.

The project does not copy Neptune proprietary code, schemas or internal implementation.

## Current test build - v0.5.0

V0.5 is the first architecture-focused milestone. It preserves the working secure SAP connector and dependency-light Ubuntu/Docker deployment while introducing a shared application model and a more capable Studio.

### V0.5 highlights

- Shared browser/Node application model in `lib/platformModel.js`
- Formal application JSON Schema in `schemas/application.schema.json`
- Additive workspace schema migration
- Browser-session Undo / Redo with Ctrl/Cmd+Z and Ctrl/Cmd+Y
- Typed application variables and a State Inspector
- `{{variableName}}` and `{{app.variableName}}` test-time interpolation
- Enhanced Binding editor
- OData `$select`, `$filter`, `$orderby`, `$expand`, `$search`, `$top`, `$skip` and `$count`
- Logical connection aliases such as `alias:SAP_PRIMARY`
- DEV / QAS / PRD environment mappings
- Environment-aware live reads and OData writes
- Nested one-to-four-column layout containers
- Reusable component fragments with regenerated IDs
- Expanded recursive application validation
- In-memory developer Network / Errors / State / Bindings diagnostics
- Clean-workspace V0.5 bootstrap

See `docs/V0.5.md` and `docs/ARCHITECTURE.md` for the milestone and architectural details.

## Existing platform capabilities

### Visual platform

- Invarture-branded launchpad and workspace
- Multi-page applications
- Drag-and-drop App Studio
- Component tree and property inspector
- Desktop, tablet and mobile previews
- Application templates
- Application/page settings
- Draft, published and archived states
- Version snapshots and restore
- Application JSON import/export
- Workspace import/export
- Visual button logic
- Dark/light/system themes and accessibility settings
- Command palette
- PWA shell

### Secure SAP/API connectivity

- Server-side connection registry
- SAP OData V2 and V4
- REST endpoints
- Basic authentication
- Bearer tokens
- OAuth2 client credentials
- API-key authentication
- SAP client/language parameters
- `$metadata` discovery
- EntitySet and field browser
- Connection health and latency check
- Live SAP Table/KPI/field data
- SAP CSRF-token/session flow for POST/PUT/PATCH/DELETE
- Server-root URL confinement
- Credentials never returned to browser JavaScript

### Platform infrastructure

- Plain Node.js server with no npm runtime dependencies
- Optional HTTP Basic protection
- Persistent server-side workspace file
- Push/Pull workspace sync with ETag conflict detection
- Atomic workspace saves
- Docker and Docker Compose
- systemd template
- Nginx reverse-proxy template
- Vercel-compatible SAP API handler
- GitHub Actions integration and mock SAP tests

## Quick Ubuntu / Docker update

For an existing checkout:

```bash
git pull
docker compose up -d --build
```

Then hard-refresh the browser after major frontend updates:

```text
Ctrl + Shift + R
```

Useful Docker commands:

```bash
docker compose ps
docker compose logs --tail=100
docker compose logs -f
```

## First-time Ubuntu setup

```bash
cd /opt
sudo git clone git@github.com:youssefdaoud23/SAP_APPS_YD.git invarture-app-studio
cd invarture-app-studio
cp .env.example .env
nano .env
docker compose up -d --build
```

Open:

```text
http://YOUR_UBUNTU_SERVER:8080
```

## Minimal environment configuration

```dotenv
PORT=8080

APP_STUDIO_USER=admin
APP_STUDIO_PASSWORD=replace_with_a_long_random_password

WORKSPACE_FILE=/app/data/workspace.json

SAP_CONNECTIONS_JSON=[{"id":"sap-dev","name":"SAP DEV","type":"OData V2","baseUrl":"https://sap-host.example.com/sap/opu/odata/sap/ZMY_SERVICE_SRV/","auth":"basic","usernameEnv":"SAP_DEV_USER","passwordEnv":"SAP_DEV_PASSWORD","sapClient":"100","sapLanguage":"EN"}]
SAP_DEV_USER=my_sap_user
SAP_DEV_PASSWORD=my_sap_password
```

`.env` is ignored by Git. Never commit SAP credentials.

## Connection Center test flow

1. Open **Connection Center**.
2. Select a server-defined connection.
3. Run **Test connection**.
4. Run **Browse metadata**.
5. Select an EntitySet.
6. Preview records.
7. Add the secure descriptor to App Studio.
8. In V0.5, open **Environments** and create a logical alias such as `SAP_PRIMARY`.
9. Map DEV/QAS/PRD to their physical `server:*` connections.
10. Bind application components to `alias:SAP_PRIMARY` with **Binding+**.

The application definition can then stay environment-independent while the active environment decides which SAP system is used.

## V0.5 Studio test flow

1. Open an application in **App Studio**.
2. Open **State** and create a variable such as `companyCode`.
3. Put `Company {{companyCode}}` into a Text component and set a runtime test value.
4. Open **Environments** and configure `SAP_PRIMARY`.
5. Select a Table and open **Binding+**.
6. Select `alias:SAP_PRIMARY` and build an OData query including `$expand`, `$skip` or `$count`.
7. Add a two-column **Layout**, select it and edit the slots.
8. Save a component as a reusable **Fragment**, then insert another copy.
9. Change the app and test **Undo / Redo**.
10. Open **Devtools**, refresh SAP data and inspect request timing.
11. Run **Validate** and verify missing alias mappings are reported.
12. Configure a Button in **Logic** using an alias and test it in Preview.

## Persistent workspace sync

Set:

```dotenv
WORKSPACE_FILE=/app/data/workspace.json
```

Then use **Server Sync**:

- Push local workspace
- Pull server workspace

ETags prevent stale browser state from silently overwriting a newer server copy. SAP passwords/tokens are not written to the workspace file.

## Security model

Current boundaries:

1. SAP passwords, bearer tokens, API keys and OAuth secrets stay server-side.
2. Browser application definitions store only safe connection descriptors, aliases and binding paths.
3. Connector requests are confined to configured service roots.
4. Production SAP URLs should use HTTPS.
5. SAP writes use centralized CSRF/session handling.
6. HTTP Basic can protect the current self-hosted Studio until OIDC/Entra authentication is introduced.
7. `.env` remains outside source control.
8. Developer Network diagnostics redact secret-like headers and URL query parameters.
9. UI read-only controls do not replace SAP/server-side authorization.

## Tests

Run the shared model tests locally:

```bash
npm test
```

GitHub Actions additionally verifies:

- JavaScript syntax and V0.5 load order
- V0.5 application-model behavior
- server startup
- Studio access protection
- Basic Auth forwarding to mock SAP
- connection discovery
- `$metadata`
- OData reads
- SAP CSRF/session write flow
- persistent workspace GET/PUT

## Documentation

- `docs/V0.5.md` - V0.5 milestone and test plan
- `docs/ARCHITECTURE.md` - current architecture and migration boundary
- `docs/APPLICATION_SCHEMA.md` - application model and V0.5 extensions
- `docs/CONNECTIONS.md` - connection/authentication configuration

## Roadmap

The master direction is a production-grade SAP low-code platform. Next major milestones include:

- PostgreSQL shared persistence
- local users/groups/roles and server-side RBAC
- OIDC / Microsoft Entra ID
- formal environment promotion and immutable deployments
- richer metadata-driven component rendering
- API Designer and server functions
- visual workflow designer
- offline synchronization
- AI-assisted application development and safe MCP tooling

The repository should remain directly testable on Ubuntu throughout this evolution.
