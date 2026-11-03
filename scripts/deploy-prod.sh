#!/usr/bin/env bash
# Deploys Commerce OS with the AI shopper chat: Postgres and the API in Docker, then the admin and the
# storefront built against /api. Run it on the production server from a checkout of this repository:
#
#   ./scripts/deploy-prod.sh
#
# Run it again to deploy a new version. The first run asks for the Ollama key and generates the other
# secrets into .env.production (mode 600, ignored by git). To rotate the key:
#
#   read -rs OLLAMA_API_KEY && export OLLAMA_API_KEY && ./scripts/deploy-prod.sh
#
# Settings, all optional:
#   PUBLIC_URL    https://commerce.reddie.id
#   WEB_ROOT      /var/www/commerce (the admin at the root, the storefront in shop/)
#   API_PORT      8090, on 127.0.0.1 only
#   ENV_FILE      .env.production
#   COMPOSE_NAME  commerce-prod
#   SKIP_PULL=1   deploy this checkout as it is
#   SKIP_WEB=1    deploy only Postgres and the API
set -euo pipefail

cd "$(dirname "$0")/.."
PUBLIC_URL="${PUBLIC_URL:-https://commerce.reddie.id}"
WEB_ROOT="${WEB_ROOT:-/var/www/commerce}"
export API_PORT="${API_PORT:-8090}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_NAME="${COMPOSE_NAME:-commerce-prod}"
NGINX_CONF=/etc/nginx/conf.d/commerce.conf
DOMAIN="${PUBLIC_URL#*://}"
DOMAIN="${DOMAIN%%/*}"
API="http://127.0.0.1:$API_PORT/api/v1"

step() { printf '\n==> %s\n' "$1"; }
fail() { printf 'Failed: %s\n' "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null || fail "$1 is not installed on this machine"; }
compose() { docker compose -p "$COMPOSE_NAME" --env-file "$ENV_FILE" -f docker-compose.prod.yml "$@"; }
sudo_if_needed() { if [ "$(id -u)" = 0 ] || [ -w "$WEB_ROOT" ]; then "$@"; else sudo "$@"; fi; }

# Reads one value from the env file.
stored() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }

# Replaces one line of the env file without printing the value.
store() {
  local kept
  kept="$(grep -v "^$1=" "$ENV_FILE" || true)"
  printf '%s\n%s=%s\n' "$kept" "$1" "$2" | sed '/^$/d' >"$ENV_FILE"
}

generate_once() {
  [ -n "$(stored "$1")" ] || store "$1" "$(openssl rand -hex 32)"
}

prepare_secrets() {
  step "Secrets in $ENV_FILE"
  umask 077
  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  generate_once POSTGRES_PASSWORD
  generate_once JWT_SECRET
  [ -n "$(stored CREDENTIALS_KEY)" ] || store CREDENTIALS_KEY "$(openssl rand -base64 32)"
  generate_once DEMO_PASSWORD
  if [ -n "${OLLAMA_API_KEY:-}" ]; then
    store OLLAMA_API_KEY "$OLLAMA_API_KEY"
  elif [ -z "$(stored OLLAMA_API_KEY)" ]; then
    [ -t 0 ] || fail "set OLLAMA_API_KEY, there is no terminal to ask on"
    read -rsp 'Ollama API key (hidden): ' OLLAMA_API_KEY
    echo
    [ -n "$OLLAMA_API_KEY" ] || fail "the Ollama key is empty"
    store OLLAMA_API_KEY "$OLLAMA_API_KEY"
  fi
  # Docker Compose reads the file itself, so these must not stay in this shell's environment.
  unset OLLAMA_API_KEY
  echo "Back up CREDENTIALS_KEY: connector secrets cannot be read without it."
}

start_api() {
  step "Postgres and the API"
  compose up -d --build
  local tries=0
  until curl -fsS -m 3 "$API/health" >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -ge 40 ]; then
      compose logs --tail 30 api
      fail "the API did not become healthy"
    fi
    sleep 3
  done
  echo "API healthy on 127.0.0.1:$API_PORT"
}

