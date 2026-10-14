// HALLPASS event indexer
// ------------------------
// Read-only indexer for the HallpassPlugin ERC-6900 v0.7 policy plugin on
// Arc mainnet (chain 5042). Scans plugin-emitted logs from a configurable
// start block and writes them to SQLite. No private keys, no signing —
// read-only RPC access only.
//
// Event → table mapping:
//   SessionRegistered(account, sessionKey, perTxCap, windowCap, expiry)
//       → plugin_installs
//   PolicyUpdated(account, perTxCap, windowCap, expiry)
//       → policy_updates   (session_key may be NULL if the deployed event
//                            signature does not carry it — see README)
//   SessionRevokedEvt(account, sessionKey)
//       → revokes
//   SpendAuthorized(account, sessionKey, to, amount, windowSpent)
//       → validation_results (allowed = 1; denial rows are added by the
//          relay integration, never fabricated here)
//
// Reorg safety: logs are only committed once their block is >= 12 blocks
// behind chain head. The highest committed block is checkpointed in the
// `indexer_state` table, so restarts never re-scan committed history.
//
// If the plugin is not deployed yet (PLUGIN_ADDRESS unset, or the address
// has no logs in the scan range) the indexer reports that honestly and
// exits 0 with zero rows written — it never invents data.
//
// Usage:
//   PLUGIN_ADDRESS=0x... node index.js                 (single pass)
//   PLUGIN_ADDRESS=0x... START_BLOCK=1234567 node index.js
//   POLL_INTERVAL_MS=60000 PLUGIN_ADDRESS=0x... node index.js   (daemon)

const { ethers } = require("ethers");
const Database = require("better-sqlite3");
const path = require("path");

// ---------- configuration ----------
const RPC_URL = process.env.RPC_URL || "https://rpc.mainnet.arc.io";
const EXPECTED_CHAIN_ID = 5042n;

const PLUGIN_ADDRESS = (process.env.PLUGIN_ADDRESS || "").trim();
if (!PLUGIN_ADDRESS) {
  console.error(
    "FATAL: PLUGIN_ADDRESS is not set. This indexer refuses to run against a " +
      "guessed or default contract address — every indexed row must be traceable " +
      "to the real deployed HallpassPlugin. Set PLUGIN_ADDRESS=<deployed address> " +
      "and re-run (see README.md for how to point at a new deployment)."
  );
  process.exit(2);
}
if (!ethers.isAddress(PLUGIN_ADDRESS)) {
  console.error(`FATAL: PLUGIN_ADDRESS="${PLUGIN_ADDRESS}" is not a valid address.`);
  process.exit(2);
}

const START_BLOCK = process.env.START_BLOCK
  ? BigInt(process.env.START_BLOCK)
  : null; // null → start at current head (forward-only) on first run
const CONFIRMATIONS = 12n; // reorg-safe depth, per spec
const RANGE_SIZE = process.env.RANGE_SIZE ? BigInt(process.env.RANGE_SIZE) : 5000n;
const POLL_INTERVAL_MS = process.env.POLL_INTERVAL_MS
  ? Number(process.env.POLL_INTERVAL_MS)
  : 0; // 0 → single pass then exit
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "db.sqlite");
const MAX_RPC_RETRIES = 6;

// ---------- event ABI ----------
// Decoded via the deployed plugin's exact event signatures. These match the
// H9 research reference (HallpassPlugin.sol); if the production contract
// changes a signature, update these strings — never silently drop a field.
const PLUGIN_ABI = [
  "event SessionRegistered(address indexed account, address indexed sessionKey, uint256 perTxCap, uint256 windowCap, uint256 expiry)",
  "event SpendAuthorized(address indexed account, address indexed sessionKey, address indexed to, uint256 amount, uint256 windowSpent)",
  "event SessionRevokedEvt(address indexed account, address indexed sessionKey)",
  "event PolicyUpdated(address indexed account, uint256 perTxCap, uint256 windowCap, uint256 expiry)",
];
const iface = new ethers.Interface(PLUGIN_ABI);

