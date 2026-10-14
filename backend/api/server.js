// HALLPASS REST API
// ------------------
// Read layer for the HallpassPlugin ERC-6900 v0.7 policy plugin on Arc
// mainnet (chain 5042).
//
// Architecture rule (build bible §3): the indexer is a CACHE; the chain is
// the source of truth. Every response carries `source: "indexer" | "chain"`
// and `asOfBlock` so callers can see exactly how fresh the data is. Where a
// fresh read matters (plugin install state), `?fresh=true` re-reads the
// chain directly via eth_call instead of the cache.
//
// No secrets anywhere here: this server never reads keys, never signs, and
// never exposes private configuration. The RPC URL and public contract
// addresses are public config and also served by GET /api/config.
//
// No mock data: if the indexer DB is empty or the account has no rows, the
// API returns empty arrays — never fabricated entries.
//
// Usage:
//   PORT=8787 DB_PATH=/path/to/db.sqlite node server.js
//   curl localhost:8787/health
//   curl 'localhost:8787/api/accounts/0xABC.../plugins?fresh=true'
//   curl 'localhost:8787/api/accounts/0xABC.../policies'
//   curl 'localhost:8787/api/activity?account=0xABC...&page=1&limit=25'
//   curl localhost:8787/api/config

const express = require("express");
const cors = require("cors");
const path = require("path");
const { ethers } = require("ethers");
const Database = require("better-sqlite3");

// ---------- public configuration ----------
// All public on-chain facts (RPC-verified on Arc mainnet, 2026-10-14).
const CHAIN_ID = 5042;
const RPC_URL = process.env.RPC_URL || "https://rpc.mainnet.arc.io";
const EXPLORER_BASE = "https://explorer.arc.io";
const ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const MSCA_IMPL = "0xA70F1296869DA9D7CB69578123F21888E6dB2B62";
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const ARC_USDC_DECIMALS = 6;
// Last H9-proven minimal plugin deployment (mainnet, Sourcify exact_match).
// Overridden by PLUGIN_ADDRESS for production deployments.
const PLUGIN_ADDRESS =
  (process.env.PLUGIN_ADDRESS || "").trim() ||
  "0x5780e3DEd211ee13494909432C89Be7b8D6441A3";

// ---------- db ----------
// Same SQLite store the indexer writes (better-sqlite3, read-only here).
const DB_PATH =
  process.env.DB_PATH || path.resolve(__dirname, "../indexer/db.sqlite");

let db = null;
function openDb() {
  if (db) return db;
  db = new Database(DB_PATH, { readonly: true, fileMustExist: false });
  db.pragma("journal_mode = WAL");
  return db;
}
function dbTablesExist() {
  try {
    const row = openDb()
      .prepare(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('plugin_installs','policy_updates','revokes','validation_results','indexer_state')"
      )
      .get();
    return row.n === 5;
  } catch (e) {
    return false;
  }
}
function indexerCheckpoint() {
  try {
    const row = openDb()
      .prepare("SELECT value FROM indexer_state WHERE key='last_indexed_block'")
      .get();
    return row ? Number(row.value) : null;
  } catch (e) {
    return null;
  }
}

// ---------- chain ----------
// Lazy single provider for fresh reads (?fresh=true). Plain public RPC;
// never signs, never holds keys.
let provider = null;
function getProvider() {
  if (!provider) provider = new ethers.JsonRpcProvider(RPC_URL);
  return provider;
}
// ERC-6900 IPluginManager: getInstalledPlugins() -> (address[], bytes32[])
const PLUGIN_MANAGER_ABI = [
  "function getInstalledPlugins() view returns (address[] plugins, bytes32[] manifestHashes)",
];
const pluginManagerIface = new ethers.Interface(PLUGIN_MANAGER_ABI);

// ---------- helpers ----------
function isAddr(v) {
  return typeof v === "string" && ethers.isAddress(v.trim());
}
const normAddr = (v) => ethers.getAddress(v.trim());

function envelope({ source, asOfBlock, data }) {
  return { source, asOfBlock, data };
}
function apiError(res, status, code, message, extra) {
  return res.status(status).json({
    error: { code, message, ...(extra || {}) },
  });
}

