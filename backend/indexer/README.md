# HALLPASS event indexer

Read-only indexer for the HallpassPlugin ERC-6900 v0.7 policy plugin on
Arc mainnet (chain 5042). Scans plugin logs via the public RPC and writes
them to SQLite (`db.sqlite`, created next to `index.js`). Needs **no
private keys, no secrets, no signing** — pure RPC reads.

## Tables

| Table | Source event | Notes |
|---|---|---|
| `plugin_installs(account, plugin, block, tx)` | `SessionRegistered` | `plugin` = the emitting contract address (the deployment being indexed) |
| `policy_updates(session_key, account, cap, window_cap, expiry, destinations, block, tx)` | `PolicyUpdated` | `session_key` is NULL when the deployed event signature does not carry it — stored as NULL, never guessed. `cap`/`window_cap` are native-wei decimal strings. `destinations` is a JSON allowlist snapshot, `'[]'` when the event carries none |
| `revokes(session_key, account, block, tx)` | `SessionRevokedEvt` | |
| `validation_results(tx, allowed, reason, account, session_key, to_addr, amount, block)` | `SpendAuthorized` | `allowed=1` per row. **Denials are NOT detected here**: a reverted spend emits no log. Denial rows (`allowed=0`, with the decoded revert reason such as `PerTxCapExceeded`) must be fed by the relay service that observed the revert, and are labeled honestly by their source |
| `indexer_state(key, value)` | internal | checkpoint `last_indexed_block` — highest fully-scanned confirmed block |

Event ABI lives in `index.js` (`PLUGIN_ABI`), matching the H9 reference
`HallpassPlugin.sol` signatures. If the production plugin changes an event
signature, update `PLUGIN_ABI` — unrecognized logs from the plugin address
are skipped with a warning, never silently fabricated or dropped silently.

## Run

```bash
cd ~/workspace/hallpass-build/backend/indexer
npm install

# single pass (scans everything confirmed since START_BLOCK)
PLUGIN_ADDRESS=0x… START_BLOCK=<deploy block> node index.js

# forward-only from now (no backfill; indexes from current head)
PLUGIN_ADDRESS=0x… node index.js

# daemon mode — polls for new confirmed blocks every 60s
POLL_INTERVAL_MS=60000 PLUGIN_ADDRESS=0x… START_BLOCK=<deploy block> node index.js
```

Env vars:

| Var | Required | Default | Meaning |
|---|---|---|---|
| `PLUGIN_ADDRESS` | **yes** | — (fails loudly) | Deployed HallpassPlugin address. No default — a wrong default would poison the dataset |
| `START_BLOCK` | no | current head (forward-only) | First block to scan; used only when no checkpoint exists |
| `RPC_URL` | no | `https://rpc.mainnet.arc.io` | Arc mainnet RPC |
| `DB_PATH` | no | `<dir>/db.sqlite` | SQLite file location |
| `RANGE_SIZE` | no | `5000` | blocks per `getLogs` call |
| `POLL_INTERVAL_MS` | no | `0` (single pass) | >0 → daemon polling mode |

Integrity rules:
- `PLUGIN_ADDRESS` unset → exit 2 with an explicit error (never a misleading default).
- Connected chain ≠ 5042 → refuse to index the wrong chain.
- Reorg safety: logs are committed only once their block is ≥ 12 confirmations deep; the checkpoint advances only over fully-scanned confirmed ranges, so restarts never double-write (all inserts are `INSERT OR IGNORE` with uniqueness on `(tx, block, …)` anyway).
- No plugin deployed yet at the address → the indexer runs, scans, finds zero logs, prints an **honest empty result**, exits 0. Zero rows is data, not an error.

## Pointing at a new deployment

1. Deploy + Sourcify-verify the new plugin (per the build bible).
2. Verify the event signatures on the deployed ABI match `PLUGIN_ABI` in `index.js`; update them if the contract changed (do not silently drop fields).
3. Run a backfill:
   ```bash
   DB_PATH=db-<deploy-date>.sqlite PLUGIN_ADDRESS=0x<new> START_BLOCK=<deploy block> node index.js
   ```
   A separate DB per deployment keeps history auditable; the dashboard merges
   across DBs by deployment address, or point `DB_PATH` at the same file and
   backfill the missing range — checkpoints prevent re-scanning.
4. Confirm the row counts against the expected install/update/revoke txs before
   wiring the dashboard to the new DB.

## Backfill procedure

- Full history: `START_BLOCK=<plugin deploy block>` with a fresh `DB_PATH`.
- The indexer chunks `getLogs` into 5,000-block ranges with exponential-backoff
  RPC retries; on crash, re-run with the same env and it resumes from the
  checkpointed block.
- To validate a backfill, spot-check one `SessionRegistered` tx hash from the
  install transaction ledger and confirm `plugin_installs.tx` contains it.

## Security note

This indexer never reads secrets, never signs, and never sends transactions.
The build-time environment file (`~/workspace/user/files/env-2.txt`) is never
touched — this service has no use for it.
