#!/usr/bin/env bash
#
# VerifyHallpass.sh — verify a deployed Hallpass contract on Sourcify (Arc mainnet, chain 5042).
#
#   ./script/VerifyHallpass.sh [address] [contract-ref]
#
# Arguments:
#   address       Contract address. Optional if HALLPASS_PLUGIN_ADDRESS is set
#                 or if contracts/deployments/hallpass.json exists with
#                 { "plugin": "<address>" }. Fails loudly if no address found.
#   contract-ref  Forge contract reference, default:
#                 src/HallpassPlugin.sol:HallpassPlugin
#
# Env knobs:
#   HALLPASS_PLUGIN_ADDRESS   Address to verify (overrides deployments file).
#   CONSTRUCTOR_ARGS          Hex-encoded constructor args (for contracts WITH
#                             constructor args, e.g. src/HallpassPlugin.sol:HallpassProxy).
#                             HallpassPlugin itself takes NO constructor args —
#                             leave empty when verifying the plugin.
#   SOURCIFY_API              Override Sourcify server base (default: https://sourcify.dev/server;
#                             the v2 API lives here — repo.sourcify.dev serves the UI, not /v2/*)
#
# On success prints the Sourcify lookup URL. On anything else it fails loudly.
# No private key or API secret needed — verification is read-and-recompile only.
#
# IMPORTANT (build-bible §5): do NOT use the Arc explorer's Blockscout
# verification UI/API — it sits behind a Cloudflare managed challenge and
# returns HTTP 403 to forge/curl. Sourcify is the reliable path on 5042.
#
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

CHAIN_ID=5042
SOURCIFY_API="${SOURCIFY_API:-https://sourcify.dev/server}"
CONTRACT_REF="${2:-src/HallpassPlugin.sol:HallpassPlugin}"
CONSTRUCTOR_ARGS="${CONSTRUCTOR_ARGS:-}"

# ---- Resolve address ---------------------------------------------------------
ADDRESS="${1:-${HALLPASS_PLUGIN_ADDRESS:-}}"
if [[ -z "$ADDRESS" && -f deployments/hallpass.json ]]; then
    if command -v jq >/dev/null 2>&1; then
        ADDRESS="$(jq -r '.plugin // .address // empty' deployments/hallpass.json 2>/dev/null || true)"
    fi
fi

if [[ -z "$ADDRESS" ]]; then
    cat >&2 <<'EOF'
ERROR: no contract address to verify.

Provide one of:
  1) ./script/VerifyHallpass.sh 0xYourContractAddress
  2) export HALLPASS_PLUGIN_ADDRESS=0xYourContractAddress
  3) Write it to deployments/hallpass.json as { "plugin": "0x..." }

No deployments/ directory exists yet (nothing has been deployed), so there
is no live address to verify against right now.
EOF
    exit 2
fi

if ! [[ "$ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo "ERROR: '$ADDRESS' is not a valid 0x-address." >&2
    exit 2
fi

echo "==> Verifying $ADDRESS as $CONTRACT_REF on chain $CHAIN_ID"

# Forge contract reference: <file>:<name> — split the file out for a targeted
# rebuild so unrelated files (e.g. tests) can never block verification.
CONTRACT_FILE="${CONTRACT_REF%%:*}"
CONTRACT_NAME="${CONTRACT_REF##*:}"

# ---- Ensure the local build matches deploy-time settings ----------------------
# foundry.toml pins: solc_version = 0.8.24, optimizer = true, optimizer_runs = 200.
# Rebuild only the contract file so artifacts match exactly what was deployed.
echo "==> Rebuilding with pinned solc/optimizer settings..."
forge build "$CONTRACT_FILE" --force >/dev/null
echo "    build OK (solc pinned in foundry.toml; artifact: out/$CONTRACT_FILE/$CONTRACT_NAME.json)"

# ---- Submit to Sourcify -------------------------------------------------------
VERIFY_CMD=(forge verify-contract --verifier sourcify --chain-id "$CHAIN_ID" "$ADDRESS" "$CONTRACT_REF")
if [[ -n "$CONSTRUCTOR_ARGS" ]]; then
    VERIFY_CMD+=(--constructor-args "$CONSTRUCTOR_ARGS")
fi

echo "==> Submitting to Sourcify..."
if ! "${VERIFY_CMD[@]}"; then
    echo "ERROR: forge verify-contract failed (see above). Common causes:" >&2
    echo "  - constructor args missing or wrong (HallpassPlugin takes none;" >&2
    echo "    HallpassProxy takes (address _logic, bytes _data) — set CONSTRUCTOR_ARGS)" >&2
    echo "  - local sources do not match the deployed bytecode (re-deploy first)" >&2
    exit 1
fi

# ---- Confirm the match is EXACT -----------------------------------------------
# Sourcify v2: GET /v2/contract/{chainId}/{address} -> "match":"exact_match".
# (API v1 was removed 2026; the old /v1/check-all-by-addresses path 404s.)
# Anything other than exact_match is a hard stop: fix the build config
# (solc 0.8.24, optimizer on, 200 runs, identical sources) or re-deploy —
# do NOT proceed with an inexact match (build-bible §5.2 / §12).
echo "==> Confirming match status via Sourcify API v2..."
CHECK_JSON="$(
    curl -sSf --max-time 30 \
        "${SOURCIFY_API}/v2/contract/${CHAIN_ID}/${ADDRESS}"
)" || {
    echo "ERROR: Sourcify v2 contract API unreachable." >&2
    exit 1
}

MATCH="$(echo "$CHECK_JSON" | grep -o '"match":"[a-z_]*"' | head -1 | cut -d'"' -f4)"
echo "    Sourcify match: ${MATCH:-unknown}"

if [[ "$MATCH" != "exact_match" ]]; then
    echo "ERROR: match is '$MATCH', not 'exact_match'." >&2
    echo "Per §12 definition of done this is a hard stop: fix the build" >&2
    echo "config (solc 0.8.24, optimizer on, 200 runs, identical sources) or" >&2
    echo "re-deploy — do NOT proceed with an inexact match." >&2
    echo "Raw response: $CHECK_JSON" >&2
    exit 1
fi

echo
echo "==> EXACT MATCH confirmed."
echo "    https://repo.sourcify.dev/${CHAIN_ID}/${ADDRESS}"