// Human-readable activity description. Amounts are formatted as Arc USDC
// (6 decimals) — the asset the policy layer prices in — while the raw wei
// string is always included so nothing is misrepresented.
function fmtAmount(raw) {
  try {
    return ethers.formatUnits(BigInt(raw), ARC_USDC_DECIMALS);
  } catch {
    return raw;
  }
}
function shortAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}
function policyStatus(p, latestRevoke) {
  if (latestRevoke && latestRevoke.block >= p.block) return "REVOKED";
  const now = Math.floor(Date.now() / 1000);
  if (p.expiry && now > p.expiry) return "EXPIRED";
  return "ACTIVE";
}
const KNOWN_REASONS = {
  PerTxCapExceeded:
    "Blocked: amount exceeds the per-payment cap. Nothing was spent.",
  WindowCapExceeded:
    "Blocked: amount exceeds the remaining rolling-window budget. Nothing was spent.",
  NotAllowlisted:
    "Blocked: recipient is not on the allowlist. Nothing was spent.",
  SessionExpired: "Blocked: the session key has expired. Nothing was spent.",
  SessionRevoked: "Blocked: the session key was revoked. Nothing was spent.",
};
function humanReason(row) {
  if (row.reason) {
    const known = KNOWN_REASONS[row.reason];
    return known || `Blocked: ${row.reason}. Nothing was spent.`;
  }
  return "Blocked by policy (reason not recorded by the indexer). Nothing was spent.";
}
function describeActivity(row) {
  const amount = row.amount ? fmtAmount(row.amount) : "0";
  if (row.allowed) {
    return {
      headline: `${amount} USDC → ${shortAddr(row.to_addr)} — within policy`,
      detail: row.session_key
        ? `Session ${shortAddr(row.session_key)} spent ${amount} USDC.`
        : `${amount} USDC spent within policy.`,
    };
  }
  return {
    headline: `BLOCKED: ${amount} USDC → ${shortAddr(row.to_addr)}`,
    detail: humanReason(row),
  };
}

// ---------- app ----------
const app = express();
app.use(cors());
app.use(express.json());

// GET /health — liveness + chain + indexer visibility.
app.get("/health", async (req, res) => {
  let chainBlock = null;
  let chainOk = false;
  try {
    chainBlock = Number(await getProvider().getBlockNumber());
    chainOk = true;
  } catch (e) {
    chainOk = false;
  }
  const checkpoint = indexerCheckpoint();
  return res.json({
    status: chainOk ? "ok" : "degraded",
    source: "chain",
    asOfBlock: chainBlock,
    chainId: CHAIN_ID,
    rpcUrl: RPC_URL,
    indexer: {
      dbPath: DB_PATH,
      tablesReady: dbTablesExist(),
      lastIndexedBlock: checkpoint,
      behindByBlocks:
        checkpoint != null && chainBlock != null ? chainBlock - checkpoint : null,
      note:
        checkpoint == null
          ? "Indexer has not committed a checkpoint yet (empty DB or never ran)."
          : undefined,
    },
    ...(chainOk ? {} : { warning: "Could not reach the Arc RPC right now." }),
  });
});

// GET /api/accounts/:address/plugins — installed plugins for an account.
// Cache read by default; ?fresh=true re-reads via eth_call to the account's
// ERC-6900 PluginManager (getInstalledPlugins), the source of truth.
app.get("/api/accounts/:address/plugins", async (req, res) => {
  if (!isAddr(req.params.address)) {
    return apiError(
      res,
      400,
      "invalid_address",
      "That is not a valid Ethereum address. Paste the full 0x… address of the smart account."
    );
  }
  const account = normAddr(req.params.address);
  const fresh = String(req.query.fresh || "").toLowerCase() === "true";

  if (fresh) {
    try {
      const [block, raw] = await Promise.all([
        getProvider().getBlockNumber(),
        getProvider().call({
          to: account,
          data: pluginManagerIface.encodeFunctionData("getInstalledPlugins"),
        }),
      ]);
      const [plugins, manifestHashes] = pluginManagerIface.decodeFunctionResult(
        "getInstalledPlugins",
        raw
      );
      const list = plugins.map((p, i) => ({
        plugin: ethers.getAddress(p),
        manifestHash: manifestHashes[i],
        isHallpassPlugin:
          ethers.getAddress(p).toLowerCase() === PLUGIN_ADDRESS.toLowerCase(),
      }));
      return res.json(
        envelope({
          source: "chain",
          asOfBlock: Number(block),
          data: {
            account,
            plugins: list,
            installed:
              list.length > 0
                ? `The Hallpass plugin ${list.some((p) => p.isHallpassPlugin) ? "is" : "is NOT among the"} installed plugin(s).`
                : "No plugins are installed on this account on-chain.",
          },
        })
      );
    } catch (e) {
      return apiError(
        res,
        502,
        "chain_read_failed",
        "Could not read the account's installed plugins from the chain. The RPC may be down, or the address may not be a smart account.",
        { detail: e.shortMessage || e.message }
      );
    }
  }

  // Cached read from the indexer.
  try {
    const ready = dbTablesExist();
    const rows = ready
      ? openDb()
          .prepare(
            "SELECT plugin, block, tx FROM plugin_installs WHERE LOWER(account)=LOWER(?) ORDER BY block ASC, id ASC"
          )
          .all(account)
      : [];
    return res.json(
      envelope({
        source: "indexer",
        asOfBlock: indexerCheckpoint(),
        data: {
          account,
          plugins: rows.map((r) => ({
            plugin: r.plugin,
            isHallpassPlugin:
              r.plugin.toLowerCase() === PLUGIN_ADDRESS.toLowerCase(),
            indexedAtBlock: r.block,
            tx: r.tx,
          })),
          note:
            rows.length === 0
              ? "No plugin installs indexed for this account. Add ?fresh=true to read the chain directly."
              : "Cache of on-chain install events. Add ?fresh=true to re-read the chain.",
        },
      })
    );
  } catch (e) {
    return apiError(res, 500, "db_read_failed", "Could not read the indexer cache.", {
      detail: e.message,
    });
  }
});

