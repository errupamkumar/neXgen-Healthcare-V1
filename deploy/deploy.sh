#!/usr/bin/env bash
#
# neXgen Healthcare — Linux VM deployment
#
#   sudo ./deploy/deploy.sh setup     one-time VM provisioning (Node, user, systemd, nginx)
#   sudo ./deploy/deploy.sh release   publish a new release, with automatic rollback
#   sudo ./deploy/deploy.sh rollback  return to the previous release
#   sudo ./deploy/deploy.sh status    service status and current release
#   sudo ./deploy/deploy.sh logs      follow the application log
#
# Two release modes:
#   ARTIFACT=/tmp/nexgen-*.tar.gz ... release   ship a build made on your machine
#   (no ARTIFACT)                  ... release   build from source on the VM
#
# Layout created on the VM (Capistrano-style, atomic switch via symlink):
#
#   /opt/nexgen-health/
#     releases/20260803T101500/   <- one directory per deploy
#     shared/data.json            <- the datastore; survives every deploy
#     shared/.env                 <- secrets; never inside a release
#     current -> releases/<ts>    <- systemd WorkingDirectory
#
# Tested against Ubuntu 22.04/24.04 and Debian 12.
#
set -Eeuo pipefail

# ---------------------------------------------------------------------------
# Configuration — override via environment, e.g. APP_PORT=8080 ./deploy.sh setup
# ---------------------------------------------------------------------------
APP_NAME="${APP_NAME:-nexgen-health}"
APP_ROOT="${APP_ROOT:-/opt/${APP_NAME}}"
APP_USER="${APP_USER:-nexgen}"
APP_PORT="${APP_PORT:-3001}"
NODE_MAJOR="${NODE_MAJOR:-22}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
SERVER_NAME="${SERVER_NAME:-_}"          # nginx server_name; set to your domain
SETUP_NGINX="${SETUP_NGINX:-yes}"        # "no" to skip the reverse proxy
HEALTH_PATH="${HEALTH_PATH:-/api/doctors}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-45}"   # seconds to wait for the app to answer

# Path to a tarball from "npm run package". When set, the VM installs runtime
# dependencies only and never builds — no Node toolchain load on the server.
ARTIFACT="${ARTIFACT:-}"

RELEASES_DIR="${APP_ROOT}/releases"
SHARED_DIR="${APP_ROOT}/shared"
CURRENT_LINK="${APP_ROOT}/current"
ENV_FILE="${SHARED_DIR}/.env"
DATA_FILE="${SHARED_DIR}/data.json"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"

# Repo root = parent of the directory holding this script.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SOURCE_DIR:-$(cd -- "${SCRIPT_DIR}/.." && pwd)}"

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_INFO=$'\033[36m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'
else
  C_RESET=""; C_INFO=""; C_OK=""; C_WARN=""; C_ERR=""
fi
log()  { printf '%s==>%s %s\n' "$C_INFO" "$C_RESET" "$*"; }
ok()   { printf '%s  ✔%s %s\n' "$C_OK"   "$C_RESET" "$*"; }
warn() { printf '%s  !%s %s\n' "$C_WARN" "$C_RESET" "$*" >&2; }
die()  { printf '%s  ✘%s %s\n' "$C_ERR"  "$C_RESET" "$*" >&2; exit 1; }

trap 'die "failed at line $LINENO: ${BASH_COMMAND}"' ERR

