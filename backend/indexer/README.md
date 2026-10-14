# HALLPASS event indexer

Read-only indexer for the HallpassPlugin ERC-6900 v0.7 policy plugin on
Arc mainnet (chain 5042). Scans plugin logs via the public RPC and writes
them to SQLite (`db.sqlite` next to `index.js` by default). Needs **no
private keys, no secrets, no signing** — pure RPC reads.

## Schema contract (shared with the stats API — `backend/api/STATS.md`)

Table/column names match the contract exactly:

| Table | Source | Notes |
|---|---|---|
| `meta(key, value)` | internal | `('last_block', '<n>')` — sync watermark, highest fully-scanned confirmed block |
| `installs(account, plugin, tx_hash PK, block_number, block_ts, manifest_hash, uninstalled)` | `SessionRegistered` | one row per install event; `manifest_hash` recovered best-effort from the install tx (NULL when not decodable); `uninstalled` set from a real `getInstalledPlugins()` call, see below |
| `policies(account PK, session_key, per_tx_cap, window_cap, window_secs, window_start, window_spent, expiry, revoked, policy_hash, updated_at)` | derived current-state | upserted from `SessionRegistered` / `PolicyUpdated`; `revoked` set by `SessionRevokedEvt` and cleared by `PolicyUpdated` (mirrors the contract's on-chain behavior); `window_spent` tracks the latest `SpendAuthorized`'s `windowSpent` per account |
| `spends(id, account, session_key, recipient, amount, tx_hash, block_number, block_ts)` | `SpendAuthorized` | one row per gated execution (each call inside `executeBatch` emits its own) |
| `denials(...)` | **relay-fed only** | Reverts emit no logs, so this indexer **never writes denial rows**. The table exists empty for the stats API to count; the relay service feeds it. Empty = zero observed, honestly |
| `revokes(account, session_key, tx_hash PK, block_number, block_ts)` | `SessionRevokedEvt` | |

**NULL semantics (honest unknowns):** the emitted events do not carry
`window_secs`, `window_start`, `policy_hash`, and sometimes `manifest_hash`.
Those columns are stored NULL rather than guessed or defaulted. `uninstalled`
is derived honestly: after each scan the indexer calls `getInstalledPlugins()`
on every known account and flips the flag only where the plugin is provably
absent (RPC failure leaves the flag untouched — "unknown", not "uninstalled").

Event ABI lives in `index.js` (`PLUGIN_ABI`), matching the H9 reference
`HallpassPlugin.sol` signatures. If the production plugin changes an event
signature, update `PLUGIN_ABI` — unrecognized logs from the plugin address
are skipped with a warning, never fabricated.

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
| `PLUGIN_ADDRESS` | **yes** | — (fails loudly, exit 2) | Deployed HallpassPlugin address. No default — a wrong default would poison the dataset |
| `START_BLOCK` | no | current head (forward-only) | First block to scan; used only when no checkpoint exists |
| `RPC_URL` | no | `https://rpc.mainnet.arc.io` | Arc mainnet RPC |
| `INDEXER_DB` / `DB_PATH` | no | `<dir>/db.sqlite` | SQLite file location (`INDEXER_DB` wins — matches the stats API probe order) |
| `RANGE_SIZE` | no | `5000` | blocks per `getLogs` call |
| `POLL_INTERVAL_MS` | no | `0` (single pass) | >0 → daemon polling mode |

Integrity rules:
- `PLUGIN_ADDRESS` unset → exit 2 with an explicit error (never a misleading default).
- Connected chain ≠ 5042 → refuse to index the wrong chain.
- Reorg safety: logs are committed only once their block is ≥ 12 confirmations deep; the checkpoint advances only over fully-scanned confirmed ranges, so restarts never double-write (event inserts are `INSERT OR IGNORE` / PK-guarded anyway).
- No plugin deployed yet at the address → the indexer runs, scans, finds zero logs, prints an **honest empty result**, exits 0. Zero rows is data, not an error.

## Pointing at a new deployment

1. Deploy + Sourcify-verify the new plugin (per the build bible).
2. Verify the event signatures on the deployed ABI match `PLUGIN_ABI` in `index.js`; update them if the contract changed (do not silently drop fields).
3. Run a backfill:
   ```bash
   INDEXER_DB=db-<deploy-date>.sqlite PLUGIN_ADDRESS=0x<new> START_BLOCK=<deploy block> node index.js
   ```
   A separate DB per deployment keeps history auditable. Alternatively reuse
   the same DB — the checkpoint prevents re-scanning, and `installs` keeps
   per-deployment history (`plugin` column).
4. Confirm the row counts against the expected install/update/revoke txs before
   wiring the dashboard/stats API to the new DB.

## Backfill procedure

- Full history: `START_BLOCK=<plugin deploy block>` with a fresh DB path.
- The indexer chunks `getLogs` into 5,000-block ranges with exponential-backoff
  RPC retries; on crash, re-run with the same env and it resumes from the
  checkpointed block (`meta.last_block`).
- To validate a backfill, spot-check one `SessionRegistered` tx hash from the
  install transaction ledger and confirm `installs.tx_hash` contains it.

## Security note

This indexer never reads secrets, never signs, and never sends transactions.
The build-time environment file (`~/workspace/user/files/env-2.txt`) is never
touched — this service has no use for it.
