# Authorization model

Invarture App Studio V0.6 introduces a persistent role-based authorization model while keeping the existing Basic/local authentication entry point for compatibility.

## Separation of authentication and authorization

Authentication answers: who is the caller?

Authorization answers: what may that caller do?

V0.6 intentionally separates the two so Microsoft Entra ID, generic OIDC or another identity provider can later replace Basic authentication without changing application permissions.

## Current authentication modes

### Basic

When `APP_STUDIO_USER` and `APP_STUDIO_PASSWORD` are configured, the Node server protects the complete application with HTTP Basic authentication.

The authenticated Basic identity is temporarily mapped to the built-in `platform-admin` role.

### Local development

When Basic protection is disabled, the runtime uses the transitional identity `local-development` with the `platform-admin` role.

This is intended for local development only and must not be treated as a production security boundary.

## Built-in permissions

Current permission keys:

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
- `users.manage`
- `audit.view`
- `production.write`

`platform.admin` grants full platform access.

## Built-in roles

### Platform Admin

Receives every current permission.

### Developer

Focused on application design and testing:

- apps.view
- apps.create
- apps.edit
- connections.view
- audit.view

### Publisher

Focused on controlled release and promotion:

- apps.view
- apps.publish
- apps.deploy
- connections.view
- audit.view

### Viewer

Read-only platform access:

- apps.view
- connections.view

## Persistent identity mappings

PostgreSQL contains persistent user and group records.

A user record is an authorization mapping with fields such as username, display name, email, identity provider and external subject identifier.

A group may be associated with roles and members. The external group identifier field is reserved for future identity-provider group mapping.

No passwords are stored in these V0.6 user records.

## Server-side enforcement

V0.6 begins server-side permission enforcement with shared workspace writes and security administration.

Frontend visibility is never considered an authorization boundary.

Further endpoints will progressively require explicit permissions, including connection management, publishing, deployment and production SAP mutations.

## Future OIDC / Entra flow

The intended direction is:

1. authenticate through OIDC / Microsoft Entra ID
2. validate the identity-provider token server-side
3. resolve the external subject to a platform user mapping
4. resolve external and platform group membership
5. combine user and group roles
6. derive effective permissions
7. attach the resolved principal to the request
8. enforce permissions server-side
9. record important administrative actions in the audit log

OIDC is not implemented yet in V0.6.