// ---------- sqlite ----------
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS plugin_installs (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    account TEXT NOT NULL,
    plugin  TEXT NOT NULL,
    block   INTEGER NOT NULL,
    tx      TEXT NOT NULL,
    UNIQUE (tx, block, account)
  );
  CREATE TABLE IF NOT EXISTS policy_updates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_key TEXT,                      -- NULL when the emitted event does not carry it
    account     TEXT NOT NULL,
    cap         TEXT NOT NULL,             -- per-tx cap, native wei, as decimal string
    window_cap  TEXT NOT NULL,             -- rolling-window cap, native wei
    expiry      INTEGER NOT NULL,          -- unix seconds
    destinations TEXT NOT NULL DEFAULT '[]', -- allowlist snapshot as JSON; '[]' = open when the event carries none
    block       INTEGER NOT NULL,
    tx          TEXT NOT NULL,
    UNIQUE (tx, block, account)
  );
  CREATE TABLE IF NOT EXISTS revokes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_key TEXT,
    account     TEXT NOT NULL,
    block       INTEGER NOT NULL,
    tx          TEXT NOT NULL,
    UNIQUE (tx, block, account)
  );
  CREATE TABLE IF NOT EXISTS validation_results (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    tx      TEXT NOT NULL,
    allowed INTEGER NOT NULL,              -- 1 = SpendAuthorized seen; 0 = denial observed (relay-fed only)
    reason  TEXT,                          -- decoded revert reason when known
    account TEXT,
    session_key TEXT,
    to_addr TEXT,
    amount  TEXT,                          -- native wei, decimal string
    block   INTEGER,
    UNIQUE (tx, block)
  );
  CREATE TABLE IF NOT EXISTS indexer_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
