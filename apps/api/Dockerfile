# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM golang:1.26-alpine AS build
WORKDIR /src/apps/api
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download
COPY apps/api/ ./
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -ldflags "-s -w -X main.Version=${VERSION}" -o /out/api ./cmd/api

FROM alpine:3.21
RUN adduser -D -u 10001 api
WORKDIR /app
COPY --from=build /out/api /app/api
# The demo seed, so a fresh database fills itself on first boot.
COPY packages/fixtures/data /app/seed
ENV SEED_DIR=/app/seed PORT=8090
USER api
EXPOSE 8090
ENTRYPOINT ["/app/api"]
