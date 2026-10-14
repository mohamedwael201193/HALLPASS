// HALLPASS event indexer
// ------------------------
// Read-only indexer for the HallpassPlugin ERC-6900 v0.7 policy plugin on
// Arc mainnet (chain 5042). Scans plugin-emitted logs from a configurable
// start block and writes them to SQLite. No private keys, no signing —
// read-only RPC access only.
//
// Schema contract (shared with the stats API — see backend/api/STATS.md):
//   meta(key, value)                    — sync watermark, e.g. ('last_block','123')
//   installs(account, plugin, tx_hash PK, block_number, block_ts, manifest_hash, uninstalled)
//                                       — event-sourced: one row per install
//   policies(account PK, session_key, per_tx_cap, window_cap, window_secs,
//            window_start, window_spent, expiry, revoked, policy_hash, updated_at)
//                                       — derived current-state, upserted from
//                                         SessionRegistered/PolicyUpdated/SpendAuthorized
//   spends(id, account, session_key, recipient, amount, tx_hash, block_number, block_ts)
//                                       — one row per SpendAuthorized
//   denials(id, account, session_key, recipient, amount, reason, source, tx_hash,
//           block_number, block_ts)     — RELAY-FED ONLY. Reverts emit no logs;
//                                         this indexer never writes denial rows.
//   revokes(account, session_key, tx_hash PK, block_number, block_ts)
//
// Every row is traceable to a real RPC log. Fields the events do not carry
// (manifest_hash, window_secs, window_start, policy_hash) are stored NULL
// rather than guessed — see README. uninstalled is derived from a real
// getInstalledPlugins() call, not assumed.
//
// Reorg safety: logs are only committed once their block is >= 12 blocks
// behind chain head. The highest committed block is checkpointed in meta.
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
const PLUGIN_ADDRESS_CHECKSUMMED = ethers.getAddress(PLUGIN_ADDRESS);

const START_BLOCK = process.env.START_BLOCK
  ? BigInt(process.env.START_BLOCK)
  : null; // null → start at current head (forward-only) on first run
const CONFIRMATIONS = 12n; // reorg-safe depth
const RANGE_SIZE = process.env.RANGE_SIZE ? BigInt(process.env.RANGE_SIZE) : 5000n;
const POLL_INTERVAL_MS = process.env.POLL_INTERVAL_MS
  ? Number(process.env.POLL_INTERVAL_MS)
  : 0; // 0 → single pass then exit
const DB_PATH =
  process.env.INDEXER_DB ||
  process.env.DB_PATH ||
  path.join(__dirname, "db.sqlite");
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

// Selectors for best-effort auxiliary reads.
const INSTALL_PLUGIN_SEL = ethers.id("installPlugin(address,bytes32,bytes,(address,uint8)[])").slice(0, 10);
const GET_INSTALLED_PLUGINS_SEL = ethers.id("getInstalledPlugins()").slice(0, 10);
const accountABI = ["function getInstalledPlugins() view returns (address[])"];
const accountIface = new ethers.Interface(accountABI);

