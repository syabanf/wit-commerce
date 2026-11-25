#!/usr/bin/env bash
# Runs the k6 profiles in perf/k6 one after another against a running API and writes each summary to
# $OUT/<profile>.json. Exits non-zero when any profile breaks a threshold. See apps/api/cmd/README.md.
set -euo pipefail
cd "$(dirname "$0")/.."

export BASE_URL=${BASE_URL:-http://localhost:8090}
export STORE=${STORE:-lari}
OUT=${OUT:-perf/out}
K6=${K6:-k6}
mkdir -p "$OUT"
if [ -z "${TERMS_VERSION:-}" ]; then
  TERMS_VERSION=$(pnpm exec tsx scripts/perf-terms-version.ts "$BASE_URL" "$STORE")
fi
export TERMS_VERSION

failed=()
for profile in ${PROFILES:-admin-state customers storefront checkout order-advance}; do
  echo "== $profile"
  if ! "$K6" run --summary-export "$OUT/$profile.json" "perf/k6/$profile.js"; then
    failed+=("$profile")
  fi
done
if [ ${#failed[@]} -gt 0 ]; then
  echo "Thresholds broken in: ${failed[*]}" >&2
  exit 1
fi
