#!/usr/bin/env bash
# Deploys WIT Commerce with Docker alone: Postgres, the API and the web server (the admin, the storefront
# and the seller app behind nginx) from docker-compose.prod.yml. The server needs Docker, Docker Compose,
# git, curl and openssl; no Node, pnpm or host nginx. Run it on the server from a checkout:
#
#   ./scripts/deploy-prod.sh
#
# Run it again to deploy a new version. The first run asks for the Ollama key and the platform admin's
# email, generates the other secrets into .env.production (mode 600, ignored by git), and prints the
# admin's first password once. To rotate the key:
#
#   read -rs OLLAMA_API_KEY && export OLLAMA_API_KEY && ./scripts/deploy-prod.sh
#
# Settings, all optional. The ones marked "saved" are written to the env file and kept on the next run.
#   PUBLIC_URL    https://commerce.reddie.id (saved)
#   STORE_ROOT_DOMAIN  set it (for example commerce.reddie.id) to open each brand's store at
#                 https://{subdomain}.$STORE_ROOT_DOMAIN. It needs a wildcard DNS record and certificate
#                 first, see apps/api/cmd/README.md. Empty, the default, keeps every store on one host at
#                 $PUBLIC_URL/shop/{subdomain}. (saved)
#   WEB_BIND, WEB_PORT  where the web container listens, 0.0.0.0 and 80 by default (saved). Behind a
#                 host nginx that keeps ports 80 and 443, use WEB_BIND=127.0.0.1 WEB_PORT=8080.
#   WEB_TLS_PORT  443 (saved); web serves HTTPS there only when WEB_CERTS holds certificates
#   WEB_CERTS     ./deploy/certs (saved), a folder with fullchain.pem and privkey.pem
#   MEDIA_ROOT    /var/lib/commerce/media, uploaded images; the API writes them and web serves /media/
#   API_PORT      8090, on 127.0.0.1 only, for this script's checks
#   SPLIT_SERVICES=true  run the AI chat, the storefront reads and the email worker as their own
#                 containers (ports AI_PORT 8091, SHOP_PORT 8093 on 127.0.0.1); false keeps them in the API
#   ENV_FILE      .env.production
#   COMPOSE_NAME  commerce-prod
#   ADMIN_EMAIL   the platform admin's email, instead of asking
#   RESEND_API_KEY  the key for password and confirmation emails, instead of asking
#   EMAIL_FROM    the sender, on a domain verified in Resend; WIT Commerce <noreply@your-domain> by default
#   RESET_ADMIN=1 print a new password for the platform admin
#   DEMO_LOGIN=true  open the demo accounts to everyone; for a public demo only
#   SKIP_PULL=1   deploy this checkout as it is
#   SKIP_WEB=1    deploy only Postgres and the API
set -euo pipefail

cd "$(dirname "$0")/.."
export API_PORT="${API_PORT:-8090}"
export AI_PORT="${AI_PORT:-8091}" SHOP_PORT="${SHOP_PORT:-8093}"
export SPLIT_SERVICES="${SPLIT_SERVICES:-false}"
if [ "$SPLIT_SERVICES" = true ]; then export COMPOSE_PROFILES=split; fi
ENV_FILE="${ENV_FILE:-.env.production}"
export MEDIA_ROOT="${MEDIA_ROOT:-/var/lib/commerce/media}"
COMPOSE_NAME="${COMPOSE_NAME:-commerce-prod}"
API="http://127.0.0.1:$API_PORT/api/v1"

step() { printf '\n==> %s\n' "$1"; }
fail() { printf 'Failed: %s\n' "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null || fail "$1 is not installed on this machine"; }
# The saved settings come from the env file, so the same names must not stay in this shell.
compose() {
  env -u PUBLIC_URL -u STORE_ROOT_DOMAIN -u EMAIL_FROM -u DEMO_LOGIN -u VITE_DEMO_PASSWORD \
    -u WEB_BIND -u WEB_PORT -u WEB_TLS_PORT -u WEB_CERTS \
    docker compose -p "$COMPOSE_NAME" --env-file "$ENV_FILE" -f docker-compose.prod.yml "$@"
}
sudo_if_needed() { if [ "$(id -u)" = 0 ]; then "$@"; else sudo "$@"; fi; }

# Reads one value from the env file.
stored() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }

