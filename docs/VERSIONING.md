# Build and version verification

Invarture App Studio exposes the exact product version and Git commit that are running on the server.

## Current baseline

The current deployment baseline is **v0.5.2** and uses port **8081** everywhere.

The sidebar workspace card and top bar display a build badge like:

```text
v0.5.2 · 1234abcd
```

The first value is the product version. The second is the first 8 characters of the Git commit stamped into the running Docker image.

Click the badge to open **Running build** details.

## Normal Ubuntu/WSL update

```bash
git pull
sudo docker compose up -d --build
```

## Verify host checkout against the running application

```bash
git rev-parse --short=8 HEAD
```

Then query the running server:

```bash
curl http://127.0.0.1:8081/healthz
curl http://127.0.0.1:8081/api/version
```

If HTTP Basic protection is enabled, use:

```bash
curl -u YOUR_APP_USER:YOUR_APP_PASSWORD http://127.0.0.1:8081/api/version
```

Example response:

```json
{
  "product": "Invarture App Studio",
  "version": "0.5.2",
  "commit": "full-40-character-git-sha",
  "shortCommit": "1234abcd",
  "fingerprint": "v0.5.2+1234abcd",
  "commitSource": "docker-build",
  "builtAt": "2026-09-15T16:00:00.000Z",
  "environment": "production",
  "node": "v22.x.x"
}
```

The short SHA from Git, the UI badge and `/api/version` must match.

## Docker port model

The container now uses the same port internally and externally:

```text
Browser -> localhost:8081 -> Docker :8081 -> Node :8081
```

There is no 8080 translation in the default deployment.

## Container verification

```bash
sudo docker compose ps
sudo docker compose exec -T invarture-app-studio cat /app/build-info.json
```

`docker compose ps` should eventually report the container as healthy and show a mapping equivalent to:

```text
0.0.0.0:8081->8081/tcp
```

## HTTP headers

Every response from the self-hosted Node server includes:

```text
X-Invarture-Version: 0.5.2
X-Invarture-Commit: 1234abcd
```

## Docker build fingerprint

During the Docker build, `scripts/generate-build-info.js` reads the Git revision from the build context and writes `build-info.json`. The Dockerfile then removes `.git` before the image is finalized.

The repository includes `.dockerignore`, which excludes `.env`, local data and logs from the build context so secrets are not baked into the image.

## If the browser appears stale

First verify that `/healthz` and `/api/version` work on port 8081.

Then compare `/api/version` with:

```bash
git rev-parse --short=8 HEAD
```

If those match but the UI still looks old, hard-refresh or clear the service worker/site data. The current service worker uses a network-first strategy with a versioned cache.

## Source of truth

`package.json` is the source of truth for the product version.

The Git commit stamped during the Docker build is the source of truth for the exact deployed source revision.
