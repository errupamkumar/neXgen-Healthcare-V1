<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/71ef60de-9eec-4c00-8e92-a1f9903eb776

## Run Locally

**Prerequisites:**  Node.js 20 or newer


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

The dev server serves the API and the React app together on http://localhost:3001.

## Deploy

Build here, ship a ~350 KB tarball to the VM:

```bash
npm run package                                  # -> build/nexgen-<ts>.tar.gz
scp build/nexgen-*.tar.gz deploy@vm-host:/tmp/
ssh deploy@vm-host "sudo ARTIFACT=/tmp/nexgen-<ts>.tar.gz \
  /opt/nexgen-health/current/deploy/deploy.sh release"
```

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full Linux VM guide — first-time provisioning,
TLS, backups, rollback and troubleshooting.

> The API currently has no authentication. Read
> [§1 of the deployment guide](DEPLOYMENT.md#1-read-this-first--the-api-is-unauthenticated)
> before putting this on a public address.
