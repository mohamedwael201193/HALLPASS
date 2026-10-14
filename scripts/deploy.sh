#!/usr/bin/env bash
#
# deploy.sh — HALLPASS plugin deploy wrapper (Arc mainnet, chain 5042).
#
#   1. Loads ~/workspace/user/files/env-2.txt WITHOUT echoing any value.
#   2. Pre-flight: chain id, deployer address, deployer balance vs worst-case gas budget.
#   3. Runs the forge deploy script with --broadcast (the real deploy).
#   4. Backfills txHash into contracts/deployments/arc-5042.json from forge's
#      broadcast artifact and cross-checks the recorded deployer address.
#   5. Prints next steps (verify, fund, prove).
#
# DRY_RUN=1 ./scripts/deploy.sh   -> full rehearsal, no broadcast, no backfill.
#
# HARD RULES: never prints secret values; never commits a key.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS="$REPO_ROOT/contracts"
ENV_FILE="$HOME/workspace/user/files/env-2.txt"
RPC_URL="https://rpc.mainnet.arc.io"
EXPECTED_CHAIN_ID="5042"
# H9 lesson: a 1.5M gas limit OOG'd on mainnet and burned 0.036 USDC.
# Simulated deploy cost is ~1.8M gas; multiplier 150 -> ~2.7M tx gas limit,
# comfortably above the required >= 2.2M. (A gas LIMIT is not gas SPENT.)
GAS_ESTIMATE_MULTIPLIER=150

DRY_RUN="${DRY_RUN:-0}"

log() { printf '%s\n' "$*"; }
die() { printf 'FATAL: %s\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die "env file not found: $ENV_FILE"

# --- Load env WITHOUT echoing values ---------------------------------------
# Parse KEY=VALUE lines manually with printf -v: no `source`, no eval,
# nothing printed. Only strict identifier names are accepted.
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  case "$line" in ''|'#'*) continue ;; esac
  case "$line" in *=*) ;; *) continue ;; esac
  k="${line%%=*}"; v="${line#*=}"
  case "$k" in ''|*[!A-Za-z0-9_]* ) continue ;; esac
  printf -v "$k" '%s' "$v"
done < "$ENV_FILE"
export DEPLOYER_PRIVATE_KEY
: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY missing in env-2.txt}"

export PATH="$HOME/.foundry/bin:$PATH"
command -v forge >/dev/null || die "forge not found in ~/.foundry/bin"
command -v cast  >/dev/null || die "cast not found in ~/.foundry/bin"
command -v jq    >/dev/null || die "jq not found"

# --- Pre-flight --------------------------------------------------------------
CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL")"
[ "$CHAIN_ID" = "$EXPECTED_CHAIN_ID" ] || die "chain id $CHAIN_ID != $EXPECTED_CHAIN_ID (expected Arc mainnet)"

DEPLOYER_ADDR="$(cast wallet address "$DEPLOYER_PRIVATE_KEY")"
log "deployer: $DEPLOYER_ADDR"

BAL_WEI="$(cast balance "$DEPLOYER_ADDR" --rpc-url "$RPC_URL")"
log "deployer balance: $(cast to-unit "$BAL_WEI" ether) USDC (native gas token, 18 decimals)"

GAS_PRICE="$(cast gas-price --rpc-url "$RPC_URL")"
python3 - "$BAL_WEI" "$GAS_PRICE" <<'PY' || die "deployer balance too low for a 3M-gas deploy at current gas price"
import sys
bal, gp = int(sys.argv[1]), int(sys.argv[2])
sys.exit(0 if bal >= 3_000_000 * gp else 1)
PY

# --- Deploy ------------------------------------------------------------------
cd "$CONTRACTS"
BROADCAST_FLAG="--broadcast"
[ "$DRY_RUN" = "1" ] && BROADCAST_FLAG=""
# shellcheck disable=SC2086
forge script script/DeployHallpass.s.sol \
  --skip test \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --gas-estimate-multiplier "$GAS_ESTIMATE_MULTIPLIER" \
  $BROADCAST_FLAG

