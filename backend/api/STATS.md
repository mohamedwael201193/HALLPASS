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
*(Illustrative example — not real data. Real values come only from the SQL below.)*

**Mount:** `server.js` already mounts the router — `app.use("/api", require("./stats"));`
Custom DB path: `app.use('/api', require('./stats')({ dbPath: '/abs/path/db.sqlite' }))`.
Dependency: `better-sqlite3 ^11` (DB opened read-only per request).

## Metric definitions & exact SQL/event source

All counts are real SQL aggregates over the indexer DB (`db.sqlite`).
Zero is a real answer: an empty DB returns zeros, never invented numbers.

| Metric | Counts | Exact SQL | Event / on-chain source |
|---|---|---|---|
| `pluginsInstalled` | Distinct accounts with at least one indexed install event | `SELECT COUNT(DISTINCT account) FROM plugin_installs` | Indexer watches the plugin's `SessionRegistered(account, sessionKey, perTxCap, windowCap, expiry)` (emitted by `onInstall`) |
| `policiesActive` | Distinct accounts with an **unexpired policy and no revoke on record**, as of the API server's current time | `SELECT COUNT(DISTINCT account) FROM policy_updates pu WHERE pu.expiry > <now_unix> AND NOT EXISTS (SELECT 1 FROM revokes r WHERE LOWER(r.account)=LOWER(pu.account))` | `policy_updates` rows from `PolicyUpdated(account, perTxCap, windowCap, expiry)`; revoke-matched at account level (the event carries no session key — conservative by design) |
| `spendsAllowed` | Gated spends that **passed** policy and executed | `SELECT COUNT(*) FROM validation_results WHERE allowed = 1` | Plugin `SpendAuthorized(account, sessionKey, to, amount, windowSpent)` — emitted atomically with the window-accounting write, so every counted spend really moved money |
| `spendsBlocked` | Blocked attempts the **relay observed** (relay-fed rows only; **0 until the relay denial feed lands** — the frontend must not present that 0 as "nothing was ever blocked") | `SELECT COUNT(*) FROM validation_results WHERE allowed = 0` | Reverts emit no events by definition — these are observed, not on-chain-logged, and the UI must label them "observed revert", not "on-chain event" |
| `revokes` | Owner-initiated revocations, ever | `SELECT COUNT(*) FROM revokes` | Plugin `SessionRevokedEvt(account, sessionKey)` (emitted by `revokeSession()` through the account fallback) |
| `asOfBlock` | Newest block the indexer had synced when the counts were computed (`null` if unknown) | `SELECT value FROM indexer_state WHERE key = 'last_indexed_block'`, else `MAX(block)` across the event tables | Indexer's sync watermark |
| `source` | Honesty label: where the numbers came from | n/a (computed by the API) | See "source values" below |

## source values

| Value | Meaning |
|---|---|
| `hallpass-indexer` | DB opened; all expected tables present; every number is a live query |
| `hallpass-indexer-degraded` | DB opened but one or more expected tables are missing — the affected metrics are 0 and the missing tables must be fixed, not papered over |
| `indexer-unavailable` | DB file missing/unreadable or `better-sqlite3` not installed — all metrics 0. The landing page must treat this as "no data yet", never hide it behind a fake number |

## Indexer schema contract (what the indexer writes to `db.sqlite`)

This API reads; the indexer writes. These are the **actual** tables written by
`backend/indexer/index.js` (see `backend/indexer/README.md`) — the API must
query these, never a different planned schema:

- `plugin_installs(account, plugin, block, tx)` — one row per `SessionRegistered` event; `plugin` = the emitting contract address.
- `policy_updates(session_key, account, cap, window_cap, expiry, destinations, block, tx)` — one row per `PolicyUpdated`; `session_key` is NULL when the deployed event signature does not carry it; `cap`/`window_cap` are native-wei (18-decimal) decimal strings; `destinations` is a JSON allowlist snapshot (`'[]'` = open).
- `revokes(session_key, account, block, tx)` — one row per `SessionRevokedEvt`.
- `validation_results(tx, allowed, reason, account, session_key, to_addr, amount, block)` — one row per `SpendAuthorized` (`allowed = 1`). Denial rows (`allowed = 0`, with the decoded revert reason) are added by the relay integration only — never fabricated by the indexer.
- `indexer_state(key, value)` — checkpoint: `last_indexed_block` = highest fully-scanned confirmed block.

**DB location:** env `INDEXER_DB` wins, then `DB_PATH`, otherwise the API probes `backend/indexer/db.sqlite`, then `backend/db.sqlite`, then `db.sqlite` in cwd.

## Honesty rules (non-negotiable)

1. No mock data, no invented numbers — zeros are real, anything else must come from the SQL above.
2. Blocked attempts are *observed reverts*, not on-chain events. Never present `spendsBlocked` as an on-chain event count. Until the relay denial feed lands, `spendsBlocked` is 0 — the frontend must render that metric as "not yet recorded", never as "0 blocked".
3. If the DB is absent the API returns zeros with `source: "indexer-unavailable"` — the frontend must render an honest empty state ("indexing not live yet"), not a fallback number.
4. `policiesActive` uses server time vs on-chain `expiry` — expiry timestamps are on-chain seconds; clock skew is negligible for a landing stat.
