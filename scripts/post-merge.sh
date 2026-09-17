#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile
if pnpm --filter @workspace/db run migrate:verify-applied; then
  exit 0
else
  status=$?
fi

if [ "$status" -eq 2 ]; then
  pnpm --filter @workspace/db run migrate
  exit 0
fi

exit "$status"