# --- Backfill txHash (real broadcast only) -----------------------------------
JSON_FILE="$CONTRACTS/deployments/arc-5042.json"
if [ "$DRY_RUN" = "1" ]; then
  log "DRY_RUN=1: rehearsal only — no broadcast, txHash left as placeholder."
else
  ARTIFACT="$CONTRACTS/broadcast/DeployHallpass.s.sol/5042/run-latest.json"
  [ -f "$ARTIFACT" ] || die "broadcast artifact missing: $ARTIFACT"
  PLUGIN="$(jq -r '.plugin' "$JSON_FILE")"
  TXHASH="$(jq -r --arg p "$PLUGIN" \
    '.transactions[] | select(.transactionType=="CREATE" and (.contractAddress|ascii_downcase)==($p|ascii_downcase)) | .hash' \
    "$ARTIFACT" | head -n1)"
  { [ -n "$TXHASH" ] && [ "$TXHASH" != "null" ]; } || die "CREATE tx hash not found in broadcast artifact"
  REC_DEPLOYER="$(jq -r '.deployer' "$JSON_FILE")"
  [ "$(printf '%s' "$REC_DEPLOYER" | tr 'A-F' 'a-f')" = "$(printf '%s' "$DEPLOYER_ADDR" | tr 'A-F' 'a-f')" ] \
    || die "deployer mismatch: script recorded $REC_DEPLOYER but key derives $DEPLOYER_ADDR"
  jq --arg h "$TXHASH" '.txHash=$h' "$JSON_FILE" > "$JSON_FILE.tmp" && mv "$JSON_FILE.tmp" "$JSON_FILE"
  log "deployment recorded:"
  cat "$JSON_FILE"
fi

# --- Next steps ---------------------------------------------------------------
PLUGIN="$(jq -r '.plugin' "$JSON_FILE")"
cat <<EOF

================ NEXT STEPS ================
Plugin: $PLUGIN

1. VERIFY ON SOURCIFY (exact_match required — bible §5.2)
   Do NOT use the Arc explorer's Blockscout verification API: it sits behind
   a Cloudflare managed challenge and returns HTTP 403. Sourcify is the path:
     forge verify-contract --chain-id 5042 --verifier sourcify \\
       $PLUGIN contracts/src/HallpassPlugin.sol:HallpassPlugin
   Confirm https://repo.sourcify.dev/5042/$PLUGIN shows exact_match.
   If the match is not exact, STOP and fix the build config first.

2. PROVISION THE ACCOUNT — direct-proxy path (§5.3, NOT the factory;
   Circle's factory createAccount is allowlisted for custom plugins)
   - Deploy minimal ERC1967 proxy -> 0xA70F1296869DA9D7CB69578123F21888E6dB2B62
   - initializeUpgradableMSCA([plugin], [manifestHash], [initData]) where
     manifestHash = keccak256(abi.encode(plugin.pluginManifest())) queried
     from the DEPLOYED plugin, and
     initData = abi.encode(sessionKey, owner, perTxCap, windowCap,
                           windowSecs, expiry, allowlist).
   - Policy caps are NATIVE WEI (18 decimals), not 6-decimal ERC-20 USDC:
     convert explicitly at every boundary.

3. FUND + CONFIGURE (§5.4)
   - Fund the account with dust (0.05 USDC is plenty).
   - Top up the account's EntryPoint deposit via depositTo(account) —
     covers userOp prefunds (else AA13).
   - Verify: getInstalledPlugins() includes the plugin; policy getters
     return the configured caps.

4. PROVE THE MONEY-SHOTS on mainnet, dust amounts (§5.5)
   In-policy spend succeeds; over-cap spend reverts PerTxCapExceeded; real
   v0.7 userOp through EntryPoint.handleOps succeeds; owner revokeSession()
   then post-revoke spend reverts SessionRevoked(); typed-data
   authorizeDigest gates behave. Record EVERY tx hash in the test ledger.
============================================
EOF