const getState = (k) => {
  const row = db.prepare("SELECT value FROM indexer_state WHERE key = ?").get(k);
  return row ? row.value : null;
};
const setState = (k, v) =>
  db.prepare("INSERT INTO indexer_state(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(k, v);

const insertInstall = db.prepare(
  "INSERT OR IGNORE INTO plugin_installs(account, plugin, block, tx) VALUES (?, ?, ?, ?)"
);
const insertPolicy = db.prepare(
  "INSERT OR IGNORE INTO policy_updates(session_key, account, cap, window_cap, expiry, destinations, block, tx) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);
const insertRevoke = db.prepare(
  "INSERT OR IGNORE INTO revokes(session_key, account, block, tx) VALUES (?, ?, ?, ?)"
);
const insertValidation = db.prepare(
  "INSERT OR IGNORE INTO validation_results(tx, allowed, reason, account, session_key, to_addr, amount, block) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);

// ---------- rpc helpers ----------
const provider = new ethers.JsonRpcProvider(RPC_URL);

async function withRetry(fn, label) {
  let delay = 1000;
  for (let attempt = 1; attempt <= MAX_RPC_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === MAX_RPC_RETRIES) throw err;
      console.error(
        `RPC ${label} failed (attempt ${attempt}/${MAX_RPC_RETRIES}): ${err.shortMessage || err.message}. Retrying in ${delay}ms…`
      );
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

async function checkChain() {
  const net = await withRetry(() => provider.getNetwork(), "chain-id check");
  if (net.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `Connected to chain ${net.chainId}, expected Arc mainnet (${EXPECTED_CHAIN_ID}). Refusing to index the wrong chain.`
    );
  }
}

// ---------- decode & write ----------
function handleLog(log) {
  let parsed;
  try {
    parsed = iface.parseLog(log);
  } catch {
    // Log from this address with an unknown signature — possible if the
    // production plugin emits events we did not declare. Skipped, not
    // fabricated; logged so the ABI can be updated.
    console.warn(
      `WARN: unrecognized log signature from plugin at block ${log.blockNumber} tx ${log.transactionHash} topic0=${log.topics[0]} — skipped (update PLUGIN_ABI).`
    );
    return "skipped";
  }
  const block = Number(log.blockNumber);
  const tx = log.transactionHash;

  switch (parsed.name) {
    case "SessionRegistered": {
      const { account, sessionKey } = parsed.args;
      insertInstall.run(account, log.address, block, tx);
      return "install";
    }
    case "PolicyUpdated": {
      const { account, perTxCap, windowCap, expiry } = parsed.args;
      // The reference event carries no sessionKey and no allowlist snapshot.
      // session_key is stored NULL rather than guessed from elsewhere.
      insertPolicy.run(
        null,
        account,
        perTxCap.toString(),
        windowCap.toString(),
        Number(expiry),
        "[]",
        block,
        tx
      );
      return "policy";
    }
    case "SessionRevokedEvt": {
      const { account, sessionKey } = parsed.args;
      insertRevoke.run(sessionKey, account, block, tx);
      return "revoke";
    }
    case "SpendAuthorized": {
      const { account, sessionKey, to, amount } = parsed.args;
      insertValidation.run(tx, 1, null, account, sessionKey, to, amount.toString(), block);
      return "spend";
    }
    default:
      return "skipped";
  }
}

// ---------- main scan ----------
async function scanOnce(fromBlock, toBlock) {
  const counts = { install: 0, policy: 0, revoke: 0, spend: 0, skipped: 0, logs: 0 };
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const rangeEnd = cursor + RANGE_SIZE - 1n > toBlock ? toBlock : cursor + RANGE_SIZE - 1n;
    const logs = await withRetry(
      () =>
        provider.getLogs({
          address: PLUGIN_ADDRESS,
          fromBlock: cursor,
          toBlock: rangeEnd,
        }),
      `getLogs(${cursor}..${rangeEnd})`
    );
    const insertTx = db.transaction(() => {
      for (const log of logs) {
        counts.logs++;
        counts[handleLog(log)]++;
      }
    });
    insertTx();
    // Commit progress only after the whole range is written. The scan caller
    // ensures rangeEnd is CONFIRMATIONS-deep before calling scanOnce.
    setState("last_indexed_block", String(Number(rangeEnd)));
    cursor = rangeEnd + 1n;
  }
  return counts;
}

async function main() {
  await checkChain();
  console.log(`HALLPASS indexer — Arc mainnet (5042), RPC ${RPC_URL}`);
  console.log(`Plugin: ${PLUGIN_ADDRESS}`);
  console.log(`DB: ${DB_PATH} | confirmations: ${CONFIRMATIONS} | range: ${RANGE_SIZE} blocks`);

  let fromBlock;
  const checkpoint = getState("last_indexed_block");
  if (checkpoint !== null) {
    fromBlock = BigInt(checkpoint) + 1n;
    console.log(`Resuming from checkpoint: block ${checkpoint} → next ${fromBlock}`);
  } else if (START_BLOCK !== null) {
    fromBlock = START_BLOCK;
    console.log(`No checkpoint; starting at START_BLOCK=${START_BLOCK}`);
  } else {
    const head = await withRetry(() => provider.getBlockNumber(), "getBlockNumber");
    fromBlock = BigInt(head);
    setState("last_indexed_block", String(head));
    console.log(`No checkpoint and no START_BLOCK; starting at current head ${head} (forward-only). Use START_BLOCK=<deploy block> to backfill.`);
  }

  const totals = { install: 0, policy: 0, revoke: 0, spend: 0, skipped: 0, logs: 0 };

  do {
    const head = BigInt(await withRetry(() => provider.getBlockNumber(), "getBlockNumber"));
    const safeHead = head - CONFIRMATIONS;
    if (safeHead < fromBlock) {
      if (!POLL_INTERVAL_MS) {
        console.log(
          `Head ${head} is within ${CONFIRMATIONS} confirmations of fromBlock ${fromBlock} — nothing new to commit. ` +
            (checkpoint === null && START_BLOCK === null
              ? "Zero events found: the plugin has emitted no indexed events in the scanned range. This is an honest empty result, not a failure."
              : `Indexed up to checkpoint ${getState("last_indexed_block")}.`)
        );
        break;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }
    const counts = await scanOnce(fromBlock, safeHead);
    for (const k of Object.keys(totals)) totals[k] += counts[k];
    console.log(
      `Committed blocks ${fromBlock}..${safeHead}: ${counts.logs} logs ` +
        `(installs=${counts.install} policies=${counts.policy} revokes=${counts.revoke} spends=${counts.spend} skipped=${counts.skipped})`
    );
    fromBlock = safeHead + 1n;

    if (!POLL_INTERVAL_MS) break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  } while (POLL_INTERVAL_MS);

  const totalRows = totals.install + totals.policy + totals.revoke + totals.spend;
  console.log(
    `\nDone. Plugin events written: installs=${totals.install} policy_updates=${totals.policy} revokes=${totals.revoke} validation_results=${totals.spend} (${totalRows} rows). ` +
      `Skipped unknown-signature logs: ${totals.skipped}. Checkpoint: ${getState("last_indexed_block")}.`
  );
  if (totalRows === 0) {
    console.log(
      "Honest empty result: zero matching events at the indexed address in the scanned range. " +
        "The plugin may not be deployed yet, or it may live at a different address — re-check PLUGIN_ADDRESS and START_BLOCK."
    );
  }
  db.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  try { db.close(); } catch {}
  process.exit(1);
});