require_root() {
  [[ ${EUID} -eq 0 ]] || die "run with sudo: sudo $0 $*"
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
# A full disk surfaces as a wall of confusing apt/npm errors ("Splitting up
# InRelease into data and signature failed", "IO Error saving source cache")
# whose real cause — write (28: No space left on device) — is buried. Check up
# front and say so plainly.

# df needs a path that exists; walk up until one does.
nearest_existing() {
  local p="$1"
  while [[ ! -e "${p}" && "${p}" != "/" ]]; do p="$(dirname "${p}")"; done
  printf '%s' "${p}"
}

check_space() {
  local target need_mb label avail_mb ifree
  target="$(nearest_existing "$1")"
  need_mb="$2"
  label="$3"

  avail_mb="$(df -Pm "${target}" 2>/dev/null | awk 'NR==2 {print $4}')"
  if [[ -z "${avail_mb}" ]]; then
    warn "could not read free space for ${target} — continuing"
    return 0
  fi

  if (( avail_mb < need_mb )); then
    printf '%s  ✘%s %s\n' "$C_ERR" "$C_RESET" \
      "${label}: only ${avail_mb} MB free on ${target}, need ~${need_mb} MB." >&2
    cat >&2 <<EOF

  Free some space, then re-run. Usual wins:

    sudo apt-get clean
    sudo journalctl --vacuum-size=200M
    docker system prune -af --volumes
    sudo du -xh --max-depth=1 / | sort -rh | head -15

  If the disk already filled once, apt's index files are likely truncated.
  Repair them before retrying:

    sudo rm -rf /var/lib/apt/lists/*
    sudo apt-get update

  If a larger volume is mounted elsewhere, install there instead:

    sudo APP_ROOT=/data/${APP_NAME} $0 setup

EOF
    exit 1
  fi

  # Plenty of free bytes but no inodes fails just as hard, and npm — thousands
  # of tiny files — is exactly what exposes it.
  ifree="$(df -Pi "${target}" 2>/dev/null | awk 'NR==2 {print $4}')"
  if [[ -n "${ifree}" && "${ifree}" =~ ^[0-9]+$ ]] && (( ifree < 20000 )); then
    warn "${target} has only ${ifree} free inodes — npm install may still fail"
  fi

  ok "${label}: ${avail_mb} MB free on ${target}"
}

# ---------------------------------------------------------------------------
# setup — one-time provisioning
# ---------------------------------------------------------------------------
install_node() {
  if command -v node >/dev/null 2>&1; then
    local have
    have="$(node -v | sed 's/^v//; s/\..*//')"
    if [[ "${have}" -ge 20 ]]; then
      ok "Node $(node -v) already installed"
      return
    fi
    warn "Node $(node -v) is too old (need >= 20); installing ${NODE_MAJOR}.x"
  fi

  log "Installing Node.js ${NODE_MAJOR}.x"
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg
    install -d -m 0755 /etc/apt/keyrings
    curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" \
      | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y -qq nodejs
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    dnf install -y nodejs
  else
    die "unsupported distro: install Node.js >= 20 manually, then re-run"
  fi
  ok "Node $(node -v) installed"
}

create_user_and_dirs() {
  if ! id -u "${APP_USER}" >/dev/null 2>&1; then
    log "Creating system user ${APP_USER}"
    useradd --system --create-home --home-dir "/home/${APP_USER}" --shell /usr/sbin/nologin "${APP_USER}"
  fi
  install -d -o "${APP_USER}" -g "${APP_USER}" -m 0755 "${APP_ROOT}" "${RELEASES_DIR}" "${SHARED_DIR}"
  ok "Directories ready under ${APP_ROOT}"
}

create_env_file() {
  if [[ -f "${ENV_FILE}" ]]; then
    ok "Kept existing ${ENV_FILE}"
    return
  fi
  log "Creating ${ENV_FILE}"
  cat > "${ENV_FILE}" <<EOF
# neXgen Healthcare runtime configuration.
# Read by systemd (EnvironmentFile); never commit this file.
NODE_ENV=production
PORT=${APP_PORT}

# Required for the AI document analysis endpoint.
GEMINI_API_KEY=${GEMINI_API_KEY:-replace-me}

# Public URL, used for self-referential links.
APP_URL=${APP_URL:-http://localhost:${APP_PORT}}
EOF
  chown "${APP_USER}:${APP_USER}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  if [[ -z "${GEMINI_API_KEY:-}" ]]; then
    warn "GEMINI_API_KEY is a placeholder — edit ${ENV_FILE} before the AI features will work"
  fi
}

write_service() {
  log "Writing ${SERVICE_FILE}"
  cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=neXgen Healthcare (OPD, patient history and telehealth)
Documentation=https://github.com/your-org/${APP_NAME}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}

# server.ts resolves both data.json and the static dist/ folder from the process
# working directory, so this must be the release root — not the shared dir.
WorkingDirectory=${CURRENT_LINK}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node ${CURRENT_LINK}/dist/server.cjs

Restart=always
RestartSec=3
KillSignal=SIGINT
TimeoutStopSec=20

StandardOutput=journal
StandardError=journal
SyslogIdentifier=${APP_NAME}

# Hardening. ProtectSystem=strict makes the whole filesystem read-only, so the
# datastore directory has to be granted back explicitly.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true
ReadWritePaths=${SHARED_DIR}

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "${APP_NAME}" >/dev/null
  ok "systemd unit installed and enabled"
}

write_nginx() {
  [[ "${SETUP_NGINX}" == "yes" ]] || { warn "Skipping nginx (SETUP_NGINX=${SETUP_NGINX})"; return; }

  if ! command -v nginx >/dev/null 2>&1; then
    log "Installing nginx"
    if command -v apt-get >/dev/null 2>&1; then
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y nginx
    else
      warn "Install nginx manually; skipping reverse proxy"
      return
    fi
  fi

  local site="/etc/nginx/sites-available/${APP_NAME}"
  [[ -d /etc/nginx/sites-available ]] || site="/etc/nginx/conf.d/${APP_NAME}.conf"

  log "Writing ${site}"
  cat > "${site}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};

    # Reports and prescriptions are pasted as text; allow a generous body.
    client_max_body_size 12m;

    # Hashed Vite assets are safe to cache hard.
    location /assets/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_set_header Host \$host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;   # Gemini analysis can be slow
    }
}
EOF

  if [[ -d /etc/nginx/sites-enabled ]]; then
    ln -sfn "${site}" "/etc/nginx/sites-enabled/${APP_NAME}"
    rm -f /etc/nginx/sites-enabled/default
  fi

  nginx -t
  systemctl reload nginx || systemctl restart nginx
  ok "nginx proxying :80 -> 127.0.0.1:${APP_PORT}"

  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow 'Nginx Full' >/dev/null 2>&1 || true
    ok "ufw rule added for nginx"
  fi
}

