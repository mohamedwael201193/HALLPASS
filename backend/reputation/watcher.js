// HALLPASS reputation feedback loop
// ----------------------------------
// Closes the loop the production plugin leaves open: the plugin emits
// SessionRevokedEvt on every session close, and this watcher posts ONE dust
// feedback transaction per close to the ERC-8004 Reputation registry on Arc
// mainnet (chain 5042), signed by the backend key.
//
// The production plugin contract is NEVER touched — this is a pure
// off-chain loop: watch logs -> post feedback.
//
// Registry interface (proven against the deployed registry at
// 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 via eth_call before this code
// was written):
//   giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals,
//                string tag1, string tag2, string endpoint,
//                string feedbackURI, bytes32 feedbackHash)
//   selector 0x3c036a7e. Read path verified live: getLastIndex, getClients,
//   readFeedback (1-based index), getSummary all respond on mainnet.
//
// Constraints enforced BY THE REGISTRY (not by us):
//   - agentId must be registered in the ERC-8004 Identity registry
//     (0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)
//   - the feedback poster may not own (or be approved operator of) the agent
//   - valueDecimals must be 0-18
//
// Modes:
//   node watcher.js                 single pass: post feedback for every
//                                   confirmed-but-unposted SessionRevokedEvt,
//                                   then exit 0
//   POLL_INTERVAL_MS=60000 node watcher.js
//                                   daemon: poll for new closes
//   node watcher.js --post-proof     post exactly ONE feedback (proof params
//                                   from env, defaults to the dust proof) and
//                                   exit — used to prove the loop on mainnet
//                                   through this same code path
//
// Required env:
//   REPUTATION_KEY  — backend private key (hex). Falls back to
//                     DEPLOYER_PRIVATE_KEY for the build env. NEVER logged,
//                     never written to disk by this process. Needs a small
//                     native-USDC balance for dust gas (~0.005 USDC per post).
//   REPUTATION_AGENT_ID — ERC-8004 agent ID (Identity registry token ID) that
//                     closed sessions are attributed to. Required for the
//                     watch loop (fails loudly if unset); --post-proof may
//                     override via PROOF_AGENT_ID.
// Optional env (defaults = the proven dust-proof parameters):
//   FEEDBACK_VALUE=50  FEEDBACK_DECIMALS=0  FEEDBACK_TAG1=score
//   FEEDBACK_TAG2=hallpass-session-close  FEEDBACK_ENDPOINT=hallpass/session-close
//   FEEDBACK_URI=""  (empty = no off-chain evidence)
//   PLUGIN_ADDRESS (default: production plugin v0.2.0)
//   REPUTATION_REGISTRY (default: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63)
//   START_BLOCK (default: current head, forward-only; backfill with the
//              plugin deploy block)
//   REPUTATION_DB (default: <dir>/reputation.sqlite)
//   RPC_URL (default: https://rpc.mainnet.arc.io)

const { ethers } = require("ethers");
const Database = require("better-sqlite3");
const path = require("path");

// ---------- configuration ----------
const RPC_URL = process.env.RPC_URL || "https://rpc.mainnet.arc.io";
const EXPECTED_CHAIN_ID = 5042n;

const PLUGIN_ADDRESS = ethers.getAddress(
  (process.env.PLUGIN_ADDRESS || "0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9").trim()
);
const REPUTATION_REGISTRY = ethers.getAddress(
  (process.env.REPUTATION_REGISTRY || "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63").trim()
);

const PRIVATE_KEY = (process.env.REPUTATION_KEY || process.env.DEPLOYER_PRIVATE_KEY || "").trim();
if (!PRIVATE_KEY) {
  console.error(
    "FATAL: no signing key. Set REPUTATION_KEY (preferred) or DEPLOYER_PRIVATE_KEY. " +
      "The key is used only to sign dust feedback txs and is never logged."
  );
  process.exit(2);
}

const CONFIRMATIONS = 12n; // reorg-safe depth, matches the event indexer
const RANGE_SIZE = process.env.RANGE_SIZE ? BigInt(process.env.RANGE_SIZE) : 5000n;
const POLL_INTERVAL_MS = process.env.POLL_INTERVAL_MS ? Number(process.env.POLL_INTERVAL_MS) : 0;
const DB_PATH = process.env.REPUTATION_DB || path.join(__dirname, "reputation.sqlite");
const START_BLOCK = process.env.START_BLOCK ? BigInt(process.env.START_BLOCK) : null;
const MAX_RPC_RETRIES = 6;

