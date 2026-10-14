#!/bin/sh
# Start script: runs the API and the indexer side by side.
# Used by the Dockerfile. (On Render, api and indexer run as separate
# services per backend/render.yaml instead of this combined mode.)
set -e

cd /app/api && npm start &
API_PID=$!

cd /app/indexer && node index.js &
INDEXER_PID=$!

echo "api pid=$API_PID indexer pid=$INDEXER_PID"

# Exit when either process dies; report which one.
wait -n
STATUS=$?
echo "A backend process exited (status=$STATUS) — shutting down."
kill "$API_PID" "$INDEXER_PID" 2>/dev/null || true
exit $STATUS