// ---------- sqlite ----------
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS installs (
    account      TEXT NOT NULL,
    plugin       TEXT NOT NULL,
    tx_hash      TEXT PRIMARY KEY,
    block_number INTEGER NOT NULL,
    block_ts     INTEGER,
    manifest_hash TEXT,            -- NULL when not recoverable from the install tx
    uninstalled  INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS policies (
    account      TEXT PRIMARY KEY,
    session_key  TEXT,
    per_tx_cap   TEXT,
    window_cap   TEXT,
    window_secs  INTEGER,          -- NULL: not carried by the emitted events
    window_start INTEGER,          -- NULL: not carried by the emitted events
    window_spent TEXT,             -- latest SpendAuthorized windowSpent per account
    expiry       INTEGER,
    revoked      INTEGER NOT NULL DEFAULT 0,
    policy_hash  TEXT,             -- NULL: not carried by the emitted events
    updated_at   INTEGER
  );
  CREATE TABLE IF NOT EXISTS spends (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    account      TEXT,
    session_key  TEXT,
    recipient    TEXT,
    amount       TEXT,             -- native wei, decimal string
    tx_hash      TEXT,
    block_number INTEGER,
    block_ts     INTEGER,
    UNIQUE (tx_hash, block_number, account, recipient, amount)
  );
  CREATE TABLE IF NOT EXISTS denials (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    account      TEXT,
    session_key  TEXT,
    recipient    TEXT,
    amount       TEXT,
    reason       TEXT,             -- decoded custom error, e.g. PerTxCapExceeded
    source       TEXT,             -- 'observed-revert' | 'userop-failure'
    tx_hash      TEXT,
    block_number INTEGER,
    block_ts     INTEGER
  );
  CREATE TABLE IF NOT EXISTS revokes (
    account      TEXT NOT NULL,
    session_key  TEXT,
    tx_hash      TEXT PRIMARY KEY,
    block_number INTEGER NOT NULL,
    block_ts     INTEGER
  );
`);
const getState = (k) => {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(k);
  return row ? row.value : null;
};
const setState = (k, v) =>
  db.prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(k, v);

const insertInstall = db.prepare(
  "INSERT OR IGNORE INTO installs(account, plugin, tx_hash, block_number, block_ts, manifest_hash) VALUES (?, ?, ?, ?, ?, ?)"
);
const upsertPolicy = db.prepare(
  `INSERT INTO policies(account, session_key, per_tx_cap, window_cap, expiry, revoked, updated_at)
   VALUES (?, ?, ?, ?, ?, 0, ?)
   ON CONFLICT(account) DO UPDATE SET
     session_key = excluded.session_key,
     per_tx_cap = excluded.per_tx_cap,
     window_cap = excluded.window_cap,
     expiry = excluded.expiry,
     revoked = excluded.revoked,
     updated_at = excluded.updated_at`
);
const markRevoked = db.prepare("UPDATE policies SET revoked = 1, updated_at = ? WHERE account = ?");
const setWindowSpent = db.prepare("UPDATE policies SET window_spent = ?, updated_at = ? WHERE account = ?");
const insertSpend = db.prepare(
  "INSERT OR IGNORE INTO spends(account, session_key, recipient, amount, tx_hash, block_number, block_ts) VALUES (?, ?, ?, ?, ?, ?, ?)"
);
const insertRevoke = db.prepare(
  "INSERT OR IGNORE INTO revokes(account, session_key, tx_hash, block_number, block_ts) VALUES (?, ?, ?, ?, ?)"
);
const markUninstalled = db.prepare("UPDATE installs SET uninstalled = 1 WHERE account = ? AND uninstalled = 0");
const allInstalledAccounts = db.prepare("SELECT DISTINCT account FROM installs WHERE uninstalled = 0");

// ---------- rpc helpers ----------
const provider = new ethers.JsonRpcProvider(RPC_URL);
const blockTsCache = new Map();

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

async function blockTimestamp(blockNumber) {
  if (blockTsCache.has(blockNumber)) return blockTsCache.get(blockNumber);
  const block = await withRetry(() => provider.getBlock(blockNumber), `getBlock(${blockNumber})`);
  const ts = Number(block.timestamp);
  blockTsCache.set(blockNumber, ts);
  return ts;
}

// Best-effort: recover the manifest hash from the install tx when it went
// through installPlugin(address,bytes32,bytes,(address,uint8)[]).
// Returns null when not decodable — NULL beats a guess.
async function manifestHashFromTx(txHash) {
  try {
    const tx = await withRetry(() => provider.getTransaction(txHash), `getTransaction(${txHash})`);
    if (!tx || !tx.data || !tx.data.startsWith(INSTALL_PLUGIN_SEL)) return null;
    const decoded = iface.decodeFunctionData(
      "installPlugin(address,bytes32,bytes,(address,uint8)[])",
      tx.data
    );
    return decoded[1]; // manifestHash
  } catch {
    return null;
  }
}

// Verify installed-state from chain: for each account with uninstalled = 0,
// call getInstalledPlugins() and mark uninstalled = 1 where the plugin is
// no longer listed. Read-only; keeps the stats API's pluginsInstalled honest.
async function verifyInstalls() {
  const rows = allInstalledAccounts.all();
  let marked = 0;
  for (const { account } of rows) {
    try {
      const data = await withRetry(
        () => provider.call({ to: account, data: GET_INSTALLED_PLUGINS_SEL }),
        `getInstalledPlugins(${account})`
      );
      const [plugins] = accountIface.decodeFunctionResult("getInstalledPlugins", data);
      const stillThere = plugins.some(
        (p) => p.toLowerCase() === PLUGIN_ADDRESS_CHECKSUMMED.toLowerCase()
      );
      if (!stillThere) {
        markUninstalled.run(account);
        marked++;
      }
    } catch (err) {
      console.warn(`WARN: getInstalledPlugins(${account}) failed: ${err.shortMessage || err.message} — leaving uninstalled=0 (honest unknown).`);
    }
  }
  return marked;
}

// ---------- decode & write ----------
async function handleLog(log) {
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
  const ts = await blockTimestamp(block);

  switch (parsed.name) {
    case "SessionRegistered": {
      const { account, sessionKey, perTxCap, windowCap, expiry } = parsed.args;
      const manifestHash = await manifestHashFromTx(tx);
      insertInstall.run(account, log.address, tx, block, ts, manifestHash);
      upsertPolicy.run(
        account, sessionKey, perTxCap.toString(), windowCap.toString(),
        Number(expiry), ts
      );
      return "install";
    }
    case "PolicyUpdated": {
      const { account, perTxCap, windowCap, expiry } = parsed.args;
      // The reference event carries no sessionKey: keep the previously
      // recorded one rather than NULL-ing it.
      const prev = db.prepare("SELECT session_key, revoked FROM policies WHERE account = ?").get(account);
      const sessionKey = prev ? prev.session_key : null;
      // The reference updatePolicy clears revocation on-chain; mirror that.
      db.prepare(
        `INSERT INTO policies(account, session_key, per_tx_cap, window_cap, expiry, revoked, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(account) DO UPDATE SET
           per_tx_cap = excluded.per_tx_cap, window_cap = excluded.window_cap,
           expiry = excluded.expiry, revoked = 0, updated_at = excluded.updated_at`
      ).run(account, sessionKey, perTxCap.toString(), windowCap.toString(), Number(expiry), ts);
      return "policy";
    }
    case "SessionRevokedEvt": {
      const { account, sessionKey } = parsed.args;
      insertRevoke.run(account, sessionKey, tx, block, ts);
      markRevoked.run(ts, account);
      return "revoke";
    }
    case "SpendAuthorized": {
      const { account, sessionKey, to, amount, windowSpent } = parsed.args;
      insertSpend.run(account, sessionKey, to, amount.toString(), tx, block, ts);
      setWindowSpent.run(windowSpent.toString(), ts, account);
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
    // Handle sequentially: handleLog does async RPC reads (block ts, tx input).
    for (const log of logs) {
      const kind = await handleLog(log);
      counts.logs++;
      counts[kind]++;
    }
    // Commit progress only after the whole range is written; the caller
    // ensures rangeEnd is CONFIRMATIONS-deep before calling scanOnce.
    setState("last_block", String(Number(rangeEnd)));
    cursor = rangeEnd + 1n;
  }
  return counts;
}

async function main() {
  await checkChain();
  console.log(`HALLPASS indexer — Arc mainnet (5042), RPC ${RPC_URL}`);
  console.log(`Plugin: ${PLUGIN_ADDRESS_CHECKSUMMED}`);
  console.log(`DB: ${DB_PATH} | confirmations: ${CONFIRMATIONS} | range: ${RANGE_SIZE} blocks`);

  let fromBlock;
  const checkpoint = getState("last_block");
  if (checkpoint !== null) {
    fromBlock = BigInt(checkpoint) + 1n;
    console.log(`Resuming from checkpoint: block ${checkpoint} → next ${fromBlock}`);
  } else if (START_BLOCK !== null) {
    fromBlock = START_BLOCK;
    console.log(`No checkpoint; starting at START_BLOCK=${START_BLOCK}`);
  } else {
    const head = await withRetry(() => provider.getBlockNumber(), "getBlockNumber");
    fromBlock = BigInt(head);
    setState("last_block", String(head));
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
              : `Indexed up to checkpoint ${getState("last_block")}.`)
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
        `(installs=${counts.install} policy_updates=${counts.policy} revokes=${counts.revoke} spends=${counts.spend} skipped=${counts.skipped})`
    );
    fromBlock = safeHead + 1n;

    if (!POLL_INTERVAL_MS) break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  } while (POLL_INTERVAL_MS);

  const marked = await verifyInstalls();
  if (marked > 0) console.log(`Marked ${marked} install(s) as uninstalled (plugin no longer in getInstalledPlugins()).`);

  const totalRows = totals.install + totals.policy + totals.revoke + totals.spend;
  console.log(
    `\nDone. Plugin events written: installs=${totals.install} policy_updates=${totals.policy} revokes=${totals.revoke} spends=${totals.spend} (${totalRows} event rows). ` +
      `Skipped unknown-signature logs: ${totals.skipped}. Checkpoint: ${getState("last_block")}.`
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
