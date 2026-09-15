# Connection configuration

Invarture App Studio keeps SAP and API secrets on the server. The browser only receives safe connection descriptors and addresses a connection by ID.

Connections are supplied through `SAP_CONNECTIONS_JSON` in `.env` on the Ubuntu/self-hosted runtime or as environment variables in the hosting platform.

## Recommended SAP OData connection

```dotenv
SAP_CONNECTIONS_JSON=[{"id":"sap-dev","name":"SAP DEV","type":"OData V2","baseUrl":"https://sap-dev.example.com/sap/opu/odata/sap/ZAPP_SRV/","auth":"basic","usernameEnv":"SAP_DEV_USER","passwordEnv":"SAP_DEV_PASSWORD","sapClient":"100","sapLanguage":"EN"}]
SAP_DEV_USER=replace_me
SAP_DEV_PASSWORD=replace_me
```

`baseUrl` should point at the OData service root. App Studio appends `$metadata`, EntitySet paths, OData query options and CSRF requests underneath this URL.

## Supported connection properties

| Property | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable connection ID. Letters, numbers, `.`, `_` and `-` are supported. |
| `name` | yes | Human-readable connection name. |
| `type` | yes | `OData V2`, `OData V4` or `REST`. |
| `baseUrl` | yes | Service root. Production URLs should use HTTPS. |
| `auth` | no | `basic`, `bearer`, `oauth2-client-credentials`, `api-key`, `none` or `anonymous`. |
| `sapClient` | no | Automatically adds `sap-client=<value>` unless a request already specifies it. |
| `sapLanguage` | no | Automatically adds `sap-language=<value>` unless already specified. |
| `defaultQuery` | no | Object of default query parameters to add to every request. |
| `csrf` | no | Set to `false` only for endpoints that do not require SAP CSRF handling. Defaults to enabled for writes. |

## Basic authentication

```json
{
  "id": "ecc-dev",
  "name": "ECC DEV",
  "type": "OData V2",
  "baseUrl": "https://ecc.example.com/sap/opu/odata/sap/ZAPP_SRV/",
  "auth": "basic",
  "usernameEnv": "ECC_USER",
  "passwordEnv": "ECC_PASSWORD",
  "sapClient": "100",
  "sapLanguage": "EN"
}
```

The username and password are read from `ECC_USER` and `ECC_PASSWORD`. Their values are never included in the public connection descriptor.

## Bearer token

```json
{
  "id": "api",
  "name": "SAP API",
  "type": "OData V4",
  "baseUrl": "https://api.example.com/sap/opu/odata4/service/",
  "auth": "bearer",
  "tokenEnv": "SAP_API_TOKEN"
}
```

## OAuth2 client credentials

```json
{
  "id": "btp",
  "name": "SAP BTP",
  "type": "REST",
  "baseUrl": "https://api.example.com/",
  "auth": "oauth2-client-credentials",
  "tokenUrl": "https://auth.example.com/oauth/token",
  "clientIdEnv": "SAP_CLIENT_ID",
  "clientSecretEnv": "SAP_CLIENT_SECRET",
  "scope": "my.scope"
}
```

Access tokens are cached server-side until shortly before expiry.

## API key

```json
{
  "id": "partner-api",
  "name": "Partner API",
  "type": "REST",
  "baseUrl": "https://partner.example.com/v1/",
  "auth": "api-key",
  "apiKeyEnv": "PARTNER_API_KEY",
  "apiKeyHeader": "X-API-Key"
}
```

## DEV / QAS / PRD example

```dotenv
SAP_CONNECTIONS_JSON=[{"id":"dev","name":"SAP DEV","type":"OData V2","baseUrl":"https://dev.example.com/sap/opu/odata/sap/ZAPP_SRV/","auth":"basic","usernameEnv":"DEV_USER","passwordEnv":"DEV_PASS","sapClient":"100","sapLanguage":"EN"},{"id":"qas","name":"SAP QAS","type":"OData V2","baseUrl":"https://qas.example.com/sap/opu/odata/sap/ZAPP_SRV/","auth":"basic","usernameEnv":"QAS_USER","passwordEnv":"QAS_PASS","sapClient":"200","sapLanguage":"EN"},{"id":"prd","name":"SAP PRD","type":"OData V2","baseUrl":"https://prd.example.com/sap/opu/odata/sap/ZAPP_SRV/","auth":"basic","usernameEnv":"PRD_USER","passwordEnv":"PRD_PASS","sapClient":"300","sapLanguage":"EN"}]
```

For production, use separate least-privilege technical identities or delegated identity where appropriate. Do not reuse broad administrative SAP credentials.

## Default query parameters

For services that require additional fixed query parameters:

```json
{
  "id": "sap-dev",
  "name": "SAP DEV",
  "type": "OData V2",
  "baseUrl": "https://sap.example.com/sap/opu/odata/sap/ZAPP_SRV/",
  "auth": "basic",
  "usernameEnv": "SAP_USER",
  "passwordEnv": "SAP_PASSWORD",
  "defaultQuery": {
    "sap-client": "100",
    "sap-language": "EN"
  }
}
```

Explicit query parameters on an individual request take precedence over defaults.

## Connection Center flow

1. Restart App Studio after changing `.env`.
2. Open **Connection Center**.
3. Select the connection and click **Test connection**.
4. Click **Browse metadata** to load `$metadata`.
5. Select an EntitySet and inspect its properties.
6. Use **Preview 5 rows** to make a real OData read.
7. Use **Add to App Studio** to create a safe browser descriptor.
8. Select a component in App Studio and use **Bind selected component** to bind the component to the chosen EntitySet.

## Button write actions

Select a Button in App Studio and open **Logic**. Supported runtime actions are:

- refresh bound SAP data;
- navigate to another application page;
- open an HTTP/HTTPS URL;
- OData create via POST;
- OData update via PATCH;
- OData delete via DELETE.

Mutating OData actions go through the server connector. Unless `csrf:false` is set on the connection, the connector first requests an SAP CSRF token and session cookie, then forwards them with the mutation.

## Security boundaries

- Browser code never receives the configured SAP password, bearer token, OAuth client secret or API key.
- A request cannot supply a new absolute upstream URL. It is confined to the configured service root.
- Production connection URLs require HTTPS unless `SAP_ALLOW_HTTP=true` is deliberately enabled for a trusted lab environment.
- `.env` is ignored by Git.
- Workspace persistence stores only safe connection descriptors, not the server secrets.
