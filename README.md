# Invarture App Studio

Invarture App Studio is an Invarture-branded, SAP-focused low-code application platform built as a clean-room alternative to proprietary SAP app platforms.

## Current build

**v0.5.2**

This release standardizes the local/Docker runtime on **port 8081 everywhere**:

- Node server default: `8081`
- Docker internal port: `8081`
- Docker exposed port: `8081`
- Browser URL: `http://localhost:8081`
- Health endpoint: `http://localhost:8081/healthz`

The running UI also displays the exact Git commit SHA that was baked into the Docker image.

## Fresh clone - recommended

Start from an empty parent directory:

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

Check container status:

```bash
sudo docker compose ps
```

The container should become `healthy` and show:

```text
0.0.0.0:8081->8081/tcp
```

Verify the server directly:

```bash
curl http://127.0.0.1:8081/healthz
curl http://127.0.0.1:8081/api/version
```

Expected health response:

```json
{"ok":true,"version":"0.5.2","commit":"<short-sha>"}
```

Verify the checked-out Git commit:

```bash
git rev-parse --short=8 HEAD
```

That SHA should match the commit shown in App Studio and `/api/version`.

## Optional configuration

When you are ready to configure authentication or SAP connections:

```bash
cp .env.example .env
nano .env
sudo docker compose up -d --build --force-recreate
```

The example file already uses:

```dotenv
PORT=8081
WORKSPACE_FILE=/app/data/workspace.json
```

For local-only testing, `APP_STUDIO_USER` and `APP_STUDIO_PASSWORD` may remain blank.

Before exposing the app to another machine, configure both values.

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

## Useful troubleshooting commands

```bash
sudo docker compose ps
sudo docker compose logs --tail=100 invarture-app-studio
sudo docker compose logs -f invarture-app-studio
curl -v http://127.0.0.1:8081/healthz
curl -v http://127.0.0.1:8081/api/version
```

For a complete clean Docker reset:

```bash
sudo docker compose down --remove-orphans
sudo docker compose build --no-cache
sudo docker compose up -d --force-recreate
```

## Security

- `.env` and local data are excluded from Git.
- `.env` is also excluded from the Docker build context by `.dockerignore` so secrets are not baked into the image.
- SAP passwords/tokens remain server-side.
- Browser code stores only safe connection descriptors and logical aliases.
- SAP writes use centralized CSRF/session handling.
- Production SAP URLs should use HTTPS.

## Current platform capabilities

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
- Dark/light/system themes
- Command palette
- Undo/Redo
- Typed application variables and State Inspector
- Nested layouts
- Reusable fragments
- Enhanced binding editor
- Developer diagnostics

### SAP/API connectivity

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
- Live SAP data
- CSRF/session flow for writes
- Logical aliases such as `SAP_PRIMARY`
- DEV/QAS/PRD environment mapping

### Platform infrastructure

- Node.js server
- Docker and Docker Compose
- Persistent workspace volume
- Healthcheck
- Build version and Git fingerprint endpoint
- GitHub Actions tests
- Mock SAP integration tests
- PWA shell with network-first refresh behavior

## Documentation

- `docs/V0.5.md`
- `docs/ARCHITECTURE.md`
- `docs/APPLICATION_SCHEMA.md`
- `docs/CONNECTIONS.md`
- `docs/VERSIONING.md`

The repository should remain directly cloneable and testable on Ubuntu/WSL using port **8081** without local source edits.
