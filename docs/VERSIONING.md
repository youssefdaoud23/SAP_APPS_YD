# Build and version verification

Invarture App Studio exposes the exact product version and Git commit that are running on the server.

## What you should see in the UI

The sidebar workspace card and the top bar display a build badge in this form:

```text
v0.5.1 · 86c0d89d
```

The first value is the product version. The second value is the first 8 characters of the Git commit that was stamped into the running Docker image.

Click the build badge to open **Running build** details. The dialog shows:

- product version
- build fingerprint
- full Git commit
- commit source
- build timestamp
- server environment
- Node.js runtime

## Normal Ubuntu update

```bash
git pull && docker compose up -d --build
```

If your repository requires elevated permissions, use the same command pattern with the permissions appropriate to your checkout.

## Verify host checkout against the running application

From the repository directory:

```bash
git rev-parse --short=8 HEAD
```

The result should equal the commit shown in the App Studio build badge.

You can also query the server directly:

```bash
curl -u YOUR_APP_USER:YOUR_APP_PASSWORD http://127.0.0.1:8080/api/version
```

Example response:

```json
{
  "product": "Invarture App Studio",
  "version": "0.5.1",
  "commit": "full-40-character-git-sha",
  "shortCommit": "1234abcd",
  "fingerprint": "v0.5.1+1234abcd",
  "commitSource": "docker-build",
  "builtAt": "2026-09-15T16:00:00.000Z",
  "environment": "production",
  "node": "v22.x.x"
}
```

Every HTTP response from the self-hosted Node server also contains:

```text
X-Invarture-Version: 0.5.1
X-Invarture-Commit: 1234abcd
```

For example:

```bash
curl -I -u YOUR_APP_USER:YOUR_APP_PASSWORD http://127.0.0.1:8080/
```

## Why Docker shows the correct commit

During `docker compose up -d --build`, the Dockerfile runs `scripts/generate-build-info.js` while the Git metadata is still available in the build context. It writes `build-info.json` into the image and then removes `.git` from the production image.

This gives the running container an immutable build fingerprint without shipping the complete Git repository metadata.

## If the browser appears stale

First compare `/api/version` with `git rev-parse --short=8 HEAD`.

If those match but the UI looks old, hard-refresh the browser:

```text
Ctrl + Shift + R
```

The service worker uses a versioned cache and API responses are never served from the PWA cache.

## Source of truth

`package.json` is the source of truth for the product version.

The Git commit stamped during the Docker build is the source of truth for the exact deployed source revision.