cmd_setup() {
  require_root setup
  log "Provisioning ${APP_NAME} on $(hostname)"
  # Node + apt need room on the system volume; releases need room wherever
  # APP_ROOT lives. They are often, but not always, the same filesystem.
  check_space / 1000 "System volume"
  check_space "${APP_ROOT}" 1000 "App volume"
  install_node
  create_user_and_dirs
  create_env_file
  write_service
  write_nginx
  echo
  ok "Setup complete."
  echo "  1. Put your key in ${ENV_FILE}  (GEMINI_API_KEY=...)"
  echo "  2. Deploy:  sudo $0 release"
  if [[ "${SERVER_NAME}" != "_" && "${SETUP_NGINX}" == "yes" ]]; then
    echo "  3. TLS:     sudo certbot --nginx -d ${SERVER_NAME}"
  fi
}

# ---------------------------------------------------------------------------
# Artifact integrity
# ---------------------------------------------------------------------------
# A truncated upload — the disk filled, the transfer dropped, the file went
# through something that mangled it — surfaces from tar as "gzip: stdin: not in
# gzip format", which says nothing about the cause. Check before unpacking.
verify_artifact() {
  local f="$1" size
  [[ -f "${f}" ]] || die "artifact not found: ${f}"

  size="$(stat -c%s "${f}" 2>/dev/null || echo 0)"
  if (( size == 0 )); then
    die "artifact is empty: ${f}
      The copy produced a zero-byte file. Check free space on this VM (df -h) and re-copy."
  fi

  if ! gzip -t "${f}" 2>/dev/null; then
    printf '%s  ✘%s %s\n' "$C_ERR" "$C_RESET" "artifact is not a valid gzip archive: ${f}" >&2
    cat >&2 <<EOF

  It is ${size} bytes. A complete build is typically ~340 KB.

  Almost always a broken transfer. Check, in order:

    df -h .                      # a full disk truncates the upload
    ls -l ${f}
    head -c 2 ${f} | xxd -p      # a gzip file must start with 1f8b

  Then re-copy in binary mode and confirm it matches the workstation:

    scp build/nexgen-*.tar.gz build/nexgen-*.tar.gz.sha256 user@host:/tmp/
    cd /tmp && sha256sum -c nexgen-*.tar.gz.sha256

EOF
    exit 1
  fi

  # Sidecar written by "npm run package"; verified when it travelled with the file.
  if [[ -f "${f}.sha256" ]]; then
    if ( cd "$(dirname "${f}")" && sha256sum -c "$(basename "${f}").sha256" >/dev/null 2>&1 ); then
      ok "Checksum verified"
    else
      die "checksum mismatch for ${f}
      The file differs from the one built on the workstation. Re-copy it."
    fi
  else
    warn "no ${f##*/}.sha256 alongside the artifact — skipping checksum verification"
  fi

  ok "Artifact OK (${size} bytes)"
}