// Feedback content. REPUTATION_AGENT_ID is required for the watch loop —
// feedback must name a real registered agent, and guessing one would poison
// the registry. --post-proof may override with PROOF_AGENT_ID.
function feedbackParams() {
  const agentIdRaw = (process.env.PROOF_AGENT_ID || process.env.REPUTATION_AGENT_ID || "").trim();
  if (!agentIdRaw) {
    console.error(
      "FATAL: REPUTATION_AGENT_ID is not set. Feedback must reference a real agent " +
        "registered in the ERC-8004 Identity registry (0x8004A169FB4a3325136EB29fA0ceB6D2e539a432). " +
        "Register the HALLPASS agent there (register() returns the agentId), then set it here. " +
        "This watcher refuses to post feedback against a guessed ID."
    );
    process.exit(2);
  }
  return {
    agentId: BigInt(agentIdRaw),
    value: BigInt(process.env.FEEDBACK_VALUE || "50"),       // int128, signed
    valueDecimals: Number(process.env.FEEDBACK_DECIMALS || "0"),
    tag1: process.env.FEEDBACK_TAG1 || "score",
    tag2: process.env.FEEDBACK_TAG2 || "hallpass-session-close",
    endpoint: process.env.FEEDBACK_ENDPOINT || "hallpass/session-close",
    feedbackURI: process.env.FEEDBACK_URI || "",
    feedbackHash: ethers.ZeroHash,
  };
}

// ---------- ABIs (proven on mainnet 2026-10-15) ----------
const PLUGIN_ABI = [
  "event SessionRevokedEvt(address indexed account, address indexed sessionKey)",
];
const REGISTRY_ABI = [
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
];
const pluginIface = new ethers.Interface(PLUGIN_ABI);
const registryIface = new ethers.Interface(REGISTRY_ABI);
const GIVE_FEEDBACK_SELECTOR = registryIface.getFunction("giveFeedback").selector; // 0x3c036a7e

// ---------- sqlite (dedupe: exactly one feedback tx per close) ----------
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS posted_feedback (
    revoke_tx_hash   TEXT PRIMARY KEY,  -- plugin tx that closed the session
    account          TEXT NOT NULL,
    session_key      TEXT,
    revoke_block     INTEGER NOT NULL,
    agent_id         TEXT NOT NULL,
    feedback_tx_hash TEXT NOT NULL,
    feedback_block   INTEGER,
    posted_at        INTEGER NOT NULL
  );
`);
const getState = (k) => {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(k);
  return row ? row.value : null;
};
const setState = (k, v) =>
  db.prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(k, v);
const alreadyPostedStmt = db.prepare("SELECT 1 FROM posted_feedback WHERE revoke_tx_hash = ?");
const alreadyPosted = (txHash) => !!alreadyPostedStmt.get(txHash);
const recordPosted = db.prepare(
  "INSERT OR IGNORE INTO posted_feedback(revoke_tx_hash, account, session_key, revoke_block, agent_id, feedback_tx_hash, feedback_block, posted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);

// ---------- rpc ----------
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

async function withRetry(fn, label) {
  let delay = 1000;
  for (let attempt = 1; attempt <= MAX_RPC_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === MAX_RPC_RETRIES) throw err;
      console.error(`RPC ${label} failed (attempt ${attempt}/${MAX_RPC_RETRIES}): ${err.shortMessage || err.message}. Retrying in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

