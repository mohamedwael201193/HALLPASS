# HALLPASS — Landing-page stats API

## Endpoint

`GET /api/stats` → JSON, 200, `Cache-Control: public, max-age=15`.

```json
{
  "pluginsInstalled": 3,
  "policiesActive": 2,
  "spendsAllowed": 41,
  "spendsBlocked": 5,
  "revokes": 1,
  "asOfBlock": 48291377,
  "source": "hallpass-indexer"
}
```

**Mount (server.js — backend owner adds this one line; the stats router lives at `backend/api/stats.js`):**
```js
app.use('/api', require('./api/stats'));
```
Custom DB path: `app.use('/api', require('./api/stats')({ dbPath: '/abs/path/db.sqlite' }))`.
Dependency: `better-sqlite3 ^11` (DB opened read-only per request).

## Metric definitions & exact SQL/event source

All counts are real SQL aggregates over the indexer DB (`db.sqlite`).
Zero is a real answer: an empty DB returns zeros, never invented numbers.

| Metric | Counts | Exact SQL | Event / on-chain source |
|---|---|---|---|
| `pluginsInstalled` | Hallpass plugin instances **currently installed** (distinct accounts; uninstalled plugins are not counted) | `SELECT COUNT(DISTINCT account) FROM installs WHERE uninstalled = 0` | Indexer watches the full plugin's `SessionRegistered(account, sessionKey, perTxCap, windowCap, expiry)` (emitted by `onInstall`) and the minimal plugin's `CapSet(account, cap)`, plus `uninstallPlugin` calls on each MSCA (sets `uninstalled = 1`) |
| `policiesActive` | Installed policies that are **not revoked and not expired** as of the API server's current time | `SELECT COUNT(*) FROM policies WHERE revoked = 0 AND expiry > <now_unix>` | `policies` rows are created by `SessionRegistered` / updated by `PolicyUpdated(account, perTxCap, windowCap, expiry)`; `revoked = 1` is set by `SessionRevokedEvt(account, sessionKey)` |
| `spendsAllowed` | Gated spends that **passed** policy and executed (one row per call inside `executeBatch` too — matches what the activity feed shows) | `SELECT COUNT(*) FROM spends` | Full plugin `SpendAuthorized(account, sessionKey, to, amount, windowSpent)` — emitted atomically with the window-accounting write in `_authorizeSpend`, so every counted spend really moved money |
| `spendsBlocked` | Blocked attempts the **relay observed**: reverted direct-path txs (custom errors like `PerTxCapExceeded`, `WindowCapExceeded`, `RecipientNotAllowed`, `SessionExpired`, `SessionRevoked`) and failed userOp validations (`FailedOp…` from `EntryPoint.handleOps`). Reverts emit no events by definition — these are observed, not on-chain-logged, and the UI must label them "observed revert", not "on-chain event". | `SELECT COUNT(*) FROM denials` | Off-chain: relay log of reverted session-key txs + EntryPoint `UserOperationRevertReason` / `PostOpRevertReason` for this plugin. `reason` stores the decoded custom error, `source` stores `observed-revert` or `userop-failure` |
| `revokes` | Owner-initiated revocations, ever | `SELECT COUNT(*) FROM revokes` | Full plugin `SessionRevokedEvt(account, sessionKey)` (emitted by `revokeSession()` through the account fallback) |
| `asOfBlock` | Newest block the indexer had synced when the counts were computed (`null` if unknown) | `SELECT value FROM meta WHERE key = 'last_block'`, else `MAX(block_number)` across `spends ∪ denials ∪ revokes ∪ installs` | Indexer's sync watermark |
| `source` | Honesty label: where the numbers came from | n/a (computed by the API) | See "source values" below |

## source values

| Value | Meaning |
|---|---|
| `hallpass-indexer` | DB opened; all expected tables present; every number is a live query |
| `hallpass-indexer-degraded` | DB opened but one or more expected tables are missing — the affected metrics are 0 and the missing tables must be fixed, not papered over |
| `indexer-unavailable` | DB file missing/unreadable or `better-sqlite3` not installed — all metrics 0. The landing page must treat this as "no data yet", never hide it behind a fake number |

## Indexer schema contract (what the indexer worker must write to `db.sqlite`)

This API reads; the indexer writes. Table names below are the contract:

- `meta(key TEXT PRIMARY KEY, value TEXT)` — e.g. `('last_block', '<n>')`.
- `installs(account TEXT, plugin TEXT, tx_hash TEXT PRIMARY KEY, block_number INTEGER, block_ts INTEGER, manifest_hash TEXT, uninstalled INTEGER DEFAULT 0)` — one row per install; `uninstalled = 1` on `uninstallPlugin`.
- `policies(account TEXT PRIMARY KEY, session_key TEXT, per_tx_cap TEXT, window_cap TEXT, window_secs INTEGER, window_start INTEGER, window_spent TEXT, expiry INTEGER, revoked INTEGER, policy_hash TEXT, updated_at INTEGER)` — amounts as decimal strings (native wei, 18 decimals).
- `spends(id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT, session_key TEXT, recipient TEXT, amount TEXT, tx_hash TEXT, block_number INTEGER, block_ts INTEGER)`.
- `denials(id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT, session_key TEXT, recipient TEXT, amount TEXT, reason TEXT, source TEXT, tx_hash TEXT, block_number INTEGER, block_ts INTEGER)` — `reason` = decoded custom error (e.g. `PerTxCapExceeded`); `source` ∈ `observed-revert`, `userop-failure`.
- `revokes(account TEXT, session_key TEXT, tx_hash TEXT PRIMARY KEY, block_number INTEGER, block_ts INTEGER)`.

**DB location:** env `INDEXER_DB` wins; otherwise the API probes `backend/indexer/db.sqlite`, then `backend/db.sqlite`, then `db.sqlite` in cwd.

## Honesty rules (non-negotiable)

1. No mock data, no invented numbers — zeros are real, anything else must come from the SQL above.
2. Blocked attempts are *observed reverts*, not on-chain events. Never present `spendsBlocked` as an on-chain event count.
3. If the DB is absent the API returns zeros with `source: "indexer-unavailable"` — the frontend must render an honest empty state ("indexing not live yet"), not a fallback number.
4. `policiesActive` uses server time vs on-chain `expiry` — expiry timestamps are on-chain seconds; clock skew is negligible for a landing stat.
