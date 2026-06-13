#!/bin/sh
set -eu

echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "Running optional seed..."
  ./node_modules/.bin/tsx prisma/seed.ts
fi

exec ./node_modules/.bin/next start