// GET /api/accounts/:address/policies — current session policies for an
// account, derived from the indexer's policy_updates + revokes. One row per
// session key: the latest policy update, overlaid with any later revoke.
app.get("/api/accounts/:address/policies", async (req, res) => {
  if (!isAddr(req.params.address)) {
    return apiError(
      res,
      400,
      "invalid_address",
      "That is not a valid Ethereum address. Paste the full 0x… address of the smart account."
    );
  }
  const account = normAddr(req.params.address);
  try {
    const ready = dbTablesExist();
    if (!ready) {
      return res.json(
        envelope({
          source: "indexer",
          asOfBlock: null,
          data: { account, sessions: [], note: "Indexer cache is not initialized yet — no policies indexed." },
        })
      );
    }
    const d = openDb();
    const policyRows = d
      .prepare(
        `SELECT session_key, cap, window_cap, expiry, destinations, block, tx
           FROM policy_updates
          WHERE LOWER(account)=LOWER(?)
          ORDER BY block DESC, id DESC`
      )
      .all(account);
    const revokeRows = d
      .prepare(
        `SELECT session_key, block, tx FROM revokes WHERE LOWER(account)=LOWER(?) ORDER BY block DESC, id DESC`
      )
      .all(account);

    // Latest policy per session key.
    const latestBySession = new Map();
    for (const p of policyRows) {
      const key = (p.session_key || "unknown").toLowerCase();
      if (!latestBySession.has(key)) latestBySession.set(key, p);
    }
    // Latest revoke per session key.
    const revokeBySession = new Map();
    for (const r of revokeRows) {
      const key = (r.session_key || "unknown").toLowerCase();
      if (!revokeBySession.has(key)) revokeBySession.set(key, r);
    }

    const now = Math.floor(Date.now() / 1000);
    const sessions = [...latestBySession.entries()].map(([key, p]) => {
      const revoke = revokeBySession.get(key);
      const status = policyStatus(p, revoke);
      let destinations = [];
      try {
        destinations = JSON.parse(p.destinations || "[]");
      } catch {
        destinations = [];
      }
      return {
        sessionKey: p.session_key || null,
        status,
        perTxCap: { raw: p.cap, formatted: fmtAmount(p.cap), unit: "USDC" },
        windowCap: {
          raw: p.window_cap,
          formatted: fmtAmount(p.window_cap),
          unit: "USDC",
        },
        expiry: p.expiry,
        expiresInSeconds: p.expiry ? Math.max(0, p.expiry - now) : null,
        allowlist: destinations,
        allowlistOpen: destinations.length === 0,
        updatedAtBlock: p.block,
        updatedInTx: p.tx,
        ...(revoke && status === "REVOKED"
          ? { revokedAtBlock: revoke.block, revokedInTx: revoke.tx }
          : {}),
      };
    });

    return res.json(
      envelope({
        source: "indexer",
        asOfBlock: indexerCheckpoint(),
        data: {
          account,
          sessions,
          note:
            sessions.length === 0
              ? "No session policies indexed for this account yet."
              : "Latest policy per session key, with revocation overlaid. Amounts formatted as Arc USDC (6 decimals); raw wei included.",
        },
      })
    );
  } catch (e) {
    return apiError(res, 500, "db_read_failed", "Could not read the indexer cache.", {
      detail: e.message,
    });
  }
});

