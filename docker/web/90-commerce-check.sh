#!/bin/sh
# Stops the container before nginx starts when the rendered configuration is wrong.
set -e
if ! nginx -t; then
  echo "90-commerce-check.sh: the rendered nginx configuration is invalid, see the error above" >&2
  exit 1
fi
