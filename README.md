# Invarture App Studio

Invarture App Studio is a clean-room, SAP-focused low-code application builder prototype. The goal is to create an open, self-hosted workflow that can progressively replace the parts of Neptune DXP that are most useful for Invarture projects, without copying Neptune proprietary code.

## Current test build - v0.2.0

This version is a browser-based MVP with no package install or build step.

### Working now

- Invarture-branded workspace and launchpad
- Application registry with draft/published/archived states
- Multi-page applications
- Visual App Studio
- Drag-and-drop component insertion and reordering
- Application tree and component selection
- Desktop, tablet and mobile preview widths
- Component property inspector
- App/page settings inspector
- 19 reusable component types across basic, forms, data, layout and media categories
- OData V2, OData V4 and REST data-source registry
- Component data-source and binding-path properties
- Version snapshots and restore
- Application JSON import/export
- Full-workspace JSON import/export
- Runtime preview with application page navigation
- Browser-local persistence using `localStorage`
- PWA service worker and manifest when served over HTTP(S)
- Vercel static deployment configuration

### Component library

Basic: Heading, Text, Button, Divider, Spacer

Forms: Input, Text area, Select, Checkbox, Switch, Date

Data: KPI, Table, Chart

Layout: Card, Toolbar, Tabs, Info strip

Media: Image

## Important security boundary

This build intentionally does **not** store SAP passwords, bearer tokens or other secrets in browser storage. Data-source validation currently validates configuration only.

Production SAP connectivity should be implemented through a server-side Invarture connector that:

1. stores credentials in server-side environment variables or a secrets vault;
2. handles OData V2/V4 authentication;
3. proxies requests to SAP to avoid CORS and browser credential exposure;
4. enforces application/user authorization;
5. records auditable connection and deployment activity.

Do not place production SAP credentials directly into this frontend.

## Run locally

You can open `index.html` directly for basic testing, but HTTP is recommended so the service worker can run.

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Suggested test flow

1. Open **App Studio**.
2. Drag components from the palette onto the canvas.
3. Reorder components using drag-and-drop or the move buttons.
4. Select a component and modify its properties.
5. Add another page to the application.
6. Switch Desktop / Tablet / Mobile preview.
7. Configure an OData source in **Data Sources**.
8. Bind a Table or KPI to that source and enter a binding path.
9. Create a version snapshot.
10. Preview and publish the application.
11. Export the application JSON.

## Architecture direction

The next major milestone is the secure backend layer:

```text
Browser / Invarture App Studio
              |
              v
      Invarture API Gateway
              |
       +------+------+-------+
       |             |       |
   OData V2      OData V4   REST
       |             |       |
       +-------------+-------+
                     |
                    SAP
```

Planned stages:

1. Node.js/TypeScript API and PostgreSQL persistence
2. Secure OData V2/V4 proxy and `$metadata` browser
3. Entity-set/field binding wizard
4. OIDC/SAML/Microsoft Entra ID authentication and RBAC
5. Real application users, groups and launchpad roles
6. DEV/TEST/PROD environments and promotion workflow
7. Server-side application/version storage and audit history
8. Event/action editor and reusable building blocks
9. Offline/PWA data synchronization
10. Optional SAP-side ABAP connector for BAPIs, RFCs and custom classes

## Branding

The interface uses an Invarture-inspired navy/blue theme and loads the Invarture logo from the official Invarture website, with a text fallback if the remote image cannot be loaded.
