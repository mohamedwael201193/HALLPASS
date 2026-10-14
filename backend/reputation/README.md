# HALLPASS reputation feedback loop

Closes the loop the production plugin leaves open: the plugin emits
`SessionRevokedEvt` on every session close, and this watcher posts **one dust
feedback transaction per close** to the ERC-8004 Reputation registry on Arc
mainnet (chain 5042), signed by the backend key.

The production plugin contract (`0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9`)
is **never touched** — this is a pure off-chain loop: watch logs → post
feedback.

## What was proven about the registry (2026-10-15, before writing code)

The deployed registry at `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`
(EIP-1967 proxy, code live) was probed with `eth_call`:

| Check | Result |
|---|---|
| `getClients(135)` | `["0x6A663FAa871f0622fF2435B65F514FAF876c59bF"]` — real client list |
| `readFeedback(135, client, 1)` | `value=65 decimals=0 tag1="score" tag2="apex-watch-v1" revoked=false` |
| `getLastIndex(135, client)` | `1` |
| `getSummary(135, [client], "", "")` | `count=1 value=65 decimals=0` |
| `getSummary(135, [], "", "")` | reverts `"clientAddresses required"` → function exists |
| `readFeedback(135, client, 0)` | reverts `"index must be > 0"` → function exists, 1-based index |
| legacy `getReputation(uint256)` / `name()` | selector absent (revert, no data) |

Interface = final ERC-8004 spec:

```solidity
function giveFeedback(
    uint256 agentId, int128 value, uint8 valueDecimals,
    string tag1, string tag2, string endpoint,
    string feedbackURI, bytes32 feedbackHash
) external;   // selector 0x3c036a7e
```

Registry-enforced constraints: `agentId` must be registered in the Identity
registry (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`); the poster may not
own (or be an approved operator of) the agent; `valueDecimals` ∈ 0–18. A
`giveFeedback` simulation from the backend key succeeded before the real tx.

## Run

```bash
cd ~/workspace/hallpass-build/backend/reputation
npm install

# prove the loop once (exactly one feedback tx through the production path)
REPUTATION_KEY=<hex> PROOF_AGENT_ID=135 node watcher.js --post-proof

# single pass: post feedback for every confirmed-but-unposted close, then exit
REPUTATION_KEY=<hex> REPUTATION_AGENT_ID=<id> START_BLOCK=<plugin deploy block> node watcher.js

# daemon: poll every 60s
POLL_INTERVAL_MS=60000 REPUTATION_KEY=<hex> REPUTATION_AGENT_ID=<id> node watcher.js
```

Env vars:

| Var | Required | Default | Meaning |
|---|---|---|---|
| `REPUTATION_KEY` | **yes** (or `DEPLOYER_PRIVATE_KEY`) | — (fails loudly, exit 2) | Backend signing key. Needs a small native-USDC balance (~0.005 USDC/post). Never logged |
| `REPUTATION_AGENT_ID` | **yes** (watch loop) | — (fails loudly, exit 2) | ERC-8004 agent ID closed sessions are attributed to. Must be a real registered agent |
| `PROOF_AGENT_ID` | no | — | Overrides `REPUTATION_AGENT_ID` in `--post-proof` mode only |
| `FEEDBACK_VALUE` | no | `50` | int128 score (signed; neutral midpoint for clean closes) |
| `FEEDBACK_DECIMALS` | no | `0` | 0–18 (registry-enforced) |
| `FEEDBACK_TAG1` / `FEEDBACK_TAG2` | no | `score` / `hallpass-session-close` | Feedback categories |
| `FEEDBACK_ENDPOINT` | no | `hallpass/session-close` | The agent endpoint that was used |
| `FEEDBACK_URI` | no | `""` | Optional off-chain evidence link |
| `PLUGIN_ADDRESS` | no | production plugin v0.2.0 | Watched for `SessionRevokedEvt` |
| `REPUTATION_REGISTRY` | no | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | ERC-8004 Reputation registry |
| `START_BLOCK` | no | current head (forward-only) | First block to scan; backfill with the plugin deploy block |
| `REPUTATION_DB` | no | `<dir>/reputation.sqlite` | Dedupe DB — one feedback tx per close, restarts never double-post |
| `RANGE_SIZE` | no | `5000` | blocks per `getLogs` call |
| `POLL_INTERVAL_MS` | no | `0` (single pass) | >0 → daemon polling mode |
| `RPC_URL` | no | `https://rpc.mainnet.arc.io` | Arc mainnet RPC |

Integrity rules (same discipline as the event indexer):
- No key → exit 2. No agent ID → exit 2 (a guessed ID would poison the registry).
- Wrong chain ≠ 5042 → refuse.
- Every feedback tx is **simulated** with `eth_call` first; a registry-level
  rejection (unknown agent, self-feedback, bad decimals) fails loudly instead
  of burning dust on a doomed tx.
- The encoded selector is checked against the proven `0x3c036a7e` before
  sending — selector drift fails the run, never the chain.
- Feedback is committed only for closes ≥ 12 confirmations deep; posted closes
  are recorded by plugin tx hash, so restarts never double-post.
- Reverted feedback txs throw — they are never recorded as posted.

## Registering the HALLPASS agent

Feedback must name a real agent. Register once on the Identity registry
(`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`):

```solidity
uint256 agentId = IIdentityRegistry(0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)
    .register("https://hallpass…/agent.json", metadata);
```

then set `REPUTATION_AGENT_ID=<agentId>`. Note the registry forbids
self-feedback: the key that owns the agent NFT cannot be the
`REPUTATION_KEY` that posts feedback — use a separate backend key, or post
feedback about the agent from an operator key.

## Economics

~197k gas per `giveFeedback`; at ~20 gwei ≈ 0.004 native USDC per close.
Dust by design.

## Security note

This service reads one secret (`REPUTATION_KEY` / `DEPLOYER_PRIVATE_KEY`)
from the environment for signing. It never prints, logs, or writes the key
anywhere. The build-time env file (`~/workspace/user/files/env-2.txt`) is
never committed — `.gitignore` it if you copy values out.
