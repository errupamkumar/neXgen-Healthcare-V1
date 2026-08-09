# Deployment Guide — neXgen Healthcare

Deploying the OPD scheduling, patient history and telehealth suite to a Linux VM.

| | |
|---|---|
| **Application** | neXgen Healthcare (`react-example` in `package.json`) |
| **Runtime** | Node.js ≥ 20 (22 LTS installed by the script) |
| **Listens on** | `127.0.0.1:3001` (configurable), fronted by nginx on 80/443 |
| **Datastore** | `data.json` — a flat JSON file, no database server |
| **External API** | Google Gemini (`gemini-3.5-flash`) for document analysis |
| **Build** | `npm run package` on your workstation → `build/nexgen-<ts>.tar.gz` (~350 KB) |
| **Deploy script** | [`deploy/deploy.sh`](deploy/deploy.sh) |
| **Runtime deps** | 3 packages — `@google/genai`, `dotenv`, `express` |

---

## 1. Read this first — the API is unauthenticated

`server.ts` exposes **26 endpoints and applies no authentication or authorisation
whatsoever**. The only middleware registered is `express.json()`. The sign-in screen is
client-side only: `Login.tsx` matches against a local `demoAccounts` object and never
contacts the server, so there is no session, token or cookie to check.

The practical consequences on a public IP:

| Request | Effect |
|---|---|
| `GET /api/patients` | Returns every patient record — names, ABHA IDs, conditions, medications, notes |
| `GET /api/documents` | Returns the full text of every prescription and lab report |
| `POST /api/system/reset` | **Wipes the datastore** and reseeds demo data. No confirmation, no auth |
| `POST /api/documents/:id/analyze` | Spends your Gemini quota on request |

**Do not expose this to the open internet with real patient data.** Until authentication is
implemented, deploy it behind one of:

- a private network or VPN (WireGuard/Tailscale), or
- an nginx IP allowlist:
  ```nginx
  location /api/ { allow 203.0.113.0/24; deny all; proxy_pass http://127.0.0.1:3001; }
  ```
- HTTP Basic auth at nginx:
  ```bash
  sudo apt-get install -y apache2-utils
  sudo htpasswd -c /etc/nginx/.htpasswd clinic
  # then inside the server block:
  #   auth_basic "Restricted"; auth_basic_user_file /etc/nginx/.htpasswd;
  ```

At minimum, block `/api/system/reset` in nginx before going live:

```nginx
location = /api/system/reset { return 403; }
```