# ---------------------------------------------------------------------------
# release — build and publish
# ---------------------------------------------------------------------------
cmd_release() {
  require_root release
  [[ -f "${SERVICE_FILE}" ]] || die "not provisioned yet — run: sudo $0 setup"
  if [[ -z "${ARTIFACT}" && ! -f "${SOURCE_DIR}/package.json" ]]; then
    die "no package.json in ${SOURCE_DIR} — pass ARTIFACT=/path/to.tar.gz or set SOURCE_DIR=/path/to/source"
  fi

  # A release is a fresh node_modules (~38 MB) plus npm's cache and the unpacked
  # tarball. Running out mid-install leaves a corrupt tree.
  check_space "${APP_ROOT}" 500 "App volume"

  local stamp release previous
  stamp="$(date -u +%Y%m%dT%H%M%S)"
  release="${RELEASES_DIR}/${stamp}"
  previous=""
  [[ -L "${CURRENT_LINK}" ]] && previous="$(readlink -f "${CURRENT_LINK}")"

  install -d -o "${APP_USER}" -g "${APP_USER}" "${release}"

  if [[ -n "${ARTIFACT}" ]]; then
    # Prebuilt on a workstation: the tarball already contains dist/.
    verify_artifact "${ARTIFACT}"
    log "Unpacking ${ARTIFACT}"
    tar -C "${release}" -xzf "${ARTIFACT}"
    [[ -f "${release}/package-lock.json" ]] || die "artifact has no package-lock.json — rebuild it with 'npm run package'"
  else
    log "Staging source into ${release}"
    # Copy the working tree, excluding anything that must not travel with a release.
    tar -C "${SOURCE_DIR}" \
        --exclude='./node_modules' \
        --exclude='./dist' \
        --exclude='./.git' \
        --exclude='./.env' \
        --exclude='./.env.local' \
        -cf - . | tar -C "${release}" -xf -
  fi
  chown -R "${APP_USER}:${APP_USER}" "${release}"

  # The repo ships a seed data.json. Replace it with a link to the live one so a
  # deploy can never overwrite real patient records.
  if [[ ! -f "${DATA_FILE}" ]]; then
    if [[ -f "${release}/data.json" ]]; then
      log "Seeding ${DATA_FILE} from the release copy (first deploy)"
      cp "${release}/data.json" "${DATA_FILE}"
    else
      echo '{}' > "${DATA_FILE}"
    fi
    chown "${APP_USER}:${APP_USER}" "${DATA_FILE}"
    chmod 640 "${DATA_FILE}"
  else
    log "Backing up the live datastore"
    cp -a "${DATA_FILE}" "${SHARED_DIR}/data.json.$(date -u +%Y%m%dT%H%M%S).bak"
    # Keep the 10 most recent backups.
    ls -1t "${SHARED_DIR}"/data.json.*.bak 2>/dev/null | tail -n +11 | xargs -r rm -f
  fi
  rm -f "${release}/data.json"
  ln -sfn "${DATA_FILE}" "${release}/data.json"

  # runuser keeps the caller's environment, so HOME would still be /root and npm
  # would fail trying to write its cache there as ${APP_USER}.
  local as_app=(runuser -u "${APP_USER}" -- env -C "${release}" "HOME=/home/${APP_USER}")

  if [[ -n "${ARTIFACT}" ]]; then
    # Only runtime dependencies are needed; the client was built already. This
    # installs Linux-native binaries from the lockfile, which is why a
    # workstation's node_modules must never be shipped.
    log "Installing runtime dependencies (npm ci --omit=dev)"
    "${as_app[@]}" npm ci --omit=dev --no-audit --no-fund
  else
    log "Installing dependencies (npm ci)"
    "${as_app[@]}" npm ci --no-audit --no-fund

    log "Building client and server bundles"
    "${as_app[@]}" npm run build

    log "Pruning development dependencies"
    "${as_app[@]}" npm prune --omit=dev --no-audit --no-fund
  fi

  [[ -f "${release}/dist/server.cjs" ]] || die "release has no dist/server.cjs"
  [[ -f "${release}/dist/index.html" ]] || die "release has no dist/index.html"

  log "Switching ${CURRENT_LINK} -> ${release}"
  ln -sfn "${release}" "${CURRENT_LINK}"
  systemctl restart "${APP_NAME}"

  if health_check; then
    ok "Release ${stamp} is live"
    prune_releases
  else
    warn "Health check failed"
    if [[ -n "${previous}" && -d "${previous}" ]]; then
      warn "Rolling back to $(basename "${previous}")"
      ln -sfn "${previous}" "${CURRENT_LINK}"
      systemctl restart "${APP_NAME}"
      health_check && ok "Rollback succeeded — previous release restored" \
                   || warn "Rollback also unhealthy; check: journalctl -u ${APP_NAME} -n 100"
    fi
    die "deploy aborted (bad release left at ${release} for inspection)"
  fi
}

