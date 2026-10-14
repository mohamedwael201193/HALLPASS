# HALLPASS API Contract — v1.0.0 (2026-10-14)

**Authority:** This document is the test target. Tests in `backend/api/*.test.js`
are written against it and run with `node --test backend/api/`.
The server implementation is `backend/api/server.js` (built in parallel).

**Grounded in:** `~/workspace/your_files/hallpass-build-bible.md`
- Hard rule 2: every state shown comes from chain (RPC) or chain events (indexer).
- Bible §2.3: stats from events, never a private DB. The SQLite store is the
  indexer's **event cache** — a mirror of chain data, not private data.
- Bible §8.6: activity feed (allowed + blocked, decoded reasons, tx hashes), CSV export.
- Bible §4.1: `getInstalledPlugins()` is the source of truth for installed state.
- Hard rule 10: honest degrade — RPC unreachable → labeled error, never fake data.

---

## 1. Base

- Base path: `/api/v1`. All data endpoints live under it.
- Responses are JSON (`Content-Type: application/json; charset=utf-8`), except
  the CSV export.
- Errors are **always JSON** with the envelope in §3 — never an HTML error page,
  never a bare status code.
- `GET /` → `200 {"service":"hallpass-api","version":"1.0.0","health":"/api/v1/health"}`.

## 2. Provenance: `source` and `asOfBlock`

Every response that carries chain or chain-event data includes top-level:

| Field | Type | Meaning |
|---|---|---|
| `source` | string | `"rpc"` (live `eth_call`/chain read) or `"indexer"` (event-cache read). |
| `asOfBlock` | integer \| null | Block the data is read as of. `null` only when no watermark exists (indexer never ran) or the read failed before a block was known. |

Rules:
- `source: "rpc"` → `asOfBlock` is the block number of the state read.
- `source: "indexer"` → `asOfBlock` is the indexer's watermark (`meta.asOfBlock`);
  `null` when the indexer has never completed a run.
- Error bodies include `error.source` (`"api"` \| `"rpc"` \| `"indexer"`) and
  top-level `asOfBlock` (null unless a block is known).
- **Never** serve RPC-sourced endpoints from cache with `source: "rpc"` when the
  RPC is unreachable — return `503 RPC_UNAVAILABLE` (§3) instead.

## 3. Error envelope

```json
{
  "error": {
    "code": "BAD_ADDRESS",
    "message": "Invalid account address \"0x123\". Expected 0x-prefixed 40 hex characters.",
    "field": "address",
    "source": "api",
    "asOfBlock": null
  }
}
```

- `code` (string, required), `message` (non-empty string, required — names the
  next action per bible hard rule 4/10), `field` (optional, for 400s),
  `source` (required), `asOfBlock` (required, may be null).

| Code | HTTP | When |
|---|---|---|
| `BAD_ADDRESS` | 400 | `:address` / `account` param is not `0x` + 40 hex chars |
| `VALIDATION_ERROR` | 400 | bad `limit`, `kind`, `cursor`, or other query param |
| `NOT_FOUND` | 404 | unknown route under `/api/v1/*` |
| `METHOD_NOT_ALLOWED` | 405 | wrong method on a known route; response carries `Allow` header |
| `RPC_UNAVAILABLE` | 503 | RPC-backed endpoint, RPC not configured or unreachable |
| `DB_UNAVAILABLE` | 503 | SQLite store unreadable |
| `INTERNAL` | 500 | anything else; message must not leak internals |

## 4. Endpoints

### 4.1 `GET /api/v1/health`

```json
{
  "status": "ok",
  "version": "1.0.0",
  "chainId": 5042,
  "db": { "ok": true },
  "rpc": { "configured": true, "reachable": false },
  "indexer": { "source": "indexer", "asOfBlock": null, "lastRunAt": null }
}
```

- `rpc.configured`: whether `RPC_URL` is set. `rpc.reachable`: live probe result.
  Never expose the RPC URL itself.
- `indexer.asOfBlock`/`lastRunAt`: `null` on a fresh database (honest, not zero).

### 4.2 `GET /api/v1/accounts/:address`

Live account + install status. **RPC-backed** (`source: "rpc"`).
No hallpass plugin installed is a normal empty state → `200` with nulls, not 404.

