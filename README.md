# Invarture App Studio

Invarture App Studio is an Invarture-branded, SAP-focused low-code application platform being built as a clean-room, lighter alternative to proprietary SAP application platforms.

## Current build

**v0.8.0**

V0.8 combines the visual SAP application builder with shared PostgreSQL persistence, RBAC, governed deployment, generic OIDC authentication, reusable APIs and safe declarative Server Functions.

AI/MCP functionality is intentionally out of scope for the current roadmap.

## Fresh clone

```bash
git clone https://github.com/youssefdaoud23/SAP_APPS_YD.git
cd SAP_APPS_YD
sudo docker compose up -d --build
```

Open:

```text
http://localhost:8081
```

The default Docker stack contains:

- `invarture-app-studio` on port 8081
- PostgreSQL on the private Compose network

No `.env` file is required for the first local-development startup.

Verify the server and exact build:

```bash
curl http://127.0.0.1:8081/healthz
curl http://127.0.0.1:8081/api/version
git rev-parse --short=8 HEAD
sudo docker compose exec -T invarture-app-studio cat /app/build-info.json
```

The Git SHA shown by the running application must match the checked-out repository SHA.

## Normal update flow

```bash
git pull
sudo docker compose up -d --build
```

Do not use `docker compose down -v` during an ordinary update. `-v` removes persistent PostgreSQL/workspace volumes.

## Current capabilities

### Visual App Studio

- multi-page applications
- drag-and-drop components
- component hierarchy and property inspector
- desktop, tablet and mobile preview
- nested layouts
- reusable fragments
- application templates
- typed application variables and State Inspector
- Undo/Redo
- enhanced binding editor
- visual button actions
- OData query builder
- application validation
- snapshots and restore
- JSON import/export
- command palette
- developer/network diagnostics
- dark/light/system themes

### SAP connectivity

- server-side SAP connection registry
- OData V2 and V4
- REST endpoints
- Basic, Bearer, OAuth2 client-credentials and API-key authentication
- SAP client/language defaults
- `$metadata` discovery
- EntitySet/property browser
- live SAP data
- centralized CSRF/session handling for writes
- GET/POST/PUT/PATCH/DELETE
- logical connection aliases
- environment-aware DEV/QAS/PRD mappings
- bounded upstream timeouts

SAP secrets remain server-side.

### Shared platform

- PostgreSQL-backed workspace storage
- file-storage fallback
- ETag optimistic locking
- numeric workspace revisions
- users and groups
- group memberships
- roles and permissions
- Platform Admin, Developer, Publisher and Viewer built-in roles
- audit log and Audit Log UI
- runtime/platform status
- exact version + Git fingerprint

### Authentication

Supported modes:

- `local` for local development
- HTTP Basic
- generic OIDC using Authorization Code + PKCE

The OIDC implementation includes discovery, JWKS signature validation, state/nonce checks, issuer/audience/time validation, encrypted temporary transaction cookies and opaque PostgreSQL-backed sessions.

It is designed for Microsoft Entra ID configuration but V0.8 has been automatically tested against a standards-compatible mock provider, not yet against a real Entra tenant.

### Server-side authorization

Backend APIs now enforce permissions for shared workspace operations, identity administration, audit access, reusable API management and SAP access.

SAP access requires `connections.view`. Reads require `apps.view`. Writes require `apps.edit`. A write to a connection explicitly marked production additionally requires `production.write`.

### Deployment governance

- DEV/QAS/PRD environments
- custom environments such as UAT
- environment connection aliases
- immutable deployed application snapshots
- SHA-256 snapshot checksums
- deployment history
- DEV -> QAS -> PRD promotion
- protected production behavior
- production draft blocking
- rollback as a new immutable deployment
- deployment audit events

### API Designer

The API Designer creates reusable governed APIs stored in PostgreSQL.

V0.8 supports:

- API definitions with revisioning and draft/published/disabled state
- GET/POST/PUT/PATCH/DELETE operations
- path parameters such as `{id}`
- safe headers
- configured SAP connection selection
- upstream SAP paths
- bounded timeouts
- optimistic-lock conflict handling
- published runtime routes under `/runtime/api/<slug>/...`
- centralized SAP authentication and CSRF behavior
- production-write authorization
- runtime write audit events

V0.8 runtime mode is currently `sap-proxy`. Request/response mapping metadata is stored but transformation execution and OpenAPI tooling are future work.

### Server Functions

Server Functions provide reusable server-side business logic without executing arbitrary JavaScript inside the Node process.

V0.8 uses a constrained declarative pipeline with these step types:

- `require`
- `set`
- `sap-request`
- `respond`

Published functions run through:

```text
POST /runtime/functions/<function-slug>
```

They support input schemas, templates, SAP calls, revision locking, bounded execution, input/output limits and audit events.

See `docs/V0.8.md` for the detailed runtime model and limitations.

## Configuration

Create local configuration when needed:

```bash
cp .env.example .env
nano .env
sudo docker compose up -d --build --force-recreate
```

Important settings include:

```dotenv
PORT=8081
AUTH_MODE=local
POSTGRES_PASSWORD=
WORKSPACE_STORAGE=postgres
SAP_CONNECTIONS_JSON=[]
```

For OIDC/Entra-style authentication, configure the `OIDC_*` settings documented in `.env.example` and set:

```dotenv
AUTH_MODE=oidc
```

Production OIDC and SAP endpoints should use HTTPS.

## CI and validation

The repository contains separate GitHub Actions integration suites for:

- core App Studio, SAP and PostgreSQL behavior
- deployment governance
- OIDC authentication/session/RBAC behavior
- API Designer/runtime
- Server Functions/runtime

The integration suites build actual Docker images and exercise real PostgreSQL containers. SAP and OIDC dependencies are represented by controlled test providers.

## Current limitations

This is not yet broad Neptune feature parity. Major future areas include:

- richer enterprise component library
- Workflow Designer and task inbox
- stronger Launchpad Designer
- API request/response transformations and OpenAPI tooling
- isolated script-capable Server Functions, if required
- RFC/BAPI integration
- Microsoft Graph expansion for Entra group-overage claims
- browser-level E2E coverage
- mobile/offline capabilities

AI/MCP integration is intentionally deferred.

## Documentation

- `docs/V0.8.md` - authentication, API Designer and Server Functions
- `docs/V0.6.md` - shared persistence and identity foundation
- `docs/AUTHORIZATION.md` - authorization model
- `docs/V0.5.md` - designer/model milestone
- `docs/ARCHITECTURE.md`
- `docs/APPLICATION_SCHEMA.md`
- `docs/CONNECTIONS.md`
- `docs/VERSIONING.md`

## Security notes

- `.env` is excluded from Git and the Docker build context.
- SAP secrets remain server-side.
- OIDC sessions use opaque browser tokens and store only token hashes in PostgreSQL.
- production SAP writes can be independently restricted with `production.write`.
- runtime APIs and Server Functions are excluded from PWA caching.
- frontend visibility is never treated as the authorization boundary.

The project should remain directly cloneable and testable on Ubuntu/WSL with `docker compose up -d --build` and port **8081** throughout its evolution.
