# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM golang:1.26-alpine AS build
WORKDIR /src/apps/api
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download
COPY apps/api/ ./
ARG VERSION=dev
# One image, four binaries: the API, and the AI chat, storefront reads and email worker that
# docker-compose.prod.yml runs on their own when SPLIT_SERVICES=true.
RUN for cmd in api ai shop notifier; do \
      CGO_ENABLED=0 go build -ldflags "-s -w -X main.Version=${VERSION}" -o /out/$cmd ./cmd/$cmd || exit 1; \
    done

FROM alpine:3.21
RUN adduser -D -u 10001 api
WORKDIR /app
COPY --from=build /out/ /app/
# The demo seed, so a fresh database fills itself on first boot.
COPY packages/fixtures/data /app/seed
ENV SEED_DIR=/app/seed PORT=8090
USER api
EXPOSE 8090
ENTRYPOINT ["/app/api"]
