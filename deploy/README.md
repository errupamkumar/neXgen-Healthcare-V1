# deploy/

Deployment tooling for a Linux VM.

| File | Purpose |
|---|---|
| `deploy.sh` | Provisioning and release script — run it on the VM |

**The full guide lives in [`../DEPLOYMENT.md`](../DEPLOYMENT.md)** — requirements, security
notes, configuration reference, backup/restore, troubleshooting and a production-readiness
checklist. This file is only a command reminder.

```bash
sudo ./deploy/deploy.sh setup      # one-time: Node, user, systemd, nginx
sudo ./deploy/deploy.sh release    # publish, auto-rollback on failure
sudo ./deploy/deploy.sh rollback   # step back one release
sudo ./deploy/deploy.sh status     # current release and service status
sudo ./deploy/deploy.sh logs       # journalctl -f
```

Two release modes:

```bash
# recommended — build on your workstation first:
#   npm run package && scp build/nexgen-*.tar.gz deploy@vm-host:/tmp/
sudo ARTIFACT=/tmp/nexgen-<ts>.tar.gz ./deploy/deploy.sh release

# build from source on the VM (needs the source tree + 2 GB RAM)
sudo ./deploy/deploy.sh release
```

First run:

```bash
chmod +x deploy/deploy.sh
sudo GEMINI_API_KEY='your-key' SERVER_NAME='clinic.example.com' ./deploy/deploy.sh setup
```

> **Before exposing this publicly:** the application's API has no authentication —
> `GET /api/patients` returns every record and `POST /api/system/reset` wipes the datastore.
> See [§1 of the deployment guide](../DEPLOYMENT.md#1-read-this-first--the-api-is-unauthenticated).