```json
{
  "account": "0x1111...1111",
  "pluginInstalled": true,
  "pluginAddress": "0xabcd...abcd",
  "installedAtBlock": 8123456,
  "policy": {
    "sessionKey": "0x2222...2222",
    "perTxCapRaw": "100000",
    "perTxCap": "0.10",
    "windowCapRaw": "1000000",
    "windowCap": "1.00",
    "windowSeconds": 86400,
    "windowSpentRaw": "320000",
    "windowSpent": "0.32",
    "windowResetsAt": 1760470000,
    "allowlist": ["0x3333...3333"],
    "expiresAt": 1760556400,
    "revoked": false
  },
  "policyHash": "0x...",
  "unchangedSinceInstall": true,
  "source": "rpc",
  "asOfBlock": 8123999
}
```

- Amounts: `*Raw` = base-units decimal string; display = USDC decimal string,
  no trailing zeros (`"0.10"` for 100000, `"0"` for zero).
- `unchangedSinceInstall`: compares live policy hash to the install-time
  commitment; `null` when no install record exists.
- RPC unreachable → `503 RPC_UNAVAILABLE`.

### 4.3 `GET /api/v1/accounts/:address/activity`

Event-cache activity feed. **Indexer-backed** (`source: "indexer"`).
Query: `limit` (default 50, integer 1–500; >500 clamps to 500),
`cursor` (opaque, from `nextCursor`), `kind` (`allowed`|`blocked`).
Unknown query params are ignored. Newest first.

```json
{
  "items": [
    {
      "kind": "allowed",
      "txHash": "0x...",
      "blockNumber": 8123400,
      "logIndex": 3,
      "sessionKey": "0x2222...2222",
      "to": "0x4444...4444",
      "token": "0x...",
      "amountRaw": "50000",
      "amount": "0.05",
      "reasonCode": null,
      "reasonText": null,
      "policyHash": "0x...",
      "timestamp": 1760460000
    },
    {
      "kind": "blocked",
      "txHash": "0x...",
      "blockNumber": 8123410,
      "logIndex": 1,
      "sessionKey": "0x2222...2222",
      "to": "0x4444...4444",
      "token": "0x...",
      "amountRaw": "500000",
      "amount": "0.50",
      "reasonCode": "PerTxCapExceeded",
      "reasonText": "Blocked: 0.50 USDC exceeds your 0.10 per-payment cap. Nothing was spent.",
      "policyHash": "0x...",
      "timestamp": 1760460100
    }
  ],
  "nextCursor": "eyJ...",
  "limit": 50,
  "kind": null,
  "source": "indexer",
  "asOfBlock": 8123999
}
```

- `reasonCode` ∈ `PerTxCapExceeded | WindowCapExceeded | NotAllowlisted |
  SessionExpired | SessionRevoked` (plugin custom errors, bible §3); `reasonText`
  is the plain-language translation (bible hard rule 4).
- Empty database → `200 {"items": [], "nextCursor": null, ..., "asOfBlock": null}`.
  **Empty arrays, never 500s.**

### 4.4 `GET /api/v1/accounts/:address/sessions`

Session-key status. **RPC-backed** (`source: "rpc"`).

```json
{
  "account": "0x1111...1111",
  "sessions": [
    {
      "sessionKey": "0x2222...2222",
      "expiresAt": 1760556400,
      "expired": false,
      "revoked": false,
      "perTxCap": "0.10",
      "windowCap": "1.00",
      "windowSeconds": 86400,
      "windowSpent": "0.32",
      "windowRemaining": "0.68",
      "windowResetsAt": 1760470000
    }
  ],
  "source": "rpc",
  "asOfBlock": 8123999
}
```

- No sessions → `"sessions": []` (200). RPC unreachable → `503 RPC_UNAVAILABLE`.

### 4.5 `GET /api/v1/stats`

Global counts **from the event cache** (bible §2.3: stats from events).
**Indexer-backed** (`source: "indexer"`).

```json
{
  "accounts": 2,
  "spendsAllowed": 41,
  "spendsBlocked": 7,
  "volumeAllowedRaw": "2050000",
  "volumeAllowed": "2.05",
  "source": "indexer",
  "asOfBlock": 8123999
}
```

- Counts are real: `SELECT COUNT(*) ...` over the event tables. Empty database →
  all zeros, `asOfBlock: null`, `200`. Never invented, never cached guesses.

### 4.6 `GET /api/v1/activity/export?account=0x...`

CSV export of the activity feed (bible §8.6, §12). **Indexer-backed.**
`account` query param optional (filters); must be a valid address when present.

- `200`, `Content-Type: text/csv; charset=utf-8`,
  `Content-Disposition: attachment; filename="hallpass-activity.csv"`.
