# Invarture App Studio

Invarture App Studio is an Invarture-branded, SAP-focused low-code application platform built as a clean-room alternative to proprietary SAP application platforms.

## Current build

**v0.6.0**

V0.6 adds the first shared enterprise platform foundation while preserving the existing SAP designer/runtime functionality.

Highlights:

- PostgreSQL-backed shared workspace storage by default in Docker
- numeric workspace revisions and ETag optimistic locking
- stale-write protection with HTTP 409 instead of silent overwrite
- persistent users, groups, roles and permission mappings
- built-in Platform Admin, Developer, Publisher and Viewer roles
- audit-event persistence
- Settings runtime/database/security status
- Users & groups administration UI
- file-backed workspace mode retained for compatibility
- exact product version + Git SHA shown by the running application
- native port 8081 throughout the Docker deployment

Authentication is still transitional in V0.6. HTTP Basic or local-development mode maps to Platform Admin while OIDC/Microsoft Entra integration is built next. Persistent users are authorization/identity mappings, not password accounts.

## Fresh clone

```bash
git clone https://github.com/youssefdaoud23/SAP_APPS_YD.git
cd SAP_APPS_YD
sudo docker compose up -d --build
```

No `.env` file is required for the first local startup.

Open:

```text
http://localhost:8081
```

The Docker stack now contains:

- `invarture-app-studio` on port 8081
- `invarture-postgres` on the private Compose network

Check status:

```bash
sudo docker compose ps
```

Verify the server and running build:

```bash
curl http://127.0.0.1:8081/healthz
curl http://127.0.0.1:8081/api/version
git rev-parse --short=8 HEAD
```

The Git SHA from the repository should match the SHA displayed by App Studio and `/api/version`.

## Optional local configuration

Create `.env` when you are ready to configure authentication, PostgreSQL credentials or SAP connections:

```bash
cp .env.example .env
nano .env
sudo docker compose up -d --build --force-recreate
```

Important V0.6 variables:

```dotenv
PORT=8081
POSTGRES_PASSWORD=
WORKSPACE_STORAGE=postgres
APP_STUDIO_USER=
APP_STUDIO_PASSWORD=
SAP_CONNECTIONS_JSON=[]
```

Before exposing the stack beyond local development, set a strong PostgreSQL password and configure authentication.

`.env` is excluded from Git and from the Docker build context.

## Normal update flow

```bash
git pull
sudo docker compose up -d --build
```

Then verify:

```bash
git rev-parse --short=8 HEAD
sudo docker compose exec -T invarture-app-studio cat /app/build-info.json
```

The SHA values must match.

## V0.6 shared workspace

Docker uses PostgreSQL for the shared workspace by default.

The shared workspace stores:

- application/workspace JSON
- ETag
- revision number
- update time
- updating principal

The **Server Sync** panel shows the storage backend and revision. If two browsers start from the same revision and one saves first, the other browser receives a conflict instead of silently overwriting the newer workspace.

File mode is still supported for direct/local Node deployments:

```dotenv
WORKSPACE_STORAGE=file
WORKSPACE_FILE=/app/data/workspace.json
```

## V0.6 users, groups and roles

Open **Settings -> Shared platform -> Users & groups**.

The current built-in roles are:

- Platform Admin
- Developer
- Publisher
- Viewer

Persistent users and groups can be created and assigned roles. These records are designed to become the authorization mappings for OIDC/Microsoft Entra identities and groups in the next milestone.

Current server-side permission enforcement has begun with shared workspace writes and security administration. Frontend visibility is never considered a security boundary.

## Current platform capabilities

### Visual App Studio

- Invarture-branded workspace and launchpad
- multi-page applications
- drag-and-drop application designer
- component hierarchy and property inspector
- desktop/tablet/mobile previews
- nested layouts
- reusable fragments
- application templates
- typed application variables and State Inspector
- Undo/Redo
- enhanced binding editor
- visual button actions
- OData query builder
- application validation
- snapshots/version restore
- JSON import/export
- command palette
- developer diagnostics
- dark/light/system themes

### SAP/API connectivity

- server-side connection registry
- SAP OData V2 and V4
- REST endpoints
- Basic authentication
- bearer tokens
- OAuth2 client credentials
- API-key authentication
- SAP client/language parameters
- `$metadata` discovery
- EntitySet/property browser
- live SAP data
- SAP CSRF/session flow for POST/PUT/PATCH/DELETE
- logical aliases such as `SAP_PRIMARY`
- DEV/QAS/PRD environment mapping
- environment-aware reads and writes

### Platform infrastructure

- Node.js server
- PostgreSQL 17 Docker service
- file-storage fallback
- Docker and Docker Compose
- port 8081 end to end
- healthcheck
- server workspace sync
- ETag optimistic locking
- numeric workspace revisions
- persistent RBAC schema
- persistent user/group mappings
- audit-event storage
- platform status API
- exact version/Git build fingerprint
- PWA shell with network-first refresh behavior
- GitHub Actions
- mock SAP integration tests
- real PostgreSQL CI integration tests

## Useful commands

```bash
sudo docker compose ps
sudo docker compose logs --tail=100 invarture-app-studio
sudo docker compose logs --tail=100 postgres
curl http://127.0.0.1:8081/healthz
curl http://127.0.0.1:8081/api/version
curl http://127.0.0.1:8081/api/platform
```

A complete local reset, including PostgreSQL/workspace volumes, is destructive:

```bash
sudo docker compose down -v --remove-orphans
sudo docker compose up -d --build
```

Do not use `-v` during ordinary updates if you want to keep shared workspace and identity data.

## Security

- SAP passwords/tokens stay server-side.
- `.env` is ignored by Git and Docker build context.
- browser definitions contain only safe connection descriptors and aliases.
- SAP connector requests are confined to configured service roots.
- production SAP endpoints should use HTTPS.
- SAP mutations use centralized CSRF/session handling.
- shared workspace writes use server-side permission checks.
- identity administration requires `users.manage`.
- audit records are stored server-side in PostgreSQL.
- V0.6 Basic/local authentication is transitional, not final enterprise authentication.

## Documentation

- `docs/V0.6.md` - shared persistence and identity milestone
- `docs/AUTHORIZATION.md` - roles, permissions and future OIDC flow
- `docs/V0.5.md` - V0.5 designer/model milestone
- `docs/ARCHITECTURE.md`
- `docs/APPLICATION_SCHEMA.md`
- `docs/CONNECTIONS.md`
- `docs/VERSIONING.md`

## Next milestone

The next major platform work is V0.7:

- Microsoft Entra ID / generic OIDC authentication
- resolving persistent user/group mappings into effective permissions
- stronger server-side enforcement across connections, publishing and SAP writes
- formal DEV/QAS/PRD promotion and deployment history
- immutable deployed application versions

The repository should remain directly cloneable and testable on Ubuntu/WSL with `docker compose up -d --build` throughout the evolution.
