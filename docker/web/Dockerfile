# VITE_DEMO_PASSWORD is public by design when DEMO_LOGIN=true (see the build args below).
# check=skip=SecretsUsedInArgOrEnv

# The web image: the admin, the storefront and the seller app, served by nginx, which also proxies the
# API. Build from the repository root:
#
#   docker build -f docker/web/Dockerfile .
#
# docker-compose.prod.yml builds it with the build args below taken from the env file.

FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /src
# Downloading packages depends only on the lockfile, so this layer stays cached until it changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY apps/api/package.json apps/api/
COPY packages packages
COPY apps/admin apps/admin
COPY apps/storefront apps/storefront
COPY apps/mobile apps/mobile
RUN pnpm install --offline --frozen-lockfile

# Vite compiles these into the JavaScript, so they are fixed per image. Build args are recorded in
# the image history of this stage, so none of them may hold a secret. VITE_DEMO_PASSWORD stays empty
# unless DEMO_LOGIN=true, and then the demo login buttons ship it to every browser by design.
ARG VITE_API_URL=/api
# The parent domain of store hosts (shop.example.com gives lari.shop.example.com). Empty keeps every
# store on the main host under /shop/. Set it to the same value as STORE_ROOT_DOMAIN at runtime.
ARG VITE_STORE_ROOT_DOMAIN=
# Where the admin links to stores in single-host mode: {PUBLIC_URL}/shop. It must be absolute.
ARG VITE_STOREFRONT_URL=http://localhost/shop
# Origins allowed to embed the storefront for the visual editor: the admin's own, {PUBLIC_URL}.
ARG VITE_ADMIN_ORIGINS=
ARG VITE_DEMO_PASSWORD=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_STORE_ROOT_DOMAIN=$VITE_STORE_ROOT_DOMAIN \
    VITE_STOREFRONT_URL=$VITE_STOREFRONT_URL \
    VITE_ADMIN_ORIGINS=$VITE_ADMIN_ORIGINS \
    VITE_DEMO_PASSWORD=$VITE_DEMO_PASSWORD

# The storefront is built twice so one image serves either host mode: under /shop/ on the main host,
# and at the root of every store host. nginx picks one at start from STORE_ROOT_DOMAIN.
RUN set -eux; \
    pnpm --filter @rc/admin build; \
    SELLER_BASE=/seller/ pnpm --filter @rc/mobile build; \
    STOREFRONT_BASE=/shop/ pnpm --filter @rc/storefront build; \
    mkdir -p /out; \
    mv apps/admin/dist /out/main; \
    mv apps/mobile/dist /out/main/seller; \
    mv apps/storefront/dist /out/main/shop; \
    STOREFRONT_BASE=/ pnpm --filter @rc/storefront build; \
    mv apps/storefront/dist /out/store

FROM nginx:1.30-alpine
# The official entrypoint renders /etc/nginx/templates/*.template into /etc/nginx/conf.d. Only the
# STORE_* and COMMERCE_* names are substituted, so nginx's own $variables pass through untouched.
ENV NGINX_ENVSUBST_FILTER='^(STORE_|COMMERCE_)' \
    STORE_ROOT_DOMAIN= \
    SPLIT_SERVICES=false
# /media is where the api's uploads are mounted read-only. It starts empty and owned by the api's uid
# 10001 here too, so a fresh Docker volume ends up writable for the api whichever container mounts first.
RUN rm /etc/nginx/conf.d/default.conf && rm -rf /media && install -d -o 10001 -g 10001 /media
COPY --from=build /out /srv/web
COPY docker/web/templates /etc/nginx/templates
COPY --chmod=755 docker/web/18-commerce.envsh docker/web/90-commerce-check.sh /docker-entrypoint.d/
EXPOSE 80 443
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