This is a limitation of the application, not of the deployment. See
[§13 Production readiness](#13-production-readiness-checklist).

---

## 2. What gets deployed

A single Node process does everything — there is no separate web server or API service:

```
            ┌────────────── VM ──────────────────────────────┐
Browser ──► │ nginx :80/:443 ──► node :3001 (Express)        │
            │                     ├── GET  /*     → dist/    │  React SPA (static)
            │                     └── /api/*      → handlers │  JSON file I/O
            │                                                │
            │  /opt/nexgen-health/shared/data.json           │  the datastore
            └────────────────────────────────────────────────┘
                                  │
                                  └──► generativelanguage.googleapis.com  (Gemini)
```

In production (`NODE_ENV=production`) `server.ts` serves the pre-built `dist/` directory as
static files and falls back to `index.html` for client-side routing. Vite's dev middleware is
skipped.

---

## 3. Requirements

**VM sizing** — the app is light at runtime. Sizing is driven entirely by *where you build*
(see [§5](#5-two-ways-to-release)).

| | Artifact deploy | Build on the VM |
|---|---|---|
| vCPU | 1 | 2 |
| RAM | 512 MB | 2 GB, or 1 GB + swap |
| Disk | 3 GB | 10 GB |

Building on the VM is the demanding part: Vite transforms ~2,250 modules and can be
OOM-killed on a 1 GB box with no swap. Add swap first if you build on a small instance:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

With artifact deploys none of that applies — the VM only unpacks a tarball and installs
three runtime packages.

**Workstation** (artifact deploys) — Node.js ≥ 20 and `tar`. Windows 10+, macOS and Linux
all ship a usable `tar`; nothing else to install.

**OS on the VM** — Ubuntu 22.04/24.04 or Debian 12 (apt). RHEL/Fedora/Rocky work via dnf.

**Network** — inbound 22, 80, 443. Outbound 443 to `deb.nodesource.com`, `registry.npmjs.org`
and `generativelanguage.googleapis.com`. (`registry.npmjs.org` is still needed for artifact
deploys — the VM resolves its own Linux-native dependencies from the lockfile.)

**Credentials** — a Google Gemini API key from https://aistudio.google.com/apikey.

---

## 4. Configuration reference

Runtime settings live in `/opt/nexgen-health/shared/.env` (mode `600`, owned by `nexgen`) and
are loaded by systemd via `EnvironmentFile`.

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `NODE_ENV` | `production` | yes | Serves `dist/` instead of Vite dev middleware |
| `PORT` | `3001` | no | Port the Node process binds (`0.0.0.0`) |
| `GEMINI_API_KEY` | — | for AI | Document analysis; other features work without it |
| `APP_URL` | `http://localhost:3001` | no | Public URL for self-referential links |

The key is read lazily, so the app boots fine without it — only
`POST /api/documents/:id/analyze` returns a 500 until it is set.

Script-level settings, passed as environment variables to `deploy.sh`:

| Variable | Default | Purpose |
|---|---|---|
| `ARTIFACT` | — | Path to a `npm run package` tarball. **Set it and the VM never builds.** Unset means build from source |
| `APP_PORT` | `3001` | Port written into `.env`, nginx and the health check |
| `SERVER_NAME` | `_` | nginx `server_name`; set to your domain |
| `SETUP_NGINX` | `yes` | `no` to skip the reverse proxy entirely |
| `NODE_MAJOR` | `22` | Node major version installed |
| `KEEP_RELEASES` | `5` | Releases retained before pruning |
| `APP_ROOT` | `/opt/nexgen-health` | Install location |
| `APP_USER` | `nexgen` | System user that owns and runs the app |
| `SOURCE_DIR` | repo root | Directory to build from — ignored when `ARTIFACT` is set |
| `HEALTH_TIMEOUT` | `45` | Seconds to wait for the app to answer before rollback |

---

## 5. Two ways to release

| | **Artifact** (recommended) | **Build on VM** |
|---|---|---|
| Where the build runs | your machine | the VM |
| VM needs build tooling | no | yes |
| Upload size | **~350 KB** | full source |
| VM `node_modules` | **38 MB, 97 pkgs** | ~400 MB, 600+ pkgs |
| VM RAM needed | minimal | 2 GB (or swap) |
| Deploy time on VM | ~10 s | ~60–90 s |

The artifact path builds here, ships one tarball, and the VM only installs three
runtime dependencies. Use it unless you specifically want the VM to build.

### 5.1 Quick start — artifact

```bash
# on your machine
npm run package                      # builds + writes build/nexgen-<ts>.tar.gz
scp build/nexgen-*.tar.gz deploy@vm-host:/tmp/

# on the VM — first time only
ssh deploy@vm-host
mkdir -p ~/nexgen && tar -C ~/nexgen -xzf /tmp/nexgen-*.tar.gz
chmod +x ~/nexgen/deploy/deploy.sh
sudo GEMINI_API_KEY='your-key' SERVER_NAME='clinic.example.com' ~/nexgen/deploy/deploy.sh setup

# publish
sudo ARTIFACT=/tmp/nexgen-<ts>.tar.gz ~/nexgen/deploy/deploy.sh release

# TLS
sudo certbot --nginx -d clinic.example.com
```

Every deploy after that is two commands:

```bash
npm run package
scp build/nexgen-*.tar.gz deploy@vm-host:/tmp/ && \
  ssh deploy@vm-host "sudo ARTIFACT=/tmp/nexgen-<ts>.tar.gz /opt/nexgen-health/current/deploy/deploy.sh release"
```

### 5.2 Quick start — build on the VM

```bash
rsync -az --delete --exclude node_modules --exclude dist --exclude .env \
  ./ deploy@vm-host:/srv/src/nexgen-health/
ssh deploy@vm-host
cd /srv/src/nexgen-health && chmod +x deploy/deploy.sh
sudo GEMINI_API_KEY='your-key' SERVER_NAME='clinic.example.com' ./deploy/deploy.sh setup
sudo ./deploy/deploy.sh release      # no ARTIFACT set -> builds from source
```

### 5.3 What is in the artifact

```
dist/            compiled client, dist/server.cjs, BUILD_INFO.json
package.json     production manifest — @google/genai, dotenv, express
package-lock.json
deploy/          the deployment script
```

`node_modules` is deliberately **not** shipped. It contains platform-native
binaries — on a Windows workstation, `@tailwindcss/oxide-win32-x64-msvc`,
`lightningcss-win32-x64-msvc`, `@rollup/rollup-win32-x64-msvc` — which cannot
execute on Linux. The VM runs `npm ci --omit=dev` and gets its own Linux-native
copies from the lockfile, so the artifact is OS-independent.

The client source map is excluded (it roughly doubles the payload); the much
smaller `server.cjs.map` is kept so production stack traces stay readable.

---

## 6. Step by step

### 6.1 Build the artifact (on your workstation)

```bash
npm install          # once, or after dependency changes
npm run package
```

`npm run package` runs `npm run build` then archives exactly what the VM needs. It prints the
path and the follow-up commands:

```
==> Creating archive
  ✔ build/nexgen-20260804T050251.tar.gz  (0.3 MB)
```

It refuses to produce an archive if `dist/server.cjs`, `dist/index.html` or
`package-lock.json` is missing, so you cannot ship a half-built release.

`dist/BUILD_INFO.json` is stamped into every artifact, which is how you confirm what a VM is
actually running:

```json
{
  "builtAt": "2026-08-04T05:02:51.803Z",
  "builtOn": "win32-x64",
  "node": "v24.11.1",
  "runtimeDependencies": ["@google/genai", "dotenv", "express"]
}
```

Then copy it over:

```bash
scp build/nexgen-*.tar.gz deploy@vm-host:/tmp/
```

> **Skip this section entirely if you build on the VM.** In that case put the source on the
> VM instead — `rsync` as in §5.2, or `git clone` into `/srv/src/nexgen-health` — excluding
> `node_modules`, `dist` and `.env`.

### 6.2 Provision the VM (once)

The deployment script travels inside the artifact, so unpack it once to get at it:

```bash
ssh deploy@vm-host
mkdir -p ~/nexgen && tar -C ~/nexgen -xzf /tmp/nexgen-*.tar.gz
chmod +x ~/nexgen/deploy/deploy.sh
sudo GEMINI_API_KEY='...' SERVER_NAME='clinic.example.com' ~/nexgen/deploy/deploy.sh setup
```

After the first release the script is available at
`/opt/nexgen-health/current/deploy/deploy.sh`, so `~/nexgen` is only a bootstrap.

This is idempotent — safe to re-run. It:

1. Installs Node.js 22 from NodeSource (skipped if Node ≥ 20 is already present).
2. Creates the `nexgen` system user (`nologin` shell, no password).
3. Creates `/opt/nexgen-health/{releases,shared}`.
4. Writes `shared/.env` at mode `600` — **an existing file is never overwritten**.
5. Installs and enables `/etc/systemd/system/nexgen-health.service`.
6. Installs nginx and a reverse-proxy site, runs `nginx -t`, reloads.
7. Opens the firewall for nginx if `ufw` is active.

### 6.3 Release

```bash
sudo ARTIFACT=/tmp/nexgen-<ts>.tar.gz /opt/nexgen-health/current/deploy/deploy.sh release
```

Each release is assembled in its own directory and only goes live once it passes a health
check. `ARTIFACT` selects which pipeline runs:

```
ARTIFACT set ──► unpack tarball ──► link data.json ──► npm ci --omit=dev ─┐
                                                                          │
ARTIFACT unset ► stage source ──► link data.json ──► npm ci ──► npm run build
                                              └──► npm prune --omit=dev ──┤
                                                                          │
                        verify dist/ ──► switch symlink ──► restart ──► health check
                                                                          │
                                            pass ──► prune old releases ──┘
                                            fail ──► restore previous release, exit 1
```

The health check polls `http://127.0.0.1:$PORT/api/doctors` for up to 45 seconds and aborts
early if systemd reports the unit stopped. A failed release is **not** deleted — it stays in
`releases/` so you can inspect it.

Both pipelines end with the same guard: the release is rejected unless `dist/server.cjs` and
`dist/index.html` are present.

### 6.4 TLS

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d clinic.example.com
```

Certbot rewrites the nginx site in place and installs a renewal timer. Re-running
`deploy.sh setup` would overwrite that file — run releases with `SETUP_NGINX=no` afterwards,
or keep your own copy of the site config.

---

## 7. Layout on the VM

```
/opt/nexgen-health/
├── current -> releases/20260803T101500     atomic switch; systemd WorkingDirectory
├── releases/
│   ├── 20260803T101500/                    one unpacked artifact + node_modules
│   │   ├── data.json -> ../../shared/data.json
│   │   ├── dist/{index.html,assets/,server.cjs,BUILD_INFO.json}
│   │   ├── node_modules/                   38 MB, installed on the VM
│   │   └── package.json, package-lock.json
│   └── 20260802T183000/                    previous release, kept for rollback
└── shared/
    ├── .env                                secrets, mode 600
    ├── data.json                           THE DATASTORE
    └── data.json.20260803T101500.bak       pre-deploy backups (last 10)
```

### Why this shape

- **`data.json` is the database and it is committed to the repo** — it is not in
  `.gitignore`. Copying the source tree over the app directory would replace live patient
  records with the seed file. Every release therefore gets a *symlink* to
  `shared/data.json`, and the live file is copied to a timestamped `.bak` before each deploy.
- **`server.ts` resolves paths from `process.cwd()`** — both the datastore
  (`path.join(process.cwd(), 'data.json')`) and the static folder
  (`path.join(process.cwd(), 'dist')`). That is why systemd's `WorkingDirectory` is the
  release root and the data file is linked *into* it, rather than the reverse.
- **Dependencies are not bundled.** `esbuild --packages=external` leaves every import
  external, so `dist/server.cjs` alone will not boot — a release always needs
  `node_modules`. What it *doesn't* need is the build chain: `vite` is imported lazily
  inside `startServer()`, so it never enters the production require graph. That keeps the
  runtime manifest down to three packages.

---

## 8. Operations

```bash
sudo ./deploy/deploy.sh status      # current release, port, datastore size, unit status
sudo ./deploy/deploy.sh logs        # journalctl -u nexgen-health -f
sudo ./deploy/deploy.sh rollback    # step back one release, with health check

sudo systemctl restart nexgen-health
sudo systemctl stop nexgen-health
journalctl -u nexgen-health --since '1 hour ago'
```

The unit uses `Restart=always` with a 3-second delay, so the app comes back after a crash and
starts automatically on boot.

### systemd hardening applied

`NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`, `ProtectHome`,
`ProtectKernelTunables`, `ProtectControlGroups`, `RestrictSUIDSGID`.

`ProtectSystem=strict` makes the entire filesystem read-only for the service, so
`ReadWritePaths=/opt/nexgen-health/shared` grants the datastore directory back. If you move
the datastore, that path must be updated or writes will fail with `EROFS`.

---

## 9. Backup and restore

The whole dataset is one file. Back it up off-box — the local `.bak` copies only protect
against a bad deploy, not against losing the VM.

```bash
# manual snapshot
sudo cp /opt/nexgen-health/shared/data.json ~/data-$(date -u +%F).json

# nightly off-box backup (crontab -e as root)
0 2 * * * cp /opt/nexgen-health/shared/data.json /var/backups/nexgen-$(date +\%F).json && \
          find /var/backups -name 'nexgen-*.json' -mtime +30 -delete
```

Restore:

```bash
sudo systemctl stop nexgen-health
sudo cp /path/to/backup.json /opt/nexgen-health/shared/data.json
sudo chown nexgen:nexgen /opt/nexgen-health/shared/data.json
sudo chmod 640 /opt/nexgen-health/shared/data.json
sudo systemctl start nexgen-health
```

Writes are `fs.writeFileSync` with no locking, so stop the service before restoring.

---

## 10. Updating the application

```bash
npm run package
scp build/nexgen-*.tar.gz deploy@vm-host:/tmp/
ssh deploy@vm-host "sudo ARTIFACT=/tmp/nexgen-<ts>.tar.gz \
  /opt/nexgen-health/current/deploy/deploy.sh release"
```

Or, if you build on the VM:

```bash
rsync -az --delete --exclude node_modules --exclude dist --exclude .env \
  ./ deploy@vm-host:/srv/src/nexgen-health/
ssh deploy@vm-host 'cd /srv/src/nexgen-health && sudo ./deploy/deploy.sh release'
```

Downtime is one systemd restart (~1–2 s). If the new release fails its health check the
previous one is restored automatically.

Confirm what went live:

```bash
sudo ./deploy/deploy.sh status
cat /opt/nexgen-health/current/dist/BUILD_INFO.json
```

Changing dependencies is the one case that needs care: run `npm install` locally so
`package-lock.json` is regenerated **before** packaging, otherwise the VM's `npm ci` fails
with a lockfile-out-of-sync error.

---

## 11. Build reference

`npm run build` runs two steps; `npm run package` runs those plus the archive step:

```
vite build                                   → dist/index.html, dist/assets/*
esbuild server.ts --bundle --platform=node
  --format=cjs --packages=external           → dist/server.cjs
node scripts/package.mjs                     → build/nexgen-<ts>.tar.gz
```

Measured output:

| File | Size | Gzipped |
|---|---:|---:|
| `dist/index.html` | 1.0 kB | 0.5 kB |
| `dist/assets/index-*.css` | 87.4 kB | 13.6 kB |
| `dist/assets/index-*.js` | 977.5 kB | 258.0 kB |
| `dist/server.cjs` | 33.7 kB | 9.3 kB |
| **`build/nexgen-*.tar.gz`** | **343 kB** | — |

Vite warns that the JS chunk exceeds 500 kB. It is served gzipped at ~258 kB, which is
acceptable, but code-splitting the heavy `recharts` and `motion` imports would improve first
load if that matters to you.

Build takes roughly 25 s on a workstation, 40 s on 2 vCPU.

`build/` accumulates one tarball per `npm run package`. It is gitignored; prune it whenever
you like — the VM keeps its own copies under `releases/`.

### Runtime vs build-time dependencies

`package.json` classifies them by *when they are needed*, which is what makes the artifact
small:

| | Packages |
|---|---|
| `dependencies` (installed on the VM) | `@google/genai`, `dotenv`, `express` |
| `devDependencies` (workstation only) | `vite`, `esbuild`, `tsx`, `typescript`, `tailwindcss`, `react`, `react-dom`, `recharts`, `motion`, `lucide-react`, `qrcode.react`, … |

React and the other client libraries live in `devDependencies` because they are compiled
into `dist/assets/*.js` at build time and are never `require`d by the server. Measured:
`npm ci --omit=dev` installs **97 packages / 38 MB**.

Consequence: `npm run dev` needs a full `npm install`. Do not run `npm ci --omit=dev` on a
development machine.

---

## 12. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `setup` aborts at `apt-get update` with `write (28: No space left on device)`, `IO Error saving source cache`, or `Splitting up …InRelease into data and signature failed` | **The disk is full.** The last two are truncated apt index files — a symptom, not the cause | See [§12.1](#121-disk-full) |
| `gzip: stdin: not in gzip format` / `tar: Child returned status 1` | The artifact was truncated or mangled in transfer — often because the VM's disk was full | See [§12.2](#122-artifact-will-not-unpack) |
| `EADDRINUSE :3001` | Another process holds the port | `sudo ss -lptn 'sport = :3001'`, then stop it or set `APP_PORT` |
| `Cannot find module 'express'` on boot | `node_modules` missing from the release | Re-run `release`; `dist/server.cjs` never bundles its dependencies |
| `Error: Cannot find module '@rollup/rollup-linux-x64-gnu'` or an `.msvc` path | A workstation `node_modules` was copied to the VM | Never ship `node_modules`. Use `npm run package` and let the VM run `npm ci --omit=dev` |
| `npm ci` on the VM errors `lock file out of sync` | `package.json` changed without regenerating the lock | Run `npm install` on your machine, commit the lockfile, repackage |
| Artifact rejected: "artifact has no package-lock.json" | Tarball built by hand | Build it with `npm run package` |
| `EROFS: read-only file system` writing `data.json` | Datastore moved outside `ReadWritePaths` | Update `ReadWritePaths` in the unit, `systemctl daemon-reload` |
| `EACCES` on `data.json` | Wrong ownership | `sudo chown nexgen:nexgen /opt/nexgen-health/shared/data.json` |
| Analysis returns 500 `GEMINI_API_KEY environment variable is required` | Key not set | Edit `shared/.env`, `systemctl restart nexgen-health` |
| `413 Payload Too Large` when saving a long report | `express.json()` uses a 100 kB default limit | Raise it in `server.ts`: `express.json({ limit: '5mb' })`, then redeploy |
| Build killed with no error | Out of memory | Add swap (§3) or build on a larger instance |
| Blank page, 200 responses | `NODE_ENV` not `production`, so `dist/` is not served | Confirm `NODE_ENV=production` in `shared/.env` |
| nginx `502 Bad Gateway` | App not running | `sudo ./deploy/deploy.sh status`, then `logs` |
| `npm ci` fails with `EACCES` in `/root/.npm` | `HOME` not set for the app user | Already handled by the script; if running npm by hand, use `sudo -u nexgen env HOME=/home/nexgen npm ci` |

### 12.1 Disk full

`setup` and `release` both preflight free space and stop with a clear message. If they did
not (older copy of the script), a full disk shows up as a wall of apt errors whose real cause
— `write (28: No space left on device)` — is buried in the middle.

```bash
df -h          # which filesystem is full
df -i          # inodes can be exhausted while bytes are free
```

Find the consumers, then reclaim:

```bash
sudo du -xh --max-depth=1 /    2>/dev/null | sort -rh | head -15
sudo du -xh --max-depth=1 /var 2>/dev/null | sort -rh | head -15

sudo apt-get clean                     # cached .deb packages
sudo journalctl --vacuum-size=200M     # journals are often several GB
docker system prune -af --volumes      # if Docker is installed
```

**Repair apt afterwards.** Index files truncated by the full disk stay broken even once
space is free:

```bash
sudo rm -rf /var/lib/apt/lists/*
sudo apt-get update                    # must succeed before re-running setup
```

**If the root volume is small and a data volume is large**, install onto the big one — every
path in the systemd unit, including `ReadWritePaths`, is templated from `APP_ROOT`:

```bash
sudo APP_ROOT=/data/nexgen-health GEMINI_API_KEY='...' \
  SERVER_NAME='clinic.example.com' ./deploy/deploy.sh setup
```

Existing installs can be moved: stop the service, `mv` the tree, then re-run `setup` with the
new `APP_ROOT` to rewrite the unit.

### 12.2 Artifact will not unpack

```
gzip: stdin: not in gzip format
tar: Child returned status 1
```

The file on the VM is not a complete archive. `deploy.sh release` now checks this before
unpacking and reports it plainly, but a manual `tar -xzf` gives only the message above.

```bash
ls -l  nexgen-*.tar.gz          # complete build is ~340 KB
df -h  .                        # a full disk truncates the upload mid-write
file   nexgen-*.tar.gz          # want: "gzip compressed data"
head -c 2 nexgen-*.tar.gz | xxd -p    # want: 1f8b
```

A size of 0, or anything well under the expected figure, means the transfer did not finish.
Free space first (see [§12.1](#121-disk-full)), then re-copy **with the checksum sidecar** and
verify before unpacking:

```bash
# workstation
scp build/nexgen-<ts>.tar.gz build/nexgen-<ts>.tar.gz.sha256 user@vm-host:/tmp/

# VM
cd /tmp && sha256sum -c nexgen-<ts>.tar.gz.sha256     # must print "OK"
```

`npm run package` writes that `.sha256` next to every artifact and prints the hash. When the
sidecar is present, `deploy.sh` verifies it automatically and refuses to deploy a file that
does not match the one you built.

Other causes worth ruling out: transferring through something that rewrites line endings
(use `scp`/`rsync`, never an ASCII-mode FTP client or copy-paste), or copying a file that was
still being written.

---

## 13. Production readiness checklist

Deployment concerns are handled by the script. These are **application** gaps to close before
this holds real patient data:

- [ ] **Authentication and authorisation on `/api/*`** — currently none (§1). Login is
      client-side only.
- [ ] **Remove or protect `POST /api/system/reset`** — it wipes the datastore unauthenticated.
- [ ] **Replace the JSON file datastore** — `data.json` is read and rewritten in full on every
      mutation with no locking. Two simultaneous writes can lose data. Move to PostgreSQL, or
      finish the FastAPI + MySQL service in `backend/`.
- [ ] **Rate-limit the Gemini endpoint** — anyone who can reach it can spend your quota.
- [ ] **Raise the JSON body limit** — pasted reports over 100 kB currently fail with 413.
- [ ] **Audit logging** — no record of who read or changed a record.
- [ ] **Encryption at rest** — `data.json` is plaintext PHI on disk; use an encrypted volume.
- [ ] **Off-box backups** — configure the cron job in §9.
- [ ] Confirm ABDM/DPDP Act obligations for storing health data in your jurisdiction.

---

## 14. The optional FastAPI backend

`backend/` contains a FastAPI + SQLAlchemy + MySQL service (`backend/main.py`,
`backend/database.py`, `backend/models.py`). **It is not deployed by this script and the React
app does not call it** — the frontend talks only to the Express server in `server.ts`.

It exists as the beginning of a proper database-backed API. If you adopt it, you will need to
deploy it separately (uvicorn behind systemd + nginx), provision MySQL, set `MYSQL_*`
environment variables (see `backend/database.py`), and repoint the frontend's `fetch('/api/…')`
calls. Its CORS policy is currently `allow_origins=["*"]`, which must be tightened first.

---

## 15. Uninstall

```bash
sudo systemctl disable --now nexgen-health
sudo rm /etc/systemd/system/nexgen-health.service
sudo systemctl daemon-reload
sudo rm -f /etc/nginx/sites-enabled/nexgen-health /etc/nginx/sites-available/nexgen-health
sudo systemctl reload nginx

sudo cp /opt/nexgen-health/shared/data.json ~/nexgen-final-backup.json   # keep the data!
sudo rm -rf /opt/nexgen-health
sudo userdel -r nexgen
```



#------------------------------
Next — first deploy to a fresh VM:

  scp build/nexgen-20260804T063526.tar.gz deploy@vm-host:/tmp/
  ssh deploy@vm-host
  mkdir -p ~/nexgen && tar -C ~/nexgen -xzf /tmp/nexgen-20260804T063526.tar.gz
  chmod +x ~/nexgen/deploy/deploy.sh
  sudo GEMINI_API_KEY='your-key' SERVER_NAME='clinic.example.com' ~/nexgen/deploy/deploy.sh setup
  sudo ARTIFACT=/tmp/nexgen-20260804T063526.tar.gz ~/nexgen/deploy/deploy.sh release

Every deploy after that:

  scp build/nexgen-20260804T063526.tar.gz deploy@vm-host:/tmp/
  ssh deploy@vm-host "sudo ARTIFACT=/tmp/nexgen-20260804T063526.tar.gz /opt/nexgen-health/current/deploy/deploy.sh release"