async function checkChain() {
  const net = await withRetry(() => provider.getNetwork(), "chain-id check");
  if (net.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Connected to chain ${net.chainId}, expected Arc mainnet (${EXPECTED_CHAIN_ID}). Refusing to post feedback on the wrong chain.`);
  }
}

// ---------- core: post one feedback tx ----------
async function postFeedback(params) {
  if (params.valueDecimals < 0 || params.valueDecimals > 18) {
    throw new Error(`valueDecimals=${params.valueDecimals} out of range 0-18 (registry constraint).`);
  }
  const data = registryIface.encodeFunctionData("giveFeedback", [
    params.agentId, params.value, params.valueDecimals,
    params.tag1, params.tag2, params.endpoint, params.feedbackURI, params.feedbackHash,
  ]);
  if (data.slice(0, 10).toLowerCase() !== GIVE_FEEDBACK_SELECTOR.toLowerCase()) {
    throw new Error(`selector drift: encoded ${data.slice(0, 10)} != proven ${GIVE_FEEDBACK_SELECTOR}. Refusing to send.`);
  }
  // Local simulation first: a revert here means the registry rejected the
  // params (unknown agent, self-feedback, bad decimals) — fail loudly
  // instead of burning dust on a doomed tx.
  await withRetry(
    () => provider.call({ from: wallet.address, to: REPUTATION_REGISTRY, data }),
    "giveFeedback simulation"
  );
  const gasLimit = (await withRetry(
    () => provider.estimateGas({ from: wallet.address, to: REPUTATION_REGISTRY, data }),
    "estimateGas"
  )) * 130n / 100n; // 30% headroom
  const fee = await withRetry(() => provider.getFeeData(), "fee data");
  const tx = await wallet.sendTransaction({
    to: REPUTATION_REGISTRY,
    data,
    gasLimit,
    maxFeePerGas: fee.maxFeePerGas,
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
  });
  console.log(`feedback tx sent: ${tx.hash} (agentId=${params.agentId} value=${params.value} decimals=${params.valueDecimals} tag1="${params.tag1}" tag2="${params.tag2}")`);
  const receipt = await withRetry(() => tx.wait(1), `wait(${tx.hash})`);
  if (receipt.status !== 1) throw new Error(`feedback tx ${tx.hash} reverted on-chain (status 0).`);
  console.log(`feedback tx confirmed: ${tx.hash} in block ${receipt.blockNumber}, gas used ${receipt.gasUsed}`);
  return { hash: tx.hash, blockNumber: Number(receipt.blockNumber), gasUsed: receipt.gasUsed.toString() };
}

// ---------- scan for unposted closes ----------
async function processNewCloses(params) {
  let posted = 0, skipped = 0;
  let checkpoint = getState("last_block");
  let fromBlock;
  if (checkpoint !== null) {
    fromBlock = BigInt(checkpoint) + 1n;
  } else if (START_BLOCK !== null) {
    fromBlock = START_BLOCK;
  } else {
    const head = await withRetry(() => provider.getBlockNumber(), "getBlockNumber");
    fromBlock = BigInt(head);
    setState("last_block", String(head));
    console.log(`No checkpoint; starting forward-only at head ${head}. Set START_BLOCK to backfill.`);
    return { posted, skipped };
  }
  const head = BigInt(await withRetry(() => provider.getBlockNumber(), "getBlockNumber"));
  const safeHead = head - CONFIRMATIONS;
  if (safeHead < fromBlock) {
    console.log(`Head ${head} within ${CONFIRMATIONS} confirmations of ${fromBlock} — nothing new to commit.`);
    return { posted, skipped };
  }
  const topic0 = pluginIface.getEvent("SessionRevokedEvt").topicHash;
  let cursor = fromBlock;
  while (cursor <= safeHead) {
    const rangeEnd = cursor + RANGE_SIZE - 1n > safeHead ? safeHead : cursor + RANGE_SIZE - 1n;
    const logs = await withRetry(
      () => provider.getLogs({ address: PLUGIN_ADDRESS, topics: [topic0], fromBlock: cursor, toBlock: rangeEnd }),
      `getLogs(${cursor}..${rangeEnd})`
    );
    for (const log of logs) {
      const parsed = pluginIface.parseLog(log);
      const revokeTx = log.transactionHash;
      if (alreadyPosted(revokeTx)) { skipped++; continue; }
      const { account, sessionKey } = parsed.args;
      console.log(`session close: account=${account} sessionKey=${sessionKey} tx=${revokeTx} block=${log.blockNumber} — posting feedback…`);
      const fb = await postFeedback(params);
      recordPosted.run(revokeTx, account, sessionKey, Number(log.blockNumber), params.agentId.toString(), fb.hash, fb.blockNumber, Math.floor(Date.now() / 1000));
      posted++;
    }
    setState("last_block", String(Number(rangeEnd)));
    cursor = rangeEnd + 1n;
  }
  return { posted, skipped };
}

async function main() {
  const proofMode = process.argv.includes("--post-proof");
  await checkChain();
  const params = feedbackParams();
  console.log(`HALLPASS reputation loop — Arc mainnet (5042)`);
  console.log(`plugin:   ${PLUGIN_ADDRESS}`);
  console.log(`registry: ${REPUTATION_REGISTRY} (giveFeedback ${GIVE_FEEDBACK_SELECTOR})`);
  console.log(`signer:   ${wallet.address}`);
  console.log(`feedback: agentId=${params.agentId} value=${params.value} decimals=${params.valueDecimals} tag1="${params.tag1}" tag2="${params.tag2}" endpoint="${params.endpoint}"`);

  if (proofMode) {
    // Exactly one feedback post through the production code path — the
    // mainnet proof of the loop. Recorded by the caller (REPUTATION-PROOF.md).
    const fb = await postFeedback(params);
    console.log(`PROOF-ONLY MODE: posted 1 feedback tx ${fb.hash} (block ${fb.blockNumber}). No watcher state changed.`);
    db.close();
    process.exit(0);
  }

  do {
    const { posted, skipped } = await processNewCloses(params);
    console.log(`pass done: posted=${posted} already-posted-skipped=${skipped} checkpoint=${getState("last_block")}`);
    if (!POLL_INTERVAL_MS) break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  } while (POLL_INTERVAL_MS);

  db.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err.shortMessage || err.message || err);
  try { db.close(); } catch {}
  process.exit(1);
});