// GET /api/activity?account= — paginated, human-readable activity feed from
// the indexer's validation_results. Allowed rows are SpendAuthorized events;
// denied rows are relay-observed reverts (the indexer never fabricates them).
app.get("/api/activity", async (req, res) => {
  const accountQ = req.query.account;
  if (accountQ !== undefined && !isAddr(String(accountQ))) {
    return apiError(
      res,
      400,
      "invalid_address",
      "The ?account= filter is not a valid Ethereum address. Remove it or paste a full 0x… address."
    );
  }
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.limit || "25"), 10) || 25)
  );
  const offset = (page - 1) * limit;

  try {
    const ready = dbTablesExist();
    let total = 0;
    let rows = [];
    if (ready) {
      const d = openDb();
      if (accountQ) {
        total = d
          .prepare(
            "SELECT COUNT(*) AS n FROM validation_results WHERE LOWER(account)=LOWER(?)"
          )
          .get(String(accountQ)).n;
        rows = d
          .prepare(
            `SELECT tx, allowed, reason, account, session_key, to_addr, amount, block
               FROM validation_results
              WHERE LOWER(account)=LOWER(?)
              ORDER BY block DESC, id DESC LIMIT ? OFFSET ?`
          )
          .all(String(accountQ), limit, offset);
      } else {
        total = d.prepare("SELECT COUNT(*) AS n FROM validation_results").get().n;
        rows = d
          .prepare(
            `SELECT tx, allowed, reason, account, session_key, to_addr, amount, block
               FROM validation_results
              ORDER BY block DESC, id DESC LIMIT ? OFFSET ?`
          )
          .all(limit, offset);
      }
    }
    const items = rows.map((r) => {
      const desc = describeActivity(r);
      return {
        allowed: !!r.allowed,
        headline: desc.headline,
        detail: desc.detail,
        account: r.account,
        sessionKey: r.session_key,
        to: r.to_addr,
        amount: r.amount
          ? { raw: r.amount, formatted: fmtAmount(r.amount), unit: "USDC" }
          : null,
        tx: r.tx,
        txUrl: `${EXPLORER_BASE}/tx/${r.tx}`,
        block: r.block,
      };
    });
    return res.json(
      envelope({
        source: "indexer",
        asOfBlock: indexerCheckpoint(),
        data: {
          items,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
          note:
            total === 0
              ? "No activity indexed yet. The feed will fill as spends are authorized (or denials are observed) on-chain."
              : undefined,
        },
      })
    );
  } catch (e) {
    return apiError(res, 500, "db_read_failed", "Could not read the indexer cache.", {
      detail: e.message,
    });
  }
});

// GET /api/config — public chain + contract config. No secrets.
app.get("/api/config", (req, res) => {
  return res.json(
    envelope({
      source: "chain",
      asOfBlock: null,
      data: {
        chainId: CHAIN_ID,
        network: "Arc mainnet",
        rpcUrl: RPC_URL,
        explorerBase: EXPLORER_BASE,
        contracts: {
          entryPointV07: ENTRYPOINT_V07,
          mscaImplementation: MSCA_IMPL,
          hallpassPlugin: PLUGIN_ADDRESS,
          hallpassPluginConfiguredByEnv: !!process.env.PLUGIN_ADDRESS,
          arcUsdc: ARC_USDC,
          arcUsdcDecimals: ARC_USDC_DECIMALS,
        },
        notes: [
          "The chain is the source of truth; the indexer is a cache.",
          "hallpassPlugin defaults to the H9-proven deployment; PLUGIN_ADDRESS overrides it for production.",
          "No private keys or secrets are ever served from this API.",
        ],
      },
    })
  );
});

// 404 for everything else.
app.use((req, res) =>
  apiError(
    res,
    404,
    "not_found",
    `No such endpoint: ${req.method} ${req.path}. Try /health, /api/config, or /api/accounts/:address/plugins.`
  )
);

const PORT = Number(process.env.PORT || 8787);
app.listen(PORT, () => {
  console.log(`hallpass-api listening on :${PORT} (chain 5042, DB ${DB_PATH})`);
});
