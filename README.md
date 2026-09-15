# Invarture App Studio - MVP

A clean-room, Invarture-branded proof of concept for an SAP-focused application platform intended to evolve toward an alternative workflow to Neptune DXP for internal/customer projects.

## What is working now

- Invarture-branded launchpad and application registry
- Visual App Studio with reusable components
- Desktop, tablet, and mobile canvas preview
- Component property editing and reordering
- App JSON import/export
- Draft/published state and launchpad preview
- SAP OData/REST connection registry
- Browser-local persistence using `localStorage`
- PWA shell/service worker when served over HTTP(S)
- No build step and no package dependencies

## Important MVP boundary

This version is intentionally safe for testing. Data-source "Validate" checks the configuration locally and does **not** transmit credentials or call the SAP endpoint. Real OData/RFC authentication and server-side proxying are the next backend milestone.

## Test locally

Any static server works. For example:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

You can also open `index.html` directly. The core Studio works; the service worker requires HTTP(S).

## Test flow

1. Open **App Studio**.
2. Add components from the left palette.
3. Select a component and edit properties on the right.
4. Change Desktop / Tablet / Mobile preview.
5. Click **Preview**.
6. Export the application JSON.
7. Add a test endpoint under **Data Sources**.
8. Publish/unpublish the app and check it from the **Launchpad**.

## Architecture direction

The current build is a dependency-free frontend MVP. Planned next layers:

1. Node/TypeScript backend and PostgreSQL persistence
2. Real SAP OData V2/V4 proxy with secure credential handling
3. OIDC/SAML and role-based authorization
4. Schema-based bindings and event/action editor
5. SAP metadata browser and service import
6. Versioning, DEV/TEST/PROD promotion, audit history
7. Offline data synchronization
8. Optional ABAP-side connector for BAPIs/RFC/custom classes

## Branding

The UI uses an Invarture-inspired navy/blue theme and references the official Invarture logo asset hosted on `invarture.com`.
