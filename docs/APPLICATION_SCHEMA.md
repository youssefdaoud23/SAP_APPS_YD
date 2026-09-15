# Application schema

Invarture App Studio keeps applications as human-readable JSON documents. The original workspace remains `schemaVersion: 2`; V0.5 adds non-breaking extension fields and records `extensionSchemaVersion: 1`.

The formal application JSON Schema is available at `schemas/application.schema.json`.

## V0.5 additions

### Variables

Each application may contain `variables`:

```json
{
  "id": "var-company",
  "name": "companyCode",
  "type": "string",
  "scope": "application",
  "defaultValue": "1000",
  "persist": false
}
```

### Connection aliases

Workspace-level aliases make apps environment-independent:

```json
{
  "id": "SAP_PRIMARY",
  "name": "Primary SAP",
  "mappings": {
    "DEV": "server:sap-dev",
    "QAS": "server:sap-qas",
    "PRD": "server:sap-prd"
  }
}
```

Application components reference `alias:SAP_PRIMARY` rather than a physical system.

### Nested layouts

Layout components own arrays of slots. Each slot contains normal component documents:

```json
{
  "id": "cmp-layout",
  "type": "layout",
  "columns": 2,
  "gap": 12,
  "slots": [
    [{ "id": "cmp-left", "type": "text", "text": "Left" }],
    [{ "id": "cmp-right", "type": "kpi", "label": "Open", "value": "12" }]
  ]
}
```

Recursive traversal is provided by `InvartureModel.walkComponent` and `walkAppComponents`.

## Migration strategy

New schema changes should be additive where possible. When a breaking change becomes necessary, introduce an explicit migration function and retain import support for previous versions.