- Headers: `X-Source: indexer`; `X-As-Of-Block: <n>` (omitted when null).
- Columns (in order):
  `kind,tx_hash,block_number,log_index,session_key,to_address,token,amount,amount_raw,reason_code,reason_text,policy_hash,timestamp_iso`
- `reason_text` CSV-escaped. Empty database → header row only, `200`.

## 5. Validation rules

- `:address` / `account`: case-insensitive `^0x[0-9a-fA-F]{40}$`; anything else →
  `400 BAD_ADDRESS` with `field` set and a message naming the expected format.
  Responses return addresses **lowercase**.
- `limit`: integer; non-integer or `< 1` → `400 VALIDATION_ERROR`; `> 500`
  clamps to 500 (still `200`).
- `kind`: `allowed`|`blocked` only → else `400 VALIDATION_ERROR`.
- `cursor`: malformed/opaque-invalid → `400 VALIDATION_ERROR`.
- Unknown routes under `/api/v1/*` → `404 NOT_FOUND` (JSON).
- Wrong method on a known route → `405 METHOD_NOT_ALLOWED` + `Allow` header.

## 6. Empty-state honesty matrix

| Situation | Endpoint | Result |
|---|---|---|
| Fresh/empty DB | `activity` | `200`, `items: []`, `nextCursor: null`, `asOfBlock: null` |
| Fresh/empty DB | `stats` | `200`, all counts `0`, `asOfBlock: null` |
| Fresh/empty DB | `export` | `200`, header row only |
| Fresh/empty DB | `health` | `200`, `indexer.asOfBlock: null`, `lastRunAt: null` |
| No RPC configured | `accounts/:address`, `sessions` | `503 RPC_UNAVAILABLE` (labeled, not fake) |
| No plugin on account | `accounts/:address`, `sessions` | `200`, `pluginInstalled: false` / `sessions: []` |

## 7. Server module interface (for in-process tests)

`backend/api/server.js` MUST export:

```js
createServer({ dbPath, rpcUrl, chainId, port }) -> api
// api.start() -> Promise<void>   resolves when listening; then api.port is the bound port
// api.close() -> Promise<void>
// api.port    -> number (actual bound port after start)
```

- `dbPath` (required): SQLite file path. The server creates parent dirs and
  bootstraps the read-model schema on start (`CREATE TABLE IF NOT EXISTS`).
  A missing file or missing tables must **never** cause a 500 — empty state.
- `rpcUrl` (optional): absent → RPC-backed endpoints return `503 RPC_UNAVAILABLE`.
- `chainId` (optional, default `5042`).
- `port` (optional, default `0` = ephemeral).
- Works as CommonJS (`module.exports = { createServer }`) or ESM
  (`export function createServer`); the test harness handles both.
- CLI nicety: `node backend/api/server.js` honors `PORT`, `DB_PATH`, `RPC_URL`,
  `CHAIN_ID` and logs readiness.

## 8. Read-model schema (API reads; indexer writes)

```sql
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- meta.key = 'asOfBlock'  -> integer block watermark (text-encoded)
-- meta.key = 'lastRunAt'  -> ISO-8601 timestamp of last indexer run

CREATE TABLE IF NOT EXISTS accounts (
  address TEXT PRIMARY KEY,          -- lowercase 0x
  plugin_address TEXT,
  installed_at_block INTEGER,
  policy_hash TEXT,
  install_tx_hash TEXT,
  updated_at_block INTEGER
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account TEXT NOT NULL,             -- lowercase 0x
  kind TEXT NOT NULL CHECK (kind IN ('allowed','blocked')),
  tx_hash TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  log_index INTEGER NOT NULL,
  session_key TEXT,
  token TEXT,
  to_address TEXT,
  amount_raw TEXT NOT NULL DEFAULT '0',  -- base units, decimal string
  amount TEXT,                            -- human display string
  reason_code TEXT,                       -- PerTxCapExceeded | ...
  reason_text TEXT,                       -- plain-language translation
  policy_hash TEXT,
  ts INTEGER,                             -- unix seconds
  UNIQUE (tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS idx_activity_account
  ON activity (account, block_number DESC, log_index DESC);
```

## 9. Hard rules (from the bible, binding on this API)

1. No mock data, no fake success — empty states are empty (§6 matrix).
2. Every value shown is traceable to chain (RPC) or chain events (indexer);
   `source`/`asOfBlock` make the provenance explicit on every response.
3. Keys are never logged and never stored server-side; session private keys
   never transit this API.
4. Error messages name the next action; no raw hex blobs, no stack traces
   in `message`.
5. Nothing in responses may leak secrets (no RPC URLs, no private keys,
   no filesystem paths).