check_ai() {
  step "The model answers"
  local answer
  answer="$(curl -fsS -m 30 -X POST "$API/shop/lari/ai/chat" -H 'Content-Type: application/json' \
    -d '{"mode":"agent","message":"cari sepatu lari ukuran 42"}')" ||
    fail "the AI endpoint did not answer; check the key with: docker compose -p $COMPOSE_NAME logs api"
  case "$answer" in
    *'"action":"search"'*) echo "DeepSeek understood a test message" ;;
    *) fail "the model answered something unexpected: $answer" ;;
  esac
}

publish_web() {
  step "Admin and storefront"
  need node
  need pnpm
  need rsync
  pnpm install --frozen-lockfile
  # The demo login buttons send this password, so it ships in the admin's JavaScript by design.
  VITE_API_URL=/api VITE_STOREFRONT_URL="$PUBLIC_URL/shop" VITE_DEMO_PASSWORD="$(stored DEMO_PASSWORD)" \
    pnpm --filter @rc/admin build
  VITE_API_URL=/api VITE_ADMIN_ORIGINS="$PUBLIC_URL" pnpm --filter @rc/storefront build
  sudo_if_needed mkdir -p "$WEB_ROOT/shop"
  sudo_if_needed rsync -a --delete --exclude /shop apps/admin/dist/ "$WEB_ROOT/"
  sudo_if_needed rsync -a --delete apps/storefront/dist/ "$WEB_ROOT/shop/"
  echo "Published to $WEB_ROOT"
}

nginx_site() {
  cat <<CONF
# Behind Cloudflare the shopper's address is CF-Connecting-IP; the API's per-shopper limit reads it.
map \$http_cf_connecting_ip \$shopper_ip {
  default \$http_cf_connecting_ip;
  ""      \$remote_addr;
}

server {
  listen 80;
  server_name $DOMAIN;
  root $WEB_ROOT;

  location /api/ {
    proxy_pass http://127.0.0.1:$API_PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header Connection "";
    proxy_set_header X-Forwarded-For \$shopper_ip;
    proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto;
    # The live event stream must not sit in a buffer.
    proxy_buffering off;
    proxy_read_timeout 1h;
  }
  location /shop/ {
    try_files \$uri /shop/index.html;
  }
  location / {
    try_files \$uri /index.html;
  }
}
CONF
}

configure_nginx() {
  step "Web server"
  if ! command -v nginx >/dev/null; then
    echo "No nginx here. Point your web server at $WEB_ROOT and apply these rules:"
    nginx_site
    return
  fi
  # A site this script did not write stays untouched: replacing it could drop TLS or other routes.
  local others
  others="$(sudo_if_needed nginx -T 2>/dev/null | awk -v conf="$NGINX_CONF" -v domain="$DOMAIN" '
    /^# configuration file / { file = $4; sub(/:$/, "", file) }
    /server_name/ && index($0, domain) && file != conf { print file }' | sort -u)"
  if [ -n "$others" ]; then
    echo "$DOMAIN is already served by: $others"
    echo "Left it unchanged. Add the /api/ location below to that site, then reload nginx:"
    nginx_site
    return
  fi
  nginx_site | sudo_if_needed tee "$NGINX_CONF" >/dev/null
  sudo_if_needed nginx -t
  sudo_if_needed nginx -s reload
  echo "Wrote $NGINX_CONF"
}

check_public() {
  step "Public address"
  local type
  type="$(curl -sS -m 15 -o /dev/null -w '%{content_type}' "$PUBLIC_URL/api/v1/health" || true)"
  case "$type" in
    application/json*) echo "$PUBLIC_URL/api answers. Try $PUBLIC_URL/shop/lari/agent" ;;
    *) echo "$PUBLIC_URL/api/v1/health answered '$type', so the API is not reachable there yet." ;;
  esac
}

need docker
need curl
need openssl
if [ -z "${SKIP_PULL:-}" ]; then
  step "Latest code"
  git pull --ff-only
fi
prepare_secrets
start_api
check_ai
if [ -z "${SKIP_WEB:-}" ]; then
  publish_web
  configure_nginx
fi
check_public
