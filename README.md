# Invarture App Studio

Invarture App Studio is a clean-room, Invarture-branded SAP-focused low-code application platform. The project is intended to progressively replace the Neptune DXP workflow used for SAP business applications without copying Neptune proprietary code.

## Current test build - connection milestone

The current build is ready for realistic testing on an Ubuntu server. It now includes both the visual App Studio and a server-side SAP connector.

### Visual platform

- Invarture-branded launchpad and workspace
- Multi-page applications
- Drag-and-drop App Studio
- Component tree and property inspector
- Desktop, tablet and mobile canvas sizes
- 19 reusable component types
- Application/page settings
- Draft, published and archived application states
- Version snapshots and restore
- Application JSON import/export
- Complete workspace import/export
- PWA shell and offline static cache

### Secure SAP/API connectivity

- Server-side connection registry
- SAP OData V2 and V4 support
- REST endpoint support
- Basic authentication
- Static bearer-token authentication
- OAuth2 client-credentials authentication
- SAP `$metadata` discovery
- Entity-set and field browser
- Connection health/latency check
- Preview the first rows of an OData entity set
- Import a server connection into App Studio
- Bind the selected Studio component directly to an OData entity set
- Live Table, KPI and field hydration through the secure backend
- SAP CSRF-token/session flow for POST/PUT/PATCH/DELETE operations
- URL confinement so clients cannot turn the connector into an arbitrary open proxy
- SAP credentials and bearer tokens never returned to browser JavaScript

### Platform/runtime infrastructure

- Plain Node.js server with no npm dependencies
- Optional HTTP Basic protection for the whole Ubuntu application
- Optional persistent server-side workspace storage
- Push/Pull server workspace sync with ETag conflict detection
- Atomic workspace saves
- Dockerfile and Docker Compose deployment
- systemd service template
- Nginx reverse-proxy template
- Vercel serverless SAP endpoint support
- GitHub Actions end-to-end tests using a mock SAP OData service

## Component library

**Basic:** Heading, Text, Button, Divider, Spacer

**Forms:** Input, Text area, Select, Checkbox, Switch, Date

**Data:** KPI, Table, Chart

**Layout:** Card, Toolbar, Tabs, Info strip

**Media:** Image

---

# Ubuntu setup

## 1. Pull the latest version

```bash
cd /opt
sudo git clone git@github.com:youssefdaoud23/SAP_APPS_YD.git invarture-app-studio
cd invarture-app-studio
```

If you already cloned it:

```bash
cd /opt/invarture-app-studio
git pull origin main
```

## 2. Check Node.js

Node 18 or newer is required. Node 22 is recommended.

```bash
node --version
```

## 3. Create the environment file

```bash
cp .env.example .env
nano .env
```

A minimal useful configuration looks like this:

```dotenv
PORT=8080

APP_STUDIO_USER=admin
APP_STUDIO_PASSWORD=replace_with_a_long_random_password

WORKSPACE_FILE=/opt/invarture-app-studio/data/workspace.json

SAP_CONNECTIONS_JSON=[{"id":"sap-dev","name":"SAP DEV","type":"OData V2","baseUrl":"https://sap-host.example.com/sap/opu/odata/sap/ZMY_SERVICE_SRV/","auth":"basic","usernameEnv":"SAP_DEV_USER","passwordEnv":"SAP_DEV_PASSWORD"}]
SAP_DEV_USER=my_sap_user
SAP_DEV_PASSWORD=my_sap_password
```

`.env` is excluded by `.gitignore`. Do not commit it.

## 4. Start it

```bash
node server.js
```

or:

```bash
npm start
```

Then open:

```text
http://YOUR_UBUNTU_SERVER:8080
```

If `APP_STUDIO_USER` and `APP_STUDIO_PASSWORD` are configured, the browser will show its standard username/password prompt.

---

# Configure SAP connections

Connections are configured server-side in `SAP_CONNECTIONS_JSON`. Secret values are referenced by environment-variable name rather than embedded in the connection object.

## SAP Basic Auth

```dotenv
SAP_CONNECTIONS_JSON=[{"id":"ecc-dev","name":"ECC DEV","type":"OData V2","baseUrl":"https://ecc.example.com/sap/opu/odata/sap/ZAPP_SRV/","auth":"basic","usernameEnv":"ECC_USER","passwordEnv":"ECC_PASSWORD"}]
ECC_USER=myuser
ECC_PASSWORD=mypassword
```

## Bearer token

```dotenv
SAP_CONNECTIONS_JSON=[{"id":"sap-api","name":"SAP API","type":"OData V4","baseUrl":"https://example.com/sap/opu/odata4/service/","auth":"bearer","tokenEnv":"SAP_API_TOKEN"}]
SAP_API_TOKEN=replace_me
```

## OAuth2 client credentials

```dotenv
SAP_CONNECTIONS_JSON=[{"id":"btp-api","name":"SAP BTP API","type":"REST","baseUrl":"https://api.example.com/","auth":"oauth2-client-credentials","tokenUrl":"https://auth.example.com/oauth/token","clientIdEnv":"SAP_CLIENT_ID","clientSecretEnv":"SAP_CLIENT_SECRET","scope":"my.scope"}]
SAP_CLIENT_ID=replace_me
SAP_CLIENT_SECRET=replace_me
```

## Multiple connections

Use multiple objects inside the JSON array:

```dotenv
SAP_CONNECTIONS_JSON=[{"id":"dev","name":"SAP DEV","type":"OData V2","baseUrl":"https://dev.example.com/sap/opu/odata/sap/ZAPP_SRV/","auth":"basic","usernameEnv":"DEV_USER","passwordEnv":"DEV_PASS"},{"id":"qas","name":"SAP QAS","type":"OData V2","baseUrl":"https://qas.example.com/sap/opu/odata/sap/ZAPP_SRV/","auth":"basic","usernameEnv":"QAS_USER","passwordEnv":"QAS_PASS"}]
```

For production, HTTPS is required. `SAP_ALLOW_HTTP=true` exists only for trusted lab/test environments.

---

# Test a real SAP service in the UI

1. Start App Studio with `node server.js`.
2. Open **Connection Center** in the bottom-right corner.
3. Your server-defined SAP connections should appear automatically.
4. Click **Test connection**. The backend requests `$metadata` and reports HTTP status and latency.
5. Click **Browse metadata**.
6. Choose an EntitySet and inspect its fields.
7. Click **Preview 5 rows** to query real data.
8. Click **Add to App Studio**.
9. Open **App Studio** and select a Table or KPI.
10. Return to Connection Center, select the EntitySet and choose **Bind selected component**.
11. The application reloads with a `server:<connection-id>` data source and the selected binding path.
12. The live-data adapter requests SAP through `/api/sap`; the browser never calls the SAP host directly.

For a table, use actual SAP property names in the table `Columns` property when you want explicit field selection. If the configured column names do not exist in the returned entity, the live adapter automatically shows the first scalar fields from the response.

---

# Persistent workspace sync

Without server sync, App Studio still saves drafts in browser `localStorage`.

To persist the complete workspace on Ubuntu set:

```dotenv
WORKSPACE_FILE=/opt/invarture-app-studio/data/workspace.json
```

Then use the **Server Sync** button:

- **Push local workspace** writes the current workspace to the server.
- **Pull from server** replaces the browser workspace with the stored server copy.
- ETags prevent an old browser copy from silently overwriting a newer server copy.

The stored workspace includes applications, pages, local data-source descriptors and version snapshots. SAP passwords/tokens remain in server environment variables and are not written into the workspace file.

---

# Docker deployment

```bash
cp .env.example .env
nano .env
docker compose up -d --build
```

Open:

```text
http://YOUR_SERVER:8080
```

Docker Compose stores the server workspace in the `app-studio-data` named volume.

Useful commands:

```bash
docker compose logs -f
docker compose restart
docker compose down
```

---

# systemd deployment

The repository contains `deploy/invarture-app-studio.service`.

Example:

```bash
sudo mkdir -p /opt/invarture-app-studio/data
sudo chown -R www-data:www-data /opt/invarture-app-studio
sudo cp deploy/invarture-app-studio.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now invarture-app-studio
sudo systemctl status invarture-app-studio
```

Logs:

```bash
journalctl -u invarture-app-studio -f
```

---

# Nginx / HTTPS

`deploy/nginx.conf.example` proxies public traffic to App Studio on `127.0.0.1:8080`.

For a real deployment, terminate HTTPS at Nginx, Caddy, a load balancer, Cloudflare Tunnel, or another trusted reverse proxy. Do not expose production SAP credentials over an unencrypted external connection.

---

# Vercel

The static Studio and `/api/sap` handler are compatible with Vercel. Configure the same `SAP_CONNECTIONS_JSON` and secret environment variables in the Vercel project settings.

Important: persistent `WORKSPACE_FILE` storage is intended for the Ubuntu/self-hosted runtime. A Vercel function filesystem is not a durable database. Before using Vercel as the main multi-user platform, workspace storage should move to PostgreSQL/Neon or another durable database.

Use Vercel Deployment Protection or another authentication layer before exposing SAP-connected API routes.

---

# Security model

Current design rules:

1. SAP passwords, bearer tokens and OAuth client secrets stay on the server.
2. Browser components only store the server connection ID and OData binding path.
3. Requests can only target paths underneath the configured connection `baseUrl`.
4. Production connection URLs must use HTTPS unless the explicit lab override is enabled.
5. Write requests automatically attempt SAP CSRF-token acquisition and session-cookie forwarding.
6. The Ubuntu server can require HTTP Basic authentication before serving either the UI or API.
7. `.env` is ignored by Git.
8. Persistent workspace files do not contain connection secrets.

For a future production-grade multi-user deployment, HTTP Basic should be replaced by OIDC/SAML/Microsoft Entra ID plus role-based authorization.

---

# Automated tests

GitHub Actions runs an end-to-end mock SAP server and verifies:

- JavaScript syntax
- App Studio server startup
- access protection
- Basic Auth forwarding to SAP
- connection discovery
- `$metadata`
- health checks
- OData reads
- SAP CSRF/session write flow
- persistent workspace GET/PUT

The workflow is in `.github/workflows/ci.yml`.

---

# Next production milestones

The strongest next upgrades are:

1. PostgreSQL/Neon persistence instead of browser/local file state
2. OIDC/SAML/Microsoft Entra ID authentication and RBAC
3. SAP metadata-driven field picker directly inside the component inspector
4. Event/action designer for CRUD operations and navigation
5. Reusable application components/templates
6. DEV/TEST/PROD environments with promotion and approvals
7. Audit history and deployment records
8. Offline data synchronization
9. Optional ABAP-side connector for BAPIs, RFCs and custom ABAP classes

## Branding

The interface uses an Invarture-inspired navy/blue theme and loads the Invarture logo from the official Invarture website with a text fallback.
