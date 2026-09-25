# Authorization model

Invarture App Studio V0.8 separates authentication from authorization and enforces platform permissions on the server.

## Authentication versus authorization

Authentication answers: who is the caller?

Authorization answers: what may that caller do?

The separation allows local development, HTTP Basic and OIDC identities to resolve into the same persistent role/permission model.

## Authentication modes

Select the mode with `AUTH_MODE`.

### Local development

`AUTH_MODE=local`

The runtime uses the transitional `local-development` identity with the built-in `platform-admin` role. This mode is intended only for trusted local development.

### HTTP Basic

`AUTH_MODE=basic`

Configure `APP_STUDIO_USER` and `APP_STUDIO_PASSWORD`. The Basic identity is currently mapped to `platform-admin` for compatibility.

### OIDC

`AUTH_MODE=oidc`

V0.8 implements generic OpenID Connect using Authorization Code + PKCE.

The server performs:

1. OIDC discovery,
2. state, nonce and PKCE generation,
3. authorization-code exchange,
4. JWKS signing-key lookup,
5. ID-token signature validation,
6. issuer, audience and time-claim validation,
7. persistent platform identity resolution,
8. PostgreSQL session creation,
9. role and permission resolution on the authenticated principal.

The browser receives an opaque random session token. PostgreSQL stores only the SHA-256 hash of that token. Login-transaction state is stored in a short-lived encrypted HttpOnly cookie.

The implementation is suitable for Microsoft Entra ID configuration, but V0.8 automated validation uses a standards-compatible mock OIDC provider. Real-tenant Entra certification and Microsoft Graph group-overage expansion remain future work.

## Built-in permissions

Current permission keys are:

- `platform.admin`
- `apps.view`
- `apps.create`
- `apps.edit`
- `apps.publish`
- `apps.deploy`
- `connections.view`
- `connections.manage`
- `workflows.manage`
- `api.manage`
- `functions.manage`
- `users.manage`
- `audit.view`
- `production.write`

`platform.admin` grants all current permissions.

## Built-in roles

### Platform Admin

Receives every current permission.

### Developer

Focused on application, API and Server Functions development:

- `apps.view`
- `apps.create`
- `apps.edit`
- `connections.view`
- `api.manage`
- `functions.manage`
- `audit.view`

### Publisher

Focused on release and promotion:

- `apps.view`
- `apps.publish`
- `apps.deploy`
- `connections.view`
- `audit.view`

### Viewer

Read-only platform access:

- `apps.view`
- `connections.view`

## Persistent identity mappings

PostgreSQL stores platform users, groups, group memberships, user roles and group roles.

OIDC identities are resolved using issuer/subject identity information and can be matched to persistent external group identifiers. User and group roles are combined to build effective permissions.

Optional OIDC auto-provisioning can create a platform user mapping with a configured default role. Bootstrap administrator identities can be configured separately for initial setup.

Disabled platform users are denied access during identity resolution.

## Persistent sessions

OIDC sessions are stored in `platform_auth_sessions` with:

- a SHA-256 session-token hash,
- platform user and username,
- resolved principal JSON,
- provider and subject,
- creation/last-seen/expiration timestamps,
- optional revocation timestamp.

Logout revokes the database session and expires the browser cookie.

## Server-side enforcement

Frontend visibility is never an authorization boundary.

V0.8 enforces permissions server-side for key platform surfaces.

### Shared workspace

- read: `apps.view`
- write: `apps.edit`

### Identity administration

- users/groups/roles administration: `users.manage`

### Audit

- audit access: `audit.view`

### API Designer

- create/update/delete APIs and operations: `api.manage`

### Server Functions

- create/update/delete function definitions: `functions.manage`
- published runtime invocation requires normal authenticated application access and any permissions needed by downstream SAP steps

### SAP connections

A central connection policy applies to both direct SAP requests and platform runtime features:

- any SAP access: `connections.view`
- read operations: `apps.view`
- write operations: `apps.edit`
- writes to a connection explicitly marked production: `production.write`

A connection is treated as production when configured with `production: true` or a stage/environment such as `PRD`, `prod` or `production`.

## Audit behavior

Security-sensitive and platform-governance actions write audit events where applicable, including:

- OIDC login,
- session revocation,
- user/group changes,
- API definition changes,
- Server Function changes and execution,
- deployment/promotion/rollback,
- runtime API writes.

## Remaining authorization work

The authorization model is operational, but additional hardening remains for later releases, including:

- real Microsoft Entra tenant validation,
- Microsoft Graph expansion for group-overage claims,
- finer-grained per-application/per-API permissions,
- protected-environment approval policies,
- explicit permission policies for future Workflow, Launchpad and RFC/BAPI capabilities.