health_check() {
  local url="http://127.0.0.1:${APP_PORT}${HEALTH_PATH}"
  log "Health check ${url} (up to ${HEALTH_TIMEOUT}s)"
  local i=0
  while (( i < HEALTH_TIMEOUT )); do
    if curl -fsS --max-time 3 "${url}" >/dev/null 2>&1; then
      ok "Application responding"
      return 0
    fi
    if ! systemctl is-active --quiet "${APP_NAME}"; then
      warn "Service stopped: $(systemctl is-failed "${APP_NAME}" || true)"
      journalctl -u "${APP_NAME}" -n 25 --no-pager || true
      return 1
    fi
    sleep 1; (( i++ ))
  done
  journalctl -u "${APP_NAME}" -n 25 --no-pager || true
  return 1
}

prune_releases() {
  local current
  current="$(readlink -f "${CURRENT_LINK}")"
  local stale
  # Never delete the release that is currently serving traffic.
  mapfile -t stale < <(ls -1dt "${RELEASES_DIR}"/*/ 2>/dev/null | tail -n +"$((KEEP_RELEASES + 1))")
  for dir in "${stale[@]:-}"; do
    [[ -n "${dir}" ]] || continue
    [[ "$(readlink -f "${dir}")" == "${current}" ]] && continue
    rm -rf "${dir}"
    ok "Pruned old release $(basename "${dir}")"
  done
}

# ---------------------------------------------------------------------------
# rollback / status / logs
# ---------------------------------------------------------------------------
cmd_rollback() {
  require_root rollback
  local current target
  current="$(readlink -f "${CURRENT_LINK}" 2>/dev/null || true)"
  target="$(ls -1dt "${RELEASES_DIR}"/*/ 2>/dev/null | grep -v "^${current}/$" | head -n 1 || true)"
  [[ -n "${target}" ]] || die "no earlier release to roll back to"

  log "Rolling back to $(basename "${target%/}")"
  ln -sfn "${target%/}" "${CURRENT_LINK}"
  systemctl restart "${APP_NAME}"
  health_check && ok "Rollback complete" || die "rolled-back release is unhealthy"
}

cmd_status() {
  echo "Release : $(readlink -f "${CURRENT_LINK}" 2>/dev/null || echo 'none')"
  echo "Port    : ${APP_PORT}"
  echo "Data    : ${DATA_FILE} ($(du -h "${DATA_FILE}" 2>/dev/null | cut -f1 || echo 'missing'))"
  echo
  systemctl status "${APP_NAME}" --no-pager || true
}

cmd_logs() { journalctl -u "${APP_NAME}" -f -n 100; }

# ---------------------------------------------------------------------------
main() {
  case "${1:-}" in
    setup)    cmd_setup ;;
    release)  cmd_release ;;
    rollback) cmd_rollback ;;
    status)   cmd_status ;;
    logs)     cmd_logs ;;
    *)
      sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 1
      ;;
  esac
}

main "$@"