# Saves a setting: the value from this shell when set, else the saved one, else the default.
setting() {
  local name="$1" fallback="$2" value
  if [ -n "${!name+set}" ]; then value="${!name}"
  elif grep -q "^$name=" "$ENV_FILE"; then value="$(stored "$name")"
  else value="$fallback"; fi
  store "$name" "$value"
}

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
  if [ -n "${RESEND_API_KEY:-}" ]; then
    store RESEND_API_KEY "$RESEND_API_KEY"
  elif [ -z "$(stored RESEND_API_KEY)" ] && [ -t 0 ]; then
    read -rsp 'Resend API key (hidden, Enter to skip email for now): ' RESEND_API_KEY
    echo
    [ -z "$RESEND_API_KEY" ] || store RESEND_API_KEY "$RESEND_API_KEY"
  fi
  unset RESEND_API_KEY
  setting PUBLIC_URL https://commerce.reddie.id
  # Set but empty means one host; unset keeps the saved choice.
  setting STORE_ROOT_DOMAIN ''
  setting WEB_BIND 0.0.0.0
  setting WEB_PORT 80
  setting WEB_TLS_PORT 443
  setting WEB_CERTS ./deploy/certs
  PUBLIC_URL="$(stored PUBLIC_URL)"
  STORE_ROOT_DOMAIN="$(stored STORE_ROOT_DOMAIN)"
  local domain="${PUBLIC_URL#*://}"
  domain="${domain%%/*}"
  [ -n "$(stored EMAIL_FROM)" ] || store EMAIL_FROM "${EMAIL_FROM:-WIT Commerce <noreply@$domain>}"
  [ -n "$(stored DEMO_LOGIN)" ] || store DEMO_LOGIN "${DEMO_LOGIN:-false}"
  # Demo login buttons send this password, so it is compiled into the web image only when demo login
  # is on. Then it is public by design.
  if [ "$(stored DEMO_LOGIN)" = true ]; then store VITE_DEMO_PASSWORD "$(stored DEMO_PASSWORD)"; else store VITE_DEMO_PASSWORD ''; fi
  # Docker Compose reads the file itself, so these must not stay in this shell's environment.
  unset OLLAMA_API_KEY
  [ -n "$(stored RESEND_API_KEY)" ] || echo "Email is off: nobody can reset a password by email until RESEND_API_KEY is set."
  echo "Back up CREDENTIALS_KEY: connector secrets cannot be read without it."
}

# Another web server on the host keeps its ports; web then listens elsewhere for it to proxy to.
check_web_ports() {
  local bind port taken=''
  bind="$(stored WEB_BIND)"
  for port in "$(stored WEB_PORT)" "$(stored WEB_TLS_PORT)"; do
    port_in_use "$bind" "$port" && taken="$taken $port"
  done
  [ -n "$taken" ] || return 0
  local hosts="$PUBLIC_URL"
  [ -z "$STORE_ROOT_DOMAIN" ] || hosts="$hosts and *.$STORE_ROOT_DOMAIN"
  cat >&2 <<MSG
Port(s)$taken on $bind are taken by another process, probably a web server on this host. This script
leaves it alone. Run web on a local port and let that server proxy to it:

  WEB_BIND=127.0.0.1 WEB_PORT=8080 WEB_TLS_PORT=8443 ./scripts/deploy-prod.sh

(any free ports work; the values are saved for the next run.)

Then, in the host nginx, at the http level:

  map \$http_cf_connecting_ip \$commerce_ip { default \$http_cf_connecting_ip; "" \$remote_addr; }
  map \$http_x_forwarded_proto \$commerce_proto { default \$http_x_forwarded_proto; "" \$scheme; }

and in the server for $hosts:

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header CF-Connecting-IP \$commerce_ip;
    proxy_set_header X-Forwarded-Proto \$commerce_proto;
    proxy_buffering off;
    proxy_read_timeout 1h;
    client_max_body_size 6m;
  }
MSG
  fail "ports$taken are in use"
}

# True when something other than this stack listens on the port.
port_in_use() {
  local bind="$1" port="$2"
  # Our own web container holds the port on a redeploy.
  { compose port web 80; compose port web 443; } 2>/dev/null | grep -q ":$port\$" && return 1
  if command -v ss >/dev/null; then
    ss -Hltn "sport = :$port" 2>/dev/null | grep -q .
  else
    (exec 3<>"/dev/tcp/${bind/0.0.0.0/127.0.0.1}/$port") 2>/dev/null
  fi
}

start_stack() {
  step "Postgres, the API and the web server"
  # The API runs as uid 10001 and writes uploads here; web reads them.
  case "$MEDIA_ROOT" in
    /*)
      sudo_if_needed mkdir -p "$MEDIA_ROOT"
      sudo_if_needed chown 10001:10001 "$MEDIA_ROOT"
      sudo_if_needed chmod 755 "$MEDIA_ROOT"
      ;;
  esac
  if [ -n "${SKIP_WEB:-}" ]; then
    compose up -d --build --remove-orphans postgres api $([ "$SPLIT_SERVICES" != true ] || echo ai notifier shop)
  else
    check_web_ports
    compose up -d --build --remove-orphans
  fi
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
  [ -z "${SKIP_WEB:-}" ] || return 0
  local bind web
  bind="$(stored WEB_BIND)"
  web="http://${bind/0.0.0.0/127.0.0.1}:$(stored WEB_PORT)"
  tries=0
  until curl -fsS -m 3 "$web/healthz" >/dev/null 2>&1 && curl -fsS -m 3 "$web/api/v1/health" >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -ge 20 ]; then
      compose logs --tail 30 web
      fail "the web server did not answer on $web"
    fi
    sleep 3
  done
  echo "Web server answers on $web, with the API behind /api/"
}

prepare_admin() {
  [ -z "$(stored ADMIN_EMAIL)" ] || [ -n "${RESET_ADMIN:-}" ] || return 0
  step "Platform admin"
  local email password
  email="${ADMIN_EMAIL:-$(stored ADMIN_EMAIL)}"
  if [ -z "$email" ]; then
    [ -t 0 ] || fail "set ADMIN_EMAIL, there is no terminal to ask on"
    read -rp 'Platform admin email: ' email
  fi
  password="$(openssl rand -base64 18)"
  ADMIN_EMAIL="$email" ADMIN_PASSWORD="$password" \
    compose exec -T -e ADMIN_EMAIL -e ADMIN_PASSWORD api /app/api -set-admin >/dev/null
  store ADMIN_EMAIL "$email"
  printf 'Sign in as %s with this password, then change it from the account menu:\n%s\n' "$email" "$password"
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

check_public() {
  step "Public address"
  local type
  type="$(curl -sS -m 15 -o /dev/null -w '%{content_type}' "$PUBLIC_URL/api/v1/health" || true)"
  case "$type" in
    application/json*) echo "$PUBLIC_URL/api answers." ;;
    *) echo "$PUBLIC_URL/api/v1/health answered '$type', so the API is not reachable there yet." ;;
  esac
  if [ -z "$STORE_ROOT_DOMAIN" ]; then
    echo "Try $PUBLIC_URL/shop/lari/agent"
    return
  fi
  local store="https://lari.$STORE_ROOT_DOMAIN"
  type="$(curl -sS -m 15 -o /dev/null -w '%{content_type}' "$store/api/v1/health" || true)"
  case "$type" in
    application/json*) echo "Store hosts answer. Try $store/agent" ;;
    *) echo "$store answered '$type'. Check the wildcard DNS record and certificate (apps/api/cmd/README.md, Store subdomains)." ;;
  esac
}

need docker
docker compose version >/dev/null 2>&1 || fail "docker compose is not installed on this machine"
need curl
need openssl
if [ -z "${SKIP_PULL:-}" ]; then
  step "Latest code"
  git pull --ff-only
fi
prepare_secrets
start_stack
prepare_admin
check_ai
[ -n "${SKIP_WEB:-}" ] || check_public
